// src/native.ts
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { parse } from "parse5";
import { readFile } from "node:fs/promises";

// src/document.ts
import Ajv2 from "ajv";

// src/types.ts
var diagramTypes = ["activity", "sequence", "swimlane", "flowchart", "usecase", "class", "state", "component", "package", "architecture", "module", "deployment", "logical", "development", "process", "physical", "scenario", "fishbone"];

// src/themes.ts
var base = {
  background: "#f1f7fb",
  surface: "#ffffff",
  text: "#193b56",
  muted: "#58758a",
  primary: "#2167a8",
  secondary: "#138e94",
  border: "#b4ccd9",
  fontFamily: "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, Arial, sans-serif",
  fontSize: 15,
  fontWeight: 400,
  fontStyle: "normal",
  textDecoration: "none",
  lineWidth: 1.6,
  radius: 8,
  nodeWidth: 180,
  nodeHeight: 68,
  gap: 64
};
var themes = {
  ocean: { ...base },
  paper: { ...base, background: "#faf8f3", text: "#253248", muted: "#667286", primary: "#b35231", secondary: "#327781", border: "#cbd2d9" },
  forest: { ...base, background: "#f4f7ef", text: "#283b31", muted: "#67765d", primary: "#3b7153", secondary: "#99713b", border: "#c3d0bc" },
  blueprint: { ...base, background: "#edf3fc", surface: "#f9fbff", text: "#183f74", muted: "#567296", primary: "#245ba3", secondary: "#557ab4", border: "#9bb7d6", radius: 0, lineWidth: 1.3 },
  midnight: { ...base, background: "#17202c", surface: "#222f40", text: "#e5ebf2", muted: "#a5b4c8", primary: "#efa47b", secondary: "#80bec3", border: "#52627a" },
  lavender: { ...base, background: "#f6f2fc", surface: "#fefcff", text: "#42345f", muted: "#7b6c94", primary: "#7954ad", secondary: "#b075a4", border: "#d1c3e5", radius: 12 },
  rose: { ...base, background: "#fff4f5", surface: "#fffdfd", text: "#653c49", muted: "#987180", primary: "#b94868", secondary: "#b57a43", border: "#e8bdc9", radius: 10 },
  amber: { ...base, background: "#fff9eb", surface: "#fffef9", text: "#62451e", muted: "#927b56", primary: "#b87513", secondary: "#737f3c", border: "#e3c994", radius: 6 },
  slate: { ...base, background: "#f3f5f7", surface: "#ffffff", text: "#293544", muted: "#687687", primary: "#50647d", secondary: "#648a97", border: "#c4cdd7", radius: 4 },
  mint: { ...base, background: "#eefbf6", surface: "#fbfffd", text: "#254e46", muted: "#60877b", primary: "#19866c", secondary: "#438fa6", border: "#b3ddcf", radius: 14 }
};
var fontPresets = [
  { label: "\u4E2D\u6587\u65E0\u886C\u7EBF", value: base.fontFamily },
  { label: "\u7CFB\u7EDF\u65E0\u886C\u7EBF", value: "Segoe UI, Microsoft YaHei, PingFang SC, Arial, sans-serif" },
  { label: "\u601D\u6E90\u9ED1\u4F53", value: "Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, sans-serif" },
  { label: "\u4E2D\u6587\u5B8B\u4F53", value: "Noto Serif CJK SC, Source Han Serif SC, SimSun, serif" },
  { label: "\u7ECF\u5178\u886C\u7EBF", value: "Georgia, Times New Roman, SimSun, serif" },
  { label: "\u7B49\u5BBD\u4EE3\u7801", value: "Cascadia Code, Consolas, Noto Sans Mono CJK SC, monospace" }
];
var colorPresets = [
  ["\u900F\u660E", "transparent"],
  ["\u7EAF\u767D", "#ffffff"],
  ["\u6696\u7EB8", "#faf8f3"],
  ["\u96FE\u84DD", "#f1f7fb"],
  ["\u8584\u8377\u767D", "#eefbf6"],
  ["\u85B0\u8863\u8349\u767D", "#f6f2fc"],
  ["\u73AB\u7470\u767D", "#fff4f5"],
  ["\u7425\u73C0\u767D", "#fff9eb"],
  ["\u58A8\u9ED1", "#202830"],
  ["\u5CA9\u7070", "#50647d"],
  ["\u94F6\u7070", "#c4cdd7"],
  ["\u5348\u591C", "#17202c"],
  ["\u6D77\u6D0B\u84DD", "#2167a8"],
  ["\u5B9D\u77F3\u84DD", "#245ba3"],
  ["\u5929\u7A7A\u84DD", "#438fa6"],
  ["\u9752\u7EFF", "#138e94"],
  ["\u8584\u8377\u7EFF", "#19866c"],
  ["\u68EE\u6797\u7EFF", "#3b7153"],
  ["\u6A44\u6984\u7EFF", "#737f3c"],
  ["\u7425\u73C0", "#b87513"],
  ["\u91D1\u9EC4", "#e5b641"],
  ["\u9676\u571F", "#b35231"],
  ["\u73CA\u745A", "#efa47b"],
  ["\u73AB\u7470", "#b94868"],
  ["\u8393\u7EA2", "#943c64"],
  ["\u85D5\u7D2B", "#b075a4"],
  ["\u85B0\u8863\u8349", "#7954ad"],
  ["\u6DF1\u7D2B", "#574287"],
  ["\u51B0\u9752", "#80bec3"],
  ["\u6D45\u7EFF", "#b3ddcf"],
  ["\u6D45\u84DD", "#b4ccd9"],
  ["\u6D45\u7D2B", "#d1c3e5"]
].map(([label2, value]) => ({ label: label2, value }));
function resolveTheme(spec) {
  return { ...themes[spec.theme ?? "ocean"], ...spec.style };
}
var layoutModes = [
  { label: "\u7D27\u51D1", value: "compact" },
  { label: "\u5747\u8861", value: "balanced" },
  { label: "\u5BBD\u677E", value: "spacious" },
  { label: "\u5206\u680F\u7F51\u683C", value: "grid" }
];
var layoutDefaults = {
  compact: { elementGap: 24, regionGap: 40, maxPerColumn: 0 },
  balanced: { elementGap: 48, regionGap: 72, maxPerColumn: 0 },
  spacious: { elementGap: 80, regionGap: 112, maxPerColumn: 0 },
  grid: { elementGap: 24, regionGap: 40, maxPerColumn: 3 }
};
function resolveLayout(spec) {
  const mode = spec.layout?.mode ?? "balanced";
  const defaults = layoutDefaults[mode];
  return {
    ...spec.layout,
    mode,
    elementGap: spec.layout?.elementGap ?? spec.style?.gap ?? defaults.elementGap,
    regionGap: spec.layout?.regionGap ?? spec.style?.gap ?? defaults.regionGap,
    maxPerColumn: spec.layout?.maxPerColumn ?? defaults.maxPerColumn
  };
}

// src/schema.ts
var str = { type: "string" };
var label = { type: "string", minLength: 1 };
var id = { type: "string", minLength: 1, pattern: "^[A-Za-z0-9_\\-:.]+$" };
var strings = { type: "array", items: str };
var object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
var array = (items, minItems = 0) => ({ type: "array", items, minItems });
var num = (minimum, maximum) => ({ type: "number", minimum, maximum });
var integer = (minimum, maximum) => ({ type: "integer", minimum, maximum });
var en = (...values) => ({ type: "string", enum: values });
var color = { type: "string", pattern: "^(transparent|#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?)$" };
var style = object({
  ...Object.fromEntries(["background", "surface", "text", "muted", "primary", "secondary", "border"].map((key) => [key, color])),
  fontFamily: { type: "string", minLength: 1, pattern: "^[^<>;{}\\\\]+$" },
  fontSize: num(8, 48),
  fontWeight: integer(100, 900),
  fontStyle: en("normal", "italic"),
  textDecoration: en("none", "underline"),
  lineWidth: num(0.5, 8),
  radius: num(0, 32),
  nodeWidth: num(80, 600),
  nodeHeight: num(32, 300),
  gap: num(24, 240)
});
var layout = object({
  mode: { ...en(...layoutModes.map((mode) => mode.value)), default: "balanced" },
  edgeCrossing: { ...en("bridge", "plain"), default: "bridge", description: "\u8282\u70B9\u56FE\u8FDE\u7EBF\u4EA4\u53C9\u8868\u793A\uFF1Abridge \u4E3A\u62F1\u6865\u5F62\u8DF3\u7EBF\uFF0Cplain \u4E3A\u65E0\u5706\u70B9\u76F4\u63A5\u4EA4\u53C9\uFF1B\u4E24\u8005\u90FD\u8868\u793A\u4E0D\u76F8\u8FDE\u3002" },
  showTitle: { type: "boolean", default: false },
  maxWidth: num(0, 1e5),
  maxHeight: num(0, 1e5),
  regionGap: num(0, 600),
  elementGap: num(8, 400),
  maxPerColumn: integer(0, 30),
  nodeMaxWidth: num(0, 1e5),
  nodeMaxHeight: num(0, 1e5)
});
var cause = object({ label, children: array({ $ref: "#/definitions/cause" }) }, ["label"]);
var specSchema = {
  ...object({
    version: { const: 1 },
    id,
    type: { type: "string", enum: diagramTypes },
    title: label,
    description: str,
    theme: en(...Object.keys(themes)),
    style,
    layout,
    direction: en("TB", "LR"),
    nodes: array(object({ id, label, kind: en("action", "decision", "start", "end", "fork", "join", "actor", "usecase", "class", "interface", "component", "package", "database", "server", "queue", "state", "note"), detail: str, stereotype: str, attributes: strings, operations: strings, group: id, lane: id, style }, ["id", "label"])),
    edges: array(object({ id, from: id, to: id, label: str, kind: en("flow", "association", "dependency", "include", "extend", "inheritance", "realization", "aggregation", "composition"), dashed: { type: "boolean" }, fromLabel: str, toLabel: str }, ["from", "to"])),
    groups: array(object({ id, label, parent: id, kind: en("boundary", "package", "node") }, ["id", "label"])),
    lanes: array(object({ id, label }, ["id", "label"])),
    participants: array(object({ id, label, kind: en("actor", "participant", "database") }, ["id", "label"])),
    messages: array(object({ from: id, to: id, label: str, kind: en("sync", "async", "return", "create", "destroy"), activate: { type: "boolean" }, deactivate: { type: "boolean" } }, ["from", "to", "label"])),
    fragments: array(object({ kind: en("alt", "opt", "loop", "par"), label: str, from: { type: "integer", minimum: 0 }, to: { type: "integer", minimum: 0 }, elseAt: { type: "integer", minimum: 0 }, elseLabel: str }, ["kind", "label", "from", "to"])),
    fishbone: object({ effect: label, categories: array(object({ id, label, causes: array({ $ref: "#/definitions/cause" }, 1) }, ["id", "label", "causes"]), 1) }, ["effect", "categories"])
  }, ["version", "type", "title"]),
  allOf: [
    { if: { properties: { type: { const: "sequence" } } }, then: { required: ["participants", "messages"], properties: { participants: { minItems: 1 }, messages: { minItems: 1 } } } },
    { if: { properties: { type: { const: "fishbone" } } }, then: { required: ["fishbone"] } },
    { if: { properties: { type: { not: { enum: ["sequence", "fishbone"] } } } }, then: { required: ["nodes"], properties: { nodes: { minItems: 1 } } } },
    { if: { properties: { type: { const: "swimlane" } } }, then: { required: ["lanes"], properties: { lanes: { minItems: 1 } } } }
  ]
};
var diagramSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://office-skill.local/uml-studio/diagram.schema.json",
  ...specSchema,
  definitions: { cause }
};
var documentSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://office-skill.local/uml-studio/document.schema.json",
  ...object({ version: { const: 1 }, title: label, diagrams: array({ $ref: "#/definitions/diagram" }, 1) }, ["version", "title", "diagrams"]),
  definitions: { cause, diagram: specSchema }
};

// src/validate.ts
import Ajv from "ajv";
var check = new Ajv({ allErrors: true, strict: false }).compile(diagramSchema);
function unique(items, name) {
  const ids = /* @__PURE__ */ new Set();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${name}\u5B58\u5728\u91CD\u590D ID\uFF1A${item.id}`);
    ids.add(item.id);
  }
  return ids;
}
function validateSpec(value) {
  if (!check(value)) throw new Error(`JSON \u6570\u636E\u65E0\u6548\uFF1A${check.errors?.map((e) => `${e.instancePath || "/"} ${e.message}${e.keyword === "additionalProperties" ? ` (${e.params.additionalProperty})` : ""}`).join("\uFF1B")}`);
  const spec = value;
  const nodes = unique(spec.nodes ?? [], "\u8282\u70B9"), groups = unique(spec.groups ?? [], "\u5206\u7EC4"), lanes = unique(spec.lanes ?? [], "\u6CF3\u9053");
  unique((spec.edges ?? []).filter((edge) => !!edge.id), "\u8FDE\u7EBF");
  for (const group of spec.groups ?? []) {
    if (nodes.has(group.id) || lanes.has(group.id)) throw new Error(`\u5206\u7EC4 ID \u4E0E\u8282\u70B9\u6216\u6CF3\u9053\u51B2\u7A81\uFF1A${group.id}`);
    const seen = /* @__PURE__ */ new Set([group.id]);
    let parent = group.parent;
    while (parent) {
      if (!groups.has(parent)) throw new Error(`\u5206\u7EC4 ${group.id} \u7684\u7236\u5206\u7EC4\u4E0D\u5B58\u5728\uFF1A${parent}`);
      if (seen.has(parent)) throw new Error(`\u5206\u7EC4\u5B58\u5728\u5FAA\u73AF\u5305\u542B\uFF1A${group.id}`);
      seen.add(parent);
      parent = spec.groups.find((g) => g.id === parent)?.parent;
    }
  }
  for (const lane of spec.lanes ?? []) if (nodes.has(lane.id)) throw new Error(`\u6CF3\u9053 ID \u4E0E\u8282\u70B9\u51B2\u7A81\uFF1A${lane.id}`);
  for (const node of spec.nodes ?? []) {
    if (node.group && !groups.has(node.group)) throw new Error(`\u8282\u70B9 ${node.id} \u7684\u5206\u7EC4\u4E0D\u5B58\u5728\uFF1A${node.group}`);
    if (node.lane && !lanes.has(node.lane)) throw new Error(`\u8282\u70B9 ${node.id} \u7684\u6CF3\u9053\u4E0D\u5B58\u5728\uFF1A${node.lane}`);
    if (node.group && node.lane) throw new Error(`\u8282\u70B9 ${node.id} \u4E0D\u80FD\u540C\u65F6\u8BBE\u7F6E group \u548C lane`);
    if (spec.type === "swimlane" && !node.lane) throw new Error(`\u6CF3\u9053\u56FE\u8282\u70B9 ${node.id} \u5FC5\u987B\u6307\u5B9A lane`);
  }
  for (const edge of spec.edges ?? []) if (!nodes.has(edge.from) || !nodes.has(edge.to)) throw new Error(`\u8FDE\u7EBF\u7AEF\u70B9\u4E0D\u5B58\u5728\uFF1A${edge.from} \u2192 ${edge.to}`);
  if (spec.type === "sequence") {
    const participants = unique(spec.participants, "\u53C2\u4E0E\u8005");
    for (const [i, m] of spec.messages.entries()) if (!participants.has(m.from) || !participants.has(m.to)) throw new Error(`\u7B2C ${i + 1} \u6761\u6D88\u606F\u5F15\u7528\u4E0D\u5B58\u5728\u7684\u53C2\u4E0E\u8005`);
    for (const f of spec.fragments ?? []) {
      if (f.from > f.to || f.to >= spec.messages.length) throw new Error(`\u7EC4\u5408\u7247\u6BB5 ${f.label} \u7684\u6D88\u606F\u8303\u56F4\u65E0\u6548`);
      if (f.elseAt !== void 0 && (f.kind !== "alt" && f.kind !== "par" || f.elseAt <= f.from || f.elseAt > f.to)) throw new Error(`\u7EC4\u5408\u7247\u6BB5 ${f.label} \u7684 elseAt \u65E0\u6548`);
    }
  }
  if (spec.fishbone) unique(spec.fishbone.categories, "\u9C7C\u9AA8\u5206\u7C7B");
  if (spec.type !== "sequence" && (spec.participants || spec.messages || spec.fragments)) throw new Error("\u53EA\u6709 sequence \u53EF\u4EE5\u4F7F\u7528 participants/messages/fragments");
  if (spec.type !== "fishbone" && spec.fishbone) throw new Error("\u53EA\u6709 fishbone \u53EF\u4EE5\u4F7F\u7528 fishbone \u6570\u636E");
  if (spec.type === "sequence" || spec.type === "fishbone") {
    if (spec.nodes || spec.edges || spec.groups || spec.lanes) throw new Error(`${spec.type} \u4E0D\u80FD\u5305\u542B\u56FE\u8282\u70B9\u3001\u8FDE\u7EBF\u6216\u5206\u7EC4\u5B57\u6BB5`);
  }
  return spec;
}

// src/document.ts
var checkDocument = new Ajv2({
  allErrors: true,
  strict: false
}).compile(documentSchema);
function validateDocument(input) {
  if (!checkDocument(input))
    throw new Error(
      `\u591A\u56FE\u6587\u6863\u65E0\u6548\uFF1A${checkDocument.errors?.map((error) => `${error.instancePath || "/"} ${error.message}`).join("\uFF1B")}`
    );
  const ids = /* @__PURE__ */ new Set();
  for (const [index, spec] of input.diagrams.entries()) {
    try {
      validateSpec(spec);
    } catch (error) {
      throw new Error(
        `\u7B2C ${index + 1} \u5F20\u56FE\uFF1A${error instanceof Error ? error.message : error}`
      );
    }
    if (spec.id) {
      if (ids.has(spec.id)) throw new Error(`\u56FE\u5F62\u5B58\u5728\u91CD\u590D ID\uFF1A${spec.id}`);
      ids.add(spec.id);
    }
  }
  return input;
}
function normalizeDocument(input) {
  if (input && typeof input === "object" && "diagrams" in input)
    return validateDocument(input);
  const spec = validateSpec(input);
  return { version: 1, title: spec.title, diagrams: [spec] };
}

// src/graph.ts
import ELK from "elkjs/lib/elk.bundled.js";

// src/svg.ts
var figureNumber = 0;
function esc(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "").replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\uFFFD").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function number(value) {
  return String(Math.round((Number.isFinite(value) ? value : 0) * 1e3) / 1e3);
}
function paint(value, fallback) {
  return /^(?:#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)|[a-z]+)$/i.test(value.trim()) ? value.trim() : fallback;
}
function text(x, y, label2, theme, options = {}) {
  const size = options.size ?? theme.fontSize;
  const anchor = options.anchor === "start" || options.anchor === "end" ? options.anchor : "middle";
  const fill = paint(options.fill ?? theme.text, "#202830");
  const lines = label2.replace(/\r\n?/g, "\n").split("\n");
  const weight = Math.max(100, Math.min(900, (options.weight ?? 400) + (theme.fontWeight - 400)));
  const spans = lines.map((line2, index) => `<tspan x="${number(x)}" dy="${index ? number(size * 1.4) : "0"}">${esc(line2)}</tspan>`).join("");
  return `<text x="${number(x)}" y="${number(y)}" fill="${esc(fill)}" font-family="${esc(theme.fontFamily)}" font-size="${number(size)}" font-weight="${number(weight)}" font-style="${theme.fontStyle === "italic" ? "italic" : "normal"}" text-decoration="${theme.textDecoration === "underline" ? "underline" : "none"}" text-anchor="${anchor}" xml:space="preserve">${spans}</text>`;
}
function frame(spec, theme, width, height, body) {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const scale = Math.min(1, spec.layout?.maxWidth ? spec.layout.maxWidth / w : 1, spec.layout?.maxHeight ? spec.layout.maxHeight / h : 1);
  const physicalWidth = w * scale, physicalHeight = h * scale;
  const prefix = `uml-figure-${++figureNumber}`;
  const summary = spec.type === "sequence" ? `${spec.title}\uFF0C\u5305\u542B ${(spec.participants ?? []).length} \u4F4D\u53C2\u4E0E\u8005\u3001${(spec.messages ?? []).length} \u6761\u6D88\u606F\u7684\u65F6\u5E8F\u56FE\u3002` : spec.type === "fishbone" ? `${spec.title}\uFF0C\u4EE5\u201C${spec.fishbone?.effect ?? spec.title}\u201D\u4E3A\u7ED3\u679C\uFF0C\u5305\u542B ${(spec.fishbone?.categories ?? []).length} \u4E2A\u539F\u56E0\u7C7B\u522B\u7684\u9C7C\u9AA8\u56FE\u3002` : `${spec.title}\uFF0C\u5305\u542B ${(spec.nodes ?? []).length} \u4E2A\u8282\u70B9\u3001${(spec.edges ?? []).length} \u6761\u5173\u7CFB\u7684 ${spec.type} \u56FE\u3002`;
  const description = spec.description || summary;
  const ids = /* @__PURE__ */ new Map();
  for (const element of body.matchAll(/<[^>]*>/g)) {
    for (const attribute of element[0].matchAll(/\sid=(["'])([^"']+)\1/g)) ids.set(attribute[2], `${prefix}-body-${attribute[2]}`);
  }
  const isolatedBody = body.replace(/<[^>]*>/g, (element) => element.replace(/(\s)id=(["'])([^"']+)\2/g, (_match, space, quote, id2) => `${space}id=${quote}${ids.get(id2)}${quote}`).replace(/(\s(?:fill|stroke|marker-start|marker-mid|marker-end|filter|clip-path|mask|style)=)(["'])([\s\S]*?)\2/g, (_match, attribute, quote, value) => {
    const references = value.replace(/url\(\s*(?:(["'])#([^"']+)\1|#([^\s)]+))\s*\)/g, (_url, _innerQuote, quotedId, bareId) => {
      const id2 = quotedId ?? bareId;
      return `url(#${ids.get(id2) ?? `${prefix}-body-${id2}`})`;
    });
    return `${attribute}${quote}${references}${quote}`;
  }).replace(/(\s(?:xlink:)?href=)(["'])#([^"']+)\2/g, (_match, attribute, quote, id2) => `${attribute}${quote}#${ids.get(id2) ?? `${prefix}-body-${id2}`}${quote}`).replace(/(\saria-(?:labelledby|describedby)=)(["'])([^"']+)\2/g, (_match, attribute, quote, references) => `${attribute}${quote}${references.split(/\s+/).map((id2) => ids.get(id2) ?? `${prefix}-body-${id2}`).join(" ")}${quote}`));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${physicalWidth}" height="${physicalHeight}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc"><title id="${prefix}-title">${esc(spec.title)}</title><desc id="${prefix}-desc">${esc(description)}</desc><rect width="${w}" height="${h}" fill="${esc(paint(theme.background, "#ffffff"))}"/>${isolatedBody}</svg>`;
  return { svg, width: physicalWidth, height: physicalHeight };
}

// src/crossings.ts
var n = (value) => String(Math.round(value * 1e3) / 1e3);
var xy = (point) => `${n(point.x)} ${n(point.y)}`;
var cross = (ax, ay, bx, by) => ax * by - ay * bx;
function crossingPaths(paths, mode, lineWidth, obstacles = []) {
  const data = paths.map((path) => path.points.map((p, i) => `${i ? "L" : "M"}${xy(p)}`).join(" "));
  const masks = paths.map(() => []);
  if (mode === "plain") return { data, masks };
  const segments = [];
  paths.forEach((path, index) => {
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1], b = path.points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length > 1e-3) segments.push({ path: index, index: i, a, b, length, ux: (b.x - a.x) / length, uy: (b.y - a.y) / length });
    }
  });
  const hits = /* @__PURE__ */ new Map();
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const lower = segments[i], upper = segments[j];
    if (paths[lower.path].owner === paths[upper.path].owner) continue;
    const denominator = cross(upper.ux, upper.uy, lower.ux, lower.uy);
    if (Math.abs(denominator) < 1e-3) continue;
    const dx = lower.a.x - upper.a.x, dy = lower.a.y - upper.a.y;
    const t = cross(dx, dy, lower.ux, lower.uy) / denominator;
    const u = cross(dx, dy, upper.ux, upper.uy) / denominator;
    if (t <= 0.01 || t >= upper.length - 0.01 || u <= 0.01 || u >= lower.length - 0.01) continue;
    const list = hits.get(upper) ?? [];
    list.push({ distance: t, under: lower.path });
    hits.set(upper, list);
  }
  const pieces = paths.map((path) => path.points.length ? [`M${xy(path.points[0])}`] : []);
  for (const segment of segments) {
    const list = (hits.get(segment) ?? []).sort((a, b) => a.distance - b.distance);
    const at = (distance) => ({ x: segment.a.x + segment.ux * distance, y: segment.a.y + segment.uy * distance });
    const radius = Math.max(6, lineWidth + 2), clusters = [];
    for (const hit of list) {
      const last = clusters.at(-1);
      if (last && hit.distance - last.at(-1).distance < radius * 2 + 2) last.push(hit);
      else clusters.push([hit]);
    }
    for (const cluster of clusters) {
      const first = cluster[0].distance, last = cluster.at(-1).distance;
      const r = Math.min(radius, first - 1, segment.length - last - 1);
      if (r < lineWidth / 2 + 1) continue;
      const begin = at(first - r), end = at(last + r), rx = (last - first) / 2 + r;
      const rotation = Math.atan2(segment.uy, segment.ux) * 180 / Math.PI;
      let arc = "";
      for (const sweep of [1, 0]) {
        const sign = sweep ? -1 : 1;
        const points = Array.from({ length: 17 }, (_, i) => {
          const angle = Math.PI * i / 16;
          const base2 = at((first + last) / 2 - rx * Math.cos(angle));
          return { x: base2.x - segment.uy * sign * r * Math.sin(angle), y: base2.y + segment.ux * sign * r * Math.sin(angle) };
        });
        const pad = lineWidth / 2 + 1;
        if (points.some((p) => obstacles.some((box) => p.x > box.x - pad && p.x < box.x + box.width + pad && p.y > box.y - pad && p.y < box.y + box.height + pad))) continue;
        arc = `A${n(rx)} ${n(r)} ${n(rotation)} 0 ${sweep} ${xy(end)}`;
        break;
      }
      if (!arc) continue;
      pieces[segment.path].push(`L${xy(begin)} ${arc}`);
      for (const under of new Set(cluster.map((hit) => hit.under))) masks[under].push(`M${xy(begin)} ${arc}`);
    }
    pieces[segment.path].push(`L${xy(segment.b)}`);
  }
  return { data: pieces.map((parts) => parts.join(" ")), masks };
}

