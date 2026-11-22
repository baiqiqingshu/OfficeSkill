#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diagramTypes, themes, normalizeDocument, mermaidToDocument, isMermaidSource } from '../dist/core.mjs'
import { readDiagramFile, documentFromHtml, renderNativeImage } from '../dist/native.mjs'
import { createHtml } from '../dist/export.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const usage = `UML Studio — JSON / 已保存 HTML → 可编辑多图 HTML / 图片（无需浏览器）

node scripts/diagram.mjs --json '{"type":"flowchart","title":"评审","nodes":[{"label":"提交"},{"label":"审批"}],"edges":[{"from":"提交","to":"审批"}]}' --out out.html --image out.png
node scripts/diagram.mjs input.json --out output.html --image output.png --scale 2
node scripts/diagram.mjs saved.html --set theme=industrial --out saved.html --image updated.png
node scripts/diagram.mjs saved.html --diagram 2 --image activity.png
node scripts/diagram.mjs saved.html --all --out-dir images --format webp
node scripts/diagram.mjs --presets
node scripts/diagram.mjs --example flowchart
node scripts/diagram.mjs local.mmd --out out.html --image out.png      # Mermaid / Markdown（含 mermaid 代码块）
node scripts/diagram.mjs --mermaid 'sequenceDiagram\\n A->>B: hi' --out out.html

