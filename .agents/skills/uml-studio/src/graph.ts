import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkLabel, ElkNode } from 'elkjs/lib/elk-api';
import type { DiagramAdjustments, DiagramEdge, DiagramGroup, DiagramNode, DiagramSpec, ElementAdjustment, RenderedDiagram, Theme } from './types';
import { esc, frame, text } from './svg';
import { resolveLayout } from './themes';
import { crossingPaths } from './crossings';
import { gradientDefs, luminance, mix, notePaint, paintFor, paletteOf, regionPaint } from './palette';
import type { ElementPaint, PaletteMember } from './palette';

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
  paint?: ElementPaint;
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
interface EdgeRef { id: string; key: string; edge: DiagramEdge; labels: { id: string; value: string; role: 'main' | 'from' | 'to'; width: number; height: number; size: number }[] }
interface Route { ref: EdgeRef; paths: Point[][]; merged?: boolean }
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
  const palette = paletteOf(theme);
  let paint: ElementPaint | undefined;
  if (palette && !sourceNode.style?.surface && !uncoloured.has(kind)) {
    const darkBackground = luminance(theme.background === 'transparent' ? theme.surface : theme.background) < 0.2;
    paint = kind === 'note' && palette.mode === 'tint'
      ? notePaint(darkBackground)
      : paintFor(theme, palette, paletteSlot(sourceNode, kind, spec, palette));
    if (kind === 'actor') theme.primary = paint.stroke;
    else Object.assign(theme, { surface: paint.fill, border: paint.stroke, text: paint.text, muted: paint.muted, primary: paint.accent, secondary: palette.mode === 'tint' ? paint.stroke : paint.text });
  }
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
  } else if (kind === 'terminal') {
    width += Math.max(16, height / 2);
  } else if (kind === 'subroutine') {
    width += 24;
  } else if (kind === 'io' || kind === 'trapezoid') {
    width += 32;
  } else if (kind === 'hexagon') {
    width += 36;
  } else if (kind === 'circle') {
    width = height = Math.max(theme.nodeHeight, contentWidth + 28, contentHeight + 28);
  }
  let symbol: Rect | undefined, internalCaption: LabelBox | undefined;
  if (kind === 'image') {
    const iw = Math.max(16, node.width ?? 240);
    const ih = Math.max(16, node.height ?? 160);
    width = Math.max(iw, contentWidth + 24);
    symbol = { x: (width - iw) / 2, y: 0, width: iw, height: ih };
    height = ih + label.height + 16;
  }
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
  return { id: `n${index}`, node, sourceNode, kind, theme, width: renderWidth * fit, height: renderHeight * fit, renderWidth, renderHeight, symbol, internalCaption, header, attributes, operations, attributeHeight, operationHeight, paint };
}

const uncoloured = new Set<string>(['start', 'end', 'fork', 'join']);
/** Palette slot: regions share a colour; otherwise kinds or individual elements cycle. */
function paletteSlot(node: DiagramNode, kind: Kind, spec: DiagramSpec, palette: PaletteMember): number {
  const regions = [...(spec.groups ?? []).map(group => group.id), ...(spec.lanes ?? []).map(lane => lane.id)];
  const region = node.group ?? node.lane;
  if ((palette.by === 'group' || palette.by === 'auto') && region && regions.includes(region)) return regions.indexOf(region);
  const fallback = kind;
  if (palette.by === 'kind' || palette.by === 'group') return [...new Set((spec.nodes ?? []).map(item => item.kind ?? fallback))].indexOf(node.kind ?? fallback);
  return (spec.nodes ?? []).filter(item => !uncoloured.has(item.kind ?? '')).indexOf(node);
}

function edgeKind(edge: DiagramEdge, type: DiagramSpec['type']): NonNullable<DiagramEdge['kind']> {
  return edge.kind ?? (type === 'class' || type === 'usecase' ? 'association' : 'flow');
}

function edgeEndMarker(edge: DiagramEdge, type: DiagramSpec['type']): string {
  const kind = edgeKind(edge, type);
  const fallback = kind === 'flow' ? 'arrow' : ['dependency', 'include', 'extend'].includes(kind) ? 'open' : ['inheritance', 'realization'].includes(kind) ? 'triangle' : '';
  return edge.arrow ? (edge.arrow === 'none' ? '' : edge.arrow) : fallback;
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
  return { id, key: edge.id ?? `edge-${index}`, edge, labels };
}

function layoutOptions(direction: 'TB' | 'LR', padding: string, spec: DiagramSpec): Record<string, string> {
  const nodeGap = Math.max(24, spec.layout?.elementGap ?? 56);
  const layerGap = Math.max(nodeGap, Math.round(nodeGap * 1.15));
  const edgeNode = Math.max(22, Math.round(nodeGap * 0.42));
  const edgeEdge = Math.max(16, Math.round(nodeGap * 0.3));
  const edgeLabel = Math.max(12, Math.round(nodeGap * 0.22));
  return {
    'elk.algorithm': 'layered', 'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
    'elk.edgeRouting': 'ORTHOGONAL', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': padding, 'elk.spacing.nodeNode': String(nodeGap),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(layerGap),
    'elk.spacing.edgeNode': String(edgeNode), 'elk.spacing.edgeEdge': String(edgeEdge), 'elk.spacing.edgeLabel': String(edgeLabel),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(Math.max(24, Math.round(nodeGap * 0.46))), 'elk.layered.spacing.edgeEdgeBetweenLayers': String(edgeEdge),
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.favorStraightEdges': 'true',
    'elk.layered.mergeEdges': 'false', 'elk.separateConnectedComponents': 'true',
    'elk.spacing.componentComponent': String(spec.layout?.regionGap ?? 84),
    'elk.edgeLabels.inline': 'false', 'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
  };
}

function containerPad(spec: DiagramSpec): number {
  return Math.max(40, Math.min(56, Math.round((spec.layout?.regionGap ?? 96) * 0.45)));
}

