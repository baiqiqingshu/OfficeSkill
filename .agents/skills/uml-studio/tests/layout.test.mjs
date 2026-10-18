import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderDiagram, validateSpec } from '../dist/core.mjs'

function geometry(svg) {
  const nodes = new Map(), containers = new Map(), routes = []
  for (const [, tag, body] of svg.matchAll(/<g\b([^>]*class="uml-(?:node|container|edge)\b[^>]*)>([\s\S]*?)<\/g>/g)) {
    const id = tag.match(/data-node-id="([^"]+)"/)?.[1]
    const group = tag.match(/data-(?:group|lane)-id="([^"]+)"/)?.[1]
    const rect = body.match(/<rect\b[^>]*x="([\d.-]+)"[^>]*y="([\d.-]+)"[^>]*width="([\d.-]+)"[^>]*height="([\d.-]+)"/)
    const circle = body.match(/<circle\b[^>]*cx="([\d.-]+)"[^>]*cy="([\d.-]+)"[^>]*r="([\d.-]+)"/)
    const polygon = body.match(/<path\b[^>]*d="(M[\d .-]+(?: L[\d .-]+)+ Z)"/)
    let box
    if (rect) box = { x: +rect[1], y: +rect[2], width: +rect[3], height: +rect[4] }
    else if (circle) box = { x: +circle[1] - +circle[3], y: +circle[2] - +circle[3], width: +circle[3] * 2, height: +circle[3] * 2 }
    else if (polygon) {
      const points = [...polygon[1].matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(([, x, y]) => ({ x: +x, y: +y }))
      const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y))
      box = { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y }
    }
    if (id && box) nodes.set(id, box)
    else if (group && box && tag.includes('uml-container')) containers.set(group, box)
    if (tag.includes('uml-edge ')) {
      const from = tag.match(/data-from="([^"]+)"/)[1], to = tag.match(/data-to="([^"]+)"/)[1]
      const paths = [...body.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map(([, d]) => {
        assert.ok(!/[CQ]/i.test(d), 'routes must be polylines')
        return [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(([, x, y]) => ({ x: +x, y: +y }))
      })
      routes.push({ from, to, paths })
    }
  }
  return { nodes, containers, routes }
}

function assertRoutes(graph, edges) {
  assert.equal(graph.routes.length, edges.length, 'every relationship must remain visible')
  for (const route of graph.routes) {
    assert.equal(route.paths.length, 1, 'a relationship must be continuous')
    const path = route.paths[0]
    assert.ok(path.length >= 2)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i]
      assert.ok(Math.abs(a.x - b.x) < .01 || Math.abs(a.y - b.y) < .01, 'non-orthogonal segment')
      for (const [id, box] of graph.nodes) {
        if (id === route.from || id === route.to) continue
        const crosses = Math.abs(a.y - b.y) < .01
          ? a.y > box.y + .1 && a.y < box.y + box.height - .1 && Math.max(a.x, b.x) > box.x + .1 && Math.min(a.x, b.x) < box.x + box.width - .1
          : a.x > box.x + .1 && a.x < box.x + box.width - .1 && Math.max(a.y, b.y) > box.y + .1 && Math.min(a.y, b.y) < box.y + box.height - .1
        assert.ok(!crosses, `${route.from} → ${route.to} crosses ${id}`)
      }
    }
    for (const [point, id] of [[path[0], route.from], [path.at(-1), route.to]]) {
      const box = graph.nodes.get(id)
      assert.ok(point.x >= box.x - 1 && point.x <= box.x + box.width + 1 && point.y >= box.y - 1 && point.y <= box.y + box.height + 1, `detached endpoint ${id}`)
    }
  }
}

test('review gallery preserves routes and exterior terminal bands with column and spacing settings', async () => {
  const gallery = JSON.parse(await readFile(new URL('../examples/documents/gallery.json', import.meta.url), 'utf8'))
  const review = gallery.diagrams.find(diagram => diagram.id === 'review-ocean')
  for (const layout of [review.layout, { regionGap: 72 }, { mode: 'grid' }, { maxPerColumn: 2 }]) {
    const graph = geometry((await renderDiagram(validateSpec({ ...review, layout }))).svg)
    assertRoutes(graph, review.edges)
    const start = graph.nodes.get('start'), end = graph.nodes.get('end')
    assert.ok(Math.abs(start.x + start.width / 2 - end.x - end.width / 2) < .01)
    assert.ok(graph.nodes.get('submit').y < graph.nodes.get('review').y, 'feedback must not reorder the entry path')
    assert.ok(graph.nodes.get('revise').y >= graph.nodes.get('review').y, 'the correction branch must not precede review')
    const entry = graph.routes.find(route => route.from === 'start').paths[0]
    assert.equal(entry.length, 2, 'aligned entry should be a straight connection')
    for (const [id, box] of graph.nodes) if (!['start', 'end'].includes(id)) {
      assert.ok(start.y + start.height < box.y, `start is not above ${id}`)
      assert.ok(end.y > box.y + box.height, `end is not below ${id}`)
    }
  }
})

