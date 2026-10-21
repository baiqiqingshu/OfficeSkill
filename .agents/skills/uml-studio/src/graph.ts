import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkLabel, ElkNode } from 'elkjs/lib/elk-api';
import type { DiagramEdge, DiagramGroup, DiagramNode, DiagramSpec, RenderedDiagram, Theme } from './types';
import { esc, frame, text } from './svg';
import { resolveLayout } from './themes';
import { crossingPaths } from './crossings';

type Kind = NonNullable<DiagramNode['kind']>;
type Side = 'left' | 'right' | 'top' | 'bottom';
interface Point { x: number; y: number }
interface Rect { x: number; y: number; width: number; height: number }
interface NodeRef {
  id: string;
  node: DiagramNode;
  sourceNode: DiagramNode;
  theme: Theme;
  kind: Kind;
  width: number;
  height: number;
  renderWidth: number;
  renderHeight: number;
  symbol?: Rect;
  internalCaption?: LabelBox;
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
interface Route { ref: EdgeRef; paths: Point[][] }
interface LabelBox extends Rect { value: string; size: number }
interface EdgeLabelBox extends LabelBox { ref: EdgeRef; role: 'main' | 'from' | 'to'; anchor: Point; leader?: boolean }
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

function wrapNodeText(value: string, width: number, size: number): string {
  return value.replace(/\r\n?/g, '\n').split('\n').flatMap(paragraph => {
    const lines: string[] = [];
    let current = '';
    for (const character of paragraph) {
      if (current && measure(current + character, size).width > width) { lines.push(current); current = ''; }
      current += character;
    }
    lines.push(current);
    return lines;
  }).join('\n');
}

function createNode(node: DiagramNode, index: number, spec: DiagramSpec, base: Theme): NodeRef {
  const theme = cleanTheme({ ...base, ...node.style });
  const sourceNode = node;
  if (spec.layout?.nodeMaxWidth) {
    const contentWidth = Math.max(64, spec.layout.nodeMaxWidth - 44);
    const wrap = (value: string) => wrapNodeText(value, contentWidth, theme.fontSize);
    node = { ...node, label: wrap(node.label), detail: node.detail ? wrap(node.detail) : undefined,
      stereotype: node.stereotype ? wrap(node.stereotype) : undefined,
      attributes: node.attributes?.map(wrap), operations: node.operations?.map(wrap) };
  }
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
  let symbol: Rect | undefined, internalCaption: LabelBox | undefined;
  if ((spec.layout?.nodeMaxWidth || spec.layout?.nodeMaxHeight) && ['start', 'end', 'fork', 'join'].includes(kind)) {
    const value = [node.stereotype ? `«${node.stereotype}»` : '', node.label, node.detail].filter(Boolean).join('\n');
    const captionSize = Math.max(10, theme.fontSize - 2), metrics = measure(value, captionSize);
    symbol = { x: 0, y: 0, width, height };
    internalCaption = { x: spec.direction === 'LR' ? 0 : width + 10, y: spec.direction === 'LR' ? height + 10 : 0, width: metrics.width + 4, height: metrics.height + 4, value, size: captionSize };
    width = Math.max(width, internalCaption.x + internalCaption.width);
    height = Math.max(height, internalCaption.y + internalCaption.height);
    if (spec.direction === 'LR') symbol.x = (width - symbol.width) / 2;
    else symbol.y = (height - symbol.height) / 2;
  }
  const renderWidth = Math.ceil(width / 4) * 4, renderHeight = Math.ceil(height / 4) * 4;
  const fit = Math.min(1, spec.layout?.nodeMaxWidth ? spec.layout.nodeMaxWidth / renderWidth : 1, spec.layout?.nodeMaxHeight ? spec.layout.nodeMaxHeight / renderHeight : 1);
  return { id: `n${index}`, node, sourceNode, kind, theme, width: renderWidth * fit, height: renderHeight * fit, renderWidth, renderHeight, symbol, internalCaption, header, attributes, operations, attributeHeight, operationHeight };
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

function layoutOptions(direction: 'TB' | 'LR', padding: string, spec: DiagramSpec): Record<string, string> {
  return {
    'elk.algorithm': 'layered', 'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
    'elk.edgeRouting': 'ORTHOGONAL', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': padding, 'elk.spacing.nodeNode': String(spec.layout?.elementGap ?? 24),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(spec.layout?.elementGap ?? 24),
    'elk.spacing.edgeNode': '18', 'elk.spacing.edgeEdge': '14', 'elk.spacing.edgeLabel': '10',
    'elk.layered.spacing.edgeNodeBetweenLayers': '20', 'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.favorStraightEdges': 'true',
    'elk.layered.mergeEdges': 'false', 'elk.separateConnectedComponents': 'true',
    'elk.spacing.componentComponent': String(spec.layout?.regionGap ?? 40),
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
  root.layoutOptions = layoutOptions(direction, padding, spec);
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
    const options = layoutOptions(direction, `[top=${groupHeader + 20},left=24,bottom=24,right=24]`, spec);
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
    if (!ref.internalCaption && ['start', 'end', 'fork', 'join'].includes(ref.kind)) {
      const caption = [ref.node.stereotype ? `«${ref.node.stereotype}»` : '', ref.node.label, ref.node.detail].filter(Boolean).join('\n');
      const size = Math.max(10, ref.theme.fontSize - 2);
      const metrics = measure(caption, size);
      const placement = direction === 'TB' ? '[H_RIGHT,V_CENTER,OUTSIDE]' : '[H_CENTER,V_BOTTOM,OUTSIDE]';
      child.layoutOptions = { 'elk.layered.nodePlacement.favorStraightEdges': 'true', 'elk.spacing.labelNode': '10', 'elk.nodeLabels.placement': placement };
      const width = metrics.width + 4, height = metrics.height + 4;
      child.labels = [{ id: `${ref.id}-caption`, text: caption, width, height,
        x: direction === 'LR' ? (ref.width - width) / 2 : ref.width + 10,
        y: direction === 'LR' ? ref.height + 10 : (ref.height - height) / 2 }];
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

/** Lay out connections inside each region, then compose sibling regions horizontally. */
async function layoutRegions(
  root: ElkNode, spec: DiagramSpec, elk: InstanceType<typeof ELK>, refs: Map<string, NodeRef>,
  columns: Map<string, string>, automaticColumns: boolean,
): Promise<ElkNode> {
  const elementGap = spec.layout?.elementGap ?? 24, regionGap = spec.layout?.regionGap ?? 40;
  const edges = root.edges ?? [];
  const outgoing = new Map<string, typeof edges>();
  const incoming = new Set<string>();
  for (const edge of edges) {
    const list = outgoing.get(edge.sources[0]) ?? []; list.push(edge); outgoing.set(edge.sources[0], list);
    for (const id of edge.targets) incoming.add(id);
  }
  const feedback = new Set<string>(), active = new Set<string>(), visited = new Set<string>();
  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id); active.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (edge.targets.some(target => active.has(target))) feedback.add(edge.id);
      else for (const target of edge.targets) visit(target);
    }
    active.delete(id);
  }
  const localIds = new Set<string>();
  function collect(region: ElkNode): void {
    if (!region.children) localIds.add(region.id);
    else for (const child of region.children) collect(child);
  }
  collect(root);
  for (const id of localIds) if (refs.get(id)?.kind === 'start' || !incoming.has(id)) visit(id);
  for (const id of localIds) visit(id);
  const terminal = (node: ElkNode) => ['start', 'end'].includes(refs.get(node.id)?.kind ?? '');
  const natural = new Map<string, { children: ElkNode[]; width: number; height: number }>();
  const minimumSizes = new Map<string, { width: number; height: number }>();
  async function place(region: ElkNode, columnLimit = spec.layout?.maxPerColumn ?? 0): Promise<void> {
    if (!minimumSizes.has(region.id)) minimumSizes.set(region.id, { width: region.width ?? 0, height: region.height ?? 0 });
    const inset = { top: 24, left: 24, bottom: 24, right: 24 };
    for (const side of ['top', 'left', 'bottom', 'right'] as const) {
      const match = region.layoutOptions?.['elk.padding']?.match(new RegExp(`${side}=([\\d.]+)`));
      if (match) inset[side] = Number(match[1]);
    }
    const leaves = (region.children ?? []).filter(child => !child.children && !terminal(child));
    const nested = (region.children ?? []).filter(child => child.children);
    let content = natural.get(region.id);
    if (!content) {
      const ids = new Set(leaves.map(child => child.id));
      const input: ElkNode = {
        id: `${region.id}-content`, children: leaves,
        edges: edges.filter(edge => !feedback.has(edge.id) && edge.sources.every(id => ids.has(id)) && edge.targets.every(id => ids.has(id))),
        layoutOptions: layoutOptions(spec.direction ?? 'TB', '[top=0,left=0,bottom=0,right=0]', spec),
      };
      const output = leaves.length ? await elk.layout(input) : undefined;
      content = { children: output?.children ?? [], width: output?.width ?? 0, height: output?.height ?? 0 };
      natural.set(region.id, content);
    }
    const placed = content.children.map(child => ({ ...child }));
    let width = content.width, height = content.height;
    if (columnLimit > 0 && placed.length > columnLimit) {
      // ELK's layers supply the order; a serpentine fold keeps column hand-offs on one row.
      const horizontal = spec.direction === 'LR';
      placed.sort((a, b) => (horizontal ? (a.x ?? 0) - (b.x ?? 0) : (a.y ?? 0) - (b.y ?? 0))
        || (horizontal ? (a.y ?? 0) - (b.y ?? 0) : (a.x ?? 0) - (b.x ?? 0)));
      const columnCount = Math.ceil(placed.length / columnLimit);
      const widths = Array<number>(columnCount).fill(0), heights = Array<number>(columnLimit).fill(0);
      placed.forEach((child, index) => {
        const column = Math.floor(index / columnLimit), offset = index % columnLimit;
        const row = column % 2 ? columnLimit - 1 - offset : offset;
        const labelWidth = Math.max(0, ...(child.labels ?? []).map(label => (label.x ?? (child.width ?? 0) + 10) + (label.width ?? 0)));
        const labelHeight = Math.max(0, ...(child.labels ?? []).map(label => (label.y ?? 0) + (label.height ?? 0)));
        widths[column] = Math.max(widths[column], child.width ?? 0, labelWidth);
        heights[row] = Math.max(heights[row], child.height ?? 0, labelHeight);
      });
      const xs: number[] = [], ys: number[] = [];
      width = height = 0;
      const columnGap = Math.max(elementGap, ...edges.flatMap(edge => (edge.labels ?? []).map(label => (label.width ?? 0) + 16)));
      for (const size of widths) { xs.push(width); width += size + columnGap; }
      for (const size of heights) { ys.push(height); height += size + elementGap; }
      width -= columnGap; height -= elementGap;
      placed.forEach((child, index) => {
        const column = Math.floor(index / columnLimit), offset = index % columnLimit;
        const row = column % 2 ? columnLimit - 1 - offset : offset;
        const occupiedWidth = Math.max(child.width ?? 0, ...(child.labels ?? []).map(label => (label.x ?? (child.width ?? 0) + 10) + (label.width ?? 0)));
        const occupiedHeight = Math.max(child.height ?? 0, ...(child.labels ?? []).map(label => (label.y ?? 0) + (label.height ?? 0)));
        child.x = xs[column] + (widths[column] - occupiedWidth) / 2;
        child.y = ys[row] + (heights[row] - occupiedHeight) / 2;
        columns.set(child.id, `${region.id}-column${column}`);
      });
    } else for (const child of placed) columns.set(child.id, region.id);
    for (const child of placed) { child.x = (child.x ?? 0) + inset.left; child.y = (child.y ?? 0) + inset.top; }
    for (const child of nested) await place(child);
    if (automaticColumns && !columnLimit && nested.length > 1) {
      for (const child of nested) {
        const count = (child.children ?? []).filter(node => !node.children && !terminal(node)).length;
        const peers = nested.filter(peer => peer !== child).map(peer => peer.height ?? 0).sort((a, b) => a - b);
        const typical = peers[Math.floor((peers.length - 1) / 2)] ?? 0;
        if (count > 6 && typical > 0 && (child.height ?? 0) > typical * 2) {
          await place(child, Math.max(3, Math.ceil(count / Math.ceil((child.height ?? 0) / typical))));
        }
      }
    }
    let right = inset.left + width, bottom = inset.top + height;
    for (const child of nested) {
      child.x = right + (right > inset.left ? regionGap : 0); child.y = inset.top;
      right = child.x + (child.width ?? 0); bottom = Math.max(bottom, child.y + (child.height ?? 0));
    }
    const terminals = (region.children ?? []).filter(terminal);
    // Terminals are collected here, but positioned in global bands after connection alignment.
    region.children = [...placed, ...nested, ...terminals];
    region.width = Math.max(minimumSizes.get(region.id)!.width, right + inset.right);
    region.height = Math.max(minimumSizes.get(region.id)!.height, bottom + inset.bottom);
    region.edges = [];
  }
  await place(root);
  return root;
}

function collectLayout(root: ElkNode, refs: Map<string, NodeRef>, containerRefs: Map<string, ContainerRef>): LayoutResult {
  const nodes: NodeBox[] = [], containers: ContainerBox[] = [];
  function visit(node: ElkNode, parent: Point, depth: number): void {
    const position = { x: parent.x + (node.x ?? 0), y: parent.y + (node.y ?? 0) };
    const ref = refs.get(node.id), container = containerRefs.get(node.id);
    if (ref) {
      const label = node.labels?.find(candidate => candidate.id === `${ref.id}-caption`);
      const caption = label ? {
        x: label.x ?? ref.width + 10, y: label.y ?? 0, width: label.width ?? 0, height: label.height ?? 0,
        value: label.text ?? ref.node.label, size: Math.max(10, ref.theme.fontSize - 2),
      } : undefined;
      nodes.push({ ...position, width: node.width ?? ref.width, height: node.height ?? ref.height, ref, caption });
    }
    if (container) containers.push({ ...position, width: node.width ?? 200, height: node.height ?? 140, ref: container, depth });
    for (const child of node.children ?? []) visit(child, position, depth + 1);
  }
  visit(root, { x: -(root.x ?? 0), y: -(root.y ?? 0) }, 0);
  return { nodes, containers, routes: [], width: root.width ?? 240, height: root.height ?? 160 };
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
      let overlap = 0, crossings = 0;
      for (const path of used) for (let index = 1; index < path.length; index++) {
        const c = path[index - 1], d = path[index];
        if (horizontal && c.y === d.y && Math.abs(a.y - c.y) < 0.1) overlap += Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
        if (!horizontal && c.x === d.x && Math.abs(a.x - c.x) < 0.1) overlap += Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
        if (horizontal !== (Math.abs(c.y - d.y) < 0.01)) {
          const x = horizontal ? c.x : a.x, y = horizontal ? a.y : c.y;
          if (x > Math.min(a.x, b.x, c.x, d.x) + 0.01 && x < Math.max(a.x, b.x, c.x, d.x) - 0.01
            && y > Math.min(a.y, b.y, c.y, d.y) + 0.01 && y < Math.max(a.y, b.y, c.y, d.y) - 0.01) crossings++;
        }
      }
      const direction = horizontal ? 1 : 2;
      const state = neighbor * 3 + direction;
      const cost = current.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (current.state % 3 && current.state % 3 !== direction ? 28 : 0) + overlap * 8 + crossings * 80;
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

function directEndpoint(box: NodeBox, other: NodeBox): Point {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  if (box.ref.kind === 'actor') {
    const dx = other.x + other.width / 2 - cx, dy = other.y + other.height / 2 - cy;
    if (Math.abs(dx) < box.width / 2 && Math.abs(dy) > box.height / 2)
      return { x: cx, y: dy > 0 ? box.y + box.height : box.y };
    return { x: cx + (dx >= 0 ? 25 : -25) * box.width / box.ref.renderWidth, y: box.y + 35 * box.height / box.ref.renderHeight };
  }
  const destination = other.ref.kind === 'actor' ? directEndpoint(other, box) : { x: other.x + other.width / 2, y: other.y + other.height / 2 };
  const dx = destination.x - cx, dy = destination.y - cy;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: cx, y: cy };
  if (box.ref.kind === 'usecase') {
    const rx = box.width / 2, ry = box.height / 2;
    const scale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return { x: cx + dx * scale, y: cy + dy * scale };
  }
  const scaleX = Math.abs(dx) < 0.001 ? Infinity : (box.width / 2) / Math.abs(dx);
  const scaleY = Math.abs(dy) < 0.001 ? Infinity : (box.height / 2) / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function layoutUsecases(refs: NodeRef[], edges: EdgeRef[], spec: DiagramSpec, theme: Theme): LayoutResult {
  const horizontal = spec.direction !== 'TB';
  const axis = horizontal ? 'y' : 'x', size = horizontal ? 'height' : 'width';
  const gap = spec.layout?.elementGap ?? 48, regionGap = spec.layout?.regionGap ?? 72;
  const nodes: NodeBox[] = refs.map(ref => ({ x: 0, y: 0, width: ref.width, height: ref.height, ref }));
  const actors = nodes.filter(box => box.ref.kind === 'actor' && !box.ref.node.group);
  const cases = nodes.filter(box => !actors.includes(box));
  const byId = new Map(nodes.map(box => [box.ref.node.id, box]));
  const caseIds = new Set(cases.map(box => box.ref.node.id));
  const relations = edges.filter(ref => caseIds.has(ref.edge.from) && caseIds.has(ref.edge.to) && ref.edge.from !== ref.edge.to)
    .map(ref => edgeKind(ref.edge, 'usecase') === 'extend' ? [ref.edge.to, ref.edge.from] : [ref.edge.from, ref.edge.to]);
  const outgoing = new Map(cases.map(box => [box.ref.node.id, [] as string[]]));
  for (const [source, target] of relations) outgoing.get(source)!.push(target);
  const active = new Set<string>(), visited = new Set<string>(), ordered: string[] = [];
  const forward: string[][] = [];
  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id); active.add(id);
    for (const target of outgoing.get(id) ?? []) if (!active.has(target)) { forward.push([id, target]); visit(target); }
    active.delete(id); ordered.push(id);
  }
  for (const box of cases) visit(box.ref.node.id);
  const ranks = new Map(cases.map(box => [box.ref.node.id, 0]));
  for (const source of ordered.reverse()) for (const [from, target] of forward)
    if (from === source) ranks.set(target, Math.max(ranks.get(target)!, ranks.get(source)! + 1));
  const owner = new Map<string, number>();
  for (const [index, actor] of actors.entries()) {
    const queue = edges.flatMap(ref => ref.edge.from === actor.ref.node.id && caseIds.has(ref.edge.to) ? [ref.edge.to]
      : ref.edge.to === actor.ref.node.id && caseIds.has(ref.edge.from) ? [ref.edge.from] : []);
    const distances = new Map(queue.map(id => [id, 0]));
    for (let offset = 0; offset < queue.length; offset++) {
      const id = queue[offset], distance = distances.get(id)!;
      const priority = distance * actors.length + index;
      if (priority < (owner.get(id) ?? Infinity)) owner.set(id, priority);
      for (const [source, target] of relations) {
        const neighbor = source === id ? target : target === id ? source : undefined;
        if (neighbor && !distances.has(neighbor)) { distances.set(neighbor, distance + 1); queue.push(neighbor); }
      }
    }
  }
  const buckets: { boxes: NodeBox[]; slots: number[] }[] = [];
  const containers: ContainerBox[] = [];
  const groups = spec.groups ?? [];
  function region(id: string | undefined, depth: number): { width: number; height: number; members: NodeBox[]; regions: ContainerBox[]; grids: typeof buckets } {
    const group = groups.find(candidate => candidate.id === id);
    const header = group ? measure(group.label, theme.fontSize).height + (group.kind === 'node' ? 40 : 22) : 0;
    const padding = group ? 28 : 0, top = group ? header + 24 : 0;
    const leaves = cases.filter(box => box.ref.node.group === id);
    const layers = [...new Set(leaves.map(box => ranks.get(box.ref.node.id)!))].sort((first, second) => first - second)
      .map(rank => leaves.filter(box => ranks.get(box.ref.node.id) === rank).sort((first, second) => {
        const firstOwner = owner.get(first.ref.node.id), secondOwner = owner.get(second.ref.node.id);
        return (firstOwner === undefined ? actors.length : firstOwner % Math.max(1, actors.length))
          - (secondOwner === undefined ? actors.length : secondOwner % Math.max(1, actors.length));
      })).flatMap(layer => {
        const limit = spec.layout?.maxPerColumn ?? 0;
        return limit > 0 ? Array.from({ length: Math.ceil(layer.length / limit) }, (_, index) => layer.slice(index * limit, (index + 1) * limit)) : [layer];
      });
    const rows = Math.max(0, ...layers.map(layer => layer.length));
    const rowSize = Math.max(1, ...leaves.map(box => box[size]));
    const rowGap = Math.max(gap, ...edges.flatMap(ref => ref.labels.map(label => (horizontal ? label.height : label.width) + 16)));
    const fan = Math.max(1, ...leaves.map(box => relations.filter(([source, target]) => source === box.ref.node.id || target === box.ref.node.id).length));
    const layerGap = Math.max(regionGap, ...edges.flatMap(ref => ref.labels.map(label => (horizontal ? label.width : label.height) + 24 + Math.max(0, fan - 2) * 32)));
    const grids: typeof buckets = [];
    let extent = 0;
    for (const layer of layers) {
      const alongSize = Math.max(...layer.map(box => horizontal ? box.width : box.height));
      const slots = Array.from({ length: rows }, (_, index) => (horizontal ? top : padding) + rowSize / 2 + index * (rowSize + rowGap));
      for (const [index, box] of layer.entries()) {
        box[axis] = slots[index + Math.floor((rows - layer.length) / 2)] - box[size] / 2;
        if (horizontal) box.x = padding + extent + (alongSize - box.width) / 2;
        else box.y = top + extent + (alongSize - box.height) / 2;
      }
      grids.push({ boxes: layer, slots });
      extent += alongSize + layerGap;
    }
    const across = rows ? rows * rowSize + (rows - 1) * rowGap : 0;
    let width = padding * 2 + (horizontal ? Math.max(0, extent - layerGap) : across);
    let height = top + padding + (horizontal ? across : Math.max(0, extent - layerGap));
    const members = [...leaves], regions: ContainerBox[] = [];
    for (const child of groups.filter(candidate => candidate.parent === id)) {
      const placed = region(child.id, depth + 1);
      const dx = Math.max(padding, width - padding + (members.length || regions.length ? regionGap : 0)), dy = top;
      for (const box of placed.members) { box.x += dx; box.y += dy; }
      for (const box of placed.regions) { box.x += dx; box.y += dy; }
      for (const grid of placed.grids) grid.slots = grid.slots.map(slot => slot + (horizontal ? dy : dx));
      members.push(...placed.members); regions.push(...placed.regions); grids.push(...placed.grids);
      width = dx + placed.width + padding; height = Math.max(height, dy + placed.height + padding);
    }
    if (group) {
      width = Math.max(width, measure(group.label, theme.fontSize).width + 56, 180);
      height = Math.max(height, header + 88);
      regions.push({ x: 0, y: 0, width, height, depth, ref: { id: `usecase-${group.id}`, originalId: group.id, label: group.label, kind: group.kind ?? 'boundary', header } });
    }
    return { width, height, members, regions, grids };
  }
  const placed = region(undefined, 0);
  containers.push(...placed.regions); buckets.push(...placed.grids);
  const minAlong = Math.min(0, ...cases.map(box => horizontal ? box.x : box.y), ...containers.map(box => horizontal ? box.x : box.y));
  const maxAlong = Math.max(180, ...cases.map(box => horizontal ? box.x + box.width : box.y + box.height), ...containers.map(box => horizontal ? box.x + box.width : box.y + box.height));
  const related = (actor: NodeBox): NodeBox[] => edges.flatMap(ref => ref.edge.from === actor.ref.node.id ? [byId.get(ref.edge.to)!]
    : ref.edge.to === actor.ref.node.id ? [byId.get(ref.edge.from)!] : []).filter(box => box !== actor);
  const arm = (box: NodeBox) => horizontal ? 35 * box.height / box.ref.renderHeight : box.width / 2;
  const center = (box: NodeBox) => box[axis] + box[size] / 2;
  const positionActor = (actor: NodeBox, cross: number, far: boolean): void => {
    actor[axis] = cross - arm(actor);
    if (horizontal) actor.x = far ? maxAlong + regionGap : minAlong - regionGap - actor.width;
    else actor.y = far ? maxAlong + regionGap : minAlong - regionGap - actor.height;
  };
  const positioned: NodeBox[] = [];
  for (const [index, actor] of actors.entries()) {
    const targets = related(actor).filter(box => caseIds.has(box.ref.node.id));
    const mean = targets.length ? targets.reduce((sum, box) => sum + center(box), 0) / targets.length : index * (actor[size] + gap);
    positionActor(actor, mean, false);
    while (positioned.some(box => intersects(box, actor, 16))) actor[axis] += actor[size] + gap;
    positioned.push(actor);
  }
  const segments = edges.filter(ref => ref.edge.from !== ref.edge.to).map(ref => ({ ref, source: byId.get(ref.edge.from)!, target: byId.get(ref.edge.to)! }));
  function score(): number {
    let cost = 0;
    const lines = segments.map(segment => ({ ...segment, start: directEndpoint(segment.source, segment.target), end: directEndpoint(segment.target, segment.source) }));
    for (const line of lines) {
      const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y;
      cost += Math.hypot(dx, dy) / 40 * (edgeKind(line.ref.edge, 'usecase') === 'include' ? 1.25 : 1);
      for (const box of nodes) {
        if (box === line.source || box === line.target) continue;
        let hit: boolean;
        if (box.ref.kind === 'usecase') {
          const rx = box.width / 2 + 5, ry = box.height / 2 + 5;
          const startX = (line.start.x - box.x - box.width / 2) / rx, startY = (line.start.y - box.y - box.height / 2) / ry;
          const unitX = dx / rx, unitY = dy / ry, squared = unitX * unitX + unitY * unitY;
          const fraction = squared ? Math.max(0, Math.min(1, -(startX * unitX + startY * unitY) / squared)) : 0;
          hit = Math.hypot(startX + unitX * fraction, startY + unitY * fraction) < 1;
        } else hit = segmentIntersectsRect(line.start, line.end, box, 4);
        if (hit) cost += 1_000_000;
      }
    }
    for (let index = 0; index < lines.length; index++) for (const other of lines.slice(index + 1)) {
      const line = lines[index];
      const turn = (first: Point, last: Point, point: Point) => (last.x - first.x) * (point.y - first.y) - (last.y - first.y) * (point.x - first.x);
      if (turn(line.start, line.end, other.start) * turn(line.start, line.end, other.end) < -0.01
        && turn(other.start, other.end, line.start) * turn(other.start, other.end, line.end) < -0.01) cost += 10_000;
    }
    return cost;
  }
  let best = score();
  for (let pass = 0; pass < 6; pass++) {
    const before = best;
    for (const grid of buckets) for (const box of grid.boxes) {
      const previous = box[axis];
      let chosen = previous, swapped: NodeBox | undefined;
      for (const slot of grid.slots) {
        const other = grid.boxes.find(candidate => candidate !== box && Math.abs(center(candidate) - slot) < 0.01);
        const otherPosition = other?.[axis];
        box[axis] = slot - box[size] / 2;
        if (other) other[axis] = previous + box[size] / 2 - other[size] / 2;
        const candidate = score();
        if (candidate < best - 0.01) { best = candidate; chosen = box[axis]; swapped = other; }
        box[axis] = previous;
        if (other) other[axis] = otherPosition!;
      }
      box[axis] = chosen;
      if (swapped) swapped[axis] = previous + box[size] / 2 - swapped[size] / 2;
    }
    for (const actor of actors) {
      const previous = { x: actor.x, y: actor.y };
      let chosen = previous;
      const targets = related(actor), positions = targets.map(box => box.ref.kind === 'actor' ? box[axis] + arm(box) : center(box));
      if (positions.length) positions.push(positions.reduce((sum, value) => sum + value, 0) / positions.length);
      const lower = Math.min(0, ...cases.map(center)), upper = Math.max(placed.height, placed.width, ...cases.map(center));
      const step = Math.max(actor[size] / 2 + 8, gap);
      for (let value = lower; value <= upper && positions.length < 80; value += step) positions.push(value);
      for (const cross of positions) for (const far of [false, true]) {
        positionActor(actor, cross, far);
        if (actors.some(other => other !== actor && intersects(actor, other, 16))) continue;
        const candidate = score();
        if (candidate < best - 0.01) { best = candidate; chosen = { x: actor.x, y: actor.y }; }
      }
      Object.assign(actor, chosen);
    }
    if (before - best < 0.01) break;
  }
  return { nodes, containers, routes: [], width: placed.width, height: placed.height };
}

function routeEdges(edges: EdgeRef[], result: LayoutResult, direction: 'TB' | 'LR', theme: Theme, type: DiagramSpec['type']): void {
  const byId = new Map(result.nodes.map(box => [box.ref.node.id, box]));
  const clearance = Math.min(12, theme.gap / 4);
  const obstacles: Rect[] = result.nodes.map(box => ({ x: box.x - clearance, y: box.y - clearance, width: box.width + clearance * 2, height: box.height + clearance * 2 }));
  for (const box of result.nodes) if (box.caption) obstacles.push({ x: box.x + box.caption.x - 2, y: box.y + box.caption.y - 2, width: box.caption.width + 4, height: box.caption.height + 4 });
  for (const box of result.containers) {
    // Lane entry may cross the header's empty area, while still avoiding its title.
    if (box.ref.kind === 'lane') {
      const label = measure(box.ref.label, theme.fontSize);
      obstacles.push({ x: box.x + 12, y: box.y + 6, width: label.width + 8, height: label.height + 8 });
    }
    else obstacles.push({ x: box.x + 3, y: box.y + 3, width: box.width - 6, height: box.ref.header - 3 });
  }
  const counts = new Map<string, number>();
  const assignments = edges.map(ref => {
    const source = byId.get(ref.edge.from)!;
    const target = byId.get(ref.edge.to)!;
    const sourceX = source.x + source.width / 2, sourceY = source.y + source.height / 2;
    const targetX = target.x + target.width / 2, targetY = target.y + target.height / 2;
    const forward = direction === 'TB' ? targetY > sourceY : targetX > sourceX;
    const side: Side = source === target ? 'right' : forward && target.ref.kind === 'end' ? (direction === 'TB' ? 'bottom' : 'right')
      : Math.abs(targetX - sourceX) > Math.abs(targetY - sourceY) ? (sourceX < targetX ? 'right' : 'left') : (sourceY < targetY ? 'bottom' : 'top');
    const targetSide: Side = source === target ? 'top' : target.ref.kind === 'end' ? (direction === 'TB' ? 'top' : 'left')
      : side === 'right' ? 'left' : side === 'left' ? 'right' : side === 'bottom' ? 'top' : 'bottom';
    const sourceKey = `${source.ref.id}-${side}`, targetKey = `${target.ref.id}-${targetSide}`;
    counts.set(sourceKey, (counts.get(sourceKey) ?? 0) + 1); counts.set(targetKey, (counts.get(targetKey) ?? 0) + 1);
    return { ref, source, target, side, targetSide, sourceKey, targetKey };
  });
  const seen = new Map<string, number>();
  const used = result.routes.flatMap(route => route.paths);
  for (const item of assignments) {
    if (type === 'usecase' && item.source !== item.target) {
      const route = [directEndpoint(item.source, item.target), directEndpoint(item.target, item.source)];
      result.routes.push({ ref: item.ref, paths: [route] });
      used.push(route);
      continue;
    }
    const sourceIndex = (seen.get(item.sourceKey) ?? 0) + 1, targetIndex = (seen.get(item.targetKey) ?? 0) + 1;
    seen.set(item.sourceKey, sourceIndex); seen.set(item.targetKey, targetIndex);
    const sameRow = Math.abs(item.source.y + item.source.height / 2 - item.target.y - item.target.height / 2) < 0.01;
    const sameColumn = Math.abs(item.source.x + item.source.width / 2 - item.target.x - item.target.width / 2) < 0.01;
    const straight = item.source !== item.target && (sameRow || sameColumn);
    const sourceFraction = 0.5;
    const targetFraction = straight ? 0.5 : targetIndex / ((counts.get(item.targetKey) ?? 1) + 1);
    const sides: Side[] = [item.side, ...(['left', 'right', 'top', 'bottom'] as Side[]).filter(side => side !== item.side)];
    const targetSides: Side[] = [item.targetSide, ...(['left', 'right', 'top', 'bottom'] as Side[]).filter(side => side !== item.targetSide)];
    let route: Point[] | undefined, bestScore = Infinity;
    for (const side of sides) {
      for (const targetSide of targetSides) {
        if (item.source === item.target && side === targetSide) continue;
        const endpoints = [[item.source, side, sourceFraction], [item.target, targetSide, targetFraction]] as const;
        const anchors = endpoints.map(([box, attach, fraction]) => {
          const symbol = box.ref.symbol;
          const bounds = symbol ? { x: box.x + symbol.x * box.width / box.ref.renderWidth, y: box.y + symbol.y * box.height / box.ref.renderHeight,
            width: symbol.width * box.width / box.ref.renderWidth, height: symbol.height * box.height / box.ref.renderHeight } : box;
          const x = attach === 'left' ? bounds.x : attach === 'right' ? bounds.x + bounds.width : bounds.x + bounds.width * fraction;
          const y = attach === 'top' ? bounds.y : attach === 'bottom' ? bounds.y + bounds.height : bounds.y + bounds.height * fraction;
          const distance = Math.max(clearance + 1, Math.min(28, theme.gap / 2));
          const stub = { x: attach === 'right' ? box.x + box.width + distance : attach === 'left' ? box.x - distance : x,
            y: attach === 'bottom' ? box.y + box.height + distance : attach === 'top' ? box.y - distance : y };
          return { port: { x, y }, stub };
        });
        // A stub may cross only its own endpoint's expanded obstacle.
        const clear = anchors.every((anchor, index) => {
          const box = index ? item.target : item.source;
          return !obstacles.some(obstacle => {
            if (Math.abs(obstacle.x - (box.x - clearance)) < 0.01 && Math.abs(obstacle.y - (box.y - clearance)) < 0.01) return false;
            return anchor.port.y === anchor.stub.y
              ? anchor.port.y > obstacle.y && anchor.port.y < obstacle.y + obstacle.height && Math.max(anchor.port.x, anchor.stub.x) > obstacle.x && Math.min(anchor.port.x, anchor.stub.x) < obstacle.x + obstacle.width
              : anchor.port.x > obstacle.x && anchor.port.x < obstacle.x + obstacle.width && Math.max(anchor.port.y, anchor.stub.y) > obstacle.y && Math.min(anchor.port.y, anchor.stub.y) < obstacle.y + obstacle.height;
          });
        });
        if (!clear) continue;
        const middle = obstacleRouter(anchors[0].stub, anchors[1].stub, obstacles, used);
        if (!middle) continue;
        const candidate = simplify([anchors[0].port, ...middle, anchors[1].port]);
        let length = 0, overlaps = 0, crossings = 0;
        for (let i = 1; i < candidate.length; i++) {
          const a = candidate[i - 1], b = candidate[i], horizontal = Math.abs(a.y - b.y) < 0.01;
          length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
          for (const path of used) for (let j = 1; j < path.length; j++) {
            const c = path[j - 1], d = path[j], otherHorizontal = Math.abs(c.y - d.y) < 0.01;
            if (horizontal && otherHorizontal && Math.abs(a.y - c.y) < 0.01) overlaps += Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
            else if (!horizontal && !otherHorizontal && Math.abs(a.x - c.x) < 0.01) overlaps += Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
            else if (horizontal !== otherHorizontal) {
              const x = horizontal ? c.x : a.x, y = horizontal ? a.y : c.y;
              if (x > Math.min(a.x, b.x, c.x, d.x) + 0.01 && x < Math.max(a.x, b.x, c.x, d.x) - 0.01
                && y > Math.min(a.y, b.y, c.y, d.y) + 0.01 && y < Math.max(a.y, b.y, c.y, d.y) - 0.01) crossings++;
            }
          }
        }
        const sourceFanout = assignments.filter(candidate => candidate.source === item.source && candidate.side === item.side).length;
        const targetFanin = assignments.filter(candidate => candidate.target === item.target && candidate.targetSide === item.targetSide).length;
        const score = length + Math.max(0, candidate.length - 2) * 28 + overlaps * 8 + crossings * 80
          + (side === item.side ? 0 : sourceFanout > 1 ? 240 : 32)
          + (targetSide === item.targetSide ? 0 : targetFanin > 1 ? 160 : 32)
          + (item.target.ref.kind === 'end' && targetSide !== item.targetSide ? 200 : 0);
        if (score < bestScore) { bestScore = score; route = candidate; }
      }
    }
    if (!route) throw new Error(`Unable to route relationship ${item.ref.edge.from} → ${item.ref.edge.to}.`);
    used.push(route);
    result.routes.push({ ref: item.ref, paths: [route] });
  }
}

function clipEndpoint(point: Point, neighbor: Point, box: NodeBox): void {
  if (box.width !== box.ref.renderWidth || box.height !== box.ref.renderHeight) {
    const scaleX = box.width / box.ref.renderWidth, scaleY = box.height / box.ref.renderHeight;
    const local = { x: (point.x - box.x) / scaleX, y: (point.y - box.y) / scaleY };
    const localNeighbor = { x: (neighbor.x - box.x) / scaleX, y: (neighbor.y - box.y) / scaleY };
    clipEndpoint(local, localNeighbor, { ...box, x: 0, y: 0, width: box.ref.renderWidth, height: box.ref.renderHeight });
    point.x = box.x + local.x * scaleX; point.y = box.y + local.y * scaleY;
    neighbor.x = box.x + localNeighbor.x * scaleX; neighbor.y = box.y + localNeighbor.y * scaleY;
    return;
  }
  if (box.ref.symbol) {
    const symbol = box.ref.symbol;
    if (Math.abs(point.y - neighbor.y) < .01) point.y = neighbor.y = box.y + symbol.y + symbol.height / 2;
    else point.x = neighbor.x = box.x + symbol.x + symbol.width / 2;
    clipEndpoint(point, neighbor, { ...box, x: box.x + symbol.x, y: box.y + symbol.y, width: symbol.width, height: symbol.height, ref: { ...box.ref, symbol: undefined, renderWidth: symbol.width, renderHeight: symbol.height } });
    return;
  }
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


function markerDefinitions(prefix: string, theme: Theme): string {
  const stroke = esc(theme.primary), background = esc(theme.background === 'transparent' ? theme.surface : theme.background), solid = esc(theme.primary);
  return `<defs><marker id="${prefix}-arrow" viewBox="-1 -1 14 14" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1 L11 6 L1 11 Z" fill="${stroke}"/></marker><marker id="${prefix}-open" viewBox="-1 -1 14 14" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1 L11 6 L1 11" fill="none" stroke="${stroke}" stroke-width="1.6"/></marker><marker id="${prefix}-triangle" viewBox="-2 -2 18 16" refX="13" refY="6" markerWidth="18" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 0 L13 6 L1 12 Z" fill="${background}" stroke="${stroke}" stroke-width="1.5"/></marker><marker id="${prefix}-aggregation" viewBox="-2 -2 24 16" refX="0" refY="6" markerWidth="24" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 6 L10 0 L20 6 L10 12 Z" fill="${background}" stroke="${stroke}" stroke-width="1.5"/></marker><marker id="${prefix}-composition" viewBox="-2 -2 24 16" refX="0" refY="6" markerWidth="24" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 6 L10 0 L20 6 L10 12 Z" fill="${solid}" stroke="${solid}" stroke-width="1.5"/></marker></defs>`;
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
  if (w !== ref.renderWidth || h !== ref.renderHeight) {
    const scaleX = w / ref.renderWidth, scaleY = h / ref.renderHeight;
    const virtual = { ...box, x: 0, y: 0, width: ref.renderWidth, height: ref.renderHeight, caption: undefined };
    const caption = box.caption ? text(x + box.caption.x + box.caption.width / 2, y + box.caption.y + 2 + box.caption.size, box.caption.value, theme, { size: box.caption.size, fill: theme.muted }) : '';
    return `<g transform="translate(${numeric(x)} ${numeric(y)}) scale(${scaleX} ${scaleY})">${renderNode(virtual, spec)}</g>${caption}`;
  }
  const stroke = esc(node.style?.primary && !node.style.border ? theme.primary : theme.border), surface = esc(theme.surface), ink = esc(theme.primary);
  const common = `fill="${surface}" stroke="${stroke}" stroke-width="${numeric(theme.lineWidth)}"`;
  const rect = `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(h)}"`;
  let shape = '', content = '';
  const symbol = ref.symbol ?? { x: 0, y: 0, width: w, height: h };
  const symbolX = x + symbol.x, symbolY = y + symbol.y;
  if (kind === 'start' || kind === 'end') {
    shape = `<circle cx="${numeric(symbolX + symbol.width / 2)}" cy="${numeric(symbolY + symbol.height / 2)}" r="${numeric(symbol.width / 2 - theme.lineWidth / 2)}" fill="${kind === 'start' ? ink : surface}" stroke="${ink}" stroke-width="${numeric(theme.lineWidth)}"/>`;
    if (kind === 'end') shape += `<circle cx="${numeric(symbolX + symbol.width / 2)}" cy="${numeric(symbolY + symbol.height / 2)}" r="${numeric(symbol.width / 2 - 6)}" fill="${ink}"/>`;
  } else if (kind === 'fork' || kind === 'join') {
    shape = `<rect x="${numeric(symbolX)}" y="${numeric(symbolY)}" width="${numeric(symbol.width)}" height="${numeric(symbol.height)}" rx="2" fill="${ink}"/>`;
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
  if (ref.internalCaption) {
    const caption = ref.internalCaption;
    content += text(x + caption.x + caption.width / 2, y + caption.y + 2 + caption.size, caption.value, theme, { size: caption.size, fill: theme.muted });
  }
  if (box.caption) content += text(x + box.caption.x + box.caption.width / 2, y + box.caption.y + 2 + box.caption.size, box.caption.value, theme, { size: box.caption.size, fill: theme.muted });
  return `<g class="uml-node uml-node-${kind}" data-editor-key="nodes/${spec.nodes!.indexOf(ref.sourceNode)}" data-node-id="${esc(node.id)}"${node.lane ? ` data-lane-id="${esc(node.lane)}"` : ''}${node.group ? ` data-group-id="${esc(node.group)}"` : ''}><title>${esc([ref.sourceNode.label, ref.sourceNode.detail, ...(ref.sourceNode.attributes ?? []), ...(ref.sourceNode.operations ?? [])].filter(Boolean).join('\n'))}</title>${shape}${content}</g>`;
}

function segmentIntersectsRect(a: Point, b: Point, box: Rect, margin = 0): boolean {
  let low = 0, high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, box.x - margin, box.x + box.width + margin],
    [a.y, b.y - a.y, box.y - margin, box.y + box.height + margin],
  ]) {
    if (Math.abs(delta) < 0.001) { if (start < min || start > max) return false; }
    else {
      const first = (min - start) / delta, last = (max - start) / delta;
      low = Math.max(low, Math.min(first, last)); high = Math.min(high, Math.max(first, last));
      if (low > high) return false;
    }
  }
  return true;
}