// src/graph.ts
var graphNumber = 0;
var layoutEngine;
function numeric(value) {
  return String(Math.round(value * 1e3) / 1e3);
}
function paint2(value, fallback) {
  return /^(?:#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)|[a-z]+)$/i.test(value.trim()) ? value.trim() : fallback;
}
function cleanTheme(theme) {
  return {
    ...theme,
    background: paint2(theme.background, "#ffffff"),
    surface: paint2(theme.surface, "#ffffff"),
    text: paint2(theme.text, "#202830"),
    muted: paint2(theme.muted, "#687580"),
    primary: paint2(theme.primary, "#416e87"),
    secondary: paint2(theme.secondary, "#a4b6c0"),
    border: paint2(theme.border, "#a4b6c0")
  };
}
function measure(label2, size) {
  const lines = label2.replace(/\r\n?/g, "\n").split("\n");
  let width = 0;
  for (const line2 of lines) {
    let units = 0;
    for (const character of line2) {
      if (new RegExp("\\p{Mark}", "u").test(character)) continue;
      if (new RegExp("[\\u1100-\\u11ff\\u2e80-\\ua4cf\\uac00-\\ud7af\\uf900-\\ufaff\\ufe10-\\ufe6f\\uff01-\\uff60\\uffe0-\\uffe6]|\\p{Extended_Pictographic}", "u").test(character)) units += 1;
      else if (/[MWmw@#%&]/.test(character)) units += 1.05;
      else if (character === "	") units += 2.88;
      else units += 0.72;
    }
    width = Math.max(width, units * size);
  }
  return { width: Math.ceil(width), height: lines.length * size * 1.4, lines: lines.length };
}
function wrapNodeText(value, width, size) {
  return value.replace(/\r\n?/g, "\n").split("\n").flatMap((paragraph) => {
    const lines = [];
    let current = "";
    for (const character of paragraph) {
      if (current && measure(current + character, size).width > width) {
        lines.push(current);
        current = "";
      }
      current += character;
    }
    lines.push(current);
    return lines;
  }).join("\n");
}
function createNode(node, index, spec, base2) {
  const theme = cleanTheme({ ...base2, ...node.style });
  const sourceNode = node;
  if (spec.layout?.nodeMaxWidth) {
    const contentWidth2 = Math.max(64, spec.layout.nodeMaxWidth - 44);
    const wrap2 = (value) => wrapNodeText(value, contentWidth2, theme.fontSize);
    node = {
      ...node,
      label: wrap2(node.label),
      detail: node.detail ? wrap2(node.detail) : void 0,
      stereotype: node.stereotype ? wrap2(node.stereotype) : void 0,
      attributes: node.attributes?.map(wrap2),
      operations: node.operations?.map(wrap2)
    };
  }
  const defaults = {
    class: "class",
    state: "state",
    usecase: "usecase",
    component: "component",
    package: "package",
    architecture: "component",
    module: "component",
    deployment: "server",
    logical: "component",
    development: "component",
    physical: "server"
  };
  const kind = node.kind ?? defaults[spec.type] ?? "action";
  const size = theme.fontSize;
  const smaller = Math.max(10, size - 2);
  const label2 = measure(node.label, size);
  const detail = node.detail ? measure(node.detail, smaller) : { width: 0, height: 0 };
  const stereotype = node.stereotype || (kind === "interface" ? "interface" : "");
  const tag = stereotype ? measure(`\xAB${stereotype}\xBB`, smaller) : { width: 0, height: 0 };
  const contentWidth = Math.max(label2.width, detail.width, tag.width);
  const contentHeight = label2.height + (node.detail ? detail.height + 6 : 0) + (stereotype ? tag.height + 4 : 0);
  const attributes = (node.attributes ?? []).join("\n");
  const operations = (node.operations ?? []).join("\n");
  const attributeSize = attributes ? measure(attributes, smaller) : { width: 0, height: 0 };
  const operationSize = operations ? measure(operations, smaller) : { width: 0, height: 0 };
  let width = Math.max(theme.nodeWidth, contentWidth + 36);
  let height = Math.max(theme.nodeHeight, contentHeight + 28);
  let header = 0;
  let attributeHeight = 0;
  let operationHeight = 0;
  if (kind === "class" || kind === "interface") {
    header = label2.height + 20 + (stereotype ? tag.height + 4 : 0);
    attributeHeight = Math.max(24, attributeSize.height + 16);
    operationHeight = Math.max(24, operationSize.height + 16);
    width = Math.max(theme.nodeWidth, contentWidth + 32, attributeSize.width + 28, operationSize.width + 28);
    height = header + attributeHeight + operationHeight + (node.detail ? detail.height + 16 : 0);
  } else if (kind === "state" && node.detail) {
    header = label2.height + 20 + (stereotype ? tag.height + 4 : 0);
    height = Math.max(theme.nodeHeight, header + detail.height + 20);
  } else if (kind === "decision") {
    width = Math.max(theme.nodeWidth, contentWidth * 2 + 40);
    height = Math.max(theme.nodeHeight + 18, contentHeight * 2 + 28);
  } else if (kind === "actor") {
    width = Math.max(88, contentWidth + 24);
    height = 86 + contentHeight + 12;
  } else if (kind === "usecase") {
    width = Math.max(theme.nodeWidth, contentWidth * 1.35 + 32);
    height = Math.max(theme.nodeHeight, contentHeight * 1.6 + 24);
  } else if (kind === "start" || kind === "end") {
    width = height = 32;
  } else if (kind === "fork" || kind === "join") {
    width = spec.direction === "LR" ? 12 : Math.max(88, theme.nodeWidth * 0.6);
    height = spec.direction === "LR" ? Math.max(88, theme.nodeWidth * 0.6) : 12;
  } else if (kind === "component" || kind === "server") {
    width += 28;
    height += 14;
  } else if (kind === "database" || kind === "queue") {
    width += 16;
    height += 22;
  } else if (kind === "package") {
    height += 24;
  } else if (kind === "note") {
    width += 12;
    height += 8;
  }
  let symbol, internalCaption;
  if ((spec.layout?.nodeMaxWidth || spec.layout?.nodeMaxHeight) && ["start", "end", "fork", "join"].includes(kind)) {
    const value = [node.stereotype ? `\xAB${node.stereotype}\xBB` : "", node.label, node.detail].filter(Boolean).join("\n");
    const captionSize = Math.max(10, theme.fontSize - 2), metrics = measure(value, captionSize);
    symbol = { x: 0, y: 0, width, height };
    internalCaption = { x: spec.direction === "LR" ? 0 : width + 10, y: spec.direction === "LR" ? height + 10 : 0, width: metrics.width + 4, height: metrics.height + 4, value, size: captionSize };
    width = Math.max(width, internalCaption.x + internalCaption.width);
    height = Math.max(height, internalCaption.y + internalCaption.height);
    if (spec.direction === "LR") symbol.x = (width - symbol.width) / 2;
    else symbol.y = (height - symbol.height) / 2;
  }
  const renderWidth = Math.ceil(width / 4) * 4, renderHeight = Math.ceil(height / 4) * 4;
  const fit = Math.min(1, spec.layout?.nodeMaxWidth ? spec.layout.nodeMaxWidth / renderWidth : 1, spec.layout?.nodeMaxHeight ? spec.layout.nodeMaxHeight / renderHeight : 1);
  return { id: `n${index}`, node, sourceNode, kind, theme, width: renderWidth * fit, height: renderHeight * fit, renderWidth, renderHeight, symbol, internalCaption, header, attributes, operations, attributeHeight, operationHeight };
}
function edgeKind(edge, type) {
  return edge.kind ?? (type === "class" || type === "usecase" ? "association" : "flow");
}
function createEdge(edge, index, theme, type) {
  const id2 = `e${index}`;
  const kind = edgeKind(edge, type);
  let label2 = edge.label ?? "";
  if (kind === "include" || kind === "extend") {
    const tag = `\xAB${kind}\xBB`;
    if (!label2.includes(tag) && !label2.includes(`<<${kind}>>`)) label2 = label2 ? `${tag}
${label2}` : tag;
  }
  const labels = [];
  for (const [role, value] of [["main", label2], ["from", edge.fromLabel], ["to", edge.toLabel]]) {
    if (!value) continue;
    const size = Math.max(10, theme.fontSize - (role === "main" ? 1 : 2));
    const metrics = measure(value, size);
    labels.push({ id: `${id2}-${role}`, value, role, size, width: metrics.width + 14, height: metrics.height + 10 });
  }
  return { id: id2, edge, labels };
}
function layoutOptions(direction, padding, spec) {
  return {
    "elk.algorithm": "layered",
    "elk.direction": direction === "LR" ? "RIGHT" : "DOWN",
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.padding": padding,
    "elk.spacing.nodeNode": String(spec.layout?.elementGap ?? 24),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(spec.layout?.elementGap ?? 24),
    "elk.spacing.edgeNode": "18",
    "elk.spacing.edgeEdge": "14",
    "elk.spacing.edgeLabel": "10",
    "elk.layered.spacing.edgeNodeBetweenLayers": "20",
    "elk.layered.spacing.edgeEdgeBetweenLayers": "14",
    "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
    "elk.layered.nodePlacement.bk.edgeStraightening": "IMPROVE_STRAIGHTNESS",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    "elk.layered.nodePlacement.favorStraightEdges": "true",
    "elk.layered.mergeEdges": "false",
    "elk.separateConnectedComponents": "true",
    "elk.spacing.componentComponent": String(spec.layout?.regionGap ?? 40),
    "elk.edgeLabels.inline": "false",
    "elk.layered.edgeLabels.sideSelection": "SMART_DOWN"
  };
}
function buildGraph(rootId, refs, groups, edges, spec, theme, containers, lane, additionalGroups) {
  const direction = spec.direction ?? "TB";
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const included = /* @__PURE__ */ new Set();
  const memberships = [...refs.map((ref) => ref.node.group), ...additionalGroups ?? []];
  for (const membership of memberships) {
    let group = membership;
    while (group && groupById.has(group) && !included.has(group)) {
      included.add(group);
      group = groupById.get(group)?.parent;
    }
  }
  if (!lane) for (const group of groups) included.add(group.id);
  const root = { id: rootId, children: [], edges: [] };
  const header = lane ? direction === "TB" ? measure(lane.label, theme.fontSize).height + 24 : measure(lane.label, theme.fontSize).width + 32 : 0;
  const padding = lane ? direction === "TB" ? `[top=${header + 24},left=24,bottom=28,right=24]` : `[top=24,left=${header + 24},bottom=24,right=28]` : "[top=24,left=24,bottom=24,right=24]";
  root.layoutOptions = layoutOptions(direction, padding, spec);
  if (lane) {
    root.width = direction === "TB" ? Math.max(240, measure(lane.label, theme.fontSize).width + 36) : 260 + header;
    root.height = direction === "TB" ? 180 + header : Math.max(180, measure(lane.label, theme.fontSize).height + 28);
    root.layoutOptions["elk.nodeSize.constraints"] = "[MINIMUM_SIZE]";
    root.layoutOptions["elk.nodeSize.minimum"] = `(${root.width},${root.height})`;
    containers.set(rootId, { id: rootId, label: lane.label, originalId: lane.id, kind: "lane", header, lane: lane.id });
  }
  const groupNodes = /* @__PURE__ */ new Map();
  groups.forEach((group, index) => {
    if (!included.has(group.id)) return;
    const id2 = `${rootId}-g${index}`;
    const labelSize = measure(group.label, theme.fontSize);
    const groupHeader = labelSize.height + (group.kind === "node" ? 40 : 22);
    const width = Math.max(180, labelSize.width + 48);
    const height = groupHeader + 64;
    const options = layoutOptions(direction, `[top=${groupHeader + 20},left=24,bottom=24,right=24]`, spec);
    options["elk.nodeSize.constraints"] = "[MINIMUM_SIZE]";
    options["elk.nodeSize.minimum"] = `(${width},${height})`;
    groupNodes.set(group.id, { id: id2, width, height, layoutOptions: options, children: [] });
    containers.set(id2, { id: id2, label: group.label, kind: group.kind ?? "boundary", originalId: group.id, header: groupHeader, lane: lane?.id });
  });
  for (const group of groups) {
    const child = groupNodes.get(group.id);
    if (!child) continue;
    const parent = group.parent ? groupNodes.get(group.parent) : void 0;
    (parent?.children ?? root.children).push(child);
  }
  const nodeIds = /* @__PURE__ */ new Map();
  for (const ref of refs) {
    nodeIds.set(ref.node.id, ref.id);
    const child = { id: ref.id, width: ref.width, height: ref.height };
    if (!ref.internalCaption && ["start", "end", "fork", "join"].includes(ref.kind)) {
      const caption = [ref.node.stereotype ? `\xAB${ref.node.stereotype}\xBB` : "", ref.node.label, ref.node.detail].filter(Boolean).join("\n");
      const size = Math.max(10, ref.theme.fontSize - 2);
      const metrics = measure(caption, size);
      const placement = direction === "TB" ? "[H_RIGHT,V_CENTER,OUTSIDE]" : "[H_CENTER,V_BOTTOM,OUTSIDE]";
      child.layoutOptions = { "elk.layered.nodePlacement.favorStraightEdges": "true", "elk.spacing.labelNode": "10", "elk.nodeLabels.placement": placement };
      child.labels = [{ id: `${ref.id}-caption`, text: caption, width: metrics.width + 4, height: metrics.height + 4 }];
    }
    const parent = ref.node.group ? groupNodes.get(ref.node.group) : void 0;
    (parent?.children ?? root.children).push(child);
  }
  for (const ref of edges) {
    const source = nodeIds.get(ref.edge.from);
    const target = nodeIds.get(ref.edge.to);
    if (!source || !target) continue;
    const labels = ref.labels.map((label2) => ({
      id: label2.id,
      text: label2.value,
      width: label2.width,
      height: label2.height,
      layoutOptions: { "elk.edgeLabels.placement": label2.role === "from" ? "TAIL" : label2.role === "to" ? "HEAD" : "CENTER" }
    }));
    root.edges.push({ id: ref.id, sources: [source], targets: [target], labels });
  }
  return root;
}
async function layoutRegions(root, spec, elk, refs, columns, automaticColumns) {
  const elementGap = spec.layout?.elementGap ?? 24, regionGap = spec.layout?.regionGap ?? 40;
  const edges = root.edges ?? [];
  const outgoing = /* @__PURE__ */ new Map();
  const incoming = /* @__PURE__ */ new Set();
  for (const edge of edges) {
    const list = outgoing.get(edge.sources[0]) ?? [];
    list.push(edge);
    outgoing.set(edge.sources[0], list);
    for (const id2 of edge.targets) incoming.add(id2);
  }
  const feedback = /* @__PURE__ */ new Set(), active = /* @__PURE__ */ new Set(), visited = /* @__PURE__ */ new Set();
  function visit(id2) {
    if (visited.has(id2)) return;
    visited.add(id2);
    active.add(id2);
    for (const edge of outgoing.get(id2) ?? []) {
      if (edge.targets.some((target) => active.has(target))) feedback.add(edge.id);
      else for (const target of edge.targets) visit(target);
    }
    active.delete(id2);
  }
  const localIds = /* @__PURE__ */ new Set();
  function collect(region) {
    if (!region.children) localIds.add(region.id);
    else for (const child of region.children) collect(child);
  }
  collect(root);
  for (const id2 of localIds) if (refs.get(id2)?.kind === "start" || !incoming.has(id2)) visit(id2);
  for (const id2 of localIds) visit(id2);
  const terminal = (node) => ["start", "end"].includes(refs.get(node.id)?.kind ?? "");
  const natural = /* @__PURE__ */ new Map();
  const minimumSizes = /* @__PURE__ */ new Map();
  async function place(region, columnLimit = spec.layout?.maxPerColumn ?? 0) {
    if (!minimumSizes.has(region.id)) minimumSizes.set(region.id, { width: region.width ?? 0, height: region.height ?? 0 });
    const inset = { top: 24, left: 24, bottom: 24, right: 24 };
    for (const side of ["top", "left", "bottom", "right"]) {
      const match = region.layoutOptions?.["elk.padding"]?.match(new RegExp(`${side}=([\\d.]+)`));
      if (match) inset[side] = Number(match[1]);
    }
    const leaves = (region.children ?? []).filter((child) => !child.children && !terminal(child));
    const nested = (region.children ?? []).filter((child) => child.children);
    let content = natural.get(region.id);
    if (!content) {
      const ids = new Set(leaves.map((child) => child.id));
      const input = {
        id: `${region.id}-content`,
        children: leaves,
        edges: edges.filter((edge) => !feedback.has(edge.id) && edge.sources.every((id2) => ids.has(id2)) && edge.targets.every((id2) => ids.has(id2))),
        layoutOptions: layoutOptions(spec.direction ?? "TB", "[top=0,left=0,bottom=0,right=0]", spec)
      };
      const output = leaves.length ? await elk.layout(input) : void 0;
      content = { children: output?.children ?? [], width: output?.width ?? 0, height: output?.height ?? 0 };
      natural.set(region.id, content);
    }
    const placed = content.children.map((child) => ({ ...child }));
    let width = content.width, height = content.height;
    if (columnLimit > 0 && placed.length > columnLimit) {
      const horizontal = spec.direction === "LR";
      placed.sort((a, b) => (horizontal ? (a.x ?? 0) - (b.x ?? 0) : (a.y ?? 0) - (b.y ?? 0)) || (horizontal ? (a.y ?? 0) - (b.y ?? 0) : (a.x ?? 0) - (b.x ?? 0)));
      const columnCount = Math.ceil(placed.length / columnLimit);
      const widths = Array(columnCount).fill(0), heights = Array(columnLimit).fill(0);
      placed.forEach((child, index) => {
        const column = Math.floor(index / columnLimit), offset = index % columnLimit;
        const row = column % 2 ? columnLimit - 1 - offset : offset;
        const labelWidth = Math.max(0, ...(child.labels ?? []).map((label2) => (label2.x ?? (child.width ?? 0) + 10) + (label2.width ?? 0)));
        const labelHeight = Math.max(0, ...(child.labels ?? []).map((label2) => (label2.y ?? 0) + (label2.height ?? 0)));
        widths[column] = Math.max(widths[column], child.width ?? 0, labelWidth);
        heights[row] = Math.max(heights[row], child.height ?? 0, labelHeight);
      });
      const xs = [], ys = [];
      width = height = 0;
      const columnGap = Math.max(elementGap, ...edges.flatMap((edge) => (edge.labels ?? []).map((label2) => (label2.width ?? 0) + 16)));
      for (const size of widths) {
        xs.push(width);
        width += size + columnGap;
      }
      for (const size of heights) {
        ys.push(height);
        height += size + elementGap;
      }
      width -= columnGap;
      height -= elementGap;
      placed.forEach((child, index) => {
        const column = Math.floor(index / columnLimit), offset = index % columnLimit;
        const row = column % 2 ? columnLimit - 1 - offset : offset;
        const occupiedWidth = Math.max(child.width ?? 0, ...(child.labels ?? []).map((label2) => (label2.x ?? (child.width ?? 0) + 10) + (label2.width ?? 0)));
        const occupiedHeight = Math.max(child.height ?? 0, ...(child.labels ?? []).map((label2) => (label2.y ?? 0) + (label2.height ?? 0)));
        child.x = xs[column] + (widths[column] - occupiedWidth) / 2;
        child.y = ys[row] + (heights[row] - occupiedHeight) / 2;
        columns.set(child.id, `${region.id}-column${column}`);
      });
    } else for (const child of placed) columns.set(child.id, region.id);
    for (const child of placed) {
      child.x = (child.x ?? 0) + inset.left;
      child.y = (child.y ?? 0) + inset.top;
    }
    for (const child of nested) await place(child);
    if (automaticColumns && !columnLimit && nested.length > 1) {
      for (const child of nested) {
        const count = (child.children ?? []).filter((node) => !node.children && !terminal(node)).length;
        const peers = nested.filter((peer) => peer !== child).map((peer) => peer.height ?? 0).sort((a, b) => a - b);
        const typical = peers[Math.floor((peers.length - 1) / 2)] ?? 0;
        if (count > 6 && typical > 0 && (child.height ?? 0) > typical * 2) {
          await place(child, Math.max(3, Math.ceil(count / Math.ceil((child.height ?? 0) / typical))));
        }
      }
    }
    let right = inset.left + width, bottom = inset.top + height;
    for (const child of nested) {
      child.x = right + (right > inset.left ? regionGap : 0);
      child.y = inset.top;
      right = child.x + (child.width ?? 0);
      bottom = Math.max(bottom, child.y + (child.height ?? 0));
    }
    const terminals = (region.children ?? []).filter(terminal);
    region.children = [...placed, ...nested, ...terminals];
    region.width = Math.max(minimumSizes.get(region.id).width, right + inset.right);
    region.height = Math.max(minimumSizes.get(region.id).height, bottom + inset.bottom);
    region.edges = [];
  }
  await place(root);
  return root;
}
function collectLayout(root, refs, containerRefs) {
  const nodes = [], containers = [];
  function visit(node, parent, depth) {
    const position = { x: parent.x + (node.x ?? 0), y: parent.y + (node.y ?? 0) };
    const ref = refs.get(node.id), container = containerRefs.get(node.id);
    if (ref) {
      const label2 = node.labels?.find((candidate) => candidate.id === `${ref.id}-caption`);
      const caption = label2 ? {
        x: label2.x ?? ref.width + 10,
        y: label2.y ?? 0,
        width: label2.width ?? 0,
        height: label2.height ?? 0,
        value: label2.text ?? ref.node.label,
        size: Math.max(10, ref.theme.fontSize - 2)
      } : void 0;
      nodes.push({ ...position, width: node.width ?? ref.width, height: node.height ?? ref.height, ref, caption });
    }
    if (container) containers.push({ ...position, width: node.width ?? 200, height: node.height ?? 140, ref: container, depth });
    for (const child of node.children ?? []) visit(child, position, depth + 1);
  }
  visit(root, { x: -(root.x ?? 0), y: -(root.y ?? 0) }, 0);
  return { nodes, containers, routes: [], width: root.width ?? 240, height: root.height ?? 160 };
}
function intersects(a, b, margin = 0) {
  return a.x < b.x + b.width + margin && a.x + a.width + margin > b.x && a.y < b.y + b.height + margin && a.y + a.height + margin > b.y;
}
function obstacleRouter(start, end, obstacles, used) {
  const xs = /* @__PURE__ */ new Set([start.x, end.x]);
  const ys = /* @__PURE__ */ new Set([start.y, end.y]);
  let left = Math.min(start.x, end.x), right = Math.max(start.x, end.x);
  let top = Math.min(start.y, end.y), bottom = Math.max(start.y, end.y);
  for (const box of obstacles) {
    xs.add(box.x);
    xs.add(box.x + box.width);
    ys.add(box.y);
    ys.add(box.y + box.height);
    left = Math.min(left, box.x);
    right = Math.max(right, box.x + box.width);
    top = Math.min(top, box.y);
    bottom = Math.max(bottom, box.y + box.height);
  }
  for (const path of used) for (let index = 1; index < path.length; index++) {
    const a = path[index - 1], b = path[index];
    if (Math.abs(a.x - b.x) < 0.01) {
      xs.add(a.x - 12);
      xs.add(a.x + 12);
    } else {
      ys.add(a.y - 12);
      ys.add(a.y + 12);
    }
  }
  xs.add(left - 36);
  xs.add(right + 36);
  ys.add(top - 36);
  ys.add(bottom + 36);
  const columns = [...xs].sort((a, b) => a - b);
  const rows = [...ys].sort((a, b) => a - b);
  const columnsCount = columns.length;
  const vertexCount = columnsCount * rows.length;
  const valid = new Uint8Array(vertexCount);
  for (let row = 0; row < rows.length; row++) for (let column = 0; column < columnsCount; column++) {
    const x = columns[column], y = rows[row];
    valid[row * columnsCount + column] = obstacles.some((box) => x > box.x + 0.01 && x < box.x + box.width - 0.01 && y > box.y + 0.01 && y < box.y + box.height - 0.01) ? 0 : 1;
  }
  const startVertex = rows.indexOf(start.y) * columnsCount + columns.indexOf(start.x);
  const endVertex = rows.indexOf(end.y) * columnsCount + columns.indexOf(end.x);
  if (!valid[startVertex] || !valid[endVertex]) return void 0;
  const costs = new Float64Array(vertexCount * 3).fill(Infinity);
  const previous = new Int32Array(vertexCount * 3).fill(-1);
  const heap = [];
  function push(item) {
    heap.push(item);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = index - 1 >> 1;
      if (heap[parent].score <= item.score) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = item;
  }
  costs[startVertex * 3] = 0;
  push({ state: startVertex * 3, cost: 0, score: Math.abs(start.x - end.x) + Math.abs(start.y - end.y) });
  let finish = -1;
  while (heap.length) {
    const current = heap[0];
    const last = heap.pop();
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (last.score <= heap[child].score) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    if (current.cost !== costs[current.state]) continue;
    const vertex = Math.floor(current.state / 3);
    if (vertex === endVertex) {
      finish = current.state;
      break;
    }
    const column = vertex % columnsCount, row = Math.floor(vertex / columnsCount);
    const a = { x: columns[column], y: rows[row] };
    const neighbors = [column > 0 ? vertex - 1 : -1, column + 1 < columnsCount ? vertex + 1 : -1, row > 0 ? vertex - columnsCount : -1, row + 1 < rows.length ? vertex + columnsCount : -1];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || !valid[neighbor]) continue;
      const b = { x: columns[neighbor % columnsCount], y: rows[Math.floor(neighbor / columnsCount)] };
      const horizontal = a.y === b.y;
      const blocked = obstacles.some((box) => horizontal ? a.y > box.y + 0.01 && a.y < box.y + box.height - 0.01 && Math.max(a.x, b.x) > box.x + 0.01 && Math.min(a.x, b.x) < box.x + box.width - 0.01 : a.x > box.x + 0.01 && a.x < box.x + box.width - 0.01 && Math.max(a.y, b.y) > box.y + 0.01 && Math.min(a.y, b.y) < box.y + box.height - 0.01);
      if (blocked) continue;
      let overlap = 0, crossings = 0;
      for (const path of used) for (let index = 1; index < path.length; index++) {
        const c = path[index - 1], d = path[index];
        if (horizontal && c.y === d.y && Math.abs(a.y - c.y) < 0.1) overlap += Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
        if (!horizontal && c.x === d.x && Math.abs(a.x - c.x) < 0.1) overlap += Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
        if (horizontal !== Math.abs(c.y - d.y) < 0.01) {
          const x = horizontal ? c.x : a.x, y = horizontal ? a.y : c.y;
          if (x > Math.min(a.x, b.x, c.x, d.x) + 0.01 && x < Math.max(a.x, b.x, c.x, d.x) - 0.01 && y > Math.min(a.y, b.y, c.y, d.y) + 0.01 && y < Math.max(a.y, b.y, c.y, d.y) - 0.01) crossings++;
        }
      }
      const direction = horizontal ? 1 : 2;
      const state = neighbor * 3 + direction;
      const cost = current.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (current.state % 3 && current.state % 3 !== direction ? 28 : 0) + overlap * 8 + crossings * 80;
      if (cost >= costs[state]) continue;
      costs[state] = cost;
      previous[state] = current.state;
      push({ state, cost, score: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y) });
    }
  }
  if (finish < 0) return void 0;
  const result = [];
  for (let state = finish; state >= 0; state = previous[state]) {
    const vertex = Math.floor(state / 3);
    result.push({ x: columns[vertex % columnsCount], y: rows[Math.floor(vertex / columnsCount)] });
  }
  result.reverse();
  return simplify(result);
}
function simplify(points) {
  const result = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last.x - point.x) < 1e-3 && Math.abs(last.y - point.y) < 1e-3) continue;
    const before = result[result.length - 2];
    if (before && last && (Math.abs(before.x - last.x) < 1e-3 && Math.abs(last.x - point.x) < 1e-3 || Math.abs(before.y - last.y) < 1e-3 && Math.abs(last.y - point.y) < 1e-3)) result.pop();
    result.push({ ...point });
  }
  return result;
}
function directEndpoint(box, other) {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  if (box.ref.kind === "actor") {
    const dx2 = other.x + other.width / 2 - cx, dy2 = other.y + other.height / 2 - cy;
    if (Math.abs(dx2) < box.width / 2 && Math.abs(dy2) > box.height / 2)
      return { x: cx, y: dy2 > 0 ? box.y + box.height : box.y };
    return { x: cx + (dx2 >= 0 ? 25 : -25) * box.width / box.ref.renderWidth, y: box.y + 35 * box.height / box.ref.renderHeight };
  }
  const destination = other.ref.kind === "actor" ? directEndpoint(other, box) : { x: other.x + other.width / 2, y: other.y + other.height / 2 };
  const dx = destination.x - cx, dy = destination.y - cy;
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return { x: cx, y: cy };
  if (box.ref.kind === "usecase") {
    const rx = box.width / 2, ry = box.height / 2;
    const scale2 = 1 / Math.sqrt(dx * dx / (rx * rx) + dy * dy / (ry * ry));
    return { x: cx + dx * scale2, y: cy + dy * scale2 };
  }
  const scaleX = Math.abs(dx) < 1e-3 ? Infinity : box.width / 2 / Math.abs(dx);
  const scaleY = Math.abs(dy) < 1e-3 ? Infinity : box.height / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}
