import type {
  DiagramSpec,
  Theme,
  RenderedDiagram,
  Participant,
  FishboneCause,
  FishboneHeadStyle,
} from "./types";
import { esc, text, frame } from "./svg";
import { resolveLayout } from "./themes";

// Character-aware sizing keeps CJK labels legible without requiring browser font metrics.
function measure(value: string, size: number): number {
  return Array.from(value).reduce(
    (width, char) =>
      width +
      (/[^\u0000-\u00ff]/.test(char) ? 1 : /[MW@%]/.test(char) ? 0.9 : 0.58) *
        size,
    0,
  );
}
function wrap(value: string, width: number, size: number): string[] {
  const result: string[] = [];
  for (const paragraph of value.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (line && measure(line + char, size) > width) {
        result.push(line);
        line = "";
      }
      line += char;
    }
    result.push(line);
  }
  return result;
}
function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  dashed = false,
): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${esc(color)}" stroke-width="${width}"${dashed ? ' stroke-dasharray="6 5"' : ""}/>`;
}
function heading(
  spec: DiagramSpec,
  theme: Theme,
  width: number,
  eyebrow: string,
): { svg: string; bottom: number } {
  if (spec.layout?.showTitle !== true) return { svg: "", bottom: 24 };
  const titleSize = theme.fontSize + 10;
  const title = wrap(spec.title, width - 80, titleSize);
  const subtitle = spec.description
    ? wrap(spec.description, width - 80, theme.fontSize)
    : [];
  const titleY = 66;
  const descriptionY = titleY + title.length * titleSize * 1.4 + 5;
  return {
    svg:
      text(40, 30, eyebrow, theme, {
        anchor: "start",
        size: 11,
        fill: theme.muted,
        weight: 700,
      }) +
      text(40, titleY, title.join("\n"), theme, {
        anchor: "start",
        size: titleSize,
        weight: 700,
      }) +
      (subtitle.length
        ? text(40, descriptionY, subtitle.join("\n"), theme, {
            anchor: "start",
            fill: theme.muted,
          })
        : ""),
    bottom:
      (subtitle.length
        ? descriptionY + subtitle.length * theme.fontSize * 1.4
        : titleY + title.length * titleSize * 1.4) + 30,
  };
}

