import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkLabel, ElkNode } from 'elkjs/lib/elk-api';
import type { DiagramEdge, DiagramGroup, DiagramNode, DiagramSpec, RenderedDiagram, Theme } from './types';
import { esc, frame, text } from './svg';

type Kind = NonNullable<DiagramNode['kind']>;
type Side = 'left' | 'right' | 'top' | 'bottom';
interface Point { x: number; y: number }
interface Rect { x: number; y: number; width: number; height: number }
interface NodeRef {
  id: string;
  node: DiagramNode;
  theme: Theme;
  kind: Kind;
  width: number;
  height: number;
  header: number;
  attributes: string;
  operations: string;
  attributeHeight: number;
  operationHeight: number;
}
interface NodeBox extends Rect { ref: NodeRef; caption?: LabelBox }
interface ContainerRef {
  id: string;
  label: string;
  kind: 'lane' | 'boundary' | 'package' | 'node';
  originalId: string;
  header: number;
  lane?: string;
}
interface ContainerBox extends Rect { ref: ContainerRef; depth: number }
interface EdgeRef { id: string; edge: DiagramEdge; labels: { id: string; value: string; role: 'main' | 'from' | 'to'; width: number; height: number; size: number }[] }
interface Route { ref: EdgeRef; paths: Point[][]; labels: Map<string, Point> }
interface LabelBox extends Rect { value: string; size: number }
interface LayoutResult { nodes: NodeBox[]; containers: ContainerBox[]; routes: Route[]; width: number; height: number }

let graphNumber = 0;
let layoutEngine: InstanceType<typeof ELK> | undefined;