test('folded chain follows relationships rather than input order and aligns column hand-offs', async () => {
  const spec = { version: 1, type: 'component', title: '折列', layout: { maxPerColumn: 2 },
    nodes: ['e', 'c', 'a', 'd', 'b'].map(id => ({ id, label: id, kind: 'action' })),
    edges: ['a', 'b', 'c', 'd'].map((id, i) => ({ from: id, to: ['b', 'c', 'd', 'e'][i] })) }
  const graph = geometry((await renderDiagram(validateSpec(spec))).svg)
  assertRoutes(graph, spec.edges)
  const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(id => graph.nodes.get(id))
  assert.ok(a.y < b.y && a.x === b.x)
  assert.ok(c.x > b.x && c.y === b.y, 'first hand-off should share a row')
  assert.ok(d.y < c.y && d.x === c.x)
  assert.ok(e.x > d.x && e.y === d.y, 'second hand-off should share a row')
})

test('nested sibling regions are horizontal and direct cross-region links align without overlap', async () => {
  const spec = { version: 1, type: 'component', title: '区域',
    groups: [{ id: 'outer', label: '系统' }, { id: 'left', label: '左区', parent: 'outer' }, { id: 'right', label: '右区', parent: 'outer' }],
    nodes: [{ id: 'a', label: 'A', group: 'left', kind: 'action' }, { id: 'b', label: 'B', group: 'left', kind: 'action' }, { id: 'c', label: 'C', group: 'right', kind: 'action' }, { id: 'd', label: 'D', group: 'right', kind: 'action' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }, { from: 'b', to: 'c' }] }
  const graph = geometry((await renderDiagram(validateSpec(spec))).svg)
  assertRoutes(graph, spec.edges)
  const left = graph.containers.get('left'), right = graph.containers.get('right')
  assert.ok(left.x + left.width < right.x)
  assert.equal(left.y, right.y)
  assert.equal(graph.nodes.get('b').y, graph.nodes.get('c').y)
  for (const node of spec.nodes) {
    const box = graph.nodes.get(node.id), group = graph.containers.get(node.group)
    assert.ok(box.x >= group.x && box.y >= group.y && box.x + box.width <= group.x + group.width && box.y + box.height <= group.y + group.height)
  }
})

test('disproportionately tall regions fold automatically unless unlimited columns are explicit', async () => {
  const base = { version: 1, type: 'component', title: '不均衡区域', groups: [{ id: 'long', label: '长流程' }, { id: 'short', label: '短流程' }],
    nodes: [...Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `步骤 ${i}`, kind: 'action', group: 'long' })), { id: 'peer', label: '处理', kind: 'action', group: 'short' }],
    edges: Array.from({ length: 11 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })) }
  const folded = geometry((await renderDiagram(validateSpec(base))).svg)
  const unlimited = geometry((await renderDiagram(validateSpec({ ...base, layout: { maxPerColumn: 0 } }))).svg)
  assertRoutes(folded, base.edges)
  assert.ok(folded.containers.get('long').height < unlimited.containers.get('long').height)
  assert.ok(new Set([...folded.nodes].filter(([id]) => id !== 'peer').map(([, box]) => box.x)).size > 1)
})

test('swimlane cross-links share rows and remain visible in grid mode', async () => {
  const spec = { version: 1, type: 'swimlane', title: '职责', layout: { mode: 'grid', regionGap: 64 }, lanes: [{ id: 'l', label: '申请方' }, { id: 'r', label: '审批方' }],
    nodes: [{ id: 'a', label: '提交', lane: 'l' }, { id: 'b', label: '补充', lane: 'l' }, { id: 'c', label: '审核', lane: 'r' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] }
  const graph = geometry((await renderDiagram(validateSpec(spec))).svg)
  assertRoutes(graph, spec.edges)
  assert.equal(graph.nodes.get('b').y, graph.nodes.get('c').y)
})

test('self relationships keep distinct ports and do not collapse into invisible paths', async () => {
  const spec = { version: 1, type: 'flowchart', title: '重试', nodes: [{ id: 'a', label: '处理' }], edges: [{ from: 'a', to: 'a', label: '重试' }] }
  const graph = geometry((await renderDiagram(validateSpec(spec))).svg)
  assertRoutes(graph, spec.edges)
  const path = graph.routes[0].paths[0]
  assert.ok(path.length >= 4)
  assert.notDeepEqual(path[0], path.at(-1))
})
