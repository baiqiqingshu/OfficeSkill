import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Resvg } from '@resvg/resvg-js'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { renderDiagram, validateSpec } from '../dist/core.mjs'
import { createHtml } from '../dist/export.mjs'
import { documentFromHtml } from '../dist/native.mjs'
import { inspectDiagram } from '../scripts/demo-checks.mjs'

const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/crossings.ts', import.meta.url))], bundle: true, write: false, format: 'esm' })
const { crossingPaths } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const path = (owner, ...coords) => ({ owner, points: coords.map(([x, y]) => ({ x, y })) })
const crossing = [path(0, [50, 10], [50, 90]), path(1, [10, 50], [90, 50])]

test('proper crossings receive one semicircle; plain mode preserves straight routes', () => {
  for (const routes of [crossing, crossing.map(p => ({ ...p, points: [...p.points].reverse() })), [crossing[1], crossing[0]]]) {
    const bridge = crossingPaths(routes, 'bridge', 2)
    assert.equal(bridge.data.join('').match(/A/g)?.length, 1)
    assert.equal(bridge.masks.flat().length, 1)
    assert.match(bridge.data[1], /A6 6 /)
    const plain = crossingPaths(routes, 'plain', 2)
    assert.ok(plain.data.every(d => !d.includes('A')))
    assert.equal(plain.masks.flat().length, 0)
  }
  const diagonal = crossingPaths([crossing[0], path(1, [10, 10], [90, 90])], 'bridge', 2)
  assert.match(diagonal.data[1], /A6 6 45 /)
})

test('shared endpoints, T contacts, overlaps, and sections of the same edge are not crossings', () => {
  for (const routes of [
    [path(0, [0, 0], [50, 0]), path(1, [50, 0], [50, 50])],
    [path(0, [0, 0], [100, 0]), path(1, [50, 0], [50, 50])],
    [path(0, [0, 0], [100, 0]), path(1, [25, 0], [75, 0])],
    crossing.map(p => ({ ...p, owner: 0 })),
  ]) assert.equal(crossingPaths(routes, 'bridge', 2).masks.flat().length, 0)
})

test('nearby crossings share an arch; bends, labels and nodes remain unobstructed', () => {
  const clustered = crossingPaths([path(0, [48, 10], [48, 90]), path(1, [52, 10], [52, 90]), { ...crossing[1], owner: 2 }], 'bridge', 2)
  assert.equal(clustered.data[2].match(/A/g)?.length, 1)
  assert.equal(clustered.masks.flat().length, 2)
  const flipped = crossingPaths(crossing, 'bridge', 2, [{ x: 45, y: 40, width: 10, height: 7 }])
  assert.match(flipped.data[1], / 0 0 0 /)
  const blocked = crossingPaths(crossing, 'bridge', 2, [{ x: 40, y: 40, width: 20, height: 20 }])
  assert.ok(!blocked.data[1].includes('A'))
  const short = crossingPaths([crossing[0], path(1, [49, 50], [90, 50])], 'bridge', 2)
  assert.ok(!short.data[1].includes('A'))
})

test('native raster bridge remains separated from the underpass on transparent backgrounds', () => {
  const { data, masks } = crossingPaths(crossing, 'bridge', 2)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><mask id="under" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="white"/><path d="${masks[0][0]}" fill="none" stroke="black" stroke-width="5"/></mask></defs><path d="${data[0]}" mask="url(#under)" fill="none" stroke="#ff0000" stroke-width="2"/><path d="${data[1]}" fill="none" stroke="#0000ff" stroke-width="2"/></svg>`
  const { pixels } = new Resvg(svg).render()
  const pixel = (x, y) => [...pixels.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 4)]
  assert.ok(pixel(49, 49)[0] > 200, 'underpass must continue through the crossing centre')
  assert.ok(pixel(49, 43)[2] > 200, 'bridge arch must be visible')
  assert.equal(pixel(49, 42)[3], 0, 'clearance must be transparent, not a white patch')
  assert.equal(pixel(47, 49)[3], 0, 'upper route must leave the straight crossing centre')
})

test('schema, default renderer, and saved HTML retain independent crossing preferences', async () => {
  const gallery = JSON.parse(await readFile(new URL('../examples/documents/gallery.json', import.meta.url), 'utf8'))
  let example
  for (const candidate of gallery.diagrams.filter(d => !['sequence', 'fishbone'].includes(d.type))) {
    const svg = (await renderDiagram(candidate)).svg
    if (/<path d="[^"]*A/.test(svg) && svg.includes('<mask ')) { example = candidate; break }
  }
  assert.ok(example, 'gallery must exercise real routed crossings')
  const explicit = { ...example, id: 'bridge-example', layout: { ...example.layout, edgeCrossing: 'bridge' } }
  const plain = { ...example, id: 'plain-example', layout: { ...example.layout, edgeCrossing: 'plain' } }
  const stripIds = svg => svg.replace(/uml-figure-\d+/g, 'figure').replace(/uml-graph-\d+/g, 'graph')
  const bridgeImage = await renderDiagram(explicit), plainImage = await renderDiagram(plain)
  assert.equal(stripIds((await renderDiagram(example)).svg), stripIds(bridgeImage.svg))
  assert.ok(!plainImage.svg.includes('<mask '))
  inspectDiagram(explicit, bridgeImage)
  inspectDiagram(plain, plainImage)
  assert.throws(() => inspectDiagram(plain, bridgeImage), /bridge in plain crossing mode/)
  const brokenArc = bridgeImage.svg.replace(/(<path d="[^"]*)A[\d.]+ [\d.]+ /g, '$1A0 0 ')
  assert.notEqual(brokenArc, bridgeImage.svg)
  assert.throws(() => inspectDiagram(explicit, { ...bridgeImage, svg: brokenArc }), /invalid bridge arc/)
  assert.throws(() => validateSpec({ ...plain, layout: { edgeCrossing: 'dots' } }), /JSON/)
  const document = { version: 1, title: '交叉方式', diagrams: [explicit, plain] }
  const runtime = {
    js: await readFile(new URL('../assets/viewer.js', import.meta.url), 'utf8'),
    css: await readFile(new URL('../assets/viewer.css', import.meta.url), 'utf8'),
  }
  const saved = documentFromHtml(createHtml(document, runtime))
  assert.equal(saved.diagrams[0].layout.edgeCrossing, 'bridge')
  assert.equal(saved.diagrams[1].layout.edgeCrossing, 'plain')
})