function numeric(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function paint(value: string, fallback: string): string {
  return /^(?:#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)|[a-z]+)$/i.test(value.trim()) ? value.trim() : fallback;
}

function cleanTheme(theme: Theme): Theme {
  return {
    ...theme,
    background: paint(theme.background, '#ffffff'), surface: paint(theme.surface, '#ffffff'),
    text: paint(theme.text, '#202830'), muted: paint(theme.muted, '#687580'),
    primary: paint(theme.primary, '#416e87'), secondary: paint(theme.secondary, '#a4b6c0'),
    border: paint(theme.border, '#a4b6c0'),
  };
}

function measure(label: string, size: number): { width: number; height: number; lines: number } {
  const lines = label.replace(/\r\n?/g, '\n').split('\n');
  let width = 0;
  for (const line of lines) {
    let units = 0;
    for (const character of line) {
      if (/\p{Mark}/u.test(character)) continue;
      if (/[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]|\p{Extended_Pictographic}/u.test(character)) units += 1;
      else if (/[MWmw@#%&]/.test(character)) units += 1.05;
      else if (character === '\t') units += 2.88;
      else units += 0.72;
    }
    width = Math.max(width, units * size);
  }
  return { width: Math.ceil(width), height: lines.length * size * 1.4, lines: lines.length };
}

function createNode(node: DiagramNode, index: number, spec: DiagramSpec, base: Theme): NodeRef {
  const theme = cleanTheme({ ...base, ...node.style });
  const defaults: Partial<Record<DiagramSpec['type'], Kind>> = {
    class: 'class', state: 'state', usecase: 'usecase', component: 'component', package: 'package',
    architecture: 'component', module: 'component', deployment: 'server', logical: 'component',
    development: 'component', physical: 'server',
  };
  const kind = node.kind ?? defaults[spec.type] ?? 'action';
  const size = theme.fontSize;
  const smaller = Math.max(10, size - 2);
  const label = measure(node.label, size);
  const detail = node.detail ? measure(node.detail, smaller) : { width: 0, height: 0 };
  const stereotype = node.stereotype || (kind === 'interface' ? 'interface' : '');
  const tag = stereotype ? measure(`«${stereotype}»`, smaller) : { width: 0, height: 0 };
  const contentWidth = Math.max(label.width, detail.width, tag.width);
  const contentHeight = label.height + (node.detail ? detail.height + 6 : 0) + (stereotype ? tag.height + 4 : 0);
  const attributes = (node.attributes ?? []).join('\n');
  const operations = (node.operations ?? []).join('\n');
  const attributeSize = attributes ? measure(attributes, smaller) : { width: 0, height: 0 };
  const operationSize = operations ? measure(operations, smaller) : { width: 0, height: 0 };
  let width = Math.max(theme.nodeWidth, contentWidth + 36);
  let height = Math.max(theme.nodeHeight, contentHeight + 28);
  let header = 0;
  let attributeHeight = 0;
  let operationHeight = 0;
  if (kind === 'class' || kind === 'interface') {
    header = label.height + 20 + (stereotype ? tag.height + 4 : 0);
    attributeHeight = Math.max(24, attributeSize.height + 16);
    operationHeight = Math.max(24, operationSize.height + 16);
    width = Math.max(theme.nodeWidth, contentWidth + 32, attributeSize.width + 28, operationSize.width + 28);
    height = header + attributeHeight + operationHeight + (node.detail ? detail.height + 16 : 0);
  } else if (kind === 'state' && node.detail) {
    header = label.height + 20 + (stereotype ? tag.height + 4 : 0);
    height = Math.max(theme.nodeHeight, header + detail.height + 20);
  } else if (kind === 'decision') {
    width = Math.max(theme.nodeWidth, contentWidth * 2 + 40);
    height = Math.max(theme.nodeHeight + 18, contentHeight * 2 + 28);
  } else if (kind === 'actor') {
    width = Math.max(88, contentWidth + 24);
    height = 86 + contentHeight + 12;
  } else if (kind === 'usecase') {
    width = Math.max(theme.nodeWidth, contentWidth * 1.35 + 32);
    height = Math.max(theme.nodeHeight, contentHeight * 1.6 + 24);
  } else if (kind === 'start' || kind === 'end') {
    width = height = 32;
  } else if (kind === 'fork' || kind === 'join') {
    width = spec.direction === 'LR' ? 12 : Math.max(88, theme.nodeWidth * 0.6);
    height = spec.direction === 'LR' ? Math.max(88, theme.nodeWidth * 0.6) : 12;
  } else if (kind === 'component' || kind === 'server') {
    width += 28;
    height += 14;
  } else if (kind === 'database' || kind === 'queue') {
    width += 16;
    height += 22;
  } else if (kind === 'package') {
    height += 24;
  } else if (kind === 'note') {
    width += 12;
    height += 8;
  }
  return { id: `n${index}`, node, kind, theme, width: Math.ceil(width / 4) * 4, height: Math.ceil(height / 4) * 4, header, attributes, operations, attributeHeight, operationHeight };
}

function edgeKind(edge: DiagramEdge, type: DiagramSpec['type']): NonNullable<DiagramEdge['kind']> {
  return edge.kind ?? (type === 'class' || type === 'usecase' ? 'association' : 'flow');
}

function createEdge(edge: DiagramEdge, index: number, theme: Theme, type: DiagramSpec['type']): EdgeRef {
  const id = `e${index}`;
  const kind = edgeKind(edge, type);
  let label = edge.label ?? '';
  if (kind === 'include' || kind === 'extend') {
    const tag = `«${kind}»`;
    if (!label.includes(tag) && !label.includes(`<<${kind}>>`)) label = label ? `${tag}\n${label}` : tag;
  }
  const labels: EdgeRef['labels'] = [];
  for (const [role, value] of [['main', label], ['from', edge.fromLabel], ['to', edge.toLabel]] as const) {
    if (!value) continue;
    const size = Math.max(10, theme.fontSize - (role === 'main' ? 1 : 2));
    const metrics = measure(value, size);
    labels.push({ id: `${id}-${role}`, value, role, size, width: metrics.width + 14, height: metrics.height + 10 });
  }
  return { id, edge, labels };
}

function layoutOptions(theme: Theme, direction: 'TB' | 'LR', padding: string): Record<string, string> {
  return {
    'elk.algorithm': 'layered', 'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
    'elk.edgeRouting': 'ORTHOGONAL', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': padding, 'elk.spacing.nodeNode': String(Math.max(28, theme.gap)),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.max(52, theme.gap * 1.6)),
    'elk.spacing.edgeNode': '18', 'elk.spacing.edgeEdge': '14', 'elk.spacing.edgeLabel': '10',
    'elk.spacing.labelNode': '12', 'elk.spacing.labelLabel': '8',
    'elk.layered.spacing.edgeNodeBetweenLayers': '20', 'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
    'elk.layered.nodePlacement.favorStraightEdges': 'true',
    'elk.layered.mergeEdges': 'false', 'elk.separateConnectedComponents': 'true',
    'elk.spacing.componentComponent': String(Math.max(48, theme.gap * 1.5)),
    'elk.edgeLabels.inline': 'false', 'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
  };
}

function buildGraph(
  rootId: string, refs: NodeRef[], groups: DiagramGroup[], edges: EdgeRef[],
  spec: DiagramSpec, theme: Theme, containers: Map<string, ContainerRef>, lane?: { id: string; label: string },
  additionalGroups?: string[],
): ElkNode {
  const direction = spec.direction ?? 'TB';
  const groupById = new Map(groups.map(group => [group.id, group]));
  const included = new Set<string>();
  const memberships = [...refs.map(ref => ref.node.group), ...(additionalGroups ?? [])];
  for (const membership of memberships) {
    let group = membership;
    while (group && groupById.has(group) && !included.has(group)) {
      included.add(group);
      group = groupById.get(group)?.parent;
    }
  }
  // With no lane projection, retain every explicitly declared (including empty) container.
  if (!lane) for (const group of groups) included.add(group.id);
  const root: ElkNode = { id: rootId, children: [], edges: [] };
  const header = lane ? (direction === 'TB' ? measure(lane.label, theme.fontSize).height + 24 : measure(lane.label, theme.fontSize).width + 32) : 0;
  const padding = lane
    ? (direction === 'TB' ? `[top=${header + 24},left=24,bottom=28,right=24]` : `[top=24,left=${header + 24},bottom=24,right=28]`)
    : '[top=24,left=24,bottom=24,right=24]';
  root.layoutOptions = layoutOptions(theme, direction, padding);
  if (lane) {
    root.width = direction === 'TB' ? Math.max(240, measure(lane.label, theme.fontSize).width + 36) : 260 + header;
    root.height = direction === 'TB' ? 180 + header : Math.max(180, measure(lane.label, theme.fontSize).height + 28);
    root.layoutOptions['elk.nodeSize.constraints'] = '[MINIMUM_SIZE]';
    root.layoutOptions['elk.nodeSize.minimum'] = `(${root.width},${root.height})`;
    containers.set(rootId, { id: rootId, label: lane.label, originalId: lane.id, kind: 'lane', header, lane: lane.id });
  }
  const groupNodes = new Map<string, ElkNode>();
  groups.forEach((group, index) => {
    if (!included.has(group.id)) return;
    const id = `${rootId}-g${index}`;
    const labelSize = measure(group.label, theme.fontSize);
    const groupHeader = labelSize.height + (group.kind === 'node' ? 40 : 22);
    const width = Math.max(180, labelSize.width + 48);
    const height = groupHeader + 64;
    const options = layoutOptions(theme, direction, `[top=${groupHeader + 20},left=24,bottom=24,right=24]`);
    options['elk.nodeSize.constraints'] = '[MINIMUM_SIZE]';
    options['elk.nodeSize.minimum'] = `(${width},${height})`;
    groupNodes.set(group.id, { id, width, height, layoutOptions: options, children: [] });
    containers.set(id, { id, label: group.label, kind: group.kind ?? 'boundary', originalId: group.id, header: groupHeader, lane: lane?.id });
  });
  for (const group of groups) {
    const child = groupNodes.get(group.id);
    if (!child) continue;
    const parent = group.parent ? groupNodes.get(group.parent) : undefined;
    (parent?.children ?? root.children)!.push(child);
  }
  const nodeIds = new Map<string, string>();
  for (const ref of refs) {
    nodeIds.set(ref.node.id, ref.id);
    const child: ElkNode = { id: ref.id, width: ref.width, height: ref.height };
    if (['start', 'end', 'fork', 'join'].includes(ref.kind)) {
      const caption = [ref.node.stereotype ? `«${ref.node.stereotype}»` : '', ref.node.label, ref.node.detail].filter(Boolean).join('\n');
      const size = Math.max(10, ref.theme.fontSize - 2);
      const metrics = measure(caption, size);
      const placement = direction === 'TB' ? '[H_RIGHT,V_CENTER,OUTSIDE]' : '[H_CENTER,V_BOTTOM,OUTSIDE]';
      child.layoutOptions = { 'elk.nodeLabels.placement': placement, 'elk.spacing.labelNode': '10' };
      child.labels = [{ id: `${ref.id}-caption`, text: caption, width: metrics.width + 4, height: metrics.height + 4, layoutOptions: { 'elk.nodeLabels.placement': placement } }];
    }
    const parent = ref.node.group ? groupNodes.get(ref.node.group) : undefined;
    (parent?.children ?? root.children)!.push(child);
  }
  for (const ref of edges) {
    const source = nodeIds.get(ref.edge.from);
    const target = nodeIds.get(ref.edge.to);
    if (!source || !target) continue;
    const labels: ElkLabel[] = ref.labels.map(label => ({
      id: label.id, text: label.value, width: label.width, height: label.height,
      layoutOptions: { 'elk.edgeLabels.placement': label.role === 'from' ? 'TAIL' : label.role === 'to' ? 'HEAD' : 'CENTER' },
    }));
    root.edges!.push({ id: ref.id, sources: [source], targets: [target], labels });
  }
  return root;
}

function collectLayout(
  root: ElkNode, origin: Point, refs: Map<string, NodeRef>, containerRefs: Map<string, ContainerRef>, edgeRefs: Map<string, EdgeRef>,
): LayoutResult {
  const nodes: NodeBox[] = [];
  const containers: ContainerBox[] = [];
  const routes: Route[] = [];
  const positions = new Map<string, Point>();
  const owners: { edge: ElkExtendedEdge; origin: Point }[] = [];
  function visit(node: ElkNode, parent: Point, depth: number): void {
    const position = { x: parent.x + (node.x ?? 0), y: parent.y + (node.y ?? 0) };
    positions.set(node.id, position);
    const ref = refs.get(node.id);
    const container = containerRefs.get(node.id);
    if (ref) {
      const label = node.labels?.find(candidate => candidate.id === `${ref.id}-caption`);
      const caption = label ? {
        x: label.x ?? ref.width + 10, y: label.y ?? 0, width: label.width ?? 0, height: label.height ?? 0,
        value: label.text ?? ref.node.label, size: Math.max(10, ref.theme.fontSize - 2),
      } : undefined;
      nodes.push({ ...position, width: node.width ?? ref.width, height: node.height ?? ref.height, ref, caption });
    }
    if (container) containers.push({ ...position, width: node.width ?? 200, height: node.height ?? 140, ref: container, depth });
    for (const edge of node.edges ?? []) owners.push({ edge, origin: position });
    for (const child of node.children ?? []) visit(child, position, depth + 1);
  }
  visit(root, { x: origin.x - (root.x ?? 0), y: origin.y - (root.y ?? 0) }, 0);
  for (const { edge, origin: owner } of owners) {
    const ref = edgeRefs.get(edge.id);
    if (!ref) continue;
    const containerId = (edge as ElkExtendedEdge & { container?: string }).container;
    const offset = (containerId && positions.get(containerId)) || owner;
    const sections = edge.sections ?? [];
    const ordered = [...sections];
    if (ordered.length > 1) {
      const first = ordered.find(section => !section.incomingSections?.length);
      if (first) {
        ordered.length = 0;
        let section: (typeof sections)[number] | undefined = first;
        while (section && !ordered.includes(section)) {
          ordered.push(section);
          const nextId: string | undefined = section.outgoingSections?.[0];
          section = nextId ? sections.find(candidate => candidate.id === nextId) : undefined;
        }
        for (const candidate of sections) if (!ordered.includes(candidate)) ordered.push(candidate);
      }
    }
    const paths = ordered.map(section => [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(point => ({ x: point.x + offset.x, y: point.y + offset.y })));
    const labels = new Map<string, Point>();
    for (const label of edge.labels ?? []) if (label.id && label.x != null && label.y != null) labels.set(label.id, { x: label.x + offset.x, y: label.y + offset.y });
    if (paths.length) routes.push({ ref, paths, labels });
  }
  return { nodes, containers, routes, width: root.width ?? 240, height: root.height ?? 160 };
}

function intersects(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.width + margin && a.x + a.width + margin > b.x && a.y < b.y + b.height + margin && a.y + a.height + margin > b.y;
}

function obstacleRouter(start: Point, end: Point, obstacles: Rect[], used: Point[][]): Point[] | undefined {
  const xs = new Set<number>([start.x, end.x]);
  const ys = new Set<number>([start.y, end.y]);
  let left = Math.min(start.x, end.x), right = Math.max(start.x, end.x);
  let top = Math.min(start.y, end.y), bottom = Math.max(start.y, end.y);
  for (const box of obstacles) {
    xs.add(box.x); xs.add(box.x + box.width);
    ys.add(box.y); ys.add(box.y + box.height);
    left = Math.min(left, box.x); right = Math.max(right, box.x + box.width);
    top = Math.min(top, box.y); bottom = Math.max(bottom, box.y + box.height);
  }
  for (const path of used) for (let index = 1; index < path.length; index++) {
    const a = path[index - 1], b = path[index];
    if (Math.abs(a.x - b.x) < 0.01) { xs.add(a.x - 12); xs.add(a.x + 12); }
    else { ys.add(a.y - 12); ys.add(a.y + 12); }
  }
  xs.add(left - 36); xs.add(right + 36); ys.add(top - 36); ys.add(bottom + 36);
  const columns = [...xs].sort((a, b) => a - b);
  const rows = [...ys].sort((a, b) => a - b);
  const columnsCount = columns.length;
  const vertexCount = columnsCount * rows.length;
  const valid = new Uint8Array(vertexCount);
  for (let row = 0; row < rows.length; row++) for (let column = 0; column < columnsCount; column++) {
    const x = columns[column], y = rows[row];
    valid[row * columnsCount + column] = obstacles.some(box => x > box.x + 0.01 && x < box.x + box.width - 0.01 && y > box.y + 0.01 && y < box.y + box.height - 0.01) ? 0 : 1;
  }
  const startVertex = rows.indexOf(start.y) * columnsCount + columns.indexOf(start.x);
  const endVertex = rows.indexOf(end.y) * columnsCount + columns.indexOf(end.x);
  if (!valid[startVertex] || !valid[endVertex]) return undefined;
  const costs = new Float64Array(vertexCount * 3).fill(Infinity);
  const previous = new Int32Array(vertexCount * 3).fill(-1);
  const heap: { state: number; cost: number; score: number }[] = [];
  function push(item: { state: number; cost: number; score: number }): void {
    heap.push(item);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent].score <= item.score) break;
      heap[index] = heap[parent]; index = parent;
    }
    heap[index] = item;
  }
  costs[startVertex * 3] = 0;
  push({ state: startVertex * 3, cost: 0, score: Math.abs(start.x - end.x) + Math.abs(start.y - end.y) });
  let finish = -1;
  while (heap.length) {
    const current = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (last.score <= heap[child].score) break;
        heap[index] = heap[child]; index = child;
      }
      heap[index] = last;
    }
    if (current.cost !== costs[current.state]) continue;
    const vertex = Math.floor(current.state / 3);
    if (vertex === endVertex) { finish = current.state; break; }
    const column = vertex % columnsCount, row = Math.floor(vertex / columnsCount);
    const a = { x: columns[column], y: rows[row] };
    const neighbors = [column > 0 ? vertex - 1 : -1, column + 1 < columnsCount ? vertex + 1 : -1, row > 0 ? vertex - columnsCount : -1, row + 1 < rows.length ? vertex + columnsCount : -1];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || !valid[neighbor]) continue;
      const b = { x: columns[neighbor % columnsCount], y: rows[Math.floor(neighbor / columnsCount)] };
      const horizontal = a.y === b.y;
      const blocked = obstacles.some(box => horizontal
        ? a.y > box.y + 0.01 && a.y < box.y + box.height - 0.01 && Math.max(a.x, b.x) > box.x + 0.01 && Math.min(a.x, b.x) < box.x + box.width - 0.01
        : a.x > box.x + 0.01 && a.x < box.x + box.width - 0.01 && Math.max(a.y, b.y) > box.y + 0.01 && Math.min(a.y, b.y) < box.y + box.height - 0.01);
      if (blocked) continue;
      let overlap = 0;
      for (const path of used) for (let index = 1; index < path.length; index++) {
        const c = path[index - 1], d = path[index];
        if (horizontal && c.y === d.y && Math.abs(a.y - c.y) < 0.1) overlap += Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
        if (!horizontal && c.x === d.x && Math.abs(a.x - c.x) < 0.1) overlap += Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
      }
      const direction = horizontal ? 1 : 2;
      const state = neighbor * 3 + direction;
      const cost = current.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (current.state % 3 && current.state % 3 !== direction ? 22 : 0) + overlap * 3;
      if (cost >= costs[state]) continue;
      costs[state] = cost; previous[state] = current.state;
      push({ state, cost, score: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y) });
    }
  }
  if (finish < 0) return undefined;
  const result: Point[] = [];
  for (let state = finish; state >= 0; state = previous[state]) {
    const vertex = Math.floor(state / 3);
    result.push({ x: columns[vertex % columnsCount], y: rows[Math.floor(vertex / columnsCount)] });
  }
  result.reverse();
  return simplify(result);
}