function buildGraph(
  rootId: string, refs: NodeRef[], groups: DiagramGroup[], edges: EdgeRef[],
  spec: DiagramSpec, theme: Theme, containers: Map<string, ContainerRef>, lane?: { id: string; label: string },
  additionalGroups?: string[],
): ElkNode {
  const direction = spec.direction ?? 'TB';
  const pad = containerPad(spec);
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
    ? (direction === 'TB' ? `[top=${header + 28},left=28,bottom=30,right=28]` : `[top=28,left=${header + 28},bottom=28,right=30]`)
    : '[top=28,left=28,bottom=28,right=28]';
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
    const options = layoutOptions(direction, `[top=${groupHeader + Math.round(pad * 0.85)},left=${pad},bottom=${pad},right=${pad}]`, spec);
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

function outward(side: Side): Point {
  return side === 'right' ? { x: 1, y: 0 } : side === 'left' ? { x: -1, y: 0 } : side === 'bottom' ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

function compactCoords(values: Set<number>, keep: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const pinned = new Set(keep);
  const result: number[] = [];
  for (const v of sorted) {
    const prev = result[result.length - 1];
    if (prev !== undefined && Math.abs(v - prev) < 0.75) {
      if (pinned.has(v) && !pinned.has(prev)) result[result.length - 1] = v;
      continue;
    }
    result.push(v);
  }
  for (const k of keep) if (!result.includes(k)) { result.push(k); result.sort((a, b) => a - b); }
  return result;
}

function borderHugPenalty(a: Point, b: Point, containers: ContainerBox[]): number {
  if (!containers.length) return 0;
  const zone = 18;
  const horizontal = Math.abs(a.y - b.y) < 0.01;
  let penalty = 0;
  if (horizontal) {
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    if (hi - lo < 1) return 0;
    for (const box of containers) {
      const overlap = Math.min(hi, box.x + box.width + zone) - Math.max(lo, box.x - zone);
      if (overlap <= 2) continue;
      let dist = Math.min(Math.abs(a.y - box.y), Math.abs(a.y - (box.y + box.height)));
      if (box.ref.kind === 'node') dist = Math.min(dist, Math.abs(a.y - (box.y + 10)));
      if (dist < zone) penalty += (zone - dist) * overlap * 0.6 + (zone - dist) * 8 + 70;
    }
  } else {
    const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
    if (hi - lo < 1) return 0;
    for (const box of containers) {
      const overlap = Math.min(hi, box.y + box.height + zone) - Math.max(lo, box.y - zone);
      if (overlap <= 2) continue;
      let dist = Math.min(Math.abs(a.x - box.x), Math.abs(a.x - (box.x + box.width)));
      if (box.ref.kind === 'node') dist = Math.min(dist, Math.abs(a.x - (box.x + box.width - 12)));
      if (dist < zone) penalty += (zone - dist) * overlap * 0.6 + (zone - dist) * 8 + 70;
    }
  }
  return penalty;
}

/** Grid lists reused by obstacleRouter: per row (horizontal grid edges) and per column (vertical grid edges). */
interface RouterLine {
  interior: number[]; wall: number[];
  parallel: number[]; crossing: number[]; border: number[];
}

/** Reusable obstacleRouter buffers; stamps avoid clearing them on every call. */
const routerScratch = {
  size: 0, epoch: 0,
  valid: new Uint8Array(0), edgeStamp: new Uint32Array(0), edgeOk: new Uint8Array(0), edgeValues: new Float64Array(0),
  costStamp: new Uint32Array(0), costs: new Float64Array(0), previous: new Int32Array(0),
};

function routerBuffers(vertexCount: number): typeof routerScratch {
  const scratch = routerScratch;
  if (scratch.size < vertexCount) {
    const size = Math.max(vertexCount, scratch.size * 2);
    scratch.valid = new Uint8Array(size);
    scratch.edgeStamp = new Uint32Array(size * 2); scratch.edgeOk = new Uint8Array(size * 2); scratch.edgeValues = new Float64Array(size * 12);
    scratch.costStamp = new Uint32Array(size * 3); scratch.costs = new Float64Array(size * 3); scratch.previous = new Int32Array(size * 3);
    scratch.size = size; scratch.epoch = 0;
  }
  if (++scratch.epoch >= 0xffffffff) { scratch.edgeStamp.fill(0); scratch.costStamp.fill(0); scratch.epoch = 1; }
  return scratch;
}

function routerLines(count: number): RouterLine[] {
  const lines: RouterLine[] = [];
  for (let i = 0; i < count; i++) lines.push({ interior: [], wall: [], parallel: [], crossing: [], border: [] });
  return lines;
}

function obstacleRouter(start: Point, end: Point, obstacles: Rect[], used: Point[][], guards?: { startSide?: Side; endSide?: Side; turnBias?: 'early' | 'late' }, containers: ContainerBox[] = []): Point[] | undefined {
  const xs = new Set<number>([start.x, end.x]);
  const ys = new Set<number>([start.y, end.y]);
  const obsXs = new Set<number>(), obsYs = new Set<number>();
  let left = Math.min(start.x, end.x), right = Math.max(start.x, end.x);
  let top = Math.min(start.y, end.y), bottom = Math.max(start.y, end.y);
  for (const box of obstacles) {
    xs.add(box.x); xs.add(box.x + box.width);
    ys.add(box.y); ys.add(box.y + box.height);
    obsXs.add(box.x); obsXs.add(box.x + box.width);
    obsYs.add(box.y); obsYs.add(box.y + box.height);
    left = Math.min(left, box.x); right = Math.max(right, box.x + box.width);
    top = Math.min(top, box.y); bottom = Math.max(bottom, box.y + box.height);
  }
  for (const box of containers) {
    obsXs.add(box.x); obsXs.add(box.x + box.width);
    obsYs.add(box.y); obsYs.add(box.y + box.height);
    xs.add(box.x - 24); xs.add(box.x + 22); xs.add(box.x + box.width - 22); xs.add(box.x + box.width + 24);
    ys.add(box.y - 24); ys.add(box.y + box.height - 22); ys.add(box.y + box.height + 24);
    left = Math.min(left, box.x); right = Math.max(right, box.x + box.width);
    top = Math.min(top, box.y); bottom = Math.max(bottom, box.y + box.height);
  }
  const addCorridors = (raw: Set<number>, target: Set<number>): void => {
    const sorted = [...raw].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const span = sorted[i] - sorted[i - 1];
      if (span >= 12) target.add(sorted[i - 1] + span / 2);
      if (span >= 44) { target.add(sorted[i - 1] + span / 3); target.add(sorted[i - 1] + (span * 2) / 3); }
    }
  };
  addCorridors(obsXs, xs);
  addCorridors(obsYs, ys);
  for (const path of used) for (let index = 1; index < path.length; index++) {
    const a = path[index - 1], b = path[index];
    if (Math.abs(a.x - b.x) < 0.01) { xs.add(a.x - 16); xs.add(a.x + 16); }
    else { ys.add(a.y - 16); ys.add(a.y + 16); }
  }
  xs.add(left - 24); xs.add(left - 44); xs.add(right + 24); xs.add(right + 44);
  ys.add(top - 24); ys.add(top - 44); ys.add(bottom + 24); ys.add(bottom + 44);
  const columns = compactCoords(xs, [start.x, end.x]);
  const rows = compactCoords(ys, [start.y, end.y]);
  const columnsCount = columns.length, rowsCount = rows.length;
  const vertexCount = columnsCount * rowsCount;
  // Obstacle bounds, computed with exactly the expressions of the per-edge tests.
  const obstacleCount = obstacles.length;
  const innerX0 = new Float64Array(obstacleCount), innerX1 = new Float64Array(obstacleCount);
  const innerY0 = new Float64Array(obstacleCount), innerY1 = new Float64Array(obstacleCount);
  const wallX0 = new Float64Array(obstacleCount), wallX1 = new Float64Array(obstacleCount);
  const wallY0 = new Float64Array(obstacleCount), wallY1 = new Float64Array(obstacleCount);
  for (let i = 0; i < obstacleCount; i++) {
    const box = obstacles[i];
    innerX0[i] = box.x + 0.01; innerX1[i] = box.x + box.width - 0.01;
    innerY0[i] = box.y + 0.01; innerY1[i] = box.y + box.height - 0.01;
    wallX0[i] = box.x + 1; wallX1[i] = box.x + box.width - 1;
    wallY0[i] = box.y + 1; wallY1[i] = box.y + box.height - 1;
  }
  // Used segments flattened in their original iteration order.
  const segCX: number[] = [], segCY: number[] = [], segDX: number[] = [], segDY: number[] = [];
  for (const path of used) for (let index = 1; index < path.length; index++) {
    const c = path[index - 1], d = path[index];
    segCX.push(c.x); segCY.push(c.y); segDX.push(d.x); segDY.push(d.y);
  }
  const segmentCount = segCX.length;
  const zone = 18;
  // Rows: everything about horizontal grid edges that depends only on y.
  const rowLines = routerLines(rowsCount);
  for (let row = 0; row < rowsCount; row++) {
    const y = rows[row], line = rowLines[row];
    for (let i = 0; i < obstacleCount; i++) {
      const box = obstacles[i];
      if (y > innerY0[i] && y < innerY1[i]) line.interior.push(i);
      if (Math.abs(y - box.y) < 3 || Math.abs(y - (box.y + box.height)) < 3) line.wall.push(i);
    }
    for (let i = 0; i < segmentCount; i++) {
      const cx = segCX[i], cy = segCY[i], dx = segDX[i], dy = segDY[i];
      if (cy === dy) {
        const dist = Math.abs(y - cy);
        if (dist < 16) line.parallel.push(Math.min(cx, dx), Math.max(cx, dx), dist);
      }
      if (!(Math.abs(cy - dy) < 0.01) && y > Math.min(y, y, cy, dy) + 0.01 && y < Math.max(y, y, cy, dy) - 0.01) line.crossing.push(cx, Math.min(cx, dx), Math.max(cx, dx));
    }
    for (let i = 0; i < containers.length; i++) {
      const box = containers[i];
      let dist = Math.min(Math.abs(y - box.y), Math.abs(y - (box.y + box.height)));
      if (box.ref.kind === 'node') dist = Math.min(dist, Math.abs(y - (box.y + 10)));
      if (dist < zone) line.border.push(box.x - zone, box.x + box.width + zone, dist);
    }
  }
  // Columns: everything about vertical grid edges that depends only on x.
  const columnLines = routerLines(columnsCount);
  for (let column = 0; column < columnsCount; column++) {
    const x = columns[column], line = columnLines[column];
    for (let i = 0; i < obstacleCount; i++) {
      const box = obstacles[i];
      if (x > innerX0[i] && x < innerX1[i]) line.interior.push(i);
      if (Math.abs(x - box.x) < 3 || Math.abs(x - (box.x + box.width)) < 3) line.wall.push(i);
    }
    for (let i = 0; i < segmentCount; i++) {
      const cx = segCX[i], cy = segCY[i], dx = segDX[i], dy = segDY[i];
      if (cx === dx) {
        const dist = Math.abs(x - cx);
        if (dist < 16) line.parallel.push(Math.min(cy, dy), Math.max(cy, dy), dist);
      }
      if (Math.abs(cy - dy) < 0.01 && x > Math.min(x, x, cx, dx) + 0.01 && x < Math.max(x, x, cx, dx) - 0.01) line.crossing.push(cy, Math.min(cy, dy), Math.max(cy, dy));
    }
    for (let i = 0; i < containers.length; i++) {
      const box = containers[i];
      let dist = Math.min(Math.abs(x - box.x), Math.abs(x - (box.x + box.width)));
      if (box.ref.kind === 'node') dist = Math.min(dist, Math.abs(x - (box.x + box.width - 12)));
      if (dist < zone) line.border.push(box.y - zone, box.y + box.height + zone, dist);
    }
  }
  const scratch = routerBuffers(vertexCount), epoch = scratch.epoch;
  const { valid, edgeStamp, edgeOk, edgeValues, costStamp, costs, previous } = scratch;
  for (let row = 0; row < rowsCount; row++) {
    const interior = rowLines[row].interior;
    for (let column = 0; column < columnsCount; column++) {
      const x = columns[column];
      let inside = false;
      for (let k = 0; k < interior.length; k++) {
        const i = interior[k];
        if (x > innerX0[i] && x < innerX1[i]) { inside = true; break; }
      }
      valid[row * columnsCount + column] = inside ? 0 : 1;
    }
  }
  const startVertex = rows.indexOf(start.y) * columnsCount + columns.indexOf(start.x);
  const endVertex = rows.indexOf(end.y) * columnsCount + columns.indexOf(end.x);
  if (!valid[startVertex] || !valid[endVertex]) return undefined;
  // Static grid-edge costs, evaluated lazily once per edge. Edge `v` joins vertex v with v+1 (h) or v+columns (v).
  // Layout per edge: segLen, overlap * 8, nearParallel, crossings * 80, wallHug, borderHug.
  const evaluate = (line: RouterLine, lo: number, hi: number, wallLo: Float64Array, wallHi: Float64Array,
    innerLo: Float64Array, innerHi: Float64Array, out: Float64Array, at: number): boolean => {
    const interior = line.interior;
    for (let k = 0; k < interior.length; k++) {
      const i = interior[k];
      if (hi > innerLo[i] && lo < innerHi[i]) return false;
    }
    let overlap = 0, crossings = 0, nearParallel = 0;
    const parallel = line.parallel;
    for (let k = 0; k < parallel.length; k += 3) {
      const span = Math.max(0, Math.min(hi, parallel[k + 1]) - Math.max(lo, parallel[k]));
      if (span > 0) {
        const dist = parallel[k + 2];
        if (dist < 0.1) overlap += span;
        else nearParallel += span * (16 - dist) * 0.9 + 18;
      }
    }
    const crossing = line.crossing;
    for (let k = 0; k < crossing.length; k += 3) {
      const value = crossing[k];
      if (value > Math.min(lo, crossing[k + 1]) + 0.01 && value < Math.max(hi, crossing[k + 2]) - 0.01) crossings++;
    }
    const segLen = hi - lo;
    let hug = false;
    const wall = line.wall;
    for (let k = 0; k < wall.length; k++) {
      const i = wall[k];
      if (hi > wallLo[i] && lo < wallHi[i]) { hug = true; break; }
    }
    let borderHug = 0;
    if (containers.length && !(hi - lo < 1)) {
      const border = line.border;
      for (let k = 0; k < border.length; k += 3) {
        const overlapSpan = Math.min(hi, border[k + 1]) - Math.max(lo, border[k]);
        if (overlapSpan <= 2) continue;
        const dist = border[k + 2];
        borderHug += (zone - dist) * overlapSpan * 0.6 + (zone - dist) * 8 + 70;
      }
    }
    out[at] = segLen; out[at + 1] = overlap * 8; out[at + 2] = nearParallel; out[at + 3] = crossings * 80;
    out[at + 4] = hug ? Math.min(44, segLen * 0.55 + 22) : 0; out[at + 5] = borderHug;
    return true;
  };
  const heapState: number[] = [], heapCost: number[] = [], heapScore: number[] = [];
  const push = (state: number, cost: number, score: number): void => {
    let index = heapState.length;
    heapState.push(state); heapCost.push(cost); heapScore.push(score);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heapScore[parent] <= score) break;
      heapState[index] = heapState[parent]; heapCost[index] = heapCost[parent]; heapScore[index] = heapScore[parent]; index = parent;
    }
    heapState[index] = state; heapCost[index] = cost; heapScore[index] = score;
  };
  const startOut = guards?.startSide ? outward(guards.startSide) : undefined;
  const endOut = guards?.endSide ? outward(guards.endSide) : undefined;
  const startAlignedHorizontal = guards?.startSide ? guards.startSide === 'left' || guards.startSide === 'right' : false;
  const turnBias = guards?.startSide ? guards.turnBias : undefined;
  costs[startVertex * 3] = 0; costStamp[startVertex * 3] = epoch; previous[startVertex * 3] = -1;
  push(startVertex * 3, 0, Math.abs(start.x - end.x) + Math.abs(start.y - end.y));
  let finish = -1;
  while (heapState.length) {
    const currentState = heapState[0], currentCost = heapCost[0];
    const lastState = heapState.pop()!, lastCost = heapCost.pop()!, lastScore = heapScore.pop()!;
    const size = heapState.length;
    if (size) {
      let index = 0;
      while (index * 2 + 1 < size) {
        let child = index * 2 + 1;
        if (child + 1 < size && heapScore[child + 1] < heapScore[child]) child++;
        if (lastScore <= heapScore[child]) break;
        heapState[index] = heapState[child]; heapCost[index] = heapCost[child]; heapScore[index] = heapScore[child]; index = child;
      }
      heapState[index] = lastState; heapCost[index] = lastCost; heapScore[index] = lastScore;
    }
    if (currentCost !== costs[currentState]) continue;
    const vertex = (currentState / 3) | 0;
    if (vertex === endVertex) { finish = currentState; break; }
    const currentDirection = currentState % 3;
    const column = vertex % columnsCount, row = (vertex / columnsCount) | 0;
    const ax = columns[column], ay = rows[row];
    for (let n = 0; n < 4; n++) {
      let neighbor: number, edge: number, bx: number, by: number;
      const horizontal = n < 2;
      if (n === 0) { if (column === 0) continue; neighbor = vertex - 1; edge = neighbor; bx = columns[column - 1]; by = ay; }
      else if (n === 1) { if (column + 1 >= columnsCount) continue; neighbor = vertex + 1; edge = vertex; bx = columns[column + 1]; by = ay; }
      else if (n === 2) { if (row === 0) continue; neighbor = vertex - columnsCount; edge = neighbor; bx = ax; by = rows[row - 1]; }
      else { if (row + 1 >= rowsCount) continue; neighbor = vertex + columnsCount; edge = vertex; bx = ax; by = rows[row + 1]; }
      if (!valid[neighbor]) continue;
      if (startOut && vertex === startVertex && (bx - ax) * startOut.x + (by - ay) * startOut.y < -0.01) continue;
      if (endOut && neighbor === endVertex && (bx - ax) * endOut.x + (by - ay) * endOut.y > 0.01) continue;
      const edgeIndex = horizontal ? edge : edge + vertexCount, at = edgeIndex * 6, values = edgeValues;
      if (edgeStamp[edgeIndex] !== epoch) {
        edgeStamp[edgeIndex] = epoch;
        edgeOk[edgeIndex] = (horizontal
          ? evaluate(rowLines[row], Math.min(ax, bx), Math.max(ax, bx), wallX0, wallX1, innerX0, innerX1, values, at)
          : evaluate(columnLines[column], Math.min(ay, by), Math.max(ay, by), wallY0, wallY1, innerY0, innerY1, values, at)) ? 1 : 0;
      }
      if (!edgeOk[edgeIndex]) continue;
      const direction = horizontal ? 1 : 2;
      const state = neighbor * 3 + direction;
      const bias = turnBias && vertex === startVertex
        && ((turnBias === 'early' && horizontal === startAlignedHorizontal) || (turnBias === 'late' && horizontal !== startAlignedHorizontal)) ? 0.5 : 0;
      const cost = currentCost + values[at] + (currentDirection && currentDirection !== direction ? 28 : 0) + values[at + 1]
        + values[at + 2] + values[at + 3] + values[at + 4] + values[at + 5] + bias;
      if (costStamp[state] === epoch && cost >= costs[state]) continue;
      costs[state] = cost; costStamp[state] = epoch; previous[state] = currentState;
      push(state, cost, cost + Math.abs(bx - end.x) + Math.abs(by - end.y));
    }
  }
  if (finish < 0) return undefined;
  const result: Point[] = [];
  for (let state = finish; state >= 0; state = previous[state]) {
    const vertex = (state / 3) | 0;
    result.push({ x: columns[vertex % columnsCount], y: rows[(vertex / columnsCount) | 0] });
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
  if (box.ref.kind === 'decision') {
    const rx = box.width / 2, ry = box.height / 2;
    const scale = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
    return { x: cx + dx * scale, y: cy + dy * scale };
  }
  if (box.ref.kind === 'usecase' || box.ref.kind === 'start' || box.ref.kind === 'end') {
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

function uncoveredOverlap(lo: number, hi: number, allowed: [number, number][]): number {
  if (hi <= lo) return 0;
  if (!allowed.length) return hi - lo;
  const clipped = allowed.map(([a, b]): [number, number] => [Math.max(lo, a), Math.min(hi, b)]).filter(([a, b]) => b > a).sort((first, second) => first[0] - second[0]);
  let covered = 0, cursor = lo;
  for (const [a, b] of clipped) {
    const start = Math.max(cursor, a);
    if (b > start) { covered += b - start; cursor = b; }
  }
  return Math.max(0, hi - lo - covered);
}

function opposite(side: Side): Side {
  return side === 'right' ? 'left' : side === 'left' ? 'right' : side === 'bottom' ? 'top' : 'bottom';
}

function routeEdges(edges: EdgeRef[], result: LayoutResult, direction: 'TB' | 'LR', theme: Theme, type: DiagramSpec['type'], adjustments?: DiagramAdjustments): void {
  const byId = new Map(result.nodes.map(box => [box.ref.node.id, box]));
  const baseClearance = Math.max(14, Math.min(20, Math.round(theme.gap * 0.34)));
  const nodeClearance = new Map<NodeBox, number>();
  const nodeObstacleIndex = new Map<NodeBox, number>();
  for (const box of result.nodes) {
    let c = baseClearance;
    for (const other of result.nodes) {
      if (other === box) continue;
      if (box.y < other.y + other.height && box.y + box.height > other.y) {
        const gx = Math.max(other.x - (box.x + box.width), box.x - (other.x + other.width));
        if (gx > 0) c = Math.min(c, Math.max(4, Math.floor(gx / 2) - 2));
      }
      if (box.x < other.x + other.width && box.x + box.width > other.x) {
        const gy = Math.max(other.y - (box.y + box.height), box.y - (other.y + other.height));
        if (gy > 0) c = Math.min(c, Math.max(4, Math.floor(gy / 2) - 2));
      }
    }
    nodeClearance.set(box, c);
  }
  const obstacles: Rect[] = result.nodes.map((box, index) => {
    nodeObstacleIndex.set(box, index);
    const c = nodeClearance.get(box)!;
    return { x: box.x - c, y: box.y - c, width: box.width + c * 2, height: box.height + c * 2 };
  });
  for (const box of result.nodes) if (box.caption) obstacles.push({ x: box.x + box.caption.x - 2, y: box.y + box.caption.y - 2, width: box.caption.width + 4, height: box.caption.height + 4 });
  for (const box of result.containers) {
    // Lane entry may cross the header's empty area, while still avoiding its title.
    if (box.ref.kind === 'lane') {
      const label = measure(box.ref.label, theme.fontSize);
      obstacles.push({ x: box.x + 12, y: box.y + 6, width: label.width + 8, height: label.height + 8 });
    }
    else obstacles.push({ x: box.x + 3, y: box.y + 3, width: box.width - 6, height: box.ref.header - 3 });
  }
  const assignments = edges.map(ref => {
    const source = byId.get(ref.edge.from)!;
    const target = byId.get(ref.edge.to)!;
    const sourceX = source.x + source.width / 2, sourceY = source.y + source.height / 2;
    const targetX = target.x + target.width / 2, targetY = target.y + target.height / 2;
    const gapX = target.x >= source.x + source.width ? target.x - (source.x + source.width) : source.x >= target.x + target.width ? -(source.x - (target.x + target.width)) : 0;
    const gapY = target.y >= source.y + source.height ? target.y - (source.y + source.height) : source.y >= target.y + target.height ? -(source.y - (target.y + target.height)) : 0;
    const forward = direction === 'TB' ? targetY > sourceY : targetX > sourceX;
    const forwardFlow = source !== target && (direction === 'TB' ? gapY > 0 : gapX > 0);
    let side: Side;
    if (source === target) side = 'right';
    else if (forward && target.ref.kind === 'end') side = direction === 'TB' ? 'bottom' : 'right';
    else if (gapX === 0 && gapY !== 0) side = gapY > 0 ? 'bottom' : 'top';
    else if (gapY === 0 && gapX !== 0) side = gapX > 0 ? 'right' : 'left';
    else if (gapX !== 0 && gapY !== 0) side = forwardFlow ? (direction === 'TB' ? 'bottom' : 'right')
      : Math.abs(gapX) > Math.abs(gapY) ? (gapX > 0 ? 'right' : 'left') : (gapY > 0 ? 'bottom' : 'top');
    else side = Math.abs(targetX - sourceX) > Math.abs(targetY - sourceY) ? (sourceX < targetX ? 'right' : 'left') : (sourceY < targetY ? 'bottom' : 'top');
    const targetSide: Side = source === target ? 'top' : target.ref.kind === 'end' ? (direction === 'TB' ? 'top' : 'left') : opposite(side);
    return { ref, source, target, side, targetSide, forwardFlow };
  });
  const used = result.routes.flatMap(route => route.paths);
  const routed: { path: Point[]; exitKey: string; entryKey: string; sourceStem: [Point, Point]; targetStem: [Point, Point] }[] =
    used.map(path => ({ path, exitKey: '', entryKey: '', sourceStem: [path[0], path[0]], targetStem: [path[path.length - 1], path[path.length - 1]] }));
  const usedExits = new Set<string>();
  const usedEntries = new Set<string>();
  for (const item of assignments) {
    const waypoints = adjustments?.edges?.[item.ref.key]?.waypoints ?? [];
    if (type === 'usecase' && item.source !== item.target && !waypoints.length) {
      const route = [directEndpoint(item.source, item.target), directEndpoint(item.target, item.source)];
      result.routes.push({ ref: item.ref, paths: [route] });
      used.push(route);
      routed.push({ path: route, exitKey: '', entryKey: '', sourceStem: [route[0], route[0]], targetStem: [route[1], route[1]] });
      continue;
    }
    const sourceFanout = assignments.filter(candidate => candidate.source === item.source && candidate.side === item.side).length;
    const targetFanin = assignments.filter(candidate => candidate.target === item.target && candidate.targetSide === item.targetSide).length;
    const sides: Side[] = [item.side, ...(['left', 'right', 'top', 'bottom'] as Side[]).filter(side => side !== item.side)];
    const targetSides: Side[] = [item.targetSide, ...(['left', 'right', 'top', 'bottom'] as Side[]).filter(side => side !== item.targetSide)];
    let best: { route: Point[]; exitKey: string; entryKey: string; sourceStem: [Point, Point]; targetStem: [Point, Point] } | undefined;
    let bestScore = Infinity;
    const combos: { side: Side; targetSide: Side; anchors: { port: Point; stub: Point }[]; bound: number; order: number }[] = [];
    for (const side of sides) {
      for (const targetSide of targetSides) {
        if (item.source === item.target && side === targetSide) continue;
        const endpoints = [[item.source, side], [item.target, targetSide]] as const;
        const anchors = endpoints.map(([box, attach]) => {
          const symbol = box.ref.symbol;
          const bounds = symbol ? { x: box.x + symbol.x * box.width / box.ref.renderWidth, y: box.y + symbol.y * box.height / box.ref.renderHeight,
            width: symbol.width * box.width / box.ref.renderWidth, height: symbol.height * box.height / box.ref.renderHeight } : box;
          const x = attach === 'left' ? bounds.x : attach === 'right' ? bounds.x + bounds.width : bounds.x + bounds.width * 0.5;
          const y = attach === 'top' ? bounds.y : attach === 'bottom' ? bounds.y + bounds.height : bounds.y + bounds.height * 0.5;
          const c = nodeClearance.get(box) ?? baseClearance;
          let distance = Math.max(c + 2, Math.min(24, Math.round(theme.gap * 0.5)));
          for (const container of result.containers) {
            if (box.x < container.x || box.x + box.width > container.x + container.width || box.y < container.y || box.y + box.height > container.y + container.height) continue;
            const toEdge = attach === 'right' ? (container.x + container.width) - (box.x + box.width)
              : attach === 'left' ? box.x - container.x
              : attach === 'bottom' ? (container.y + container.height) - (box.y + box.height)
              : box.y - container.y;
            if (toEdge >= c + 18) distance = Math.min(distance, Math.floor(toEdge - 18));
          }
          for (const other of result.nodes) {
            if (other === box) continue;
            if (attach === 'right' && other.x > box.x + box.width && y > other.y - c && y < other.y + other.height + c) distance = Math.min(distance, Math.max(c + 1, Math.floor((other.x - (box.x + box.width)) / 2)));
            else if (attach === 'left' && box.x > other.x + other.width && y > other.y - c && y < other.y + other.height + c) distance = Math.min(distance, Math.max(c + 1, Math.floor((box.x - (other.x + other.width)) / 2)));
            else if (attach === 'bottom' && other.y > box.y + box.height && x > other.x - c && x < other.x + other.width + c) distance = Math.min(distance, Math.max(c + 1, Math.floor((other.y - (box.y + box.height)) / 2)));
            else if (attach === 'top' && box.y > other.y + other.height && x > other.x - c && x < other.x + other.width + c) distance = Math.min(distance, Math.max(c + 1, Math.floor((box.y - (other.y + other.height)) / 2)));
          }
          const stub = { x: attach === 'right' ? box.x + box.width + distance : attach === 'left' ? box.x - distance : x,
            y: attach === 'bottom' ? box.y + box.height + distance : attach === 'top' ? box.y - distance : y };
          return { port: { x, y }, stub };
        });
        // A stub may cross only its own endpoint's expanded obstacle.
        const clear = anchors.every((anchor, index) => {
          const box = index ? item.target : item.source;
          const ownIndex = nodeObstacleIndex.get(box);
          return !obstacles.some((obstacle, obsIndex) => {
            if (obsIndex === ownIndex) return false;
            return anchor.port.y === anchor.stub.y
              ? anchor.port.y > obstacle.y && anchor.port.y < obstacle.y + obstacle.height && Math.max(anchor.port.x, anchor.stub.x) > obstacle.x && Math.min(anchor.port.x, anchor.stub.x) < obstacle.x + obstacle.width
              : anchor.port.x > obstacle.x && anchor.port.x < obstacle.x + obstacle.width && Math.max(anchor.port.y, anchor.stub.y) > obstacle.y && Math.min(anchor.port.y, anchor.stub.y) < obstacle.y + obstacle.height;
          });
        });
        if (!clear) continue;
        // Lower bound of the score below: any path is at least the ports' Manhattan distance, needs a bend
        // when they are offset on both axes, and pays the fixed side penalties. Candidates that cannot win are not routed.
        const portDx = Math.abs(anchors[0].port.x - anchors[1].port.x), portDy = Math.abs(anchors[0].port.y - anchors[1].port.y);
        const bound = portDx + portDy + (portDx > 1 && portDy > 1 ? 28 : 0)
          + (usedEntries.has(`${item.source.ref.id}:${side}`) ? 220 : 0)
          + (usedExits.has(`${item.target.ref.id}:${targetSide}`) ? 220 : 0)
          + (side === item.side ? 0 : sourceFanout > 1 ? 240 : 32)
          + (targetSide === item.targetSide ? 0 : targetFanin > 1 ? 240 : (item.forwardFlow ? 96 : 32))
          + (item.target.ref.kind === 'end' && targetSide !== item.targetSide ? 200 : 0);
        combos.push({ side, targetSide, anchors, bound, order: combos.length });
      }
    }
    // Most promising first; ties keep the original order, so the winner is still the first minimum in side order.
    combos.sort((first, second) => first.bound - second.bound);
    let bestOrder = Infinity;
    for (const { side, targetSide, anchors, bound, order } of combos) {
      if (bound - 0.05 > bestScore) break;
      const stops = [anchors[0].stub, ...waypoints, anchors[1].stub];
      const middle: Point[] = [];
      let reachable = true;
      const turnBias: 'early' | 'late' | undefined = side !== opposite(targetSide) ? undefined
        : sourceFanout > 1 && side === item.side ? 'early'
        : targetFanin > 1 && targetSide === item.targetSide ? 'late' : undefined;
      for (let index = 1; index < stops.length; index++) {
        const guards = { startSide: index === 1 ? side : undefined, endSide: index === stops.length - 1 ? targetSide : undefined,
          turnBias: stops.length === 2 ? turnBias : undefined };
        const section = obstacleRouter(stops[index - 1], stops[index], obstacles, used, guards, result.containers)
          ?? obstacleRouter(stops[index - 1], stops[index], obstacles, used, undefined, result.containers);
        if (!section) { reachable = false; break; }
        middle.push(...(index === 1 ? section : section.slice(1)));
      }
      if (!reachable) continue;
      const candidate = simplify([anchors[0].port, ...middle, anchors[1].port]);
      const exitKey = `${item.source.ref.id}:${side}`;
      const entryKey = `${item.target.ref.id}:${targetSide}`;
      const sourceStem: [Point, Point] = [anchors[0].port, anchors[0].stub];
      const targetStem: [Point, Point] = [anchors[1].stub, anchors[1].port];
      let length = 0, overlaps = 0, crossings = 0, borderHug = 0;
      for (let i = 1; i < candidate.length; i++) {
        const a = candidate[i - 1], b = candidate[i], horizontal = Math.abs(a.y - b.y) < 0.01;
        length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        borderHug += borderHugPenalty(a, b, result.containers);
        for (const prev of routed) for (let j = 1; j < prev.path.length; j++) {
          const c = prev.path[j - 1], d = prev.path[j], otherHorizontal = Math.abs(c.y - d.y) < 0.01;
          if (horizontal && otherHorizontal && Math.abs(a.y - c.y) < 0.01) {
            const lo = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)), hi = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
            if (hi > lo) {
              const allowed: [number, number][] = [];
              if (prev.exitKey === exitKey && Math.abs(sourceStem[0].y - sourceStem[1].y) < 0.01 && Math.abs(sourceStem[0].y - a.y) < 0.01)
                allowed.push([Math.min(sourceStem[0].x, sourceStem[1].x), Math.max(sourceStem[0].x, sourceStem[1].x)]);
              if (prev.entryKey === entryKey && Math.abs(targetStem[0].y - targetStem[1].y) < 0.01 && Math.abs(targetStem[0].y - a.y) < 0.01)
                allowed.push([Math.min(targetStem[0].x, targetStem[1].x), Math.max(targetStem[0].x, targetStem[1].x)]);
              overlaps += uncoveredOverlap(lo, hi, allowed);
            }
          } else if (!horizontal && !otherHorizontal && Math.abs(a.x - c.x) < 0.01) {
            const lo = Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)), hi = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
            if (hi > lo) {
              const allowed: [number, number][] = [];
              if (prev.exitKey === exitKey && Math.abs(sourceStem[0].x - sourceStem[1].x) < 0.01 && Math.abs(sourceStem[0].x - a.x) < 0.01)
                allowed.push([Math.min(sourceStem[0].y, sourceStem[1].y), Math.max(sourceStem[0].y, sourceStem[1].y)]);
              if (prev.entryKey === entryKey && Math.abs(targetStem[0].x - targetStem[1].x) < 0.01 && Math.abs(targetStem[0].x - a.x) < 0.01)
                allowed.push([Math.min(targetStem[0].y, targetStem[1].y), Math.max(targetStem[0].y, targetStem[1].y)]);
              overlaps += uncoveredOverlap(lo, hi, allowed);
            }
          } else if (horizontal !== otherHorizontal) {
            const x = horizontal ? c.x : a.x, y = horizontal ? a.y : c.y;
            if (x > Math.min(a.x, b.x, c.x, d.x) + 0.01 && x < Math.max(a.x, b.x, c.x, d.x) - 0.01
              && y > Math.min(a.y, b.y, c.y, d.y) + 0.01 && y < Math.max(a.y, b.y, c.y, d.y) - 0.01) crossings++;
          }
        }
      }
      const score = length + Math.max(0, candidate.length - 2) * 28 + overlaps * 8 + crossings * 80 + borderHug * 0.5
        + (usedEntries.has(exitKey) ? 220 : 0)
        + (usedExits.has(entryKey) ? 220 : 0)
        + (side === item.side ? 0 : sourceFanout > 1 ? 240 : 32)
        + (targetSide === item.targetSide ? 0 : targetFanin > 1 ? 240 : (item.forwardFlow ? 96 : 32))
        + (item.target.ref.kind === 'end' && targetSide !== item.targetSide ? 200 : 0);
      if (score < bestScore || (score === bestScore && order < bestOrder)) { bestScore = score; bestOrder = order; best = { route: candidate, exitKey, entryKey, sourceStem, targetStem }; }
    }
    if (!best) throw new Error(waypoints.length
      ? `连线 ${item.ref.edge.from} → ${item.ref.edge.to} 无法经过指定途经点；请将点移出节点、标题或过窄的间隙。`
      : `Unable to route relationship ${item.ref.edge.from} → ${item.ref.edge.to}.`);
    used.push(best.route);
    routed.push({ path: best.route, exitKey: best.exitKey, entryKey: best.entryKey, sourceStem: best.sourceStem, targetStem: best.targetStem });
    usedExits.add(best.exitKey);
    usedEntries.add(best.entryKey);
    result.routes.push({ ref: item.ref, paths: [best.route] });
  }
  // Fan-in merge: edges sharing one target port join the trunk route where they first
  // come alongside it, instead of running parallel channels into the same entry point.
  // Only identically styled edges that end in an arrowhead merge: the trunk carries the one
  // arrowhead, so a merged branch can never be mistaken for a connection to another node.
  const faninGroups = new Map<string, number[]>();
  routed.forEach((item, index) => {
    if (!item.entryKey) return;
    const edge = result.routes[index].ref.edge;
    if (!edgeEndMarker(edge, type)) return;
    const key = [item.entryKey, edgeKind(edge, type), edge.dashed ? 1 : 0, edge.arrow ?? '', edge.thick ? 1 : 0].join('|');
    const list = faninGroups.get(key) ?? [];
    list.push(index);
    faninGroups.set(key, list);
  });
  const mergeClear = Math.max(16, baseClearance);
  const mergeDistance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const segMetrics = (a: Point, b: Point) => {
    const horizontal = Math.abs(a.y - b.y) < 0.01;
    return {
      horizontal,
      fixed: horizontal ? a.y : a.x,
      lo: horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y),
      hi: horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y),
      dir: horizontal ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y),
      coord: (p: Point) => horizontal ? p.x : p.y,
    };
  };
  const jogClear = (a: Point, b: Point): boolean => {
    const horizontal = Math.abs(a.y - b.y) < 0.01;
    return !obstacles.some(obstacle => {
      const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
      const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
      const fixed = horizontal ? a.y : a.x;
      const oLo = horizontal ? obstacle.x : obstacle.y;
      const oHi = horizontal ? obstacle.x + obstacle.width : obstacle.y + obstacle.height;
      const oFixedLo = horizontal ? obstacle.y : obstacle.x;
      const oFixedHi = horizontal ? obstacle.y + obstacle.height : obstacle.x + obstacle.width;
      return fixed > oFixedLo + 0.5 && fixed < oFixedHi - 0.5 && hi > oLo + 0.5 && lo < oHi - 0.5;
    });
  };
  // A junction (or the jog leading to it) must not touch an unrelated route; routes into the same target converge legitimately.
  const touchesOtherRoute = (a: Point, b: Point, own: Route, trunkRoute: Route): boolean => {
    const horizontal = Math.abs(a.y - b.y) < 0.01;
    const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y), hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    const fixed = horizontal ? a.y : a.x;
    return result.routes.some(route => route !== own && route !== trunkRoute && route.ref.edge.to !== own.ref.edge.to && route.paths.some(path => path.some((q, i) => {
      if (!i) return false;
      const p = path[i - 1], segHorizontal = Math.abs(p.y - q.y) < 0.01;
      const segFixed = segHorizontal ? p.y : p.x;
      const segLo = segHorizontal ? Math.min(p.x, q.x) : Math.min(p.y, q.y), segHi = segHorizontal ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
      if (segHorizontal === horizontal) return Math.abs(segFixed - fixed) < 0.5 && segHi > lo - 0.5 && segLo < hi + 0.5;
      return segFixed >= lo - 0.5 && segFixed <= hi + 0.5 && fixed >= segLo - 0.5 && fixed <= segHi + 0.5;
    })));
  };
  // A junction must read as "this line joins that line": away from the trunk's corners and source stem, so it
  // never looks attached to the node the trunk leaves. Only the corner where the trunk enters its shared target
  // stem, or a branch arriving from behind a corner in the trunk's own direction, may sit exactly on a vertex.
  const stemClear = Math.max(mergeClear, 32);
  const joinsCleanly = (point: Point, ti: number, trunk: Point[], sameDirection: boolean): boolean => {
    if (trunk.length > 2 && mergeDistance(point, trunk[trunk.length - 2]) < 0.01) return true;
    const fromStart = mergeDistance(point, trunk[ti - 1]), toEnd = mergeDistance(point, trunk[ti]);
    if (fromStart < (ti === 1 ? stemClear : mergeClear)) return ti > 1 && sameDirection && fromStart < 0.01;
    return toEnd >= mergeClear;
  };
  for (const indexes of faninGroups.values()) {
    if (indexes.length < 2) continue;
    const lengthOf = (index: number) => {
      const path = result.routes[index].paths[0];
      let total = 0;
      for (let i = 1; i < path.length; i++) total += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
      return total;
    };
    const trunkIndex = indexes.reduce((bestIndex, index) => lengthOf(index) < lengthOf(bestIndex) ? index : bestIndex);
    const trunkRoute = result.routes[trunkIndex];
    if (trunkRoute.paths.length !== 1) continue;
    const trunk = trunkRoute.paths[0];
    for (const index of indexes) {
      if (index === trunkIndex) continue;
      const branchRoute = result.routes[index];
      if (branchRoute.paths.length !== 1 || branchRoute.ref.edge.toLabel) continue;
      if ((adjustments?.edges?.[branchRoute.ref.key]?.waypoints ?? []).length) continue;
      const branch = branchRoute.paths[0];
      let mergedPath: Point[] | undefined;
      for (let bi = 1; bi < branch.length && !mergedPath; bi++) {
        const ba = branch[bi - 1], bb = branch[bi];
        const bInfo = segMetrics(ba, bb);
        if (!bInfo.dir) continue;
        let best: { alongFlow: number; branchEnd: Point; junction?: Point } | undefined;
        for (let ti = 1; ti < trunk.length; ti++) {
          const ta = trunk[ti - 1], tb = trunk[ti];
          const tInfo = segMetrics(ta, tb);
          if (!tInfo.dir) continue;
          let junction: Point | undefined;
          let branchEnd: Point | undefined;
          if (bInfo.horizontal !== tInfo.horizontal) {
            // Perpendicular contact: branch may end where it meets the trunk.
            const x = bInfo.horizontal ? tInfo.fixed : bInfo.fixed;
            const y = bInfo.horizontal ? bInfo.fixed : tInfo.fixed;
            const onB = bInfo.coord({ x, y }) >= bInfo.lo - 0.01 && bInfo.coord({ x, y }) <= bInfo.hi + 0.01;
            const onT = tInfo.coord({ x, y }) >= tInfo.lo - 0.01 && tInfo.coord({ x, y }) <= tInfo.hi + 0.01;
            if (!onB || !onT) continue;
            // Perpendicular crossings at the final port are not merges.
            if (Math.abs(x - branch[branch.length - 1].x) < 0.01 && Math.abs(y - branch[branch.length - 1].y) < 0.01) continue;
            if (!joinsCleanly({ x, y }, ti, trunk, false) || touchesOtherRoute({ x, y }, { x, y }, branchRoute, trunkRoute)) continue;
            branchEnd = { x, y };
          } else if (Math.abs(bInfo.fixed - tInfo.fixed) < 0.01) {
            // Collinear overlap: the branch reaches the trunk line itself.
            const lo = Math.max(bInfo.lo, tInfo.lo), hi = Math.min(bInfo.hi, tInfo.hi);
            if (hi - lo < 0.01) continue;
            const at = bInfo.dir > 0 ? lo : hi;
            branchEnd = bInfo.horizontal ? { x: at, y: bInfo.fixed } : { x: bInfo.fixed, y: at };
            if (!joinsCleanly(branchEnd, ti, trunk, bInfo.dir === tInfo.dir) || touchesOtherRoute(branchEnd, branchEnd, branchRoute, trunkRoute)) continue;
          } else {
            // Parallel channels: jog across only when close, overlapping and unobstructed, and clear of trunk corners.
            const distanceApart = Math.abs(bInfo.fixed - tInfo.fixed);
            if (distanceApart < 2 || distanceApart > 72 || bInfo.dir !== tInfo.dir) continue;
            const endClear = mergeClear + 8, startClear = ti === 1 ? stemClear + 8 : endClear;
            const [clearLo, clearHi] = tInfo.dir > 0 ? [startClear, endClear] : [endClear, startClear];
            const from = Math.max(bInfo.lo, tInfo.lo + clearLo), to = Math.min(bInfo.hi, tInfo.hi - clearHi);
            if (to - from < 0) continue;
            // Earliest clear spot along the branch's own direction keeps the branch short.
            for (let offset = 0; offset <= to - from + 0.01; offset += 8) {
              const at = bInfo.dir > 0 ? from + offset : to - offset;
              const end = bInfo.horizontal ? { x: at, y: bInfo.fixed } : { x: bInfo.fixed, y: at };
              const join = bInfo.horizontal ? { x: at, y: tInfo.fixed } : { x: tInfo.fixed, y: at };
              if (jogClear(end, join) && !touchesOtherRoute(end, join, branchRoute, trunkRoute)) { branchEnd = end; junction = join; break; }
            }
            if (!branchEnd) continue;
          }
          // The merge must not land past the branch segment.
          const along = bInfo.coord(branchEnd);
          const alongFlow = bInfo.dir > 0 ? along - bInfo.coord(ba) : bInfo.coord(ba) - along;
          if (alongFlow < -0.01) continue;
          const clamped = bInfo.dir > 0 ? Math.min(along, bInfo.hi) : Math.max(along, bInfo.lo);
          if (clamped !== along) continue;
          if (!best || alongFlow < best.alongFlow) best = { alongFlow, branchEnd, junction };
        }
        if (!best) continue;
        mergedPath = [...branch.slice(0, bi - 1), ba];
        if (Math.abs(ba.x - best.branchEnd.x) > 0.01 || Math.abs(ba.y - best.branchEnd.y) > 0.01) mergedPath.push(best.branchEnd);
        if (best.junction) mergedPath.push(best.junction);
        mergedPath = simplify(mergedPath);
        if (mergedPath.length < 2) mergedPath = undefined;
      }
      if (mergedPath) {
        branchRoute.paths = [mergedPath];
        branchRoute.merged = true;
      }
    }
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
  if (kind === 'usecase' || kind === 'start' || kind === 'end' || kind === 'circle') {
    if (horizontal) point.x = cx + (neighbor.x < cx ? -1 : 1) * rx * Math.sqrt(Math.max(0, 1 - ((point.y - cy) / ry) ** 2));
    else point.y = cy + (neighbor.y < cy ? -1 : 1) * ry * Math.sqrt(Math.max(0, 1 - ((point.x - cx) / rx) ** 2));
  } else if (kind === 'decision') {
    if (horizontal) point.x = cx + (neighbor.x < cx ? -1 : 1) * rx * Math.max(0, 1 - Math.abs(point.y - cy) / ry);
    else point.y = cy + (neighbor.y < cy ? -1 : 1) * ry * Math.max(0, 1 - Math.abs(point.x - cx) / rx);
  } else if (kind === 'terminal' && horizontal) {
    point.x = cx + (neighbor.x < cx ? -1 : 1) * (rx - ry + Math.sqrt(Math.max(0, ry * ry - (point.y - cy) ** 2)));
  } else if (kind === 'hexagon' && horizontal) {
    const full = Math.min(18, box.width / 4), inset = full * (1 - Math.abs(point.y - cy) / ry);
    point.x = neighbor.x < cx ? box.x + full - inset : box.x + box.width - full + inset;
  } else if ((kind === 'io' || kind === 'trapezoid') && horizontal) {
    const t = (point.y - box.y) / box.height, skew = Math.min(16, box.width / 5);
    point.x = neighbor.x < cx ? box.x + skew * (1 - t) : box.x + box.width - skew * (kind === 'io' ? t : 1 - t);
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
  } else if (kind === 'queue' && horizontal) {
    point.x = neighbor.x < cx ? box.x + 10 - 10 * Math.sqrt(Math.max(0, 1 - ((point.y - cy) / ry) ** 2)) : box.x + box.width - 10 + 10 * Math.sqrt(Math.max(0, 1 - ((point.y - cy) / ry) ** 2));
  } else if (kind === 'package') {
    const tab = Math.min(box.width - 28, Math.max(56, box.width * 0.4));
    if (!horizontal && neighbor.y < cy && point.x > box.x + tab) point.y = box.y + 20;
    else if (horizontal && neighbor.x > cx && point.y < box.y + 20) point.x = box.x + tab;
  } else if (kind === 'note') {
    if (!horizontal && neighbor.y < cy && point.x > box.x + box.width - 18) point.y = box.y + point.x - (box.x + box.width - 18);
    else if (horizontal && neighbor.x > cx && point.y < box.y + 18) point.x = box.x + box.width - 18 + (point.y - box.y);
  } else if (kind === 'server') {
    if (!horizontal && neighbor.y < cy && point.x < box.x + 14) point.y = box.y + 12 * (1 - (point.x - box.x) / 14);
    else if (horizontal && neighbor.x < cx && point.y < box.y + 12) point.x = box.x + 14 * (1 - (point.y - box.y) / 12);
    else if (!horizontal && neighbor.y > cy && point.x > box.x + box.width - 14) point.y = box.y + box.height - 12 * ((point.x - (box.x + box.width - 14)) / 14);
    else if (horizontal && neighbor.x > cx && point.y > box.y + box.height - 12) point.x = box.x + box.width - 14 * ((point.y - (box.y + box.height - 12)) / 12);
  }
}


