import test from 'node:test'
import assert from 'node:assert/strict'
import { Resvg } from '@resvg/resvg-js'
import { renderDiagram } from '../dist/core.mjs'

const directions = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]]

function markerPixels(marker, position, direction) {
  const [horizontal, vertical] = direction
  const length = Math.hypot(horizontal, vertical)
  const unitX = horizontal / length, unitY = vertical / length
  const id = marker.match(/\bid="([^"]+)"/)[1]
  const start = position === 'start' ? [50, 50] : [50 - unitX * 35, 50 - unitY * 35]
  const end = position === 'end' ? [50, 50] : [50 + unitX * 35, 50 + unitY * 35]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs>${marker}</defs><path d="M ${start.join(' ')} L ${end.join(' ')}" fill="none" stroke="#2167a8" stroke-width="1.6" marker-${position}="url(#${id})"/></svg>`
  const { pixels } = new Resvg(svg, { font: { loadSystemFonts: false } }).render()
  let ahead = 0, behind = 0
  for (let pixelY = 0; pixelY < 100; pixelY++) for (let pixelX = 0; pixelX < 100; pixelX++) {
    if (pixels[(pixelY * 100 + pixelX) * 4 + 3] < 80) continue
    const offsetX = pixelX + 0.5 - 50, offsetY = pixelY + 0.5 - 50
    const along = offsetX * unitX + offsetY * unitY
    const across = offsetX * unitY - offsetY * unitX
    if (Math.abs(across) <= 1.5) continue
    if (along > 2) ahead++
    if (along < -2) behind++
  }
  return { ahead, behind }
}

test('native raster arrowheads follow horizontal, vertical and diagonal relationships', async context => {
  const sequence = await renderDiagram({ version: 1, type: 'sequence', title: '返回与自调用', participants: [{ id: 'a', label: '调用方' }, { id: 'b', label: '服务' }], messages: [{ from: 'b', to: 'a', label: '返回', kind: 'return' }, { from: 'b', to: 'b', label: '自调用' }] })
  const graph = await renderDiagram({ version: 1, type: 'class', title: '关系方向', nodes: [{ id: 'a', label: '整体' }, { id: 'b', label: '部分' }], edges: [{ from: 'a', to: 'b', kind: 'composition' }] })
  const markers = [...`${sequence.svg}${graph.svg}`.matchAll(/<marker\b[\s\S]*?<\/marker>/g)].map(match => match[0])
  assert.equal(markers.length, 7)
  for (const marker of markers) {
    const id = marker.match(/\bid="([^"]+)"/)[1]
    const position = /-(?:aggregation|composition)$/.test(id) ? 'start' : 'end'
    await context.test(id, () => {
      for (const direction of directions) {
        const { ahead, behind } = markerPixels(marker, position, direction)
        const expected = position === 'start' ? ahead : behind
        const wrong = position === 'start' ? behind : ahead
        assert.ok(expected >= 6, `${id} ${direction}: missing marker on the relationship side (${expected} pixels)`)
        assert.ok(wrong <= 2, `${id} ${direction}: marker points away from its endpoint (${wrong} pixels)`)
      }
    })
  }
})