function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.001 && Math.abs(last.y - point.y) < 0.001) continue;
    const before = result[result.length - 2];
    if (before && last && ((Math.abs(before.x - last.x) < 0.001 && Math.abs(last.x - point.x) < 0.001) || (Math.abs(before.y - last.y) < 0.001 && Math.abs(last.y - point.y) < 0.001))) result.pop();
    result.push({ ...point });
  }
  return result;
}

function routeBetweenLanes(edges: EdgeRef[], result: LayoutResult, direction: 'TB' | 'LR', theme: Theme): void {
  const byId = new Map(result.nodes.map(box => [box.ref.node.id, box]));
  const obstacles: Rect[] = result.nodes.map(box => ({ x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 }));
  for (const box of result.nodes) if (box.caption) obstacles.push({ x: box.x + box.caption.x - 6, y: box.y + box.caption.y - 6, width: box.caption.width + 12, height: box.caption.height + 12 });
  for (const box of result.containers) {
    if (box.ref.kind === 'lane' && direction === 'LR') obstacles.push({ x: box.x + 3, y: box.y + 3, width: box.ref.header - 3, height: box.height - 6 });
    else obstacles.push({ x: box.x + 3, y: box.y + 3, width: box.width - 6, height: box.ref.header - 3 });
  }
  const counts = new Map<string, number>();
  const assignments = edges.map(ref => {
    const source = byId.get(ref.edge.from)!;
    const target = byId.get(ref.edge.to)!;
    const side: Side = direction === 'TB' ? (source.x < target.x ? 'right' : 'left') : (source.y < target.y ? 'bottom' : 'top');
    const targetSide: Side = side === 'right' ? 'left' : side === 'left' ? 'right' : side === 'bottom' ? 'top' : 'bottom';
    const sourceKey = `${source.ref.id}-${side}`, targetKey = `${target.ref.id}-${targetSide}`;
    counts.set(sourceKey, (counts.get(sourceKey) ?? 0) + 1); counts.set(targetKey, (counts.get(targetKey) ?? 0) + 1);
    return { ref, source, target, side, targetSide, sourceKey, targetKey };
  });
  const seen = new Map<string, number>();
  const used = result.routes.flatMap(route => route.paths);
  for (const item of assignments) {
    const sourceIndex = (seen.get(item.sourceKey) ?? 0) + 1, targetIndex = (seen.get(item.targetKey) ?? 0) + 1;
    seen.set(item.sourceKey, sourceIndex); seen.set(item.targetKey, targetIndex);
    const sourceFraction = sourceIndex / ((counts.get(item.sourceKey) ?? 1) + 1);
    const targetFraction = targetIndex / ((counts.get(item.targetKey) ?? 1) + 1);
    const sides: Side[] = [item.side, ...(['left', 'right', 'top', 'bottom'] as Side[]).filter(side => side !== item.side)];
    const targetSides: Side[] = [item.targetSide, ...(['left', 'right', 'top', 'bottom'] as Side[]).filter(side => side !== item.targetSide)];
    let route: Point[] | undefined;
    for (const side of sides) {
      for (const targetSide of targetSides) {
        const endpoints = [[item.source, side, sourceFraction], [item.target, targetSide, targetFraction]] as const;
        const anchors = endpoints.map(([box, attach, fraction]) => {
          const x = attach === 'left' ? box.x : attach === 'right' ? box.x + box.width : box.x + box.width * fraction;
          const y = attach === 'top' ? box.y : attach === 'bottom' ? box.y + box.height : box.y + box.height * fraction;
          const distance = Math.max(28, theme.lineWidth * 10);
          return { port: { x, y }, stub: { x: x + (attach === 'right' ? distance : attach === 'left' ? -distance : 0), y: y + (attach === 'bottom' ? distance : attach === 'top' ? -distance : 0) } };
        });
        // A stub may cross only its own endpoint's expanded obstacle.
        const clear = anchors.every((anchor, index) => {
          const box = index ? item.target : item.source;
          return !obstacles.some(obstacle => {
            if (Math.abs(obstacle.x - (box.x - 12)) < 0.01 && Math.abs(obstacle.y - (box.y - 12)) < 0.01) return false;
            return anchor.port.y === anchor.stub.y
              ? anchor.port.y > obstacle.y && anchor.port.y < obstacle.y + obstacle.height && Math.max(anchor.port.x, anchor.stub.x) > obstacle.x && Math.min(anchor.port.x, anchor.stub.x) < obstacle.x + obstacle.width
              : anchor.port.x > obstacle.x && anchor.port.x < obstacle.x + obstacle.width && Math.max(anchor.port.y, anchor.stub.y) > obstacle.y && Math.min(anchor.port.y, anchor.stub.y) < obstacle.y + obstacle.height;
          });
        });
        if (!clear) continue;
        const middle = obstacleRouter(anchors[0].stub, anchors[1].stub, obstacles, used);
        if (!middle) continue;
        route = simplify([anchors[0].port, ...middle, anchors[1].port]);
        break;
      }
      if (route) break;
    }
    if (!route) throw new Error(`Unable to route swimlane relationship ${item.ref.edge.from} → ${item.ref.edge.to}.`);
    used.push(route);
    result.routes.push({ ref: item.ref, paths: [route], labels: new Map() });
  }
}

