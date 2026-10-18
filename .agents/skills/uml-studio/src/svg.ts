import type { DiagramSpec, RenderedDiagram, Theme } from './types';

let figureNumber = 0;

/** Escape text and attribute values, including characters forbidden by XML 1.0. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function number(value: number): string {
  return String(Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000);
}

function paint(value: string, fallback: string): string {
  return /^(?:#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)|[a-z]+)$/i.test(value.trim())
    ? value.trim()
    : fallback;
}

/** y is the first baseline; explicit newlines advance by 1.4 times the font size. */
export function text(
  x: number,
  y: number,
  label: string,
  theme: Theme,
  options: { size?: number; fill?: string; anchor?: string; weight?: number } = {},
): string {
  const size = options.size ?? theme.fontSize;
  const anchor = options.anchor === 'start' || options.anchor === 'end' ? options.anchor : 'middle';
  const fill = paint(options.fill ?? theme.text, '#202830');
  const lines = label.replace(/\r\n?/g, '\n').split('\n');
  const weight = Math.max(100, Math.min(900, (options.weight ?? 400) + (theme.fontWeight - 400)));
  const spans = lines.map((line, index) => `<tspan x="${number(x)}" dy="${index ? number(size * 1.4) : '0'}">${esc(line)}</tspan>`).join('');
  return `<text x="${number(x)}" y="${number(y)}" fill="${esc(fill)}" font-family="${esc(theme.fontFamily)}" font-size="${number(size)}" font-weight="${number(weight)}" font-style="${theme.fontStyle === 'italic' ? 'italic' : 'normal'}" text-decoration="${theme.textDecoration === 'underline' ? 'underline' : 'none'}" text-anchor="${anchor}" xml:space="preserve">${spans}</text>`;
}

/** Wrap already-positioned SVG primitives; the body is not translated. */
export function frame(spec: DiagramSpec, theme: Theme, width: number, height: number, body: string): RenderedDiagram {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const scale = Math.min(1, spec.layout?.maxWidth ? spec.layout.maxWidth / w : 1, spec.layout?.maxHeight ? spec.layout.maxHeight / h : 1);
  const physicalWidth = w * scale, physicalHeight = h * scale;
  const prefix = `uml-figure-${++figureNumber}`;
  const summary = spec.type === 'sequence'
    ? `${spec.title}，包含 ${(spec.participants ?? []).length} 位参与者、${(spec.messages ?? []).length} 条消息的时序图。`
    : spec.type === 'fishbone'
      ? `${spec.title}，以“${spec.fishbone?.effect ?? spec.title}”为结果，包含 ${(spec.fishbone?.categories ?? []).length} 个原因类别的鱼骨图。`
      : `${spec.title}，包含 ${(spec.nodes ?? []).length} 个节点、${(spec.edges ?? []).length} 条关系的 ${spec.type} 图。`;
  const description = spec.description || summary;
  const ids = new Map<string, string>();
  for (const element of body.matchAll(/<[^>]*>/g)) {
    for (const attribute of element[0].matchAll(/\sid=(["'])([^"']+)\1/g)) ids.set(attribute[2], `${prefix}-body-${attribute[2]}`);
  }
  // Operate on element tags only: text such as “url(#example)” must stay literal.
  const isolatedBody = body.replace(/<[^>]*>/g, element => element
    .replace(/(\s)id=(["'])([^"']+)\2/g, (_match: string, space: string, quote: string, id: string) => `${space}id=${quote}${ids.get(id)}${quote}`)
    .replace(/(\s(?:fill|stroke|marker-start|marker-mid|marker-end|filter|clip-path|mask|style)=)(["'])([\s\S]*?)\2/g, (_match: string, attribute: string, quote: string, value: string) => {
      const references = value.replace(/url\(\s*(?:(["'])#([^"']+)\1|#([^\s)]+))\s*\)/g, (_url: string, _innerQuote: string, quotedId: string, bareId: string) => {
        const id = quotedId ?? bareId;
        return `url(#${ids.get(id) ?? `${prefix}-body-${id}`})`;
      });
      return `${attribute}${quote}${references}${quote}`;
    })
    .replace(/(\s(?:xlink:)?href=)(["'])#([^"']+)\2/g, (_match: string, attribute: string, quote: string, id: string) => `${attribute}${quote}#${ids.get(id) ?? `${prefix}-body-${id}`}${quote}`)
    .replace(/(\saria-(?:labelledby|describedby)=)(["'])([^"']+)\2/g, (_match: string, attribute: string, quote: string, references: string) => `${attribute}${quote}${references.split(/\s+/).map(id => ids.get(id) ?? `${prefix}-body-${id}`).join(' ')}${quote}`));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${physicalWidth}" height="${physicalHeight}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc"><title id="${prefix}-title">${esc(spec.title)}</title><desc id="${prefix}-desc">${esc(description)}</desc><rect width="${w}" height="${h}" fill="${esc(paint(theme.background, '#ffffff'))}"/>${isolatedBody}</svg>`;
  return { svg, width: physicalWidth, height: physicalHeight };
}
