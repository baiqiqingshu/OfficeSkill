import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { parse } from "parse5";
import { readFile } from "node:fs/promises";
import { normalizeDocument } from "./document";
import { renderDiagram } from "./render";
import type { DiagramDocument, DiagramSpec, ExportOptions } from "./types";

/** Read the inert data block only. Never evaluate HTML scripts or load its resources. */
export function documentFromHtml(html: string): DiagramDocument {
  const tree = parse(html);
  type HtmlNode = typeof tree | (typeof tree.childNodes)[number];
  const blocks: string[] = [];
  function visit(node: HtmlNode): void {
    if (
      "attrs" in node &&
      node.attrs.some(
        (attribute) =>
          attribute.name === "id" && attribute.value === "diagram-data",
      )
    ) {
      if (
        node.tagName !== "script" ||
        !node.attrs.some(
          (attribute) =>
            attribute.name === "type" &&
            attribute.value.toLowerCase() === "application/json",
        )
      )
        throw new Error("#diagram-data 必须是 application/json script 数据块");
      blocks.push(
        node.childNodes
          .map((child) => ("value" in child ? child.value : ""))
          .join(""),
      );
    }
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
  }
  visit(tree);
  if (blocks.length !== 1)
    throw new Error(
      blocks.length
        ? "HTML 含有多个 #diagram-data，无法确定导出数据"
        : "HTML 缺少 #diagram-data；只能读取 UML Studio 内嵌的结构化数据",
    );
  return normalizeDocument(JSON.parse(blocks[0]!.replace(/^\uFEFF/, "")));
}
export async function readDiagramFile(path: string): Promise<DiagramDocument> {
  const source = (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
  return source.trimStart().startsWith("<")
    ? documentFromHtml(source)
    : normalizeDocument(JSON.parse(source));
}
export interface NativeExportOptions extends ExportOptions {
  fontFiles?: string[];
}
export interface NativeImage {
  data: Buffer;
  width: number;
  height: number;
  format: NonNullable<ExportOptions["format"]>;
}
const MAX_PIXELS = 40_000_000,
  MAX_DIMENSION = 32_767;
export async function renderNativeImage(
  spec: DiagramSpec,
  options: NativeExportOptions = {},
): Promise<NativeImage> {
  const format = options.format ?? "png",
    scale = options.scale ?? (format === "svg" ? 1 : 2),
    quality = options.quality ?? 0.92;
  if (!["svg", "png", "jpeg", "webp"].includes(format))
    throw new Error(`不支持的图片格式：${format}`);
  if (!Number.isFinite(scale) || scale < 0.1 || scale > 4)
    throw new Error("导出倍率必须在 0.1–4 之间");
  if (!Number.isFinite(quality) || quality < 0 || quality > 1)
    throw new Error("图片质量必须在 0–1 之间");
  const diagram = await renderDiagram(spec);
  const width = Math.max(1, Math.round(diagram.width * scale)),
    height = Math.max(1, Math.round(diagram.height * scale));
  const svg = diagram.svg
    .replace(/^(<svg\b[^>]*\bwidth=")[^"]+/, `$1${width}`)
    .replace(/^(<svg\b[^>]*\bheight=")[^"]+/, `$1${height}`);
  if (format === "svg")
    return { data: Buffer.from(svg), width, height, format };
  if (
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_PIXELS
  )
    throw new Error(
      `导出尺寸 ${width} × ${height} 超过限制，请降低倍率或使用 SVG`,
    );
  const rendered = new Resvg(svg, {
    font: {
      loadSystemFonts: true,
      fontFiles: options.fontFiles,
      defaultFontFamily:
        process.platform === "win32" ? "Microsoft YaHei" : "Noto Sans CJK SC",
      sansSerifFamily:
        process.platform === "win32" ? "Microsoft YaHei" : "Noto Sans CJK SC",
    },
    languages: ["zh-CN", "en"],
    textRendering: 1,
    ...(options.background ? { background: options.background } : {}),
  }).render();
  const png = rendered.asPng();
  if (format === "png")
    return {
      data: png,
      width: rendered.width,
      height: rendered.height,
      format,
    };
  let encoder = sharp(png, { limitInputPixels: MAX_PIXELS });
  if (format === "jpeg")
    encoder = encoder.flatten({
      background:
        options.background && options.background !== "transparent"
          ? options.background
          : "#ffffff",
    });
  const encoded = await (
    format === "jpeg"
      ? encoder.jpeg({ quality: Math.max(1, Math.round(quality * 100)) })
      : encoder.webp({ quality: Math.max(1, Math.round(quality * 100)) })
  ).toBuffer({ resolveWithObject: true });
  return {
    data: encoded.data,
    width: encoded.info.width,
    height: encoded.info.height,
    format,
  };
}