function segmentRectDistance(a: Point, b: Point, box: Rect): number {
  if (segmentIntersectsRect(a, b, box)) return 0;
  const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
  const corners = [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height }, { x: box.x + box.width, y: box.y + box.height }];
  const distances = corners.map(point => {
    const fraction = squared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared)) : 0;
    return Math.hypot(point.x - a.x - dx * fraction, point.y - a.y - dy * fraction);
  });
  for (const point of [a, b]) distances.push(Math.hypot(Math.max(box.x - point.x, 0, point.x - box.x - box.width), Math.max(box.y - point.y, 0, point.y - box.y - box.height)));
  return Math.min(...distances);
}

function labelIntersectsNode(label: Rect, node: NodeBox): boolean {
  if (!intersects(label, node, 5)) return false;
  const dx = Math.max(label.x - 5 - node.x - node.width / 2, 0, node.x + node.width / 2 - label.x - label.width - 5) / (node.width / 2);
  const dy = Math.max(label.y - 5 - node.y - node.height / 2, 0, node.y + node.height / 2 - label.y - label.height - 5) / (node.height / 2);
  if (node.ref.kind === 'decision') return dx + dy < 1;
  if (['usecase', 'start', 'end'].includes(node.ref.kind)) return dx * dx + dy * dy < 1;
  return true;
}