function markerSet(prefix: string, suffix: string, stroke: string, background: string): string {
  return `<marker id="${prefix}-arrow${suffix}" viewBox="-1 -1 14 14" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1.2 L11 6 L1 10.8 Z" fill="${stroke}"/></marker><marker id="${prefix}-open${suffix}" viewBox="-1 -1 14 14" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1.2 L11 6 L1 10.8" fill="none" stroke="${stroke}" stroke-width="1.6"/></marker><marker id="${prefix}-triangle${suffix}" viewBox="-2 -2 18 16" refX="13" refY="6" markerWidth="18" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 0 L13 6 L1 12 Z" fill="${background}" stroke="${stroke}" stroke-width="1.5"/></marker><marker id="${prefix}-aggregation${suffix}" viewBox="-2 -2 24 16" refX="0" refY="6" markerWidth="24" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 6 L10 0 L20 6 L10 12 Z" fill="${background}" stroke="${stroke}" stroke-width="1.5"/></marker><marker id="${prefix}-composition${suffix}" viewBox="-2 -2 24 16" refX="0" refY="6" markerWidth="24" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 6 L10 0 L20 6 L10 12 Z" fill="${stroke}" stroke="${stroke}" stroke-width="1.5"/></marker>`
    + `<marker id="${prefix}-arrow-start${suffix}" viewBox="-1 -1 14 14" refX="1" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M11 1.2 L1 6 L11 10.8 Z" fill="${stroke}"/></marker>`
    + `<marker id="${prefix}-open-start${suffix}" viewBox="-1 -1 14 14" refX="1" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M11 1.2 L1 6 L11 10.8" fill="none" stroke="${stroke}" stroke-width="1.6"/></marker>`
    + `<marker id="${prefix}-triangle-start${suffix}" viewBox="-2 -2 18 16" refX="1" refY="6" markerWidth="18" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M13 0 L1 6 L13 12 Z" fill="${background}" stroke="${stroke}" stroke-width="1.5"/></marker>`
    + `<marker id="${prefix}-circle${suffix}" viewBox="0 0 12 12" refX="10.5" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><circle cx="6" cy="6" r="4.5" fill="${background}" stroke="${stroke}" stroke-width="1.5"/></marker>`
    + `<marker id="${prefix}-circle-start${suffix}" viewBox="0 0 12 12" refX="1.5" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><circle cx="6" cy="6" r="4.5" fill="${background}" stroke="${stroke}" stroke-width="1.5"/></marker>`
    + `<marker id="${prefix}-cross${suffix}" viewBox="0 0 12 12" refX="8" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M2 2 L10 10 M10 2 L2 10" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/></marker>`
    + `<marker id="${prefix}-cross-start${suffix}" viewBox="0 0 12 12" refX="4" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M2 2 L10 10 M10 2 L2 10" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/></marker>`;
}

