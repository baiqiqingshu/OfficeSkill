import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseFragment } from 'parse5'
import { renderDiagram } from '../dist/core.mjs'

const props = node => Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]))
const elements = root => (root.childNodes ?? []).flatMap(node => [node, ...elements(node)])
const close = (actual, expected, context) => assert.ok(Math.abs(actual - expected) < .03, `${context}: ${actual} != ${expected}`)
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

function layoutBox(shape, box) {
  for (let parent = shape.parentNode; parent && props(parent)['data-layout-root'] === undefined; parent = parent.parentNode) {
    for (const [, operation, raw] of [...(props(parent).transform ?? '').matchAll(/(translate|scale)\(([^)]+)\)/g)].reverse()) {
      const [x, y = operation === 'scale' ? x : 0] = raw.trim().split(/[ ,]+/).map(Number)
      box = operation === 'translate' ? { ...box, x: box.x + x, y: box.y + y }
        : { ...box, x: box.x * x, y: box.y * y, width: box.width * x, height: box.height * y, stroke: box.stroke * x }
    }
  }
  return box
}

// Read the rendered outlines rather than duplicating the layout or routing algorithm.
function geometry(svg) {
  const all = elements(parseFragment(svg)), nodes = new Map(), routes = new Map()
  for (const node of all) {
    const attrs = props(node)
    if (attrs['data-node-id']) {
      const shape = node.childNodes.find(child => ['rect', 'circle', 'ellipse', 'path'].includes(child.tagName))
      const a = props(shape)
      let box, outline
      if (shape.tagName === 'rect') box = { x: +a.x, y: +a.y, width: +a.width, height: +a.height }
      else if (shape.tagName === 'circle' || shape.tagName === 'ellipse') {
        const rx = +(a.rx ?? a.r), ry = +(a.ry ?? a.r)
        box = { x: +a.cx - rx, y: +a.cy - ry, width: rx * 2, height: ry * 2 }
      } else {
        const points = []
        let x = 0, y = 0
        for (const [, command, raw] of a.d.matchAll(/([A-Z])([^A-Z]*)/g)) {
          const values = raw.trim().split(/[ ,]+/).map(Number)
          if (command === 'M' || command === 'L' || command === 'A') [x, y] = values.slice(-2)
          else if (command === 'H') x = values[0]
          else if (command === 'V') y = values[0]
          else continue
          points.push({ x, y })
        }
        const xs = points.map(point => point.x), ys = points.map(point => point.y)
        if (!a.d.includes('A')) outline = points.map(point => layoutBox(shape, { ...point, width: 0, height: 0 }))
        box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
        if (attrs.class.includes('uml-node-queue')) { box.x -= 10; box.width += 20 }
        if (attrs.class.includes('uml-node-database')) { box.y -= 10; box.height += 20 }
      }
      nodes.set(attrs['data-node-id'], { ...layoutBox(shape, { ...box, stroke: +a['stroke-width'] }), outline })
    }
    if (attrs.class?.split(' ').includes('uml-edge')) {
      const pathProps = props(node.childNodes.find(child => child.tagName === 'path')), data = pathProps.d
      const points = [], arcs = []
      for (const [, command, raw] of data.matchAll(/([A-Z])([^A-Z]*)/g)) {
        const [x, y] = raw.trim().split(/[ ,]+/).map(Number).slice(-2), point = { x, y }
        if (command === 'A') arcs.push([points.at(-1), point])
        points.push(point)
      }
      routes.set(attrs['data-edge-id'], { from: attrs['data-from'], to: attrs['data-to'], data, points, arcs, merged: attrs['data-merged'] === 'true', marker: pathProps['marker-end'] })
    }
  }
  return { nodes, routes }
}

function centered(point, box, context) {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  assert.ok(Math.abs(point.x - cx) < .03 || Math.abs(point.y - cy) < .03, `${context}: off-center port`)
}

function onOutline(point, outline) {
  return outline.some((a, index) => {
    const b = outline[(index + 1) % outline.length], length = distance(a, b)
    return length > 0 && Math.abs((point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x)) / length < .03
      && point.x >= Math.min(a.x, b.x) - .03 && point.x <= Math.max(a.x, b.x) + .03
      && point.y >= Math.min(a.y, b.y) - .03 && point.y <= Math.max(a.y, b.y) + .03
  })
}

