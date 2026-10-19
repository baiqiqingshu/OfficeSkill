export const diagramTypes = ['activity', 'sequence', 'swimlane', 'flowchart', 'usecase', 'class', 'state', 'component', 'package', 'architecture', 'module', 'deployment', 'logical', 'development', 'process', 'physical', 'scenario', 'fishbone'] as const
export type DiagramType = typeof diagramTypes[number]
export type ThemeName = 'paper' | 'ocean' | 'forest' | 'blueprint' | 'midnight' | 'lavender' | 'rose' | 'amber' | 'slate' | 'mint'
export interface Theme {
  background: string; surface: string; text: string; muted: string; primary: string; secondary: string; border: string
  fontFamily: string; fontSize: number; lineWidth: number; radius: number; nodeWidth: number; nodeHeight: number; gap: number
  fontWeight: number; fontStyle: 'normal' | 'italic'; textDecoration: 'none' | 'underline'
}
export interface DiagramNode {
  id: string; label: string
  kind?: 'action' | 'decision' | 'start' | 'end' | 'fork' | 'join' | 'actor' | 'usecase' | 'class' | 'interface' | 'component' | 'package' | 'database' | 'server' | 'queue' | 'state' | 'note'
  detail?: string; stereotype?: string; attributes?: string[]; operations?: string[]; group?: string; lane?: string; style?: Partial<Theme>
}
export interface DiagramEdge {
  id?: string; from: string; to: string; label?: string
  kind?: 'flow' | 'association' | 'dependency' | 'include' | 'extend' | 'inheritance' | 'realization' | 'aggregation' | 'composition'
  dashed?: boolean; fromLabel?: string; toLabel?: string
}
export interface DiagramGroup { id: string; label: string; parent?: string; kind?: 'boundary' | 'package' | 'node' }
export interface DiagramLane { id: string; label: string }
export interface Participant { id: string; label: string; kind?: 'actor' | 'participant' | 'database' }
export interface Message { from: string; to: string; label: string; kind?: 'sync' | 'async' | 'return' | 'create' | 'destroy'; activate?: boolean; deactivate?: boolean }
export interface Fragment { kind: 'alt' | 'opt' | 'loop' | 'par'; label: string; from: number; to: number; elseAt?: number; elseLabel?: string }
export interface FishboneCause { label: string; children?: FishboneCause[] }
export interface FishboneData { effect: string; categories: { id: string; label: string; causes: FishboneCause[] }[] }
export interface DiagramLayoutOptions {
  mode?: 'compact' | 'balanced' | 'spacious' | 'grid'
  edgeCrossing?: 'bridge' | 'plain'
  showTitle?: boolean; maxWidth?: number; maxHeight?: number
  regionGap?: number; elementGap?: number; maxPerColumn?: number
  nodeMaxWidth?: number; nodeMaxHeight?: number
}
export interface DiagramSpec {
  version: 1; id?: string; type: DiagramType; title: string; description?: string; theme?: ThemeName; style?: Partial<Theme>; direction?: 'TB' | 'LR'; layout?: DiagramLayoutOptions
  nodes?: DiagramNode[]; edges?: DiagramEdge[]; groups?: DiagramGroup[]; lanes?: DiagramLane[]
  participants?: Participant[]; messages?: Message[]; fragments?: Fragment[]; fishbone?: FishboneData
}
export interface DiagramDocument { version: 1; title: string; diagrams: DiagramSpec[] }
export type DiagramInput = DiagramSpec | DiagramDocument
export interface RenderedDiagram { svg: string; width: number; height: number }
export interface ExportOptions { format?: 'svg' | 'png' | 'jpeg' | 'webp'; scale?: number; quality?: number; background?: string }