/** Time-ordered UML interactions, including lifetime and nested activation semantics. */
export function renderSequence(
  spec: DiagramSpec,
  theme: Theme,
): RenderedDiagram {
  spec = { ...spec, layout: resolveLayout(spec) };
  const participants = spec.participants ?? [];
  const messages = spec.messages ?? [];
  const fragments = spec.fragments ?? [];
  const size = theme.fontSize;
  const participantWidth = Math.max(
    128,
    theme.nodeWidth,
    ...participants.map((p) => Math.min(280, measure(p.label, size) + 30)),
  );
  const gap = spec.layout?.regionGap ?? 40;
  const messageGap = spec.layout?.elementGap ?? 24;
  const labelWidth = Math.max(participantWidth + gap - 24, 190);
  const column = participantWidth + gap;
  const lastCenter =
    70 + participantWidth / 2 + (participants.length - 1) * column;
  const width = Math.max(
    720,
    participants.length * column + 100,
    lastCenter + Math.max(participantWidth / 2, labelWidth - 38) + 40,
  );
  const header = heading(spec, theme, width, "UML / SEQUENCE · 时间向下");
  const top = header.bottom;
  const boxHeight = Math.max(
    76,
    size * 4,
    ...participants.map(
      (p) =>
        wrap(p.label, participantWidth - 20, size).length * size * 1.4 +
        (p.kind === "actor" ? 76 : 28),
    ),
  );
  const x = new Map(
    participants.map((p, i) => [p.id, 70 + participantWidth / 2 + i * column]),
  );
  const ys: number[] = [];
  const rowLines: string[][] = [],
    labelTops: number[] = [];
  const guardSize = Math.max(11, size - 1),
    guardLeading = guardSize * 1.4;
  const orderedFragments = [...fragments].sort(
    (a, b) => b.to - b.from - (a.to - a.from),
  );
  const frames = orderedFragments.map((fragment, index) => {
    const nested = orderedFragments
      .slice(0, index)
      .filter(
        (other) => other.from <= fragment.from && other.to >= fragment.to,
      ).length;
    const left = 36 + nested * 12,
      right = width - 36 - nested * 12;
    const guardLines = wrap(
      `[${fragment.label}]`,
      Math.max(48, right - left - 96),
      guardSize,
    );
    const elseLines = wrap(
      `[${fragment.elseLabel ?? (fragment.kind === "par" ? "并行分支" : "else")}]`,
      Math.max(48, right - left - 32),
      guardSize,
    );
    return {
      fragment,
      left,
      right,
      guardLines,
      elseLines,
      headerHeight: Math.max(44, guardLines.length * guardLeading + 20) + 12,
      elseHeight: elseLines.length * guardLeading + 36,
      top: 0,
      bottom: 0,
      divider: 0,
    };
  });
  type FragmentBox = (typeof frames)[number];
  const starts = new Map<number, FragmentBox[]>(),
    alternatives = new Map<number, FragmentBox[]>(),
    ends = new Map<number, FragmentBox[]>();
  const addEvent = (
    events: Map<number, FragmentBox[]>,
    index: number,
    box: FragmentBox,
  ): void => {
    const list = events.get(index);
    if (list) list.push(box);
    else events.set(index, [box]);
  };
  for (const box of frames) {
    addEvent(starts, box.fragment.from, box);
    addEvent(ends, box.fragment.to, box);
    if (box.fragment.elseAt !== undefined)
      addEvent(alternatives, box.fragment.elseAt, box);
  }
  for (const boxes of ends.values()) boxes.reverse();
  let cursor = top + boxHeight + 40;
  for (let i = 0; i < messages.length; i++) {
    const elseBoxes = alternatives.get(i),
      startBoxes = starts.get(i);
    if (elseBoxes)
      for (const box of elseBoxes) {
        box.divider = cursor;
        cursor += box.elseHeight;
      }
    if (startBoxes)
      for (const box of startBoxes) {
        box.top = cursor;
        cursor += box.headerHeight;
      }
    const msg = messages[i]!;
    const label = `${i + 1}  ${msg.label}${msg.kind === "create" ? " «create»" : msg.kind === "destroy" ? " «destroy»" : ""}`;
    const available =
      msg.from === msg.to
        ? labelWidth - 56
        : Math.abs(x.get(msg.to)! - x.get(msg.from)!) -
          (msg.kind === "create" ? participantWidth / 2 : 0) -
          48;
    const lines = wrap(
      label,
      Math.max(48, Math.min(labelWidth, available)),
      size,
    );
    const labelHeight = lines.length * size * 1.4;
    const before =
      msg.kind === "create"
        ? Math.max(labelHeight + 12, boxHeight / 2 + 16)
        : labelHeight + 12;
    const y = cursor + before;
    ys.push(y);
    rowLines.push(lines);
    labelTops.push(y - labelHeight - 12);
    cursor =
      y +
      (msg.from === msg.to ? 30 : 0) +
      (msg.kind === "create"
        ? Math.max(messageGap, boxHeight / 2 + 20)
        : messageGap);
    const endBoxes = ends.get(i);
    if (endBoxes) {
      let boundary = cursor - 10;
      for (const box of endBoxes) {
        box.bottom = boundary;
        boundary += 14;
      }
      cursor = boundary + 4;
    }
  }
  const bottom = cursor + 36;
  const height = bottom + 56;
  const createAt = new Map<string, number>();
  const destroyAt = new Map<string, number>();
  messages.forEach((m, i) => {
    if (m.kind === "create" && !createAt.has(m.to)) createAt.set(m.to, i);
    if (m.kind === "destroy" && !destroyAt.has(m.to)) destroyAt.set(m.to, i);
  });
  const headerY = (p: Participant): number =>
    createAt.has(p.id) ? ys[createAt.get(p.id)!]! - boxHeight / 2 : top;
  let body =
    header.svg +
    `<defs><marker id="seq-filled" viewBox="0 0 10 8" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M 0 0 L 10 4 L 0 8 Z" fill="${esc(theme.primary)}"/></marker><marker id="seq-open" viewBox="0 0 10 8" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M 0 0 L 9 4 L 0 8" fill="none" stroke="${esc(theme.primary)}" stroke-width="1.5"/></marker></defs>`;
  let fragmentAnnotations = "";
  const guard = (left: number, top: number, lines: string[]): string => {
    const width =
      Math.max(...lines.map((value) => measure(value, guardSize))) + 8;
    return (
      `<rect x="${left - 4}" y="${top}" width="${width}" height="${lines.length * guardLeading}" fill="${esc(theme.background === "transparent" ? theme.surface : theme.background)}"/>` +
      text(left, top + guardSize * 1.1, lines.join("\n"), theme, {
        anchor: "start",
        size: guardSize,
        fill: theme.muted,
      })
    );
  };
  for (const box of frames) {
    const { fragment, left, right, top: frameTop, bottom: frameBottom } = box;
    body += `<g data-editor-key="fragments/${spec.fragments!.indexOf(fragment)}"><rect x="${left}" y="${frameTop}" width="${right - left}" height="${frameBottom - frameTop}" rx="${Math.min(4, theme.radius)}" fill="none" stroke="${esc(theme.border)}" stroke-width="${theme.lineWidth}"/>`;
    fragmentAnnotations += `<g data-editor-key="fragments/${spec.fragments!.indexOf(fragment)}"><path d="M ${left} ${frameTop + 26} H ${left + 54} L ${left + 64} ${frameTop + 16} V ${frameTop} H ${left}" fill="${esc(theme.surface)}" stroke="${esc(theme.border)}"/>`;
    fragmentAnnotations += text(
      left + 10,
      frameTop + 18,
      fragment.kind,
      theme,
      { anchor: "start", size: 12, weight: 700 },
    );
    fragmentAnnotations += guard(left + 76, frameTop + 8, box.guardLines);
    if (fragment.elseAt !== undefined) {
      body += line(
        left,
        box.divider,
        right,
        box.divider,
        theme.border,
        theme.lineWidth,
        true,
      );
      fragmentAnnotations += guard(left + 12, box.divider + 10, box.elseLines);
    }
    body += `</g>`;
    fragmentAnnotations += `</g>`;
  }
  for (const p of participants) {
    const cx = x.get(p.id)!;
    body += `<g data-editor-key="participants/${participants.indexOf(p)}">`;
    const start = headerY(p) + boxHeight;
    const end = destroyAt.has(p.id) ? ys[destroyAt.get(p.id)!]! : bottom;
    body += line(
      cx,
      start,
      cx,
      Math.max(start, end),
      theme.border,
      theme.lineWidth,
      true,
    );
    body += `</g>`;
  }
  type Activation = { start: number; depth: number };
  const stacks = new Map<string, Activation[]>();
  const activationShapes: string[] = [];
  const drawActivation = (
    id: string,
    activation: Activation,
    end: number,
  ): void => {
    const ax = x.get(id)! - 6 + activation.depth * 5;
    activationShapes.push(
      `<rect x="${ax}" y="${activation.start}" width="12" height="${Math.max(16, end - activation.start)}" fill="${esc(theme.surface)}" stroke="${esc(theme.secondary)}" stroke-width="${theme.lineWidth}"/>`,
    );
  };
  const sourceOffsets: number[] = [],
    targetOffsets: number[] = [];
  messages.forEach((m, i) => {
    const source = stacks.get(m.from) ?? [];
    sourceOffsets[i] = source.length ? 6 + (source.length - 1) * 5 : 0;
    const target = stacks.get(m.to) ?? [];
    if (m.activate) {
      target.push({ start: ys[i]!, depth: target.length });
      stacks.set(m.to, target);
    }
    targetOffsets[i] = target.length ? 6 + (target.length - 1) * 5 : 0;
    // A return hands back control from its sender; other messages finish their receiver.
    const closeId = m.kind === "return" ? m.from : m.to;
    if (m.deactivate) {
      const stack = stacks.get(closeId);
      const active = stack?.pop();
      if (active)
        drawActivation(closeId, active, ys[i]! + (m.from === m.to ? 30 : 0));
    }
    if (m.kind === "destroy") {
      const stack = stacks.get(m.to) ?? [];
      while (stack.length) drawActivation(m.to, stack.pop()!, ys[i]!);
    }
  });
  for (const [id, stack] of stacks)
    while (stack.length) drawActivation(id, stack.pop()!, bottom);
  body += activationShapes.join("");
  for (const p of participants) {
    const cx = x.get(p.id)!,
      py = headerY(p);
    body += `<g data-editor-key="participants/${participants.indexOf(p)}">`;
    const labelLines = wrap(p.label, participantWidth - 20, size);
    if (p.kind === "actor") {
      const cy = py + 13;
      body += `<circle cx="${cx}" cy="${cy}" r="9" fill="${esc(theme.surface)}" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
      body += `<path d="M ${cx} ${cy + 9} v 18 m -16 -11 h 32 M ${cx} ${cy + 27} l -13 15 M ${cx} ${cy + 27} l 13 15" fill="none" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
      body += text(cx, py + 64 + size, labelLines.join("\n"), theme, {
        anchor: "middle",
        weight: 600,
      });
    } else {
      if (p.kind === "database") {
        const left = cx - participantWidth / 2;
        const top = py + 8;
        const bottom = py + boxHeight - 8;
        body += `<path d="M ${left} ${top} A ${participantWidth / 2} 8 0 0 1 ${cx + participantWidth / 2} ${top} V ${bottom} A ${participantWidth / 2} 8 0 0 1 ${left} ${bottom} Z" fill="${esc(theme.surface)}" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
        body += `<ellipse cx="${cx}" cy="${top}" rx="${participantWidth / 2}" ry="8" fill="${esc(theme.surface)}" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
        body += `<path d="M ${left} ${bottom} A ${participantWidth / 2} 8 0 0 0 ${cx + participantWidth / 2} ${bottom}" fill="none" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
      } else {
        body += `<rect x="${cx - participantWidth / 2}" y="${py}" width="${participantWidth}" height="${boxHeight}" rx="${theme.radius}" fill="${esc(theme.surface)}" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
      }
      body += text(
        cx,
        py + boxHeight / 2 + size / 3 - (labelLines.length - 1) * size * 0.7,
        labelLines.join("\n"),
        theme,
        { anchor: "middle", weight: 600 },
      );
    }
    body += `</g>`;
  }
  body += fragmentAnnotations;
  messages.forEach((m, i) => {
    body += `<g data-editor-key="messages/${i}">`;
    const sx = x.get(m.from)!,
      tx = x.get(m.to)!,
      y = ys[i]!;
    const self = m.from === m.to;
    const sign = tx >= sx ? 1 : -1;
    const start = sx + (self ? sourceOffsets[i]! : sign * sourceOffsets[i]!);
    const end =
      m.kind === "create"
        ? tx - (sign * participantWidth) / 2
        : tx - sign * targetOffsets[i]!;
    const kind = m.kind ?? "sync";
    const dashed = kind === "return" || kind === "create";
    const open = kind === "async" || kind === "create";
    const path = self
      ? `M ${start} ${y} H ${sx + Math.min(80, column / 3)} Q ${sx + Math.min(80, column / 3) + 8} ${y} ${sx + Math.min(80, column / 3) + 8} ${y + 8} V ${y + 22} Q ${sx + Math.min(80, column / 3) + 8} ${y + 30} ${sx + Math.min(80, column / 3)} ${y + 30} H ${sx + targetOffsets[i]!}`
      : `M ${start} ${y} H ${end}`;
    body += `<path d="${path}" fill="none" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"${dashed ? ' stroke-dasharray="6 4"' : ""} marker-end="url(#${open ? "seq-open" : "seq-filled"})"/>`;
    const labelLines = rowLines[i]!;
    const lx = self ? sx + 18 : (start + end) / 2;
    const ly = labelTops[i]! + size * 1.1;
    const lw = Math.max(...labelLines.map((l) => measure(l, size))) + 12;
    body += `<rect x="${self ? lx - 4 : lx - lw / 2}" y="${labelTops[i]}" width="${lw}" height="${labelLines.length * size * 1.4}" fill="${esc(theme.background === "transparent" ? theme.surface : theme.background)}"/>`;
    body += text(lx, ly, labelLines.join("\n"), theme, {
      anchor: self ? "start" : "middle",
    });
    if (kind === "destroy")
      body += `<path d="M ${tx - 10} ${y - 10} l 20 20 M ${tx - 10} ${y + 10} l 20 -20" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth + 1}"/>`;
    body += `</g>`;
  });
  body += text(
    40,
    height - 18,
    "实心箭头 同步 / 返回　空心箭头 异步 / 创建　× 生命周期结束",
    theme,
    { anchor: "start", size: 11, fill: theme.muted },
  );
  return frame(spec, theme, width, height, body);
}

