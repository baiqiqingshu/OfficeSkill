import { diagramTypes, fishboneHeadStyles } from './types'
import { layoutModes, themes } from './themes'
const str = { type: 'string' }
const label = { type: 'string', minLength: 1 }
const id = { type: 'string', minLength: 1, pattern: '^[A-Za-z0-9_\\-:.]+$' }
const strings = { type: 'array', items: str }
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })
const array = (items: unknown, minItems = 0) => ({ type: 'array', items, minItems })
const num = (minimum: number, maximum: number) => ({ type: 'number', minimum, maximum })
const integer = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum })
const en = (...values: string[]) => ({ type: 'string', enum: values })
const color = { type: 'string', pattern: '^(transparent|#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?)$' }
const style = object({
  ...Object.fromEntries(['background', 'surface', 'text', 'muted', 'primary', 'secondary', 'border'].map(key => [key, color])),
  fontFamily: { type: 'string', minLength: 1, pattern: '^[^<>;{}\\\\]+$' },
  fontSize: num(8, 48), fontWeight: integer(100, 900), fontStyle: en('normal', 'italic'), textDecoration: en('none', 'underline'),
  lineWidth: num(0.5, 8), radius: num(0, 32), nodeWidth: num(80, 600), nodeHeight: num(32, 300), gap: num(24, 240),
  palette: { type: 'array', items: color, minItems: 1, maxItems: 16, description: '多色调色板；元素颜色按 paletteBy 轮换。' },
  paletteMode: { ...en('mono', 'tint', 'solid', 'gradient'), description: 'mono 单色；tint 浅色填充彩色描边；solid 实色填充；gradient 渐变填充。' },
  paletteBy: { ...en('auto', 'group', 'kind', 'node'), description: 'auto：有分组/泳道按分组，否则按节点顺序。' },
})
const edgeArrow = en('none', 'arrow', 'open', 'triangle', 'circle', 'cross')
const coordinate = num(-1000000, 1000000)
const point = object({ x: coordinate, y: coordinate }, ['x', 'y'])
const adjustmentMap = (values: unknown) => ({
  type: 'object', propertyNames: { type: 'string', minLength: 1, pattern: '^[A-Za-z0-9_./:-]+$' }, additionalProperties: values,
})
const adjustments = object({
  elements: adjustmentMap({ oneOf: [object({ dx: coordinate, dy: coordinate }, ['dx', 'dy']), point] }),
  edges: adjustmentMap(object({ waypoints: array(point) }, ['waypoints'])),
})
const layout = object({
  mode: { ...en(...layoutModes.map(mode => mode.value)), default: 'balanced' },
  edgeCrossing: { ...en('bridge', 'plain'), default: 'bridge', description: '节点图连线交叉表示：bridge 为拱桥形跳线，plain 为无圆点直接交叉；两者都表示不相连。' },
  horizontalStagger: { type: 'boolean', default: false, description: '流程、活动、泳道图中，跨列相连元素沿流程方向错开；false 保持水平对齐优先。' },
  adjustments,
  showTitle: { type: 'boolean', default: false }, maxWidth: num(0, 100000), maxHeight: num(0, 100000),
  regionGap: num(0, 600), elementGap: num(8, 400), maxPerColumn: integer(0, 30),
  nodeMaxWidth: num(0, 100000), nodeMaxHeight: num(0, 100000),
  autonumber: { type: 'boolean', default: true, description: '时序图消息编号；Mermaid 导入默认关闭。' },
})
const cause = object({ label, children: array({ $ref: '#/definitions/cause' }) }, ['label'])
const specSchema = {
  ...object({
    version: { const: 1 }, id, type: { type: 'string', enum: diagramTypes }, title: label, description: str,
    theme: en(...Object.keys(themes)), style, layout, direction: en('TB', 'LR'),
    nodes: array(object({ id, label, kind: en('action', 'decision', 'start', 'end', 'fork', 'join', 'actor', 'usecase', 'class', 'interface', 'component', 'package', 'database', 'server', 'queue', 'state', 'note', 'image', 'terminal', 'subroutine', 'io', 'hexagon', 'circle', 'trapezoid'), src: { type: 'string', pattern: '^data:image/', maxLength: 7_340_032, description: "kind 'image' 的图片内容，仅接受 data:image/ URL（约 5MB 上限）。", }, width: num(8, 10000), height: num(8, 10000), detail: str, stereotype: str, attributes: strings, operations: strings, group: id, lane: id, style }, ['id', 'label'])),
    edges: array(object({ id, from: id, to: id, label: str, kind: en('flow', 'association', 'dependency', 'include', 'extend', 'inheritance', 'realization', 'aggregation', 'composition'), dashed: { type: 'boolean' }, fromLabel: str, toLabel: str, arrow: edgeArrow, startArrow: edgeArrow, thick: { type: 'boolean' } }, ['from', 'to'])),
    groups: array(object({ id, label, parent: id, kind: en('boundary', 'package', 'node') }, ['id', 'label'])),
    lanes: array(object({ id, label }, ['id', 'label'])),
    participants: array(object({ id, label, kind: en('actor', 'participant', 'database', 'boundary', 'control', 'entity', 'collections', 'queue') }, ['id', 'label'])),
    boxes: array(object({ label: str, participants: array(id, 1), color }, ['label', 'participants'])),
    messages: array(object({ from: id, to: id, label: str, kind: en('sync', 'async', 'return', 'create', 'destroy', 'note', 'divider'), activate: { type: 'boolean' }, deactivate: { type: 'boolean' }, arrow: en('filled', 'open', 'none', 'cross'), dashed: { type: 'boolean' }, bidirectional: { type: 'boolean' }, position: en('left', 'right', 'over') }, ['from', 'to', 'label'])),
    fragments: array(object({ kind: en('alt', 'opt', 'loop', 'par', 'critical', 'break', 'rect'), label: str, from: { type: 'integer', minimum: 0 }, to: { type: 'integer', minimum: 0 }, elseAt: { type: 'integer', minimum: 0 }, elseLabel: str, elses: array(object({ at: { type: 'integer', minimum: 0 }, label: str }, ['at'])), color }, ['kind', 'label', 'from', 'to'])),
    fishbone: object({ effect: label, headStyle: { ...en(...fishboneHeadStyles), default: 'classic', description: '默认保留原版鱼头与比例；其余轮廓仅在显式选择时应用，不改变原因结构。' }, categories: array(object({ id, label, causes: array({ $ref: '#/definitions/cause' }, 1) }, ['id', 'label', 'causes']), 1) }, ['effect', 'categories']),
  }, ['version', 'type', 'title']),
  allOf: [
    { if: { properties: { type: { const: 'sequence' } } }, then: { required: ['participants', 'messages'], properties: { participants: { minItems: 1 }, messages: { minItems: 1 } } } },
    { if: { properties: { type: { const: 'fishbone' } } }, then: { required: ['fishbone'] } },
    { if: { properties: { type: { not: { enum: ['sequence', 'fishbone'] } } } }, then: { required: ['nodes'], properties: { nodes: { minItems: 1 } } } },
    { if: { properties: { type: { const: 'swimlane' } } }, then: { required: ['lanes'], properties: { lanes: { minItems: 1 } } } },
  ],
}
export const diagramSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#', $id: 'https://office-skill.local/uml-studio/diagram.schema.json',
  ...specSchema, definitions: { cause },
}
export const documentSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#', $id: 'https://office-skill.local/uml-studio/document.schema.json',
  ...object({ version: { const: 1 }, title: label, diagrams: array({ $ref: '#/definitions/diagram' }, 1) }, ['version', 'title', 'diagrams']),
  definitions: { cause, diagram: specSchema },
}