function markerDefinitions(prefix: string, theme: Theme): string {
  const stroke = esc(theme.primary), secondary = esc(theme.secondary), background = esc(theme.background === 'transparent' ? theme.surface : theme.background);
  return `<defs>${markerSet(prefix, '', stroke, background)}${secondary !== stroke ? markerSet(prefix, '-sec', secondary, background) : ''}</defs>`;
}

function renderContainer(box: ContainerBox, theme: Theme, direction: 'TB' | 'LR', spec: DiagramSpec, region?: ReturnType<typeof regionPaint>): string {
  const { x, y, width: w, height: h, ref } = box;
  const border = esc(region?.stroke ?? theme.border), surface = esc(region?.fill ?? theme.surface), primary = esc(region?.header ?? theme.primary);
  const headerOpacity = region ? '1' : '0.08';
  const strokeW = numeric(Math.max(1.2, theme.lineWidth * 0.8));
  let shape = '';
  let labelX = x + 16, labelY = y + theme.fontSize + 10;
  if (ref.kind === 'lane') {
    shape = `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(h)}" fill="${surface}" stroke="${border}" stroke-width="${strokeW}"/>`;
    if (direction === 'TB') shape += `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(ref.header)}" fill="${primary}" fill-opacity="${headerOpacity}"/><path d="M${numeric(x)} ${numeric(y + ref.header)} H${numeric(x + w)}" stroke="${border}" stroke-width="${strokeW}"/>`;
    else shape += `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(ref.header)}" height="${numeric(h)}" fill="${primary}" fill-opacity="${headerOpacity}"/><path d="M${numeric(x + ref.header)} ${numeric(y)} V${numeric(y + h)}" stroke="${border}" stroke-width="${strokeW}"/>`;
  } else if (ref.kind === 'package') {
    const tabWidth = Math.min(w - 24, Math.max(80, measure(ref.label, theme.fontSize).width + 32));
    const tabHeight = ref.header;
    shape = `<path d="M${numeric(x)} ${numeric(y + h)} V${numeric(y)} H${numeric(x + tabWidth)} V${numeric(y + tabHeight)} H${numeric(x + w)} V${numeric(y + h)} Z" fill="${surface}" stroke="${border}" stroke-width="${strokeW}"/><path d="M${numeric(x)} ${numeric(y + tabHeight)} H${numeric(x + tabWidth)}" stroke="${border}" stroke-width="${strokeW}"/>`;
  } else if (ref.kind === 'node') {
    shape = `<path d="M${numeric(x)} ${numeric(y + 10)} L${numeric(x + 12)} ${numeric(y)} H${numeric(x + w)} V${numeric(y + h - 10)} L${numeric(x + w - 12)} ${numeric(y + h)} H${numeric(x)} Z" fill="${surface}" stroke="${border}" stroke-width="${strokeW}"/><path d="M${numeric(x)} ${numeric(y + 10)} H${numeric(x + w - 12)} L${numeric(x + w)} ${numeric(y)} M${numeric(x + w - 12)} ${numeric(y + 10)} V${numeric(y + h)}" fill="none" stroke="${border}" stroke-width="${strokeW}"/>`;
    shape += text(labelX, y + 26, '«node»', theme, { size: Math.max(10, theme.fontSize - 3), anchor: 'start', fill: theme.muted });
    labelY = y + 28 + theme.fontSize;
  } else {
    shape = `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(h)}" rx="${numeric(theme.radius)}" fill="${surface}" stroke="${border}" stroke-width="${strokeW}" stroke-dasharray="7 5"/>`;
  }
  const field = ref.kind === 'lane' ? 'lanes' : 'groups';
  const editorIndex = (spec[field] ?? []).findIndex(item => item.id === ref.originalId);
  const editorKey = editorIndex >= 0 ? ` data-editor-key="${field}/${editorIndex}"` : '';
  return `<g class="uml-container uml-${ref.kind}"${editorKey} data-adjustment-key="${field}/${esc(ref.originalId)}" data-layout-x="${numeric(x)}" data-layout-y="${numeric(y)}"${layoutCenterMetadata(spec, `${field}/${ref.originalId}`, box)} data-${ref.kind === 'lane' ? 'lane' : 'group'}-id="${esc(ref.originalId)}"${ref.lane && ref.kind !== 'lane' ? ` data-lane-id="${esc(ref.lane)}"` : ''}><title>${esc(ref.label)}</title>${shape}${text(labelX, labelY, ref.label, theme, { anchor: 'start', weight: 650, fill: region?.text })}</g>`;
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

function renderNode(box: NodeBox, spec: DiagramSpec, adjustmentMetadata = true): string {
  const { x, y, width: w, height: h, ref } = box;
  const { theme, kind, node } = ref;
  const metadata = adjustmentMetadata ? ` data-adjustment-key="nodes/${esc(node.id)}" data-layout-x="${numeric(x)}" data-layout-y="${numeric(y)}"${layoutCenterMetadata(spec, `nodes/${node.id}`, box)}` : '';
  if (w !== ref.renderWidth || h !== ref.renderHeight) {
    const scaleX = w / ref.renderWidth, scaleY = h / ref.renderHeight;
    const virtual = { ...box, x: 0, y: 0, width: ref.renderWidth, height: ref.renderHeight, caption: undefined };
    const caption = box.caption ? text(x + box.caption.x + box.caption.width / 2, y + box.caption.y + 2 + box.caption.size, box.caption.value, theme, { size: box.caption.size, fill: theme.muted }) : '';
    return `<g${metadata}><g transform="translate(${numeric(x)} ${numeric(y)}) scale(${scaleX} ${scaleY})">${renderNode(virtual, spec, false)}</g>${caption}</g>`;
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
  } else if (kind === 'terminal') {
    shape = `${rect} rx="${numeric(h / 2)}" ${common}/>`;
    content = centeredContent(ref, x, y, w, h);
  } else if (kind === 'circle') {
    shape = `<ellipse cx="${numeric(x + w / 2)}" cy="${numeric(y + h / 2)}" rx="${numeric(w / 2)}" ry="${numeric(h / 2)}" ${common}/>`;
    content = centeredContent(ref, x, y, w, h);
  } else if (kind === 'subroutine') {
    shape = `${rect} rx="${numeric(Math.min(4, theme.radius))}" ${common}/><path d="M${numeric(x + 10)} ${numeric(y)} V${numeric(y + h)} M${numeric(x + w - 10)} ${numeric(y)} V${numeric(y + h)}" stroke="${stroke}" stroke-width="${numeric(theme.lineWidth)}"/>`;
    content = centeredContent(ref, x + 10, y, w - 20, h);
  } else if (kind === 'hexagon') {
    const inset = Math.min(18, w / 4);
    shape = `<path d="M${numeric(x + inset)} ${numeric(y)} H${numeric(x + w - inset)} L${numeric(x + w)} ${numeric(y + h / 2)} L${numeric(x + w - inset)} ${numeric(y + h)} H${numeric(x + inset)} L${numeric(x)} ${numeric(y + h / 2)} Z" ${common}/>`;
    content = centeredContent(ref, x + inset, y, w - inset * 2, h);
  } else if (kind === 'io' || kind === 'trapezoid') {
    const skew = Math.min(16, w / 5);
    shape = kind === 'io'
      ? `<path d="M${numeric(x + skew)} ${numeric(y)} H${numeric(x + w)} L${numeric(x + w - skew)} ${numeric(y + h)} H${numeric(x)} Z" ${common}/>`
      : `<path d="M${numeric(x + skew)} ${numeric(y)} H${numeric(x + w - skew)} L${numeric(x + w)} ${numeric(y + h)} H${numeric(x)} Z" ${common}/>`;
    content = centeredContent(ref, x + skew, y, w - skew * 2, h);
  } else if (kind === 'note') {
    shape = `<path d="M${numeric(x)} ${numeric(y)} H${numeric(x + w - 18)} L${numeric(x + w)} ${numeric(y + 18)} V${numeric(y + h)} H${numeric(x)} Z" ${common}/><path d="M${numeric(x + w - 18)} ${numeric(y)} V${numeric(y + 18)} H${numeric(x + w)}" fill="none" stroke="${stroke}"/>`;
    content = centeredContent(ref, x + 6, y + 10, w - 18, h - 16);
  } else if (kind === 'image') {
    const ix = symbolX, iy = symbolY, iw = symbol.width, ih = symbol.height;
    const radius = Math.min(10, theme.radius + 2);
    const clip = `uml-image-clip-${esc(node.id)}`;
    const frameRect = `<rect x="${numeric(ix)}" y="${numeric(iy)}" width="${numeric(iw)}" height="${numeric(ih)}" rx="${numeric(radius)}"`;
    shape = `<defs><clipPath id="${clip}">${frameRect}/></clipPath></defs>${frameRect} fill="${surface}"/>`
      + (node.src ? `<image href="${esc(node.src)}" x="${numeric(ix)}" y="${numeric(iy)}" width="${numeric(iw)}" height="${numeric(ih)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clip})"/>` : '')
      + `${frameRect} fill="none" stroke="${stroke}" stroke-width="${numeric(Math.max(1, theme.lineWidth * 0.9))}"/>`;
    content = text(x + w / 2, iy + ih + 10 + theme.fontSize, node.label, theme, { weight: 550 });
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
  return `<g class="uml-node uml-node-${kind}"${metadata} data-editor-key="nodes/${spec.nodes!.indexOf(ref.sourceNode)}" data-node-id="${esc(node.id)}"${node.lane ? ` data-lane-id="${esc(node.lane)}"` : ''}${node.group ? ` data-group-id="${esc(node.group)}"` : ''}><title>${esc([ref.sourceNode.label, ref.sourceNode.detail, ...(ref.sourceNode.attributes ?? []), ...(ref.sourceNode.operations ?? [])].filter(Boolean).join('\n'))}</title>${shape}${content}</g>`;
}

function segmentIntersectsRect(a: Point, b: Point, box: Rect, margin = 0): boolean {
  let low = 0, high = 1;
  const deltaX = b.x - a.x, minX = box.x - margin, maxX = box.x + box.width + margin;
  if (Math.abs(deltaX) < 0.001) { if (a.x < minX || a.x > maxX) return false; }
  else {
    const first = (minX - a.x) / deltaX, last = (maxX - a.x) / deltaX;
    low = Math.max(low, Math.min(first, last)); high = Math.min(high, Math.max(first, last));
    if (low > high) return false;
  }
  const deltaY = b.y - a.y, minY = box.y - margin, maxY = box.y + box.height + margin;
  if (Math.abs(deltaY) < 0.001) { if (a.y < minY || a.y > maxY) return false; }
  else {
    const first = (minY - a.y) / deltaY, last = (maxY - a.y) / deltaY;
    low = Math.max(low, Math.min(first, last)); high = Math.min(high, Math.max(first, last));
    if (low > high) return false;
  }
  return true;
}

/** Distance from a segment to one rectangle corner; Math.hypot is skipped when its lower bound cannot beat `best`. */
function cornerDistance(px: number, py: number, ax: number, ay: number, dx: number, dy: number, squared: number, best: number): number {
  const fraction = squared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / squared)) : 0;
  const ex = px - ax - dx * fraction, ey = py - ay - dy * fraction;
  // hypot(x, y) >= max(|x|, |y|), so such a corner cannot lower the minimum.
  if (Math.abs(ex) >= best || Math.abs(ey) >= best) return best;
  const distance = Math.hypot(ex, ey);
  return distance < best ? distance : best;
}

