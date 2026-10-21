import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderDiagram } from '../dist/core.mjs'

function annotations(svg) {
  const routes = new Map(), labels = []
  const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => match.slice(1)))
  for (const [, tag, body] of svg.matchAll(/<g\b([^>]*class="uml-edge(?: uml-edge-[^"]+|-label)"[^>]*)>([\s\S]*?)<\/g>/g)) {
    const props = attributes(tag)
    if (props.class === 'uml-edge-label') {
      const rect = attributes(body.match(/<rect\b([^>]+)>/)[1])
      labels.push({ edge: props['data-edge-id'], role: props['data-label-role'],
        x: +rect.x, y: +rect.y, width: +rect.width, height: +rect.height,
        leader: body.match(/class="uml-label-leader" d="M([\d.-]+) ([\d.-]+) L([\d.-]+) ([\d.-]+)"/)?.slice(1).map(Number),
        value: [...body.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(match => match[1]).join('\n') })
    } else {
      const path = body.match(/<path\b[^>]* d="([^"]+)"/)[1]
      routes.set(props['data-edge-id'], [...path.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(([, x, y]) => ({ x: +x, y: +y })))
    }
  }
  return { routes, labels }
}

function orthogonalDistance(box, path) {
  let closest = Infinity
  for (let index = 1; index < path.length; index++) {
    const first = path[index - 1], last = path[index]
    const dx = Math.max(Math.min(first.x, last.x) - box.x - box.width, box.x - Math.max(first.x, last.x), 0)
    const dy = Math.max(Math.min(first.y, last.y) - box.y - box.height, box.y - Math.max(first.y, last.y), 0)
    closest = Math.min(closest, Math.hypot(dx, dy))
  }
  return closest
}

test('login branch guards stay beside their own paths and off shared trunks', async () => {
  const spec = JSON.parse(await readFile(new URL('./fixtures/login-activity.json', import.meta.url), 'utf8'))
  for (const edges of [spec.edges, [...spec.edges].reverse()]) for (const direction of ['TB', 'LR']) for (const mode of ['compact', 'balanced', 'spacious']) {
    const { routes, labels } = annotations((await renderDiagram({ ...spec, edges, direction, layout: { mode } })).svg)
    assert.equal(labels.length, 8)
    for (const label of labels) {
      const description = `${direction}/${mode}/${label.edge} (${label.value})`
      const own = orthogonalDistance(label, routes.get(label.edge))
      assert.ok(own >= 4, `${description} covers its relationship`)
      if (mode !== 'compact' && edges === spec.edges) {
        assert.ok(own <= 18.01, `${description} is too far from its relationship: ${own}`)
        assert.ok(!label.leader, `${description} should fit beside its branch`)
      }
      if (label.leader) {
        const [startX, startY, endX, endY] = label.leader
        const anchor = { x: startX, y: startY, width: 0, height: 0 }
        assert.ok(own <= 100.01, `${description} has an unnecessarily long leader`)
        assert.ok(orthogonalDistance(anchor, routes.get(label.edge)) < .01, `${description} leader detaches from its relationship`)
        assert.ok(endX >= label.x && endX <= label.x + label.width && endY >= label.y && endY <= label.y + label.height)
        for (const [id, path] of routes) if (id !== label.edge) assert.ok(orthogonalDistance(anchor, path) > 1, `${description} leader attaches to a shared trunk`)
      } else assert.ok(own <= 18.01, `${description} floats without a leader`)
      for (const [id, path] of routes) if (id !== label.edge) {
        const distance = orthogonalDistance(label, path)
        assert.ok(distance >= 4, `${description} covers ${id}`)
        if (!label.leader) assert.ok(distance >= own + 2.9, `${description} is ambiguous with ${id}: ${distance} versus ${own}`)
      }
      for (const other of labels) if (other !== label) assert.ok(label.x >= other.x + other.width || other.x >= label.x + label.width
        || label.y >= other.y + other.height || other.y >= label.y + label.height, `${description} overlaps another label`)
    }
  }
})