/** Fish-head proportions adapted from Fishbone Studio (MIT); see LICENSE. */
function fishHeadMetrics(style: FishboneHeadStyle) {
  const tall = ["roundfish", "carp", "sunfish", "triangle"].includes(style);
  const eye = ["fish", "shark", "sunfish"].includes(style);
  const notch = style === "shark" || style === "sunfish";
  return {
    width: tall ? 340 : 300,
    minHeight: style === "sunfish" ? 260 : style === "carp" ? 230 : tall ? 240 : style === "fish" ? 160 : style === "shark" ? 184 : 108,
    textWidth: style === "slim" ? 158 : style === "fish" ? 144 : notch ? 132 : style === "triangle" ? 144 : tall ? 158 : 184,
    textCenter: style === "fish" ? 0.465 : style === "slim" ? 0.445 : notch ? 0.4 : style === "roundfish" || style === "triangle" ? 0.36 : style === "carp" ? 0.43 : 0.5,
    textY: style === "fish" ? 0.57 : eye ? 0.6 : 0.5,
    textHeightRatio: style === "fish" ? 0.3 : style === "triangle" ? 0.4 : eye ? 0.36 : 0.52,
  };
}

/**
 * @license Fish-head silhouettes adapted from Fishbone Studio, MIT.
 * Copyright (c) 2026 Fishbone Studio contributors. Full terms in LICENSE.
 * Standalone SVG keeps browser and native image exports on the same geometry.
 */
