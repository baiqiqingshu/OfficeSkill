import type { DiagramDocument, DiagramInput, DiagramSpec, ExportOptions } from './types';
import './studio.css';
export interface UmlStudioHandle {
    ready: Promise<void>;
    getSpec(): DiagramSpec;
    setSpec(spec: DiagramSpec): Promise<void>;
    getDocument(): DiagramDocument;
    setDocument(input: DiagramInput): Promise<void>;
    selectDiagram(indexOrId: number | string): Promise<void>;
    getSvg(): string;
    exportImage(options?: ExportOptions): Promise<Blob>;
    saveHtml(): string;
}
declare global {
    interface Window {
        UmlStudio: UmlStudioHandle;
    }
}