function placeLabels(routes: Route[], nodes: NodeBox[], containers: ContainerBox[], direction: 'TB' | 'LR'): EdgeLabelBox[] {
  const occupied: Rect[] = [];
  for (const box of nodes) if (box.caption) occupied.push({ x: box.x + box.caption.x, y: box.y + box.caption.y, width: box.caption.width, height: box.caption.height });
  for (const box of containers) occupied.push(box.ref.kind === 'lane' && direction === 'LR'
    ? { x: box.x, y: box.y, width: box.ref.header, height: box.height }
    : { x: box.x, y: box.y, width: box.width, height: box.ref.header });
  const allSegments: { a: Point; b: Point; route: Route; length: number; offset: number }[] = [];
  for (const route of routes) {
    let offset = 0;
    for (const path of route.paths) for (let index = 1; index < path.length; index++) {
      const a = path[index - 1], b = path[index], length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length > 0.01) allSegments.push({ a, b, route, length, offset });
      offset += length;
    }
  }
  const placed: EdgeLabelBox[] = [];
  for (const route of routes) for (const label of route.ref.labels) {
    const candidates: { box: EdgeLabelBox; score: number }[] = [];
    const segments = allSegments.filter(segment => segment.route === route);
    const others = allSegments.filter(segment => segment.route !== route);
    const total = segments.reduce((sum, segment) => sum + segment.length, 0);
    const branch = label.role === 'main' && nodes.find(node => node.ref.node.id === route.ref.edge.from)?.ref.kind === 'decision';
    const desired = label.role === 'from' || branch ? Math.min(36, total / 2) : label.role === 'to' ? total - Math.min(36, total / 2) : total / 2;
    for (const segment of segments) {
      const { a, b, length, offset } = segment;
      const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
      const overlaps = others.flatMap(other => {
        const cross = (point: Point) => Math.abs((point.x - a.x) * uy - (point.y - a.y) * ux);
        if (cross(other.a) > 0.01 || cross(other.b) > 0.01) return [];
        const first = (other.a.x - a.x) * ux + (other.a.y - a.y) * uy;
        const last = (other.b.x - a.x) * ux + (other.b.y - a.y) * uy;
        const start = Math.max(0, Math.min(first, last)), end = Math.min(length, Math.max(first, last));
        return end > start + 0.01 ? [{ start, end }] : [];
      });
      const cuts = [...new Set([0, length, ...overlaps.flatMap(overlap => [overlap.start, overlap.end])])].sort((first, second) => first - second);
      for (let index = 1; index < cuts.length; index++) {
        const start = cuts[index - 1], end = cuts[index], middle = (start + end) / 2;
        const shared = overlaps.some(overlap => middle > overlap.start && middle < overlap.end);
        const positions = new Set([middle, start + (end - start) / 4, end - (end - start) / 4,
          Math.max(start, Math.min(end, desired - offset))]);
        const steps = Math.min(60, Math.ceil((end - start) / 12));
        for (let step = 0; step <= steps; step++) positions.add(start + (end - start) * step / Math.max(1, steps));
        const shifts = end - start < Math.abs(ux) * label.width + Math.abs(uy) * label.height + 16 ? [0, -12, 12, -24, 24] : [0];
        for (const position of positions) for (const gap of [8, 12, 18, 28, 44, 68, 100]) for (const sign of [1, -1]) for (const shift of shifts) {
          const anchor = { x: a.x + ux * position, y: a.y + uy * position };
          const normalX = -uy * sign, normalY = ux * sign;
          const distance = gap + Math.abs(normalX) * label.width / 2 + Math.abs(normalY) * label.height / 2;
          const box: EdgeLabelBox = { x: anchor.x + normalX * distance + ux * shift - label.width / 2, y: anchor.y + normalY * distance + uy * shift - label.height / 2,
            width: label.width, height: label.height, value: label.value, size: label.size, ref: route.ref, role: label.role, anchor };
          const nearest = Math.min(...others.map(other => segmentRectDistance(other.a, other.b, box)));
          const own = segmentRectDistance(a, b, box), ambiguous = shared || nearest < own + 3;
          box.leader = ambiguous || own > 18;
          candidates.push({ box, score: Math.abs(offset + position - desired) * (branch || label.role !== 'main' ? 0.3 : 0.1)
            + gap * 2 + Math.abs(shift) + (shared ? 4000 : ambiguous ? 1000 : 0) + (gap > 18 ? 500 : 0) });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const sharedAnchor = (anchor: Point) => others.some(other => segmentRectDistance(other.a, other.b, { ...anchor, width: 0, height: 0 }) < 0.01);
    let chosen: EdgeLabelBox | undefined;
    for (const candidate of candidates) {
      if (nodes.some(node => labelIntersectsNode(candidate.box, node))) continue;
      if (occupied.some(box => intersects(candidate.box, box, 5))) continue;
      if (allSegments.some(({ a, b }) => segmentIntersectsRect(a, b, candidate.box, 4))) continue;
      if (candidate.box.leader && sharedAnchor(candidate.box.anchor)) continue;
      chosen = candidate.box;
      break;
    }
    if (!chosen) {
      const candidate = (candidates.find(candidate => !sharedAnchor(candidate.box.anchor)) ?? candidates[0]).box;
      chosen = { ...candidate, leader: true };
      while (nodes.some(node => labelIntersectsNode(chosen!, node)) || occupied.some(box => intersects(chosen!, box, 5))
        || allSegments.some(({ a, b }) => segmentIntersectsRect(a, b, chosen!, 4))) chosen.y -= label.height + 12;
    }
    placed.push(chosen); occupied.push(chosen);
  }
  return placed;
}

function occupiedNode(box: NodeBox): Rect {
  const caption = box.caption;
  const left = Math.min(0, caption?.x ?? 0), top = Math.min(0, caption?.y ?? 0);
  return { x: box.x + left, y: box.y + top,
    width: Math.max(box.width, caption ? caption.x + caption.width : 0) - left,
    height: Math.max(box.height, caption ? caption.y + caption.height : 0) - top };
}

/** A lane is one flow axis; disconnected local fragments still share its centre line. */
function alignLaneFlow(result: LayoutResult, edges: EdgeRef[], spec: DiagramSpec, theme: Theme): boolean {
  if (!spec.lanes?.length || result.containers.some(box => box.ref.kind !== 'lane') || (spec.layout?.maxPerColumn ?? 0) > 0) return false;
  const horizontal = spec.direction === 'LR', axis = horizontal ? 'x' : 'y', cross = horizontal ? 'y' : 'x';
  const size = horizontal ? 'width' : 'height', crossSize = horizontal ? 'height' : 'width';
  const nodes = result.nodes.filter(box => !['start', 'end'].includes(box.ref.kind));
  const byId = new Map(nodes.map(box => [box.ref.node.id, box]));
  const outgoing = new Map<string, EdgeRef[]>(), incoming = new Set<string>();
  for (const edge of edges) {
    const list = outgoing.get(edge.edge.from) ?? [];
    list.push(edge); outgoing.set(edge.edge.from, list); incoming.add(edge.edge.to);
  }
  const feedback = new Set<EdgeRef>(), active = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id); active.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (active.has(edge.edge.to)) feedback.add(edge);
      else visit(edge.edge.to);
    }
    active.delete(id);
  };
  // Find feedback against the complete graph, including hand-offs and terminal entry points.
  for (const node of spec.nodes ?? []) if (node.kind === 'start' || !incoming.has(node.id)) visit(node.id);
  for (const node of spec.nodes ?? []) visit(node.id);
  const forward = edges.filter(edge => !feedback.has(edge) && byId.has(edge.edge.from) && byId.has(edge.edge.to));
  const indegrees = new Map(nodes.map(box => [box.ref.node.id, 0]));
  for (const edge of forward) indegrees.set(edge.edge.to, indegrees.get(edge.edge.to)! + 1);
  const inputOrder = new Map((spec.nodes ?? []).map((node, index) => [node.id, index]));
  const pending = nodes.filter(box => !indegrees.get(box.ref.node.id)).map(box => box.ref.node.id);
  const ordered: NodeBox[] = [];
  while (pending.length) {
    pending.sort((a, b) => inputOrder.get(a)! - inputOrder.get(b)!);
    const id = pending.shift()!;
    ordered.push(byId.get(id)!);
    for (const edge of outgoing.get(id) ?? []) {
      if (!indegrees.has(edge.edge.to) || feedback.has(edge)) continue;
      const degree = indegrees.get(edge.edge.to)! - 1;
      indegrees.set(edge.edge.to, degree);
      if (!degree) pending.push(edge.edge.to);
    }
  }
  const lanes = result.containers;
  const laneOf = (box: NodeBox) => box.ref.node.lane ?? lanes.find(lane => lane.ref.originalId.startsWith('__uml_unassigned_lane__'))?.ref.originalId;
  const header = Math.max(0, ...lanes.map(lane => lane.ref.header));
  const start = header + 24, gap = spec.layout?.elementGap ?? 48;
  const centers = new Map(nodes.map(box => [box.ref.node.id, start + box[size] / 2]));
  const constraints = new Map<string, { target: NodeBox; distance: number }[]>();
  const constrain = (from: NodeBox, target: NodeBox, distance: number) => {
    const list = constraints.get(from.ref.node.id) ?? [];
    list.push({ target, distance }); constraints.set(from.ref.node.id, list);
  };
  const separation = (from: NodeBox, to: NodeBox, labelGap = 0) => {
    const a = occupiedNode(from), b = occupiedNode(to);
    return a[axis] + a[size] - from[axis] - from[size] / 2
      + to[axis] + to[size] / 2 - b[axis] + Math.max(gap, labelGap);
  };
  for (const edge of forward) {
    const from = byId.get(edge.edge.from)!, to = byId.get(edge.edge.to)!;
    constrain(from, to, laneOf(from) === laneOf(to) ? separation(from, to, Math.max(0, ...edge.labels.map(label => label[size] + 16))) : 0);
  }
  const previous = new Map<string, NodeBox>();
  for (const node of ordered) {
    const lane = laneOf(node)!;
    if (previous.has(lane)) constrain(previous.get(lane)!, node, separation(previous.get(lane)!, node));
    previous.set(lane, node);
  }
  for (const node of ordered) for (const constraint of constraints.get(node.ref.node.id) ?? []) {
    centers.set(constraint.target.ref.node.id, Math.max(centers.get(constraint.target.ref.node.id)!, centers.get(node.ref.node.id)! + constraint.distance));
  }
  let offset = 0;
  for (const lane of lanes) {
    const members = nodes.filter(node => laneOf(node) === lane.ref.originalId);
    const span = Math.max(horizontal ? 180 : 240, horizontal ? 0 : measure(lane.ref.label, theme.fontSize).width + 36,
      ...members.map(node => occupiedNode(node)[crossSize] + 48));
    lane[cross] = offset; lane[crossSize] = span; lane[axis] = 0; lane.ref.header = header;
    for (const node of members) {
      const bounds = occupiedNode(node);
      node[cross] += offset + span / 2 - bounds[cross] - bounds[crossSize] / 2;
      node[axis] = centers.get(node.ref.node.id)! - node[size] / 2;
    }
    offset += span;
  }
  return true;
}

