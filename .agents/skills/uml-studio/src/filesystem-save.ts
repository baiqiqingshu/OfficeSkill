/** File handles stay in this page session; documents never contain permissions or paths. */
export interface LocalHtmlTarget {
  name: string;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<string>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<string>;
}
interface LocalPickers {
  showSaveFilePicker?(options: unknown): Promise<LocalHtmlTarget>;
  showDirectoryPicker?(options: unknown): Promise<{ name: string; getFileHandle(name: string, options: { create: boolean }): Promise<LocalHtmlTarget> }>;
}
const pickers = () => window as unknown as LocalPickers;
export function canSaveLocalHtml(): boolean {
  return !!(pickers().showSaveFilePicker || pickers().showDirectoryPicker);
}

/** Call directly from the click handler, before rendering or awaiting other work. */
export async function chooseLocalHtmlTarget(filename: string, current?: LocalHtmlTarget): Promise<LocalHtmlTarget> {
  if (current) {
    const permission = await current.queryPermission?.({ mode: 'readwrite' });
    if (permission === 'granted' || !current.queryPermission) return current;
    if (await current.requestPermission?.({ mode: 'readwrite' }) === 'granted') return current;
    throw new Error('未获得写入权限；请重新选择本地 HTML 文件，或下载 HTML。');
  }
  const browser = pickers();
  if (browser.showSaveFilePicker) return browser.showSaveFilePicker({
    suggestedName: filename,
    types: [{ description: '可编辑 HTML 图表', accept: { 'text/html': ['.html'] } }],
    excludeAcceptAllOption: true,
  });
  if (browser.showDirectoryPicker) {
    const directory = await browser.showDirectoryPicker({ mode: 'readwrite' });
    return directory.getFileHandle(filename, { create: true });
  }
  throw new Error('当前浏览器不支持授权写入本地文件，请使用“保存 HTML”下载。');
}
export async function writeLocalHtml(target: LocalHtmlTarget, html: string): Promise<void> {
  const stream = await target.createWritable();
  try {
    await stream.write(html);
    await stream.close();
  } catch (reason) {
    try { await stream.abort?.(); } catch { /* Preserve the original write error. */ }
    throw reason;
  }
}
