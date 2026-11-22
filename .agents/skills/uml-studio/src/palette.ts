import type { PaletteBy, PaletteMode, Theme } from './types';

type RGB = [number, number, number];

export const defaultPalette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export function parseHex(value: string): RGB | undefined {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
  if (!match) return;
  const hex = match[1]!.length === 3 ? match[1]!.split('').map(c => c + c).join('') : match[1]!;
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}
export function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}
/** Mix `color` towards `other` by `amount` (0 keeps color, 1 returns other). */
export function mix(color: string, other: string, amount: number): string {
  const a = parseHex(color), b = parseHex(other);
  if (!a || !b) return color;
  return toHex(a.map((v, i) => v + (b[i]! - v) * amount) as RGB);
}
export function luminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
/** Readable ink on a filled colour. */
export function contrastText(fill: string, dark = '#1f2937'): string {
  return luminance(fill) > 0.42 ? dark : '#ffffff';
}

export interface PaletteMember { mode: Exclude<PaletteMode, 'mono'>; by: PaletteBy; colors: string[] }
export function paletteOf(theme: Theme): PaletteMember | undefined {
  const mode = theme.paletteMode ?? (theme.palette?.length ? 'tint' : 'mono');
  if (mode === 'mono') return;
  const colors = (theme.palette?.length ? theme.palette : defaultPalette).filter(color => parseHex(color));
  if (!colors.length) return;
  return { mode, by: theme.paletteBy ?? 'auto', colors };
}

export interface ElementPaint { fill: string; stroke: string; text: string; muted: string; accent: string; gradient?: { id: string; from: string; to: string } }
/** Element colours for one palette slot; gradient ids are local and isolated by frame(). */
export function paintFor(theme: Theme, palette: PaletteMember, index: number): ElementPaint {
  const slot = ((index % palette.colors.length) + palette.colors.length) % palette.colors.length;
  const color = palette.colors[slot]!;
  const darkBackground = luminance(theme.background === 'transparent' ? theme.surface : theme.background) < 0.2;
  if (palette.mode === 'tint') {
    const fill = darkBackground ? mix(color, '#000000', 0.62) : mix(color, '#ffffff', 0.86);
    const text = darkBackground ? mix(color, '#ffffff', 0.78) : mix(color, '#111827', 0.62);
    return { fill, stroke: color, text, muted: mix(text, fill, 0.3), accent: darkBackground ? mix(color, '#ffffff', 0.3) : mix(color, '#000000', 0.15) };
  }
  if (palette.mode === 'solid') {
    const text = contrastText(color);
    return { fill: color, stroke: mix(color, '#000000', 0.22), text, muted: mix(text, color, 0.22), accent: text };
  }
  const from = mix(color, '#ffffff', 0.38), to = mix(color, '#000000', 0.12);
  const text = contrastText(mix(from, to, 0.5));
  return { fill: `url(#uml-palette-${slot})`, stroke: mix(color, '#000000', 0.28), text, muted: mix(text, color, 0.2), accent: text, gradient: { id: `uml-palette-${slot}`, from, to } };
}
export function gradientDefs(paints: Iterable<ElementPaint>): string {
  const seen = new Map<string, ElementPaint['gradient']>();
  for (const paint of paints) if (paint.gradient) seen.set(paint.gradient.id, paint.gradient);
  if (!seen.size) return '';
  return `<defs>${[...seen.values()].map(g => `<linearGradient id="${g!.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g!.from}"/><stop offset="1" stop-color="${g!.to}"/></linearGradient>`).join('')}</defs>`;
}
/** Region tint for groups / lanes / participant boxes. */
export function regionPaint(theme: Theme, palette: PaletteMember, index: number): { fill: string; stroke: string; text: string; header: string } {
  const color = palette.colors[((index % palette.colors.length) + palette.colors.length) % palette.colors.length]!;
  const darkBackground = luminance(theme.background === 'transparent' ? theme.surface : theme.background) < 0.2;
  return darkBackground
    ? { fill: mix(color, '#000000', 0.82), stroke: mix(color, '#000000', 0.35), text: mix(color, '#ffffff', 0.6), header: mix(color, '#000000', 0.6) }
    : { fill: mix(color, '#ffffff', 0.94), stroke: mix(color, '#ffffff', 0.35), text: mix(color, '#000000', 0.35), header: mix(color, '#ffffff', 0.8) };
}