function equalizeLaneExtents(result: LayoutResult, direction: 'TB' | 'LR'): void {
  const size = direction === 'LR' ? 'width' : 'height', axis = direction === 'LR' ? 'x' : 'y';
  const lanes = result.containers.filter(box => box.ref.kind === 'lane');
  const end = Math.max(0, ...lanes.map(box => box[axis] + box[size]),
    ...result.nodes.filter(box => !['start', 'end'].includes(box.ref.kind)).map(box => { const bounds = occupiedNode(box); return bounds[axis] + bounds[size] + 24; }));
  for (const lane of lanes) lane[size] = end - lane[axis];
}

/** Same-row constraints are accepted only when they preserve every column's node order. */
function alignConnectedNodes(result: LayoutResult, edges: EdgeRef[], columns: Map<string, string>, spec: DiagramSpec): void {
  const horizontal = Boolean(spec.lanes?.length) && spec.direction === 'LR';
  const axis = horizontal ? 'x' : 'y', cross = horizontal ? 'y' : 'x';
  const size = horizontal ? 'width' : 'height', crossSize = horizontal ? 'height' : 'width';
  const nodes = result.nodes.filter(box => !['start', 'end'].includes(box.ref.kind));
  const index = new Map(nodes.map((box, i) => [box.ref.node.id, i]));
  const parents = nodes.map((_, i) => i);
  const find = (i: number): number => parents[i] === i ? i : (parents[i] = find(parents[i]));
  const bounds = nodes.map(occupiedNode), gap = spec.layout?.elementGap ?? 24;
  const labelGaps = new Map<string, number>();
  for (const ref of edges) {
    const from = index.get(ref.edge.from), to = index.get(ref.edge.to);
    if (from === undefined || to === undefined) continue;
    const key = [from, to].sort((first, second) => first - second).join(':');
    labelGaps.set(key, Math.max(labelGaps.get(key) ?? gap, ...ref.labels.map(label => label[size] + 16)));
  }
  const separation = (from: number, to: number) => Math.max(gap, labelGaps.get([from, to].sort((first, second) => first - second).join(':')) ?? gap);
  const center = (i: number) => nodes[i][axis] + nodes[i][size] / 2;
  const constraints: { from: number; to: number; distance: number }[] = [];
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    if (bounds[a][cross] >= bounds[b][cross] + bounds[b][crossSize] + gap / 2
      || bounds[b][cross] >= bounds[a][cross] + bounds[a][crossSize] + gap / 2) continue;
    const [from, to] = center(a) <= center(b) ? [a, b] : [b, a];
    const distance = bounds[from][axis] + bounds[from][size] - center(from) + center(to) - bounds[to][axis] + separation(from, to);
    constraints.push({ from, to, distance });
  }
  // Preserve layer precedence for branches that do not share an overlapping column footprint.
  for (const edge of edges) {
    const a = index.get(edge.edge.from), b = index.get(edge.edge.to);
    if (a === undefined || b === undefined || columns.get(nodes[a].ref.id) !== columns.get(nodes[b].ref.id) || Math.abs(center(a) - center(b)) < 0.01) continue;
    // In a natural LR layout, different y centres describe branches, not flow precedence.
    // Folded columns still run vertically, including when the original direction was LR.
    if (!horizontal && spec.direction === 'LR' && !/-column\d+$/.test(columns.get(nodes[a].ref.id)!)) continue;
    const [from, to] = center(a) < center(b) ? [a, b] : [b, a];
    constraints.push({ from, to, distance: bounds[from][axis] + bounds[from][size] - center(from) + center(to) - bounds[to][axis] + separation(from, to) });
  }
  const adjacency = (): Map<number, number[]> => {
    const graph = new Map<number, number[]>();
    for (const constraint of constraints) {
      const from = find(constraint.from), to = find(constraint.to);
      if (from !== to) { const next = graph.get(from) ?? []; next.push(to); graph.set(from, next); }
    }
    return graph;
  };
  const reachable = (graph: Map<number, number[]>, from: number, to: number): boolean => {
    const pending = [from], visited = new Set<number>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === to) return true;
      if (visited.has(current)) continue;
      visited.add(current); pending.push(...(graph.get(current) ?? []));
    }
    return false;
  };
  // Preserve neighbours that ELK already placed on one centre line, even within one region.
  const candidates = edges.flatMap(ref => {
    const from = index.get(ref.edge.from), to = index.get(ref.edge.to);
    return from === undefined || to === undefined || (columns.get(nodes[from].ref.id) === columns.get(nodes[to].ref.id) && Math.abs(center(from) - center(to)) >= 0.01)
      ? [] : [{ from, to, difference: Math.abs(center(from) - center(to)) }];
  }).sort((a, b) => a.difference - b.difference);
  const related = new Map<string, Set<number>>();
  for (const edge of edges) {
    const from = index.get(edge.edge.from), to = index.get(edge.edge.to);
    if (from === undefined || to === undefined) continue;
    for (const [key, node] of [[`from:${from}`, to], [`to:${to}`, from]] as const) {
      const peers = related.get(key) ?? new Set<number>();
      peers.add(node);
      related.set(key, peers);
    }
  }
  for (const peers of related.values()) {
    const values = [...peers];
    for (let first = 0; first < values.length; first++) for (let second = first + 1; second < values.length; second++) {
      const a = values[first]!, b = values[second]!;
      if (columns.get(nodes[a].ref.id) === columns.get(nodes[b].ref.id)) continue;
      candidates.push({ from: a, to: b, difference: Math.abs(center(a) - center(b)) });
    }
  }
  candidates.sort((a, b) => a.difference - b.difference);
  for (const candidate of candidates) {
    const from = find(candidate.from), to = find(candidate.to);
    if (from === to) continue;
    const graph = adjacency();
    if (!reachable(graph, from, to) && !reachable(graph, to, from)) parents[to] = from;
  }
  const values = new Map<number, number>(), indegrees = new Map<number, number>();
  const outgoing = new Map<number, typeof constraints>();
  const columnTops = new Map<string, number>();
  nodes.forEach((box, i) => { const region = columns.get(box.ref.id)!.replace(/-column\d+$/, ''); columnTops.set(region, Math.min(columnTops.get(region) ?? Infinity, bounds[i][axis])); });
  nodes.forEach((box, i) => {
    const row = find(i), top = columnTops.get(columns.get(box.ref.id)!.replace(/-column\d+$/, ''))!;
    values.set(row, Math.max(values.get(row) ?? -Infinity, top + center(i) - bounds[i][axis])); indegrees.set(row, 0);
  });
  for (const constraint of constraints) {
    const from = find(constraint.from), to = find(constraint.to);
    if (from === to) continue;
    const list = outgoing.get(from) ?? []; list.push({ ...constraint, from, to }); outgoing.set(from, list);
    indegrees.set(to, (indegrees.get(to) ?? 0) + 1);
  }
  const pending = [...indegrees].filter(([, degree]) => !degree).map(([row]) => row);
  for (let i = 0; i < pending.length; i++) for (const constraint of outgoing.get(pending[i]) ?? []) {
    values.set(constraint.to, Math.max(values.get(constraint.to)!, values.get(constraint.from)! + constraint.distance));
    const degree = indegrees.get(constraint.to)! - 1; indegrees.set(constraint.to, degree);
    if (!degree) pending.push(constraint.to);
  }
  nodes.forEach((box, i) => { box[axis] = values.get(find(i))! - box[size] / 2; });
  // Column lower bounds protect headers; grow original containers inside-out after alignment.
  const groups = new Map((spec.groups ?? []).map(group => [group.id, group.parent]));
  for (const container of [...result.containers].sort((a, b) => b.depth - a.depth)) {
    const members = nodes.filter(box => {
      if (container.ref.kind === 'lane') return box.ref.node.lane === container.ref.originalId || (!box.ref.node.lane && container.ref.originalId.startsWith('__uml_unassigned_lane__'));
      let group = box.ref.node.group;
      while (group) { if (group === container.ref.originalId) return true; group = groups.get(group); }
      return false;
    });
    for (const box of members) { const occupied = occupiedNode(box); container[size] = Math.max(container[size], occupied[axis] + occupied[size] + 24 - container[axis]); }
    for (const child of result.containers) if (child.depth > container.depth && (child.ref.lane === container.ref.lane)
      && (container.ref.kind === 'lane' || groups.get(child.ref.originalId) === container.ref.originalId)) {
      container[size] = Math.max(container[size], child[axis] + child[size] + 24 - container[axis]);
    }
  }
}