--diagram 从 1 开始，或指定图形 id；多图图片导出必须明确选择或使用 --all。
--scale 0.1..4（位图默认 2，SVG 默认 1） --quality 0..1 --theme ocean
--json/-、--patch、--set 自动开启容错规范化；--tolerant 可显式开启。`

function parse(args) {
  const result = { fontFiles: [], sets: [] }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') result.help = true
    else if (['--list', '--validate', '--all', '--presets', '--tolerant'].includes(arg)) result[arg.slice(2)] = true
    else if (arg === '-') {
      if (result.input) throw new Error('只能指定一个 JSON 或 HTML 输入文件')
      result.input = '-'
    } else if (['--out', '--image', '--out-dir', '--format', '--scale', '--quality', '--theme', '--diagram', '--font-file', '--json', '--patch', '--set', '--example', '--save-json', '--mermaid'].includes(arg)) {
      if (!args[i + 1] || (args[i + 1].startsWith('--') && arg !== '--json' && arg !== '--patch' && arg !== '--mermaid')) throw new Error(`${arg} 缺少参数`)
      const value = args[++i]
      if (arg === '--font-file') result.fontFiles.push(resolve(value))
      else if (arg === '--set') result.sets.push(value)
      else result[arg.slice(2)] = value
    } else if (arg.startsWith('-')) throw new Error(`未知参数：${arg}`)
    else if (result.input) throw new Error('只能指定一个 JSON 或 HTML 输入文件')
    else result.input = arg
  }
  return result
}

function safeName(value) { return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 100) || 'diagram' }
async function save(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, value) }

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function mergePatch(original, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return structuredClone(patch)
  const out = original && typeof original === 'object' && !Array.isArray(original) ? structuredClone(original) : {}
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k]
    else out[k] = mergePatch(out[k], v)
  }
  return out
}

function applySets(doc, pairs) {
  if (!pairs.length) return doc
  const out = structuredClone(doc)
  const singleDiagram = Array.isArray(out.diagrams) && out.diagrams.length === 1
  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq < 1) throw new Error(`--set 参数须为 key=value：${pair}`)
    const key = pair.slice(0, eq).trim()
    const rawVal = pair.slice(eq + 1)
    let val
    try { val = JSON.parse(rawVal) } catch { val = rawVal }
    const parts = key.split('.').filter(Boolean)
    const targetParts = singleDiagram && parts[0] !== 'diagrams' && !(parts[0] in out && parts[0] !== 'title' && parts[0] !== 'theme')
      ? ['diagrams', '0', ...parts]
      : parts
    let cur = out
    for (let i = 0; i < targetParts.length - 1; i++) {
      const p = targetParts[i]
      if (Array.isArray(cur) && /^\d+$/.test(p)) {
        const idx = Number(p)
        if (idx < 0 || idx >= cur.length) throw new Error(`数组下标越界：${p}`)
        cur = cur[idx]
      } else if (cur && typeof cur === 'object') {
        if (!(p in cur) || typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {}
        cur = cur[p]
      } else throw new Error(`无法遍历路径：${key}`)
    }
    const last = targetParts[targetParts.length - 1]
    if (Array.isArray(cur) && /^\d+$/.test(last)) {
      const idx = Number(last)
      if (idx < 0 || idx >= cur.length) throw new Error(`数组下标越界：${last}`)
      cur[idx] = val
    } else if (cur && typeof cur === 'object') {
      if (val === null) delete cur[last]
      else cur[last] = val
    } else throw new Error(`无法写入路径：${key}`)
  }
  return out
}

function normalizeCause(cause) {
  if (typeof cause === 'string') return { label: cause }
  if (cause && typeof cause === 'object') {
    const c = { ...cause }
    if (Array.isArray(c.children)) c.children = c.children.map(normalizeCause)
    return c
  }
  return cause
}

function normalizeSpecTolerant(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return raw
  const spec = structuredClone(raw)
  if (spec.version === undefined) spec.version = 1
  if (!spec.title || typeof spec.title !== 'string') {
    spec.title = spec.fishbone?.effect || `图表 ${index + 1}`
  }
  if (spec.type === 'sequence') {
    const labelMap = new Map()
    if (Array.isArray(spec.participants)) {
      spec.participants = spec.participants.map((p, i) => {
        const obj = typeof p === 'string' ? { label: p } : { ...p }
        if (obj.id === undefined || obj.id === '') obj.id = `p${i + 1}`
        else obj.id = String(obj.id)
        if (!obj.label) obj.label = obj.id
        labelMap.set(obj.label, obj.id)
        return obj
      })
    }
    if (Array.isArray(spec.messages)) {
      spec.messages = spec.messages.map((m) => {
        const msg = { ...m }
        if (msg.from !== undefined) msg.from = labelMap.get(String(msg.from)) ?? String(msg.from)
        if (msg.to !== undefined) msg.to = labelMap.get(String(msg.to)) ?? String(msg.to)
        if (!msg.kind) msg.kind = 'sync'
        return msg
      })
    }
    return spec
  }
  if (spec.type === 'fishbone') {
    if (spec.fishbone && Array.isArray(spec.fishbone.categories)) {
      spec.fishbone.categories = spec.fishbone.categories.map((cat, i) => {
        const c = typeof cat === 'string' ? { label: cat, causes: [] } : { ...cat }
        if (c.id === undefined || c.id === '') c.id = `c${i + 1}`
        else c.id = String(c.id)
        if (Array.isArray(c.causes)) c.causes = c.causes.map(normalizeCause)
        return c
      })
    }
    return spec
  }
  const nodeLabelMap = new Map()
  if (Array.isArray(spec.groups)) {
    spec.groups = spec.groups.map((g, i) => ({
      ...g,
      id: g.id !== undefined && g.id !== '' ? String(g.id) : `g${i + 1}`,
      label: g.label || String(g.id || `分组 ${i + 1}`),
    }))
  }
  if (Array.isArray(spec.lanes)) {
    spec.lanes = spec.lanes.map((l, i) => ({
      ...l,
      id: l.id !== undefined && l.id !== '' ? String(l.id) : `l${i + 1}`,
      label: l.label || String(l.id || `泳道 ${i + 1}`),
    }))
  }
  if (Array.isArray(spec.nodes)) {
    spec.nodes = spec.nodes.map((n, i) => {
      const obj = typeof n === 'string' ? { label: n } : { ...n }
      if (obj.id === undefined || obj.id === '') obj.id = `n${i + 1}`
      else obj.id = String(obj.id)
      if (!obj.label) obj.label = obj.id
      if (obj.lane !== undefined) obj.lane = String(obj.lane)
      if (obj.group !== undefined) obj.group = String(obj.group)
      nodeLabelMap.set(obj.label, obj.id)
      return obj
    })
  }
  if (Array.isArray(spec.edges)) {
    spec.edges = spec.edges.map((e) => {
      const edge = { ...e }
      if (edge.from !== undefined) edge.from = nodeLabelMap.get(String(edge.from)) ?? String(edge.from)
      if (edge.to !== undefined) edge.to = nodeLabelMap.get(String(edge.to)) ?? String(edge.to)
      if (edge.id !== undefined) edge.id = String(edge.id)
      return edge
    })
  }
  return spec
}

function normalizeInputTolerant(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const doc = structuredClone(raw)
  if (doc.version === undefined) doc.version = 1
  if (Array.isArray(doc.diagrams)) {
    doc.diagrams = doc.diagrams.map((d, i) => normalizeSpecTolerant(d, i))
    if (!doc.title) doc.title = doc.diagrams[0]?.title || '图表集'
    return doc
  }
  return normalizeSpecTolerant(doc, 0)
}

function presetsInfo() {
  return {
    types: diagramTypes,
    themes: Object.keys(themes),
    formats: ['svg', 'png', 'jpeg', 'webp'],
    families: {
      nodeEdge: {
        types: 'activity|flowchart|usecase|class|state|component|package|architecture|module|deployment|logical|development|process|physical|scenario',
        shape: '{"type":"flowchart","title":"标题","nodes":[{"id":"a","label":"开始","kind":"start"},{"id":"b","label":"处理"}],"edges":[{"from":"a","to":"b","label":"条件"}]}',
      },
      swimlane: {
        shape: '{"type":"swimlane","title":"标题","lanes":[{"id":"l1","label":"角色A"}],"nodes":[{"id":"n1","label":"步骤","lane":"l1"}],"edges":[]}',
      },
      sequence: {
        shape: '{"type":"sequence","title":"标题","participants":[{"id":"u","label":"用户","kind":"actor"},{"id":"s","label":"服务"}],"messages":[{"from":"u","to":"s","label":"请求","kind":"sync"}]}',
      },
      fishbone: {
        shape: '{"type":"fishbone","title":"根因分析","fishbone":{"effect":"问题","categories":[{"label":"分类","causes":[{"label":"原因"}]}]}}',
      },
    },
    quickCommand: 'node scripts/diagram.mjs --json \'<JSON>\' --out output.html --image output.png',
  }
}

async function loadExample(type) {
  for (const p of [resolve(root, 'examples', `${type}.json`), resolve(root, 'examples/scenarios', `${type}.json`), resolve(root, 'examples/documents', `${type}.json`)]) {
    if (existsSync(p)) return JSON.parse(await readFile(p, 'utf8'))
  }
  throw new Error(`未找到示例：${type}`)
}

async function main() {
  const args = parse(process.argv.slice(2))
  if (args.help || !process.argv.slice(2).length) { console.log(usage); return }
  if (args.list) { console.log(JSON.stringify({ types: diagramTypes, themes: Object.keys(themes), formats: ['svg', 'png', 'jpeg', 'webp'], browserRequired: false }, null, 2)); return }
  if (args.presets) { console.log(JSON.stringify(presetsInfo(), null, 2)); return }
  if (args.example) { console.log(JSON.stringify(await loadExample(args.example), null, 2)); return }

  const autoTolerant = Boolean(args.tolerant || args.json || args.input === '-' || args.patch || args.sets.length)
  let rawDoc
  const fromMermaid = (text) => {
    const { document, warnings } = mermaidToDocument(text)
    for (const warning of warnings) console.error(`Mermaid 警告：${warning}`)
    return document
  }
  if (args.mermaid) {
    rawDoc = fromMermaid(args.mermaid.replace(/\\n/g, '\n'))
  } else if (args.input && args.input !== '-' && ['.mmd', '.mermaid', '.md', '.markdown'].includes(extname(args.input).toLowerCase())) {
    rawDoc = fromMermaid(await readFile(resolve(args.input), 'utf8'))
  } else if (args.json) {
    rawDoc = JSON.parse(args.json)
  } else if (args.input === '-') {
    const text = (await readStdin()).replace(/^\uFEFF/, '')
    rawDoc = text.trimStart().startsWith('<') ? documentFromHtml(text) : isMermaidSource(text) ? fromMermaid(text) : JSON.parse(text)
  } else if (args.input) {
    if (autoTolerant) {
      const text = (await readFile(resolve(args.input), 'utf8')).replace(/^\uFEFF/, '')
      rawDoc = text.trimStart().startsWith('<') ? documentFromHtml(text) : JSON.parse(text)
    } else {
      rawDoc = await readDiagramFile(resolve(args.input))
    }
  } else {
    throw new Error('缺少 input.json / saved.html 或 --json；使用 --help 查看用法')
  }

  if (args.patch) {
    const pText = args.patch.trim().startsWith('{') ? args.patch : await readFile(resolve(args.patch), 'utf8')
    rawDoc = mergePatch(rawDoc, JSON.parse(pText))
  }
  if (args.sets.length) rawDoc = applySets(rawDoc, args.sets)
  if (autoTolerant) rawDoc = normalizeInputTolerant(rawDoc)

  const document = normalizeDocument(rawDoc)
  if (args.theme) { for (const spec of document.diagrams) spec.theme = args.theme; normalizeDocument(document) }
  if (args['save-json']) await save(resolve(args['save-json']), JSON.stringify(document, null, 2) + '\n')
  if (args.validate) { console.log(JSON.stringify({ valid: true, title: document.title, diagramCount: document.diagrams.length })); return }
  if (!args.out && !args.image && !args.all) throw new Error('至少指定 --out、--image 或 --all --out-dir')
  if (args.out && extname(args.out).toLowerCase() !== '.html') throw new Error('--out 必须使用 .html 扩展名')
  if (args.all && (args.image || args.diagram)) throw new Error('--all 不能与 --image / --diagram 同时使用')
  if (args.all && !args['out-dir']) throw new Error('--all 必须指定 --out-dir')
  if (args['out-dir'] && !args.all) throw new Error('--out-dir 必须与 --all 同时使用')
  const extension = args.image ? extname(args.image).slice(1).toLowerCase().replace(/^jpg$/, 'jpeg') : undefined
  const format = args.format ?? extension ?? 'png'
  if (!['svg', 'png', 'jpeg', 'webp'].includes(format)) throw new Error(`不支持的图片格式：${format}`)
  if (extension && extension !== format) throw new Error('--format 与 --image 扩展名不一致')
  const scale = Number(args.scale ?? (format === 'svg' ? 1 : 2)), quality = Number(args.quality ?? .92)
  if (!Number.isFinite(scale) || scale < .1 || scale > 4) throw new Error('--scale 必须在 0.1–4 之间')
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) throw new Error('--quality 必须在 0–1 之间')
  let selection
  if (args.diagram !== undefined) {
    selection = /^\d+$/.test(args.diagram) ? Number(args.diagram) - 1 : document.diagrams.findIndex(spec => spec.id === args.diagram)
    if (!Number.isInteger(selection) || selection < 0 || selection >= document.diagrams.length) throw new Error('--diagram 不存在：请使用从 1 开始的序号或已声明的 id')
  }
  if (args.image && selection === undefined && document.diagrams.length > 1) throw new Error('多图 HTML / JSON 需要 --diagram 明确选择一张，或 --all 批量导出')
  const selected = args.all ? document.diagrams.map((spec, index) => ({ spec, index })) : args.image ? [{ spec: document.diagrams[selection ?? 0], index: selection ?? 0 }] : []
  const images = []
  try {
    for (const { spec, index } of selected) {
      const image = await renderNativeImage(spec, { format, scale, quality, fontFiles: args.fontFiles })
      const path = resolve(args.all ? resolve(args['out-dir'], `${String(index + 1).padStart(2, '0')}-${safeName(spec.title)}.${format}`) : args.image)
      await save(path, image.data)
      images.push({ index: index + 1, id: spec.id, title: spec.title, path, format, width: image.width, height: image.height, bytes: image.data.byteLength })
    }
    if (args.out) {
      const runtime = { js: await readFile(resolve(root, 'assets/viewer.js'), 'utf8'), css: await readFile(resolve(root, 'assets/viewer.css'), 'utf8') }
      await save(resolve(args.out), createHtml(document, runtime))
    }
  } catch (error) { throw new Error(`${error.message}${images.length ? `；已生成 ${images.length} 张图片，未完成整个批次` : ''}`) }
  console.log(JSON.stringify({ title: document.title, diagramCount: document.diagrams.length, browser: false, html: args.out ? resolve(args.out) : undefined, images }, null, 2))
}
main().catch(error => { console.error(`UML Studio: ${error.message}`); process.exitCode = 1 })
