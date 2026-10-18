#!/usr/bin/env node
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { dirname, resolve, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const usage = `UML Studio — 结构化 JSON → 可编辑 HTML / 图片

node scripts/diagram.mjs <input.json> --out <output.html> [--image <output.png>] [--format png|jpeg|webp|svg] [--scale 2] [--quality 0.92] [--theme paper|ocean|forest|blueprint|midnight]
node scripts/diagram.mjs <input.json> --validate
node scripts/diagram.mjs --list

相对路径基于当前工作目录；--image 可单独使用。HTML 内联全部运行资源，可离线编辑和重新导出。`
function parse(args) {
  const result = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (['--help','-h'].includes(arg)) result.help = true
    else if (arg === '--list') result.list = true
    else if (arg === '--validate') result.validate = true
    else if (['--out','--image','--format','--scale','--quality','--theme'].includes(arg)) {
      if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(`${arg} 缺少参数`)
      result[arg.slice(2)] = args[++i]
    } else if (arg.startsWith('-')) throw new Error(`未知参数：${arg}`)
    else if (result.input) throw new Error('只能指定一个 JSON 输入文件')
    else result.input = arg
  }
  return result
}
async function save(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, value) }
async function main() {
  const args = parse(process.argv.slice(2))
  if (args.help || !process.argv.slice(2).length) { console.log(usage); return }
  try { await access(resolve(root, 'dist/core.mjs')); await access(resolve(root, 'assets/viewer.js')) }
  catch { throw new Error('缺少构建产物。先在项目根目录执行 npm install && npm run build，或在 SKILL 目录执行 npm install && npm run build。') }
  const { validateSpec, renderDiagram, diagramTypes } = await import(pathToFileURL(resolve(root, 'dist/core.mjs')).href)
  if (args.list) { console.log(JSON.stringify({ types: diagramTypes, themes: ['paper','ocean','forest','blueprint','midnight'], formats: ['svg','png','jpeg','webp'] }, null, 2)); return }
  if (!args.input) throw new Error('缺少 input.json；使用 --help 查看用法')
  const spec = JSON.parse((await readFile(resolve(args.input), 'utf8')).replace(/^\uFEFF/, ''))
  if (args.theme) spec.theme = args.theme
  validateSpec(spec)
  if (args.validate) { console.log(JSON.stringify({ valid: true, type: spec.type, title: spec.title })); return }
  if (!args.out && !args.image) throw new Error('至少指定 --out 或 --image')
  if (args.out && extname(args.out).toLowerCase() !== '.html') throw new Error('--out 必须使用 .html 扩展名')
  const format = args.format ?? (args.image ? extname(args.image).slice(1).toLowerCase().replace(/^jpg$/, 'jpeg') : 'png')
  if (!['svg','png','jpeg','webp'].includes(format)) throw new Error(`不支持的图片格式：${format}`)
  if (args.image) {
    const extension = extname(args.image).slice(1).toLowerCase().replace(/^jpg$/, 'jpeg')
    if (extension !== format) throw new Error('--format 与 --image 扩展名不一致')
  }
  const scale = Number(args.scale ?? 2), quality = Number(args.quality ?? 0.92)
  if (!Number.isFinite(scale) || scale < 0.1 || scale > 4) throw new Error('--scale 必须在 0.1–4 之间')
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) throw new Error('--quality 必须在 0–1 之间')
  const diagram = await renderDiagram(spec)
  const { createHtml } = await import(pathToFileURL(resolve(root, 'dist/export.mjs')).href)
  const runtime = { js: await readFile(resolve(root, 'assets/viewer.js'), 'utf8'), css: await readFile(resolve(root, 'assets/viewer.css'), 'utf8') }
  const html = createHtml(spec, runtime)
  let image
  if (args.image && format === 'svg') image = diagram.svg
  else if (args.image) {
    const { chromium } = await import('playwright')
    let browser
    try { browser = await chromium.launch({ headless: true }) }
    catch (error) { throw new Error(`无法启动图片导出浏览器。执行 npx playwright install chromium 后重试。原始错误：${error.message}`) }
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
      await page.setContent(html, { waitUntil: 'load' })
      await page.waitForFunction(() => window.UmlStudio, undefined, { timeout: 60000 })
      const base64 = await page.evaluate(async options => {
        await window.UmlStudio.ready
        const blob = await window.UmlStudio.exportImage(options)
        return await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result).split(',')[1])
          reader.onerror = () => reject(new Error('无法读取导出图片'))
          reader.readAsDataURL(blob)
        })
      }, { format, scale, quality })
      image = Buffer.from(base64, 'base64')
    } finally { await browser.close() }
  }
  // Generate every requested artifact before committing either output.
  if (args.out) await save(resolve(args.out), html)
  if (args.image) await save(resolve(args.image), image)
  console.log(JSON.stringify({ type: spec.type, title: spec.title, width: diagram.width, height: diagram.height, html: args.out ? resolve(args.out) : undefined, image: args.image ? resolve(args.image) : undefined, format: args.image ? format : undefined, imageBytes: image ? Buffer.byteLength(image) : undefined }, null, 2))
}
main().catch(error => { console.error(`UML Studio: ${error.message}`); process.exitCode = 1 })