function clipEndpoint(point: Point, neighbor: Point, box: NodeBox): void {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const rx = box.width / 2, ry = box.height / 2;
  const horizontal = Math.abs(point.y - neighbor.y) < 0.01;
  const kind = box.ref.kind;
  if (kind === 'usecase' || kind === 'start' || kind === 'end') {
    if (horizontal) point.x = cx + (neighbor.x < cx ? -1 : 1) * rx * Math.sqrt(Math.max(0, 1 - ((point.y - cy) / ry) ** 2));
    else point.y = cy + (neighbor.y < cy ? -1 : 1) * ry * Math.sqrt(Math.max(0, 1 - ((point.x - cx) / rx) ** 2));
  } else if (kind === 'decision') {
    if (horizontal) point.x = cx + (neighbor.x < cx ? -1 : 1) * rx * Math.max(0, 1 - Math.abs(point.y - cy) / ry);
    else point.y = cy + (neighbor.y < cy ? -1 : 1) * ry * Math.max(0, 1 - Math.abs(point.x - cx) / rx);
  } else if (kind === 'actor' && horizontal) {
    const localY = point.y - box.y;
    let halfWidth = box.width / 2 - 12;
    if (localY <= 24) halfWidth = 11 * Math.sqrt(Math.max(0, 1 - ((localY - 13) / 11) ** 2));
    else if (Math.abs(localY - 35) < 1) halfWidth = 25;
    else if (localY <= 54) halfWidth = 0;
    else if (localY <= 78) halfWidth = (localY - 54) * 21 / 24;
    point.x = cx + (neighbor.x < cx ? -1 : 1) * halfWidth;
  } else if (kind === 'actor' && neighbor.y < box.y && Math.abs(point.x - cx) <= 11) {
    point.y = box.y + 13 - 11 * Math.sqrt(Math.max(0, 1 - ((point.x - cx) / 11) ** 2));
  } else if (kind === 'database' && !horizontal) {
    point.y = neighbor.y < cy ? box.y + 10 - 10 * Math.sqrt(Math.max(0, 1 - ((point.x - cx) / rx) ** 2)) : box.y + box.height - 10 + 10 * Math.sqrt(Math.max(0, 1 - ((point.x - cx) / rx) ** 2));
  }
}