function segmentRectDistance(a: Point, b: Point, box: Rect): number {
  if (segmentIntersectsRect(a, b, box)) return 0;
  const ax = a.x, ay = a.y, dx = b.x - ax, dy = b.y - ay, squared = dx * dx + dy * dy;
  const x0 = box.x, y0 = box.y, x1 = box.x + box.width, y1 = box.y + box.height;
  let best = cornerDistance(x0, y0, ax, ay, dx, dy, squared, Infinity);
  best = cornerDistance(x1, y0, ax, ay, dx, dy, squared, best);
  best = cornerDistance(x0, y1, ax, ay, dx, dy, squared, best);
  best = cornerDistance(x1, y1, ax, ay, dx, dy, squared, best);
  for (let index = 0; index < 2; index++) {
    const point = index ? b : a;
    const gx = Math.max(box.x - point.x, 0, point.x - box.x - box.width), gy = Math.max(box.y - point.y, 0, point.y - box.y - box.height);
    if (gx >= best || gy >= best) continue;
    const distance = Math.hypot(gx, gy);
    if (distance < best) best = distance;
  }
  return best;
}

/** Cheap lower bound of segmentRectDistance: the gap between the segment's bounds and the rectangle. */
function segmentRectGap(a: Point, b: Point, box: Rect): number {
  const gx = Math.max(box.x - Math.max(a.x, b.x), Math.min(a.x, b.x) - (box.x + box.width), 0);
  const gy = Math.max(box.y - Math.max(a.y, b.y), Math.min(a.y, b.y) - (box.y + box.height), 0);
  return gx > gy ? gx : gy;
}

function labelIntersectsNode(label: Rect, node: NodeBox): boolean {
  if (!intersects(label, node, 5)) return false;
  const dx = Math.max(label.x - 5 - node.x - node.width / 2, 0, node.x + node.width / 2 - label.x - label.width - 5) / (node.width / 2);
  const dy = Math.max(label.y - 5 - node.y - node.height / 2, 0, node.y + node.height / 2 - label.y - label.height - 5) / (node.height / 2);
  if (node.ref.kind === 'decision') return dx + dy < 1;
  if (['usecase', 'start', 'end'].includes(node.ref.kind)) return dx * dx + dy * dy < 1;
  return true;
}