function layoutUsecases(refs, edges, spec, theme) {
  const horizontal = spec.direction !== "TB";
  const axis = horizontal ? "y" : "x", size = horizontal ? "height" : "width";
  const gap = spec.layout?.elementGap ?? 48, regionGap = spec.layout?.regionGap ?? 72;
  const nodes = refs.map((ref) => ({ x: 0, y: 0, width: ref.width, height: ref.height, ref }));
  const actors = nodes.filter((box) => box.ref.kind === "actor" && !box.ref.node.group);
  const cases = nodes.filter((box) => !actors.includes(box));
  const byId = new Map(nodes.map((box) => [box.ref.node.id, box]));
  const caseIds = new Set(cases.map((box) => box.ref.node.id));
  const relations = edges.filter((ref) => caseIds.has(ref.edge.from) && caseIds.has(ref.edge.to) && ref.edge.from !== ref.edge.to).map((ref) => edgeKind(ref.edge, "usecase") === "extend" ? [ref.edge.to, ref.edge.from] : [ref.edge.from, ref.edge.to]);
  const outgoing = new Map(cases.map((box) => [box.ref.node.id, []]));
  for (const [source, target] of relations) outgoing.get(source).push(target);
  const active = /* @__PURE__ */ new Set(), visited = /* @__PURE__ */ new Set(), ordered = [];
  const forward = [];
  function visit(id2) {
    if (visited.has(id2)) return;
    visited.add(id2);
    active.add(id2);
    for (const target of outgoing.get(id2) ?? []) if (!active.has(target)) {
      forward.push([id2, target]);
      visit(target);
    }
    active.delete(id2);
    ordered.push(id2);
  }
  for (const box of cases) visit(box.ref.node.id);
  const ranks = new Map(cases.map((box) => [box.ref.node.id, 0]));
  for (const source of ordered.reverse()) for (const [from, target] of forward)
    if (from === source) ranks.set(target, Math.max(ranks.get(target), ranks.get(source) + 1));
  const owner = /* @__PURE__ */ new Map();
  for (const [index, actor] of actors.entries()) {
    const queue = edges.flatMap((ref) => ref.edge.from === actor.ref.node.id && caseIds.has(ref.edge.to) ? [ref.edge.to] : ref.edge.to === actor.ref.node.id && caseIds.has(ref.edge.from) ? [ref.edge.from] : []);
    const distances = new Map(queue.map((id2) => [id2, 0]));
    for (let offset = 0; offset < queue.length; offset++) {
      const id2 = queue[offset], distance = distances.get(id2);
      const priority = distance * actors.length + index;
      if (priority < (owner.get(id2) ?? Infinity)) owner.set(id2, priority);
      for (const [source, target] of relations) {
        const neighbor = source === id2 ? target : target === id2 ? source : void 0;
        if (neighbor && !distances.has(neighbor)) {
          distances.set(neighbor, distance + 1);
          queue.push(neighbor);
        }
      }
    }
  }
  const buckets = [];
  const containers = [];
  const groups = spec.groups ?? [];
  function region(id2, depth) {
    const group = groups.find((candidate) => candidate.id === id2);
    const header = group ? measure(group.label, theme.fontSize).height + (group.kind === "node" ? 40 : 22) : 0;
    const padding = group ? 28 : 0, top = group ? header + 24 : 0;
    const leaves = cases.filter((box) => box.ref.node.group === id2);
    const layers = [...new Set(leaves.map((box) => ranks.get(box.ref.node.id)))].sort((first, second) => first - second).map((rank) => leaves.filter((box) => ranks.get(box.ref.node.id) === rank).sort((first, second) => {
      const firstOwner = owner.get(first.ref.node.id), secondOwner = owner.get(second.ref.node.id);
      return (firstOwner === void 0 ? actors.length : firstOwner % Math.max(1, actors.length)) - (secondOwner === void 0 ? actors.length : secondOwner % Math.max(1, actors.length));
    })).flatMap((layer) => {
      const limit = spec.layout?.maxPerColumn ?? 0;
      return limit > 0 ? Array.from({ length: Math.ceil(layer.length / limit) }, (_, index) => layer.slice(index * limit, (index + 1) * limit)) : [layer];
    });
    const rows = Math.max(0, ...layers.map((layer) => layer.length));
    const rowSize = Math.max(1, ...leaves.map((box) => box[size]));
    const rowGap = Math.max(gap, ...edges.flatMap((ref) => ref.labels.map((label2) => (horizontal ? label2.height : label2.width) + 16)));
    const fan = Math.max(1, ...leaves.map((box) => relations.filter(([source, target]) => source === box.ref.node.id || target === box.ref.node.id).length));
    const layerGap = Math.max(regionGap, ...edges.flatMap((ref) => ref.labels.map((label2) => (horizontal ? label2.width : label2.height) + 24 + Math.max(0, fan - 2) * 32)));
    const grids = [];
    let extent = 0;
    for (const layer of layers) {
      const alongSize = Math.max(...layer.map((box) => horizontal ? box.width : box.height));
      const slots = Array.from({ length: rows }, (_, index) => (horizontal ? top : padding) + rowSize / 2 + index * (rowSize + rowGap));
      for (const [index, box] of layer.entries()) {
        box[axis] = slots[index + Math.floor((rows - layer.length) / 2)] - box[size] / 2;
        if (horizontal) box.x = padding + extent + (alongSize - box.width) / 2;
        else box.y = top + extent + (alongSize - box.height) / 2;
      }
      grids.push({ boxes: layer, slots });
      extent += alongSize + layerGap;
    }
    const across = rows ? rows * rowSize + (rows - 1) * rowGap : 0;
    let width = padding * 2 + (horizontal ? Math.max(0, extent - layerGap) : across);
    let height = top + padding + (horizontal ? across : Math.max(0, extent - layerGap));
    const members = [...leaves], regions = [];
    for (const child of groups.filter((candidate) => candidate.parent === id2)) {
      const placed2 = region(child.id, depth + 1);
      const dx = Math.max(padding, width - padding + (members.length || regions.length ? regionGap : 0)), dy = top;
      for (const box of placed2.members) {
        box.x += dx;
        box.y += dy;
      }
      for (const box of placed2.regions) {
        box.x += dx;
        box.y += dy;
      }
      for (const grid of placed2.grids) grid.slots = grid.slots.map((slot) => slot + (horizontal ? dy : dx));
      members.push(...placed2.members);
      regions.push(...placed2.regions);
      grids.push(...placed2.grids);
      width = dx + placed2.width + padding;
      height = Math.max(height, dy + placed2.height + padding);
    }
    if (group) {
      width = Math.max(width, measure(group.label, theme.fontSize).width + 56, 180);
      height = Math.max(height, header + 88);
      regions.push({ x: 0, y: 0, width, height, depth, ref: { id: `usecase-${group.id}`, originalId: group.id, label: group.label, kind: group.kind ?? "boundary", header } });
    }
    return { width, height, members, regions, grids };
  }
  const placed = region(void 0, 0);
  containers.push(...placed.regions);
  buckets.push(...placed.grids);
  const minAlong = Math.min(0, ...cases.map((box) => horizontal ? box.x : box.y), ...containers.map((box) => horizontal ? box.x : box.y));
  const maxAlong = Math.max(180, ...cases.map((box) => horizontal ? box.x + box.width : box.y + box.height), ...containers.map((box) => horizontal ? box.x + box.width : box.y + box.height));
  const related = (actor) => edges.flatMap((ref) => ref.edge.from === actor.ref.node.id ? [byId.get(ref.edge.to)] : ref.edge.to === actor.ref.node.id ? [byId.get(ref.edge.from)] : []).filter((box) => box !== actor);
  const arm = (box) => horizontal ? 35 * box.height / box.ref.renderHeight : box.width / 2;
  const center = (box) => box[axis] + box[size] / 2;
  const positionActor = (actor, cross2, far) => {
    actor[axis] = cross2 - arm(actor);
    if (horizontal) actor.x = far ? maxAlong + regionGap : minAlong - regionGap - actor.width;
    else actor.y = far ? maxAlong + regionGap : minAlong - regionGap - actor.height;
  };
  const positioned = [];
  for (const [index, actor] of actors.entries()) {
    const targets = related(actor).filter((box) => caseIds.has(box.ref.node.id));
    const mean = targets.length ? targets.reduce((sum, box) => sum + center(box), 0) / targets.length : index * (actor[size] + gap);
    positionActor(actor, mean, false);
    while (positioned.some((box) => intersects(box, actor, 16))) actor[axis] += actor[size] + gap;
    positioned.push(actor);
  }
  const segments = edges.filter((ref) => ref.edge.from !== ref.edge.to).map((ref) => ({ ref, source: byId.get(ref.edge.from), target: byId.get(ref.edge.to) }));
  function score() {
    let cost = 0;
    const lines = segments.map((segment) => ({ ...segment, start: directEndpoint(segment.source, segment.target), end: directEndpoint(segment.target, segment.source) }));
    for (const line2 of lines) {
      const dx = line2.end.x - line2.start.x, dy = line2.end.y - line2.start.y;
      cost += Math.hypot(dx, dy) / 40 * (edgeKind(line2.ref.edge, "usecase") === "include" ? 1.25 : 1);
      for (const box of nodes) {
        if (box === line2.source || box === line2.target) continue;
        let hit;
        if (box.ref.kind === "usecase") {
          const rx = box.width / 2 + 5, ry = box.height / 2 + 5;
          const startX = (line2.start.x - box.x - box.width / 2) / rx, startY = (line2.start.y - box.y - box.height / 2) / ry;
          const unitX = dx / rx, unitY = dy / ry, squared = unitX * unitX + unitY * unitY;
          const fraction = squared ? Math.max(0, Math.min(1, -(startX * unitX + startY * unitY) / squared)) : 0;
          hit = Math.hypot(startX + unitX * fraction, startY + unitY * fraction) < 1;
        } else hit = segmentIntersectsRect(line2.start, line2.end, box, 4);
        if (hit) cost += 1e6;
      }
    }
    for (let index = 0; index < lines.length; index++) for (const other of lines.slice(index + 1)) {
      const line2 = lines[index];
      const turn = (first, last, point) => (last.x - first.x) * (point.y - first.y) - (last.y - first.y) * (point.x - first.x);
      if (turn(line2.start, line2.end, other.start) * turn(line2.start, line2.end, other.end) < -0.01 && turn(other.start, other.end, line2.start) * turn(other.start, other.end, line2.end) < -0.01) cost += 1e4;
    }
    return cost;
  }
  let best = score();
  for (let pass = 0; pass < 6; pass++) {
    const before = best;
    for (const grid of buckets) for (const box of grid.boxes) {
      const previous = box[axis];
      let chosen = previous, swapped;
      for (const slot of grid.slots) {
        const other = grid.boxes.find((candidate2) => candidate2 !== box && Math.abs(center(candidate2) - slot) < 0.01);
        const otherPosition = other?.[axis];
        box[axis] = slot - box[size] / 2;
        if (other) other[axis] = previous + box[size] / 2 - other[size] / 2;
        const candidate = score();
        if (candidate < best - 0.01) {
          best = candidate;
          chosen = box[axis];
          swapped = other;
        }
        box[axis] = previous;
        if (other) other[axis] = otherPosition;
      }
      box[axis] = chosen;
      if (swapped) swapped[axis] = previous + box[size] / 2 - swapped[size] / 2;
    }
    for (const actor of actors) {
      const previous = { x: actor.x, y: actor.y };
      let chosen = previous;
      const targets = related(actor), positions = targets.map((box) => box.ref.kind === "actor" ? box[axis] + arm(box) : center(box));
      if (positions.length) positions.push(positions.reduce((sum, value) => sum + value, 0) / positions.length);
      const lower = Math.min(0, ...cases.map(center)), upper = Math.max(placed.height, placed.width, ...cases.map(center));
      const step = Math.max(actor[size] / 2 + 8, gap);
      for (let value = lower; value <= upper && positions.length < 80; value += step) positions.push(value);
      for (const cross2 of positions) for (const far of [false, true]) {
        positionActor(actor, cross2, far);
        if (actors.some((other) => other !== actor && intersects(actor, other, 16))) continue;
        const candidate = score();
        if (candidate < best - 0.01) {
          best = candidate;
          chosen = { x: actor.x, y: actor.y };
        }
      }
      Object.assign(actor, chosen);
    }
    if (before - best < 0.01) break;
  }
  return { nodes, containers, routes: [], width: placed.width, height: placed.height };
}
function routeEdges(edges, result, direction, theme, type) {
  const byId = new Map(result.nodes.map((box) => [box.ref.node.id, box]));
  const clearance = Math.min(12, theme.gap / 4);
  const obstacles = result.nodes.map((box) => ({ x: box.x - clearance, y: box.y - clearance, width: box.width + clearance * 2, height: box.height + clearance * 2 }));
  for (const box of result.nodes) if (box.caption) obstacles.push({ x: box.x + box.caption.x - 2, y: box.y + box.caption.y - 2, width: box.caption.width + 4, height: box.caption.height + 4 });
  for (const box of result.containers) {
    if (box.ref.kind === "lane" && direction === "LR") obstacles.push({ x: box.x + 3, y: box.y + 3, width: box.ref.header - 3, height: box.height - 6 });
    else obstacles.push({ x: box.x + 3, y: box.y + 3, width: box.width - 6, height: box.ref.header - 3 });
  }
  const counts = /* @__PURE__ */ new Map();
  const assignments = edges.map((ref) => {
    const source = byId.get(ref.edge.from);
    const target = byId.get(ref.edge.to);
    const sourceX = source.x + source.width / 2, sourceY = source.y + source.height / 2;
    const targetX = target.x + target.width / 2, targetY = target.y + target.height / 2;
    const forward = direction === "TB" ? targetY > sourceY : targetX > sourceX;
    const side = source === target ? "right" : forward && target.ref.kind === "end" ? direction === "TB" ? "bottom" : "right" : Math.abs(targetX - sourceX) > Math.abs(targetY - sourceY) ? sourceX < targetX ? "right" : "left" : sourceY < targetY ? "bottom" : "top";
    const targetSide = source === target ? "top" : target.ref.kind === "end" ? direction === "TB" ? "top" : "left" : side === "right" ? "left" : side === "left" ? "right" : side === "bottom" ? "top" : "bottom";
    const sourceKey = `${source.ref.id}-${side}`, targetKey = `${target.ref.id}-${targetSide}`;
    counts.set(sourceKey, (counts.get(sourceKey) ?? 0) + 1);
    counts.set(targetKey, (counts.get(targetKey) ?? 0) + 1);
    return { ref, source, target, side, targetSide, sourceKey, targetKey };
  });
  const seen = /* @__PURE__ */ new Map();
  const used = result.routes.flatMap((route) => route.paths);
  for (const item of assignments) {
    if (type === "usecase" && item.source !== item.target) {
      const route2 = [directEndpoint(item.source, item.target), directEndpoint(item.target, item.source)];
      result.routes.push({ ref: item.ref, paths: [route2] });
      used.push(route2);
      continue;
    }
    const sourceIndex = (seen.get(item.sourceKey) ?? 0) + 1, targetIndex = (seen.get(item.targetKey) ?? 0) + 1;
    seen.set(item.sourceKey, sourceIndex);
    seen.set(item.targetKey, targetIndex);
    const sameRow = Math.abs(item.source.y + item.source.height / 2 - item.target.y - item.target.height / 2) < 0.01;
    const sameColumn = Math.abs(item.source.x + item.source.width / 2 - item.target.x - item.target.width / 2) < 0.01;
    const straight = item.source !== item.target && (sameRow || sameColumn);
    const sourceFraction = 0.5;
    const targetFraction = straight ? 0.5 : targetIndex / ((counts.get(item.targetKey) ?? 1) + 1);
    const sides = [item.side, ...["left", "right", "top", "bottom"].filter((side) => side !== item.side)];
    const targetSides = [item.targetSide, ...["left", "right", "top", "bottom"].filter((side) => side !== item.targetSide)];
    let route, bestScore = Infinity;
    for (const side of sides) {
      for (const targetSide of targetSides) {
        if (item.source === item.target && side === targetSide) continue;
        const endpoints = [[item.source, side, sourceFraction], [item.target, targetSide, targetFraction]];
        const anchors = endpoints.map(([box, attach, fraction]) => {
          const symbol = box.ref.symbol;
          const bounds = symbol ? {
            x: box.x + symbol.x * box.width / box.ref.renderWidth,
            y: box.y + symbol.y * box.height / box.ref.renderHeight,
            width: symbol.width * box.width / box.ref.renderWidth,
            height: symbol.height * box.height / box.ref.renderHeight
          } : box;
          const x = attach === "left" ? bounds.x : attach === "right" ? bounds.x + bounds.width : bounds.x + bounds.width * fraction;
          const y = attach === "top" ? bounds.y : attach === "bottom" ? bounds.y + bounds.height : bounds.y + bounds.height * fraction;
          const distance = Math.max(clearance + 1, Math.min(28, theme.gap / 2));
          const stub = {
            x: attach === "right" ? box.x + box.width + distance : attach === "left" ? box.x - distance : x,
            y: attach === "bottom" ? box.y + box.height + distance : attach === "top" ? box.y - distance : y
          };
          return { port: { x, y }, stub };
        });
        const clear = anchors.every((anchor, index) => {
          const box = index ? item.target : item.source;
          return !obstacles.some((obstacle) => {
            if (Math.abs(obstacle.x - (box.x - clearance)) < 0.01 && Math.abs(obstacle.y - (box.y - clearance)) < 0.01) return false;
            return anchor.port.y === anchor.stub.y ? anchor.port.y > obstacle.y && anchor.port.y < obstacle.y + obstacle.height && Math.max(anchor.port.x, anchor.stub.x) > obstacle.x && Math.min(anchor.port.x, anchor.stub.x) < obstacle.x + obstacle.width : anchor.port.x > obstacle.x && anchor.port.x < obstacle.x + obstacle.width && Math.max(anchor.port.y, anchor.stub.y) > obstacle.y && Math.min(anchor.port.y, anchor.stub.y) < obstacle.y + obstacle.height;
          });
        });
        if (!clear) continue;
        const middle = obstacleRouter(anchors[0].stub, anchors[1].stub, obstacles, used);
        if (!middle) continue;
        const candidate = simplify([anchors[0].port, ...middle, anchors[1].port]);
        let length = 0, overlaps = 0, crossings = 0;
        for (let i = 1; i < candidate.length; i++) {
          const a = candidate[i - 1], b = candidate[i], horizontal = Math.abs(a.y - b.y) < 0.01;
          length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
          for (const path of used) for (let j = 1; j < path.length; j++) {
            const c = path[j - 1], d = path[j], otherHorizontal = Math.abs(c.y - d.y) < 0.01;
            if (horizontal && otherHorizontal && Math.abs(a.y - c.y) < 0.01) overlaps += Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
            else if (!horizontal && !otherHorizontal && Math.abs(a.x - c.x) < 0.01) overlaps += Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
            else if (horizontal !== otherHorizontal) {
              const x = horizontal ? c.x : a.x, y = horizontal ? a.y : c.y;
              if (x > Math.min(a.x, b.x, c.x, d.x) + 0.01 && x < Math.max(a.x, b.x, c.x, d.x) - 0.01 && y > Math.min(a.y, b.y, c.y, d.y) + 0.01 && y < Math.max(a.y, b.y, c.y, d.y) - 0.01) crossings++;
            }
          }
        }
        const sourceFanout = assignments.filter((candidate2) => candidate2.source === item.source && candidate2.side === item.side).length;
        const targetFanin = assignments.filter((candidate2) => candidate2.target === item.target && candidate2.targetSide === item.targetSide).length;
        const score = length + Math.max(0, candidate.length - 2) * 28 + overlaps * 8 + crossings * 80 + (side === item.side ? 0 : sourceFanout > 1 ? 240 : 32) + (targetSide === item.targetSide ? 0 : targetFanin > 1 ? 160 : 32) + (item.target.ref.kind === "end" && targetSide !== item.targetSide ? 200 : 0);
        if (score < bestScore) {
          bestScore = score;
          route = candidate;
        }
      }
    }
    if (!route) throw new Error(`Unable to route relationship ${item.ref.edge.from} \u2192 ${item.ref.edge.to}.`);
    used.push(route);
    result.routes.push({ ref: item.ref, paths: [route] });
  }
}
function clipEndpoint(point, neighbor, box) {
  if (box.width !== box.ref.renderWidth || box.height !== box.ref.renderHeight) {
    const scaleX = box.width / box.ref.renderWidth, scaleY = box.height / box.ref.renderHeight;
    const local = { x: (point.x - box.x) / scaleX, y: (point.y - box.y) / scaleY };
    const localNeighbor = { x: (neighbor.x - box.x) / scaleX, y: (neighbor.y - box.y) / scaleY };
    clipEndpoint(local, localNeighbor, { ...box, x: 0, y: 0, width: box.ref.renderWidth, height: box.ref.renderHeight });
    point.x = box.x + local.x * scaleX;
    point.y = box.y + local.y * scaleY;
    neighbor.x = box.x + localNeighbor.x * scaleX;
    neighbor.y = box.y + localNeighbor.y * scaleY;
    return;
  }
  if (box.ref.symbol) {
    const symbol = box.ref.symbol;
    if (Math.abs(point.y - neighbor.y) < 0.01) point.y = neighbor.y = box.y + symbol.y + symbol.height / 2;
    else point.x = neighbor.x = box.x + symbol.x + symbol.width / 2;
    clipEndpoint(point, neighbor, { ...box, x: box.x + symbol.x, y: box.y + symbol.y, width: symbol.width, height: symbol.height, ref: { ...box.ref, symbol: void 0, renderWidth: symbol.width, renderHeight: symbol.height } });
    return;
  }
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const rx = box.width / 2, ry = box.height / 2;
  const horizontal = Math.abs(point.y - neighbor.y) < 0.01;
  const kind = box.ref.kind;
  if (kind === "usecase" || kind === "start" || kind === "end") {
    if (horizontal) point.x = cx + (neighbor.x < cx ? -1 : 1) * rx * Math.sqrt(Math.max(0, 1 - ((point.y - cy) / ry) ** 2));
    else point.y = cy + (neighbor.y < cy ? -1 : 1) * ry * Math.sqrt(Math.max(0, 1 - ((point.x - cx) / rx) ** 2));
  } else if (kind === "decision") {
    if (horizontal) point.x = cx + (neighbor.x < cx ? -1 : 1) * rx * Math.max(0, 1 - Math.abs(point.y - cy) / ry);
    else point.y = cy + (neighbor.y < cy ? -1 : 1) * ry * Math.max(0, 1 - Math.abs(point.x - cx) / rx);
  } else if (kind === "actor" && horizontal) {
    const localY = point.y - box.y;
    let halfWidth = box.width / 2 - 12;
    if (localY <= 24) halfWidth = 11 * Math.sqrt(Math.max(0, 1 - ((localY - 13) / 11) ** 2));
    else if (Math.abs(localY - 35) < 1) halfWidth = 25;
    else if (localY <= 54) halfWidth = 0;
    else if (localY <= 78) halfWidth = (localY - 54) * 21 / 24;
    point.x = cx + (neighbor.x < cx ? -1 : 1) * halfWidth;
  } else if (kind === "actor" && neighbor.y < box.y && Math.abs(point.x - cx) <= 11) {
    point.y = box.y + 13 - 11 * Math.sqrt(Math.max(0, 1 - ((point.x - cx) / 11) ** 2));
  } else if (kind === "database" && !horizontal) {
    point.y = neighbor.y < cy ? box.y + 10 - 10 * Math.sqrt(Math.max(0, 1 - ((point.x - cx) / rx) ** 2)) : box.y + box.height - 10 + 10 * Math.sqrt(Math.max(0, 1 - ((point.x - cx) / rx) ** 2));
  }
}
function markerDefinitions(prefix, theme) {
  const stroke = esc(theme.primary), background = esc(theme.background === "transparent" ? theme.surface : theme.background), solid = esc(theme.primary);
  return `<defs><marker id="${prefix}-arrow" viewBox="-1 -1 14 14" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1 L11 6 L1 11 Z" fill="${stroke}"/></marker><marker id="${prefix}-open" viewBox="-1 -1 14 14" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1 L11 6 L1 11" fill="none" stroke="${stroke}" stroke-width="1.6"/></marker><marker id="${prefix}-triangle" viewBox="-2 -2 18 16" refX="13" refY="6" markerWidth="18" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 0 L13 6 L1 12 Z" fill="${background}" stroke="${stroke}" stroke-width="1.5"/></marker><marker id="${prefix}-aggregation" viewBox="-2 -2 24 16" refX="0" refY="6" markerWidth="24" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 6 L10 0 L20 6 L10 12 Z" fill="${background}" stroke="${stroke}" stroke-width="1.5"/></marker><marker id="${prefix}-composition" viewBox="-2 -2 24 16" refX="0" refY="6" markerWidth="24" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 6 L10 0 L20 6 L10 12 Z" fill="${solid}" stroke="${solid}" stroke-width="1.5"/></marker></defs>`;
}
function renderContainer(box, theme, direction) {
  const { x, y, width: w, height: h, ref } = box;
  const border = esc(theme.border), surface = esc(theme.surface), primary = esc(theme.primary);
  let shape = "";
  let labelX = x + 16, labelY = y + theme.fontSize + 10;
  if (ref.kind === "lane") {
    shape = `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(h)}" fill="${surface}" stroke="${border}" stroke-width="${numeric(theme.lineWidth)}"/>`;
    if (direction === "TB") shape += `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(ref.header)}" fill="${primary}" fill-opacity="0.08"/><path d="M${numeric(x)} ${numeric(y + ref.header)} H${numeric(x + w)}" stroke="${border}"/>`;
    else shape += `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(ref.header)}" height="${numeric(h)}" fill="${primary}" fill-opacity="0.08"/><path d="M${numeric(x + ref.header)} ${numeric(y)} V${numeric(y + h)}" stroke="${border}"/>`;
  } else if (ref.kind === "package") {
    const tabWidth = Math.min(w - 24, Math.max(80, measure(ref.label, theme.fontSize).width + 32));
    const tabHeight = ref.header;
    shape = `<path d="M${numeric(x)} ${numeric(y + h)} V${numeric(y)} H${numeric(x + tabWidth)} V${numeric(y + tabHeight)} H${numeric(x + w)} V${numeric(y + h)} Z" fill="${surface}" stroke="${border}" stroke-width="${numeric(theme.lineWidth)}"/><path d="M${numeric(x)} ${numeric(y + tabHeight)} H${numeric(x + tabWidth)}" stroke="${border}"/>`;
  } else if (ref.kind === "node") {
    shape = `<path d="M${numeric(x)} ${numeric(y + 10)} L${numeric(x + 12)} ${numeric(y)} H${numeric(x + w)} V${numeric(y + h - 10)} L${numeric(x + w - 12)} ${numeric(y + h)} H${numeric(x)} Z" fill="${surface}" stroke="${border}" stroke-width="${numeric(theme.lineWidth)}"/><path d="M${numeric(x)} ${numeric(y + 10)} H${numeric(x + w - 12)} L${numeric(x + w)} ${numeric(y)} M${numeric(x + w - 12)} ${numeric(y + 10)} V${numeric(y + h)}" fill="none" stroke="${border}"/>`;
    shape += text(labelX, y + 26, "\xABnode\xBB", theme, { size: Math.max(10, theme.fontSize - 3), anchor: "start", fill: theme.muted });
    labelY = y + 28 + theme.fontSize;
  } else {
    shape = `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(h)}" rx="${numeric(theme.radius)}" fill="${surface}" stroke="${border}" stroke-width="${numeric(theme.lineWidth)}" stroke-dasharray="7 5"/>`;
  }
  return `<g class="uml-container uml-${ref.kind}" data-${ref.kind === "lane" ? "lane" : "group"}-id="${esc(ref.originalId)}"${ref.lane && ref.kind !== "lane" ? ` data-lane-id="${esc(ref.lane)}"` : ""}><title>${esc(ref.label)}</title>${shape}${text(labelX, labelY, ref.label, theme, { anchor: "start", weight: 650 })}</g>`;
}
function centeredContent(ref, x, y, width, height) {
  const { node, theme, kind } = ref;
  const small = Math.max(10, theme.fontSize - 2);
  const stereotype = node.stereotype || (kind === "interface" ? "interface" : "");
  const tagHeight = stereotype ? measure(stereotype, small).height + 4 : 0;
  const labelHeight = measure(node.label, theme.fontSize).height;
  const detailHeight = node.detail ? measure(node.detail, small).height + 6 : 0;
  let top = y + (height - tagHeight - labelHeight - detailHeight) / 2;
  let value = "";
  if (stereotype) {
    value += text(x + width / 2, top + small, `\xAB${stereotype}\xBB`, theme, { size: small, fill: theme.primary });
    top += tagHeight;
  }
  value += text(x + width / 2, top + theme.fontSize, node.label, theme, { weight: 600 });
  if (node.detail) value += text(x + width / 2, top + labelHeight + 6 + small, node.detail, theme, { size: small, fill: theme.muted });
  return value;
}
function renderNode(box, spec) {
  const { x, y, width: w, height: h, ref } = box;
  const { theme, kind, node } = ref;
  if (w !== ref.renderWidth || h !== ref.renderHeight) {
    const scaleX = w / ref.renderWidth, scaleY = h / ref.renderHeight;
    const virtual = { ...box, x: 0, y: 0, width: ref.renderWidth, height: ref.renderHeight, caption: void 0 };
    const caption = box.caption ? text(x + box.caption.x + box.caption.width / 2, y + box.caption.y + 2 + box.caption.size, box.caption.value, theme, { size: box.caption.size, fill: theme.muted }) : "";
    return `<g transform="translate(${numeric(x)} ${numeric(y)}) scale(${scaleX} ${scaleY})">${renderNode(virtual, spec)}</g>${caption}`;
  }
  const stroke = esc(node.style?.primary && !node.style.border ? theme.primary : theme.border), surface = esc(theme.surface), ink = esc(theme.primary);
  const common = `fill="${surface}" stroke="${stroke}" stroke-width="${numeric(theme.lineWidth)}"`;
  const rect = `<rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(w)}" height="${numeric(h)}"`;
  let shape = "", content = "";
  const symbol = ref.symbol ?? { x: 0, y: 0, width: w, height: h };
  const symbolX = x + symbol.x, symbolY = y + symbol.y;
  if (kind === "start" || kind === "end") {
    shape = `<circle cx="${numeric(symbolX + symbol.width / 2)}" cy="${numeric(symbolY + symbol.height / 2)}" r="${numeric(symbol.width / 2 - theme.lineWidth / 2)}" fill="${kind === "start" ? ink : surface}" stroke="${ink}" stroke-width="${numeric(theme.lineWidth)}"/>`;
    if (kind === "end") shape += `<circle cx="${numeric(symbolX + symbol.width / 2)}" cy="${numeric(symbolY + symbol.height / 2)}" r="${numeric(symbol.width / 2 - 6)}" fill="${ink}"/>`;
  } else if (kind === "fork" || kind === "join") {
    shape = `<rect x="${numeric(symbolX)}" y="${numeric(symbolY)}" width="${numeric(symbol.width)}" height="${numeric(symbol.height)}" rx="2" fill="${ink}"/>`;
  } else if (kind === "decision") {
    shape = `<path d="M${numeric(x + w / 2)} ${numeric(y)} L${numeric(x + w)} ${numeric(y + h / 2)} L${numeric(x + w / 2)} ${numeric(y + h)} L${numeric(x)} ${numeric(y + h / 2)} Z" ${common}/>`;
    content = centeredContent(ref, x + w * 0.16, y + h * 0.16, w * 0.68, h * 0.68);
  } else if (kind === "usecase") {
    shape = `<ellipse cx="${numeric(x + w / 2)}" cy="${numeric(y + h / 2)}" rx="${numeric(w / 2)}" ry="${numeric(h / 2)}" ${common}/>`;
    content = centeredContent(ref, x, y, w, h);
  } else if (kind === "actor") {
    const cx = x + w / 2;
    shape = `<g fill="none" stroke="${ink}" stroke-width="${numeric(Math.max(1.5, theme.lineWidth))}" stroke-linecap="round"><circle cx="${numeric(cx)}" cy="${numeric(y + 13)}" r="11" fill="${surface}"/><path d="M${numeric(cx)} ${numeric(y + 24)} V${numeric(y + 54)} M${numeric(cx - 25)} ${numeric(y + 35)} H${numeric(cx + 25)} M${numeric(cx)} ${numeric(y + 54)} L${numeric(cx - 21)} ${numeric(y + 78)} M${numeric(cx)} ${numeric(y + 54)} L${numeric(cx + 21)} ${numeric(y + 78)}"/></g>`;
    content = centeredContent(ref, x, y + 88, w, h - 88);
  } else if (kind === "class" || kind === "interface") {
    shape = `${rect} ${common}/>`;
    shape += `<rect x="${numeric(x + theme.lineWidth)}" y="${numeric(y + theme.lineWidth)}" width="${numeric(w - theme.lineWidth * 2)}" height="${numeric(ref.header - theme.lineWidth)}" fill="${esc(theme.secondary)}" fill-opacity="0.14"/>`;
    const second = y + ref.header + ref.attributeHeight;
    shape += `<path d="M${numeric(x)} ${numeric(y + ref.header)} H${numeric(x + w)} M${numeric(x)} ${numeric(second)} H${numeric(x + w)}${node.detail ? ` M${numeric(x)} ${numeric(second + ref.operationHeight)} H${numeric(x + w)}` : ""}" stroke="${stroke}" stroke-width="${numeric(theme.lineWidth)}"/>`;
    const titleRef = { ...ref, node: { ...node, detail: void 0 } };
    content = centeredContent(titleRef, x, y, w, ref.header);
    const size = Math.max(10, theme.fontSize - 2);
    if (ref.attributes) content += text(x + 12, y + ref.header + 8 + size, ref.attributes, theme, { anchor: "start", size });
    if (ref.operations) content += text(x + 12, second + 8 + size, ref.operations, theme, { anchor: "start", size });
    if (node.detail) content += text(x + 12, second + ref.operationHeight + 8 + size, node.detail, theme, { anchor: "start", size, fill: theme.muted });
  } else if (kind === "database") {
    shape = `<path d="M${numeric(x)} ${numeric(y + 10)} A${numeric(w / 2)} 10 0 0 1 ${numeric(x + w)} ${numeric(y + 10)} V${numeric(y + h - 10)} A${numeric(w / 2)} 10 0 0 1 ${numeric(x)} ${numeric(y + h - 10)} Z" ${common}/><ellipse cx="${numeric(x + w / 2)}" cy="${numeric(y + 10)}" rx="${numeric(w / 2)}" ry="10" ${common}/>`;
    content = centeredContent(ref, x + 8, y + 22, w - 16, h - 34);
  } else if (kind === "queue") {
    shape = `<path d="M${numeric(x + 10)} ${numeric(y)} H${numeric(x + w - 10)} A10 ${numeric(h / 2)} 0 0 1 ${numeric(x + w - 10)} ${numeric(y + h)} H${numeric(x + 10)} A10 ${numeric(h / 2)} 0 0 1 ${numeric(x + 10)} ${numeric(y)} Z" ${common}/><ellipse cx="${numeric(x + w - 10)}" cy="${numeric(y + h / 2)}" rx="10" ry="${numeric(h / 2)}" ${common}/>`;
    content = centeredContent(ref, x + 12, y, w - 34, h);
  } else if (kind === "server") {
    shape = `<path d="M${numeric(x)} ${numeric(y + 12)} L${numeric(x + 14)} ${numeric(y)} H${numeric(x + w)} V${numeric(y + h - 12)} L${numeric(x + w - 14)} ${numeric(y + h)} H${numeric(x)} Z" ${common}/><path d="M${numeric(x)} ${numeric(y + 12)} H${numeric(x + w - 14)} L${numeric(x + w)} ${numeric(y)} M${numeric(x + w - 14)} ${numeric(y + 12)} V${numeric(y + h)}" fill="none" stroke="${stroke}" stroke-width="${numeric(theme.lineWidth)}"/>`;
    content = centeredContent(ref, x, y + 12, w - 14, h - 12);
  } else if (kind === "package") {
    const tab = Math.min(w - 28, Math.max(56, w * 0.4));
    shape = `<path d="M${numeric(x)} ${numeric(y + h)} V${numeric(y)} H${numeric(x + tab)} V${numeric(y + 20)} H${numeric(x + w)} V${numeric(y + h)} Z" ${common}/><path d="M${numeric(x)} ${numeric(y + 20)} H${numeric(x + tab)}" stroke="${stroke}"/>`;
    content = centeredContent(ref, x, y + 22, w, h - 22);
  } else if (kind === "note") {
    shape = `<path d="M${numeric(x)} ${numeric(y)} H${numeric(x + w - 18)} L${numeric(x + w)} ${numeric(y + 18)} V${numeric(y + h)} H${numeric(x)} Z" ${common}/><path d="M${numeric(x + w - 18)} ${numeric(y)} V${numeric(y + 18)} H${numeric(x + w)}" fill="none" stroke="${stroke}"/>`;
    content = centeredContent(ref, x + 6, y + 10, w - 18, h - 16);
  } else {
    const radius = kind === "state" ? Math.max(12, theme.radius) : kind === "action" && ["activity", "swimlane", "process", "scenario"].includes(spec.type) ? Math.max(14, theme.radius) : theme.radius;
    shape = `${rect} rx="${numeric(radius)}" ${common}/>`;
    if (kind === "component") {
      const right = x + w - 28;
      shape += `<rect x="${numeric(right)}" y="${numeric(y + 10)}" width="16" height="20" fill="${surface}" stroke="${stroke}"/><path d="M${numeric(right - 4)} ${numeric(y + 14)} h8 v5 h-8 Z M${numeric(right - 4)} ${numeric(y + 22)} h8 v5 h-8 Z" fill="${surface}" stroke="${stroke}"/>`;
    }
    if (kind === "state" && node.detail) {
      shape += `<path d="M${numeric(x)} ${numeric(y + ref.header)} H${numeric(x + w)}" stroke="${stroke}" stroke-width="${numeric(theme.lineWidth)}"/>`;
      content = centeredContent({ ...ref, node: { ...node, detail: void 0 } }, x, y, w, ref.header);
      const size = Math.max(10, theme.fontSize - 2);
      content += text(x + 12, y + ref.header + 10 + size, node.detail, theme, { anchor: "start", size, fill: theme.muted });
    } else content = centeredContent(ref, x + (kind === "component" ? -8 : 0), y, w, h);
  }
  if (ref.internalCaption) {
    const caption = ref.internalCaption;
    content += text(x + caption.x + caption.width / 2, y + caption.y + 2 + caption.size, caption.value, theme, { size: caption.size, fill: theme.muted });
  }
  if (box.caption) content += text(x + box.caption.x + box.caption.width / 2, y + box.caption.y + 2 + box.caption.size, box.caption.value, theme, { size: box.caption.size, fill: theme.muted });
  return `<g class="uml-node uml-node-${kind}" data-editor-key="nodes/${spec.nodes.indexOf(ref.sourceNode)}" data-node-id="${esc(node.id)}"${node.lane ? ` data-lane-id="${esc(node.lane)}"` : ""}${node.group ? ` data-group-id="${esc(node.group)}"` : ""}><title>${esc([ref.sourceNode.label, ref.sourceNode.detail, ...ref.sourceNode.attributes ?? [], ...ref.sourceNode.operations ?? []].filter(Boolean).join("\n"))}</title>${shape}${content}</g>`;
}
function segmentIntersectsRect(a, b, box, margin = 0) {
  let low = 0, high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, box.x - margin, box.x + box.width + margin],
    [a.y, b.y - a.y, box.y - margin, box.y + box.height + margin]
  ]) {
    if (Math.abs(delta) < 1e-3) {
      if (start < min || start > max) return false;
    } else {
      const first = (min - start) / delta, last = (max - start) / delta;
      low = Math.max(low, Math.min(first, last));
      high = Math.min(high, Math.max(first, last));
      if (low > high) return false;
    }
  }
  return true;
}
function segmentRectDistance(a, b, box) {
  if (segmentIntersectsRect(a, b, box)) return 0;
  const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height }
  ];
  const distances = corners.map((point) => {
    const fraction = squared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared)) : 0;
    return Math.hypot(point.x - a.x - dx * fraction, point.y - a.y - dy * fraction);
  });
  for (const point of [a, b]) distances.push(Math.hypot(Math.max(box.x - point.x, 0, point.x - box.x - box.width), Math.max(box.y - point.y, 0, point.y - box.y - box.height)));
  return Math.min(...distances);
}
function labelIntersectsNode(label2, node) {
  if (!intersects(label2, node, 5)) return false;
  const dx = Math.max(label2.x - 5 - node.x - node.width / 2, 0, node.x + node.width / 2 - label2.x - label2.width - 5) / (node.width / 2);
  const dy = Math.max(label2.y - 5 - node.y - node.height / 2, 0, node.y + node.height / 2 - label2.y - label2.height - 5) / (node.height / 2);
  if (node.ref.kind === "decision") return dx + dy < 1;
  if (["usecase", "start", "end"].includes(node.ref.kind)) return dx * dx + dy * dy < 1;
  return true;
}
function placeLabels(routes, nodes, containers, direction) {
  const occupied = [];
  for (const box of nodes) if (box.caption) occupied.push({ x: box.x + box.caption.x, y: box.y + box.caption.y, width: box.caption.width, height: box.caption.height });
  for (const box of containers) occupied.push(box.ref.kind === "lane" && direction === "LR" ? { x: box.x, y: box.y, width: box.ref.header, height: box.height } : { x: box.x, y: box.y, width: box.width, height: box.ref.header });
  const allSegments = [];
  for (const route of routes) {
    let offset = 0;
    for (const path of route.paths) for (let index = 1; index < path.length; index++) {
      const a = path[index - 1], b = path[index], length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length > 0.01) allSegments.push({ a, b, route, length, offset });
      offset += length;
    }
  }
  const placed = [];
  for (const route of routes) for (const label2 of route.ref.labels) {
    const candidates = [];
    const segments = allSegments.filter((segment) => segment.route === route);
    const others = allSegments.filter((segment) => segment.route !== route);
    const total = segments.reduce((sum, segment) => sum + segment.length, 0);
    const branch = label2.role === "main" && nodes.find((node) => node.ref.node.id === route.ref.edge.from)?.ref.kind === "decision";
    const desired = label2.role === "from" || branch ? Math.min(36, total / 2) : label2.role === "to" ? total - Math.min(36, total / 2) : total / 2;
    for (const segment of segments) {
      const { a, b, length, offset } = segment;
      const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
      const overlaps = others.flatMap((other) => {
        const cross2 = (point) => Math.abs((point.x - a.x) * uy - (point.y - a.y) * ux);
        if (cross2(other.a) > 0.01 || cross2(other.b) > 0.01) return [];
        const first = (other.a.x - a.x) * ux + (other.a.y - a.y) * uy;
        const last = (other.b.x - a.x) * ux + (other.b.y - a.y) * uy;
        const start = Math.max(0, Math.min(first, last)), end = Math.min(length, Math.max(first, last));
        return end > start + 0.01 ? [{ start, end }] : [];
      });
      const cuts = [.../* @__PURE__ */ new Set([0, length, ...overlaps.flatMap((overlap) => [overlap.start, overlap.end])])].sort((first, second) => first - second);
      for (let index = 1; index < cuts.length; index++) {
        const start = cuts[index - 1], end = cuts[index], middle = (start + end) / 2;
        const shared = overlaps.some((overlap) => middle > overlap.start && middle < overlap.end);
        const positions = /* @__PURE__ */ new Set([
          middle,
          start + (end - start) / 4,
          end - (end - start) / 4,
          Math.max(start, Math.min(end, desired - offset))
        ]);
        const steps = Math.min(60, Math.ceil((end - start) / 12));
        for (let step = 0; step <= steps; step++) positions.add(start + (end - start) * step / Math.max(1, steps));
        const shifts = end - start < Math.abs(ux) * label2.width + Math.abs(uy) * label2.height + 16 ? [0, -12, 12, -24, 24] : [0];
        for (const position of positions) for (const gap of [8, 12, 18, 28, 44, 68, 100]) for (const sign of [1, -1]) for (const shift of shifts) {
          const anchor = { x: a.x + ux * position, y: a.y + uy * position };
          const normalX = -uy * sign, normalY = ux * sign;
          const distance = gap + Math.abs(normalX) * label2.width / 2 + Math.abs(normalY) * label2.height / 2;
          const box = {
            x: anchor.x + normalX * distance + ux * shift - label2.width / 2,
            y: anchor.y + normalY * distance + uy * shift - label2.height / 2,
            width: label2.width,
            height: label2.height,
            value: label2.value,
            size: label2.size,
            ref: route.ref,
            role: label2.role,
            anchor
          };
          const nearest = Math.min(...others.map((other) => segmentRectDistance(other.a, other.b, box)));
          const own = segmentRectDistance(a, b, box), ambiguous = shared || nearest < own + 3;
          box.leader = ambiguous || own > 18;
          candidates.push({ box, score: Math.abs(offset + position - desired) * (branch || label2.role !== "main" ? 0.3 : 0.1) + gap * 2 + Math.abs(shift) + (shared ? 4e3 : ambiguous ? 1e3 : 0) + (gap > 18 ? 500 : 0) });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const sharedAnchor = (anchor) => others.some((other) => segmentRectDistance(other.a, other.b, { ...anchor, width: 0, height: 0 }) < 0.01);
    let chosen;
    for (const candidate of candidates) {
      if (nodes.some((node) => labelIntersectsNode(candidate.box, node))) continue;
      if (occupied.some((box) => intersects(candidate.box, box, 5))) continue;
      if (allSegments.some(({ a, b }) => segmentIntersectsRect(a, b, candidate.box, 4))) continue;
      if (candidate.box.leader && sharedAnchor(candidate.box.anchor)) continue;
      chosen = candidate.box;
      break;
    }
    if (!chosen) {
      const candidate = (candidates.find((candidate2) => !sharedAnchor(candidate2.box.anchor)) ?? candidates[0]).box;
      chosen = { ...candidate, leader: true };
      while (nodes.some((node) => labelIntersectsNode(chosen, node)) || occupied.some((box) => intersects(chosen, box, 5)) || allSegments.some(({ a, b }) => segmentIntersectsRect(a, b, chosen, 4))) chosen.y -= label2.height + 12;
    }
    placed.push(chosen);
    occupied.push(chosen);
  }
  return placed;
}
function occupiedNode(box) {
  const caption = box.caption;
  const left = Math.min(0, caption?.x ?? 0), top = Math.min(0, caption?.y ?? 0);
  return {
    x: box.x + left,
    y: box.y + top,
    width: Math.max(box.width, caption ? caption.x + caption.width : 0) - left,
    height: Math.max(box.height, caption ? caption.y + caption.height : 0) - top
  };
}
function alignConnectedNodes(result, edges, columns, spec) {
  const horizontal = Boolean(spec.lanes?.length) && spec.direction === "LR";
  const axis = horizontal ? "x" : "y", cross2 = horizontal ? "y" : "x";
  const size = horizontal ? "width" : "height", crossSize = horizontal ? "height" : "width";
  const nodes = result.nodes.filter((box) => !["start", "end"].includes(box.ref.kind));
  const index = new Map(nodes.map((box, i) => [box.ref.node.id, i]));
  const parents = nodes.map((_, i) => i);
  const find = (i) => parents[i] === i ? i : parents[i] = find(parents[i]);
  const bounds = nodes.map(occupiedNode), gap = spec.layout?.elementGap ?? 24;
  const labelGaps = /* @__PURE__ */ new Map();
  for (const ref of edges) {
    const from = index.get(ref.edge.from), to = index.get(ref.edge.to);
    if (from === void 0 || to === void 0) continue;
    const key = [from, to].sort((first, second) => first - second).join(":");
    labelGaps.set(key, Math.max(labelGaps.get(key) ?? gap, ...ref.labels.map((label2) => label2[size] + 16)));
  }
  const separation = (from, to) => Math.max(gap, labelGaps.get([from, to].sort((first, second) => first - second).join(":")) ?? gap);
  const center = (i) => nodes[i][axis] + nodes[i][size] / 2;
  const constraints = [];
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    if (bounds[a][cross2] >= bounds[b][cross2] + bounds[b][crossSize] + gap / 2 || bounds[b][cross2] >= bounds[a][cross2] + bounds[a][crossSize] + gap / 2) continue;
    const [from, to] = center(a) <= center(b) ? [a, b] : [b, a];
    const distance = bounds[from][axis] + bounds[from][size] - center(from) + center(to) - bounds[to][axis] + separation(from, to);
    constraints.push({ from, to, distance });
  }
  for (const edge of edges) {
    const a = index.get(edge.edge.from), b = index.get(edge.edge.to);
    if (a === void 0 || b === void 0 || columns.get(nodes[a].ref.id) !== columns.get(nodes[b].ref.id) || Math.abs(center(a) - center(b)) < 0.01) continue;
    if (!horizontal && spec.direction === "LR" && !/-column\d+$/.test(columns.get(nodes[a].ref.id))) continue;
    const [from, to] = center(a) < center(b) ? [a, b] : [b, a];
    constraints.push({ from, to, distance: bounds[from][axis] + bounds[from][size] - center(from) + center(to) - bounds[to][axis] + separation(from, to) });
  }
  const adjacency = () => {
    const graph = /* @__PURE__ */ new Map();
    for (const constraint of constraints) {
      const from = find(constraint.from), to = find(constraint.to);
      if (from !== to) {
        const next = graph.get(from) ?? [];
        next.push(to);
        graph.set(from, next);
      }
    }
    return graph;
  };
  const reachable = (graph, from, to) => {
    const pending2 = [from], visited = /* @__PURE__ */ new Set();
    while (pending2.length) {
      const current = pending2.pop();
      if (current === to) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending2.push(...graph.get(current) ?? []);
    }
    return false;
  };
  const candidates = edges.flatMap((ref) => {
    const from = index.get(ref.edge.from), to = index.get(ref.edge.to);
    return from === void 0 || to === void 0 || columns.get(nodes[from].ref.id) === columns.get(nodes[to].ref.id) && Math.abs(center(from) - center(to)) >= 0.01 ? [] : [{ from, to, difference: Math.abs(center(from) - center(to)) }];
  }).sort((a, b) => a.difference - b.difference);
  const related = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    const from = index.get(edge.edge.from), to = index.get(edge.edge.to);
    if (from === void 0 || to === void 0) continue;
    for (const [key, node] of [[`from:${from}`, to], [`to:${to}`, from]]) {
      const peers = related.get(key) ?? /* @__PURE__ */ new Set();
      peers.add(node);
      related.set(key, peers);
    }
  }
  for (const peers of related.values()) {
    const values2 = [...peers];
    for (let first = 0; first < values2.length; first++) for (let second = first + 1; second < values2.length; second++) {
      const a = values2[first], b = values2[second];
      if (columns.get(nodes[a].ref.id) === columns.get(nodes[b].ref.id)) continue;
      candidates.push({ from: a, to: b, difference: Math.abs(center(a) - center(b)) });
    }
  }
  candidates.sort((a, b) => a.difference - b.difference);
  for (const candidate of candidates) {
    const from = find(candidate.from), to = find(candidate.to);
    if (from === to) continue;
    const graph = adjacency();
    if (!reachable(graph, from, to) && !reachable(graph, to, from)) parents[to] = from;
  }
  const values = /* @__PURE__ */ new Map(), indegrees = /* @__PURE__ */ new Map();
  const outgoing = /* @__PURE__ */ new Map();
  const columnTops = /* @__PURE__ */ new Map();
  nodes.forEach((box, i) => {
    const region = columns.get(box.ref.id).replace(/-column\d+$/, "");
    columnTops.set(region, Math.min(columnTops.get(region) ?? Infinity, bounds[i][axis]));
  });
  nodes.forEach((box, i) => {
    const row = find(i), top = columnTops.get(columns.get(box.ref.id).replace(/-column\d+$/, ""));
    values.set(row, Math.max(values.get(row) ?? -Infinity, top + center(i) - bounds[i][axis]));
    indegrees.set(row, 0);
  });
  for (const constraint of constraints) {
    const from = find(constraint.from), to = find(constraint.to);
    if (from === to) continue;
    const list = outgoing.get(from) ?? [];
    list.push({ ...constraint, from, to });
    outgoing.set(from, list);
    indegrees.set(to, (indegrees.get(to) ?? 0) + 1);
  }
  const pending = [...indegrees].filter(([, degree]) => !degree).map(([row]) => row);
  for (let i = 0; i < pending.length; i++) for (const constraint of outgoing.get(pending[i]) ?? []) {
    values.set(constraint.to, Math.max(values.get(constraint.to), values.get(constraint.from) + constraint.distance));
    const degree = indegrees.get(constraint.to) - 1;
    indegrees.set(constraint.to, degree);
    if (!degree) pending.push(constraint.to);
  }
  nodes.forEach((box, i) => {
    box[axis] = values.get(find(i)) - box[size] / 2;
  });
  const groups = new Map((spec.groups ?? []).map((group) => [group.id, group.parent]));
  for (const container of [...result.containers].sort((a, b) => b.depth - a.depth)) {
    const members = nodes.filter((box) => {
      if (container.ref.kind === "lane") return box.ref.node.lane === container.ref.originalId || !box.ref.node.lane && container.ref.originalId.startsWith("__uml_unassigned_lane__");
      let group = box.ref.node.group;
      while (group) {
        if (group === container.ref.originalId) return true;
        group = groups.get(group);
      }
      return false;
    });
    for (const box of members) {
      const occupied = occupiedNode(box);
      container[size] = Math.max(container[size], occupied[axis] + occupied[size] + 24 - container[axis]);
    }
    for (const child of result.containers) if (child.depth > container.depth && child.ref.lane === container.ref.lane && (container.ref.kind === "lane" || groups.get(child.ref.originalId) === container.ref.originalId)) {
      container[size] = Math.max(container[size], child[axis] + child[size] + 24 - container[axis]);
    }
  }
}
function placeFlowTerminals(result, edges, direction, gap) {
  const starts = result.nodes.filter((box) => box.ref.kind === "start"), ends = result.nodes.filter((box) => box.ref.kind === "end");
  if (!starts.length && !ends.length) return;
  const horizontal = direction === "LR", axis = horizontal ? "x" : "y", cross2 = horizontal ? "y" : "x";
  const size = horizontal ? "width" : "height", crossSize = horizontal ? "height" : "width";
  const body = result.nodes.filter((box) => !["start", "end"].includes(box.ref.kind));
  const bounds = [...body.map(occupiedNode), ...result.containers];
  const first = Math.min(24, ...bounds.map((box) => box[axis]));
  const crossMin = Math.min(24, ...bounds.map((box) => box[cross2]));
  const crossMax = Math.max(crossMin + 32, ...bounds.map((box) => box[cross2] + box[crossSize]));
  const successor = edges.find((edge) => edge.edge.from === starts[0]?.ref.node.id);
  const anchor = body.find((box) => box.ref.node.id === successor?.edge.to);
  const center = anchor ? anchor[cross2] + anchor[crossSize] / 2 : (crossMin + crossMax) / 2;
  const reserve = starts.length ? Math.max(...starts.map((box) => occupiedNode(box)[size])) + gap : 0;
  for (const box of [...body, ...result.containers]) box[axis] += reserve;
  const last = Math.max(first + reserve, ...body.map((box) => {
    const occupied = occupiedNode(box);
    return occupied[axis] + occupied[size];
  }), ...result.containers.map((box) => box[axis] + box[size]));
  for (const [terminals, position] of [[starts, first], [ends, last + gap]]) {
    const span = terminals.reduce((total, box) => total + occupiedNode(box)[crossSize] + gap, -gap);
    let cursor = center - span / 2;
    for (const box of terminals) {
      const occupied = occupiedNode(box), offset = occupied[cross2] - box[cross2];
      box[axis] = position;
      const renderCross = horizontal ? box.ref.renderHeight : box.ref.renderWidth;
      const symbolCenter = box.ref.symbol ? (box.ref.symbol[cross2] + box.ref.symbol[crossSize] / 2) * box[crossSize] / renderCross : box[crossSize] / 2;
      box[cross2] = terminals.length === 1 ? center - symbolCenter : cursor - offset;
      cursor += occupied[crossSize] + gap;
    }
  }
}
async function renderGraph(spec, suppliedTheme) {
  const automaticColumns = spec.layout?.maxPerColumn === void 0;
  spec = { ...spec, layout: resolveLayout(spec) };
  const theme = cleanTheme(suppliedTheme);
  const direction = spec.direction ?? (spec.type === "usecase" ? "LR" : "TB");
  const nodes = (spec.nodes ?? []).map((node, index) => createNode(node, index, spec, theme));
  const edges = (spec.edges ?? []).map((edge, index) => createEdge(edge, index, theme, spec.type));
  const refs = new Map(nodes.map((node) => [node.id, node]));
  const containers = /* @__PURE__ */ new Map();
  const columns = /* @__PURE__ */ new Map();
  const elk = layoutEngine ??= new ELK();
  let result;
  if (spec.type === "usecase" && !spec.lanes?.length) {
    result = layoutUsecases(nodes, edges, spec, theme);
  } else if (spec.lanes?.length) {
    const lanes = [...spec.lanes];
    const unassigned = nodes.filter((node) => !node.node.lane);
    const occupiedGroups = /* @__PURE__ */ new Set();
    for (const node of nodes) {
      let id2 = node.node.group;
      while (id2 && !occupiedGroups.has(id2)) {
        occupiedGroups.add(id2);
        id2 = spec.groups?.find((group) => group.id === id2)?.parent;
      }
    }
    const emptyGroups = (spec.groups ?? []).filter((group) => !occupiedGroups.has(group.id));
    let unassignedId = "__uml_unassigned_lane__";
    while (lanes.some((lane) => lane.id === unassignedId)) unassignedId += "_";
    if (unassigned.length || emptyGroups.length) lanes.push({ id: unassignedId, label: "\u672A\u5206\u914D" });
    const layouts = [];
    for (let index = 0; index < lanes.length; index++) {
      const lane = lanes[index];
      const laneNodes = nodes.filter((node) => lane.id === unassignedId ? !node.node.lane : node.node.lane === lane.id);
      const laneNodeIds = new Set(laneNodes.map((node) => node.node.id));
      const localEdges = edges.filter((edge) => laneNodeIds.has(edge.edge.from) && laneNodeIds.has(edge.edge.to));
      const input = buildGraph(
        `lane${index}`,
        laneNodes,
        spec.groups ?? [],
        localEdges,
        spec,
        theme,
        containers,
        lane,
        lane.id === unassignedId ? emptyGroups.map((group) => group.id) : void 0
      );
      const minimumWidth = input.width ?? 240, minimumHeight = input.height ?? 180;
      const output = await layoutRegions(input, spec, elk, refs, columns, automaticColumns);
      output.width = Math.max(minimumWidth, output.width ?? 0);
      output.height = Math.max(minimumHeight, output.height ?? 0);
      layouts.push(collectLayout(output, refs, containers));
    }
    const crossSize = Math.max(180, ...layouts.map((layout2) => direction === "TB" ? layout2.height : layout2.width));
    let offset = 0;
    result = { nodes: [], containers: [], routes: [], width: 0, height: 0 };
    for (const layout2 of layouts) {
      const dx = direction === "TB" ? offset : 0, dy = direction === "LR" ? offset : 0;
      for (const box of layout2.nodes) result.nodes.push({ ...box, x: box.x + dx, y: box.y + dy });
      for (const box of layout2.containers) result.containers.push({ ...box, x: box.x + dx, y: box.y + dy, width: box.ref.kind === "lane" && direction === "LR" ? crossSize : box.width, height: box.ref.kind === "lane" && direction === "TB" ? crossSize : box.height });
      offset += (direction === "TB" ? layout2.width : layout2.height) + (spec.layout?.regionGap ?? 0);
    }
    const extent = offset - (spec.layout?.regionGap ?? 0);
    result.width = direction === "TB" ? extent : crossSize;
    result.height = direction === "TB" ? crossSize : extent;
  } else {
    const input = buildGraph("root", nodes, spec.groups ?? [], edges, spec, theme, containers);
    const output = await layoutRegions(input, spec, elk, refs, columns, automaticColumns);
    result = collectLayout(output, refs, containers);
  }
  if (spec.type !== "usecase") alignConnectedNodes(result, edges, columns, spec);
  placeFlowTerminals(result, edges, direction, spec.layout?.elementGap ?? 24);
  result.width = Math.max(0, ...result.nodes.map((box) => {
    const occupied = occupiedNode(box);
    return occupied.x + occupied.width;
  }), ...result.containers.map((box) => box.x + box.width));
  result.height = Math.max(0, ...result.nodes.map((box) => {
    const occupied = occupiedNode(box);
    return occupied.y + occupied.height;
  }), ...result.containers.map((box) => box.y + box.height));
  routeEdges(edges, result, direction, { ...theme, gap: spec.layout?.elementGap ?? 24 }, spec.type);
  const nodeById = new Map(result.nodes.map((box) => [box.ref.node.id, box]));
  for (const route of result.routes) {
    const first = route.paths[0], last = route.paths[route.paths.length - 1];
    const source = nodeById.get(route.ref.edge.from), target = nodeById.get(route.ref.edge.to);
    if (spec.type !== "usecase") {
      if (source && first.length > 1) clipEndpoint(first[0], first[1], source);
      if (target && last.length > 1) clipEndpoint(last[last.length - 1], last[last.length - 2], target);
    }
  }
  const labels = placeLabels(result.routes, result.nodes, result.containers, direction);
  const prefix = `uml-graph-${++graphNumber}`;
  const displayed = result.routes.flatMap((route, owner) => route.paths.map((points) => ({ points: simplify(points), owner })));
  const crossings = crossingPaths(
    displayed,
    spec.layout?.edgeCrossing ?? "bridge",
    theme.lineWidth,
    [...result.nodes.map(occupiedNode), ...labels]
  );
  const maskDefinitions = crossings.masks.map((arcs, index) => {
    if (!arcs.length) return "";
    const points = displayed[index].points;
    const x = Math.min(...points.map((p) => p.x)) - 24, y = Math.min(...points.map((p) => p.y)) - 24;
    const width2 = Math.max(...points.map((p) => p.x)) - x + 24, height2 = Math.max(...points.map((p) => p.y)) - y + 24;
    return `<mask id="${prefix}-crossing-${index}" maskUnits="userSpaceOnUse" x="${numeric(x)}" y="${numeric(y)}" width="${numeric(width2)}" height="${numeric(height2)}"><rect x="${numeric(x)}" y="${numeric(y)}" width="${numeric(width2)}" height="${numeric(height2)}" fill="white"/>${arcs.map((d) => `<path d="${d}" fill="none" stroke="black" stroke-width="${numeric(theme.lineWidth + 3)}"/>`).join("")}</mask>`;
  }).join("");
  let displayIndex = 0;
  let paths = "";
  for (const route of result.routes) {
    const kind = edgeKind(route.ref.edge, spec.type);
    const dashed = route.ref.edge.dashed || ["dependency", "include", "extend", "realization"].includes(kind);
    const end = kind === "flow" ? "arrow" : ["dependency", "include", "extend"].includes(kind) ? "open" : ["inheritance", "realization"].includes(kind) ? "triangle" : "";
    const start = kind === "aggregation" || kind === "composition" ? kind : "";
    paths += `<g class="uml-edge uml-edge-${kind}" data-editor-key="edges/${spec.edges.indexOf(route.ref.edge)}" data-edge-id="${esc(route.ref.edge.id ?? route.ref.id)}" data-from="${esc(route.ref.edge.from)}" data-to="${esc(route.ref.edge.to)}"><title>${esc([route.ref.edge.from, route.ref.edge.label, route.ref.edge.to].filter(Boolean).join(" \u2192 "))}</title>`;
    for (let index = 0; index < route.paths.length; index++) {
      const current = displayIndex++, data = crossings.data[current];
      const mask = crossings.masks[current].length ? ` mask="url(#${prefix}-crossing-${current})"` : "";
      paths += `<path d="${data}"${mask} fill="none" stroke="${esc(theme.primary)}" stroke-width="${numeric(theme.lineWidth)}" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="7 5"' : ""}${start && index === 0 ? ` marker-start="url(#${prefix}-${start})"` : ""}${end && index === route.paths.length - 1 ? ` marker-end="url(#${prefix}-${end})"` : ""}/>`;
    }
    paths += "</g>";
  }
  const groupShapes = result.containers.sort((a, b) => a.depth - b.depth).map((box) => renderContainer(box, theme, direction)).join("");
  const nodeShapes = result.nodes.map((box) => renderNode(box, spec)).join("");
  const labelShapes = labels.map((label2) => {
    const leader = label2.leader ? `<path class="uml-label-leader" d="M${numeric(label2.anchor.x)} ${numeric(label2.anchor.y)} L${numeric(Math.max(label2.x, Math.min(label2.x + label2.width, label2.anchor.x)))} ${numeric(Math.max(label2.y, Math.min(label2.y + label2.height, label2.anchor.y)))}" fill="none" stroke="${esc(theme.muted)}" stroke-width="1" stroke-dasharray="3 3"/>` : "";
    return `<g class="uml-edge-label" data-editor-key="edges/${spec.edges.indexOf(label2.ref.edge)}" data-edge-id="${esc(label2.ref.edge.id ?? label2.ref.id)}" data-from="${esc(label2.ref.edge.from)}" data-to="${esc(label2.ref.edge.to)}" data-label-role="${label2.role}">${leader}<rect x="${numeric(label2.x)}" y="${numeric(label2.y)}" width="${numeric(label2.width)}" height="${numeric(label2.height)}" rx="3" fill="${esc(theme.background === "transparent" ? theme.surface : theme.background)}"/>${text(label2.x + label2.width / 2, label2.y + 5 + label2.size, label2.value, theme, { size: label2.size, fill: theme.muted })}</g>`;
  }).join("");
  let minX = 0, minY = 0, maxX = result.width, maxY = result.height;
  for (const box of [...result.nodes, ...result.containers, ...labels]) {
    minX = Math.min(minX, box.x - theme.lineWidth);
    minY = Math.min(minY, box.y - theme.lineWidth);
    maxX = Math.max(maxX, box.x + box.width + theme.lineWidth);
    maxY = Math.max(maxY, box.y + box.height + theme.lineWidth);
  }
  for (const box of result.nodes) if (box.caption) {
    minX = Math.min(minX, box.x + box.caption.x);
    minY = Math.min(minY, box.y + box.caption.y);
    maxX = Math.max(maxX, box.x + box.caption.x + box.caption.width);
    maxY = Math.max(maxY, box.y + box.caption.y + box.caption.height);
  }
  for (const route of result.routes) for (const path of route.paths) for (const point of path) {
    minX = Math.min(minX, point.x - 14);
    minY = Math.min(minY, point.y - 14);
    maxX = Math.max(maxX, point.x + 14);
    maxY = Math.max(maxY, point.y + 14);
  }
  const showTitle = spec.layout?.showTitle === true;
  const titleMetrics = showTitle ? measure(spec.title, 24) : { width: 0, lines: 0 };
  const titleBottom = 42 + (titleMetrics.lines - 1) * 33.6;
  const descriptionMetrics = showTitle && spec.description ? measure(spec.description, 13) : void 0;
  const contentY = showTitle ? Math.max(88, descriptionMetrics ? titleBottom + 24 + (descriptionMetrics.lines - 1) * 18.2 + 32 : titleBottom + 36) : 24;
  const heading2 = showTitle ? text(32, 42, spec.title, theme, { size: 24, anchor: "start", weight: 650 }) + (spec.description ? text(32, titleBottom + 24, spec.description, theme, { size: 13, anchor: "start", fill: theme.muted }) : "") : "";
  const width = Math.max(1, maxX - minX + 64, titleMetrics.width + 64, (descriptionMetrics?.width ?? 0) + 64);
  const height = Math.max(1, maxY - minY + contentY + 24);
  const body = `${markerDefinitions(prefix, theme)}<defs>${maskDefinitions}</defs>${heading2}<g transform="translate(${numeric(32 - minX)} ${numeric(contentY - minY)})">${groupShapes}${paths}${labelShapes}${nodeShapes}</g>`;
  return frame(spec, theme, width, height, body);
}

