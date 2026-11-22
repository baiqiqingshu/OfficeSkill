/** File handles are remembered in this browser's IndexedDB; documents never contain permissions or paths. */
export interface LocalHtmlTarget {
  name: string;
  kind?: 'file';
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<string>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<string>;
}
export interface LocalDirectory {
  name: string;
  kind?: 'directory';
  getFileHandle(name: string, options: { create: boolean }): Promise<LocalHtmlTarget>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<string>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<string>;
}
interface LocalPickers {
  showSaveFilePicker?(options: unknown): Promise<LocalHtmlTarget>;
  showDirectoryPicker?(options: unknown): Promise<LocalDirectory>;
}
const pickers = () => window as unknown as LocalPickers;
const pickerId = 'uml-studio-html';
export function canSaveLocalHtml(): boolean {
  return !!(pickers().showSaveFilePicker || pickers().showDirectoryPicker);
}
export function canChooseDirectory(): boolean {
  return !!pickers().showDirectoryPicker;
}

/** File name of the current page when it was opened from disk (file://…/name.html). */
export function pageFileName(): string | undefined {
  if (typeof location === 'undefined' || location.protocol !== 'file:') return;
  const name = decodeURIComponent(location.pathname.split('/').pop() ?? '');
  return /\.html?$/i.test(name) ? name : undefined;
}
/** Readable local directory of the current page, used as a hint in the save dialog. */
export function pageDirectory(): string | undefined {
  if (typeof location === 'undefined' || location.protocol !== 'file:') return;
  const path = decodeURIComponent(location.pathname).replace(/\/[^/]*$/, '');
  return /^\/[A-Za-z]:/.test(path) ? path.slice(1).replace(/\//g, '\\') : path || '/';
}
export const pageHandleKey = () => `page:${typeof location === 'undefined' ? '' : location.href.split('#')[0]}`;

const database = 'uml-studio', store = 'handles';
function openStore(): Promise<IDBDatabase | undefined> {
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(database, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}
export async function loadHandle<T>(key: string): Promise<T | undefined> {
  const db = await openStore();
  if (!db) return;
  return new Promise(resolve => {
    try {
      const request = db.transaction(store).objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}
export async function storeHandle(key: string, handle: unknown): Promise<void> {
  const db = await openStore();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const transaction = db.transaction(store, 'readwrite');
      if (handle === undefined) transaction.objectStore(store).delete(key);
      else transaction.objectStore(store).put(handle, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch { resolve(); }
  });
}

/** Call directly from the click handler, before rendering or awaiting other work. */
export async function chooseLocalHtmlTarget(filename: string, current?: LocalHtmlTarget, startIn?: LocalHtmlTarget | LocalDirectory): Promise<LocalHtmlTarget> {
  if (current) {
    const permission = await current.queryPermission?.({ mode: 'readwrite' });
    if (permission === 'granted' || !current.queryPermission) return current;
    if (await current.requestPermission?.({ mode: 'readwrite' }) === 'granted') return current;
    throw new Error('未获得写入权限；请重新选择本地 HTML 文件，或下载 HTML。');
  }
  const browser = pickers();
  if (browser.showSaveFilePicker) return browser.showSaveFilePicker({
    id: pickerId,
    suggestedName: filename,
    ...(startIn ? { startIn } : {}),
    types: [{ description: '可编辑 HTML 图表', accept: { 'text/html': ['.html'] } }],
    excludeAcceptAllOption: true,
  });
  if (browser.showDirectoryPicker) {
    const directory = await browser.showDirectoryPicker({ id: pickerId, mode: 'readwrite', ...(startIn ? { startIn } : {}) });
    return directory.getFileHandle(filename, { create: true });
  }
  throw new Error('当前浏览器不支持授权写入本地文件，请使用“保存 HTML”下载。');
}
export async function chooseDefaultDirectory(startIn?: LocalHtmlTarget | LocalDirectory): Promise<LocalDirectory> {
  const browser = pickers();
  if (!browser.showDirectoryPicker) throw new Error('当前浏览器不支持选择目录。');
  return browser.showDirectoryPicker({ id: pickerId, mode: 'readwrite', ...(startIn ? { startIn } : {}) });
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
