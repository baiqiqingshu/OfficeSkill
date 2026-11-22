import type {
  DiagramDocument, DiagramEdge, DiagramGroup, DiagramNode, DiagramSpec, EdgeArrow, Fragment, Message, Participant, ParticipantBox, Theme,
} from './types';

/** Mermaid → UML Studio JSON. Unsupported statements are reported as warnings instead of aborting. */
export interface MermaidResult { document: DiagramDocument; warnings: string[] }

const headers = /^(flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram(?:-v2)?)\b/;
const unsupportedHeaders = /^(erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4\w*|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|kanban|architecture(?:-beta)?|radar(?:-beta)?|treemap(?:-beta)?)\b/;

/** True when text looks like Mermaid source or Markdown containing a mermaid block. */
export function isMermaidSource(text: string): boolean {
  const body = stripFrontMatter(text.replace(/^\uFEFF/, '')).body;
  if (/```\s*mermaid/i.test(body)) return true;
  const first = body.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('%%'));
  return !!first && (headers.test(first) || unsupportedHeaders.test(first));
}

function stripFrontMatter(text: string): { body: string; title?: string; direction?: string } {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---\s*\r?\n/.exec(text);
  if (!match) return { body: text };
  const title = /^\s*title\s*:\s*(.+)$/m.exec(match[1]!)?.[1]?.trim().replace(/^["']|["']$/g, '');
  return { body: text.slice(match[0].length), title };
}

/** Extract every ```mermaid block from Markdown; plain Mermaid returns itself. */
export function extractMermaidBlocks(text: string): string[] {
  const blocks = [...text.matchAll(/```\s*mermaid[^\n]*\n([\s\S]*?)```/gi)].map(match => match[1]!);
  return blocks.length ? blocks : [text];
}

export function mermaidToDocument(source: string, title?: string): MermaidResult {
  const warnings: string[] = [];
  const diagrams: DiagramSpec[] = [];
  const blocks = extractMermaidBlocks(source.replace(/^\uFEFF/, ''));
  blocks.forEach((block, index) => {
    try {
      diagrams.push(mermaidToSpec(block, warnings, blocks.length > 1 ? `${index + 1}` : ''));
    } catch (reason) {
      warnings.push(`第 ${index + 1} 个 Mermaid 图未导入：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  });
  if (!diagrams.length) throw new Error(warnings.join('；') || '没有可导入的 Mermaid 图');
  const ids = new Set<string>();
  diagrams.forEach((spec, index) => { let id = spec.id ?? `mermaid-${index + 1}`; while (ids.has(id)) id += '-x'; ids.add(id); spec.id = id; });
  return { document: { version: 1, title: title ?? (diagrams.length === 1 ? diagrams[0]!.title : 'Mermaid 导入'), diagrams }, warnings };
}

export function mermaidToSpec(block: string, warnings: string[] = [], suffix = ''): DiagramSpec {
  const front = stripFrontMatter(block);
  const lines = front.body.replace(/\r\n?/g, '\n').split('\n');
  let start = 0;
  while (start < lines.length && (!lines[start]!.trim() || lines[start]!.trim().startsWith('%%'))) start++;
  const header = lines[start]?.trim() ?? '';
  const body = lines.slice(start + 1);
  const kind = headers.exec(header)?.[1];
  if (!kind) {
    const other = unsupportedHeaders.exec(header)?.[1];
    throw new Error(other ? `暂不支持 Mermaid ${other}` : `无法识别的 Mermaid 图头：${header.slice(0, 40)}`);
  }
  const fallbackTitle = (name: string) => front.title ?? `${name}${suffix ? ` ${suffix}` : ''}`;
  let spec: DiagramSpec;
  if (kind === 'flowchart' || kind === 'graph') spec = parseFlowchart(header, body, warnings, fallbackTitle('流程图'));
  else if (kind === 'sequenceDiagram') spec = parseSequence(body, warnings, fallbackTitle('时序图'));
  else if (kind.startsWith('stateDiagram')) spec = parseState(body, warnings, fallbackTitle('状态图'));
  else spec = parseClass(body, warnings, fallbackTitle('类图'));
  return spec;
}

// ---------------------------------------------------------------- helpers

const namedColors: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
  pink: '#ffc0cb', gray: '#808080', grey: '#808080', aqua: '#00ffff', cyan: '#00ffff', teal: '#008080', navy: '#000080', lime: '#00ff00',
  lightblue: '#add8e6', lightgreen: '#90ee90', lightyellow: '#ffffe0', lightgrey: '#d3d3d3', lightgray: '#d3d3d3', lightpink: '#ffb6c1',
  lavender: '#e6e6fa', beige: '#f5f5dc', wheat: '#f5deb3', khaki: '#f0e68c', gold: '#ffd700', salmon: '#fa8072', coral: '#ff7f50',
  tomato: '#ff6347', violet: '#ee82ee', plum: '#dda0dd', orchid: '#da70d6', silver: '#c0c0c0', ivory: '#fffff0', azure: '#f0ffff',
  honeydew: '#f0fff0', mintcream: '#f5fffa', aliceblue: '#f0f8ff', whitesmoke: '#f5f5f5', gainsboro: '#dcdcdc', skyblue: '#87ceeb',
  steelblue: '#4682b4', royalblue: '#4169e1', tan: '#d2b48c', olive: '#808000', maroon: '#800000', magenta: '#ff00ff', indigo: '#4b0082',
};
/** Convert Mermaid / CSS colours to the schema's #RRGGBB form; alpha is blended over white. */
export function cssColor(value: string | undefined): string | undefined {
  if (!value) return;
  const raw = value.trim().toLowerCase();
  if (raw === 'transparent' || raw === 'none') return 'transparent';
  if (namedColors[raw]) return namedColors[raw];
  let match = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(raw);
  if (match) {
    let hex = match[1]!;
    if (hex.length <= 4) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 8) {
      const alpha = parseInt(hex.slice(6), 16) / 255;
      return blend([0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)), alpha);
    }
    return `#${hex}`;
  }
  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(raw);
  if (match) {
    const alphaText = match[4];
    const alpha = alphaText === undefined ? 1 : alphaText.endsWith('%') ? parseFloat(alphaText) / 100 : parseFloat(alphaText);
    return blend([match[1], match[2], match[3]].map(Number), alpha);
  }
  return;
}
function blend(rgb: number[], alpha: number): string {
  return `#${rgb.map(v => Math.round(255 + (Math.min(255, v) - 255) * Math.max(0, Math.min(1, alpha))).toString(16).padStart(2, '0')).join('')}`;
}
function cleanLabel(value: string): string {
  return value.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/^`([\s\S]*)`$/, '$1')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[a-z][^>]*>/gi, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(?:^|\s)fa:fa-[\w-]+/g, '')
    .replace(/#quot;/g, '"').replace(/#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code))).replace(/\\n/g, '\n').trim();
}
function stripComment(line: string): string {
  const index = line.indexOf('%%');
  return (index >= 0 ? line.slice(0, index) : line).trim();
}
/** Mermaid allows ids our schema rejects; keep valid ones and map the rest. */
class Ids {
  private map = new Map<string, string>();
  private used = new Set<string>();
  get(raw: string): string {
    const existing = this.map.get(raw);
    if (existing) return existing;
    let id = /^[A-Za-z0-9_\-:.]+$/.test(raw) ? raw : raw.replace(/[^A-Za-z0-9_\-:.]/g, '') || `n${this.map.size + 1}`;
    while (this.used.has(id)) id = `${id}_${this.map.size + 1}`;
    this.used.add(id);
    this.map.set(raw, id);
    return id;
  }
  has(raw: string): boolean { return this.map.has(raw); }
}
function styleFrom(declaration: string): Partial<Theme> {
  const style: Partial<Theme> = {};
  for (const part of declaration.split(/[,;]/)) {
    const [key, ...rest] = part.split(':');
    const value = rest.join(':').trim();
    const name = key?.trim().toLowerCase();
    if (name === 'fill') { const c = cssColor(value); if (c) style.surface = c; }
    else if (name === 'stroke') { const c = cssColor(value); if (c && c !== 'transparent') style.border = c; }
    else if (name === 'color') { const c = cssColor(value); if (c && c !== 'transparent') style.text = c; }
    else if (name === 'font-weight') { const n = value === 'bold' ? 700 : Number(value); if (n >= 100 && n <= 900) style.fontWeight = Math.round(n / 100) * 100; }
  }
  return style;
}
function direction(value: string | undefined): 'TB' | 'LR' | undefined {
  if (!value) return;
  const v = value.toUpperCase();
  return v === 'LR' || v === 'RL' ? 'LR' : v === 'TB' || v === 'TD' || v === 'BT' ? 'TB' : undefined;
}

// ---------------------------------------------------------------- flowchart

type Shape = { open: string; close: string; kind?: DiagramNode['kind'] };
const shapes: Shape[] = [
  { open: '(((', close: ')))', kind: 'circle' }, { open: '((', close: '))', kind: 'circle' }, { open: '([', close: '])', kind: 'terminal' },
  { open: '[[', close: ']]', kind: 'subroutine' }, { open: '[(', close: ')]', kind: 'database' }, { open: '{{', close: '}}', kind: 'hexagon' },
  { open: '[/', close: '/]', kind: 'io' }, { open: '[\\', close: '\\]', kind: 'io' }, { open: '[/', close: '\\]', kind: 'trapezoid' },
  { open: '[\\', close: '/]', kind: 'trapezoid' }, { open: '{', close: '}', kind: 'decision' }, { open: '(', close: ')', kind: 'action' },
  { open: '[', close: ']', kind: 'action' }, { open: '>', close: ']', kind: 'note' },
];
const shapeNames: Record<string, DiagramNode['kind']> = {
  rect: 'action', rectangle: 'action', proc: 'action', process: 'action', rounded: 'action', event: 'action', 'notch-rect': 'note', card: 'note',
  stadium: 'terminal', pill: 'terminal', terminal: 'terminal', subroutine: 'subroutine', subproc: 'subroutine', 'framed-rectangle': 'subroutine',
  cyl: 'database', cylinder: 'database', database: 'database', db: 'database', 'h-cyl': 'queue', das: 'queue', 'horizontal-cylinder': 'queue',
  circle: 'circle', circ: 'circle', 'dbl-circ': 'circle', 'double-circle': 'circle', 'sm-circ': 'start', start: 'start', 'f-circ': 'join', stop: 'end', 'fr-circ': 'end',
  diam: 'decision', diamond: 'decision', decision: 'decision', question: 'decision', hex: 'hexagon', hexagon: 'hexagon', prepare: 'hexagon',
  'lean-r': 'io', 'lean-l': 'io', 'in-out': 'io', 'out-in': 'io', 'trap-b': 'trapezoid', 'trap-t': 'trapezoid', priority: 'trapezoid', 'manual-file': 'trapezoid',
  doc: 'note', document: 'note', docs: 'note', 'lin-doc': 'note', comment: 'note', 'brace': 'note', 'brace-r': 'note', braces: 'note',
  fork: 'fork', join: 'fork', 'manual-input': 'io', 'sl-rect': 'io', 'div-rect': 'subroutine', 'lin-rect': 'subroutine', 'st-rect': 'subroutine',
};

interface FlowState { nodes: Map<string, DiagramNode>; order: string[]; edges: DiagramEdge[]; groups: DiagramGroup[]; ids: Ids; classes: Map<string, Partial<Theme>>; pendingClasses: [string, string][] }

function parseFlowchart(header: string, lines: string[], warnings: string[], title: string): DiagramSpec {
  const state: FlowState = { nodes: new Map(), order: [], edges: [], groups: [], ids: new Ids(), classes: new Map(), pendingClasses: [] };
  const stack: string[] = [];
  const dir = direction(/^\S+\s+(\w+)/.exec(header)?.[1]);
  let titleLine: string | undefined;
  const statements = lines.flatMap(line => splitStatements(stripComment(line)));
  for (const statement of statements) {
    if (!statement) continue;
    let match: RegExpExecArray | null;
    if ((match = /^subgraph\s+(.+)$/.exec(statement))) {
      const rest = match[1]!.trim();
      const bracket = /^([^\s[]+)\s*\[(.*)\]$/.exec(rest);
      const rawId = bracket ? bracket[1]! : /^"/.test(rest) ? rest : rest.split(/\s+/)[0]!;
      const label = cleanLabel(bracket ? bracket[2]! : rest);
      const id = state.ids.get(`group:${rawId}`);
      state.groups.push({ id, label: label || rawId, ...(stack.length ? { parent: stack[stack.length - 1] } : {}) });
      stack.push(id);
      groupAliases.set(rawId, id);
      continue;
    }
    if (statement === 'end') { stack.pop(); continue; }
    if (/^direction\s+\w+$/.test(statement)) continue;
    if ((match = /^classDef\s+(\S+)\s+(.+)$/.exec(statement))) {
      const style = styleFrom(match[2]!);
      for (const name of match[1]!.split(',')) state.classes.set(name.trim(), style);
      continue;
    }
    if ((match = /^class\s+(\S+)\s+(\S+)$/.exec(statement))) {
      for (const id of match[1]!.split(',')) state.pendingClasses.push([id.trim(), match[2]!]);
      continue;
    }
    if ((match = /^style\s+(\S+)\s+(.+)$/.exec(statement))) {
      const node = state.nodes.get(match[1]!);
      if (node) node.style = { ...node.style, ...styleFrom(match[2]!) };
      continue;
    }
    if ((match = /^(?:title|accTitle)\s*:?\s*(.+)$/.exec(statement))) { titleLine = cleanLabel(match[1]!); continue; }
    if (/^(?:linkStyle|click|accDescr|interpolate)\b/.test(statement)) continue;
    if (!parseFlowStatement(statement, state, stack[stack.length - 1])) warnings.push(`流程图未识别：${statement.slice(0, 60)}`);
  }
  for (const [raw, name] of state.pendingClasses) {
    const node = state.nodes.get(raw);
    const style = state.classes.get(name);
    if (node && style) node.style = { ...style, ...node.style };
  }
  const groupsWithMembers = new Set<string>();
  for (const node of state.nodes.values()) {
    let id = node.group;
    while (id && !groupsWithMembers.has(id)) { groupsWithMembers.add(id); id = state.groups.find(group => group.id === id)?.parent; }
  }
  // Mermaid can reference a subgraph id as an edge endpoint; resolve it to the first member node.
  const firstMember = (groupId: string) => [...state.nodes.values()].find(node => node.group === groupId)?.id;
  const nodeIds = new Set([...state.nodes.values()].map(node => node.id));
  const edges = state.edges.flatMap(edge => {
    const from = nodeIds.has(edge.from) ? edge.from : firstMember(edge.from);
    const to = nodeIds.has(edge.to) ? edge.to : firstMember(edge.to);
    return from && to ? [{ ...edge, from, to }] : [];
  });
  groupAliases.clear();
  return {
    version: 1, type: 'flowchart', title: titleLine ?? title, ...(dir ? { direction: dir } : {}),
    nodes: state.order.map(raw => state.nodes.get(raw)!),
    edges,
    ...(state.groups.length ? { groups: state.groups.filter(group => groupsWithMembers.has(group.id)) } : {}),
  };
}
const groupAliases = new Map<string, string>();

function splitStatements(line: string): string[] {
  const result: string[] = [];
  let current = '', quote = false, depth = 0;
  for (const char of line) {
    if (char === '"') quote = !quote;
    if (!quote) { if ('[({'.includes(char)) depth++; else if (')]}'.includes(char)) depth = Math.max(0, depth - 1); }
    if (char === ';' && !quote && depth === 0) { result.push(current.trim()); current = ''; }
    else current += char;
  }
  result.push(current.trim());
  return result.filter(Boolean);
}

const idPattern = /^[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[-.:](?=[\p{L}\p{N}_]))*/u;

function readNodeRef(text: string, state: FlowState, group: string | undefined): { ids: string[]; rest: string } | undefined {
  const ids: string[] = [];
  let rest = text.trimStart();
  for (;;) {
    const ref = readSingleNode(rest, state, group);
    if (!ref) return ids.length ? { ids, rest } : undefined;
    ids.push(ref.id);
    rest = ref.rest.trimStart();
    if (rest.startsWith('&')) { rest = rest.slice(1).trimStart(); continue; }
    return { ids, rest };
  }
}

function readSingleNode(text: string, state: FlowState, group: string | undefined): { id: string; rest: string } | undefined {
  const match = idPattern.exec(text);
  if (!match) return;
  const raw = match[0];
  let rest = text.slice(raw.length);
  let label: string | undefined, kind: DiagramNode['kind'] | undefined;
  if (rest.startsWith('@{')) {
    const close = rest.indexOf('}');
    if (close > 0) {
      const body = rest.slice(2, close);
      const shape = /shape\s*:\s*"?([\w-]+)"?/.exec(body)?.[1];
      const labelMatch = /label\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(body) ?? /label\s*:\s*([^,]+)/.exec(body);
      kind = shape ? shapeNames[shape.toLowerCase()] ?? 'action' : undefined;
      if (labelMatch) label = cleanLabel(labelMatch[1]!);
      rest = rest.slice(close + 1);
    }
  } else {
    for (const shape of shapes) {
      if (!rest.startsWith(shape.open)) continue;
      const inner = rest.slice(shape.open.length);
      let end: number;
      if (inner.trimStart().startsWith('"')) {
        const startQuote = inner.indexOf('"');
        const endQuote = inner.indexOf('"', startQuote + 1);
        end = endQuote < 0 ? -1 : inner.indexOf(shape.close, endQuote);
      } else end = inner.indexOf(shape.close);
      if (end < 0) continue;
      // `[/text/]` vs `[/text\]` share an opener; require the exact closer.
      label = cleanLabel(inner.slice(0, end));
      kind = shape.kind;
      rest = inner.slice(end + shape.close.length);
      break;
    }
  }
  let className: string | undefined;
  const classMatch = /^:::([\w-]+)/.exec(rest);
  if (classMatch) { className = classMatch[1]; rest = rest.slice(classMatch[0].length); }
  const alias = groupAliases.get(raw);
  if (alias && label === undefined && !state.nodes.has(raw)) return { id: alias, rest };
  let node = state.nodes.get(raw);
  if (!node) {
    node = { id: state.ids.get(raw), label: label || raw, ...(group ? { group } : {}) };
    state.nodes.set(raw, node);
    state.order.push(raw);
  } else {
    if (label !== undefined) node.label = label || raw;
    if (group && !node.group) node.group = group;
  }
  if (kind && kind !== 'action') node.kind = kind;
  else if (kind === 'action') delete node.kind;
  if (className) state.pendingClasses.push([raw, className]);
  return { id: node.id, rest };
}

const textLink = /^(<|o|x)?(--|==|-\.)\s*([^>|]*?[^\s>-])\s*(-{2,}|={2,}|\.+-)(>|o|x)?(?=\s|$|[\p{L}\p{N}_"])/u;
const plainLink = /^(<|o|x)?(-{2,}|={2,}|-\.+-|~{3,})(>|o(?=[\s"]|$)|x(?=[\s"]|$))?/;

function parseFlowStatement(statement: string, state: FlowState, group: string | undefined): boolean {
  let left = readNodeRef(statement, state, group);
  if (!left) return false;
  let rest = left.rest;
  let parsed = true;
  while (rest) {
    let match = textLink.exec(rest);
    let label: string | undefined, startHead: string | undefined, line: string, endHead: string | undefined;
    if (match) {
      startHead = match[1]; line = match[2]!; label = cleanLabel(match[3]!); endHead = match[5];
    } else {
      match = plainLink.exec(rest);
      if (!match) { parsed = false; break; }
      startHead = match[1]; line = match[2]!; endHead = match[3];
    }
    rest = rest.slice(match[0].length).trimStart();
    const pipe = /^\|([^|]*)\|/.exec(rest);
    if (pipe) { label = cleanLabel(pipe[1]!); rest = rest.slice(pipe[0].length).trimStart(); }
    const right = readNodeRef(rest, state, group);
    if (!right) { parsed = false; break; }
    if (!line.startsWith('~')) {
      const arrow = (head: string | undefined): EdgeArrow | undefined => head === '>' || head === '<' ? undefined : head === 'o' ? 'circle' : head === 'x' ? 'cross' : 'none';
      for (const from of left.ids) for (const to of right.ids) {
        const edge: DiagramEdge = { from, to };
        if (label) edge.label = label;
        if (line.includes('.')) edge.dashed = true;
        if (line.startsWith('=')) edge.thick = true;
        const end = arrow(endHead);
        if (end) edge.arrow = end;
        if (startHead) edge.startArrow = startHead === '<' ? 'arrow' : arrow(startHead)!;
        state.edges.push(edge);
      }
    }
    left = right;
    rest = right.rest;
  }
  return parsed;
}

// ---------------------------------------------------------------- sequence

const seqArrow = /^(.+?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-]?)\s*(.+?)\s*(?::(.*))?$/;

function parseSequence(lines: string[], warnings: string[], title: string): DiagramSpec {
  const ids = new Ids();
  const participants: Participant[] = [];
  const known = new Map<string, Participant>();
  const messages: Message[] = [];
  const fragments: Fragment[] = [];
  const boxes: ParticipantBox[] = [];
  const open: { fragment: Fragment; start: number; branches: { at: number; label?: string }[] }[] = [];
  let currentBox: ParticipantBox | undefined;
  let autonumber = false;
  let titleLine: string | undefined;
  const pendingCreate = new Set<string>(), pendingDestroy = new Set<string>();
  const participant = (raw: string, label?: string, kind?: Participant['kind']): Participant => {
    const name = raw.trim();
    let item = known.get(name);
    if (!item) {
      item = { id: ids.get(name), label: label ?? name, ...(kind && kind !== 'participant' ? { kind } : {}) };
      known.set(name, item);
      participants.push(item);
      if (currentBox) currentBox.participants.push(item.id);
    } else {
      if (label) item.label = label;
      if (kind && kind !== 'participant') item.kind = kind;
    }
    return item;
  };
  const anchor = () => participants[0]?.id ?? participant('系统').id;
  for (const original of lines) {
    const statement = stripComment(original);
    if (!statement) continue;
    let match: RegExpExecArray | null;
    if ((match = /^(?:title|accTitle)\s*:?\s*(.+)$/.exec(statement))) { titleLine = cleanLabel(match[1]!); continue; }
    if (/^autonumber\b/.test(statement)) { autonumber = !/\boff\b/.test(statement); continue; }
    if ((match = /^(create\s+)?(participant|actor|boundary|control|entity|database|collections|queue)\s+(.+?)(?:\s+as\s+(.+))?$/.exec(statement))) {
      let raw = match[3]!.trim();
      let kind = match[2] as Participant['kind'];
      const config = /^(.+?)@\{(.*)\}$/.exec(raw);
      if (config) { raw = config[1]!.trim(); const type = /type\s*:\s*"?(\w+)"?/.exec(config[2]!)?.[1]; if (type) kind = type as Participant['kind']; }
      const item = participant(raw, match[4] ? cleanLabel(match[4]) : undefined, kind);
      if (match[1]) pendingCreate.add(item.id);
      continue;
    }
    if ((match = /^destroy\s+(.+)$/.exec(statement))) { pendingDestroy.add(participant(match[1]!).id); continue; }
    if ((match = /^box(?:\s+(.*))?$/.exec(statement))) {
      const rest = (match[1] ?? '').trim();
      const colorMatch = /^(rgba?\([^)]*\)|#[\da-fA-F]{3,8}|[a-zA-Z]+)(?:\s+(.*))?$/.exec(rest);
      let color: string | undefined, label = rest;
      if (colorMatch && cssColor(colorMatch[1]) !== undefined) { color = cssColor(colorMatch[1]); label = colorMatch[2] ?? ''; }
      currentBox = { label: cleanLabel(label), participants: [], ...(color ? { color } : {}) };
      boxes.push(currentBox);
      continue;
    }
    if ((match = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/.exec(statement))) {
      const kind = match[1] as Fragment['kind'];
      const label = cleanLabel(match[2] ?? '');
      const fragment: Fragment = { kind, label: kind === 'rect' ? '' : label, from: messages.length, to: messages.length };
      if (kind === 'rect') { const color = cssColor(label); if (color) fragment.color = color; }
      open.push({ fragment, start: messages.length, branches: [] });
      continue;
    }
    if ((match = /^(else|and|option)\b\s*(.*)$/.exec(statement))) {
      const top = open[open.length - 1];
      if (top) top.branches.push({ at: messages.length, ...(match[2] ? { label: cleanLabel(match[2]) } : {}) });
      continue;
    }
    if (statement === 'end') {
      if (currentBox && !open.length) { currentBox = undefined; continue; }
      const top = open.pop();
      if (!top) { currentBox = undefined; continue; }
      if (messages.length === top.start) messages.push({ from: anchor(), to: anchor(), label: '', kind: 'divider' });
      top.fragment.to = messages.length - 1;
      const branches = top.branches.filter(branch => branch.at > top.start && branch.at <= top.fragment.to);
      if (branches.length) {
        if (['alt', 'par', 'critical'].includes(top.fragment.kind)) {
          top.fragment.elseAt = branches[0]!.at;
          if (branches[0]!.label) top.fragment.elseLabel = branches[0]!.label;
          if (branches.length > 1) top.fragment.elses = branches.slice(1);
        }
      }
      fragments.push(top.fragment);
      continue;
    }
    if ((match = /^note\s+(left of|right of|over)\s+([^:]+):(.*)$/i.exec(statement))) {
      const targets = match[2]!.split(',').map(value => participant(value).id);
      const position = match[1]!.toLowerCase().startsWith('left') ? 'left' : match[1]!.toLowerCase().startsWith('right') ? 'right' : 'over';
      messages.push({ from: targets[0]!, to: targets[targets.length - 1]!, label: cleanLabel(match[3]!), kind: 'note', position });
      continue;
    }
    if ((match = /^(activate|deactivate)\s+(.+)$/.exec(statement))) {
      const id = participant(match[2]!).id;
      const last = [...messages].reverse().find(message => message.kind !== 'note' && message.kind !== 'divider');
      if (last && match[1] === 'activate' && last.to === id) last.activate = true;
      else if (last && match[1] === 'deactivate' && (last.kind === 'return' ? last.from : last.to) === id) last.deactivate = true;
      continue;
    }
    if ((match = seqArrow.exec(statement))) {
      const from = participant(match[1]!).id, to = participant(match[4]!).id;
      const arrow = match[2]!, sign = match[3];
      const message: Message = { from, to, label: cleanLabel(match[5] ?? '') };
      const dotted = arrow.includes('--');
      if (arrow.includes('>>')) message.kind = dotted ? 'return' : 'sync';
      else if (arrow.endsWith(')')) { message.kind = 'async'; if (dotted) message.dashed = true; }
      else if (arrow.endsWith('x')) { message.kind = dotted ? 'return' : 'sync'; message.arrow = 'cross'; }
      else { message.kind = dotted ? 'return' : 'sync'; message.arrow = 'none'; }
      if (arrow.startsWith('<<')) message.bidirectional = true;
      if (pendingCreate.has(to)) { message.kind = 'create'; pendingCreate.delete(to); }
      if (pendingDestroy.has(to)) { message.kind = 'destroy'; pendingDestroy.delete(to); }
      else if (pendingDestroy.has(from)) pendingDestroy.delete(from);
      if (sign === '+') message.activate = true;
      if (sign === '-') message.deactivate = true;
      if (message.kind === 'sync' && !message.arrow && !message.bidirectional) delete message.kind;
      messages.push(message);
      continue;
    }
    if ((match = /^(?:links?|properties|details)\s+/.exec(statement))) continue;
    warnings.push(`时序图未识别：${statement.slice(0, 60)}`);
  }
  while (open.length) {
    const top = open.pop()!;
    if (messages.length > top.start) { top.fragment.to = messages.length - 1; fragments.push(top.fragment); }
    warnings.push(`时序片段 ${top.fragment.kind} 缺少 end，已自动闭合`);
  }
  if (!participants.length) participant('系统');
  if (!messages.length) messages.push({ from: participants[0]!.id, to: participants[0]!.id, label: '（空）', kind: 'note', position: 'over' });
  return {
    version: 1, type: 'sequence', title: titleLine ?? title, layout: { autonumber },
    participants, messages,
    ...(fragments.length ? { fragments: fragments.sort((a, b) => a.from - b.from || b.to - a.to) } : {}),
    ...(boxes.filter(box => box.participants.length).length ? { boxes: boxes.filter(box => box.participants.length) } : {}),
  };
}

// ---------------------------------------------------------------- state

function parseState(lines: string[], warnings: string[], title: string): DiagramSpec {
  const ids = new Ids();
  const nodes = new Map<string, DiagramNode>();
  const order: string[] = [];
  const edges: DiagramEdge[] = [];
  const groups: DiagramGroup[] = [];
  const stack: string[] = [];
  const classes = new Map<string, Partial<Theme>>();
  const pendingClasses: [string, string][] = [];
  let dir: 'TB' | 'LR' | undefined;
  let noteCount = 0;
  const entries = new Map<string, string>(), exits = new Map<string, string>();
  let noteBuffer: { target: string; position: string; lines: string[] } | undefined;
  const scope = () => stack[stack.length - 1];
  const node = (raw: string, init?: Partial<DiagramNode>): DiagramNode => {
    const name = raw.trim();
    const composite = compositeAlias.get(name);
    if (composite && !init) return { id: composite, label: name };
    let item = nodes.get(name);
    if (!item) {
      item = { id: ids.get(name), label: name, ...(scope() ? { group: scope() } : {}), ...init };
      nodes.set(name, item);
      order.push(name);
    } else if (init) Object.assign(item, init);
    return item;
  };
  const terminal = (role: 'start' | 'end'): DiagramNode => node(`__${role}${scope() ? `_${scope()}` : ''}`, { label: role === 'start' ? '开始' : '结束', kind: role });
  const addNote = (target: string, position: string, text: string): void => {
    const item = node(`__note_${++noteCount}`, { label: text, kind: 'note' });
    const host = node(target);
    edges.push(position === 'left' ? { from: item.id, to: host.id, kind: 'association', dashed: true, arrow: 'none' } : { from: host.id, to: item.id, kind: 'association', dashed: true, arrow: 'none' });
  };
  for (const original of lines) {
    const statement = stripComment(original);
    if (noteBuffer) {
      if (/^end\s*note$/i.test(statement)) { addNote(noteBuffer.target, noteBuffer.position, noteBuffer.lines.join('\n')); noteBuffer = undefined; }
      else noteBuffer.lines.push(original.trim());
      continue;
    }
    if (!statement) continue;
    let match: RegExpExecArray | null;
    if ((match = /^direction\s+(\w+)$/.exec(statement))) { if (!stack.length) dir = direction(match[1]); continue; }
    if ((match = /^classDef\s+(\S+)\s+(.+)$/.exec(statement))) { classes.set(match[1]!, styleFrom(match[2]!)); continue; }
    if ((match = /^class\s+(\S+)\s+(\S+)$/.exec(statement))) { for (const id of match[1]!.split(',')) pendingClasses.push([id.trim(), match[2]!]); continue; }
    if ((match = /^note\s+(left|right)\s+of\s+(\S+)\s*:\s*(.+)$/i.exec(statement))) { addNote(match[2]!, match[1]!.toLowerCase(), cleanLabel(match[3]!)); continue; }
    if ((match = /^note\s+(left|right)\s+of\s+(\S+)\s*$/i.exec(statement))) { noteBuffer = { target: match[2]!, position: match[1]!.toLowerCase(), lines: [] }; continue; }
    if ((match = /^state\s+"([^"]+)"\s+as\s+(\S+?)\s*(\{)?$/.exec(statement))) {
      const item = node(match[2]!, { label: cleanLabel(match[1]!) });
      if (match[3]) openComposite(match[2]!, item.label);
      continue;
    }
    if ((match = /^state\s+(\S+?)\s*<<(choice|fork|join)>>$/.exec(statement))) {
      node(match[1]!, { kind: match[2] === 'choice' ? 'decision' : match[2] as 'fork' | 'join', label: match[1]! });
      continue;
    }
    if ((match = /^state\s+(\S+?)\s*(\{)?$/.exec(statement))) {
      if (match[2]) openComposite(match[1]!, match[1]!);
      else node(match[1]!);
      continue;
    }
    if (statement === '}') { stack.pop(); continue; }
    if (statement === '--') continue;
    if ((match = /^(\S+)\s*-->\s*(\S+?)\s*(?::\s*(.*))?$/.exec(statement))) {
      // Inside a composite state, [*] marks its entry / exit instead of drawing extra terminals.
      if (scope() && (match[1] === '[*]' || match[2] === '[*]')) {
        if (match[1] === '[*]' && match[2] !== '[*]') entries.set(scope()!, node(stripClass(match[2]!, pendingClasses)).id);
        if (match[2] === '[*]' && match[1] !== '[*]') exits.set(scope()!, node(stripClass(match[1]!, pendingClasses)).id);
        continue;
      }
      const from = match[1] === '[*]' ? terminal('start') : node(stripClass(match[1]!, pendingClasses));
      const to = match[2] === '[*]' ? terminal('end') : node(stripClass(match[2]!, pendingClasses));
      edges.push({ from: from.id, to: to.id, ...(match[3] ? { label: cleanLabel(match[3]) } : {}) });
      continue;
    }
    if ((match = /^([^\s:]+)\s*:\s*(.+)$/.exec(statement))) {
      const existing = nodes.get(match[1]!);
      const text = cleanLabel(match[2]!);
      if (!existing || existing.label === match[1]) node(match[1]!, { label: text });
      else existing.detail = existing.detail ? `${existing.detail}\n${text}` : text;
      continue;
    }
    if (/^(?:scale|hide|accTitle|accDescr|title)\b/.test(statement)) continue;
    if (/^[\p{L}\p{N}_]+$/u.test(statement)) { node(statement); continue; }
    warnings.push(`状态图未识别：${statement.slice(0, 60)}`);
  }
  function openComposite(raw: string, label: string): void {
    const existing = nodes.get(raw);
    if (existing) { nodes.delete(raw); order.splice(order.indexOf(raw), 1); }
    const id = ids.get(`group:${raw}`);
    groups.push({ id, label, ...(scope() ? { parent: scope() } : {}) });
    compositeAlias.set(raw, id);
    stack.push(id);
  }
  for (const [raw, name] of pendingClasses) { const item = nodes.get(raw); const style = classes.get(name); if (item && style) item.style = { ...style, ...item.style }; }
  // Transitions that target a composite state connect to its inner start / first member.
  const nodeIds = new Set([...nodes.values()].map(item => item.id));
  const members = (groupId: string) => [...nodes.values()].filter(item => item.group === groupId);
  const entry = (groupId: string) => entries.get(groupId) ?? members(groupId)[0]?.id;
  const exit = (groupId: string) => exits.get(groupId) ?? members(groupId).at(-1)?.id;
  const groupOf = (id: string) => groups.some(group => group.id === id) ? id : compositeAlias.get(id) ?? id;
  const resolved = edges.flatMap(edge => {
    const from = nodeIds.has(edge.from) ? edge.from : exit(groupOf(edge.from));
    const to = nodeIds.has(edge.to) ? edge.to : entry(groupOf(edge.to));
    return from && to ? [{ ...edge, from, to }] : [];
  });
  compositeAlias.clear();
  if (!order.length) node('状态');
  const used = new Set<string>();
  for (const item of nodes.values()) { let id = item.group; while (id && !used.has(id)) { used.add(id); id = groups.find(group => group.id === id)?.parent; } }
  return {
    version: 1, type: 'state', title, ...(dir ? { direction: dir } : {}),
    nodes: order.map(raw => nodes.get(raw)!), edges: resolved,
    ...(groups.some(group => used.has(group.id)) ? { groups: groups.filter(group => used.has(group.id)) } : {}),
  };
}
const compositeAlias = new Map<string, string>();
function stripClass(raw: string, pending: [string, string][]): string {
  const match = /^(.+?):::([\w-]+)$/.exec(raw);
  if (!match) return raw;
  pending.push([match[1]!, match[2]!]);
  return match[1]!;
}

// ---------------------------------------------------------------- class

const relation = /^(\S+?)\s*(?:"([^"]*)")?\s*(<\|--|<\|\.\.|\*--|o--|<--|<\.\.|--\|>|\.\.\|>|--\*|--o|-->|\.\.>|--|\.\.)\s*(?:"([^"]*)")?\s*(\S+?)\s*(?::\s*(.*))?$/;

function parseClass(lines: string[], warnings: string[], title: string): DiagramSpec {
  const ids = new Ids();
  const nodes = new Map<string, DiagramNode>();
  const order: string[] = [];
  const edges: DiagramEdge[] = [];
  const groups: DiagramGroup[] = [];
  let namespace: string | undefined;
  let body: DiagramNode | undefined;
  let dir: 'TB' | 'LR' | undefined;
  let notes = 0;
  const generic = (value: string) => value.replace(/~([^~]+)~/g, '<$1>');
  const node = (raw: string): DiagramNode => {
    const name = raw.trim().replace(/~[^~]+~$/, '');
    let item = nodes.get(name);
    if (!item) {
      item = { id: ids.get(name), label: generic(raw.trim()), ...(namespace ? { group: namespace } : {}) };
      nodes.set(name, item);
      order.push(name);
    }
    return item;
  };
  const member = (item: DiagramNode, text: string): void => {
    const value = text.trim();
    if (!value) return;
    const annotation = /^<<(.+)>>$/.exec(value);
    if (annotation) { applyAnnotation(item, annotation[1]!); return; }
    const clean = generic(value).replace(/\$$|\*$/, '');
    if (/\(.*\)/.test(value)) (item.operations ??= []).push(clean);
    else (item.attributes ??= []).push(clean);
  };
  for (const original of lines) {
    const statement = stripComment(original);
    if (!statement) continue;
    let match: RegExpExecArray | null;
    if (body) {
      if (statement === '}') { body = undefined; continue; }
      member(body, statement);
      continue;
    }
    if ((match = /^direction\s+(\w+)$/.exec(statement))) { dir = direction(match[1]); continue; }
    if ((match = /^namespace\s+(\S+)\s*\{$/.exec(statement))) {
      namespace = ids.get(`ns:${match[1]}`);
      groups.push({ id: namespace, label: match[1]!, kind: 'package' });
      continue;
    }
    if (statement === '}' && namespace) { namespace = undefined; continue; }
    if ((match = /^class\s+([^\s{[]+)(?:\["([^"]*)"\])?\s*(?::::([\w-]+))?\s*(\{)?\s*(\})?$/.exec(statement))) {
      const item = node(match[1]!);
      if (match[2]) item.label = cleanLabel(match[2]);
      if (match[4] && !match[5]) body = item;
      continue;
    }
    if ((match = /^<<(.+)>>\s+(\S+)$/.exec(statement))) { applyAnnotation(node(match[2]!), match[1]!); continue; }
    if ((match = /^note\s+for\s+(\S+)\s+"([^"]*)"$/.exec(statement))) {
      const note = node(`__note_${++notes}`);
      Object.assign(note, { label: cleanLabel(match[2]!), kind: 'note' });
      edges.push({ from: note.id, to: node(match[1]!).id, kind: 'association', dashed: true, arrow: 'none' });
      continue;
    }
    if ((match = /^note\s+"([^"]*)"$/.exec(statement))) { Object.assign(node(`__note_${++notes}`), { label: cleanLabel(match[1]!), kind: 'note' }); continue; }
    if ((match = relation.exec(statement))) {
      const [, a, ca, op, cb, b, label] = match as unknown as [string, string, string | undefined, string, string | undefined, string, string | undefined];
      const left = node(a), right = node(b);
      let edge: DiagramEdge;
      const swap = (kind: DiagramEdge['kind'], extra: Partial<DiagramEdge> = {}): DiagramEdge => ({ from: right.id, to: left.id, kind, ...(cb ? { fromLabel: cb } : {}), ...(ca ? { toLabel: ca } : {}), ...extra });
      const keep = (kind: DiagramEdge['kind'], extra: Partial<DiagramEdge> = {}): DiagramEdge => ({ from: left.id, to: right.id, kind, ...(ca ? { fromLabel: ca } : {}), ...(cb ? { toLabel: cb } : {}), ...extra });
      switch (op) {
        case '<|--': edge = swap('inheritance'); break;
        case '<|..': edge = swap('realization'); break;
        case '--|>': edge = keep('inheritance'); break;
        case '..|>': edge = keep('realization'); break;
        case '*--': edge = keep('composition'); break;
        case '--*': edge = swap('composition'); break;
        case 'o--': edge = keep('aggregation'); break;
        case '--o': edge = swap('aggregation'); break;
        case '-->': edge = keep('association', { arrow: 'open' }); break;
        case '<--': edge = swap('association', { arrow: 'open' }); break;
        case '..>': edge = keep('dependency'); break;
        case '<..': edge = swap('dependency'); break;
        case '..': edge = keep('association', { dashed: true }); break;
        default: edge = keep('association');
      }
      if (label) edge.label = cleanLabel(label);
      edges.push(edge);
      continue;
    }
    if ((match = /^([^\s:]+)\s*:\s*(.+)$/.exec(statement))) { member(node(match[1]!), match[2]!); continue; }
    if (/^(?:classDef|style|cssClass|click|link|callback|accTitle|accDescr|title)\b/.test(statement)) continue;
    warnings.push(`类图未识别：${statement.slice(0, 60)}`);
  }
  if (!order.length) node('类');
  return {
    version: 1, type: 'class', title, ...(dir ? { direction: dir } : {}),
    nodes: order.map(raw => nodes.get(raw)!), edges,
    ...(groups.length ? { groups: groups.filter(group => [...nodes.values()].some(item => item.group === group.id)) } : {}),
  };
}
function applyAnnotation(item: DiagramNode, annotation: string): void {
  const value = annotation.trim();
  if (value.toLowerCase() === 'interface') item.kind = 'interface';
  else item.stereotype = value;
}