function fishHeadSvg(style: FishboneHeadStyle, x: number, y: number, w: number, h: number, theme: Theme): string {
  const p = (a: number, b: number) => `${x + w * a} ${y + h * b}`;
  const anatomical = style !== "rounded" && style !== "label";
  const notch = style === "shark" || style === "sunfish";
  let silhouette: string;
  switch (style) {
    case "fish":
      silhouette = `M${p(0.11, 0.12)} C${p(0.23, 0.035)} ${p(0.65, 0.12)} ${p(0.9, 0.36)} Q${p(0.975, 0.44)} ${p(0.985, 0.52)} C${p(0.76, 0.72)} ${p(0.38, 0.955)} ${p(0.13, 0.92)} Q${p(0.045, 0.91)} ${p(0.065, 0.8)} C${p(0.13, 0.61)} ${p(0.13, 0.4)} ${p(0.065, 0.23)} Q${p(0.045, 0.16)} ${p(0.11, 0.12)} Z`;
      break;
    case "slim":
      silhouette = `M${p(0.075, 0.5)} C${p(0.075, 0.25)} ${p(0.29, 0.12)} ${p(0.56, 0.13)} C${p(0.8, 0.14)} ${p(0.965, 0.32)} ${p(0.98, 0.5)} C${p(0.965, 0.68)} ${p(0.8, 0.86)} ${p(0.56, 0.87)} C${p(0.29, 0.88)} ${p(0.075, 0.75)} ${p(0.075, 0.5)} Z`;
      break;
    case "shark":
      silhouette = `M${p(0.085, 0.085)} C${p(0.31, 0.025)} ${p(0.76, 0.12)} ${p(0.98, 0.43)} L${p(0.74, 0.5)} Q${p(0.83, 0.58)} ${p(0.935, 0.61)} C${p(0.745, 0.845)} ${p(0.43, 0.96)} ${p(0.095, 0.935)} Q${p(0.17, 0.5)} ${p(0.085, 0.085)} Z`;
      break;
    case "roundfish":
      silhouette = `M${p(0.13, 0.045)} C${p(0.37, 0.065)} ${p(0.745, 0.21)} ${p(0.955, 0.42)} Q${p(1, 0.5)} ${p(0.955, 0.58)} C${p(0.745, 0.79)} ${p(0.37, 0.935)} ${p(0.13, 0.955)} Q${p(0.055, 0.96)} ${p(0.055, 0.865)} L${p(0.055, 0.135)} Q${p(0.055, 0.04)} ${p(0.13, 0.045)} Z`;
      break;
    case "carp":
      silhouette = `M${p(0.075, 0.5)} C${p(0.075, 0.225)} ${p(0.225, 0.055)} ${p(0.44, 0.055)} C${p(0.67, 0.055)} ${p(0.88, 0.29)} ${p(0.975, 0.455)} Q${p(1, 0.5)} ${p(0.975, 0.545)} C${p(0.88, 0.71)} ${p(0.67, 0.945)} ${p(0.44, 0.945)} C${p(0.225, 0.945)} ${p(0.075, 0.775)} ${p(0.075, 0.5)} Z`;
      break;
    case "sunfish":
      silhouette = `M${p(0.1, 0.055)} C${p(0.43, 0.015)} ${p(0.76, 0.16)} ${p(0.98, 0.395)} L${p(0.65, 0.505)} Q${p(0.76, 0.6)} ${p(0.915, 0.65)} C${p(0.73, 0.865)} ${p(0.45, 0.98)} ${p(0.105, 0.945)} Q${p(0.2, 0.5)} ${p(0.1, 0.055)} Z`;
      break;
    case "triangle":
      silhouette = `M${p(0.12, 0.06)} L${p(0.965, 0.465)} Q${p(1, 0.5)} ${p(0.965, 0.535)} L${p(0.12, 0.94)} Q${p(0.075, 0.965)} ${p(0.075, 0.91)} L${p(0.075, 0.09)} Q${p(0.075, 0.035)} ${p(0.12, 0.06)} Z`;
      break;
    default:
      silhouette = "";
  }
  let shape = anatomical
    ? `<path data-feature="silhouette"${notch ? ' data-mouth="notch"' : ""} d="${silhouette}"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${style === "rounded" ? Math.min(h / 2, 38) : theme.radius}"/>`;
  if (["fish", "slim", "shark", "sunfish", "carp"].includes(style)) {
    const eyeX = x + w * (notch ? 0.4 : style === "slim" ? 0.84 : 0.67);
    const eyeY = y + h * (style === "slim" ? 0.32 : 0.25);
    shape += `<circle data-feature="eye" cx="${eyeX}" cy="${eyeY}" r="${style === "slim" ? 3.2 : 4}" fill="${esc(theme.text)}" stroke="none" opacity=".75"/>`;
  }
  if (anatomical && !["triangle", "roundfish"].includes(style))
    shape += `<path data-feature="gill" d="M${p(0.15, 0.3)} C${p(0.12, 0.41)} ${p(0.12, 0.59)} ${p(0.15, 0.7)}" fill="none" stroke="${esc(theme.text)}" stroke-width="1.2" stroke-opacity=".27" stroke-linecap="round"/>`;
  if (style === "slim")
    shape += `<path data-feature="mouth" d="M${p(0.915, 0.58)} Q${p(0.946, 0.59)} ${p(0.97, 0.55)}" fill="none" stroke="${esc(theme.text)}" stroke-width="1" stroke-opacity=".5" stroke-linecap="round"/>`;
  return `<g data-part="head" data-style="${style}" fill="${esc(theme.surface)}" stroke="${esc(theme.primary)}" stroke-width="${Math.max(1, theme.lineWidth * (anatomical ? 0.8 : 1))}" stroke-linejoin="round">${shape}</g>`;
}

