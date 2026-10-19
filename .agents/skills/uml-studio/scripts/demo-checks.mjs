import assert from 'node:assert/strict'
import { parseFragment } from 'parse5'

const props = node => Object.fromEntries((node.attrs ?? []).map(attribute => [attribute.name, attribute.value]))
const hasClass = (node, name) => (props(node).class ?? '').split(/\s+/).includes(name)
const overlaps = (first, second) => first.x < second.x + second.width - .1 && second.x < first.x + first.width - .1
  && first.y < second.y + second.height - .1 && second.y < first.y + first.height - .1

function elements(root) {
  return (root.childNodes ?? []).flatMap(node => [node, ...elements(node)])
}

function shapeBox(node) {
  const attributes = props(node)
  if (node.tagName === 'rect') return { x: +attributes.x || 0, y: +attributes.y || 0, width: +attributes.width, height: +attributes.height }
  if (node.tagName === 'ellipse' || node.tagName === 'circle') {
    const radiusX = +(attributes.rx ?? attributes.r), radiusY = +(attributes.ry ?? attributes.r)
    return { x: +attributes.cx - radiusX, y: +attributes.cy - radiusY, width: radiusX * 2, height: radiusY * 2 }
  }
  if (node.tagName === 'path' && /^M[\d .-]+(?: L[\d .-]+)+ Z$/.test(attributes.d)) {
    const points = [...attributes.d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(([, horizontal, vertical]) => [+horizontal, +vertical])
    const left = Math.min(...points.map(point => point[0])), top = Math.min(...points.map(point => point[1]))
    return { x: left, y: top, width: Math.max(...points.map(point => point[0])) - left, height: Math.max(...points.map(point => point[1])) - top }
  }
}

function worldBox(node, box) {
  let current = node.parentNode
  while (current) {
    for (const [, operation, values] of [...(props(current).transform ?? '').matchAll(/(translate|scale)\(([^)]+)\)/g)].reverse()) {
      const [horizontal, vertical] = values.trim().split(/[ ,]+/).map(Number)
      if (operation === 'translate') box = { ...box, x: box.x + horizontal, y: box.y + (vertical ?? 0) }
      else box = { x: box.x * horizontal, y: box.y * (vertical ?? horizontal), width: box.width * horizontal, height: box.height * (vertical ?? horizontal) }
    }
    current = current.parentNode
  }
  return box
}

// Bridge arcs only deflect the display locally; their endpoints still follow the routed line.
function routePoints(data, spec, context) {
  const commands = [...data.matchAll(/([A-Za-z])([^A-Za-z]*)/g)]
  assert.equal(commands[0]?.[1], 'M', `${context}: missing route start`)
  const points = []
  for (const [index, [, command, raw]] of commands.entries()) {
    assert.ok(command === (index ? 'L' : 'M') || (index > 0 && command === 'A'), `${context}: disconnected relationship`)
    const values = raw.trim().split(/[ ,]+/).map(Number)
    assert.ok(values.every(Number.isFinite), `${context}: invalid route coordinates`)
    assert.equal(values.length, command === 'A' ? 7 : 2, `${context}: invalid route command`)
    const point = values.slice(-2)
    if (command === 'A') {
      assert.notEqual(spec.layout?.edgeCrossing, 'plain', `${context}: bridge in plain crossing mode`)
      const [rx, ry, rotation, large, sweep] = values, previous = points.at(-1)
      assert.ok(rx > 0 && ry > 0 && large === 0 && [0, 1].includes(sweep), `${context}: invalid bridge arc`)
      const angle = rotation * Math.PI / 180, dx = point[0] - previous[0], dy = point[1] - previous[1]
      assert.ok(Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle)) < .02, `${context}: bridge leaves routed axis`)
      assert.ok(Math.abs(Math.hypot(dx, dy) - 2 * rx) < .02, `${context}: expected half-ellipse bridge`)
    }
    points.push(point)
  }
  assert.ok(points.length >= 2, context)
  if (spec.type === 'usecase') {
    const start = points[0], end = points.at(-1), dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy)
    for (const point of points) assert.ok(Math.abs((point[0] - start[0]) * dy - (point[1] - start[1]) * dx) / length < .02, `${context}: usecase bends`)
  } else for (let index = 1; index < points.length; index++) {
    assert.ok(Math.abs(points[index][0] - points[index - 1][0]) < .01 || Math.abs(points[index][1] - points[index - 1][1]) < .01, `${context}: diagonal segment`)
  }
  return points
}