function roundedPath(points: Point[]): string {
  const path = simplify(points);
  if (!path.length) return '';
  let value = `M${numeric(path[0].x)} ${numeric(path[0].y)}`;
  for (let index = 1; index < path.length - 1; index++) {
    const before = path[index - 1], corner = path[index], after = path[index + 1];
    const incoming = Math.hypot(corner.x - before.x, corner.y - before.y), outgoing = Math.hypot(after.x - corner.x, after.y - corner.y);
    const radius = Math.min(8, incoming / 2, outgoing / 2);
    if (radius < 0.01) continue;
    const start = { x: corner.x + (before.x - corner.x) * radius / incoming, y: corner.y + (before.y - corner.y) * radius / incoming };
    const end = { x: corner.x + (after.x - corner.x) * radius / outgoing, y: corner.y + (after.y - corner.y) * radius / outgoing };
    value += ` L${numeric(start.x)} ${numeric(start.y)} Q${numeric(corner.x)} ${numeric(corner.y)} ${numeric(end.x)} ${numeric(end.y)}`;
  }
  const last = path[path.length - 1];
  return `${value} L${numeric(last.x)} ${numeric(last.y)}`;
}

function markerDefinitions(prefix: string, theme: Theme): string {
  const stroke = esc(theme.primary), background = esc(theme.background), solid = esc(theme.primary);
  return `<defs><marker id="${prefix}-arrow" viewBox="-1 -1 14 14" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 Z" fill="${stroke}"/></marker><marker id="${prefix}-open" viewBox="-1 -1 14 14" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11" fill="none" stroke="${stroke}" stroke-width="1.6"/></marker><marker id="${prefix}-triangle" viewBox="-2 -2 18 16" refX="13" refY="6" markerWidth="18" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 0 L13 6 L1 12 Z" fill="${background}" stroke="${stroke}" stroke-width="1.5"/></marker><marker id="${prefix}-aggregation" viewBox="-2 -2 24 16" refX="20" refY="6" markerWidth="24" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 6 L10 0 L20 6 L10 12 Z" fill="${background}" stroke="${stroke}" stroke-width="1.5"/></marker><marker id="${prefix}-composition" viewBox="-2 -2 24 16" refX="20" refY="6" markerWidth="24" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 6 L10 0 L20 6 L10 12 Z" fill="${solid}" stroke="${solid}" stroke-width="1.5"/></marker></defs>`;
}

function renderContainer(box: ContainerBox, theme: Theme, direction: 'TB' | 'LR'): string {
  const { x, y, width: w, height: h, ref } = box;
  const border = esc(theme.border), surface = esc(theme.surface), primary = esc(theme.primary);
  let shape = '';
  let labelX = x + 16, labelY = y + theme.fontSize + 10;
  if (ref.kind === 'lane') {
    shape = `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(h)}" fill="${surface}" stroke="${border}" stroke-width="${numeric(theme.lineWidth)}"/>`;
    if (direction === 'TB') shape += `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(ref.header)}" fill="${primary}" fill-opacity="0.08"/><path d="M${numeric(x)} ${numeric(y + ref.header)} H${numeric(x + w)}" stroke="${border}"/>`;
    else shape += `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(ref.header)}" height="${numeric(h)}" fill="${primary}" fill-opacity="0.08"/><path d="M${numeric(x + ref.header)} ${numeric(y)} V${numeric(y + h)}" stroke="${border}"/>`;
  } else if (ref.kind === 'package') {
    const tabWidth = Math.min(w - 24, Math.max(80, measure(ref.label, theme.fontSize).width + 32));
    const tabHeight = ref.header;
    shape = `<path d="M${numeric(x)} ${numeric(y + h)} V${numeric(y)} H${numeric(x + tabWidth)} V${numeric(y + tabHeight)} H${numeric(x + w)} V${numeric(y + h)} Z" fill="${surface}" stroke="${border}" stroke-width="${numeric(theme.lineWidth)}"/><path d="M${numeric(x)} ${numeric(y + tabHeight)} H${numeric(x + tabWidth)}" stroke="${border}"/>`;
  } else if (ref.kind === 'node') {
    shape = `<path d="M${numeric(x)} ${numeric(y + 10)} L${numeric(x + 12)} ${numeric(y)} H${numeric(x + w)} V${numeric(y + h - 10)} L${numeric(x + w - 12)} ${numeric(y + h)} H${numeric(x)} Z" fill="${surface}" stroke="${border}" stroke-width="${numeric(theme.lineWidth)}"/><path d="M${numeric(x)} ${numeric(y + 10)} H${numeric(x + w - 12)} L${numeric(x + w)} ${numeric(y)} M${numeric(x + w - 12)} ${numeric(y + 10)} V${numeric(y + h)}" fill="none" stroke="${border}"/>`;
    shape += text(labelX, y + 26, '«node»', theme, { size: Math.max(10, theme.fontSize - 3), anchor: 'start', fill: theme.muted });
    labelY = y + 28 + theme.fontSize;
  } else {
    shape = `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(h)}" rx="${numeric(theme.radius)}" fill="${surface}" stroke="${border}" stroke-width="${numeric(theme.lineWidth)}" stroke-dasharray="7 5"/>`;
  }
  return `<g class="uml-container uml-${ref.kind}" data-${ref.kind === 'lane' ? 'lane' : 'group'}-id="${esc(ref.originalId)}"${ref.lane && ref.kind !== 'lane' ? ` data-lane-id="${esc(ref.lane)}"` : ''}><title>${esc(ref.label)}</title>${shape}${text(labelX, labelY, ref.label, theme, { anchor: 'start', weight: 650 })}</g>`;
}

function centeredContent(ref: NodeRef, x: number, y: number, width: number, height: number): string {
  const { node, theme, kind } = ref;
  const small = Math.max(10, theme.fontSize - 2);
  const stereotype = node.stereotype || (kind === 'interface' ? 'interface' : '');
  const tagHeight = stereotype ? measure(stereotype, small).height + 4 : 0;
  const labelHeight = measure(node.label, theme.fontSize).height;
  const detailHeight = node.detail ? measure(node.detail, small).height + 6 : 0;
  let top = y + (height - tagHeight - labelHeight - detailHeight) / 2;
  let value = '';
  if (stereotype) {
    value += text(x + width / 2, top + small, `«${stereotype}»`, theme, { size: small, fill: theme.primary });
    top += tagHeight;
  }
  value += text(x + width / 2, top + theme.fontSize, node.label, theme, { weight: 600 });
  if (node.detail) value += text(x + width / 2, top + labelHeight + 6 + small, node.detail, theme, { size: small, fill: theme.muted });
  return value;
}

