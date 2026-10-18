import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export const scenarioTypes = ['activity', 'sequence', 'swimlane', 'flowchart', 'usecase', 'class', 'state', 'component', 'package', 'architecture', 'module', 'deployment', 'logical', 'development', 'process', 'physical', 'scenario', 'fishbone']
const root = new URL('../', import.meta.url)
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))

export async function createGallery() {
  const scenarios = await Promise.all(scenarioTypes.map(type => readJson(`examples/scenarios/${type}.json`)))
  const extras = await Promise.all(['activity-parallel', 'component-folding'].map(name => readJson(`examples/scenarios/${name}.json`)))
  const quickstart = await readJson('examples/documents/quickstart.json')
  const find = type => structuredClone(scenarios.find(spec => spec.type === type))
  const horizontal = find('activity')
  Object.assign(horizontal, { id: 'login-compact-lr', title: '登录认证 · 紧凑横向对照', theme: 'mint', direction: 'LR', layout: { mode: 'compact' } })
  const grid = find('component')
  Object.assign(grid, { id: 'components-grid', title: '结算服务 · 网格折列对照', theme: 'lavender', layout: { mode: 'grid', maxPerColumn: 2, regionGap: 88 } })
  const typography = find('flowchart')
  Object.assign(typography, {
    id: 'import-typography', title: '数据导入 · 透明背景与尺寸限制', theme: 'paper', direction: 'TB',
    description: '宽松布局、20px 字号、透明背景、节点宽度上限及整图等比尺寸限制；图片导出保留全部节点，PNG / WebP 透明，JPEG 白底。',
    style: { background: 'transparent', fontSize: 20, fontWeight: 500 },
    layout: { mode: 'spacious', showTitle: true, nodeMaxWidth: 240, maxWidth: 1600, maxHeight: 1800, maxPerColumn: 4 },
  })
  return { version: 1, title: 'UML Studio · 场景与布局验证册', diagrams: [...scenarios, ...extras, horizontal, grid, typography, ...quickstart.diagrams] }
}

export async function writeGallery() {
  const gallery = await createGallery()
  await writeFile(new URL('examples/documents/gallery.json', root), JSON.stringify(gallery, null, 2) + '\n')
  return gallery
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const gallery = await writeGallery()
  console.log(`Updated ${fileURLToPath(new URL('examples/documents/gallery.json', root))}: ${gallery.diagrams.length} diagrams, ${scenarioTypes.length} types`)
}