function placeLabels(routes: Route[], nodes: NodeBox[], containers: ContainerBox[], direction: 'TB' | 'LR', finalPass = false): EdgeLabelBox[] | undefined {
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
    // Candidates stay plain numbers; only the few that are inspected become label boxes.
    const candidateX: number[] = [], candidateY: number[] = [], anchorXs: number[] = [], anchorYs: number[] = [];
    const scoreHead: number[] = [], scoreTail: number[] = [], sharedFlags: boolean[] = [];
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
          Math.max(start, Math.min(end, desired - offset)), start + Math.min(1, (end - start) / 2), end - Math.min(1, (end - start) / 2)]);
        // A narrow free interval beside a node can fall between the regular samples.
        const half = (Math.abs(ux) * label.width + Math.abs(uy) * label.height) / 2;
        for (const box of [...nodes, ...occupied]) {
          const projections = [
            (box.x - a.x) * ux + (box.y - a.y) * uy,
            (box.x + box.width - a.x) * ux + (box.y - a.y) * uy,
            (box.x - a.x) * ux + (box.y + box.height - a.y) * uy,
            (box.x + box.width - a.x) * ux + (box.y + box.height - a.y) * uy,
          ];
          for (const position of [Math.min(...projections) - half - 6, Math.max(...projections) + half + 6]) {
            if (position > start && position < end) positions.add(position);
          }
        }
        const steps = Math.min(60, Math.ceil((end - start) / 12));
        for (let step = 0; step <= steps; step++) positions.add(start + (end - start) * step / Math.max(1, steps));
        const shifts = end - start < Math.abs(ux) * label.width + Math.abs(uy) * label.height + 16 ? [0, -12, 12, -24, 24] : [0];
        for (const position of positions) for (const gap of (finalPass ? [8, 5, 12, 18, 28, 44, 68, 100, 160, 256, 512] : [8, 5, 12, 18, 28, 44])) for (const sign of [1, -1]) for (const shift of shifts) {
          const anchorX = a.x + ux * position, anchorY = a.y + uy * position;
          const normalX = -uy * sign, normalY = ux * sign;
          const distance = gap + Math.abs(normalX) * label.width / 2 + Math.abs(normalY) * label.height / 2;
          candidateX.push(anchorX + normalX * distance + ux * shift - label.width / 2);
          candidateY.push(anchorY + normalY * distance + uy * shift - label.height / 2);
          anchorXs.push(anchorX); anchorYs.push(anchorY);
          // score = head + (shared ? 4000 : ambiguous ? 1000 : 0) + tail, summed in this order.
          scoreHead.push(Math.abs(offset + position - desired) * (branch || label.role !== 'main' ? 0.3 : 0.1) + gap * 2 + (gap < 8 ? 20 : 0) + Math.abs(shift));
          scoreTail.push(gap > 18 ? 500 : 0);
          sharedFlags.push(shared);
        }
      }
    }
    const sharedAnchor = (anchor: Point) => others.some(other => segmentRectDistance(other.a, other.b, { ...anchor, width: 0, height: 0 }) < 0.01);
    // Pick the first acceptable candidate in stable score order. The ambiguity term (+1000) costs distance
    // queries, so candidates enter a heap with their lower-bound score and are resolved lazily: placement
    // checks that do not depend on the score run first, and a score that grows sends the entry back.
    const count = candidateX.length;
    const keys = new Float64Array(count);
    const boxes: (EdgeLabelBox | undefined)[] = new Array(count);
    for (let i = 0; i < count; i++) keys[i] = sharedFlags[i] ? scoreHead[i] + 4000 + scoreTail[i] : scoreHead[i] + scoreTail[i];
    const heap = new Int32Array(count);
    for (let i = 0; i < count; i++) heap[i] = i;
    let heapSize = count;
    const before = (first: number, second: number): boolean => keys[first] < keys[second] || (keys[first] === keys[second] && first < second);
    const siftDown = (index: number): void => {
      const item = heap[index];
      while (index * 2 + 1 < heapSize) {
        let child = index * 2 + 1;
        if (child + 1 < heapSize && before(heap[child + 1], heap[child])) child++;
        if (!before(heap[child], item)) break;
        heap[index] = heap[child]; index = child;
      }
      heap[index] = item;
    };
    for (let index = (heapSize >> 1) - 1; index >= 0; index--) siftDown(index);
    const popTop = (): void => { heap[0] = heap[--heapSize]; if (heapSize) siftDown(0); };
    const probe: Rect = { x: 0, y: 0, width: label.width, height: label.height };
    let chosen: EdgeLabelBox | undefined;
    while (heapSize) {
      const i = heap[0];
      let box = boxes[i];
      if (!box) {
        box = boxes[i] = { x: candidateX[i], y: candidateY[i], width: label.width, height: label.height, value: label.value, size: label.size,
          ref: route.ref, role: label.role, anchor: { x: anchorXs[i], y: anchorYs[i] } };
        const candidate = box;
        if (nodes.some(node => labelIntersectsNode(candidate, node))
          || occupied.some(other => intersects(candidate, other, 5))
          || allSegments.some(({ a, b }) => segmentIntersectsRect(a, b, candidate, 4))) { popTop(); continue; }
        let ambiguous = sharedFlags[i], own = Infinity;
        if (!ambiguous) {
          probe.x = candidateX[i]; probe.y = candidateY[i];
          // Exact minimum over own segments; a bounds gap above the current minimum cannot lower it.
          for (const segment of segments) {
            if (segmentRectGap(segment.a, segment.b, probe) > own + 1e-6) continue;
            const distance = segmentRectDistance(segment.a, segment.b, probe);
            if (distance < own) own = distance;
          }
          // Only whether some other segment is closer than own + 3 matters.
          const threshold = own + 3;
          for (const other of others) {
            if (segmentRectGap(other.a, other.b, probe) >= threshold + 1e-6) continue;
            if (segmentRectDistance(other.a, other.b, probe) < threshold) { ambiguous = true; break; }
          }
          if (ambiguous) { keys[i] = scoreHead[i] + 1000 + scoreTail[i]; siftDown(0); }
        }
        box.leader = ambiguous || own > 18;
        if (heap[0] !== i) continue;
      }
      popTop();
      if (box.leader) {
        const anchor = box.anchor;
        const end = { x: Math.max(box.x, Math.min(box.x + box.width, anchor.x)),
          y: Math.max(box.y, Math.min(box.y + box.height, anchor.y)) };
        if (!finalPass && (sharedAnchor(anchor) || Math.hypot(end.x - anchor.x, end.y - anchor.y) > 48)) continue;
        if (nodes.some(node => segmentIntersectsRect(anchor, end, node, 1))
          || occupied.some(other => segmentIntersectsRect(anchor, end, other, 2))) continue;
      }
      chosen = box;
      break;
    }
    if (!chosen) {
      // Reflow before resorting to a distant annotation. Moving only the text upwards
      // can send it to the top of the diagram and draw its leader through other nodes.
      if (!finalPass) return undefined;
      throw new Error(`Unable to place annotation beside relationship ${route.ref.edge.from} → ${route.ref.edge.to}.`);
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

function staggerConnections(spec: DiagramSpec): boolean {
  return spec.layout?.horizontalStagger === true && ['activity', 'flowchart', 'swimlane'].includes(spec.type);
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
    constrain(from, to, laneOf(from) === laneOf(to) ? separation(from, to, Math.max(0, ...edge.labels.map(label => label[size] + 16))) : staggerConnections(spec) ? Math.max(24, gap) : 0);
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
  const stagger = staggerConnections(spec);
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
  if (stagger) {
    // Cross-column hand-offs advance along the flow axis rather than sharing a row.
    // Reject a constraint that would invert a column's order or close a feedback loop.
    for (const edge of edges) {
      const from = index.get(edge.edge.from), to = index.get(edge.edge.to);
      if (from === undefined || to === undefined || from === to) continue;
      if (columns.get(nodes[from].ref.id) === columns.get(nodes[to].ref.id)
        && Math.abs(center(from) - center(to)) >= 0.01) continue;
      if (reachable(adjacency(), to, from)) continue;
      constraints.push({ from, to, distance: Math.max(24, gap) });
    }
  } else {
    for (const candidate of candidates) {
      const from = find(candidate.from), to = find(candidate.to);
      if (from === to) continue;
      const graph = adjacency();
      if (!reachable(graph, from, to) && !reachable(graph, to, from)) parents[to] = from;
    }
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
  const pad = containerPad(spec);
  for (const container of [...result.containers].sort((a, b) => b.depth - a.depth)) {
    const cPad = container.ref.kind === 'lane' ? 28 : pad;
    const members = nodes.filter(box => {
      if (container.ref.kind === 'lane') return box.ref.node.lane === container.ref.originalId || (!box.ref.node.lane && container.ref.originalId.startsWith('__uml_unassigned_lane__'));
      let group = box.ref.node.group;
      while (group) { if (group === container.ref.originalId) return true; group = groups.get(group); }
      return false;
    });
    for (const box of members) { const occupied = occupiedNode(box); container[size] = Math.max(container[size], occupied[axis] + occupied[size] + cPad - container[axis]); }
    for (const child of result.containers) if (child.depth > container.depth && (child.ref.lane === container.ref.lane)
      && (container.ref.kind === 'lane' || groups.get(child.ref.originalId) === container.ref.originalId)) {
      container[size] = Math.max(container[size], child[axis] + child[size] + cPad - container[axis]);
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

/** `{cx, cy}` pins the rectangle centre, `{x, y}` its top-left corner; `{dx, dy}` is a legacy relative offset. */
function adjustmentDelta(box: Rect, adjustment?: ElementAdjustment): Point {
  if (!adjustment) return { x: 0, y: 0 };
  if ('cx' in adjustment) return { x: adjustment.cx - (box.x + box.width / 2), y: adjustment.cy - (box.y + box.height / 2) };
  return 'dx' in adjustment ? { x: adjustment.dx, y: adjustment.dy } : { x: adjustment.x - box.x, y: adjustment.y - box.y };
}

function isPinned(adjustment?: ElementAdjustment): boolean {
  return !!adjustment && ('cx' in adjustment || 'x' in adjustment);
}

function hasAdjustments(spec: DiagramSpec): boolean {
  const manual = spec.layout?.adjustments;
  return !!(Object.keys(manual?.elements ?? {}).length || Object.keys(manual?.edges ?? {}).length);
}

/** Centre/pin metadata exists only on adjusted diagrams, so unadjusted SVG stays byte-for-byte stable. */
function layoutCenterMetadata(spec: DiagramSpec, key: string, box: Rect): string {
  if (!hasAdjustments(spec)) return '';
  const pinned = isPinned(spec.layout?.adjustments?.elements?.[key]);
  return ` data-layout-cx="${numeric(box.x + box.width / 2)}" data-layout-cy="${numeric(box.y + box.height / 2)}"${pinned ? ' data-pinned="true"' : ''}`;
}

/**
 * Apply overrides after automatic placement. Pinned elements (`cx/cy`, `x/y`) sit exactly on their
 * coordinates; pinned containers carry their unpinned members; unpinned elements keep the automatic
 * position unless they collide with a pinned element, in which case they are pushed to the nearest
 * free position (chained). Containers then wrap their members. Legacy `dx/dy` offsets keep their
 * historical behaviour: they move relative to the automatic layout and never push neighbours.
 */
function applyManualElements(result: LayoutResult, spec: DiagramSpec, direction: 'TB' | 'LR', edges: EdgeRef[] = [], fontSize = 14): void {
  const adjustments = spec.layout?.adjustments?.elements;
  if (!adjustments || !Object.keys(adjustments).length) return;
  const flowAxis = direction === 'LR' ? 'x' : 'y';
  const pinnedNodes = new Set<NodeBox>(), pinnedContainers = new Set<ContainerBox>();
  const parents = new Map((spec.groups ?? []).map(group => [group.id, group.parent]));
  const withinGroup = (id: string | undefined, ancestor: string): boolean => {
    while (id) { if (id === ancestor) return true; id = parents.get(id); }
    return false;
  };
  const nodeWithin = (node: NodeBox, container: ContainerBox): boolean => {
    if (container.ref.kind !== 'lane') return withinGroup(node.ref.node.group, container.ref.originalId);
    const lane = node.ref.node.lane ?? result.containers.find(box => box.ref.kind !== 'lane' && box.ref.originalId === node.ref.node.group)?.ref.lane;
    return lane === container.ref.originalId || (!lane && container.ref.originalId.startsWith('__uml_unassigned_lane__'));
  };
  const containerWithin = (child: ContainerBox, container: ContainerBox): boolean => child !== container && (
    container.ref.kind === 'lane' ? child.ref.lane === container.ref.originalId : withinGroup(parents.get(child.ref.originalId), container.ref.originalId));
  let moved = false;
  // 1. Place containers outer-first; a container carries its members (pinned members are placed afterwards).
  for (const container of [...result.containers].sort((a, b) => a.depth - b.depth)) {
    const key = `${container.ref.kind === 'lane' ? 'lanes' : 'groups'}/${container.ref.originalId}`;
    const adjustment = adjustments[key];
    const delta = adjustmentDelta(container, adjustment);
    if (isPinned(adjustment)) {
      pinnedContainers.add(container);
      // A lane is a band: its pin positions it across the flow, while all lanes share one flow extent.
      if (container.ref.kind === 'lane') delta[flowAxis] = 0;
    }
    if (!delta.x && !delta.y) continue;
    moved = true;
    container.x += delta.x; container.y += delta.y;
    for (const child of result.containers) if (containerWithin(child, container)) { child.x += delta.x; child.y += delta.y; }
    for (const node of result.nodes) if (nodeWithin(node, container)) { node.x += delta.x; node.y += delta.y; }
  }
  for (const node of result.nodes) {
    const adjustment = adjustments[`nodes/${node.ref.node.id}`];
    if (isPinned(adjustment)) pinnedNodes.add(node);
    const delta = adjustmentDelta(node, adjustment);
    if (delta.x || delta.y) moved = true;
    node.x += delta.x; node.y += delta.y;
  }
  // Pinned edge labels are known before routing; unpinned nodes avoid them as well.
  const labelPins: Rect[] = [];
  for (const edge of edges) for (const label of edge.labels) {
    const adjustment = adjustments[`edge-labels/${edge.key}/${label.role}`];
    if (adjustment && 'cx' in adjustment) labelPins.push({ x: adjustment.cx - label.width / 2, y: adjustment.cy - label.height / 2, width: label.width, height: label.height });
    else if (adjustment && 'x' in adjustment) labelPins.push({ x: adjustment.x, y: adjustment.y, width: label.width, height: label.height });
  }
  const pinning = pinnedNodes.size > 0 || pinnedContainers.size > 0 || labelPins.length > 0;
  if (!moved && !pinning) return;
  type Item = NodeBox | ContainerBox;
  const isNode = (item: Item): item is NodeBox => 'node' in item.ref;
  const nodeAncestors = new Map(result.nodes.map(node => [node, result.containers.filter(box => nodeWithin(node, box)).sort((a, b) => b.depth - a.depth)]));
  const containerAncestors = new Map(result.containers.map(child => [child, result.containers.filter(box => containerWithin(child, box)).sort((a, b) => b.depth - a.depth)]));
  /** Enclosing containers, innermost first. */
  const ancestors = (item: Item): ContainerBox[] => (isNode(item) ? nodeAncestors.get(item) : containerAncestors.get(item)) ?? [];
  const pinnedItem = (item: Item): boolean => isNode(item) ? pinnedNodes.has(item) : pinnedContainers.has(item);
  const fixedNode = (node: NodeBox): boolean => pinnedNodes.has(node) || ancestors(node).some(box => pinnedContainers.has(box));
  const rectOf = (item: Item): Rect => isNode(item) ? occupiedNode(item) : item;
  /** Move an item with every descendant that is not anchored by a pin inside it. */
  const shift = (item: Item, dx: number, dy: number): void => {
    item.x += dx; item.y += dy;
    if (isNode(item)) return;
    const anchored = (descendant: Item): boolean => pinnedItem(descendant)
      || ancestors(descendant).some(box => box !== item && pinnedContainers.has(box) && ancestors(box).includes(item));
    for (const child of result.containers) if (containerWithin(child, item) && !anchored(child)) { child.x += dx; child.y += dy; }
    for (const node of result.nodes) if (nodeWithin(node, item) && !anchored(node)) { node.x += dx; node.y += dy; }
  };
  // Grow both sides when necessary. A manual move never clips a member at its old boundary.
  // A pinned container grows symmetrically so its centre stays on the pin; a container whose
  // members are all fixed hugs them instead of keeping the automatic layout's spare area.
  const pad = containerPad(spec);
  const fit = (container: ContainerBox): void => {
    const cPad = container.ref.kind === 'lane' ? 28 : pad;
    const memberNodes = result.nodes.filter(node => !['start', 'end'].includes(node.ref.kind) && nodeWithin(node, container));
    const members: Rect[] = memberNodes.map(occupiedNode);
    members.push(...result.containers.filter(child => containerWithin(child, container)));
    if (!members.length) return;
    const headerX = container.ref.kind === 'lane' && direction === 'LR' ? container.ref.header : 0;
    const headerY = container.ref.kind === 'lane' && direction === 'LR' ? 0 : container.ref.header;
    const bounds = {
      x: [Math.min(...members.map(box => box.x - cPad - headerX)), Math.max(...members.map(box => box.x + box.width + cPad))],
      y: [Math.min(...members.map(box => box.y - cPad - headerY)), Math.max(...members.map(box => box.y + box.height + cPad))],
    };
    const pinnedBox = pinnedContainers.has(container);
    const tight = pinning && !pinnedBox && memberNodes.length > 0 && memberNodes.every(fixedNode);
    for (const [axis, size] of [['x', 'width'], ['y', 'height']] as const) {
      const [low, high] = bounds[axis];
      const band = container.ref.kind === 'lane' && axis === flowAxis;
      if (pinnedBox && !band) {
        const center = container[axis] + container[size] / 2, half = Math.max(container[size] / 2, center - low, high - center);
        container[axis] = center - half; container[size] = half * 2;
      } else if (tight && !band) {
        // Hugging members must still leave room for the container's own title.
        const title = measure(container.ref.label, fontSize);
        const titleRoom = container.ref.kind === 'lane' && direction === 'LR' ? (axis === 'y' ? title.height + 28 : 0) : (axis === 'x' ? title.width + 36 : 0);
        container[axis] = low; container[size] = Math.max(high - low, titleRoom);
      } else {
        const end = Math.max(container[axis] + container[size], high);
        container[axis] = Math.min(container[axis], low); container[size] = end - container[axis];
      }
    }
  };
  const fitAll = (): void => { for (const container of [...result.containers].sort((a, b) => b.depth - a.depth)) fit(container); };
  fitAll();
  if (!pinning) return;
  const crossAxis = flowAxis === 'x' ? 'y' : 'x', crossSize = crossAxis === 'x' ? 'width' : 'height';
  const lanes = result.containers.filter(box => box.ref.kind === 'lane');
  /** Keep lane bands disjoint across the flow; pinned lanes stay, others slide away from them. */
  const separateLanes = (): void => {
    if (lanes.length < 2) return;
    const ordered = [...lanes].sort((a, b) => (a[crossAxis] + a[crossSize] / 2) - (b[crossAxis] + b[crossSize] / 2));
    const overlap = (first: ContainerBox, second: ContainerBox): number => first[crossAxis] + first[crossSize] - second[crossAxis];
    const slide = (lane: ContainerBox, amount: number): void => { shift(lane, crossAxis === 'x' ? amount : 0, crossAxis === 'y' ? amount : 0); fitAll(); };
    for (let index = 1; index < ordered.length; index++) {
      const amount = overlap(ordered[index - 1], ordered[index]);
      if (amount > 0.01 && !pinnedContainers.has(ordered[index])) slide(ordered[index], amount);
    }
    for (let index = ordered.length - 2; index >= 0; index--) {
      const amount = overlap(ordered[index], ordered[index + 1]);
      if (amount > 0.01 && !pinnedContainers.has(ordered[index])) slide(ordered[index], -amount);
    }
  };
  separateLanes();
  // 2. Push unpinned elements off pinned ones (and, chained, off elements already pushed).
  const gap = spec.layout?.elementGap ?? 24;
  // Automatic neighbours closer than the full gap are not disturbed; a pushed element clears the full gap.
  const trigger = Math.min(gap, 12);
  type Dir = 'left' | 'right' | 'up' | 'down';
  interface Obstacle { rect: () => Rect; item?: Item; dir?: Dir }
  const obstacles: Obstacle[] = [
    ...result.containers.filter(box => pinnedContainers.has(box) && box.ref.kind !== 'lane').map(item => ({ rect: () => rectOf(item), item })),
    ...result.nodes.filter(box => pinnedNodes.has(box)).map(item => ({ rect: () => rectOf(item), item })),
    ...labelPins.map(rect => ({ rect: () => rect })),
  ];
  const related = (item: Item, other?: Item): boolean => !!other && (item === other
    || ancestors(item).includes(other as ContainerBox) || ancestors(other).includes(item as ContainerBox));
  /** The outermost unpinned non-lane container of `item` that does not also enclose the obstacle. */
  const blockOf = (item: Item, obstacle: Obstacle): Item => {
    const shared = new Set(obstacle.item ? ancestors(obstacle.item) : []);
    let block = item;
    for (const ancestor of ancestors(item)) {
      if (shared.has(ancestor) || ancestor.ref.kind === 'lane' || pinnedContainers.has(ancestor)) break;
      block = ancestor;
    }
    return block;
  };
  const clearance = (box: Rect, other: Rect, dir: Dir): number => dir === 'right' ? other.x + other.width + gap - box.x
    : dir === 'left' ? box.x + box.width + gap - other.x
      : dir === 'down' ? other.y + other.height + gap - box.y : box.y + box.height + gap - other.y;
  const move = (item: Item, dir: Dir, amount: number): void =>
    shift(item, dir === 'right' ? amount : dir === 'left' ? -amount : 0, dir === 'down' ? amount : dir === 'up' ? -amount : 0);
  const preference: Dir[] = direction === 'LR' ? ['right', 'down', 'up', 'left'] : ['down', 'right', 'left', 'up'];
  const movables: Item[] = [
    ...result.containers.filter(box => !pinnedContainers.has(box) && box.ref.kind !== 'lane'),
    ...result.nodes.filter(box => !pinnedNodes.has(box)),
  ].sort((a, b) => a[flowAxis] - b[flowAxis] || a[crossAxis] - b[crossAxis]);
  const pushed = new Map<Item, Obstacle>();
  let budget = Math.max(64, movables.length * 4);
  for (let round = 0; round < 4 && budget > 0; round++) {
    let changed = false;
    for (let index = 0; index < obstacles.length && budget > 0; index++) {
      const obstacle = obstacles[index];
      for (const candidate of movables) {
        if (budget <= 0) break;
        if (related(candidate, obstacle.item) || !intersects(rectOf(candidate), obstacle.rect(), trigger)) continue;
        const block = blockOf(candidate, obstacle);
        const box = rectOf(block), target = obstacle.rect();
        if (related(block, obstacle.item) || !intersects(box, target, trigger)) continue;
        // Away from a pin: the smallest displacement (flow direction first on ties); chained: keep the pusher's direction.
        const dir = obstacle.dir ?? preference.reduce((best, option) => clearance(box, target, option) < clearance(box, target, best) - 0.5 ? option : best, preference[0]);
        move(block, dir, clearance(box, target, dir));
        for (let guard = 0; guard < 64; guard++) {
          const current = rectOf(block);
          const hit = obstacles.find(other => !related(block, other.item) && intersects(current, other.rect(), trigger));
          if (!hit) break;
          move(block, dir, Math.max(1, clearance(current, hit.rect(), dir)));
        }
        if (!isNode(block)) fit(block);
        for (const ancestor of ancestors(block)) fit(ancestor);
        budget--; changed = true;
        const existing = pushed.get(block);
        if (existing) existing.dir = dir;
        else { const entry: Obstacle = { rect: () => rectOf(block), item: block, dir }; pushed.set(block, entry); obstacles.push(entry); }
      }
    }
    if (!changed) break;
  }
  fitAll();
  separateLanes();
  // 3. Lane bands keep one shared extent along the flow.
  if (lanes.length) {
    const flowSize = flowAxis === 'x' ? 'width' : 'height';
    const start = Math.min(...lanes.map(lane => lane[flowAxis]));
    for (const lane of lanes) { lane[flowSize] += lane[flowAxis] - start; lane[flowAxis] = start; }
    equalizeLaneExtents(result, direction);
  }
}

/** Keep pinned collinear points as vertices so crossing bridges cannot bend away from them. */
function preserveWaypoints(path: Point[], pins: Point[]): Point[] {
  const points = simplify(path);
  if (!pins.length) return points;
  const result: Point[] = points.length ? [{ ...points[0] }] : [];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const along = pins.filter(point => {
      const distance = Math.hypot(point.x - a.x, point.y - a.y) + Math.hypot(b.x - point.x, b.y - point.y);
      return Math.abs(distance - length) < 0.001 && Math.hypot(point.x - a.x, point.y - a.y) > 0.001 && Math.hypot(point.x - b.x, point.y - b.y) > 0.001;
    }).sort((first, second) => Math.hypot(first.x - a.x, first.y - a.y) - Math.hypot(second.x - a.x, second.y - a.y));
    result.push(...along.map(point => ({ ...point })), { ...b });
  }
  return result;
}

function hasCrowdedRoutes(result: LayoutResult, elementGap: number): boolean {
  const minNodeDist = Math.min(13, Math.max(9, Math.round(elementGap * 0.24)));
  const minParallelDist = 11;
  const segments: { a: Point; b: Point; route: Route; horizontal: boolean }[] = [];
  for (const route of result.routes) {
    for (const path of route.paths) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length < 0.1) continue;
        const horizontal = Math.abs(a.y - b.y) < 0.01;
        segments.push({ a, b, route, horizontal });
        for (const box of result.nodes) {
          if (box.ref.node.id === route.ref.edge.from || box.ref.node.id === route.ref.edge.to) continue;
          if (segmentRectDistance(a, b, box) < minNodeDist) return true;
        }
        for (const container of result.containers) {
          if (horizontal) {
            const overlap = Math.min(Math.max(a.x, b.x), container.x + container.width) - Math.max(Math.min(a.x, b.x), container.x);
            if (overlap > 18 && Math.min(Math.abs(a.y - container.y), Math.abs(a.y - (container.y + container.height))) < 10) return true;
          } else {
            const overlap = Math.min(Math.max(a.y, b.y), container.y + container.height) - Math.max(Math.min(a.y, b.y), container.y);
            if (overlap > 18 && Math.min(Math.abs(a.x - container.x), Math.abs(a.x - (container.x + container.width))) < 10) return true;
          }
        }
      }
    }
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const first = segments[i], second = segments[j];
    if (first.route === second.route || first.horizontal !== second.horizontal) continue;
    if (first.horizontal) {
      const dist = Math.abs(first.a.y - second.a.y);
      if (dist <= 0.5 || dist >= minParallelDist) continue;
      const overlap = Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x))
        - Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x));
      if (overlap > 18) return true;
    } else {
      const dist = Math.abs(first.a.x - second.a.x);
      if (dist <= 0.5 || dist >= minParallelDist) continue;
      const overlap = Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y))
        - Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y));
      if (overlap > 18) return true;
    }
  }
  return false;
}