test('cardinality labels stay near their respective ends', async () => {
  const spec = { version: 1, type: 'class', title: '所有权', direction: 'LR',
    nodes: [{ id: 'user', label: '用户' }, { id: 'order', label: '订单' }],
    edges: [{ id: 'owns', from: 'user', to: 'order', fromLabel: '1', toLabel: '0..*' }] }
  const { routes, labels } = annotations((await renderDiagram(spec)).svg)
  assert.equal(labels.length, 2)
  const path = routes.get('owns'), start = path[0], end = path.at(-1)
  for (const label of labels) {
    const center = { x: label.x + label.width / 2, y: label.y + label.height / 2 }
    const fromDistance = Math.hypot(center.x - start.x, center.y - start.y), toDistance = Math.hypot(center.x - end.x, center.y - end.y)
    assert.ok(label.role === 'from' ? fromDistance < toDistance : toDistance < fromDistance)
    assert.ok(orthogonalDistance(label, path) <= 18.01)
  }
})

test('payment lifecycle annotations reflow instead of drifting above the diagram', async () => {
  const spec = JSON.parse(await readFile(new URL('../examples/scenarios/state.json', import.meta.url), 'utf8'))
  for (const direction of ['TB', 'LR']) for (const mode of ['compact', 'balanced', 'spacious']) for (const reverse of [false, true]) {
    const input = { ...spec, direction, layout: { mode }, edges: reverse ? [...spec.edges].reverse() : spec.edges }
    const original = JSON.stringify(input)
    const { svg } = await renderDiagram(input)
    assert.equal(JSON.stringify(input), original, 'spacing retries must not modify the editable document')
    const { routes, labels } = annotations(svg)
    assert.equal(routes.size, spec.edges.length)
    assert.equal(labels.length, spec.edges.filter(edge => edge.label).length)
    const states = [...svg.matchAll(/<g class="uml-node uml-node-state"[^>]*>[\s\S]*?<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g)]
      .map(([, x, y, width, height]) => ({ x: +x, y: +y, width: +width, height: +height }))
    for (const label of labels) {
      const context = `${direction}/${mode}/${reverse}/${label.value}`
      assert.ok(orthogonalDistance(label, routes.get(label.edge)) <= 48.01, `${context}: detached annotation`)
      for (const box of states) assert.ok(label.x >= box.x + box.width || box.x >= label.x + label.width
        || label.y >= box.y + box.height || box.y >= label.y + label.height, `${context}: annotation covers a state`)
      if (direction === 'TB' && !reverse) assert.ok(!label.leader, `${context}: should fit beside its transition`)
      if (!label.leader) continue
      const [x1, y1, x2, y2] = label.leader
      assert.ok(Math.hypot(x2 - x1, y2 - y1) <= 48.01, `${context}: long leader`)
      for (const box of states) {
        // Clip the leader against the state rectangle to detect hidden crossings.
        let enter = 0, leave = 1
        for (const [start, delta, low, high] of [[x1, x2 - x1, box.x, box.x + box.width], [y1, y2 - y1, box.y, box.y + box.height]]) {
          if (Math.abs(delta) < .001) { if (start < low || start > high) leave = -1 }
          else { enter = Math.max(enter, Math.min((low - start) / delta, (high - start) / delta)); leave = Math.min(leave, Math.max((low - start) / delta, (high - start) / delta)) }
        }
        assert.ok(enter > leave, `${context}: leader crosses a state`)
      }
    }
  }
})

test('usecase annotations stay close to straight and diagonal relationships without covering them', async () => {
  const spec = { version: 1, type: 'usecase', title: '认证', direction: 'LR',
    nodes: [{ id: 'login', label: '登录' }, { id: 'verify', label: '校验' }, { id: 'audit', label: '审计' }],
    edges: [{ id: 'verify', from: 'login', to: 'verify', kind: 'include' }, { id: 'audit', from: 'login', to: 'audit', kind: 'include' }] }
  const { routes, labels } = annotations((await renderDiagram(spec)).svg)
  assert.equal(labels.length, 2)
  for (const label of labels) {
    const [start, end] = routes.get(label.edge)
    const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy)
    const center = { x: label.x + label.width / 2, y: label.y + label.height / 2 }
    const distance = Math.abs((center.x - start.x) * dy - (center.y - start.y) * dx) / length
    const extent = (Math.abs(dy) * label.width + Math.abs(dx) * label.height) / (2 * length)
    assert.ok(distance - extent >= 4 && distance - extent <= 18.01)
  }
})