function renderNode(box: NodeBox, spec: DiagramSpec): string {
  const { x, y, width: w, height: h, ref } = box;
  const { theme, kind, node } = ref;
  const stroke = esc(node.style?.primary && !node.style.border ? theme.primary : theme.border), surface = esc(theme.surface), ink = esc(theme.primary);
  const common = `fill="${surface}" stroke="${stroke}" stroke-width="${numeric(theme.lineWidth)}"`;
  const rect = `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(h)}"`;
  let shape = '', content = '';
  if (kind === 'start' || kind === 'end') {
    shape = `<circle cx="${numeric(x + w / 2)}" cy="${numeric(y + h / 2)}" r="${numeric(w / 2 - theme.lineWidth / 2)}" fill="${kind === 'start' ? ink : surface}" stroke="${ink}" stroke-width="${numeric(theme.lineWidth)}"/>`;
    if (kind === 'end') shape += `<circle cx="${numeric(x + w / 2)}" cy="${numeric(y + h / 2)}" r="${numeric(w / 2 - 6)}" fill="${ink}"/>`;
  } else if (kind === 'fork' || kind === 'join') {
    shape = `${rect} rx="2" fill="${ink}"/>`;
  } else if (kind === 'decision') {
    shape = `<path d="M${numeric(x + w / 2)} ${numeric(y)} L${numeric(x + w)} ${numeric(y + h / 2)} L${numeric(x + w / 2)} ${numeric(y + h)} L${numeric(x)} ${numeric(y + h / 2)} Z" ${common}/>`;
    content = centeredContent(ref, x + w * 0.16, y + h * 0.16, w * 0.68, h * 0.68);
  } else if (kind === 'usecase') {
    shape = `<ellipse cx="${numeric(x + w / 2)}" cy="${numeric(y + h / 2)}" rx="${numeric(w / 2)}" ry="${numeric(h / 2)}" ${common}/>`;
    content = centeredContent(ref, x, y, w, h);
  } else if (kind === 'actor') {
    const cx = x + w / 2;
    shape = `<g fill="none" stroke="${ink}" stroke-width="${numeric(Math.max(1.5, theme.lineWidth))}" stroke-linecap="round"><circle cx="${numeric(cx)}" cy="${numeric(y + 13)}" r="11" fill="${surface}"/><path d="M${numeric(cx)} ${numeric(y + 24)} V${numeric(y + 54)} M${numeric(cx - 25)} ${numeric(y + 35)} H${numeric(cx + 25)} M${numeric(cx)} ${numeric(y + 54)} L${numeric(cx - 21)} ${numeric(y + 78)} M${numeric(cx)} ${numeric(y + 54)} L${numeric(cx + 21)} ${numeric(y + 78)}"/></g>`;
    content = centeredContent(ref, x, y + 88, w, h - 88);
  } else if (kind === 'class' || kind === 'interface') {
    shape = `${rect} ${common}/>`;
    shape += `<rect x="${numeric(x + theme.lineWidth)}" y="${numeric(y + theme.lineWidth)}" width="${numeric(w - theme.lineWidth * 2)}" height="${numeric(ref.header - theme.lineWidth)}" fill="${esc(theme.secondary)}" fill-opacity="0.14"/>`;
    const second = y + ref.header + ref.attributeHeight;
    shape += `<path d="M${numeric(x)} ${numeric(y + ref.header)} H${numeric(x + w)} M${numeric(x)} ${numeric(second)} H${numeric(x + w)}${node.detail ? ` M${numeric(x)} ${numeric(second + ref.operationHeight)} H${numeric(x + w)}` : ''}" stroke="${stroke}" stroke-width="${numeric(theme.lineWidth)}"/>`;
    const titleRef = { ...ref, node: { ...node, detail: undefined } };
    content = centeredContent(titleRef, x, y, w, ref.header);
    const size = Math.max(10, theme.fontSize - 2);
    if (ref.attributes) content += text(x + 12, y + ref.header + 8 + size, ref.attributes, theme, { anchor: 'start', size });
    if (ref.operations) content += text(x + 12, second + 8 + size, ref.operations, theme, { anchor: 'start', size });
    if (node.detail) content += text(x + 12, second + ref.operationHeight + 8 + size, node.detail, theme, { anchor: 'start', size, fill: theme.muted });
  } else if (kind === 'database') {
    shape = `<path d="M${numeric(x)} ${numeric(y + 10)} A${numeric(w / 2)} 10 0 0 1 ${numeric(x + w)} ${numeric(y + 10)} V${numeric(y + h - 10)} A${numeric(w / 2)} 10 0 0 1 ${numeric(x)} ${numeric(y + h - 10)} Z" ${common}/><ellipse cx="${numeric(x + w / 2)}" cy="${numeric(y + 10)}" rx="${numeric(w / 2)}" ry="10" ${common}/>`;
    content = centeredContent(ref, x + 8, y + 22, w - 16, h - 34);
  } else if (kind === 'queue') {
    shape = `<path d="M${numeric(x + 10)} ${numeric(y)} H${numeric(x + w - 10)} A10 ${numeric(h / 2)} 0 0 1 ${numeric(x + w - 10)} ${numeric(y + h)} H${numeric(x + 10)} A10 ${numeric(h / 2)} 0 0 1 ${numeric(x + 10)} ${numeric(y)} Z" ${common}/><ellipse cx="${numeric(x + w - 10)}" cy="${numeric(y + h / 2)}" rx="10" ry="${numeric(h / 2)}" ${common}/>`;
    content = centeredContent(ref, x + 12, y, w - 34, h);
  } else if (kind === 'server') {
    shape = `<path d="M${numeric(x)} ${numeric(y + 12)} L${numeric(x + 14)} ${numeric(y)} H${numeric(x + w)} V${numeric(y + h - 12)} L${numeric(x + w - 14)} ${numeric(y + h)} H${numeric(x)} Z" ${common}/><path d="M${numeric(x)} ${numeric(y + 12)} H${numeric(x + w - 14)} L${numeric(x + w)} ${numeric(y)} M${numeric(x + w - 14)} ${numeric(y + 12)} V${numeric(y + h)}" fill="none" stroke="${stroke}" stroke-width="${numeric(theme.lineWidth)}"/>`;
    content = centeredContent(ref, x, y + 12, w - 14, h - 12);
  } else if (kind === 'package') {
    const tab = Math.min(w - 28, Math.max(56, w * 0.4));
    shape = `<path d="M${numeric(x)} ${numeric(y + h)} V${numeric(y)} H${numeric(x + tab)} V${numeric(y + 20)} H${numeric(x + w)} V${numeric(y + h)} Z" ${common}/><path d="M${numeric(x)} ${numeric(y + 20)} H${numeric(x + tab)}" stroke="${stroke}"/>`;
    content = centeredContent(ref, x, y + 22, w, h - 22);
  } else if (kind === 'note') {
    shape = `<path d="M${numeric(x)} ${numeric(y)} H${numeric(x + w - 18)} L${numeric(x + w)} ${numeric(y + 18)} V${numeric(y + h)} H${numeric(x)} Z" ${common}/><path d="M${numeric(x + w - 18)} ${numeric(y)} V${numeric(y + 18)} H${numeric(x + w)}" fill="none" stroke="${stroke}"/>`;
    content = centeredContent(ref, x + 6, y + 10, w - 18, h - 16);
  } else {
    const radius = kind === 'state' ? Math.max(12, theme.radius) : kind === 'action' && ['activity', 'swimlane', 'process', 'scenario'].includes(spec.type) ? Math.max(14, theme.radius) : theme.radius;
    shape = `${rect} rx="${numeric(radius)}" ${common}/>`;
    if (kind === 'component') {
      const right = x + w - 28;
      shape += `<rect x="${numeric(right)}" y="${numeric(y + 10)}" width="16" height="20" fill="${surface}" stroke="${stroke}"/><path d="M${numeric(right - 4)} ${numeric(y + 14)} h8 v5 h-8 Z M${numeric(right - 4)} ${numeric(y + 22)} h8 v5 h-8 Z" fill="${surface}" stroke="${stroke}"/>`;
    }
    if (kind === 'state' && node.detail) {
      shape += `<path d="M${numeric(x)} ${numeric(y + ref.header)} H${numeric(x + w)}" stroke="${stroke}" stroke-width="${numeric(theme.lineWidth)}"/>`;
      content = centeredContent({ ...ref, node: { ...node, detail: undefined } }, x, y, w, ref.header);
      const size = Math.max(10, theme.fontSize - 2);
      content += text(x + 12, y + ref.header + 10 + size, node.detail, theme, { anchor: 'start', size, fill: theme.muted });
    } else content = centeredContent(ref, x + (kind === 'component' ? -8 : 0), y, w, h);
  }
  if (box.caption) content += text(x + box.caption.x + box.caption.width / 2, y + box.caption.y + 2 + box.caption.size, box.caption.value, theme, { size: box.caption.size, fill: theme.muted });
  return `<g class="uml-node uml-node-${kind}" data-node-id="${esc(node.id)}"${node.lane ? ` data-lane-id="${esc(node.lane)}"` : ''}${node.group ? ` data-group-id="${esc(node.group)}"` : ''}><title>${esc([node.label, node.detail].filter(Boolean).join('\n'))}</title>${shape}${content}</g>`;
}