// src/special.ts
function measure2(value, size) {
  return Array.from(value).reduce(
    (width, char) => width + (/[^\u0000-\u00ff]/.test(char) ? 1 : /[MW@%]/.test(char) ? 0.9 : 0.58) * size,
    0
  );
}
function wrap(value, width, size) {
  const result = [];
  for (const paragraph of value.split("\n")) {
    let line2 = "";
    for (const char of paragraph) {
      if (line2 && measure2(line2 + char, size) > width) {
        result.push(line2);
        line2 = "";
      }
      line2 += char;
    }
    result.push(line2);
  }
  return result;
}
function line(x1, y1, x2, y2, color2, width, dashed = false) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${esc(color2)}" stroke-width="${width}"${dashed ? ' stroke-dasharray="6 5"' : ""}/>`;
}
function heading(spec, theme, width, eyebrow) {
  if (spec.layout?.showTitle !== true) return { svg: "", bottom: 24 };
  const titleSize = theme.fontSize + 10;
  const title = wrap(spec.title, width - 80, titleSize);
  const subtitle = spec.description ? wrap(spec.description, width - 80, theme.fontSize) : [];
  const titleY = 66;
  const descriptionY = titleY + title.length * titleSize * 1.4 + 5;
  return {
    svg: text(40, 30, eyebrow, theme, {
      anchor: "start",
      size: 11,
      fill: theme.muted,
      weight: 700
    }) + text(40, titleY, title.join("\n"), theme, {
      anchor: "start",
      size: titleSize,
      weight: 700
    }) + (subtitle.length ? text(40, descriptionY, subtitle.join("\n"), theme, {
      anchor: "start",
      fill: theme.muted
    }) : ""),
    bottom: (subtitle.length ? descriptionY + subtitle.length * theme.fontSize * 1.4 : titleY + title.length * titleSize * 1.4) + 30
  };
}
function renderSequence(spec, theme) {
  spec = { ...spec, layout: resolveLayout(spec) };
  const participants = spec.participants ?? [];
  const messages = spec.messages ?? [];
  const fragments = spec.fragments ?? [];
  const size = theme.fontSize;
  const participantWidth = Math.max(
    128,
    theme.nodeWidth,
    ...participants.map((p) => Math.min(280, measure2(p.label, size) + 30))
  );
  const gap = spec.layout?.regionGap ?? 40;
  const messageGap = spec.layout?.elementGap ?? 24;
  const labelWidth = Math.max(participantWidth + gap - 24, 190);
  const column = participantWidth + gap;
  const lastCenter = 70 + participantWidth / 2 + (participants.length - 1) * column;
  const width = Math.max(
    720,
    participants.length * column + 100,
    lastCenter + Math.max(participantWidth / 2, labelWidth - 38) + 40
  );
  const header = heading(spec, theme, width, "UML / SEQUENCE \xB7 \u65F6\u95F4\u5411\u4E0B");
  const top = header.bottom;
  const boxHeight = Math.max(
    76,
    size * 4,
    ...participants.map(
      (p) => wrap(p.label, participantWidth - 20, size).length * size * 1.4 + (p.kind === "actor" ? 76 : 28)
    )
  );
  const x = new Map(
    participants.map((p, i) => [p.id, 70 + participantWidth / 2 + i * column])
  );
  const ys = [];
  const rowLines = [], labelTops = [];
  const guardSize = Math.max(11, size - 1), guardLeading = guardSize * 1.4;
  const orderedFragments = [...fragments].sort(
    (a, b) => b.to - b.from - (a.to - a.from)
  );
  const frames = orderedFragments.map((fragment, index) => {
    const nested = orderedFragments.slice(0, index).filter(
      (other) => other.from <= fragment.from && other.to >= fragment.to
    ).length;
    const left = 36 + nested * 12, right = width - 36 - nested * 12;
    const guardLines = wrap(
      `[${fragment.label}]`,
      Math.max(48, right - left - 96),
      guardSize
    );
    const elseLines = wrap(
      `[${fragment.elseLabel ?? (fragment.kind === "par" ? "\u5E76\u884C\u5206\u652F" : "else")}]`,
      Math.max(48, right - left - 32),
      guardSize
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
      divider: 0
    };
  });
  const starts = /* @__PURE__ */ new Map(), alternatives = /* @__PURE__ */ new Map(), ends = /* @__PURE__ */ new Map();
  const addEvent = (events, index, box) => {
    const list = events.get(index);
    if (list) list.push(box);
    else events.set(index, [box]);
  };
  for (const box of frames) {
    addEvent(starts, box.fragment.from, box);
    addEvent(ends, box.fragment.to, box);
    if (box.fragment.elseAt !== void 0)
      addEvent(alternatives, box.fragment.elseAt, box);
  }
  for (const boxes of ends.values()) boxes.reverse();
  let cursor = top + boxHeight + 40;
  for (let i = 0; i < messages.length; i++) {
    const elseBoxes = alternatives.get(i), startBoxes = starts.get(i);
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
    const msg = messages[i];
    const label2 = `${i + 1}  ${msg.label}${msg.kind === "create" ? " \xABcreate\xBB" : msg.kind === "destroy" ? " \xABdestroy\xBB" : ""}`;
    const available = msg.from === msg.to ? labelWidth - 56 : Math.abs(x.get(msg.to) - x.get(msg.from)) - (msg.kind === "create" ? participantWidth / 2 : 0) - 48;
    const lines = wrap(
      label2,
      Math.max(48, Math.min(labelWidth, available)),
      size
    );
    const labelHeight = lines.length * size * 1.4;
    const before = msg.kind === "create" ? Math.max(labelHeight + 12, boxHeight / 2 + 16) : labelHeight + 12;
    const y = cursor + before;
    ys.push(y);
    rowLines.push(lines);
    labelTops.push(y - labelHeight - 12);
    cursor = y + (msg.from === msg.to ? 30 : 0) + (msg.kind === "create" ? Math.max(messageGap, boxHeight / 2 + 20) : messageGap);
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
  const createAt = /* @__PURE__ */ new Map();
  const destroyAt = /* @__PURE__ */ new Map();
  messages.forEach((m, i) => {
    if (m.kind === "create" && !createAt.has(m.to)) createAt.set(m.to, i);
    if (m.kind === "destroy" && !destroyAt.has(m.to)) destroyAt.set(m.to, i);
  });
  const headerY = (p) => createAt.has(p.id) ? ys[createAt.get(p.id)] - boxHeight / 2 : top;
  let body = header.svg + `<defs><marker id="seq-filled" viewBox="0 0 10 8" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M 0 0 L 10 4 L 0 8 Z" fill="${esc(theme.primary)}"/></marker><marker id="seq-open" viewBox="0 0 10 8" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M 0 0 L 9 4 L 0 8" fill="none" stroke="${esc(theme.primary)}" stroke-width="1.5"/></marker></defs>`;
  let fragmentAnnotations = "";
  const guard = (left, top2, lines) => {
    const width2 = Math.max(...lines.map((value) => measure2(value, guardSize))) + 8;
    return `<rect x="${left - 4}" y="${top2}" width="${width2}" height="${lines.length * guardLeading}" fill="${esc(theme.background === "transparent" ? theme.surface : theme.background)}"/>` + text(left, top2 + guardSize * 1.1, lines.join("\n"), theme, {
      anchor: "start",
      size: guardSize,
      fill: theme.muted
    });
  };
  for (const box of frames) {
    const { fragment, left, right, top: frameTop, bottom: frameBottom } = box;
    body += `<g data-editor-key="fragments/${spec.fragments.indexOf(fragment)}"><rect x="${left}" y="${frameTop}" width="${right - left}" height="${frameBottom - frameTop}" rx="${Math.min(4, theme.radius)}" fill="none" stroke="${esc(theme.border)}" stroke-width="${theme.lineWidth}"/>`;
    fragmentAnnotations += `<g data-editor-key="fragments/${spec.fragments.indexOf(fragment)}"><path d="M ${left} ${frameTop + 26} H ${left + 54} L ${left + 64} ${frameTop + 16} V ${frameTop} H ${left}" fill="${esc(theme.surface)}" stroke="${esc(theme.border)}"/>`;
    fragmentAnnotations += text(
      left + 10,
      frameTop + 18,
      fragment.kind,
      theme,
      { anchor: "start", size: 12, weight: 700 }
    );
    fragmentAnnotations += guard(left + 76, frameTop + 8, box.guardLines);
    if (fragment.elseAt !== void 0) {
      body += line(
        left,
        box.divider,
        right,
        box.divider,
        theme.border,
        theme.lineWidth,
        true
      );
      fragmentAnnotations += guard(left + 12, box.divider + 10, box.elseLines);
    }
    body += `</g>`;
    fragmentAnnotations += `</g>`;
  }
  for (const p of participants) {
    const cx = x.get(p.id);
    body += `<g data-editor-key="participants/${participants.indexOf(p)}">`;
    const start = headerY(p) + boxHeight;
    const end = destroyAt.has(p.id) ? ys[destroyAt.get(p.id)] : bottom;
    body += line(
      cx,
      start,
      cx,
      Math.max(start, end),
      theme.border,
      theme.lineWidth,
      true
    );
    body += `</g>`;
  }
  const stacks = /* @__PURE__ */ new Map();
  const activationShapes = [];
  const drawActivation = (id2, activation, end) => {
    const ax = x.get(id2) - 6 + activation.depth * 5;
    activationShapes.push(
      `<rect x="${ax}" y="${activation.start}" width="12" height="${Math.max(16, end - activation.start)}" fill="${esc(theme.surface)}" stroke="${esc(theme.secondary)}" stroke-width="${theme.lineWidth}"/>`
    );
  };
  const sourceOffsets = [], targetOffsets = [];
  messages.forEach((m, i) => {
    const source = stacks.get(m.from) ?? [];
    sourceOffsets[i] = source.length ? 6 + (source.length - 1) * 5 : 0;
    const target = stacks.get(m.to) ?? [];
    if (m.activate) {
      target.push({ start: ys[i], depth: target.length });
      stacks.set(m.to, target);
    }
    targetOffsets[i] = target.length ? 6 + (target.length - 1) * 5 : 0;
    const closeId = m.kind === "return" ? m.from : m.to;
    if (m.deactivate) {
      const stack = stacks.get(closeId);
      const active = stack?.pop();
      if (active)
        drawActivation(closeId, active, ys[i] + (m.from === m.to ? 30 : 0));
    }
    if (m.kind === "destroy") {
      const stack = stacks.get(m.to) ?? [];
      while (stack.length) drawActivation(m.to, stack.pop(), ys[i]);
    }
  });
  for (const [id2, stack] of stacks)
    while (stack.length) drawActivation(id2, stack.pop(), bottom);
  body += activationShapes.join("");
  for (const p of participants) {
    const cx = x.get(p.id), py = headerY(p);
    body += `<g data-editor-key="participants/${participants.indexOf(p)}">`;
    const labelLines = wrap(p.label, participantWidth - 20, size);
    if (p.kind === "actor") {
      const cy = py + 13;
      body += `<circle cx="${cx}" cy="${cy}" r="9" fill="${esc(theme.surface)}" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
      body += `<path d="M ${cx} ${cy + 9} v 18 m -16 -11 h 32 M ${cx} ${cy + 27} l -13 15 M ${cx} ${cy + 27} l 13 15" fill="none" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
      body += text(cx, py + 64 + size, labelLines.join("\n"), theme, {
        anchor: "middle",
        weight: 600
      });
    } else {
      if (p.kind === "database") {
        const left = cx - participantWidth / 2;
        const top2 = py + 8;
        const bottom2 = py + boxHeight - 8;
        body += `<path d="M ${left} ${top2} A ${participantWidth / 2} 8 0 0 1 ${cx + participantWidth / 2} ${top2} V ${bottom2} A ${participantWidth / 2} 8 0 0 1 ${left} ${bottom2} Z" fill="${esc(theme.surface)}" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
        body += `<ellipse cx="${cx}" cy="${top2}" rx="${participantWidth / 2}" ry="8" fill="${esc(theme.surface)}" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
        body += `<path d="M ${left} ${bottom2} A ${participantWidth / 2} 8 0 0 0 ${cx + participantWidth / 2} ${bottom2}" fill="none" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
      } else {
        body += `<rect x="${cx - participantWidth / 2}" y="${py}" width="${participantWidth}" height="${boxHeight}" rx="${theme.radius}" fill="${esc(theme.surface)}" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"/>`;
      }
      body += text(
        cx,
        py + boxHeight / 2 + size / 3 - (labelLines.length - 1) * size * 0.7,
        labelLines.join("\n"),
        theme,
        { anchor: "middle", weight: 600 }
      );
    }
    body += `</g>`;
  }
  body += fragmentAnnotations;
  messages.forEach((m, i) => {
    body += `<g data-editor-key="messages/${i}">`;
    const sx = x.get(m.from), tx = x.get(m.to), y = ys[i];
    const self = m.from === m.to;
    const sign = tx >= sx ? 1 : -1;
    const start = sx + (self ? sourceOffsets[i] : sign * sourceOffsets[i]);
    const end = m.kind === "create" ? tx - sign * participantWidth / 2 : tx - sign * targetOffsets[i];
    const kind = m.kind ?? "sync";
    const dashed = kind === "return" || kind === "create";
    const open = kind === "async" || kind === "create";
    const path = self ? `M ${start} ${y} H ${sx + Math.min(80, column / 3)} Q ${sx + Math.min(80, column / 3) + 8} ${y} ${sx + Math.min(80, column / 3) + 8} ${y + 8} V ${y + 22} Q ${sx + Math.min(80, column / 3) + 8} ${y + 30} ${sx + Math.min(80, column / 3)} ${y + 30} H ${sx + targetOffsets[i]}` : `M ${start} ${y} H ${end}`;
    body += `<path d="${path}" fill="none" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth}"${dashed ? ' stroke-dasharray="6 4"' : ""} marker-end="url(#${open ? "seq-open" : "seq-filled"})"/>`;
    const labelLines = rowLines[i];
    const lx = self ? sx + 18 : (start + end) / 2;
    const ly = labelTops[i] + size * 1.1;
    const lw = Math.max(...labelLines.map((l) => measure2(l, size))) + 12;
    body += `<rect x="${self ? lx - 4 : lx - lw / 2}" y="${labelTops[i]}" width="${lw}" height="${labelLines.length * size * 1.4}" fill="${esc(theme.background === "transparent" ? theme.surface : theme.background)}"/>`;
    body += text(lx, ly, labelLines.join("\n"), theme, {
      anchor: self ? "start" : "middle"
    });
    if (kind === "destroy")
      body += `<path d="M ${tx - 10} ${y - 10} l 20 20 M ${tx - 10} ${y + 10} l 20 -20" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth + 1}"/>`;
    body += `</g>`;
  });
  body += text(
    40,
    height - 18,
    "\u5B9E\u5FC3\u7BAD\u5934 \u540C\u6B65 / \u8FD4\u56DE\u3000\u7A7A\u5FC3\u7BAD\u5934 \u5F02\u6B65 / \u521B\u5EFA\u3000\xD7 \u751F\u547D\u5468\u671F\u7ED3\u675F",
    theme,
    { anchor: "start", size: 11, fill: theme.muted }
  );
  return frame(spec, theme, width, height, body);
}
function renderFishbone(spec, theme) {
  spec = { ...spec, layout: resolveLayout(spec) };
  const data = spec.fishbone;
  const size = theme.fontSize;
  const leading = size * 1.4;
  const elementGap = spec.layout?.elementGap ?? 24;
  const regionGap = spec.layout?.regionGap ?? 40;
  const categories = data.categories.map((category, index) => {
    const rows = [];
    let offset = 0, maxDepth = 0;
    const visit = (cause2, depth, parent, path) => {
      const lines = wrap(cause2.label, 205, size);
      const rowIndex = rows.length;
      const height2 = Math.max(
        18 + elementGap,
        lines.length * leading + elementGap
      );
      rows.push({ cause: cause2, depth, parent, lines, offset, height: height2, path });
      offset += height2;
      maxDepth = Math.max(maxDepth, depth);
      cause2.children?.forEach((child, i) => visit(child, depth + 1, rowIndex, `${path}/children/${i}`));
    };
    category.causes.forEach((cause2, i) => visit(cause2, 0, -1, `categories/${index}/causes/${i}`));
    return {
      category,
      index,
      rows,
      span: Math.max(180, offset + 64),
      width: Math.max(
        400 + maxDepth * 26,
        measure2(category.label, size + 1) + 50
      )
    };
  });
  const columns = [];
  for (let i = 0; i < categories.length; i += 2)
    columns.push(Math.max(categories[i].width, categories[i + 1]?.width ?? 0));
  const headWidth = Math.max(300, theme.nodeWidth + 120);
  const effectSize = size + 3;
  const effectLines = wrap(data.effect, headWidth * 0.47, effectSize);
  const effectHeight = effectLines.length * effectSize * 1.4;
  const headHeight = Math.max(160, effectHeight * 1.8 + 48);
  const width = Math.max(
    920,
    150 + columns.reduce((sum, w) => sum + w, 0) + Math.max(0, columns.length - 1) * regionGap + headWidth + 80
  );
  const header = heading(
    spec,
    theme,
    width,
    "ROOT CAUSE / FISHBONE \xB7 \u539F\u56E0\u5206\u6790"
  );
  const topSpan = Math.max(
    180,
    headHeight / 2 + 24,
    ...categories.filter((c) => c.index % 2 === 0).map((c) => c.span)
  );
  const bottomSpan = Math.max(
    180,
    headHeight / 2 + 24,
    ...categories.filter((c) => c.index % 2 === 1).map((c) => c.span)
  );
  const categoryMargin = Math.max(
    62,
    ...categories.map(
      (c) => wrap(
        c.category.label,
        Math.min(
          c.width - 36,
          Math.max(130, measure2(c.category.label, size + 1) + 34)
        ) - 24,
        size + 1
      ).length * (size + 1) * 1.4 + 28
    )
  );
  const spineY = header.bottom + topSpan + categoryMargin;
  const height = spineY + bottomSpan + Math.max(110, categoryMargin + 48);
  const headX = width - headWidth - 48;
  let body = header.svg;
  body += `<path d="M 96 ${spineY} L 42 ${spineY - 40} Q 52 ${spineY} 42 ${spineY + 40} Z" fill="${esc(theme.surface)}" stroke="${esc(theme.secondary)}" stroke-width="${theme.lineWidth + 1}"/>`;
  body += line(
    96,
    spineY,
    headX + 28,
    spineY,
    theme.primary,
    theme.lineWidth + 2
  );
  const finX = headX - 65;
  body += `<path d="M ${finX - 42} ${spineY} l 18 -30 l 28 30 M ${finX - 42} ${spineY} l 18 30 l 28 -30" fill="${esc(theme.surface)}" stroke="${esc(theme.secondary)}" stroke-width="${theme.lineWidth}"/>`;
  let left = 125;
  for (let ci = 0; ci < columns.length; ci++) {
    const colWidth = columns[ci];
    for (const item of categories.filter(
      (c) => Math.floor(c.index / 2) === ci
    )) {
      const upper = item.index % 2 === 0;
      const direction = upper ? -1 : 1;
      const span = upper ? topSpan : bottomSpan;
      const outerY = spineY + direction * span;
      const attachX = left + colWidth - 20;
      const categoryWidth = Math.min(
        colWidth - 36,
        Math.max(130, measure2(item.category.label, size + 1) + 34)
      );
      const tipX = left + colWidth - categoryWidth / 2 - 18;
      const categoryLines = wrap(
        item.category.label,
        categoryWidth - 24,
        size + 1
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
        theme.lineWidth + 0.5
      );
      const centers = item.rows.map(
        (row) => (upper ? outerY : spineY) + 35 + row.offset + row.height / 2
      );
      item.rows.forEach((row, ri) => {
        body += `<g data-editor-key="${row.path}">`;
        const ry = centers[ri];
        const labelX = left + 12 + row.depth * 26;
        const lineY = ry + row.lines.length * leading / 2 + 6;
        if (row.parent < 0) {
          const ratio = Math.abs(lineY - spineY) / span;
          const boneX = attachX + (tipX - attachX) * ratio;
          body += line(
            labelX,
            lineY,
            boneX,
            lineY,
            theme.border,
            theme.lineWidth
          );
        } else {
          const parentRow = item.rows[row.parent];
          const parentX = left + 12 + parentRow.depth * 26;
          const parentY = centers[row.parent] + parentRow.lines.length * leading / 2 + 6;
          body += `<path d="M ${parentX + 8} ${parentY} V ${lineY} H ${labelX}" fill="none" stroke="${esc(theme.border)}" stroke-width="${theme.lineWidth}"/>`;
        }
        body += `<circle cx="${labelX}" cy="${lineY}" r="${row.depth === 0 ? 3 : 2}" fill="${esc(row.depth === 0 ? theme.secondary : theme.muted)}"/>`;
        body += text(
          labelX + 5,
          ry - (row.lines.length - 1) * leading / 2,
          row.lines.join("\n"),
          theme,
          {
            anchor: "start",
            size,
            fill: row.depth === 0 ? theme.text : theme.muted,
            weight: row.depth === 0 ? 600 : 400
          }
        );
        body += `</g>`;
      });
      body += `<rect x="${tipX - categoryWidth / 2}" y="${categoryY}" width="${categoryWidth}" height="${categoryHeight}" rx="${Math.min(theme.radius, 6)}" fill="${esc(theme.surface)}" stroke="${esc(theme.secondary)}" stroke-width="${theme.lineWidth}"/>`;
      body += text(
        tipX,
        categoryY + 12 + size + 1,
        categoryLines.join("\n"),
        theme,
        { size: size + 1, anchor: "middle", weight: 700 }
      );
      body += `</g>`;
    }
    left += colWidth + regionGap;
  }
  body += `<g data-editor-key="effect">`;
  body += `<path d="M ${headX + 25} ${spineY} Q ${headX + 2} ${spineY - headHeight * 0.46} ${headX + 55} ${spineY - headHeight / 2} Q ${headX + headWidth * 0.76} ${spineY - headHeight * 0.63} ${headX + headWidth} ${spineY} Q ${headX + headWidth * 0.76} ${spineY + headHeight * 0.63} ${headX + 55} ${spineY + headHeight / 2} Q ${headX + 2} ${spineY + headHeight * 0.46} ${headX + 25} ${spineY} Z" fill="${esc(theme.surface)}" stroke="${esc(theme.primary)}" stroke-width="${theme.lineWidth + 1}"/>`;
  body += `<path d="M ${headX + 43} ${spineY - headHeight * 0.3} Q ${headX + 61} ${spineY} ${headX + 43} ${spineY + headHeight * 0.3}" fill="none" stroke="${esc(theme.secondary)}" stroke-width="${theme.lineWidth}"/>`;
  body += `<circle cx="${headX + headWidth - 49}" cy="${spineY - headHeight * 0.25}" r="5" fill="${esc(theme.primary)}"/>`;
  body += text(
    headX + headWidth / 2 + 8,
    spineY + 5 - (effectLines.length - 1) * effectSize * 0.7,
    effectLines.join("\n"),
    theme,
    { size: effectSize, anchor: "middle", weight: 700 }
  );
  body += `</g>`;
  body += text(
    40,
    height - 24,
    `${data.categories.length} \u4E2A\u539F\u56E0\u7EF4\u5EA6 \xB7 \u5206\u652F\u9010\u7EA7\u5C55\u5F00 \xB7 \u9C7C\u5934\u8868\u793A\u89C2\u5BDF\u5230\u7684\u7ED3\u679C`,
    theme,
    { anchor: "start", size: 11, fill: theme.muted }
  );
  return frame(spec, theme, width, height, body);
}

// src/render.ts
async function renderDiagram(input) {
  const spec = validateSpec(input), theme = resolveTheme(spec);
  if (spec.type === "sequence") return renderSequence(spec, theme);
  if (spec.type === "fishbone") return renderFishbone(spec, theme);
  return renderGraph(spec, theme);
}

// src/native.ts
function documentFromHtml(html) {
  const tree = parse(html);
  const blocks = [];
  function visit(node) {
    if ("attrs" in node && node.attrs.some(
      (attribute) => attribute.name === "id" && attribute.value === "diagram-data"
    )) {
      if (node.tagName !== "script" || !node.attrs.some(
        (attribute) => attribute.name === "type" && attribute.value.toLowerCase() === "application/json"
      ))
        throw new Error("#diagram-data \u5FC5\u987B\u662F application/json script \u6570\u636E\u5757");
      blocks.push(
        node.childNodes.map((child) => "value" in child ? child.value : "").join("")
      );
    }
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
  }
  visit(tree);
  if (blocks.length !== 1)
    throw new Error(
      blocks.length ? "HTML \u542B\u6709\u591A\u4E2A #diagram-data\uFF0C\u65E0\u6CD5\u786E\u5B9A\u5BFC\u51FA\u6570\u636E" : "HTML \u7F3A\u5C11 #diagram-data\uFF1B\u53EA\u80FD\u8BFB\u53D6 UML Studio \u5185\u5D4C\u7684\u7ED3\u6784\u5316\u6570\u636E"
    );
  return normalizeDocument(JSON.parse(blocks[0].replace(/^\uFEFF/, "")));
}
async function readDiagramFile(path) {
  const source = (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
  return source.trimStart().startsWith("<") ? documentFromHtml(source) : normalizeDocument(JSON.parse(source));
}
var MAX_PIXELS = 4e7;
var MAX_DIMENSION = 32767;
async function renderNativeImage(spec, options = {}) {
  const format = options.format ?? "png", scale = options.scale ?? (format === "svg" ? 1 : 2), quality = options.quality ?? 0.92;
  if (!["svg", "png", "jpeg", "webp"].includes(format))
    throw new Error(`\u4E0D\u652F\u6301\u7684\u56FE\u7247\u683C\u5F0F\uFF1A${format}`);
  if (!Number.isFinite(scale) || scale < 0.1 || scale > 4)
    throw new Error("\u5BFC\u51FA\u500D\u7387\u5FC5\u987B\u5728 0.1\u20134 \u4E4B\u95F4");
  if (!Number.isFinite(quality) || quality < 0 || quality > 1)
    throw new Error("\u56FE\u7247\u8D28\u91CF\u5FC5\u987B\u5728 0\u20131 \u4E4B\u95F4");
  const diagram = await renderDiagram(spec);
  if (format === "svg" && scale === 1)
    return { data: Buffer.from(diagram.svg), width: diagram.width, height: diagram.height, format };
  const width = Math.max(1, Math.ceil(diagram.width * scale)), height = Math.max(1, Math.ceil(diagram.height * scale));
  const svg = diagram.svg.replace(/^(<svg\b[^>]*\bwidth=")[^"]+/, `$1${width}`).replace(/^(<svg\b[^>]*\bheight=")[^"]+/, `$1${height}`);
  if (format === "svg")
    return { data: Buffer.from(svg), width, height, format };
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS)
    throw new Error(
      `\u5BFC\u51FA\u5C3A\u5BF8 ${width} \xD7 ${height} \u8D85\u8FC7\u9650\u5236\uFF0C\u8BF7\u964D\u4F4E\u500D\u7387\u6216\u4F7F\u7528 SVG`
    );
  const rendered = new Resvg(svg, {
    font: {
      loadSystemFonts: true,
      fontFiles: options.fontFiles,
      defaultFontFamily: process.platform === "win32" ? "Microsoft YaHei" : "Noto Sans CJK SC",
      sansSerifFamily: process.platform === "win32" ? "Microsoft YaHei" : "Noto Sans CJK SC"
    },
    languages: ["zh-CN", "en"],
    textRendering: 1,
    ...options.background ? { background: options.background } : {}
  }).render();
  const png = rendered.asPng();
  if (format === "png")
    return {
      data: png,
      width: rendered.width,
      height: rendered.height,
      format
    };
  let encoder = sharp(png, { limitInputPixels: MAX_PIXELS });
  if (format === "jpeg")
    encoder = encoder.flatten({
      background: options.background && options.background !== "transparent" ? options.background : "#ffffff"
    });
  const encoded = await (format === "jpeg" ? encoder.jpeg({ quality: Math.max(1, Math.round(quality * 100)) }) : encoder.webp({ quality: Math.max(1, Math.round(quality * 100)) })).toBuffer({ resolveWithObject: true });
  return {
    data: encoded.data,
    width: encoded.info.width,
    height: encoded.info.height,
    format
  };
}
export {
  documentFromHtml,
  readDiagramFile,
  renderNativeImage
};

/*
UML Studio third-party notices. Dependencies are used unmodified.
ELK.js source: https://github.com/kieler/elkjs

@resvg/resvg-js@2.6.2 — MPL-2.0
Source: https://www.npmjs.com/package/@resvg/resvg-js/v/2.6.2
Mozilla Public License Version 2.0
==================================

1. Definitions
--------------

1.1. "Contributor"
    means each individual or legal entity that creates, contributes to
    the creation of, or owns Covered Software.

1.2. "Contributor Version"
    means the combination of the Contributions of others (if any) used
    by a Contributor and that particular Contributor's Contribution.

1.3. "Contribution"
    means Covered Software of a particular Contributor.

1.4. "Covered Software"
    means Source Code Form to which the initial Contributor has attached
    the notice in Exhibit A, the Executable Form of such Source Code
    Form, and Modifications of such Source Code Form, in each case
    including portions thereof.

1.5. "Incompatible With Secondary Licenses"
    means

    (a) that the initial Contributor has attached the notice described
        in Exhibit B to the Covered Software; or

    (b) that the Covered Software was made available under the terms of
        version 1.1 or earlier of the License, but not also under the
        terms of a Secondary License.

1.6. "Executable Form"
    means any form of the work other than Source Code Form.

1.7. "Larger Work"
    means a work that combines Covered Software with other material, in
    a separate file or files, that is not Covered Software.

1.8. "License"
    means this document.

1.9. "Licensable"
    means having the right to grant, to the maximum extent possible,
    whether at the time of the initial grant or subsequently, any and
    all of the rights conveyed by this License.

1.10. "Modifications"
    means any of the following:

    (a) any file in Source Code Form that results from an addition to,
        deletion from, or modification of the contents of Covered
        Software; or

    (b) any new file in Source Code Form that contains any Covered
        Software.

1.11. "Patent Claims" of a Contributor
    means any patent claim(s), including without limitation, method,
    process, and apparatus claims, in any patent Licensable by such
    Contributor that would be infringed, but for the grant of the
    License, by the making, using, selling, offering for sale, having
    made, import, or transfer of either its Contributions or its
    Contributor Version.

1.12. "Secondary License"
    means either the GNU General Public License, Version 2.0, the GNU
    Lesser General Public License, Version 2.1, the GNU Affero General
    Public License, Version 3.0, or any later versions of those
    licenses.

1.13. "Source Code Form"
    means the form of the work preferred for making modifications.

1.14. "You" (or "Your")
    means an individual or a legal entity exercising rights under this
    License. For legal entities, "You" includes any entity that
    controls, is controlled by, or is under common control with You. For
    purposes of this definition, "control" means (a) the power, direct
    or indirect, to cause the direction or management of such entity,
    whether by contract or otherwise, or (b) ownership of more than
    fifty percent (50%) of the outstanding shares or beneficial
    ownership of such entity.

2. License Grants and Conditions
--------------------------------

2.1. Grants

Each Contributor hereby grants You a world-wide, royalty-free,
non-exclusive license:

(a) under intellectual property rights (other than patent or trademark)
    Licensable by such Contributor to use, reproduce, make available,
    modify, display, perform, distribute, and otherwise exploit its
    Contributions, either on an unmodified basis, with Modifications, or
    as part of a Larger Work; and

(b) under Patent Claims of such Contributor to make, use, sell, offer
    for sale, have made, import, and otherwise transfer either its
    Contributions or its Contributor Version.

2.2. Effective Date

The licenses granted in Section 2.1 with respect to any Contribution
become effective for each Contribution on the date the Contributor first
distributes such Contribution.

2.3. Limitations on Grant Scope

The licenses granted in this Section 2 are the only rights granted under
this License. No additional rights or licenses will be implied from the
distribution or licensing of Covered Software under this License.
Notwithstanding Section 2.1(b) above, no patent license is granted by a
Contributor:

(a) for any code that a Contributor has removed from Covered Software;
    or

(b) for infringements caused by: (i) Your and any other third party's
    modifications of Covered Software, or (ii) the combination of its
    Contributions with other software (except as part of its Contributor
    Version); or

(c) under Patent Claims infringed by Covered Software in the absence of
    its Contributions.

This License does not grant any rights in the trademarks, service marks,
or logos of any Contributor (except as may be necessary to comply with
the notice requirements in Section 3.4).

2.4. Subsequent Licenses

No Contributor makes additional grants as a result of Your choice to
distribute the Covered Software under a subsequent version of this
License (see Section 10.2) or under the terms of a Secondary License (if
permitted under the terms of Section 3.3).

2.5. Representation

Each Contributor represents that the Contributor believes its
Contributions are its original creation(s) or it has sufficient rights
to grant the rights to its Contributions conveyed by this License.

2.6. Fair Use

This License is not intended to limit any rights You have under
applicable copyright doctrines of fair use, fair dealing, or other
equivalents.

2.7. Conditions

Sections 3.1, 3.2, 3.3, and 3.4 are conditions of the licenses granted
in Section 2.1.

3. Responsibilities
-------------------

3.1. Distribution of Source Form

All distribution of Covered Software in Source Code Form, including any
Modifications that You create or to which You contribute, must be under
the terms of this License. You must inform recipients that the Source
Code Form of the Covered Software is governed by the terms of this
License, and how they can obtain a copy of this License. You may not
attempt to alter or restrict the recipients' rights in the Source Code
Form.

3.2. Distribution of Executable Form

If You distribute Covered Software in Executable Form then:

(a) such Covered Software must also be made available in Source Code
    Form, as described in Section 3.1, and You must inform recipients of
    the Executable Form how they can obtain a copy of such Source Code
    Form by reasonable means in a timely manner, at a charge no more
    than the cost of distribution to the recipient; and

(b) You may distribute such Executable Form under the terms of this
    License, or sublicense it under different terms, provided that the
    license for the Executable Form does not attempt to limit or alter
    the recipients' rights in the Source Code Form under this License.

3.3. Distribution of a Larger Work

You may create and distribute a Larger Work under terms of Your choice,
provided that You also comply with the requirements of this License for
the Covered Software. If the Larger Work is a combination of Covered
Software with a work governed by one or more Secondary Licenses, and the
Covered Software is not Incompatible With Secondary Licenses, this
License permits You to additionally distribute such Covered Software
under the terms of such Secondary License(s), so that the recipient of
the Larger Work may, at their option, further distribute the Covered
Software under the terms of either this License or such Secondary
License(s).

3.4. Notices

You may not remove or alter the substance of any license notices
(including copyright notices, patent notices, disclaimers of warranty,
or limitations of liability) contained within the Source Code Form of
the Covered Software, except that You may alter any license notices to
the extent required to remedy known factual inaccuracies.

3.5. Application of Additional Terms

You may choose to offer, and to charge a fee for, warranty, support,
indemnity or liability obligations to one or more recipients of Covered
Software. However, You may do so only on Your own behalf, and not on
behalf of any Contributor. You must make it absolutely clear that any
such warranty, support, indemnity, or liability obligation is offered by
You alone, and You hereby agree to indemnify every Contributor for any
liability incurred by such Contributor as a result of warranty, support,
indemnity or liability terms You offer. You may include additional
disclaimers of warranty and limitations of liability specific to any
jurisdiction.

4. Inability to Comply Due to Statute or Regulation
---------------------------------------------------

If it is impossible for You to comply with any of the terms of this
License with respect to some or all of the Covered Software due to
statute, judicial order, or regulation then You must: (a) comply with
the terms of this License to the maximum extent possible; and (b)
describe the limitations and the code they affect. Such description must
be placed in a text file included with all distributions of the Covered
Software under this License. Except to the extent prohibited by statute
or regulation, such description must be sufficiently detailed for a
recipient of ordinary skill to be able to understand it.

5. Termination
--------------

5.1. The rights granted under this License will terminate automatically
if You fail to comply with any of its terms. However, if You become
compliant, then the rights granted under this License from a particular
Contributor are reinstated (a) provisionally, unless and until such
Contributor explicitly and finally terminates Your grants, and (b) on an
ongoing basis, if such Contributor fails to notify You of the
non-compliance by some reasonable means prior to 60 days after You have
come back into compliance. Moreover, Your grants from a particular
Contributor are reinstated on an ongoing basis if such Contributor
notifies You of the non-compliance by some reasonable means, this is the
first time You have received notice of non-compliance with this License
from such Contributor, and You become compliant prior to 30 days after
Your receipt of the notice.

5.2. If You initiate litigation against any entity by asserting a patent
infringement claim (excluding declaratory judgment actions,
counter-claims, and cross-claims) alleging that a Contributor Version
directly or indirectly infringes any patent, then the rights granted to
You by any and all Contributors for the Covered Software under Section
2.1 of this License shall terminate.

5.3. In the event of termination under Sections 5.1 or 5.2 above, all
end user license agreements (excluding distributors and resellers) which
have been validly granted by You or Your distributors under this License
prior to termination shall survive termination.

************************************************************************
*                                                                      *
*  6. Disclaimer of Warranty                                           *
*  -------------------------                                           *
*                                                                      *
*  Covered Software is provided under this License on an "as is"       *
*  basis, without warranty of any kind, either expressed, implied, or  *
*  statutory, including, without limitation, warranties that the       *
*  Covered Software is free of defects, merchantable, fit for a        *
*  particular purpose or non-infringing. The entire risk as to the     *
*  quality and performance of the Covered Software is with You.        *
*  Should any Covered Software prove defective in any respect, You     *
*  (not any Contributor) assume the cost of any necessary servicing,   *
*  repair, or correction. This disclaimer of warranty constitutes an   *
*  essential part of this License. No use of any Covered Software is   *
*  authorized under this License except under this disclaimer.         *
*                                                                      *
************************************************************************

************************************************************************
*                                                                      *
*  7. Limitation of Liability                                          *
*  --------------------------                                          *
*                                                                      *
*  Under no circumstances and under no legal theory, whether tort      *
*  (including negligence), contract, or otherwise, shall any           *
*  Contributor, or anyone who distributes Covered Software as          *
*  permitted above, be liable to You for any direct, indirect,         *
*  special, incidental, or consequential damages of any character      *
*  including, without limitation, damages for lost profits, loss of    *
*  goodwill, work stoppage, computer failure or malfunction, or any    *
*  and all other commercial damages or losses, even if such party      *
*  shall have been informed of the possibility of such damages. This   *
*  limitation of liability shall not apply to liability for death or   *
*  personal injury resulting from such party's negligence to the       *
*  extent applicable law prohibits such limitation. Some               *
*  jurisdictions do not allow the exclusion or limitation of           *
*  incidental or consequential damages, so this exclusion and          *
*  limitation may not apply to You.                                    *
*                                                                      *
************************************************************************

8. Litigation
-------------

Any litigation relating to this License may be brought only in the
courts of a jurisdiction where the defendant maintains its principal
place of business and such litigation shall be governed by laws of that
jurisdiction, without reference to its conflict-of-law provisions.
Nothing in this Section shall prevent a party's ability to bring
cross-claims or counter-claims.

9. Miscellaneous
----------------

This License represents the complete agreement concerning the subject
matter hereof. If any provision of this License is held to be
unenforceable, such provision shall be reformed only to the extent
necessary to make it enforceable. Any law or regulation which provides
that the language of a contract shall be construed against the drafter
shall not be used to construe this License against a Contributor.

10. Versions of the License
---------------------------

10.1. New Versions

Mozilla Foundation is the license steward. Except as provided in Section
10.3, no one other than the license steward has the right to modify or
publish new versions of this License. Each version will be given a
distinguishing version number.

10.2. Effect of New Versions

You may distribute the Covered Software under the terms of the version
of the License under which You originally received the Covered Software,
or under the terms of any subsequent version published by the license
steward.

10.3. Modified Versions

If you create software not governed by this License, and you want to
create a new license for such software, you may create and use a
modified version of this License if you rename the license and remove
any references to the name of the license steward (except to note that
such modified license differs from this License).

10.4. Distributing Source Code Form that is Incompatible With Secondary
Licenses

If You choose to distribute Source Code Form that is Incompatible With
Secondary Licenses under the terms of this version of the License, the
notice described in Exhibit B of this License must be attached.

Exhibit A - Source Code Form License Notice
-------------------------------------------

  This Source Code Form is subject to the terms of the Mozilla Public
  License, v. 2.0. If a copy of the MPL was not distributed with this
  file, You can obtain one at http://mozilla.org/MPL/2.0/.

If it is not possible or desirable to put the notice in a particular
file, then You may include the notice in a location (such as a LICENSE
file in a relevant directory) where a recipient would be likely to look
for such a notice.

You may add additional accurate notices of copyright ownership.

Exhibit B - "Incompatible With Secondary Licenses" Notice
---------------------------------------------------------

  This Source Code Form is "Incompatible With Secondary Licenses", as
  defined by the Mozilla Public License, v. 2.0.

========================================================================

ajv@8.20.0 — MIT
Source: https://www.npmjs.com/package/ajv/v/8.20.0
The MIT License (MIT)

Copyright (c) 2015-2021 Evgeny Poberezkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.



========================================================================

fast-deep-equal@3.1.3 — MIT
Source: https://www.npmjs.com/package/fast-deep-equal/v/3.1.3
MIT License

Copyright (c) 2017 Evgeny Poberezkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


========================================================================

fast-uri@3.1.8 — BSD-3-Clause
Source: https://www.npmjs.com/package/fast-uri/v/3.1.8
Copyright (c) 2011-2021, Gary Court until https://github.com/garycourt/uri-js/commit/a1acf730b4bba3f1097c9f52e7d9d3aba8cdcaae
Copyright (c) 2021-present The Fastify team <https://github.com/fastify/fastify#team>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * The names of any contributors may not be used to endorse or promote
      products derived from this software without specific prior written
      permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS AND CONTRIBUTORS BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

                                  *   *   *

The complete list of contributors can be found at:
- https://github.com/garycourt/uri-js/graphs/contributors

========================================================================

json-schema-traverse@1.0.0 — MIT
Source: https://www.npmjs.com/package/json-schema-traverse/v/1.0.0
MIT License

Copyright (c) 2017 Evgeny Poberezkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


========================================================================

require-from-string@2.0.2 — MIT
Source: https://www.npmjs.com/package/require-from-string/v/2.0.2
The MIT License (MIT)

Copyright (c) Vsevolod Strukchinsky <floatdrop@gmail.com> (github.com/floatdrop)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

elkjs@0.10.2 — EPL-2.0
Source: https://www.npmjs.com/package/elkjs/v/0.10.2
# Eclipse Public License - v 2.0

THE ACCOMPANYING PROGRAM IS PROVIDED UNDER THE TERMS OF THIS ECLIPSE
PUBLIC LICENSE (“AGREEMENT”). ANY USE, REPRODUCTION OR DISTRIBUTION OF
THE PROGRAM CONSTITUTES RECIPIENT'S ACCEPTANCE OF THIS AGREEMENT.

## 1. DEFINITIONS

“Contribution” means:

-   a\) in the case of the initial Contributor, the initial content
    Distributed under this Agreement, and
-   b\) in the case of each subsequent Contributor:
    -   i\) changes to the Program, and
    -   ii\) additions to the Program;

    where such changes and/or additions to the Program originate from
    and are Distributed by that particular Contributor. A Contribution
    “originates” from a Contributor if it was added to the Program by
    such Contributor itself or anyone acting on such Contributor's
    behalf. Contributions do not include changes or additions to the
    Program that are not Modified Works.

“Contributor” means any person or entity that Distributes the Program.

“Licensed Patents” mean patent claims licensable by a Contributor which
are necessarily infringed by the use or sale of its Contribution alone
or when combined with the Program.

“Program” means the Contributions Distributed in accordance with this
Agreement.

“Recipient” means anyone who receives the Program under this Agreement
or any Secondary License (as applicable), including Contributors.

“Derivative Works” shall mean any work, whether in Source Code or other
form, that is based on (or derived from) the Program and for which the
editorial revisions, annotations, elaborations, or other modifications
represent, as a whole, an original work of authorship.

“Modified Works” shall mean any work in Source Code or other form that
results from an addition to, deletion from, or modification of the
contents of the Program, including, for purposes of clarity any new file
in Source Code form that contains any contents of the Program. Modified
Works shall not include works that contain only declarations,
interfaces, types, classes, structures, or files of the Program solely
in each case in order to link to, bind by name, or subclass the Program
or Modified Works thereof.

“Distribute” means the acts of a) distributing or b) making available in
any manner that enables the transfer of a copy.

“Source Code” means the form of a Program preferred for making
modifications, including but not limited to software source code,
documentation source, and configuration files.

“Secondary License” means either the GNU General Public License, Version
2.0, or any later versions of that license, including any exceptions or
additional permissions as identified by the initial Contributor.

## 2. GRANT OF RIGHTS

-   a\) Subject to the terms of this Agreement, each Contributor hereby
    grants Recipient a non-exclusive, worldwide, royalty-free copyright
    license to reproduce, prepare Derivative Works of, publicly display,
    publicly perform, Distribute and sublicense the Contribution of such
    Contributor, if any, and such Derivative Works.
-   b\) Subject to the terms of this Agreement, each Contributor hereby
    grants Recipient a non-exclusive, worldwide, royalty-free patent license
    under Licensed Patents to make, use, sell, offer to sell, import and
    otherwise transfer the Contribution of such Contributor, if any, in
    Source Code or other form. This patent license shall apply to the
    combination of the Contribution and the Program if, at the time the
    Contribution is added by the Contributor, such addition of the
    Contribution causes such combination to be covered by the
    Licensed Patents. The patent license shall not apply to any other
    combinations which include the Contribution. No hardware per se is
    licensed hereunder.
-   c\) Recipient understands that although each Contributor grants the
    licenses to its Contributions set forth herein, no assurances are
    provided by any Contributor that the Program does not infringe the
    patent or other intellectual property rights of any other entity. Each
    Contributor disclaims any liability to Recipient for claims brought by
    any other entity based on infringement of intellectual property rights
    or otherwise. As a condition to exercising the rights and licenses
    granted hereunder, each Recipient hereby assumes sole responsibility to
    secure any other intellectual property rights needed, if any. For
    example, if a third party patent license is required to allow Recipient
    to Distribute the Program, it is Recipient's responsibility to acquire
    that license before distributing the Program.
-   d\) Each Contributor represents that to its knowledge it has sufficient
    copyright rights in its Contribution, if any, to grant the copyright
    license set forth in this Agreement.
-   e\) Notwithstanding the terms of any Secondary License, no Contributor
    makes additional grants to any Recipient (other than those set forth in
    this Agreement) as a result of such Recipient's receipt of the Program
    under the terms of a Secondary License (if permitted under the terms of
    Section 3).

## 3. REQUIREMENTS

3.1 If a Contributor Distributes the Program in any form, then:

-   a\) the Program must also be made available as Source Code, in accordance
    with section 3.2, and the Contributor must accompany the Program with a
    statement that the Source Code for the Program is available under this
    Agreement, and informs Recipients how to obtain it in a reasonable
    manner on or through a medium customarily used for software exchange;
    and
-   b\) the Contributor may Distribute the Program under a license different
    than this Agreement, provided that such license:
    -   i\) effectively disclaims on behalf of all other Contributors all
        warranties and conditions, express and implied, including warranties or
        conditions of title and non-infringement, and implied warranties or
        conditions of merchantability and fitness for a particular purpose;
    -   ii\) effectively excludes on behalf of all other Contributors all
        liability for damages, including direct, indirect, special, incidental
        and consequential damages, such as lost profits;
    -   iii\) does not attempt to limit or alter the recipients' rights in the
        Source Code under section 3.2; and
    -   iv\) requires any subsequent distribution of the Program by any party to
        be under a license that satisfies the requirements of this section 3.

3.2 When the Program is Distributed as Source Code:

-   a\) it must be made available under this Agreement, or if the Program (i)
    is combined with other material in a separate file or files made
    available under a Secondary License, and (ii) the initial Contributor
    attached to the Source Code the notice described in Exhibit A of this
    Agreement, then the Program may be made available under the terms of
    such Secondary Licenses, and
-   b\) a copy of this Agreement must be included with each copy of
    the Program.

3.3 Contributors may not remove or alter any copyright, patent,
trademark, attribution notices, disclaimers of warranty, or limitations
of liability (‘notices’) contained within the Program from any copy of
the Program which they Distribute, provided that Contributors may add
their own appropriate notices.

## 4. COMMERCIAL DISTRIBUTION

Commercial distributors of software may accept certain responsibilities
with respect to end users, business partners and the like. While this
license is intended to facilitate the commercial use of the Program, the
Contributor who includes the Program in a commercial product offering
should do so in a manner which does not create potential liability for
other Contributors. Therefore, if a Contributor includes the Program in
a commercial product offering, such Contributor (“Commercial
Contributor”) hereby agrees to defend and indemnify every other
Contributor (“Indemnified Contributor”) against any losses, damages and
costs (collectively “Losses”) arising from claims, lawsuits and other
legal actions brought by a third party against the Indemnified
Contributor to the extent caused by the acts or omissions of such
Commercial Contributor in connection with its distribution of the
Program in a commercial product offering. The obligations in this
section do not apply to any claims or Losses relating to any actual or
alleged intellectual property infringement. In order to qualify, an
Indemnified Contributor must: a) promptly notify the Commercial
Contributor in writing of such claim, and b) allow the Commercial
Contributor to control, and cooperate with the Commercial Contributor
in, the defense and any related settlement negotiations. The Indemnified
Contributor may participate in any such claim at its own expense.

For example, a Contributor might include the Program in a commercial
product offering, Product X. That Contributor is then a Commercial
Contributor. If that Commercial Contributor then makes performance
claims, or offers warranties related to Product X, those performance
claims and warranties are such Commercial Contributor's responsibility
alone. Under this section, the Commercial Contributor would have to
defend claims against the other Contributors related to those
performance claims and warranties, and if a court requires any other
Contributor to pay any damages as a result, the Commercial Contributor
must pay those damages.

## 5. NO WARRANTY {#warranty}

EXCEPT AS EXPRESSLY SET FORTH IN THIS AGREEMENT, AND TO THE EXTENT
PERMITTED BY APPLICABLE LAW, THE PROGRAM IS PROVIDED ON AN “AS IS”
BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR
IMPLIED INCLUDING, WITHOUT LIMITATION, ANY WARRANTIES OR CONDITIONS OF
TITLE, NON-INFRINGEMENT, MERCHANTABILITY OR FITNESS FOR A PARTICULAR
PURPOSE. Each Recipient is solely responsible for determining the
appropriateness of using and distributing the Program and assumes all
risks associated with its exercise of rights under this Agreement,
including but not limited to the risks and costs of program errors,
compliance with applicable laws, damage to or loss of data, programs or
equipment, and unavailability or interruption of operations.

## 6. DISCLAIMER OF LIABILITY {#disclaimer}

EXCEPT AS EXPRESSLY SET FORTH IN THIS AGREEMENT, AND TO THE EXTENT
PERMITTED BY APPLICABLE LAW, NEITHER RECIPIENT NOR ANY CONTRIBUTORS
SHALL HAVE ANY LIABILITY FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING WITHOUT LIMITATION LOST
PROFITS), HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OR DISTRIBUTION OF THE PROGRAM OR THE
EXERCISE OF ANY RIGHTS GRANTED HEREUNDER, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGES.

## 7. GENERAL

If any provision of this Agreement is invalid or unenforceable under
applicable law, it shall not affect the validity or enforceability of
the remainder of the terms of this Agreement, and without further action
by the parties hereto, such provision shall be reformed to the minimum
extent necessary to make such provision valid and enforceable.

If Recipient institutes patent litigation against any entity (including
a cross-claim or counterclaim in a lawsuit) alleging that the Program
itself (excluding combinations of the Program with other software or
hardware) infringes such Recipient's patent(s), then such Recipient's
rights granted under Section 2(b) shall terminate as of the date such
litigation is filed.

All Recipient's rights under this Agreement shall terminate if it fails
to comply with any of the material terms or conditions of this Agreement
and does not cure such failure in a reasonable period of time after
becoming aware of such noncompliance. If all Recipient's rights under
this Agreement terminate, Recipient agrees to cease use and distribution
of the Program as soon as reasonably practicable. However, Recipient's
obligations under this Agreement and any licenses granted by Recipient
relating to the Program shall continue and survive.

Everyone is permitted to copy and distribute copies of this Agreement,
but in order to avoid inconsistency the Agreement is copyrighted and may
only be modified in the following manner. The Agreement Steward reserves
the right to publish new versions (including revisions) of this
Agreement from time to time. No one other than the Agreement Steward has
the right to modify this Agreement. The Eclipse Foundation is the
initial Agreement Steward. The Eclipse Foundation may assign the
responsibility to serve as the Agreement Steward to a suitable separate
entity. Each new version of the Agreement will be given a distinguishing
version number. The Program (including Contributions) may always be
Distributed subject to the version of the Agreement under which it was
received. In addition, after a new version of the Agreement is
published, Contributor may elect to Distribute the Program (including
its Contributions) under the new version.

Except as expressly stated in Sections 2(a) and 2(b) above, Recipient
receives no rights or licenses to the intellectual property of any
Contributor under this Agreement, whether expressly, by implication,
estoppel or otherwise. All rights in the Program not expressly granted
under this Agreement are reserved. Nothing in this Agreement is intended
to be enforceable by any entity that is not a Contributor or Recipient.
No third-party beneficiary rights are created under this Agreement.

## Exhibit A – Form of Secondary Licenses Notice {#exhibit-a}

“This Source Code may also be made available under the following
Secondary Licenses when the conditions for such availability set forth
in the Eclipse Public License, v. 2.0 are satisfied: {name license(s),
version(s), and exceptions or additional permissions here}.”

> Simply including a copy of this Agreement, including this Exhibit A is
> not sufficient to license the Source Code under Secondary Licenses.
>
> If it is not possible or desirable to put the notice in a particular
> file, then You may include the notice in a location (such as a LICENSE
> file in a relevant directory) where a recipient would be likely to
> look for such a notice.
>
> You may add additional accurate notices of copyright ownership.


========================================================================

parse5@8.0.1 — MIT
Source: https://www.npmjs.com/package/parse5/v/8.0.1
Copyright (c) 2013-2019 Ivan Nikulin (ifaaan@gmail.com, https://github.com/inikulin)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

entities@8.1.0 — BSD-2-Clause
Source: https://www.npmjs.com/package/entities/v/8.1.0
Copyright (c) Felix Böhm
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


========================================================================

sharp@0.35.5 — Apache-2.0
Source: https://www.npmjs.com/package/sharp/v/0.35.5
Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and
distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the copyright
owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all other entities
that control, are controlled by, or are under common control with that entity.
For the purposes of this definition, "control" means (i) the power, direct or
indirect, to cause the direction or management of such entity, whether by
contract or otherwise, or (ii) ownership of fifty percent (50%) or more of the
outstanding shares, or (iii) beneficial ownership of such entity.

"You" (or "Your") shall mean an individual or Legal Entity exercising
permissions granted by this License.

"Source" form shall mean the preferred form for making modifications, including
but not limited to software source code, documentation source, and configuration
files.

"Object" form shall mean any form resulting from mechanical transformation or
translation of a Source form, including but not limited to compiled object code,
generated documentation, and conversions to other media types.

"Work" shall mean the work of authorship, whether in Source or Object form, made
available under the License, as indicated by a copyright notice that is included
in or attached to the work (an example is provided in the Appendix below).

"Derivative Works" shall mean any work, whether in Source or Object form, that
is based on (or derived from) the Work and for which the editorial revisions,
annotations, elaborations, or other modifications represent, as a whole, an
original work of authorship. For the purposes of this License, Derivative Works
shall not include works that remain separable from, or merely link (or bind by
name) to the interfaces of, the Work and Derivative Works thereof.

"Contribution" shall mean any work of authorship, including the original version
of the Work and any modifications or additions to that Work or Derivative Works
thereof, that is intentionally submitted to Licensor for inclusion in the Work
by the copyright owner or by an individual or Legal Entity authorized to submit
on behalf of the copyright owner. For the purposes of this definition,
"submitted" means any form of electronic, verbal, or written communication sent
to the Licensor or its representatives, including but not limited to
communication on electronic mailing lists, source code control systems, and
issue tracking systems that are managed by, or on behalf of, the Licensor for
the purpose of discussing and improving the Work, but excluding communication
that is conspicuously marked or otherwise designated in writing by the copyright
owner as "Not a Contribution."

"Contributor" shall mean Licensor and any individual or Legal Entity on behalf
of whom a Contribution has been received by Licensor and subsequently
incorporated within the Work.

2. Grant of Copyright License.

Subject to the terms and conditions of this License, each Contributor hereby
grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free,
irrevocable copyright license to reproduce, prepare Derivative Works of,
publicly display, publicly perform, sublicense, and distribute the Work and such
Derivative Works in Source or Object form.

3. Grant of Patent License.

Subject to the terms and conditions of this License, each Contributor hereby
grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free,
irrevocable (except as stated in this section) patent license to make, have
made, use, offer to sell, sell, import, and otherwise transfer the Work, where
such license applies only to those patent claims licensable by such Contributor
that are necessarily infringed by their Contribution(s) alone or by combination
of their Contribution(s) with the Work to which such Contribution(s) was
submitted. If You institute patent litigation against any entity (including a
cross-claim or counterclaim in a lawsuit) alleging that the Work or a
Contribution incorporated within the Work constitutes direct or contributory
patent infringement, then any patent licenses granted to You under this License
for that Work shall terminate as of the date such litigation is filed.

4. Redistribution.

You may reproduce and distribute copies of the Work or Derivative Works thereof
in any medium, with or without modifications, and in Source or Object form,
provided that You meet the following conditions:

You must give any other recipients of the Work or Derivative Works a copy of
this License; and
You must cause any modified files to carry prominent notices stating that You
changed the files; and
You must retain, in the Source form of any Derivative Works that You distribute,
all copyright, patent, trademark, and attribution notices from the Source form
of the Work, excluding those notices that do not pertain to any part of the
Derivative Works; and
If the Work includes a "NOTICE" text file as part of its distribution, then any
Derivative Works that You distribute must include a readable copy of the
attribution notices contained within such NOTICE file, excluding those notices
that do not pertain to any part of the Derivative Works, in at least one of the
following places: within a NOTICE text file distributed as part of the
Derivative Works; within the Source form or documentation, if provided along
with the Derivative Works; or, within a display generated by the Derivative
Works, if and wherever such third-party notices normally appear. The contents of
the NOTICE file are for informational purposes only and do not modify the
License. You may add Your own attribution notices within Derivative Works that
You distribute, alongside or as an addendum to the NOTICE text from the Work,
provided that such additional attribution notices cannot be construed as
modifying the License.
You may add Your own copyright statement to Your modifications and may provide
additional or different license terms and conditions for use, reproduction, or
distribution of Your modifications, or for any such Derivative Works as a whole,
provided Your use, reproduction, and distribution of the Work otherwise complies
with the conditions stated in this License.

5. Submission of Contributions.

Unless You explicitly state otherwise, any Contribution intentionally submitted
for inclusion in the Work by You to the Licensor shall be under the terms and
conditions of this License, without any additional terms or conditions.
Notwithstanding the above, nothing herein shall supersede or modify the terms of
any separate license agreement you may have executed with Licensor regarding
such Contributions.

6. Trademarks.

This License does not grant permission to use the trade names, trademarks,
service marks, or product names of the Licensor, except as required for
reasonable and customary use in describing the origin of the Work and
reproducing the content of the NOTICE file.

7. Disclaimer of Warranty.

Unless required by applicable law or agreed to in writing, Licensor provides the
Work (and each Contributor provides its Contributions) on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied,
including, without limitation, any warranties or conditions of TITLE,
NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE. You are
solely responsible for determining the appropriateness of using or
redistributing the Work and assume any risks associated with Your exercise of
permissions under this License.

8. Limitation of Liability.

In no event and under no legal theory, whether in tort (including negligence),
contract, or otherwise, unless required by applicable law (such as deliberate
and grossly negligent acts) or agreed to in writing, shall any Contributor be
liable to You for damages, including any direct, indirect, special, incidental,
or consequential damages of any character arising as a result of this License or
out of the use or inability to use the Work (including but not limited to
damages for loss of goodwill, work stoppage, computer failure or malfunction, or
any and all other commercial damages or losses), even if such Contributor has
been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability.

While redistributing the Work or Derivative Works thereof, You may choose to
offer, and charge a fee for, acceptance of support, warranty, indemnity, or
other liability obligations and/or rights consistent with this License. However,
in accepting such obligations, You may act only on Your own behalf and on Your
sole responsibility, not on behalf of any other Contributor, and only if You
agree to indemnify, defend, and hold each Contributor harmless for any liability
incurred by, or claims asserted against, such Contributor by reason of your
accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work

To apply the Apache License to your work, attach the following boilerplate
notice, with the fields enclosed by brackets "[]" replaced with your own
identifying information. (Don't include the brackets!) The text should be
enclosed in the appropriate comment syntax for the file format. We also
recommend that a file or class name and description of purpose be included on
the same "printed page" as the copyright notice for easier identification within
third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.


========================================================================

@img/colour@1.1.0 — MIT
Source: https://www.npmjs.com/package/@img/colour/v/1.1.0
# Licensing

## color

Copyright (c) 2012 Heather Arthur

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## color-convert

Copyright (c) 2011-2016 Heather Arthur <fayearthur@gmail.com>.
Copyright (c) 2016-2021 Josh Junon <josh@junon.me>.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## color-string

Copyright (c) 2011 Heather Arthur <fayearthur@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## color-name

The MIT License (MIT)
Copyright (c) 2015 Dmitry Ivanov

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


========================================================================

detect-libc@2.1.2 — Apache-2.0
Source: https://www.npmjs.com/package/detect-libc/v/2.1.2
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright {yyyy} {name of copyright owner}

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.


========================================================================

semver@7.8.5 — ISC
Source: https://www.npmjs.com/package/semver/v/7.8.5
The ISC License

Copyright (c) Isaac Z. Schlueter and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.


========================================================================

vue@3.5.44 — MIT
Source: https://www.npmjs.com/package/vue/v/3.5.44
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

@vue/compiler-dom@3.5.44 — MIT
Source: https://www.npmjs.com/package/@vue/compiler-dom/v/3.5.44
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

@vue/compiler-core@3.5.44 — MIT
Source: https://www.npmjs.com/package/@vue/compiler-core/v/3.5.44
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

@babel/parser@7.29.9 — MIT
Source: https://www.npmjs.com/package/@babel/parser/v/7.29.9
Copyright (C) 2012-2014 by various contributors (see AUTHORS)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

@babel/types@7.29.8 — MIT
Source: https://www.npmjs.com/package/@babel/types/v/7.29.8
MIT License

Copyright (c) 2014-present Sebastian McKenzie and other contributors

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


========================================================================

@babel/helper-string-parser@7.29.7 — MIT
Source: https://www.npmjs.com/package/@babel/helper-string-parser/v/7.29.7
MIT License

Copyright (c) 2014-present Sebastian McKenzie and other contributors

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


========================================================================

@babel/helper-validator-identifier@7.29.7 — MIT
Source: https://www.npmjs.com/package/@babel/helper-validator-identifier/v/7.29.7
MIT License

Copyright (c) 2014-present Sebastian McKenzie and other contributors

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


========================================================================

@vue/shared@3.5.44 — MIT
Source: https://www.npmjs.com/package/@vue/shared/v/3.5.44
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

entities@7.0.1 — BSD-2-Clause
Source: https://www.npmjs.com/package/entities/v/7.0.1
Copyright (c) Felix Böhm
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


========================================================================

estree-walker@2.0.2 — MIT
Source: https://www.npmjs.com/package/estree-walker/v/2.0.2
Copyright (c) 2015-20 [these people](https://github.com/Rich-Harris/estree-walker/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

========================================================================

source-map-js@1.2.2 — BSD-3-Clause
Source: https://www.npmjs.com/package/source-map-js/v/1.2.2

Copyright (c) 2009-2011, Mozilla Foundation and contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the names of the Mozilla Foundation nor the names of project
  contributors may be used to endorse or promote products derived from this
  software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


========================================================================

@vue/compiler-sfc@3.5.44 — MIT
Source: https://www.npmjs.com/package/@vue/compiler-sfc/v/3.5.44
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

@vue/compiler-ssr@3.5.44 — MIT
Source: https://www.npmjs.com/package/@vue/compiler-ssr/v/3.5.44
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

magic-string@0.30.21 — MIT
Source: https://www.npmjs.com/package/magic-string/v/0.30.21
Copyright 2018 Rich Harris

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


========================================================================

@jridgewell/sourcemap-codec@1.6.0 — MIT
Source: https://www.npmjs.com/package/@jridgewell/sourcemap-codec/v/1.6.0
Copyright 2024 Justin Ridgewell <justin@ridgewell.name>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


========================================================================

postcss@8.5.30 — MIT
Source: https://www.npmjs.com/package/postcss/v/8.5.30
The MIT License (MIT)

Copyright 2013 Andrey Sitnik <andrey@sitnik.es>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


========================================================================

nanoid@3.3.20 — MIT
Source: https://www.npmjs.com/package/nanoid/v/3.3.20
The MIT License (MIT)

Copyright 2017 Andrey Sitnik <andrey@sitnik.ru>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


========================================================================

picocolors@1.1.1 — ISC
Source: https://www.npmjs.com/package/picocolors/v/1.1.1
ISC License

Copyright (c) 2021-2024 Oleksii Raspopov, Kostiantyn Denysov, Anton Verinov

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.


========================================================================

@vue/runtime-dom@3.5.44 — MIT
Source: https://www.npmjs.com/package/@vue/runtime-dom/v/3.5.44
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

@vue/reactivity@3.5.44 — MIT
Source: https://www.npmjs.com/package/@vue/reactivity/v/3.5.44
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

@vue/runtime-core@3.5.44 — MIT
Source: https://www.npmjs.com/package/@vue/runtime-core/v/3.5.44
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


========================================================================

csstype@3.2.3 — MIT
Source: https://www.npmjs.com/package/csstype/v/3.2.3
Copyright (c) 2017-2018 Fredrik Nicol

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


========================================================================

@vue/server-renderer@3.5.44 — MIT
Source: https://www.npmjs.com/package/@vue/server-renderer/v/3.5.44
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