test('two and three branches share centered full-length stems in TB and LR, regardless of edge order', async () => {
  for (const direction of ['TB', 'LR']) for (const count of [2, 3]) for (const incoming of [false, true]) for (const kind of ['action', 'decision']) for (const reverse of [false, true]) {
    const context = `${direction}/${count}/${incoming}/${kind}/${reverse}`
    const branches = Array.from({ length: count }, (_, i) => ({ id: `b${i}`, label: `B${i}`, kind: 'action' }))
    const positions = Object.fromEntries(branches.map((node, i) => [`nodes/${node.id}`, direction === 'TB'
      ? { x: 400 + (i - (count - 1) / 2) * 300, y: incoming ? 160 : 640 }
      : { x: incoming ? 60 : 740, y: 400 + (i - (count - 1) / 2) * 200 + (kind === 'decision' ? 10 : 0) }]))
    const edges = branches.map(node => ({ id: node.id, from: incoming ? node.id : 'hub', to: incoming ? 'hub' : node.id }))
    const { nodes, routes } = geometry((await renderDiagram({ version: 1, type: 'flowchart', title: context, direction,
      nodes: [{ id: 'hub', label: 'Hub', kind }, ...branches], edges: reverse ? edges.reverse() : edges,
      layout: { elementGap: 48, adjustments: { elements: { 'nodes/hub': { x: 400, y: 400 }, ...positions } } } })).svg)
    const box = nodes.get('hub'), ports = []
    const all = [...routes.values()]
    const joinsTrunk = (point, own) => all.some(other => other !== own && !other.merged && other.points.some((b, i) => {
      if (!i) return false
      const a = other.points[i - 1]
      const horizontal = Math.abs(a.y - b.y) < .01
      const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y)
      const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y)
      const at = horizontal ? point.x : point.y
      const off = horizontal ? point.y : point.x
      return Math.abs(off - (horizontal ? a.y : a.x)) < .03 && at >= lo - .03 && at <= hi + .03
    }))
    for (const route of routes.values()) {
      const { points, arcs } = route
      if (incoming && route.merged) {
        assert.ok(joinsTrunk(points.at(-1), route), `${context}: merged branch must join the shared trunk`)
        continue
      }
      const port = incoming ? points.at(-1) : points[0], neighbor = incoming ? points.at(-2) : points[1]
      ports.push(port)
      centered(port, box, context)
      if (direction === 'TB') {
        close(port.x, box.x + box.width / 2, context)
        close(port.y, incoming ? box.y : box.y + box.height, context)
        close(neighbor.x, port.x, context)
        assert.ok(incoming ? neighbor.y < port.y : neighbor.y > port.y, context)
      } else {
        close(port.x, incoming ? box.x : box.x + box.width, context)
        close(port.y, box.y + box.height / 2, context)
        close(neighbor.y, port.y, context)
        assert.ok(incoming ? neighbor.x < port.x : neighbor.x > port.x, context)
      }
      assert.ok(distance(port, neighbor) >= 23.99, `${context}: collapsed stem`)
      for (const arc of arcs) for (const point of arc) assert.ok(distance(point, port) > 24, `${context}: shared trunk must not gain a bridge`)
    }
    assert.ok(ports.length >= 1, `${context}: at least the trunk reaches the hub`)
    assert.ok(ports.length <= count)
    for (const port of ports) assert.deepEqual(port, ports[0], context)
  }
})

test('package top ports meet the body outline, including orthogonal usecase relationships', async () => {
  for (const type of ['package', 'usecase']) {
    const spec = { version: 1, type, title: 'Package entry', direction: 'TB',
      nodes: [{ id: 'a', label: 'A', kind: 'action' }, { id: 'p', label: 'P', kind: 'package' }],
      edges: [{ id: 'entry', from: 'a', to: 'p' }], layout: { edgeCrossing: 'plain', adjustments: {
        elements: { 'nodes/a': { x: 400, y: 100 }, 'nodes/p': { x: 400, y: 400 } },
        ...(type === 'usecase' ? { edges: { entry: { waypoints: [{ x: 490, y: 270 }] } } } : {}) } } }
    const { nodes, routes } = geometry((await renderDiagram(spec)).svg)
    const box = nodes.get('p'), point = routes.get('entry').points.at(-1)
    close(point.x, box.x + box.width / 2, type)
    close(point.y, box.y + 20, type)
  }
})

