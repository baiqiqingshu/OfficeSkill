import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { createGallery } from './gallery.mjs'
import { inspectDiagram } from './demo-checks.mjs'
import { normalizeDocument, renderDiagram } from '../dist/core.mjs'
import { renderNativeImage } from '../dist/native.mjs'

const argumentsList = process.argv.slice(2)
if (argumentsList.length && (argumentsList[0] !== '--out-dir' || argumentsList.length !== 2)) throw new Error('Usage: npm run demo:verify -- [--out-dir directory]')
const output = argumentsList[1] ? resolve(argumentsList[1]) : fileURLToPath(new URL('../../../../temp/uml-demo-evidence/', import.meta.url))
const gallery = normalizeDocument(await createGallery())
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
await mkdir(output, { recursive: true })
const records = [], thumbnails = []
for (const [index, spec] of gallery.diagrams.entries()) {
  const rendered = await renderDiagram(spec)
  let metrics, error
  try { metrics = inspectDiagram(spec, rendered) }
  catch (reason) { error = reason.message }
  const name = `${String(index + 1).padStart(2, '0')}-${spec.id}`
  const scale = Math.max(0.1, Math.min(1, 1200 / rendered.width, 1000 / rendered.height))
  const { data: png } = await renderNativeImage(spec, { format: 'png', scale })
  await writeFile(resolve(output, `${name}.svg`), rendered.svg)
  await writeFile(resolve(output, `${name}.png`), png)
  const thumbnail = await sharp(png).resize(456, 340, { fit: 'contain', background: '#f4f7fa' }).png().toBuffer()
  thumbnails.push(thumbnail)
  records.push({ id: spec.id, type: spec.type, title: spec.title, description: spec.description ?? '', name, ...metrics, error })
  console.log(`${error ? 'FAIL' : 'PASS'} ${spec.id}: ${rendered.width} × ${rendered.height}`)
}
for (let offset = 0; offset < records.length; offset += 6) {
  const cells = []
  for (let local = 0; local < Math.min(6, records.length - offset); local++) {
    const left = (local % 3) * 480 + 12, top = Math.floor(local / 3) * 400 + 44
    const record = records[offset + local]
    const heading = `<svg xmlns="http://www.w3.org/2000/svg" width="456" height="32"><text x="0" y="22" font-family="Microsoft YaHei, sans-serif" font-size="17" fill="#22354a">${offset + local + 1}. ${escape(record.title)}</text></svg>`
    const headingPng = new Resvg(heading).render().asPng()
    cells.push({ input: thumbnails[offset + local], left, top }, { input: headingPng, left, top: top - 36 })
  }
  await sharp({ create: { width: 1440, height: 800, channels: 4, background: '#ffffff' } }).composite(cells).png().toFile(resolve(output, `contact-${Math.floor(offset / 6) + 1}.png`))
}
await writeFile(resolve(output, 'report.json'), JSON.stringify({ diagrams: records.length, failures: records.filter(record => record.error).length, records }, null, 2) + '\n')
await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UML Studio · Demo 检查</title><style>body{font:16px system-ui;max-width:1500px;margin:32px auto;padding:0 24px;color:#22354a;background:#f4f7fa}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:24px}figure{background:white;margin:0;padding:20px;border-radius:12px}img{width:100%;height:420px;object-fit:contain}h2{font-size:18px}p{line-height:1.7}a{color:#1265ac}.error{color:#b42318}</style><h1>UML Studio · Demo 检查</h1><p>${records.length} 张图，${records.filter(record => record.error).length} 项几何检查失败。点击预览打开完整 SVG；自动检查不能替代视觉判断。</p><main>${records.map(record => `<figure><h2>${escape(record.title)}</h2><a href="${record.name}.svg"><img src="${record.name}.png" loading="lazy" alt="${escape(record.title)}"></a><figcaption><p>${escape(record.description)}</p><p>${escape(record.type)} · ${record.nodes ?? 0} 节点 · ${record.edges ?? 0} 关系 · ${record.labels ?? 0} 标注</p>${record.error ? `<p class="error">${escape(record.error)}</p>` : ''}</figcaption></figure>`).join('')}</main></html>`)
console.log(`Evidence: ${resolve(output, 'index.html')}`)
if (records.some(record => record.error)) process.exitCode = 1