/** Reserve exterior terminal bands, rather than moving an end node into an occupied row. */
function placeFlowTerminals(result: LayoutResult, edges: EdgeRef[], direction: 'TB' | 'LR', gap: number): void {
  const starts = result.nodes.filter(box => box.ref.kind === 'start'), ends = result.nodes.filter(box => box.ref.kind === 'end');
  if (!starts.length && !ends.length) return;
  const horizontal = direction === 'LR', axis = horizontal ? 'x' : 'y', cross = horizontal ? 'y' : 'x';
  const size = horizontal ? 'width' : 'height', crossSize = horizontal ? 'height' : 'width';
  const body = result.nodes.filter(box => !['start', 'end'].includes(box.ref.kind));
  const bounds = [...body.map(occupiedNode), ...result.containers];
  const first = Math.min(24, ...bounds.map(box => box[axis]));
  const crossMin = Math.min(24, ...bounds.map(box => box[cross]));
  const crossMax = Math.max(crossMin + 32, ...bounds.map(box => box[cross] + box[crossSize]));
  const successor = edges.find(edge => edge.edge.from === starts[0]?.ref.node.id);
  const anchor = body.find(box => box.ref.node.id === successor?.edge.to);
  const center = anchor ? anchor[cross] + anchor[crossSize] / 2 : (crossMin + crossMax) / 2;
  const reserve = starts.length ? Math.max(...starts.map(box => occupiedNode(box)[size])) + gap : 0;
  for (const box of [...body, ...result.containers]) box[axis] += reserve;
  const last = Math.max(first + reserve, ...body.map(box => { const occupied = occupiedNode(box); return occupied[axis] + occupied[size]; }), ...result.containers.map(box => box[axis] + box[size]));
  for (const [terminals, position] of [[starts, first], [ends, last + gap]] as const) {
    const span = terminals.reduce((total, box) => total + occupiedNode(box)[crossSize] + gap, -gap);
    let cursor = center - span / 2;
    for (const box of terminals) {
      const occupied = occupiedNode(box), offset = occupied[cross] - box[cross];
      box[axis] = position;
      const renderCross = horizontal ? box.ref.renderHeight : box.ref.renderWidth;
      const symbolCenter = box.ref.symbol ? (box.ref.symbol[cross] + box.ref.symbol[crossSize] / 2) * box[crossSize] / renderCross : box[crossSize] / 2;
      box[cross] = terminals.length === 1 ? center - symbolCenter : cursor - offset;
      cursor += occupied[crossSize] + gap;
    }
  }
}