/** Original cause-tree layout with adapted Fishbone Studio head styles. */
export function renderFishbone(
  spec: DiagramSpec,
  theme: Theme,
): RenderedDiagram {
  spec = { ...spec, layout: resolveLayout(spec) };
  const data = spec.fishbone!;
  const size = theme.fontSize;
  const leading = size * 1.4;
  const elementGap = spec.layout?.elementGap ?? 24;
  const regionGap = spec.layout?.regionGap ?? 40;
  type CauseRow = {
    cause: FishboneCause;
    path: string;
    depth: number;
    parent: number;
    lines: string[];
    offset: number;
    height: number;
  };
  const categories = data.categories.map((category, index) => {
    const rows: CauseRow[] = [];
    let offset = 0,
      maxDepth = 0;
    const visit = (
      cause: FishboneCause,
      depth: number,
      parent: number,
      path: string,
    ): void => {
      const lines = wrap(cause.label, 205, size);
      const rowIndex = rows.length;
      const height = Math.max(
        18 + elementGap,
        lines.length * leading + elementGap,
      );
      rows.push({ cause, depth, parent, lines, offset, height, path });
      offset += height;
      maxDepth = Math.max(maxDepth, depth);
      cause.children?.forEach((child, i) => visit(child, depth + 1, rowIndex, `${path}/children/${i}`));
    };
    category.causes.forEach((cause, i) => visit(cause, 0, -1, `categories/${index}/causes/${i}`));
    return {
      category,
      index,
      rows,
      span: Math.max(180, offset + 64),
      width: Math.max(
        400 + maxDepth * 26,
        measure(category.label, size + 1) + 50,
      ),
    };
  });
  const columns: number[] = [];
  for (let i = 0; i < categories.length; i += 2)
    columns.push(Math.max(categories[i]!.width, categories[i + 1]?.width ?? 0));
  const headStyle = data.headStyle ?? "classic";
  const classicHead = headStyle === "classic";
  const headMetrics = fishHeadMetrics(classicHead ? "fish" : headStyle);
  const headWidth = Math.max(classicHead ? 300 : headMetrics.width, theme.nodeWidth + 120);
  const effectSize = size + 3;
  const effectLines = wrap(data.effect, classicHead ? headWidth * 0.47 : headMetrics.textWidth * headWidth / headMetrics.width, effectSize);
  const effectHeight = effectLines.length * effectSize * 1.4;
  const headHeight = classicHead
    ? Math.max(160, effectHeight * 1.8 + 48)
    : Math.max(headMetrics.minHeight, (effectHeight + 12) / headMetrics.textHeightRatio);
  const width = Math.max(
    920,
    150 +
      columns.reduce((sum, w) => sum + w, 0) +
      Math.max(0, columns.length - 1) * regionGap +
      headWidth +
      80,
  );
  const header = heading(
    spec,
    theme,
    width,
    "ROOT CAUSE / FISHBONE · 原因分析",
  );
  const topSpan = Math.max(
    180,
    headHeight / 2 + 24,
    ...categories.filter((c) => c.index % 2 === 0).map((c) => c.span),
  );
  const bottomSpan = Math.max(
    180,
    headHeight / 2 + 24,
    ...categories.filter((c) => c.index % 2 === 1).map((c) => c.span),
  );
  const categoryMargin = Math.max(
    62,
    ...categories.map(
      (c) =>
        wrap(
          c.category.label,
          Math.min(
            c.width - 36,
            Math.max(130, measure(c.category.label, size + 1) + 34),
          ) - 24,
          size + 1,
        ).length *
          (size + 1) *
          1.4 +
        28,
    ),
  );
  const spineY = header.bottom + topSpan + categoryMargin;
  const height = spineY + bottomSpan + Math.max(110, categoryMargin + 48);
  const headX = width - headWidth - 48;
  let body = header.svg;
  body += `<path d="M 96 ${spineY} L 42 ${spineY - 40} Q 52 ${spineY} 42 ${spineY + 40} Z" fill="${esc(theme.surface)}" stroke="${esc(theme.secondary)}" stroke-width="${theme.lineWidth + 1}"/>`;
  body += line(
    96,
    spineY,
    classicHead ? headX + 28 : headX + headWidth * 0.15,
    spineY,
    theme.primary,
    theme.lineWidth + 2,
  );
  // Small dorsal/ventral fins distinguish a fish skeleton from a generic cause tree.
  const finX = headX - 65;
  body += `<path d="M ${finX - 42} ${spineY} l 18 -30 l 28 30 M ${finX - 42} ${spineY} l 18 30 l 28 -30" fill="${esc(theme.surface)}" stroke="${esc(theme.secondary)}" stroke-width="${theme.lineWidth}"/>`;
  let left = 125;
  for (let ci = 0; ci < columns.length; ci++) {
    const colWidth = columns[ci]!;
    for (const item of categories.filter(
      (c) => Math.floor(c.index / 2) === ci,
    )) {
      const upper = item.index % 2 === 0;
      const direction = upper ? -1 : 1;
      const span = upper ? topSpan : bottomSpan;
      const outerY = spineY + direction * span;
      const attachX = left + colWidth - 20;
      const categoryWidth = Math.min(
        colWidth - 36,
        Math.max(130, measure(item.category.label, size + 1) + 34),
      );
      const tipX = left + colWidth - categoryWidth / 2 - 18;
      const categoryLines = wrap(
        item.category.label,
        categoryWidth - 24,
        size + 1,
      );
      const categoryHeight = categoryLines.length * (size + 1) * 1.4 + 20;
      const categoryY = upper ? outerY - categoryHeight : outerY;
      body += `<g data-editor-key="categories/${item.index}">`;
      body += line(
        attachX,
        spineY,
        tipX,
        outerY,
        theme.secondary,
        theme.lineWidth + 0.5,
      );
      const centers = item.rows.map(
        (row) => (upper ? outerY : spineY) + 35 + row.offset + row.height / 2,
      );
      item.rows.forEach((row, ri) => {
        body += `<g data-editor-key="${row.path}">`;
        const ry = centers[ri]!;
        const labelX = left + 12 + row.depth * 26;
        const lineY = ry + (row.lines.length * leading) / 2 + 6;
        if (row.parent < 0) {
          const ratio = Math.abs(lineY - spineY) / span;
          const boneX = attachX + (tipX - attachX) * ratio;
          body += line(
            labelX,
            lineY,
            boneX,
            lineY,
            theme.border,
            theme.lineWidth,
          );
        } else {
          const parentRow = item.rows[row.parent]!;
          const parentX = left + 12 + parentRow.depth * 26;
          const parentY =
            centers[row.parent]! + (parentRow.lines.length * leading) / 2 + 6;
          body += `<path d="M ${parentX + 8} ${parentY} V ${lineY} H ${labelX}" fill="none" stroke="${esc(theme.border)}" stroke-width="${theme.lineWidth}"/>`;
        }
        body += `<circle cx="${labelX}" cy="${lineY}" r="${row.depth === 0 ? 3 : 2}" fill="${esc(row.depth === 0 ? theme.secondary : theme.muted)}"/>`;
        body += text(
          labelX + 5,
          ry - ((row.lines.length - 1) * leading) / 2,
          row.lines.join("\n"),
          theme,
          {
            anchor: "start",
            size,
            fill: row.depth === 0 ? theme.text : theme.muted,
            weight: row.depth === 0 ? 600 : 400,
          },
        );
        body += `</g>`;
      });
      body += `<rect x="${tipX - categoryWidth / 2}" y="${categoryY}" width="${categoryWidth}" height="${categoryHeight}" rx="${Math.min(theme.radius, 6)}" fill="${esc(theme.surface)}" stroke="${esc(theme.secondary)}" stroke-width="${theme.lineWidth}"/>`;
      body += text(
        tipX,
        categoryY + 12 + size + 1,
        categoryLines.join("\n"),
        theme,
        { size: size + 1, anchor: "middle", weight: 700 },
      );
      body += `</g>`;
    }
    left += colWidth + regionGap;
  }
  body += `<g data-editor-key="effect">`;
  const headY = spineY - headHeight / 2;
  if (classicHead) {
    // Preserve the original UML Studio silhouette, strokes and proportions.
    body += `<path d="M ${headX + 25} ${spineY} Q ${headX + 2} ${spineY - headHeight * 0.46} ${headX + 55} ${spineY - headHeight / 2} Q ${headX + headWidth * 0.76} ${spineY - headHeight * 0.63} ${headX + headWidth} ${spineY} Q ${headX + headWidth * 0.76} ${spineY + headHeight * 0.63} ${headX + 55} ${spineY + headHeight / 2} Q ${headX + 2} ${spineY + headHeight * 0.46} ${headX + 25} ${spineY} Z" fill="${esc(theme.surface)}" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth + 1}"/>`;
    body += `<path d="M ${headX + 43} ${spineY - headHeight * 0.3} Q ${headX + 61} ${spineY} ${headX + 43} ${spineY + headHeight * 0.3}" fill="none" stroke="${esc(theme.secondary)}" stroke-width="${theme.lineWidth}"/>`;
    body += `<circle cx="${headX + headWidth - 49}" cy="${spineY - headHeight * 0.25}" r="5" fill="${esc(theme.primary)}"/>`;
  } else {
    body += fishHeadSvg(headStyle, headX, headY, headWidth, headHeight, theme);
  }
  body += text(
    classicHead ? headX + headWidth / 2 + 8 : headX + headWidth * headMetrics.textCenter,
    classicHead ? spineY + 5 - (effectLines.length - 1) * effectSize * 0.7 : headY + headHeight * headMetrics.textY + effectSize * 0.35 - (effectLines.length - 1) * effectSize * 0.7,
    effectLines.join("\n"),
    theme,
    { size: effectSize, anchor: "middle", weight: 700 },
  );
  body += `</g>`;
  body += text(
    40,
    height - 24,
    `${data.categories.length} 个原因维度 · 分支逐级展开 · 鱼头表示观察到的结果`,
    theme,
    { anchor: "start", size: 11, fill: theme.muted },
  );
  return frame(spec, theme, width, height, body);
}
