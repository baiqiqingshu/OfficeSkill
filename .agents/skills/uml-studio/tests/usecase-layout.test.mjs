import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderDiagram } from '../dist/core.mjs'
import { inspectDiagram } from '../scripts/demo-checks.mjs'

const load = path => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse)
const bookstore = await load('../examples/usecase.json')
const login = (await load('./fixtures/login.json')).usecase
const commerce = await load('../examples/scenarios/usecase.json')

function geometry(svg) {
  const cases = new Map(), actors = new Map(), regions = new Map(), routes = []
  const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => match.slice(1)))
  for (const [, tag, body] of svg.matchAll(/<g\b([^>]*class="uml-(?:node|container|edge)\b[^>]*)>([\s\S]*?)<\/g>/g)) {
    const props = attributes(tag)
    if (props.class.includes('uml-node-usecase')) {
      const shape = attributes(body.match(/<ellipse\b([^>]+)>/)[1])
      cases.set(props['data-node-id'], { x: +shape.cx, y: +shape.cy, rx: +shape.rx, ry: +shape.ry })
    } else if (props.class.includes('uml-node-actor')) {
      const shape = attributes(body.match(/<circle\b([^>]+)>/)[1])
      actors.set(props['data-node-id'], { x: +shape.cx, y: +shape.cy, radius: +shape.r })
    } else if (props.class.includes('uml-container')) {
      const shape = attributes(body.match(/<rect\b([^>]+)>/)[1])
      regions.set(props['data-group-id'], { x: +shape.x, y: +shape.y, width: +shape.width, height: +shape.height })
    } else if (props.class.includes('uml-edge ')) {
      const data = body.match(/<path\b[^>]* d="([^"]+)"/)[1]
      const points = [...data.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(([, horizontal, vertical]) => ({ x: +horizontal, y: +vertical }))
      assert.equal(points.length, 2)
      routes.push({ from: props['data-from'], to: props['data-to'], start: points[0], end: points[1] })
    }
  }
  return { cases, actors, regions, routes }
}

function assertClear(graph) {
  for (const route of graph.routes) for (const [id, box] of graph.cases) {
    if (id === route.from || id === route.to) continue
    const startX = (route.start.x - box.x) / box.rx, startY = (route.start.y - box.y) / box.ry
    const deltaX = (route.end.x - route.start.x) / box.rx, deltaY = (route.end.y - route.start.y) / box.ry
    const fraction = Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / (deltaX * deltaX + deltaY * deltaY)))
    assert.ok(Math.hypot(startX + deltaX * fraction, startY + deltaY * fraction) >= .99, `${route.from} → ${route.to} crosses ${id}`)
  }
}

function crossings(graph) {
  const turn = (first, last, point) => (last.x - first.x) * (point.y - first.y) - (last.y - first.y) * (point.x - first.x)
  let count = 0
  for (const [index, line] of graph.routes.entries()) for (const other of graph.routes.slice(index + 1)) {
    if (turn(line.start, line.end, other.start) * turn(line.start, line.end, other.end) < -.01
      && turn(other.start, other.end, line.start) * turn(other.start, other.end, line.end) < -.01) count++
  }
  return count
}

test('bookstore groups actor capabilities into aligned columns without crossing unrelated usecases', async () => {
  const rendered = await renderDiagram(bookstore)
  inspectDiagram(bookstore, rendered)
  const graph = geometry(rendered.svg)
  assertClear(graph)
  assert.equal(crossings(graph), 0)
  for (const id of ['search', 'catalog']) assert.equal(graph.cases.get(id).x, graph.cases.get('order').x)
  assert.equal(graph.cases.get('order').y, graph.cases.get('payment').y)
  const reader = graph.routes.filter(route => route.from === 'reader')
  assert.deepEqual(reader[0].start, reader[1].start)
  const administration = graph.routes.find(route => route.from === 'admin')
  assert.equal(administration.start.y, administration.end.y)
  const region = graph.regions.get('store')
  for (const actor of graph.actors.values()) assert.ok(actor.x + actor.radius < region.x || actor.x - actor.radius > region.x + region.width)
  assert.ok(rendered.width < 1000 && rendered.height < 650)
})

test('shared includes, extensions, actor inheritance and external actors keep clear straight relationships', async context => {
  for (const spec of [login, commerce]) await context.test(spec.title, async () => {
    const rendered = await renderDiagram(spec)
    inspectDiagram(spec, rendered)
    const graph = geometry(rendered.svg)
    assertClear(graph)
    assert.equal(crossings(graph), 0)
  })
})

test('usecase layouts retain straight relationships in both directions and every spacing mode', async () => {
  for (const direction of ['LR', 'TB']) for (const mode of ['compact', 'balanced', 'spacious', 'grid']) {
    const spec = { ...bookstore, direction, layout: { mode } }
    const rendered = await renderDiagram(spec)
    inspectDiagram(spec, rendered)
    const graph = geometry(rendered.svg)
    assertClear(graph)
    assert.equal(crossings(graph), 0)
  }
  const implicit = structuredClone(bookstore)
  delete implicit.direction
  const graph = geometry((await renderDiagram(implicit)).svg)
  assert.ok(graph.actors.get('reader').x < graph.cases.get('search').x)
  const limited = { ...bookstore, layout: { maxPerColumn: 2 } }
  const folded = await renderDiagram(limited)
  inspectDiagram(limited, folded)
  const columns = new Map()
  for (const box of geometry(folded.svg).cases.values()) columns.set(box.x, (columns.get(box.x) ?? 0) + 1)
  assert.ok([...columns.values()].every(count => count <= 2))
})

test('cycles, disconnected cases, nested and empty boundaries survive dedicated usecase layout', async () => {
  const spec = { version: 1, type: 'usecase', title: '多个系统',
    groups: [{ id: 'outer', label: '业务平台' }, { id: 'one', label: '子系统一', parent: 'outer' }, { id: 'two', label: '子系统二', parent: 'outer' }, { id: 'empty', label: '待接入系统' }],
    nodes: [{ id: 'actor', label: '用户', kind: 'actor' }, { id: 'a', label: '业务入口', group: 'one' }, { id: 'b', label: '辅助能力', group: 'one' }, { id: 'c', label: '独立能力', group: 'two' }],
    edges: [{ from: 'actor', to: 'a' }, { from: 'a', to: 'b', kind: 'include' }, { from: 'b', to: 'a', kind: 'include' }] }
  const rendered = await renderDiagram(spec)
  inspectDiagram(spec, rendered)
  const graph = geometry(rendered.svg)
  for (const node of spec.nodes.filter(node => node.group)) {
    const box = graph.cases.get(node.id), region = graph.regions.get(node.group)
    assert.ok(box.x - box.rx >= region.x && box.x + box.rx <= region.x + region.width)
    assert.ok(box.y - box.ry >= region.y && box.y + box.ry <= region.y + region.height)
  }
})
