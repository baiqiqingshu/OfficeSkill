import type { DiagramSpec, ExportOptions } from './types';

export interface StudioRuntime { js: string; css: string }
const MAX_PIXELS = 40_000_000;
const MAX_DIMENSION = 32_767;
const MIME = { svg: 'image/svg+xml', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;

function serialize(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function readStudioRuntime(): StudioRuntime | undefined {
  if (typeof document === 'undefined') return undefined;
  const element = document.getElementById('studio-runtime');
  if (!element?.textContent) return undefined;
  const value: unknown = JSON.parse(element.textContent);
  if (!value || typeof value !== 'object' || !('js' in value) || !('css' in value) || typeof value.js !== 'string' || !value.js.trim() || typeof value.css !== 'string') {
    throw new Error('内嵌工作台运行时无效，请重新生成 HTML。');
  }
  return { js: value.js, css: value.css };
}

/** A self-contained, editable document. Runtime is bundled locally, never loaded from a CDN. */
export function createHtml(spec: DiagramSpec, runtime?: StudioRuntime): string {
  const bundled = runtime ?? readStudioRuntime();
  if (!bundled || typeof bundled.js !== 'string' || !bundled.js.trim() || typeof bundled.css !== 'string') {
    throw new Error('尚未加载独立 HTML 运行时，请先构建本地 viewer.js 与 viewer.css。');
  }
  const title = String(spec.title || 'UML Studio').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title} · UML Studio</title>
<style>${bundled.css.replace(/<\/style/gi, '<\\/style')}</style>
</head>
<body>
<div id="app"></div>
<script id="diagram-data" type="application/json">${serialize(spec)}</script>
<script id="studio-runtime" type="application/json">${serialize(bundled)}</script>
<script type="module">${bundled.js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    // Keep the URL alive until the browser has accepted the download navigation.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function svgDocument(svg: string): { root: SVGSVGElement; width: number; height: number } {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = parsed.documentElement;
  if (parsed.querySelector('parsererror') || root.localName !== 'svg') throw new Error('SVG 内容无效，无法导出。');
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const dimension = (name: string, fallback?: number) => {
    const raw = root.getAttribute(name);
    if (raw && /^\d+(?:\.\d+)?(?:px)?$/.test(raw.trim())) return Number.parseFloat(raw);
    return fallback;
  };
  const width = dimension('width', viewBox?.[2]);
  const height = dimension('height', viewBox?.[3]);
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('SVG 必须包含有效的宽度、高度或 viewBox。');
  }
  if (!root.hasAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!root.hasAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  return { root: root as unknown as SVGSVGElement, width, height };
}

async function verifyRaster(blob: Blob, mime: string): Promise<void> {
  if (blob.type.toLowerCase() !== mime) throw new Error(`浏览器不支持 ${mime.split('/')[1].toUpperCase()} 编码；未用其他格式冒充。请改选 PNG 或 SVG。`);
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const valid = mime === MIME.png
    ? bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
    : mime === MIME.jpeg
      ? bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!valid) throw new Error('浏览器返回的图片文件签名与所选格式不一致，已停止下载。');
}

export async function exportSvgImage(svg: string, options: ExportOptions = {}): Promise<Blob> {
  const format = options.format ?? 'svg';
  if (!Object.hasOwn(MIME, format)) throw new Error('不支持的图片格式。');
  const scale = options.scale ?? (format === 'svg' ? 1 : 2);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('导出倍率必须为大于 0 的有限数字。');
  const quality = options.quality ?? 0.94;
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) throw new Error('图片质量必须介于 0 和 1 之间。');
  // SVG export is also usable from Node, where no DOM or canvas exists.
  if (format === 'svg' && scale === 1) return new Blob([svg], { type: MIME.svg });
  const { root, width, height } = svgDocument(svg);
  const targetWidth = Math.ceil(width * scale);
  const targetHeight = Math.ceil(height * scale);
  if (!Number.isSafeInteger(targetWidth) || !Number.isSafeInteger(targetHeight) || targetWidth < 1 || targetHeight < 1) throw new Error('导出尺寸超出有效范围。');
  root.setAttribute('width', String(targetWidth));
  root.setAttribute('height', String(targetHeight));
  if (format === 'svg') return new Blob([new XMLSerializer().serializeToString(root)], { type: MIME.svg });
  if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION || targetWidth * targetHeight > MAX_PIXELS) {
    throw new Error(`导出尺寸 ${targetWidth} × ${targetHeight} 超过限制（单边 ${MAX_DIMENSION.toLocaleString()} px / 总计 4,000 万像素），请降低倍率。`);
  }
  if (document.fonts?.ready) await document.fonts.ready;
  const source = new Blob([new XMLSerializer().serializeToString(root)], { type: MIME.svg });
  const url = URL.createObjectURL(source);
  const canvas = document.createElement('canvas');
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG 图片加载失败，请检查图表内容。'));
      image.src = url;
    });
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法创建 Canvas 画布。');
    if (options.background || format === 'jpeg') {
      const background = options.background ?? '#ffffff';
      if (!CSS.supports('color', background)) throw new Error('导出背景必须为有效颜色。');
      context.fillStyle = background;
      context.fillRect(0, 0, targetWidth, targetHeight);
    }
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const mime = MIME[format];
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('图片编码失败，可能已超出浏览器内存限制。')), mime, quality);
    });
    await verifyRaster(blob, mime);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}
