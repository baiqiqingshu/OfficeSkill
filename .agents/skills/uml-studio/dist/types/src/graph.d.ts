import type { DiagramSpec, RenderedDiagram, Theme } from './types';
/** Layout every graph family with bundled ELK; sequence and fishbone have dedicated renderers. */
export declare function renderGraph(spec: DiagramSpec, suppliedTheme: Theme): Promise<RenderedDiagram>;
