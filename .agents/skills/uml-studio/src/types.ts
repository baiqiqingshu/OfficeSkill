export const diagramTypes = ['activity', 'sequence', 'swimlane', 'flowchart', 'usecase', 'class', 'state', 'component', 'package', 'architecture', 'module', 'deployment', 'logical', 'development', 'process', 'physical', 'scenario', 'fishbone'] as const
export type DiagramType = typeof diagramTypes[number]
export type ThemeName = 'modern' | 'paper' | 'ocean' | 'white' | 'industrial' | 'forest' | 'blueprint' | 'midnight' | 'lavender' | 'rose' | 'amber' | 'slate' | 'mint' | 'vivid' | 'pastel' | 'business' | 'steel' | 'aurora' | 'neon'
export type PaletteMode = 'mono' | 'tint' | 'solid' | 'gradient'
export type PaletteBy = 'auto' | 'group' | 'kind' | 'node'
export interface Theme {
  background: string; surface: string; text: string; muted: string; primary: string; secondary: string; border: string
  fontFamily: string; fontSize: number; lineWidth: number; radius: number; nodeWidth: number; nodeHeight: number; gap: number
  fontWeight: number; fontStyle: 'normal' | 'italic'; textDecoration: 'none' | 'underline'
  /** Multi-colour rendering: element colours cycle through the palette. */
  palette?: string[]; paletteMode?: PaletteMode; paletteBy?: PaletteBy
}
export interface DiagramNode {
  id: string; label: string
  kind?: 'action' | 'decision' | 'start' | 'end' | 'fork' | 'join' | 'actor' | 'usecase' | 'class' | 'interface' | 'component' | 'package' | 'database' | 'server' | 'queue' | 'state' | 'note' | 'image'
    | 'terminal' | 'subroutine' | 'io' | 'hexagon' | 'circle' | 'trapezoid'
  /** kind 'image'：data:image/ URL；width/height 为期望显示尺寸（缺省 240×160）。 */
  src?: string; width?: number; height?: number
  detail?: string; stereotype?: string; attributes?: string[]; operations?: string[]; group?: string; lane?: string; style?: Partial<Theme>
}
export interface DiagramEdge {
  id?: string; from: string; to: string; label?: string
  kind?: 'flow' | 'association' | 'dependency' | 'include' | 'extend' | 'inheritance' | 'realization' | 'aggregation' | 'composition'
  dashed?: boolean; fromLabel?: string; toLabel?: string
  arrow?: EdgeArrow; startArrow?: EdgeArrow; thick?: boolean
}
export type EdgeArrow = 'none' | 'arrow' | 'open' | 'triangle' | 'circle' | 'cross'
export interface DiagramGroup { id: string; label: string; parent?: string; kind?: 'boundary' | 'package' | 'node' }
export interface DiagramLane { id: string; label: string }
export interface Participant { id: string; label: string; kind?: 'actor' | 'participant' | 'database' | 'boundary' | 'control' | 'entity' | 'collections' | 'queue' }
export interface ParticipantBox { label: string; participants: string[]; color?: string }
/** `note` and `divider` occupy a timeline row (and a message index) but are not numbered messages. */
export interface Message {
  from: string; to: string; label: string; kind?: 'sync' | 'async' | 'return' | 'create' | 'destroy' | 'note' | 'divider'
  activate?: boolean; deactivate?: boolean
  arrow?: 'filled' | 'open' | 'none' | 'cross'; dashed?: boolean; bidirectional?: boolean
  position?: 'left' | 'right' | 'over'
}
export interface Fragment { kind: 'alt' | 'opt' | 'loop' | 'par' | 'critical' | 'break' | 'rect'; label: string; from: number; to: number; elseAt?: number; elseLabel?: string; elses?: { at: number; label?: string }[]; color?: string }
export interface FishboneCause { label: string; children?: FishboneCause[] }
export const fishboneHeadStyles = ['classic', 'fish', 'slim', 'shark', 'roundfish', 'carp', 'sunfish', 'triangle', 'rounded', 'label'] as const
export type FishboneHeadStyle = typeof fishboneHeadStyles[number]
export interface FishboneData { effect: string; headStyle?: FishboneHeadStyle; categories: { id: string; label: string; causes: FishboneCause[] }[] }
export interface DiagramPoint { x: number; y: number }
/**
 * Logical layout coordinates (the `[data-layout-root]` space).
 * `{cx, cy}` pins the element's visual centre (recommended); legacy `{dx, dy}` offsets follow
 * the automatic layout and legacy `{x, y}` pins the top-left corner (renderer anchor).
 */
export interface ElementCenter { cx: number; cy: number }
export type ElementAdjustment = ElementCenter | { dx: number; dy: number } | DiagramPoint
export interface EdgeAdjustment { waypoints: DiagramPoint[] }
export interface DiagramAdjustments {
  elements?: Record<string, ElementAdjustment>
  edges?: Record<string, EdgeAdjustment>
}
export interface DiagramLayoutOptions {
  mode?: 'compact' | 'balanced' | 'spacious' | 'grid'
  edgeCrossing?: 'bridge' | 'plain'
  horizontalStagger?: boolean
  adjustments?: DiagramAdjustments
  showTitle?: boolean; maxWidth?: number; maxHeight?: number
  regionGap?: number; elementGap?: number; maxPerColumn?: number
  nodeMaxWidth?: number; nodeMaxHeight?: number
  /** Sequence message numbering; defaults to true. */
  autonumber?: boolean
}
export interface DiagramSpec {
  version: 1; id?: string; type: DiagramType; title: string; description?: string; theme?: ThemeName; style?: Partial<Theme>; direction?: 'TB' | 'LR'; layout?: DiagramLayoutOptions
  nodes?: DiagramNode[]; edges?: DiagramEdge[]; groups?: DiagramGroup[]; lanes?: DiagramLane[]
  participants?: Participant[]; messages?: Message[]; fragments?: Fragment[]; boxes?: ParticipantBox[]; fishbone?: FishboneData
}
export interface DiagramDocument { version: 1; title: string; diagrams: DiagramSpec[] }
export type DiagramInput = DiagramSpec | DiagramDocument
export interface RenderedDiagram { svg: string; width: number; height: number }
export interface ExportOptions { format?: 'svg' | 'png' | 'jpeg' | 'webp'; scale?: number; quality?: number; background?: string }
