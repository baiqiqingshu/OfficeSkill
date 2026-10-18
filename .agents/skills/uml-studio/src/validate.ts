import Ajv from 'ajv'
import { diagramSchema } from './schema'
import type { DiagramSpec } from './types'
const check = new Ajv({ allErrors: true, strict: false }).compile<DiagramSpec>(diagramSchema)
function unique(items: { id: string }[], name: string): Set<string> {
  const ids = new Set<string>()
  for (const item of items) { if (ids.has(item.id)) throw new Error(`${name}存在重复 ID：${item.id}`); ids.add(item.id) }
  return ids
}
export function validateSpec(value: unknown): DiagramSpec {
  if (!check(value)) throw new Error(`JSON 数据无效：${check.errors?.map(e => `${e.instancePath || '/'} ${e.message}${e.keyword === 'additionalProperties' ? ` (${e.params.additionalProperty})` : ''}`).join('；')}`)
  const spec = value
  const nodes = unique(spec.nodes ?? [], '节点'), groups = unique(spec.groups ?? [], '分组'), lanes = unique(spec.lanes ?? [], '泳道')
  unique((spec.edges ?? []).filter((edge): edge is typeof edge & { id: string } => !!edge.id), '连线')
  for (const group of spec.groups ?? []) {
    if (nodes.has(group.id) || lanes.has(group.id)) throw new Error(`分组 ID 与节点或泳道冲突：${group.id}`)
    const seen = new Set([group.id]); let parent = group.parent
    while (parent) { if (!groups.has(parent)) throw new Error(`分组 ${group.id} 的父分组不存在：${parent}`); if (seen.has(parent)) throw new Error(`分组存在循环包含：${group.id}`); seen.add(parent); parent = spec.groups!.find(g => g.id === parent)?.parent }
  }
  for (const lane of spec.lanes ?? []) if (nodes.has(lane.id)) throw new Error(`泳道 ID 与节点冲突：${lane.id}`)
  for (const node of spec.nodes ?? []) {
    if (node.group && !groups.has(node.group)) throw new Error(`节点 ${node.id} 的分组不存在：${node.group}`)
    if (node.lane && !lanes.has(node.lane)) throw new Error(`节点 ${node.id} 的泳道不存在：${node.lane}`)
    if (node.group && node.lane) throw new Error(`节点 ${node.id} 不能同时设置 group 和 lane`)
    if (spec.type === 'swimlane' && !node.lane) throw new Error(`泳道图节点 ${node.id} 必须指定 lane`)
  }
  for (const edge of spec.edges ?? []) if (!nodes.has(edge.from) || !nodes.has(edge.to)) throw new Error(`连线端点不存在：${edge.from} → ${edge.to}`)
  if (spec.type === 'sequence') {
    const participants = unique(spec.participants!, '参与者')
    for (const [i,m] of spec.messages!.entries()) if (!participants.has(m.from) || !participants.has(m.to)) throw new Error(`第 ${i + 1} 条消息引用不存在的参与者`)
    for (const f of spec.fragments ?? []) {
      if (f.from > f.to || f.to >= spec.messages!.length) throw new Error(`组合片段 ${f.label} 的消息范围无效`)
      if (f.elseAt !== undefined && ((f.kind !== 'alt' && f.kind !== 'par') || f.elseAt <= f.from || f.elseAt > f.to)) throw new Error(`组合片段 ${f.label} 的 elseAt 无效`)
    }
  }
  if (spec.fishbone) unique(spec.fishbone.categories, '鱼骨分类')
  if (spec.type !== 'sequence' && (spec.participants || spec.messages || spec.fragments)) throw new Error('只有 sequence 可以使用 participants/messages/fragments')
  if (spec.type !== 'fishbone' && spec.fishbone) throw new Error('只有 fishbone 可以使用 fishbone 数据')
  if (spec.type === 'sequence' || spec.type === 'fishbone') {
    if (spec.nodes || spec.edges || spec.groups || spec.lanes) throw new Error(`${spec.type} 不能包含图节点、连线或分组字段`)
  }
  return spec
}
