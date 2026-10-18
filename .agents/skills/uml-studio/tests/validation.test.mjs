import test from 'node:test'
import assert from 'node:assert/strict'
import { renderDiagram, validateSpec } from '../dist/core.mjs'
const flow = () => ({ version: 1, type: 'flowchart', title: '评审', nodes: [{ id: 'a', label: '提交' }, { id: 'b', label: '通过' }], edges: [{ from: 'a', to: 'b' }] })

test('rejects duplicate identities and dangling edge endpoints rather than dropping content', () => {
  const duplicate = flow(); duplicate.nodes.push({ id: 'a', label: '另一节点' })
  assert.throws(() => validateSpec(duplicate), /重复 ID/)
  const dangling = flow(); dangling.edges[0].to = 'missing'
  assert.throws(() => validateSpec(dangling), /端点不存在/)
})

test('flow terminals share a vertical axis and rendered routes stay orthogonal', async () => {
  const spec = { version: 1, type: 'flowchart', title: '流程', nodes: [
    { id: 'start', kind: 'start', label: '开始' }, { id: 'check', label: '检查' }, { id: 'pass', label: '通过' },
    { id: 'fix', label: '修复' }, { id: 'release', label: '发布' }, { id: 'end', kind: 'end', label: '结束' },
  ], edges: [
    { from: 'start', to: 'check' }, { from: 'check', to: 'pass' }, { from: 'pass', to: 'fix' },
    { from: 'fix', to: 'check' }, { from: 'pass', to: 'release' }, { from: 'release', to: 'end' },
  ] }
  const svg = (await renderDiagram(validateSpec(spec))).svg
  const terminalCenter = (id) => {
    const group = svg.match(new RegExp(`<g[^>]*data-node-id="${id}"[\\s\\S]*?</g>`))?.[0]
    const circle = group?.match(/<circle[^>]*cx="([0-9.-]+)"[^>]*cy="([0-9.-]+)"/)
    assert.ok(circle, `missing ${id} terminal shape`)
    return { x: Number(circle[1]), y: Number(circle[2]) }
  }
  const start = terminalCenter('start'), end = terminalCenter('end')
  assert.ok(Math.abs(start.x - end.x) < 1)
  assert.ok(start.y < end.y)
  const edgeGroups = [...svg.matchAll(/<g[^>]*data-edge-id="[^"]+"[\s\S]*?<\/g>/g)].map(match => match[0])
  assert.equal(edgeGroups.length, spec.edges.length)
  for (const group of edgeGroups) for (const [, data] of group.matchAll(/<path[^>]* d="([^"]+)"/g)) {
    let current
    for (const [, command, values] of data.matchAll(/([MLQ])([0-9. -]+)/g)) {
      const numbers = values.trim().split(/ +/).map(Number)
      if (command === 'M' || command === 'L') {
        const point = { x: numbers[0], y: numbers[1] }
        if (command === 'L' && current) assert.ok(Math.abs(current.x - point.x) < 0.01 || Math.abs(current.y - point.y) < 0.01, data)
        current = point
      } else current = { x: numbers[2], y: numbers[3] }
    }
  }
})

test('group containment rejects descendant cycles and unknown parents', () => {
  const spec = flow(); spec.groups = [{ id: 'zone', label: '区域' }, { id: 'host', label: '主机', parent: 'zone' }]; spec.nodes[0].group = 'host'
  spec.groups[0].parent = 'host'
  assert.throws(() => validateSpec(spec), /循环包含/)
  spec.groups[0].parent = 'unknown'
  assert.throws(() => validateSpec(spec), /父分组不存在/)
})

test('swimlane nodes must belong to an existing lane and cannot have competing containment', () => {
  const spec = { ...flow(), type: 'swimlane', lanes: [{ id: 'owner', label: '负责人' }] }
  assert.throws(() => validateSpec(spec), /必须指定 lane/)
  spec.nodes.forEach(n => { n.lane = 'owner' })
  spec.nodes[1].lane = 'missing'
  assert.throws(() => validateSpec(spec), /泳道不存在/)
  spec.nodes[1].lane = 'owner'; spec.groups = [{ id: 'group', label: '组' }]; spec.nodes[1].group = 'group'
  assert.throws(() => validateSpec(spec), /不能同时/)
})

test('sequence fragment indexes are inclusive and alt else begins a nonempty second branch', () => {
  const spec = { version: 1, type: 'sequence', title: '消息', participants: [{ id: 'a', label: '调用方' }, { id: 'b', label: '服务' }], messages: [{ from: 'a', to: 'b', label: '请求' }, { from: 'b', to: 'a', label: '响应', kind: 'return' }], fragments: [{ kind: 'alt', label: '成功', from: 0, to: 1, elseAt: 1 }] }
  spec.fragments[0].to = 2
  assert.throws(() => validateSpec(spec), /消息范围无效/)
  spec.fragments[0].to = 1; spec.fragments[0].elseAt = 0
  assert.throws(() => validateSpec(spec), /elseAt 无效/)
  spec.fragments[0].elseAt = 1; spec.fragments[0].kind = 'opt'
  assert.throws(() => validateSpec(spec), /elseAt 无效/)
  spec.fragments[0].kind = 'alt'
  spec.fragments[0].elseAt = 1; spec.messages[0].to = 'missing'
  assert.throws(() => validateSpec(spec), /不存在的参与者/)
})

test('custom styles reject invalid geometry and resource-bearing colors', () => {
  const spec = flow(); spec.style = { fontSize: 48, gap: 24, lineWidth: 0.5, radius: 0, primary: '#123' }
  spec.style.fontSize = 49
  assert.throws(() => validateSpec(spec), /fontSize/)
  spec.style.fontSize = 15; spec.style.primary = 'url(https://example.invalid/image)'
  assert.throws(() => validateSpec(spec), /primary/)
})

test('does not accept mixed diagram models or silently discard misspelled fields', () => {
  const spec = flow(); spec.participants = [{ id: 'p', label: '参与者' }]
  assert.throws(() => validateSpec(spec), /只有 sequence/)
  delete spec.participants; spec.nodez = spec.nodes
  assert.throws(() => validateSpec(spec), /nodez/)
  delete spec.nodez; spec.type = 'unknown'
  assert.throws(() => validateSpec(spec), /type/)
})

test('fishbone rejects ambiguous category identities and malformed nested causes', () => {
  const spec = { version: 1, type: 'fishbone', title: '根因', fishbone: { effect: '延期', categories: [{ id: 'people', label: '人员', causes: [{ label: '交接遗漏', children: [{ label: '负责人不明确' }] }] }] } }
  spec.fishbone.categories.push({ id: 'people', label: '重复', causes: [{ label: '原因' }] })
  assert.throws(() => validateSpec(spec), /重复 ID/)
  spec.fishbone.categories.pop()
  delete spec.fishbone.categories[0].causes[0].children[0].label
  assert.throws(() => validateSpec(spec), /label/)
})
