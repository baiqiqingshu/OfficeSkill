import type {
  DiagramSpec,
  Theme,
  RenderedDiagram,
  Participant,
  Message,
  FishboneCause,
  FishboneHeadStyle,
} from "./types";
import { esc, text, frame } from "./svg";
import { resolveLayout } from "./themes";
import { contrastText, gradientDefs, luminance, mix, paintFor, paletteOf, regionPaint } from "./palette";

/** Positions stay in renderer coordinates; the outer frame only expands to keep edits visible. */
class SpecialPositions {
  minX = 0; minY = 0; maxX = 0; maxY = 0;
  constructor(private spec: DiagramSpec) {}
  at(key: string, x: number, y: number) {
    const adjustment = this.spec.layout?.adjustments?.elements?.[key];
    const nx = adjustment && 'x' in adjustment ? adjustment.x : x + (adjustment?.dx ?? 0);
    const ny = adjustment && 'y' in adjustment ? adjustment.y : y + (adjustment?.dy ?? 0);
    return { x: nx, y: ny, dx: nx - x, dy: ny - y };
  }
  attrs(key: string, x: number, y: number): string {
    return `data-adjustment-key="${esc(key)}" data-layout-x="${x}" data-layout-y="${y}"`;
  }
  include(x: number, y: number, width: number, height: number): void {
    this.minX = Math.min(this.minX, x - 16); this.minY = Math.min(this.minY, y - 16);
    this.maxX = Math.max(this.maxX, x + width + 16); this.maxY = Math.max(this.maxY, y + height + 16);
  }
  finish(theme: Theme, width: number, height: number, body: string): RenderedDiagram {
    return frame(this.spec, theme, Math.max(width, this.maxX) - this.minX, Math.max(height, this.maxY) - this.minY,
      `<g data-layout-root="" transform="translate(${-this.minX} ${-this.minY})">${body}</g>`);
  }
}

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
  const positions = new SpecialPositions(spec);
  const participants = spec.participants ?? [];
  const messages = spec.messages ?? [];
  const fragments = spec.fragments ?? [];
  const boxes = spec.boxes ?? [];
  const palette = paletteOf(theme);
  const autonumber = spec.layout?.autonumber !== false;
  const isEvent = (m: Message): boolean => m.kind === "note" || m.kind === "divider";
  const size = theme.fontSize;
  const darkBackground = luminance(theme.background === "transparent" ? theme.surface : theme.background) < 0.2;
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
  const boxOf = new Map<string, number>();
  boxes.forEach((box, index) => box.participants.forEach((id) => boxOf.set(id, index)));
  const boxHeader = boxes.length ? size * 1.4 + 18 : 0;
  const top = header.bottom + boxHeader;
  const symbolic = new Set(["actor", "boundary", "control", "entity"]);
  const boxHeight = Math.max(
    76,
    size * 4,
    ...participants.map(
      (p) =>
        wrap(p.label, participantWidth - 20, size).length * size * 1.4 +
        (symbolic.has(p.kind ?? "") ? 76 : 28),
    ),
  );
  const paints = participants.map((p, i) =>
    palette ? paintFor(theme, palette, boxes.length && palette.by !== "node" && boxOf.has(p.id) ? boxOf.get(p.id)! : i) : undefined);
  const x = new Map(
    participants.map((p, i) => [p.id, positions.at(`participants/${p.id}`, 70 + participantWidth / 2 + i * column, top).x]),
  );
  const ys: number[] = [];
  const rowLines: string[][] = [],
    labelTops: number[] = [];
  type EventBox = { left: number; top: number; width: number; height: number; lines: string[] };
  const events: (EventBox | undefined)[] = [];
  const guardSize = Math.max(12, size - 1),
    guardLeading = guardSize * 1.4;
  const tagSize = Math.max(12, size - 3);
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
    const highlight = fragment.kind === "rect";
    const guardLines = highlight || !fragment.label
      ? []
      : wrap(`[${fragment.label}]`, Math.max(48, right - left - 96), guardSize);
    const branchList = [
      ...(fragment.elseAt !== undefined ? [{ at: fragment.elseAt, label: fragment.elseLabel }] : []),
      ...(fragment.elses ?? []),
    ].sort((a, b) => a.at - b.at);
    const fallback = fragment.kind === "par" ? "并行分支" : fragment.kind === "critical" ? "option" : "else";
    const branches = branchList.map((branch) => {
      const lines = wrap(`[${branch.label ?? fallback}]`, Math.max(48, right - left - 32), guardSize);
      return { at: branch.at, lines, height: lines.length * guardLeading + 36, y: 0 };
    });
    return {
      fragment,
      left,
      right,
      guardLines,
      branches,
      headerHeight: highlight ? 14 : Math.max(44, guardLines.length * guardLeading + 20) + 12,
      top: 0,
      bottom: 0,
    };
  });
  type FragmentBox = (typeof frames)[number];
  const starts = new Map<number, FragmentBox[]>(),
    alternatives = new Map<number, { box: FragmentBox; branch: FragmentBox["branches"][number] }[]>(),
    ends = new Map<number, FragmentBox[]>();
  const addEvent = <T,>(map: Map<number, T[]>, index: number, item: T): void => {
    const list = map.get(index);
    if (list) list.push(item);
    else map.set(index, [item]);
  };
  for (const box of frames) {
    addEvent(starts, box.fragment.from, box);
    addEvent(ends, box.fragment.to, box);
    for (const branch of box.branches) addEvent(alternatives, branch.at, { box, branch });
  }
  for (const list of ends.values()) list.reverse();
  const noteSpan = (m: Message): { left: number; width: number } => {
    const sx = x.get(m.from) ?? 70, tx = x.get(m.to) ?? sx;
    const textWidth = Math.min(300, Math.max(...m.label.split("\n").map((value) => measure(value, size))) + 28);
    if (m.position === "left") { const w = Math.max(96, textWidth); return { left: sx - 14 - w, width: w }; }
    if (m.position === "right") { const w = Math.max(96, textWidth); return { left: sx + 14, width: w }; }
    const lo = Math.min(sx, tx), hi = Math.max(sx, tx);
    const w = Math.max(hi - lo + participantWidth * 0.7, textWidth, 110);
    return { left: (lo + hi) / 2 - w / 2, width: w };
  };
  let cursor = top + boxHeight + 40;
  let number = 0;
  for (let i = 0; i < messages.length; i++) {
    for (const { branch } of alternatives.get(i) ?? []) {
      branch.y = cursor;
      cursor += branch.height;
    }
    for (const box of starts.get(i) ?? []) {
      box.top = cursor;
      cursor += box.headerHeight;
    }
    const msg = messages[i]!;
    if (msg.kind === "divider") {
      const lines = msg.label ? wrap(msg.label, Math.max(120, width / 2), size) : [];
      const height = Math.max(36, lines.length * size * 1.4 + 18);
      events[i] = { left: 36, top: cursor, width: width - 72, height, lines };
      ys.push(cursor + height / 2);
      rowLines.push(lines);
      labelTops.push(cursor);
      cursor += height + messageGap / 2;
    } else if (msg.kind === "note") {
      const span = noteSpan(msg);
      const lines = wrap(msg.label, span.width - 20, size);
      const height = lines.length * size * 1.4 + 18;
      events[i] = { ...span, top: cursor + 4, height, lines };
      ys.push(cursor + 4);
      rowLines.push(lines);
      labelTops.push(cursor + 4);
      cursor += height + 12 + messageGap / 2;
    } else {
      number++;
      const label = `${autonumber ? `${number}  ` : ""}${msg.label}${msg.kind === "create" ? " «create»" : msg.kind === "destroy" ? " «destroy»" : ""}`;
      const available =
        msg.from === msg.to
          ? labelWidth - 56
          : Math.abs(x.get(msg.to)! - x.get(msg.from)!) -
            (msg.kind === "create" ? participantWidth / 2 : 0) -
            48;
      const lines = label.trim() ? wrap(label, Math.max(48, Math.min(labelWidth, available)), size) : [];
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
    }
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
  const messagePositions = messages.map((message, index) => {
    const sx = x.get(message.from) ?? 70, tx = x.get(message.to) ?? sx;
    const anchor = isEvent(message) ? events[index]!.left : message.from === message.to ? sx + 18 : (sx + tx) / 2;
    const position = positions.at(`messages/${index}`, anchor, ys[index]!);
    ys[index] = position.y;
    labelTops[index] = labelTops[index]! + position.dy;
    return position;
  });
  const bottom = Math.max(cursor + 36, ...ys.map(y => y + messageGap + 36));
  const height = bottom + 56;
  const createAt = new Map<string, number>();
  const destroyAt = new Map<string, number>();
  messages.forEach((m, i) => {
    if (m.kind === "create" && !createAt.has(m.to)) createAt.set(m.to, i);
    if (m.kind === "destroy" && !destroyAt.has(m.to)) destroyAt.set(m.to, i);
  });
  const headerY = (p: Participant): number => {
    const original = createAt.has(p.id) ? ys[createAt.get(p.id)!]! - boxHeight / 2 : top;
    return positions.at(`participants/${p.id}`, 0, original).y;
  };
  const stroke = esc(theme.primary);
  let body =
    header.svg +
    `<defs><marker id="seq-filled" viewBox="0 0 10 8" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M 0 0 L 10 4 L 0 8 Z" fill="${stroke}"/></marker><marker id="seq-open" viewBox="0 0 10 8" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M 0 0 L 9 4 L 0 8" fill="none" stroke="${stroke}" stroke-width="1.5"/></marker>`
    + `<marker id="seq-filled-start" viewBox="0 0 10 8" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto"><path d="M 10 0 L 0 4 L 10 8 Z" fill="${stroke}"/></marker><marker id="seq-open-start" viewBox="0 0 10 8" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto"><path d="M 10 0 L 1 4 L 10 8" fill="none" stroke="${stroke}" stroke-width="1.5"/></marker></defs>`
    + gradientDefs(paints.filter((paint): paint is NonNullable<typeof paint> => !!paint));
  const canvasFill = esc(theme.background === "transparent" ? theme.surface : theme.background);
  boxes.forEach((box, index) => {
    const members = box.participants.map((id) => x.get(id)).filter((value): value is number => value !== undefined);
    if (!members.length) return;
    const left = Math.min(...members) - participantWidth / 2 - 14, right = Math.max(...members) + participantWidth / 2 + 14;
    const region = palette ? regionPaint(theme, palette, index) : undefined;
    const fill = box.color && box.color !== "transparent" ? box.color : region?.fill ?? mix(theme.secondary, theme.background === "transparent" ? "#ffffff" : theme.background, darkBackground ? 0.82 : 0.92);
    const boxTop = top - boxHeader - 4;
    positions.include(left, boxTop, right - left, bottom + 20 - boxTop);
    body += `<g class="uml-seq-box" data-editor-key="boxes/${index}"><rect x="${left}" y="${boxTop}" width="${right - left}" height="${bottom + 20 - boxTop}" rx="${Math.min(10, theme.radius + 2)}" fill="${esc(box.color === "transparent" ? "none" : fill)}"${box.color && box.color !== "transparent" ? ' fill-opacity="0.35"' : ""} stroke="${esc(region?.stroke ?? theme.border)}" stroke-width="${theme.lineWidth}"/>`;
    if (box.label) body += text((left + right) / 2, boxTop + 10 + size, box.label, theme, { anchor: "middle", weight: 700, fill: region?.text ?? (box.color && box.color !== "transparent" ? contrastText(mix(fill, "#ffffff", 0.65)) : theme.text) });
    body += `</g>`;
  });
  let fragmentAnnotations = "";
  const guard = (left: number, top: number, lines: string[]): string => {
    const width =
      Math.max(...lines.map((value) => measure(value, guardSize))) + 8;
    return (
      `<rect x="${left - 4}" y="${top}" width="${width}" height="${lines.length * guardLeading}" fill="${canvasFill}"/>` +
      text(left, top + guardSize * 1.1, lines.join("\n"), theme, {
        anchor: "start",
        size: guardSize,
        fill: theme.muted,
      })
    );
  };
  for (const box of frames) {
    const { fragment, left, right, top: frameTop, bottom: frameBottom } = box;
    const index = spec.fragments!.indexOf(fragment), key = `fragments/${index}`;
    const position = positions.at(key, left, frameTop);
    const attrs = `${positions.attrs(key, position.x, position.y)} transform="translate(${position.dx} ${position.dy})"`;
    positions.include(position.x, position.y, right - left, frameBottom - frameTop);
    if (fragment.kind === "rect") {
      const fill = fragment.color && fragment.color !== "transparent" ? fragment.color : mix(theme.secondary, theme.background === "transparent" ? "#ffffff" : theme.background, darkBackground ? 0.78 : 0.88);
      body += `<g data-editor-key="${key}" ${attrs}><rect x="${left}" y="${frameTop}" width="${right - left}" height="${frameBottom - frameTop}" rx="${Math.min(6, theme.radius)}" fill="${esc(fill)}" fill-opacity="0.7"/></g>`;
      continue;
    }
    body += `<g data-editor-key="${key}" ${attrs}><rect x="${left}" y="${frameTop}" width="${right - left}" height="${frameBottom - frameTop}" rx="${Math.min(4, theme.radius)}" fill="none" stroke="${esc(theme.border)}" stroke-width="${theme.lineWidth}"/>`;
    const tagWidth = Math.max(54, measure(fragment.kind, tagSize) + 20);
    fragmentAnnotations += `<g data-editor-key="${key}" ${attrs}><path d="M ${left} ${frameTop + 26} H ${left + tagWidth} L ${left + tagWidth + 10} ${frameTop + 16} V ${frameTop} H ${left}" fill="${esc(theme.surface)}" stroke="${esc(theme.border)}"/>`;
    fragmentAnnotations += text(left + 10, frameTop + 18, fragment.kind, theme, { anchor: "start", size: tagSize, weight: 700 });
    if (box.guardLines.length) fragmentAnnotations += guard(left + tagWidth + 22, frameTop + 8, box.guardLines);
    for (const branch of box.branches) {
      body += line(left, branch.y, right, branch.y, theme.border, theme.lineWidth, true);
      fragmentAnnotations += guard(left + 12, branch.y + 10, branch.lines);
    }
    body += `</g>`;
    fragmentAnnotations += `</g>`;
  }
  for (const p of participants) {
    const cx = x.get(p.id)!;
    body += `<g data-editor-key="participants/${participants.indexOf(p)}" ${positions.attrs(`participants/${p.id}`, cx, headerY(p))}>`;
    const start = headerY(p) + boxHeight;
    const end = destroyAt.has(p.id) ? ys[destroyAt.get(p.id)!]! : bottom;
    positions.include(cx - participantWidth / 2, headerY(p), participantWidth, Math.max(boxHeight, end - headerY(p)));
    body += line(cx, start, cx, Math.max(start, end), theme.border, theme.lineWidth, true);
    body += `</g>`;
  }
  type Activation = { start: number; depth: number };
  const stacks = new Map<string, Activation[]>();
  const activationShapes: string[] = [];
  const drawActivation = (id: string, activation: Activation, end: number): void => {
    const ax = x.get(id)! - 6 + activation.depth * 5;
    const paint = paints[participants.findIndex((p) => p.id === id)];
    const fill = paint ? (paint.gradient ? mix(paint.stroke, "#ffffff", 0.7) : palette?.mode === "tint" ? paint.fill : mix(paint.fill, "#ffffff", 0.55)) : theme.surface;
    activationShapes.push(
      `<rect x="${ax}" y="${activation.start}" width="12" height="${Math.max(16, end - activation.start)}" fill="${esc(fill)}" stroke="${esc(paint?.stroke ?? theme.secondary)}" stroke-width="${theme.lineWidth}"/>`,
    );
  };
  const sourceOffsets: number[] = [],
    targetOffsets: number[] = [];
  messages.forEach((m, i) => {
    if (isEvent(m)) return;
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
  participants.forEach((p, index) => {
    const cx = x.get(p.id)!,
      py = headerY(p);
    const paint = paints[index];
    const fill = esc(paint?.fill ?? theme.surface), edge = esc(paint?.stroke ?? theme.primary);
    const ink = paint && !symbolic.has(p.kind ?? "") ? paint.text : theme.text;
    const sw = theme.lineWidth;
    body += `<g data-editor-key="participants/${index}" ${positions.attrs(`participants/${p.id}`, cx, py)}>`;
    const labelLines = wrap(p.label, participantWidth - 20, size);
    if (symbolic.has(p.kind ?? "")) {
      if (p.kind === "actor") {
        const cy = py + 13;
        body += `<circle cx="${cx}" cy="${cy}" r="9" fill="${fill}" stroke="${edge}" stroke-width="${sw}"/>`;
        body += `<path d="M ${cx} ${cy + 9} v 18 m -16 -11 h 32 M ${cx} ${cy + 27} l -13 15 M ${cx} ${cy + 27} l 13 15" fill="none" stroke="${edge}" stroke-width="${sw}"/>`;
      } else {
        const cy = py + 28;
        if (p.kind === "boundary") body += `<path d="M ${cx - 20} ${cy - 13} V ${cy + 13} M ${cx - 20} ${cy} H ${cx - 9}" fill="none" stroke="${edge}" stroke-width="${sw}"/><circle cx="${cx + 4}" cy="${cy}" r="13" fill="${fill}" stroke="${edge}" stroke-width="${sw}"/>`;
        else if (p.kind === "control") body += `<circle cx="${cx}" cy="${cy}" r="13" fill="${fill}" stroke="${edge}" stroke-width="${sw}"/><path d="M ${cx + 5} ${cy - 18} L ${cx - 1} ${cy - 13} L ${cx + 5} ${cy - 8}" fill="none" stroke="${edge}" stroke-width="${sw}"/>`;
        else body += `<circle cx="${cx}" cy="${cy}" r="13" fill="${fill}" stroke="${edge}" stroke-width="${sw}"/><path d="M ${cx - 14} ${cy + 17} H ${cx + 14}" stroke="${edge}" stroke-width="${sw}"/>`;
      }
      body += text(cx, py + 64 + size, labelLines.join("\n"), theme, { anchor: "middle", weight: 600, fill: ink });
    } else {
      const left = cx - participantWidth / 2, right = cx + participantWidth / 2;
      if (p.kind === "database") {
        const top = py + 8;
        const bottom = py + boxHeight - 8;
        body += `<path d="M ${left} ${top} A ${participantWidth / 2} 8 0 0 1 ${right} ${top} V ${bottom} A ${participantWidth / 2} 8 0 0 1 ${left} ${bottom} Z" fill="${fill}" stroke="${edge}" stroke-width="${sw}"/>`;
        body += `<ellipse cx="${cx}" cy="${top}" rx="${participantWidth / 2}" ry="8" fill="${fill}" stroke="${edge}" stroke-width="${sw}"/>`;
        body += `<path d="M ${left} ${bottom} A ${participantWidth / 2} 8 0 0 0 ${right} ${bottom}" fill="none" stroke="${edge}" stroke-width="${sw}"/>`;
      } else if (p.kind === "queue") {
        const r = 10;
        body += `<path d="M ${left + r} ${py} H ${right - r} A ${r} ${boxHeight / 2} 0 0 1 ${right - r} ${py + boxHeight} H ${left + r} A ${r} ${boxHeight / 2} 0 0 1 ${left + r} ${py} Z" fill="${fill}" stroke="${edge}" stroke-width="${sw}"/><ellipse cx="${right - r}" cy="${py + boxHeight / 2}" rx="${r}" ry="${boxHeight / 2}" fill="${fill}" stroke="${edge}" stroke-width="${sw}"/>`;
      } else if (p.kind === "collections") {
        body += `<rect x="${left + 6}" y="${py - 6}" width="${participantWidth}" height="${boxHeight}" rx="${theme.radius}" fill="${fill}" stroke="${edge}" stroke-width="${sw}"/>`;
        body += `<rect x="${left}" y="${py}" width="${participantWidth}" height="${boxHeight}" rx="${theme.radius}" fill="${fill}" stroke="${edge}" stroke-width="${sw}"/>`;
      } else {
        body += `<rect x="${left}" y="${py}" width="${participantWidth}" height="${boxHeight}" rx="${theme.radius}" fill="${fill}" stroke="${edge}" stroke-width="${sw}"/>`;
      }
      body += text(
        cx,
        py + boxHeight / 2 + size / 3 - (labelLines.length - 1) * size * 0.7,
        labelLines.join("\n"),
        theme,
        { anchor: "middle", weight: 600, fill: ink },
      );
    }
    body += `</g>`;
  });
  body += fragmentAnnotations;
  const noteFill = darkBackground ? "#3d3a2a" : "#fff8db", noteInk = darkBackground ? "#f5ecc8" : "#4a3f1c", noteEdge = darkBackground ? "#857a4a" : "#e2c870";
  messages.forEach((m, i) => {
    const position = messagePositions[i]!;
    if (isEvent(m)) {
      const event = events[i]!;
      const attrs = `${positions.attrs(`messages/${i}`, position.x, position.y)} transform="translate(${position.dx} ${position.dy})"`;
      positions.include(event.left + position.dx, event.top + position.dy, event.width, event.height);
      if (m.kind === "note") {
        const { left, top, width: w, height: h } = event;
        body += `<g class="uml-seq-note" data-editor-key="messages/${i}" ${attrs}><path d="M ${left} ${top} H ${left + w - 12} L ${left + w} ${top + 12} V ${top + h} H ${left} Z" fill="${noteFill}" stroke="${noteEdge}" stroke-width="${theme.lineWidth}"/><path d="M ${left + w - 12} ${top} V ${top + 12} H ${left + w}" fill="none" stroke="${noteEdge}" stroke-width="${theme.lineWidth}"/>`;
        body += text(left + w / 2, top + 9 + size, event.lines.join("\n"), theme, { anchor: "middle", fill: noteInk });
      } else {
        const cy = event.top + event.height / 2;
        body += `<g class="uml-seq-divider" data-editor-key="messages/${i}" ${attrs}>${line(event.left, cy - 2, event.left + event.width, cy - 2, theme.border, theme.lineWidth)}${line(event.left, cy + 2, event.left + event.width, cy + 2, theme.border, theme.lineWidth)}`;
        if (event.lines.length) {
          const lw = Math.max(...event.lines.map((value) => measure(value, size))) + 28, lh = event.lines.length * size * 1.4 + 10;
          const cx = event.left + event.width / 2;
          body += `<rect x="${cx - lw / 2}" y="${cy - lh / 2}" width="${lw}" height="${lh}" rx="${Math.min(6, theme.radius)}" fill="${esc(theme.surface)}" stroke="${esc(theme.border)}" stroke-width="${theme.lineWidth}"/>`;
          body += text(cx, cy - lh / 2 + 5 + size, event.lines.join("\n"), theme, { anchor: "middle", weight: 700 });
        }
      }
      body += `</g>`;
      return;
    }
    body += `<g data-editor-key="messages/${i}" ${positions.attrs(`messages/${i}`, position.x, ys[i]!)}>`;
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
    const dashed = m.dashed ?? (kind === "return" || kind === "create");
    const head = m.arrow ?? (kind === "async" || kind === "create" ? "open" : "filled");
    const loopX = sx + Math.min(80, column / 3);
    const path = self
      ? `M ${start} ${y} H ${loopX} Q ${loopX + 8} ${y} ${loopX + 8} ${y + 8} V ${y + 22} Q ${loopX + 8} ${y + 30} ${loopX} ${y + 30} H ${sx + targetOffsets[i]!}`
      : `M ${start} ${y} H ${end}`;
    const markerEnd = head === "filled" || head === "open" ? ` marker-end="url(#seq-${head})"` : "";
    const markerStart = m.bidirectional && (head === "filled" || head === "open") ? ` marker-start="url(#seq-${head}-start)"` : "";
    body += `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${theme.lineWidth}"${dashed ? ' stroke-dasharray="6 4"' : ""}${markerEnd}${markerStart}/>`;
    if (head === "cross") {
      const ex = self ? sx + targetOffsets[i]! : end, ey = self ? y + 30 : y;
      body += `<path d="M ${ex - 6} ${ey - 6} l 12 12 M ${ex - 6} ${ey + 6} l 12 -12" stroke="${stroke}" stroke-width="${theme.lineWidth + 0.6}"/>`;
    }
    const labelLines = rowLines[i]!;
    if (labelLines.length) {
      const lx = (self ? sx + 18 : (start + end) / 2) + position.dx;
      const ly = labelTops[i]! + size * 1.1;
      const lw = Math.max(...labelLines.map((l) => measure(l, size))) + 12;
      const labelLeft = self ? lx - 4 : lx - lw / 2;
      const messageLeft = Math.min(start, end, labelLeft);
      positions.include(messageLeft, labelTops[i]!, Math.max(start, end, labelLeft + lw, self ? sx + 100 : end) - messageLeft + 16, labelLines.length * size * 1.4 + 50);
      body += `<rect x="${labelLeft}" y="${labelTops[i]}" width="${lw}" height="${labelLines.length * size * 1.4}" fill="${canvasFill}"/>`;
      body += text(lx, ly, labelLines.join("\n"), theme, { anchor: self ? "start" : "middle" });
    }
    if (kind === "destroy")
      body += `<path d="M ${tx - 10} ${y - 10} l 20 20 M ${tx - 10} ${y + 10} l 20 -20" stroke="${stroke}" stroke-width="${theme.lineWidth + 1}"/>`;
    body += `</g>`;
  });
  body += text(
    40,
    height - 18,
    "实心箭头 同步 / 返回　空心箭头 异步 / 创建　× 生命周期结束",
    theme,
    { anchor: "start", size: 12, fill: theme.muted },
  );
  return positions.finish(theme, width, height, body);
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
  const positions = new SpecialPositions(spec);
  const data = spec.fishbone!;
  const palette = paletteOf(theme);
  const categoryPaints: ReturnType<typeof paintFor>[] = [];
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
      const baseOuterY = spineY + direction * span;
      const categoryWidth = Math.min(
        colWidth - 36,
        Math.max(130, measure(item.category.label, size + 1) + 34),
      );
      const baseTipX = left + colWidth - categoryWidth / 2 - 18;
      const categoryLines = wrap(
        item.category.label,
        categoryWidth - 24,
        size + 1,
      );
      const categoryHeight = categoryLines.length * (size + 1) * 1.4 + 20;
      const baseCategoryY = upper ? baseOuterY - categoryHeight : baseOuterY;
      const categoryKey = `fishbone/categories/${item.category.id}`;
      const categoryPosition = positions.at(categoryKey, baseTipX - categoryWidth / 2, baseCategoryY);
      const tipX = baseTipX + categoryPosition.dx;
      const categoryY = baseCategoryY + categoryPosition.dy;
      const outerY = baseOuterY + categoryPosition.dy;
      const attachX = left + colWidth - 20 + categoryPosition.dx;
      positions.include(categoryPosition.x, categoryPosition.y, categoryWidth, categoryHeight);
      positions.include(attachX - 8, Math.min(spineY, outerY), 16, Math.abs(outerY - spineY));
      const categoryPaint = palette ? paintFor(theme, palette, item.index) : undefined;
      if (categoryPaint) categoryPaints.push(categoryPaint);
      const categoryStroke = categoryPaint?.stroke ?? theme.secondary;
      body += `<g data-editor-key="categories/${item.index}" ${positions.attrs(categoryKey, categoryPosition.x, categoryPosition.y)}>`;
      body += line(
        attachX,
        spineY,
        tipX,
        outerY,
        categoryStroke,
        theme.lineWidth + 0.5,
      );
      const rowPositions = item.rows.map(row => positions.at(`fishbone/categories/${item.category.id}/${row.path.slice(row.path.indexOf('/causes/') + 1)}`,
        left + 12 + row.depth * 26 + categoryPosition.dx,
        (upper ? baseOuterY : spineY) + 35 + row.offset + row.height / 2 + categoryPosition.dy));
      item.rows.forEach((row, ri) => {
        const causeKey = `fishbone/categories/${item.category.id}/${row.path.slice(row.path.indexOf('/causes/') + 1)}`;
        const rowPosition = rowPositions[ri]!;
        body += `<g data-editor-key="${row.path}" ${positions.attrs(causeKey, rowPosition.x, rowPosition.y)}>`;
        const ry = rowPosition.y;
        const labelX = rowPosition.x;
        const lineY = ry + (row.lines.length * leading) / 2 + 6;
        positions.include(labelX - 6, ry - row.lines.length * leading / 2, Math.max(...row.lines.map(value => measure(value, size))) + 20, row.lines.length * leading + 20);
        if (row.parent < 0) {
          const ratio = Math.max(0, Math.min(1, (lineY - spineY) / (outerY - spineY || 1)));
          const boneX = attachX + (tipX - attachX) * ratio;
          const boneY = spineY + (outerY - spineY) * ratio;
          positions.include(Math.min(labelX, boneX), Math.min(lineY, boneY), Math.abs(labelX - boneX), Math.abs(lineY - boneY));
          body += line(
            labelX,
            lineY,
            boneX,
            boneY,
            theme.border,
            theme.lineWidth,
          );
        } else {
          const parentRow = item.rows[row.parent]!;
          const parentX = rowPositions[row.parent]!.x;
          const parentY =
            rowPositions[row.parent]!.y + (parentRow.lines.length * leading) / 2 + 6;
          body += `<path d="M ${parentX + 8} ${parentY} V ${lineY} H ${labelX}" fill="none" stroke="${esc(theme.border)}" stroke-width="${theme.lineWidth}"/>`;
        }
        body += `<circle cx="${labelX}" cy="${lineY}" r="${row.depth === 0 ? 3 : 2}" fill="${esc(row.depth === 0 ? categoryStroke : theme.muted)}"/>`;
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
      body += `<rect x="${tipX - categoryWidth / 2}" y="${categoryY}" width="${categoryWidth}" height="${categoryHeight}" rx="${Math.min(theme.radius, 6)}" fill="${esc(categoryPaint?.fill ?? theme.surface)}" stroke="${esc(categoryStroke)}" stroke-width="${theme.lineWidth}"/>`;
      body += text(
        tipX,
        categoryY + 12 + size + 1,
        categoryLines.join("\n"),
        theme,
        { size: size + 1, anchor: "middle", weight: 700, fill: categoryPaint?.text },
      );
      body += `</g>`;
    }
    left += colWidth + regionGap;
  }
  const headY = spineY - headHeight / 2;
  const headPosition = positions.at('fishbone/effect', headX, headY);
  positions.include(headPosition.x, headPosition.y - headHeight * 0.15, headWidth, headHeight * 1.3);
  if (headPosition.dx || headPosition.dy) body += line(classicHead ? headX + 28 : headX + headWidth * 0.15, spineY,
    (classicHead ? headX + 28 : headX + headWidth * 0.15) + headPosition.dx, spineY + headPosition.dy, theme.primary, theme.lineWidth + 2);
  body += `<g data-editor-key="effect" ${positions.attrs('fishbone/effect', headPosition.x, headPosition.y)} transform="translate(${headPosition.dx} ${headPosition.dy})">`;
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
  body += gradientDefs(categoryPaints);
  return positions.finish(theme, width, height, body);
}