/** Layout every graph family with bundled ELK; sequence and fishbone have dedicated renderers. */
export async function renderGraph(spec: DiagramSpec, suppliedTheme: Theme): Promise<RenderedDiagram> {
  const automaticColumns = spec.layout?.maxPerColumn === undefined;
  spec = { ...spec, layout: resolveLayout(spec) };
  const theme = cleanTheme(suppliedTheme);
  const direction = spec.direction ?? (spec.type === 'usecase' ? 'LR' : 'TB');
  const nodes = (spec.nodes ?? []).map((node, index) => createNode(node, index, spec, theme));
  const edges = (spec.edges ?? []).map((edge, index) => createEdge(edge, index, theme, spec.type));
  const refs = new Map(nodes.map(node => [node.id, node]));
  const containers = new Map<string, ContainerRef>();
  const columns = new Map<string, string>();
  const elk = layoutEngine ??= new ELK();
  let result: LayoutResult;
  if (spec.type === 'usecase' && !spec.lanes?.length) {
    result = layoutUsecases(nodes, edges, spec, theme);
  } else if (spec.lanes?.length) {
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
      const output = await layoutRegions(input, spec, elk, refs, columns, automaticColumns);
      // An empty ELK root has no content-derived size; it still represents a real lane.
      output.width = Math.max(minimumWidth, output.width ?? 0);
      output.height = Math.max(minimumHeight, output.height ?? 0);
      layouts.push(collectLayout(output, refs, containers));
    }
    const crossSize = Math.max(180, ...layouts.map(layout => direction === 'TB' ? layout.height : layout.width));
    let offset = 0;
    result = { nodes: [], containers: [], routes: [], width: 0, height: 0 };
    for (const layout of layouts) {
      const dx = direction === 'TB' ? offset : 0, dy = direction === 'LR' ? offset : 0;
      for (const box of layout.nodes) result.nodes.push({ ...box, x: box.x + dx, y: box.y + dy });
      for (const box of layout.containers) result.containers.push({ ...box, x: box.x + dx, y: box.y + dy, width: box.ref.kind === 'lane' && direction === 'LR' ? crossSize : box.width, height: box.ref.kind === 'lane' && direction === 'TB' ? crossSize : box.height });
      offset += direction === 'TB' ? layout.width : layout.height;
    }
    result.width = direction === 'TB' ? offset : crossSize;
    result.height = direction === 'TB' ? crossSize : offset;
  } else {
    const input = buildGraph('root', nodes, spec.groups ?? [], edges, spec, theme, containers);
    const output = await layoutRegions(input, spec, elk, refs, columns, automaticColumns);
    result = collectLayout(output, refs, containers);
  }
  if (spec.type !== 'usecase' && !alignLaneFlow(result, edges, spec, theme)) alignConnectedNodes(result, edges, columns, spec);
  if (spec.lanes?.length) equalizeLaneExtents(result, direction);
  placeFlowTerminals(result, edges, direction, spec.layout?.elementGap ?? 24);
  result.width = Math.max(0, ...result.nodes.map(box => { const occupied = occupiedNode(box); return occupied.x + occupied.width; }), ...result.containers.map(box => box.x + box.width));
  result.height = Math.max(0, ...result.nodes.map(box => { const occupied = occupiedNode(box); return occupied.y + occupied.height; }), ...result.containers.map(box => box.y + box.height));
  routeEdges(edges, result, direction, { ...theme, gap: spec.layout?.elementGap ?? 24 }, spec.type);
  const nodeById = new Map(result.nodes.map(box => [box.ref.node.id, box]));
  for (const route of result.routes) {
    const first = route.paths[0], last = route.paths[route.paths.length - 1];
    const source = nodeById.get(route.ref.edge.from), target = nodeById.get(route.ref.edge.to);
    if (spec.type !== 'usecase') {
      if (source && first.length > 1) clipEndpoint(first[0], first[1], source);
      if (target && last.length > 1) clipEndpoint(last[last.length - 1], last[last.length - 2], target);
    }
  }
  const labels = placeLabels(result.routes, result.nodes, result.containers, direction);
  const prefix = `uml-graph-${++graphNumber}`;
  const displayed = result.routes.flatMap((route, owner) => route.paths.map(points => ({ points: simplify(points), owner })));
  const crossings = crossingPaths(displayed, spec.layout?.edgeCrossing ?? 'bridge', theme.lineWidth,
    [...result.nodes.map(occupiedNode), ...labels]);
  const maskDefinitions = crossings.masks.map((arcs, index) => {
    if (!arcs.length) return '';
    const points = displayed[index].points;
    const x = Math.min(...points.map(p => p.x)) - 24, y = Math.min(...points.map(p => p.y)) - 24;
    const width = Math.max(...points.map(p => p.x)) - x + 24, height = Math.max(...points.map(p => p.y)) - y + 24;
    return `<mask id="${prefix}-crossing-${index}" maskUnits="userSpaceOnUse" x="${numeric(x)}" y="${numeric(y)}" width="${numeric(width)}" height="${numeric(height)}"><rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(width)}" height="${numeric(height)}" fill="white"/>${arcs.map(d => `<path d="${d}" fill="none" stroke="black" stroke-width="${numeric(theme.lineWidth + 3)}"/>`).join('')}</mask>`;
  }).join('');
  let displayIndex = 0;
  let paths = '';
  for (const route of result.routes) {
    const kind = edgeKind(route.ref.edge, spec.type);
    const dashed = route.ref.edge.dashed || ['dependency', 'include', 'extend', 'realization'].includes(kind);
    const end = kind === 'flow' ? 'arrow' : ['dependency', 'include', 'extend'].includes(kind) ? 'open' : ['inheritance', 'realization'].includes(kind) ? 'triangle' : '';
    const start = kind === 'aggregation' || kind === 'composition' ? kind : '';
    paths += `<g class="uml-edge uml-edge-${kind}" data-editor-key="edges/${spec.edges!.indexOf(route.ref.edge)}" data-edge-id="${esc(route.ref.edge.id ?? route.ref.id)}" data-from="${esc(route.ref.edge.from)}" data-to="${esc(route.ref.edge.to)}"><title>${esc([route.ref.edge.from, route.ref.edge.label, route.ref.edge.to].filter(Boolean).join(' → '))}</title>`;
    for (let index = 0; index < route.paths.length; index++) {
      const current = displayIndex++, data = crossings.data[current];
      const mask = crossings.masks[current].length ? ` mask="url(#${prefix}-crossing-${current})"` : '';
      paths += `<path d="${data}"${mask} fill="none" stroke="${esc(theme.primary)}" stroke-width="${numeric(theme.lineWidth)}" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="7 5"' : ''}${start && index === 0 ? ` marker-start="url(#${prefix}-${start})"` : ''}${end && index === route.paths.length - 1 ? ` marker-end="url(#${prefix}-${end})"` : ''}/>`;
    }
    paths += '</g>';
  }
  const groupShapes = result.containers.sort((a, b) => a.depth - b.depth).map(box => renderContainer(box, theme, direction)).join('');
  const nodeShapes = result.nodes.map(box => renderNode(box, spec)).join('');
  const labelShapes = labels.map(label => {
    const leader = label.leader ? `<path class="uml-label-leader" d="M${numeric(label.anchor.x)} ${numeric(label.anchor.y)} L${numeric(Math.max(label.x, Math.min(label.x + label.width, label.anchor.x)))} ${numeric(Math.max(label.y, Math.min(label.y + label.height, label.anchor.y)))}" fill="none" stroke="${esc(theme.muted)}" stroke-width="1" stroke-dasharray="3 3"/>` : '';
    return `<g class="uml-edge-label" data-editor-key="edges/${spec.edges!.indexOf(label.ref.edge)}" data-edge-id="${esc(label.ref.edge.id ?? label.ref.id)}" data-from="${esc(label.ref.edge.from)}" data-to="${esc(label.ref.edge.to)}" data-label-role="${label.role}">${leader}<rect x="${numeric(label.x)}" y="${numeric(label.y)}" width="${numeric(label.width)}" height="${numeric(label.height)}" rx="3" fill="${esc(theme.background === 'transparent' ? theme.surface : theme.background)}"/>${text(label.x + label.width / 2, label.y + 5 + label.size, label.value, theme, { size: label.size, fill: theme.muted })}</g>`;
  }).join('');
  let minX = 0, minY = 0, maxX = result.width, maxY = result.height;
  for (const box of [...result.nodes, ...result.containers, ...labels]) { minX = Math.min(minX, box.x - theme.lineWidth); minY = Math.min(minY, box.y - theme.lineWidth); maxX = Math.max(maxX, box.x + box.width + theme.lineWidth); maxY = Math.max(maxY, box.y + box.height + theme.lineWidth); }
  for (const box of result.nodes) if (box.caption) {
    minX = Math.min(minX, box.x + box.caption.x); minY = Math.min(minY, box.y + box.caption.y);
    maxX = Math.max(maxX, box.x + box.caption.x + box.caption.width); maxY = Math.max(maxY, box.y + box.caption.y + box.caption.height);
  }
  for (const route of result.routes) for (const path of route.paths) for (const point of path) { minX = Math.min(minX, point.x - 14); minY = Math.min(minY, point.y - 14); maxX = Math.max(maxX, point.x + 14); maxY = Math.max(maxY, point.y + 14); }
  const showTitle = spec.layout?.showTitle === true;
  const titleMetrics = showTitle ? measure(spec.title, 24) : { width: 0, lines: 0 };
  const titleBottom = 42 + (titleMetrics.lines - 1) * 33.6;
  const descriptionMetrics = showTitle && spec.description ? measure(spec.description, 13) : undefined;
  const contentY = showTitle ? Math.max(88, descriptionMetrics ? titleBottom + 24 + (descriptionMetrics.lines - 1) * 18.2 + 32 : titleBottom + 36) : 24;
  const heading = showTitle ? text(32, 42, spec.title, theme, { size: 24, anchor: 'start', weight: 650 }) + (spec.description ? text(32, titleBottom + 24, spec.description, theme, { size: 13, anchor: 'start', fill: theme.muted }) : '') : '';
  const width = Math.max(1, maxX - minX + 64, titleMetrics.width + 64, (descriptionMetrics?.width ?? 0) + 64);
  const height = Math.max(1, maxY - minY + contentY + 24);
  const body = `${markerDefinitions(prefix, theme)}<defs>${maskDefinitions}</defs>${heading}<g transform="translate(${numeric(32 - minX)} ${numeric(contentY - minY)})">${groupShapes}${paths}${labelShapes}${nodeShapes}</g>`;
  return frame(spec, theme, width, height, body);
}