/**
 * Automatic layout of one diagram without its manual adjustments: ELK placement (after alignment),
 * the spacing settled by the crowding / label reflow passes, and the baseline routes and labels.
 * Keyed by the adjustment-free spec plus theme, so dragging only re-runs pins → avoidance → routes → labels.
 */
interface GraphBaseline {
  spacing?: { elementGap?: number; regionGap?: number };
  nodes: (Omit<NodeBox, 'ref'> & { id: string })[];
  containers: ContainerBox[];
  width: number; height: number;
  routes: { edge: number; paths: Point[][]; merged?: boolean }[];
  labels: (Omit<EdgeLabelBox, 'ref'> & { edge: number })[];
}
interface BaselineContext { key: string; entry?: GraphBaseline }
const baselineCache = new Map<string, GraphBaseline>();
const baselineCacheLimit = 16;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? 'null' : stableJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function hashText(value: string): string {
  let first = 0xdeadbeef ^ value.length, second = 0x41c6ce57 ^ value.length;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761); second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

/**
 * Theme fields read by node sizing, ELK input, routing and label placement (`measure` depends on
 * the font size only). Colours, palette, font family/weight/style, radius and line width only
 * affect painting, so switching a colour theme reuses the cached geometry.
 */
const geometryThemeFields = ['fontSize', 'nodeWidth', 'nodeHeight', 'gap'] as const;

function geometryStyle(style?: Partial<Theme>): Partial<Theme> | undefined {
  if (!style) return undefined;
  const picked = Object.fromEntries(geometryThemeFields.filter(field => style[field] !== undefined).map(field => [field, style[field]]));
  return Object.keys(picked).length ? picked : undefined;
}