test('orthogonal ports stay centered on every non-actor shape, including scaled symbols', async () => {
  const kinds = ['action', 'decision', 'start', 'end', 'fork', 'join', 'usecase', 'class', 'interface', 'component', 'package', 'database', 'server', 'queue', 'state', 'note']
  for (const kind of kinds) for (const direction of ['TB', 'LR']) for (const scaled of [false, true]) {
    const context = `${kind}/${direction}/${scaled}`
    const positions = direction === 'TB'
      ? { 'nodes/a': { x: 400, y: 100 }, 'nodes/shape': { x: 400, y: 400 }, 'nodes/b': { x: 400, y: 740 } }
      : { 'nodes/a': { x: 100, y: 400 }, 'nodes/shape': { x: 400, y: 400 }, 'nodes/b': { x: 740, y: 400 } }
    const { nodes, routes } = geometry((await renderDiagram({ version: 1, type: 'flowchart', title: context, direction,
      nodes: [{ id: 'a', label: 'A' }, { id: 'shape', label: 'S', kind }, { id: 'b', label: 'B' }],
      edges: [{ id: 'in', from: 'a', to: 'shape' }, { id: 'out', from: 'shape', to: 'b' }],
      layout: { edgeCrossing: 'plain', ...(scaled ? { nodeMaxWidth: 100, nodeMaxHeight: 60 } : {}), adjustments: { elements: positions } } })).svg)
    const box = nodes.get('shape')
    for (const point of [routes.get('in').points.at(-1), routes.get('out').points[0]]) {
      centered(point, box, context)
      if (box.outline) { assert.ok(onOutline(point, box.outline), `${context}: detached polygon endpoint`); continue }
      const pad = ['start', 'end'].includes(kind) ? box.stroke / 2 : 0
      const boundaries = [Math.abs(point.x - box.x + pad), Math.abs(point.x - box.x - box.width - pad),
        Math.abs(point.y - box.y + pad), Math.abs(point.y - box.y - box.height - pad)]
      assert.ok(Math.min(...boundaries) < .03, `${context}: detached endpoint`)
    }
  }
})

test('usecase direct edges meet diamond and circular boundaries along the center ray', async () => {
  for (const kind of ['decision', 'start', 'end', 'usecase']) {
    const { nodes, routes } = geometry((await renderDiagram({ version: 1, type: 'usecase', title: kind,
      nodes: [{ id: 'a', label: 'A', kind }, { id: 'b', label: 'B', kind: 'usecase' }], edges: [{ id: 'e', from: 'a', to: 'b' }],
      layout: { edgeCrossing: 'plain', adjustments: { elements: { 'nodes/a': { x: 100, y: 100 }, 'nodes/b': { x: 500, y: 340 } } } } })).svg)
    const path = routes.get('e').points
    assert.equal(path.length, 2)
    for (const [id, point] of [['a', path[0]], ['b', path[1]]]) {
      const box = nodes.get(id), cx = box.x + box.width / 2, cy = box.y + box.height / 2
      // Terminal SVG radii exclude half the stroke; endpoints meet the outer stroke.
      const padding = id === 'a' && ['start', 'end'].includes(kind) ? box.stroke / 2 : 0
      const dx = (point.x - cx) / (box.width / 2 + padding), dy = (point.y - cy) / (box.height / 2 + padding)
      close(id === 'a' && kind === 'decision' ? Math.abs(dx) + Math.abs(dy) : dx * dx + dy * dy, 1, `${kind}/${id}`)
      const other = nodes.get(id === 'a' ? 'b' : 'a')
      const vx = other.x + other.width / 2 - cx, vy = other.y + other.height / 2 - cy
      close(((point.x - cx) * vy - (point.y - cy) * vx) / Math.hypot(vx, vy), 0, `${kind}/${id}: center ray`)
    }
  }
})

test('usecase self-loops and waypoint routes keep distinct centered ellipse ports', async () => {
  for (const self of [false, true]) {
    const { nodes, routes } = geometry((await renderDiagram({ version: 1, type: 'usecase', title: 'Orthogonal ellipse',
      nodes: [{ id: 'a', label: 'A' }, ...(!self ? [{ id: 'b', label: 'B' }] : [])], edges: [{ id: 'e', from: 'a', to: self ? 'a' : 'b' }],
      layout: { edgeCrossing: 'plain', adjustments: { elements: { 'nodes/a': { x: 100, y: 100 }, ...(!self ? { 'nodes/b': { x: 500, y: 340 } } : {}) },
        ...(!self ? { edges: { e: { waypoints: [{ x: 400, y: 220 }] } } } : {}) } } })).svg)
    const route = routes.get('e'), path = route.points
    assert.notDeepEqual(path[0], path.at(-1))
    for (let i = 1; i < path.length; i++) assert.ok(Math.abs(path[i].x - path[i - 1].x) < .03 || Math.abs(path[i].y - path[i - 1].y) < .03)
    for (const [id, point] of [['a', path[0]], [route.to, path.at(-1)]]) {
      const box = nodes.get(id)
      centered(point, box, `${self}/${id}`)
      close(((point.x - box.x - box.width / 2) / (box.width / 2)) ** 2
        + ((point.y - box.y - box.height / 2) / (box.height / 2)) ** 2, 1, `${self}/${id}`)
    }
  }
})