export function inspectDiagram(spec, rendered) {
  const context = `${spec.id ?? spec.title}/${spec.direction ?? 'TB'}/${spec.layout?.mode ?? 'balanced'}`
  assert.ok(Number.isFinite(rendered.width) && rendered.width > 0 && Number.isFinite(rendered.height) && rendered.height > 0, context)
  assert.doesNotMatch(rendered.svg, /(?:NaN|Infinity)/, context)
  const all = elements(parseFragment(rendered.svg))
  const root = all.find(node => node.tagName === 'svg')
  assert.ok(root, context)
  const viewBox = props(root).viewBox.split(/\s+/).map(Number)
  const ids = all.map(node => props(node).id).filter(Boolean)
  assert.equal(new Set(ids).size, ids.length, `${context}: duplicate SVG identities`)
  for (const reference of rendered.svg.matchAll(/url\(#([^)]*)\)/g)) assert.ok(ids.includes(reference[1]), `${context}: missing marker ${reference[1]}`)
  if (spec.layout?.maxWidth) assert.ok(rendered.width <= spec.layout.maxWidth + .01, context)
  if (spec.layout?.maxHeight) assert.ok(rendered.height <= spec.layout.maxHeight + .01, context)
  const labels = all.filter(node => hasClass(node, 'uml-edge-label')).map(node => ({ ...props(node), ...worldBox(node, shapeBox(node.childNodes.find(child => child.tagName === 'rect'))) }))
  for (const label of labels) {
    assert.ok(label.x >= 0 && label.y >= 0 && label.x + label.width <= viewBox[2] + .01 && label.y + label.height <= viewBox[3] + .01, `${context}: clipped label`)
    for (const other of labels) if (label !== other) assert.ok(!overlaps(label, other), `${context}: overlapping labels ${label['data-edge-id']} / ${other['data-edge-id']}`)
  }
  if (!spec.nodes) return { width: rendered.width, height: rendered.height, nodes: 0, edges: 0, labels: 0 }
  const nodes = all.filter(node => hasClass(node, 'uml-node') && props(node)['data-node-id'])
  assert.deepEqual(nodes.map(node => props(node)['data-node-id']).sort(), spec.nodes.map(node => node.id).sort(), `${context}: lost nodes`)
  const boxes = nodes.filter(node => !hasClass(node, 'uml-node-actor')).map(node => {
    const shape = node.childNodes.find(child => child.tagName && child.tagName !== 'title')
    const box = shapeBox(shape)
    return box ? { id: props(node)['data-node-id'], ...worldBox(node, box) } : undefined
  }).filter(Boolean)
  for (const box of boxes) {
    assert.ok(box.x >= -.01 && box.y >= -.01 && box.x + box.width <= viewBox[2] + .01 && box.y + box.height <= viewBox[3] + .01, `${context}: clipped node ${box.id}`)
    for (const other of boxes) if (box !== other) assert.ok(!overlaps(box, other), `${context}: overlapping nodes ${box.id} / ${other.id}`)
  }
  const containers = all.filter(node => hasClass(node, 'uml-container'))
  assert.equal(containers.length, (spec.groups?.length ?? 0) + (spec.lanes?.length ?? 0), `${context}: lost regions`)
  const routes = all.filter(node => hasClass(node, 'uml-edge'))
  assert.equal(routes.length, spec.edges?.length ?? 0, `${context}: lost relationships`)
  const endpoints = routes.map(node => `${props(node)['data-from']} → ${props(node)['data-to']}`).sort()
  assert.deepEqual(endpoints, (spec.edges ?? []).map(edge => `${edge.from} → ${edge.to}`).sort(), `${context}: changed endpoints`)
  for (const route of routes) {
    const paths = route.childNodes.filter(node => node.tagName === 'path')
    assert.equal(paths.length, 1, `${context}: disconnected relationship`)
    routePoints(props(paths[0]).d, spec, context)
  }
  const expectedLabels = (spec.edges ?? []).reduce((count, edge) => count + Number(!!edge.label || ['include', 'extend'].includes(edge.kind)) + Number(!!edge.fromLabel) + Number(!!edge.toLabel), 0)
  assert.equal(labels.length, expectedLabels, `${context}: lost annotations`)
  const labelRoles = (spec.edges ?? []).flatMap(edge => [
    ...((edge.label || ['include', 'extend'].includes(edge.kind)) ? ['main'] : []),
    ...(edge.fromLabel ? ['from'] : []), ...(edge.toLabel ? ['to'] : []),
  ].map(role => `${edge.from} → ${edge.to}/${role}`)).sort()
  assert.deepEqual(labels.map(label => `${label['data-from']} → ${label['data-to']}/${label['data-label-role']}`).sort(), labelRoles, `${context}: annotations changed relationships`)
  return { width: rendered.width, height: rendered.height, nodes: nodes.length, edges: routes.length, labels: labels.length }
}