function baselineKey(spec: DiagramSpec, theme: Theme): string {
  const { adjustments: _adjustments, ...layout } = spec.layout ?? {};
  // The theme name and colour-only style fields never change geometry; `style.gap` does (resolveLayout).
  const { theme: _name, style, nodes, ...rest } = spec;
  const value = stableJson({
    spec: { ...rest, layout, style: geometryStyle(style), nodes: nodes?.map(node => ({ ...node, style: geometryStyle(node.style) })) },
    theme: geometryStyle(theme),
  });
  // Large specs (embedded images) are keyed by length plus a 64-bit hash to bound cache memory.
  return value.length > 8192 ? `#${value.length}:${hashText(value)}` : value;
}

function readBaseline(key: string): GraphBaseline | undefined {
  const entry = baselineCache.get(key);
  if (entry) { baselineCache.delete(key); baselineCache.set(key, entry); }
  return entry;
}

function storeBaseline(key: string, entry: GraphBaseline): void {
  baselineCache.delete(key);
  baselineCache.set(key, entry);
  while (baselineCache.size > baselineCacheLimit) baselineCache.delete(baselineCache.keys().next().value!);
}

function clonePaths(paths: Point[][]): Point[][] {
  return paths.map(path => path.map(point => ({ ...point })));
}

function snapshotBaseline(result: LayoutResult, edges: EdgeRef[], labels: EdgeLabelBox[], spacing: GraphBaseline['spacing']): GraphBaseline {
  return {
    spacing,
    nodes: result.nodes.map(({ ref, caption, ...box }) => ({ ...box, id: ref.id, caption: caption ? { ...caption } : undefined })),
    containers: result.containers.map(box => ({ ...box, ref: { ...box.ref } })),
    width: result.width, height: result.height,
    routes: result.routes.map(route => ({ edge: edges.indexOf(route.ref), paths: clonePaths(route.paths), merged: route.merged })),
    labels: labels.map(({ ref, anchor, ...label }) => ({ ...label, anchor: { ...anchor }, edge: edges.indexOf(ref) })),
  };
}

function restoreBaseline(entry: GraphBaseline, refs: Map<string, NodeRef>): LayoutResult | undefined {
  if (entry.nodes.some(box => !refs.has(box.id))) return undefined;
  return {
    nodes: entry.nodes.map(({ id, caption, ...box }) => ({ ...box, ref: refs.get(id)!, caption: caption ? { ...caption } : undefined })),
    containers: entry.containers.map(box => ({ ...box, ref: { ...box.ref } })),
    routes: [], width: entry.width, height: entry.height,
  };
}

/** Layout every graph family with bundled ELK; sequence and fishbone have dedicated renderers. */
export async function renderGraph(spec: DiagramSpec, suppliedTheme: Theme): Promise<RenderedDiagram> {
  const key = baselineKey(spec, suppliedTheme);
  return renderGraphWithSpacing(spec, suppliedTheme, 0, 0, { key, entry: readBaseline(key) });
}

async function renderGraphWithSpacing(spec: DiagramSpec, suppliedTheme: Theme, labelPass: number, crowdingPass = 0, baseline?: BaselineContext): Promise<RenderedDiagram> {
  // A cached baseline already settled the reflow spacing; start from that final spacing directly.
  const cachedSpacing = baseline?.entry?.spacing;
  if (cachedSpacing) spec = { ...spec, layout: { ...spec.layout, ...cachedSpacing } };
  const requestedSpec = spec;
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
  const restored = baseline?.entry ? restoreBaseline(baseline.entry, refs) : undefined;
  const cached = restored ? baseline!.entry : undefined;
  if (restored) {
    result = restored;
  } else if (spec.type === 'usecase' && !spec.lanes?.length) {
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
  if (!cached) {
    if (spec.type !== 'usecase' && !alignLaneFlow(result, edges, spec, theme)) alignConnectedNodes(result, edges, columns, spec);
    if (spec.lanes?.length) equalizeLaneExtents(result, direction);
    placeFlowTerminals(result, edges, direction, spec.layout?.elementGap ?? 24);
  }
  const routeResult = (adjustments?: DiagramAdjustments): void => {
    result.routes = [];
    routeEdges(edges, result, direction, { ...theme, gap: spec.layout?.elementGap ?? 24 }, spec.type, adjustments);
    const nodeById = new Map(result.nodes.map(box => [box.ref.node.id, box]));
    for (const route of result.routes) {
      const first = route.paths[0], last = route.paths[route.paths.length - 1];
      const source = nodeById.get(route.ref.edge.from), target = nodeById.get(route.ref.edge.to);
      const direct = spec.type === 'usecase' && route.ref.edge.from !== route.ref.edge.to && !(adjustments?.edges?.[route.ref.key]?.waypoints?.length);
      if (!direct) {
        if (source && first.length > 1) clipEndpoint(first[0], first[1], source);
        if (target && last.length > 1 && !route.merged) clipEndpoint(last[last.length - 1], last[last.length - 2], target);
      }
    }
  };
  const manual = spec.layout?.adjustments;
  const hasManualPositions = !!(Object.keys(manual?.elements ?? {}).length || Object.keys(manual?.edges ?? {}).length);
  let labels: EdgeLabelBox[] = [];
  if (cached) {
    // The baseline routes/labels are only displayed when nothing is adjusted.
    if (!hasManualPositions) {
      result.routes = cached.routes.map(route => ({ ref: edges[route.edge], paths: clonePaths(route.paths), merged: route.merged }));
      labels = cached.labels.map(({ edge, anchor, ...label }) => ({ ...label, anchor: { ...anchor }, ref: edges[edge] }));
    }
  } else {
    const retry = baseline && { key: baseline.key };
    // First resolve exactly the spacing the unadjusted diagram uses. Otherwise adding its
    // first offset could skip a label-driven reflow and unexpectedly move every other node.
    routeResult();
    const currentGap = spec.layout?.elementGap ?? 56;
    if (spec.type !== 'usecase' && crowdingPass < 2 && currentGap < 110 && hasCrowdedRoutes(result, currentGap)) {
      return renderGraphWithSpacing({ ...requestedSpec, layout: { ...requestedSpec.layout,
        elementGap: Math.ceil(currentGap * 1.35),
        regionGap: Math.ceil((spec.layout?.regionGap ?? 84) * 1.3),
      } }, suppliedTheme, labelPass, crowdingPass + 1, retry);
    }
    const baselineLabels = placeLabels(result.routes, result.nodes, result.containers, direction, labelPass >= 4);
    if (!baselineLabels) {
      return renderGraphWithSpacing({ ...requestedSpec, layout: { ...requestedSpec.layout,
        elementGap: Math.ceil((spec.layout?.elementGap ?? 56) * 1.45),
        regionGap: Math.ceil((spec.layout?.regionGap ?? 84) * 1.45),
      } }, suppliedTheme, labelPass + 1, crowdingPass, retry);
    }
    if (baseline) storeBaseline(baseline.key, snapshotBaseline(result, edges, baselineLabels, labelPass || crowdingPass
      ? { elementGap: requestedSpec.layout?.elementGap, regionGap: requestedSpec.layout?.regionGap } : undefined));
    labels = baselineLabels;
  }
  if (hasManualPositions) {
    applyManualElements(result, spec, direction, edges, theme.fontSize);
    routeResult(manual);
    // Manual positions are applied on that stable baseline. Route/label changes may
    // move annotations, but cannot trigger another automatic spacing change.
    labels = placeLabels(result.routes, result.nodes, result.containers, direction, true)!;
  }
  result.width = Math.max(0, ...result.nodes.map(box => { const occupied = occupiedNode(box); return occupied.x + occupied.width; }), ...result.containers.map(box => box.x + box.width));
  result.height = Math.max(0, ...result.nodes.map(box => { const occupied = occupiedNode(box); return occupied.y + occupied.height; }), ...result.containers.map(box => box.y + box.height));
  for (const label of labels) {
    const adjustment = manual?.elements?.[`edge-labels/${label.ref.key}/${label.role}`];
    const delta = adjustmentDelta(label, adjustment);
    label.x += delta.x; label.y += delta.y;
    if (adjustment) label.leader = true;
  }
  const prefix = `uml-graph-${++graphNumber}`;
  const displayed = result.routes.flatMap((route, owner) => route.paths.map(points => ({ points: preserveWaypoints(points, manual?.edges?.[route.ref.key]?.waypoints ?? []), owner })));
  const crossings = crossingPaths(displayed, spec.layout?.edgeCrossing ?? 'bridge', theme.lineWidth,
    [...result.nodes.map(occupiedNode), ...labels]);
  const maskDefinitions = crossings.masks.map((arcs, index) => {
    if (!arcs.length) return '';
    const points = displayed[index].points;
    const x = Math.min(...points.map(p => p.x)) - 24, y = Math.min(...points.map(p => p.y)) - 24;
    const width = Math.max(...points.map(p => p.x)) - x + 24, height = Math.max(...points.map(p => p.y)) - y + 24;
    return `<mask id="${prefix}-crossing-${index}" maskUnits="userSpaceOnUse" x="${numeric(x)}" y="${numeric(y)}" width="${numeric(width)}" height="${numeric(height)}"><rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(width)}" height="${numeric(height)}" fill="white"/>${arcs.map(d => `<path d="${d}" fill="none" stroke="black" stroke-width="${numeric(theme.lineWidth + 3)}"/>`).join('')}</mask>`;
  }).join('');
  const palette = paletteOf(theme);
  const darkBackground = luminance(theme.background === 'transparent' ? theme.surface : theme.background) < 0.2;
  const secondaryEdgeColor = theme.secondary !== theme.primary;
  let displayIndex = 0;
  let paths = '';
  for (const route of result.routes) {
    const kind = edgeKind(route.ref.edge, spec.type);
    const dashed = route.ref.edge.dashed || ['dependency', 'include', 'extend', 'realization'].includes(kind);
    const useSecondary = Boolean(dashed && palette && secondaryEdgeColor);
    const edgeStroke = useSecondary ? theme.secondary : theme.primary;
    const markerSuffix = useSecondary ? '-sec' : '';
    const edge = route.ref.edge;
    const end = route.merged ? '' : edgeEndMarker(edge, spec.type);
    const start = edge.startArrow ? (edge.startArrow === 'none' ? '' : `${edge.startArrow}-start`) : kind === 'aggregation' || kind === 'composition' ? kind : '';
    const strokeWidth = theme.lineWidth * (edge.thick ? 2 : 1);
    paths += `<g class="uml-edge uml-edge-${kind}" data-waypoint-key="${esc(route.ref.key)}" data-waypoints="${esc(JSON.stringify(manual?.edges?.[route.ref.key]?.waypoints ?? []))}" data-editor-key="edges/${spec.edges!.indexOf(route.ref.edge)}" data-edge-id="${esc(route.ref.edge.id ?? route.ref.id)}" data-from="${esc(route.ref.edge.from)}" data-to="${esc(route.ref.edge.to)}"${route.merged ? ' data-merged="true"' : ''}><title>${esc([route.ref.edge.from, route.ref.edge.label, route.ref.edge.to].filter(Boolean).join(' → '))}</title>`;
    for (let index = 0; index < route.paths.length; index++) {
      const current = displayIndex++, data = crossings.data[current];
      const mask = crossings.masks[current].length ? ` mask="url(#${prefix}-crossing-${current})"` : '';
      paths += `<path d="${data}"${mask} fill="none" stroke="${esc(edgeStroke)}" stroke-width="${numeric(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="7 5"' : ''}${start && index === 0 ? ` marker-start="url(#${prefix}-${start}${markerSuffix})"` : ''}${end && index === route.paths.length - 1 ? ` marker-end="url(#${prefix}-${end}${markerSuffix})"` : ''}/>`;
    }
    paths += '</g>';
  }
  const regionIds = [...(spec.groups ?? []).map(group => group.id), ...(spec.lanes ?? []).map(lane => lane.id)];
  const groupShapes = result.containers.sort((a, b) => a.depth - b.depth).map(box => renderContainer(box, theme, direction, spec,
    palette && regionIds.includes(box.ref.originalId) ? regionPaint(theme, palette, regionIds.indexOf(box.ref.originalId)) : undefined)).join('');
  const paletteDefs = gradientDefs(nodes.flatMap(node => node.paint ? [node.paint] : []));
  const nodeShapes = result.nodes.map(box => renderNode(box, spec)).join('');
  const labelShapes = labels.map(label => {
    const kind = edgeKind(label.ref.edge, spec.type);
    const dashed = label.ref.edge.dashed || ['dependency', 'include', 'extend', 'realization'].includes(kind);
    const labelColor = dashed && palette && secondaryEdgeColor
      ? (darkBackground ? mix(theme.secondary, '#ffffff', 0.35) : mix(theme.secondary, '#0f172a', 0.24))
      : theme.text;
    const leader = label.leader ? `<path class="uml-label-leader" d="M${numeric(label.anchor.x)} ${numeric(label.anchor.y)} L${numeric(Math.max(label.x, Math.min(label.x + label.width, label.anchor.x)))} ${numeric(Math.max(label.y, Math.min(label.y + label.height, label.anchor.y)))}" fill="none" stroke="${esc(theme.muted)}" stroke-width="1" stroke-dasharray="3 3"/>` : '';
    return `<g class="uml-edge-label" data-adjustment-key="edge-labels/${esc(label.ref.key)}/${label.role}" data-layout-x="${numeric(label.x)}" data-layout-y="${numeric(label.y)}"${layoutCenterMetadata(spec, `edge-labels/${label.ref.key}/${label.role}`, label)} data-editor-key="edges/${spec.edges!.indexOf(label.ref.edge)}" data-edge-id="${esc(label.ref.edge.id ?? label.ref.id)}" data-from="${esc(label.ref.edge.from)}" data-to="${esc(label.ref.edge.to)}" data-label-role="${label.role}">${leader}<rect x="${numeric(label.x)}" y="${numeric(label.y)}" width="${numeric(label.width)}" height="${numeric(label.height)}" rx="4" fill="${esc(theme.background === 'transparent' ? theme.surface : theme.background)}"/>${text(label.x + label.width / 2, label.y + 5 + label.size, label.value, theme, { size: label.size, fill: labelColor, weight: 550 })}</g>`;
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
  const body = `${markerDefinitions(prefix, theme)}${paletteDefs}<defs>${maskDefinitions}</defs>${heading}<g data-layout-root="" transform="translate(${numeric(32 - minX)} ${numeric(contentY - minY)})">${groupShapes}${paths}${labelShapes}${nodeShapes}</g>`;
  return frame(spec, theme, width, height, body);
}
