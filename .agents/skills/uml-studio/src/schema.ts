import { diagramTypes } from './types'
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
})
const layout = object({
  mode: { ...en(...layoutModes.map(mode => mode.value)), default: 'balanced' },
  showTitle: { type: 'boolean', default: false }, maxWidth: num(0, 100000), maxHeight: num(0, 100000),
  regionGap: num(0, 600), elementGap: num(8, 400), maxPerColumn: integer(0, 30),
  nodeMaxWidth: num(0, 100000), nodeMaxHeight: num(0, 100000),
})
const cause = object({ label, children: array({ $ref: '#/definitions/cause' }) }, ['label'])
const specSchema = {
  ...object({
    version: { const: 1 }, id, type: { type: 'string', enum: diagramTypes }, title: label, description: str,
    theme: en(...Object.keys(themes)), style, layout, direction: en('TB', 'LR'),
    nodes: array(object({ id, label, kind: en('action', 'decision', 'start', 'end', 'fork', 'join', 'actor', 'usecase', 'class', 'interface', 'component', 'package', 'database', 'server', 'queue', 'state', 'note'), detail: str, stereotype: str, attributes: strings, operations: strings, group: id, lane: id, style }, ['id', 'label'])),
    edges: array(object({ id, from: id, to: id, label: str, kind: en('flow', 'association', 'dependency', 'include', 'extend', 'inheritance', 'realization', 'aggregation', 'composition'), dashed: { type: 'boolean' }, fromLabel: str, toLabel: str }, ['from', 'to'])),
    groups: array(object({ id, label, parent: id, kind: en('boundary', 'package', 'node') }, ['id', 'label'])),
    lanes: array(object({ id, label }, ['id', 'label'])),
    participants: array(object({ id, label, kind: en('actor', 'participant', 'database') }, ['id', 'label'])),
    messages: array(object({ from: id, to: id, label: str, kind: en('sync', 'async', 'return', 'create', 'destroy'), activate: { type: 'boolean' }, deactivate: { type: 'boolean' } }, ['from', 'to', 'label'])),
    fragments: array(object({ kind: en('alt', 'opt', 'loop', 'par'), label: str, from: { type: 'integer', minimum: 0 }, to: { type: 'integer', minimum: 0 }, elseAt: { type: 'integer', minimum: 0 }, elseLabel: str }, ['kind', 'label', 'from', 'to'])),
    fishbone: object({ effect: label, categories: array(object({ id, label, causes: array({ $ref: '#/definitions/cause' }, 1) }, ['id', 'label', 'causes']), 1) }, ['effect', 'categories']),
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
