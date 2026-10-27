import { createApp } from 'vue';
import Studio from './Studio.vue';
import gallery from '../examples/documents/gallery.json';
import { readStudioRuntime } from './export';
import type { StudioRuntime } from './export';
import type { DiagramDocument, DiagramInput, DiagramSpec, ExportOptions } from './types';

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
  interface Window { UmlStudio: UmlStudioHandle }
}

const files = import.meta.glob<DiagramSpec>('../examples/*.json', { eager: true, import: 'default' });
const examples: Record<string, DiagramSpec> = {};
for (const [path, example] of Object.entries(files)) {
  const name = path.split('/').pop()?.replace(/\.json$/, '');
  if (name) examples[name] = example;
}
let initialSpec: unknown = gallery;
let startupError = '';
const data = document.getElementById('diagram-data');
if (data?.textContent?.trim()) {
  try { initialSpec = JSON.parse(data.textContent); }
  catch (reason) { startupError = `内嵌 JSON 读取失败：${reason instanceof Error ? reason.message : String(reason)}`; }
}

async function loadRuntime(): Promise<StudioRuntime | undefined> {
  const embedded = readStudioRuntime();
  if (embedded) return embedded;
  const responses = await Promise.all([
    fetch('/assets/viewer.js', { cache: 'no-cache' }),
    fetch('/assets/viewer.css', { cache: 'no-cache' }),
  ]);
  if (responses.some(response => !response.ok)) throw new Error('未找到本地独立 HTML 运行时，请先运行 npm run build。');
  const [js, css] = await Promise.all(responses.map(response => response.text()));
  if (!js?.trim() || /^\s*(?:<!doctype html|<html[\s>])/i.test(js) || css === undefined || /^\s*(?:<!doctype html|<html[\s>])/i.test(css)) {
    throw new Error('独立 HTML 运行时资源无效，请先运行 npm run build。');
  }
  const runtime = { js, css };
  const element = document.createElement('script');
  element.id = 'studio-runtime';
  element.type = 'application/json';
  element.textContent = JSON.stringify(runtime);
  document.body.append(element);
  return runtime;
}
const runtimeReady = loadRuntime();
// The workbench attaches the real error handler after mount.
void runtimeReady.catch(() => {});
const app = createApp(Studio, { initialSpec, examples, runtimeReady, startupError });
const instance = app.mount('#app') as unknown as UmlStudioHandle;
window.UmlStudio = {
  ready: instance.ready,
  getSpec: () => instance.getSpec(),
  setSpec: spec => instance.setSpec(spec),
  getDocument: () => instance.getDocument(),
  setDocument: input => instance.setDocument(input),
  selectDiagram: indexOrId => instance.selectDiagram(indexOrId),
  getSvg: () => instance.getSvg(),
  exportImage: options => instance.exportImage(options),
  saveHtml: () => instance.saveHtml(),
};
