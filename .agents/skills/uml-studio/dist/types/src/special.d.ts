import type { DiagramSpec, Theme, RenderedDiagram } from "./types";
/** Time-ordered UML interactions, including lifetime and nested activation semantics. */
export declare function renderSequence(spec: DiagramSpec, theme: Theme): RenderedDiagram;
/** Original anatomy and tree layout; no FishboneStudio source is copied. */
export declare function renderFishbone(spec: DiagramSpec, theme: Theme): RenderedDiagram;
