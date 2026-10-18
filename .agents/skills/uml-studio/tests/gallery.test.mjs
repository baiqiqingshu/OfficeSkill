import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { createGallery, scenarioTypes } from '../scripts/gallery.mjs'
import { inspectDiagram } from '../scripts/demo-checks.mjs'
import { diagramSchema, normalizeDocument, renderDiagram, themes } from '../dist/core.mjs'
import { createHtml } from '../dist/export.mjs'
import { documentFromHtml, renderNativeImage } from '../dist/native.mjs'

const gallery = normalizeDocument(await createGallery())
const results = new Map()

test('demo sources cover every type and generate the committed gallery without drift', async () => {
  assert.deepEqual([...scenarioTypes].sort(), [...diagramSchema.properties.type.enum].sort())
  const committed = JSON.parse(await readFile(new URL('../examples/documents/gallery.json', import.meta.url), 'utf8'))
  assert.deepEqual(committed, gallery, 'run npm run demo:refresh after editing scenario sources')
  assert.equal(gallery.diagrams.length, 26)
  for (const type of scenarioTypes) assert.ok(gallery.diagrams.some(spec => spec.type === type))
  const nodeKinds = new Set(gallery.diagrams.flatMap(spec => spec.nodes?.map(node => node.kind) ?? []))
  for (const kind of ['decision', 'fork', 'join', 'actor', 'interface', 'database', 'queue', 'server', 'note']) assert.ok(nodeKinds.has(kind), kind)
  const relationships = new Set(gallery.diagrams.flatMap(spec => spec.edges?.map(edge => edge.kind ?? 'flow') ?? []))
  for (const kind of diagramSchema.properties.edges.items.properties.kind.enum) assert.ok(relationships.has(kind), kind)
})

test('every demo preserves its nodes, relationships, labels and valid geometry', async context => {
  for (const spec of gallery.diagrams) await context.test(spec.id, async () => {
    const rendered = await renderDiagram(spec)
    inspectDiagram(spec, rendered)
    results.set(spec.id, rendered)
  })
})

test('complex node scenarios survive all four layout modes in both directions', async context => {
  const scenarios = gallery.diagrams.slice(0, 20).filter(spec => spec.nodes)
  for (const source of scenarios) await context.test(source.id, async () => {
    for (const mode of ['compact', 'balanced', 'spacious', 'grid']) for (const direction of ['TB', 'LR']) {
      const spec = { ...source, direction, layout: { ...source.layout, mode } }
      inspectDiagram(spec, await renderDiagram(spec))
    }
  })
})

test('complex interactions retain every message, fragment and database cylinder', async () => {
  const spec = gallery.diagrams.find(item => item.type === 'sequence')
  const { svg } = results.get(spec.id) ?? await renderDiagram(spec)
  const arrows = [...svg.matchAll(/<path\b[^>]*marker-end="url\(#[^\"]*-seq-(?:filled|open)\)"/g)]
  assert.equal(arrows.length, spec.messages.length)
  assert.equal([...svg.matchAll(/<ellipse\b/g)].length, spec.participants.filter(participant => participant.kind === 'database').length)
  for (const kind of ['sync', 'async', 'return', 'create', 'destroy']) assert.ok(spec.messages.some(message => message.kind === kind))
  for (const kind of ['alt', 'opt', 'loop', 'par']) {
    assert.ok(spec.fragments.some(fragment => fragment.kind === kind))
    assert.ok(svg.includes(`>${kind}</tspan>`))
  }
  const jobCreation = spec.messages.findIndex(message => message.kind === 'create' && message.to === 'job')
  const jobDestruction = spec.messages.findIndex(message => message.kind === 'destroy' && message.to === 'job')
  spec.messages.forEach((message, index) => {
    if (message.from === 'job' || message.to === 'job') assert.ok(index >= jobCreation && index <= jobDestruction)
  })
})

test('demo verification detects missing nodes, annotations and clipped labels', async () => {
  const spec = gallery.diagrams.find(item => item.id === 'login-branches')
  const rendered = results.get(spec.id) ?? await renderDiagram(spec)
  const missingNode = rendered.svg.replace('data-node-id="input"', 'data-missing-node="input"')
  assert.throws(() => inspectDiagram(spec, { ...rendered, svg: missingNode }), /lost nodes/)
  const missingLabel = rendered.svg.replace('class="uml-edge-label"', 'class="missing-label"')
  assert.throws(() => inspectDiagram(spec, { ...rendered, svg: missingLabel }), /lost annotations/)
  const clipped = rendered.svg.replace(/(class="uml-edge-label"[^>]*><rect x=")[^"]+/, '$1-100000')
  assert.notEqual(clipped, rendered.svg)
  assert.throws(() => inspectDiagram(spec, { ...rendered, svg: clipped }), /clipped label/)
})

test('all themes and recursive cause levels preserve content', async () => {
  const source = gallery.diagrams.find(spec => spec.id === 'incident-causes')
  const flatten = causes => causes.flatMap(cause => [cause.label, ...flatten(cause.children ?? [])])
  const causes = source.fishbone.categories.flatMap(category => flatten(category.causes))
  for (const theme of Object.keys(themes)) {
    const rendered = await renderDiagram({ ...source, theme })
    const text = rendered.svg.replace(/<[^>]+>/g, '').replace(/\s/g, '')
    for (const label of causes) assert.ok(text.includes(label.replace(/\s/g, '')), `${theme}: missing cause ${label}`)
    inspectDiagram({ ...source, theme }, rendered)
  }
})

test('offline HTML preserves repeated types, independent settings and the complete collection', async () => {
  const runtime = {
    js: await readFile(new URL('../assets/viewer.js', import.meta.url), 'utf8'),
    css: await readFile(new URL('../assets/viewer.css', import.meta.url), 'utf8'),
  }
  const html = createHtml(gallery, runtime)
  assert.deepEqual(documentFromHtml(html), gallery)
  const offlineDemo = await readFile(new URL('../demo-dist/index.html', import.meta.url), 'utf8')
  assert.deepEqual(documentFromHtml(offlineDemo), gallery, 'run npm run build to refresh the offline demo')
  assert.doesNotMatch(html, /<(?:script|link)\b[^>]*(?:src|href)=["']https?:/i)
  assert.ok(gallery.diagrams.filter(spec => spec.type === 'activity').length >= 4)
  assert.equal(gallery.diagrams.find(spec => spec.id === 'login-compact-lr').layout.mode, 'compact')
  assert.equal(gallery.diagrams.find(spec => spec.id === 'components-grid').layout.mode, 'grid')
})

test('complex graphs, interactions and recursive causes export in all four native formats', async () => {
  for (const id of ['login-branches', 'checkout-sequence', 'commerce-usecases', 'incident-causes']) {
    const source = gallery.diagrams.find(spec => spec.id === id)
    const spec = { ...source, style: { ...source.style, background: 'transparent' }, layout: { ...source.layout, maxWidth: 640, maxHeight: 640 } }
    for (const format of ['svg', 'png', 'jpeg', 'webp']) {
      const image = await renderNativeImage(spec, { format, scale: 1 })
      assert.ok(image.width <= 640.01 && image.height <= 640.01)
      if (format === 'svg') assert.match(image.data.toString(), /<svg\b/)
      else {
        const metadata = await sharp(image.data).metadata()
        assert.equal(metadata.format, format)
        const pixel = await sharp(image.data).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer()
        if (format === 'jpeg') assert.ok(pixel[0] >= 250 && pixel[1] >= 250 && pixel[2] >= 250)
        else assert.equal(pixel[3], 0)
      }
    }
  }
})