function placeLabels(routes: Route[], nodes: NodeBox[], containers: ContainerBox[], direction: 'TB' | 'LR'): LabelBox[] {
  const occupied: Rect[] = [...nodes];
  for (const box of nodes) if (box.caption) occupied.push({ x: box.x + box.caption.x, y: box.y + box.caption.y, width: box.caption.width, height: box.caption.height });
  for (const box of containers) occupied.push(box.ref.kind === 'lane' && direction === 'LR'
    ? { x: box.x, y: box.y, width: box.ref.header, height: box.height }
    : { x: box.x, y: box.y, width: box.width, height: box.ref.header });
  const allSegments: { a: Point; b: Point }[] = [];
  for (const route of routes) for (const path of route.paths) for (let index = 1; index < path.length; index++) allSegments.push({ a: path[index - 1], b: path[index] });
  const placed: LabelBox[] = [];
  for (const route of routes) for (const label of route.ref.labels) {
    const candidates: { box: LabelBox; score: number }[] = [];
    const original = route.labels.get(label.id);
    if (original) candidates.push({ box: { ...original, width: label.width, height: label.height, value: label.value, size: label.size }, score: -30 });
    const segments: { a: Point; b: Point; length: number; order: number }[] = [];
    for (const path of route.paths) for (let index = 1; index < path.length; index++) {
      const a = path[index - 1], b = path[index];
      segments.push({ a, b, length: Math.abs(a.x - b.x) + Math.abs(a.y - b.y), order: segments.length });
    }
    for (const segment of segments) {
      const { a, b, length, order } = segment;
      if (length < 1) continue;
      const horizontal = Math.abs(a.y - b.y) < 0.01;
      const desired = label.role === 'from' ? 0.2 : label.role === 'to' ? 0.8 : 0.5;
      for (const fraction of [desired, 0.5, 0.25, 0.75]) for (const gap of [8, 16, 30, 50, 80, 120, 180, 260]) {
        const center = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
        const penalty = label.role === 'from' ? order * 100 : label.role === 'to' ? (segments.length - 1 - order) * 100 : -Math.min(length, 300) / 5;
        const first: LabelBox = { x: horizontal ? center.x - label.width / 2 : center.x + gap, y: horizontal ? center.y - gap - label.height : center.y - label.height / 2, width: label.width, height: label.height, value: label.value, size: label.size };
        const second: LabelBox = { ...first, x: horizontal ? first.x : center.x - gap - label.width, y: horizontal ? center.y + gap : first.y };
        candidates.push({ box: first, score: penalty + gap + Math.abs(fraction - desired) * 20 }, { box: second, score: penalty + gap + 2 + Math.abs(fraction - desired) * 20 });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    let chosen: LabelBox | undefined;
    for (const candidate of candidates) {
      if (occupied.some(box => intersects(candidate.box, box, 5))) continue;
      const crosses = allSegments.some(({ a, b }) => Math.abs(a.y - b.y) < 0.01
        ? a.y > candidate.box.y - 6 && a.y < candidate.box.y + candidate.box.height + 6 && Math.max(a.x, b.x) > candidate.box.x - 4 && Math.min(a.x, b.x) < candidate.box.x + candidate.box.width + 4
        : a.x > candidate.box.x - 6 && a.x < candidate.box.x + candidate.box.width + 6 && Math.max(a.y, b.y) > candidate.box.y - 4 && Math.min(a.y, b.y) < candidate.box.y + candidate.box.height + 4);
      if (crosses) continue;
      chosen = candidate.box; break;
    }
    if (!chosen) {
      // Keep dense cardinality annotations readable in a free exterior band.
      const anchor = route.paths[0][0];
      let y = Math.min(...occupied.map(box => box.y), anchor.y) - label.height - 16;
      chosen = { x: anchor.x - label.width / 2, y, width: label.width, height: label.height, value: label.value, size: label.size };
      while (occupied.some(box => intersects(chosen!, box, 5))) { y -= label.height + 12; chosen.y = y; }
    }
    placed.push(chosen); occupied.push(chosen);
  }
  return placed;
}

/** Layout every graph family with bundled ELK; sequence and fishbone have dedicated renderers. */
export async function renderGraph(spec: DiagramSpec, suppliedTheme: Theme): Promise<RenderedDiagram> {
  const theme = cleanTheme(suppliedTheme);
  const direction = spec.direction ?? 'TB';
  const nodes = (spec.nodes ?? []).map((node, index) => createNode(node, index, spec, theme));
  const edges = (spec.edges ?? []).map((edge, index) => createEdge(edge, index, theme, spec.type));
  const refs = new Map(nodes.map(node => [node.id, node]));
  const edgeRefs = new Map(edges.map(edge => [edge.id, edge]));
  const containers = new Map<string, ContainerRef>();
  const elk = layoutEngine ??= new ELK();
  let result: LayoutResult;
  if (spec.lanes?.length) {
    const lanes = [...spec.lanes];
    const unassigned = nodes.filter(node => !node.node.lane);
    const occupiedGroups = new Set<string>();
    for (const node of nodes) {
      let id = node.node.group;
      while (id && !occupiedGroups.has(id)) { occupiedGroups.add(id); id = spec.groups?.find(group => group.id === id)?.parent; }
    }
    const emptyGroups = (spec.groups ?? []).filter(group => !occupiedGroups.has(group.id));
    let unassignedId = '__uml_unassigned_lane__';
    while (lanes.some(lane => lane.id === unassignedId)) unassignedId += '_';
    if (unassigned.length || emptyGroups.length) lanes.push({ id: unassignedId, label: '未分配' });
    const layouts: LayoutResult[] = [];
    for (let index = 0; index < lanes.length; index++) {
      const lane = lanes[index];
      const laneNodes = nodes.filter(node => lane.id === unassignedId ? !node.node.lane : node.node.lane === lane.id);
      const laneNodeIds = new Set(laneNodes.map(node => node.node.id));
      const localEdges = edges.filter(edge => laneNodeIds.has(edge.edge.from) && laneNodeIds.has(edge.edge.to));
      const input = buildGraph(`lane${index}`, laneNodes, spec.groups ?? [], localEdges, spec, theme, containers, lane,
        lane.id === unassignedId ? emptyGroups.map(group => group.id) : undefined);
      const minimumWidth = input.width ?? 240, minimumHeight = input.height ?? 180;
      const output = await elk.layout(input);
      // An empty ELK root has no content-derived size; it still represents a real lane.
      output.width = Math.max(minimumWidth, output.width ?? 0);
      output.height = Math.max(minimumHeight, output.height ?? 0);
      layouts.push(collectLayout(output, { x: 0, y: 0 }, refs, containers, edgeRefs));
    }
    const crossSize = Math.max(180, ...layouts.map(layout => direction === 'TB' ? layout.height : layout.width));
    let offset = 0;
    result = { nodes: [], containers: [], routes: [], width: 0, height: 0 };
    for (const layout of layouts) {
      const dx = direction === 'TB' ? offset : 0, dy = direction === 'LR' ? offset : 0;
      for (const box of layout.nodes) result.nodes.push({ ...box, x: box.x + dx, y: box.y + dy });
      for (const box of layout.containers) result.containers.push({ ...box, x: box.x + dx, y: box.y + dy, width: box.ref.kind === 'lane' && direction === 'LR' ? crossSize : box.width, height: box.ref.kind === 'lane' && direction === 'TB' ? crossSize : box.height });
      for (const route of layout.routes) result.routes.push({ ...route, paths: route.paths.map(path => path.map(point => ({ x: point.x + dx, y: point.y + dy }))), labels: new Map([...route.labels].map(([id, point]) => [id, { x: point.x + dx, y: point.y + dy }])) });
      offset += direction === 'TB' ? layout.width : layout.height;
    }
    result.width = direction === 'TB' ? offset : crossSize;
    result.height = direction === 'TB' ? crossSize : offset;
    const nodeLanes = new Map(nodes.map(node => [node.node.id, node.node.lane ?? unassignedId]));
    routeBetweenLanes(edges.filter(edge => nodeLanes.get(edge.edge.from) !== nodeLanes.get(edge.edge.to)), result, direction, theme);
  } else {
    const input = buildGraph('root', nodes, spec.groups ?? [], edges, spec, theme, containers);
    const output = await elk.layout(input);
    result = collectLayout(output, { x: 0, y: 0 }, refs, containers, edgeRefs);
  }
  const nodeById = new Map(result.nodes.map(box => [box.ref.node.id, box]));
  for (const route of result.routes) {
    const first = route.paths[0], last = route.paths[route.paths.length - 1];
    const source = nodeById.get(route.ref.edge.from), target = nodeById.get(route.ref.edge.to);
    if (source && first.length > 1) clipEndpoint(first[0], first[1], source);
    if (target && last.length > 1) clipEndpoint(last[last.length - 1], last[last.length - 2], target);
  }
  const labels = placeLabels(result.routes, result.nodes, result.containers, direction);
  const prefix = `uml-graph-${++graphNumber}`;
  let paths = '';
  for (const route of result.routes) {
    const kind = edgeKind(route.ref.edge, spec.type);
    const dashed = route.ref.edge.dashed || ['dependency', 'include', 'extend', 'realization'].includes(kind);
    const end = kind === 'flow' ? 'arrow' : ['dependency', 'include', 'extend'].includes(kind) ? 'open' : ['inheritance', 'realization'].includes(kind) ? 'triangle' : '';
    const start = kind === 'aggregation' || kind === 'composition' ? kind : '';
    paths += `<g class="uml-edge uml-edge-${kind}" data-edge-id="${esc(route.ref.edge.id ?? route.ref.id)}" data-from="${esc(route.ref.edge.from)}" data-to="${esc(route.ref.edge.to)}"><title>${esc([route.ref.edge.from, route.ref.edge.label, route.ref.edge.to].filter(Boolean).join(' → '))}</title>`;
    for (let index = 0; index < route.paths.length; index++) paths += `<path d="${roundedPath(route.paths[index])}" fill="none" stroke="${esc(theme.primary)}" stroke-width="${numeric(theme.lineWidth)}" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="7 5"' : ''}${start && index === 0 ? ` marker-start="url(#${prefix}-${start})"` : ''}${end && index === route.paths.length - 1 ? ` marker-end="url(#${prefix}-${end})"` : ''}/>`;
    paths += '</g>';
  }
  const groupShapes = result.containers.sort((a, b) => a.depth - b.depth).map(box => renderContainer(box, theme, direction)).join('');
  const nodeShapes = result.nodes.map(box => renderNode(box, spec)).join('');
  const labelShapes = labels.map(label => `<g class="uml-edge-label"><rect x="${numeric(label.x)}" y="${numeric(label.y)}" width="${numeric(label.width)}" height="${numeric(label.height)}" rx="3" fill="${esc(theme.background)}"/>${text(label.x + label.width / 2, label.y + 5 + label.size, label.value, theme, { size: label.size, fill: theme.muted })}</g>`).join('');
  let minX = 0, minY = 0, maxX = result.width, maxY = result.height;
  for (const box of [...result.nodes, ...result.containers, ...labels]) { minX = Math.min(minX, box.x - theme.lineWidth); minY = Math.min(minY, box.y - theme.lineWidth); maxX = Math.max(maxX, box.x + box.width + theme.lineWidth); maxY = Math.max(maxY, box.y + box.height + theme.lineWidth); }
  for (const box of result.nodes) if (box.caption) {
    minX = Math.min(minX, box.x + box.caption.x); minY = Math.min(minY, box.y + box.caption.y);
    maxX = Math.max(maxX, box.x + box.caption.x + box.caption.width); maxY = Math.max(maxY, box.y + box.caption.y + box.caption.height);
  }
  for (const route of result.routes) for (const path of route.paths) for (const point of path) { minX = Math.min(minX, point.x - 14); minY = Math.min(minY, point.y - 14); maxX = Math.max(maxX, point.x + 14); maxY = Math.max(maxY, point.y + 14); }
  const titleMetrics = measure(spec.title, 24);
  const titleBottom = 42 + (titleMetrics.lines - 1) * 33.6;
  const descriptionMetrics = spec.description ? measure(spec.description, 13) : undefined;
  const contentY = Math.max(88, descriptionMetrics ? titleBottom + 24 + (descriptionMetrics.lines - 1) * 18.2 + 32 : titleBottom + 36);
  const heading = text(32, 42, spec.title, theme, { size: 24, anchor: 'start', weight: 650 }) + (spec.description ? text(32, titleBottom + 24, spec.description, theme, { size: 13, anchor: 'start', fill: theme.muted }) : '');
  const width = Math.max(320, maxX - minX + 64, titleMetrics.width + 64, (descriptionMetrics?.width ?? 0) + 64);
  const height = Math.max(contentY + 48, maxY - minY + contentY + 32);
  const body = `${markerDefinitions(prefix, theme)}${heading}<g transform="translate(${numeric(32 - minX)} ${numeric(contentY - minY)})">${groupShapes}${paths}${labelShapes}${nodeShapes}</g>`;
  return frame(spec, theme, width, height, body);
}
