import { validateSpec } from './validate'
import { resolveTheme } from './themes'
import { renderGraph } from './graph'
import { renderFishbone, renderSequence } from './special'
import type { RenderedDiagram } from './types'
export async function renderDiagram(input: unknown): Promise<RenderedDiagram> {
  const spec = validateSpec(input), theme = resolveTheme(spec)
  if (spec.type === 'sequence') return renderSequence(spec, theme)
  if (spec.type === 'fishbone') return renderFishbone(spec, theme)
  return renderGraph(spec, theme)
}