test('opposite relationships avoid using the same node side in opposing directions', async () => {
  for (const direction of ['TB', 'LR']) for (const reverse of [false, true]) {
    const edges = [{ id: 'forward', from: 'a', to: 'b' }, { id: 'return', from: 'b', to: 'a' }]
    const { routes } = geometry((await renderDiagram({ version: 1, type: 'flowchart', title: 'Return', direction,
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: reverse ? edges.reverse() : edges,
      layout: { edgeCrossing: 'plain' } })).svg)
    const forward = routes.get('forward').points, back = routes.get('return').points
    assert.notDeepEqual(forward[0], back.at(-1))
    assert.notDeepEqual(forward.at(-1), back[0])
  }
})

test('activity, swimlane, state and flowchart examples keep all diamond endpoints on vertices', async () => {
  const scenarios = JSON.parse(await readFile(new URL('../examples/scenarios.json', import.meta.url), 'utf8')).diagrams
  for (const name of ['activity', 'swimlane', 'state', 'flowchart']) {
    const spec = scenarios.find(d => d.type === name)
    const { nodes, routes } = geometry((await renderDiagram({ ...spec, layout: { ...spec.layout, edgeCrossing: 'plain' } })).svg)
    const decisions = new Set(spec.nodes.filter(node => node.kind === 'decision').map(node => node.id))
    for (const route of routes.values()) for (const [id, point] of [[route.from, route.points[0]], ...(route.merged ? [] : [[route.to, route.points.at(-1)]])]) {
      if (!decisions.has(id)) continue
      const box = nodes.get(id)
      centered(point, box, `${name}/${id}`)
      close(Math.abs(point.x - box.x - box.width / 2) / (box.width / 2)
        + Math.abs(point.y - box.y - box.height / 2) / (box.height / 2), 1, `${name}/${id}`)
    }
  }
})

const corners = points => points.filter((point, i) => {
  if (!i || i === points.length - 1) return true
  const a = points[i - 1], b = points[i + 1]
  return Math.abs((point.x - a.x) * (b.y - point.y) - (point.y - a.y) * (b.x - point.x)) > .03
})
const onPolyline = (point, points) => points.some((b, i) => {
  if (!i) return false
  const a = points[i - 1]
  return Math.abs((point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x)) / Math.max(distance(a, b), 1e-6) < .05
    && point.x >= Math.min(a.x, b.x) - .05 && point.x <= Math.max(a.x, b.x) + .05
    && point.y >= Math.min(a.y, b.y) - .05 && point.y <= Math.max(a.y, b.y) + .05
})

test('merged fan-in branches show no arrowhead and join their trunk clear of its corners and source stem', async () => {
  const login = JSON.parse(await readFile(new URL('./fixtures/login.json', import.meta.url), 'utf8')).activity
  const decision = { version: 1, type: 'flowchart', title: 'converge', nodes: [
    { id: 's', label: '开始', kind: 'start' }, { id: 'in', label: '输入' }, { id: 'ok', label: '校验通过？', kind: 'decision' },
    { id: 'a', label: '错误 A' }, { id: 'b', label: '错误 B' }, { id: 'c', label: '错误 C' }, { id: 'done', label: '完成', kind: 'end' }],
  edges: [{ from: 's', to: 'in' }, { from: 'in', to: 'ok' }, { from: 'ok', to: 'a', label: '格式' }, { from: 'ok', to: 'b', label: '权限' }, { from: 'ok', to: 'c', label: '库存' },
    { from: 'ok', to: 'done', label: '是' }, { from: 'a', to: 'ok' }, { from: 'b', to: 'ok' }, { from: 'c', to: 'ok' }] }
  const specs = [['login', login], ['login-lr', { ...login, direction: 'LR', layout: { mode: 'compact' } }], ['decision', decision]]
  for (const [name, spec] of specs) {
    const { routes } = geometry((await renderDiagram(spec)).svg)
    const merged = [...routes.values()].filter(route => route.merged)
    assert.ok(merged.length >= 1, `${name}: expected a fan-in merge`)
    for (const route of merged) {
      const context = `${name}: ${route.from} → ${route.to}`
      assert.equal(route.marker, undefined, `${context}: merged branch must not carry an arrowhead`)
      const end = route.points.at(-1)
      const trunk = [...routes.values()].find(other => !other.merged && other.to === route.to && onPolyline(end, other.points))
      assert.ok(trunk, `${context}: merged end must sit on the trunk of the same target`)
      assert.ok(trunk.marker, `${context}: the trunk carries the arrowhead`)
      const bends = corners(trunk.points), stub = bends.length > 2 ? bends.at(-2) : undefined
      if (stub && distance(stub, end) < .05) continue
      for (const bend of bends) assert.ok(distance(bend, end) >= 15.9, `${context}: junction hugs a trunk corner or end`)
    }
  }
})
