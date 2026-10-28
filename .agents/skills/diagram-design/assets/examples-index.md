# Examples index

`examples.zip` packs all 210 finished example diagrams, stored flat under
their original names. Docs reference members as `assets/examples.zip/<name>`.
Naming: `example-<type>.html` light · `-dark` · `-full` · `-animated` · `-terminal`.

List: `python -m zipfile -l assets/examples.zip` — extract: `-e assets/examples.zip <outdir>`.
Tip: extract into this dir (`-e examples.zip .`) and open `index.html` for the gallery.

Loose for quick reference (also in zip): `example-architecture{,-dark}.html`,
`example-flowchart-full.html`, `example-loop-terminal.html`,
`example-paved-road-animated.html`, `example-quadrant-consultant.html`.

## Contents by variant

- Light + dark + full per stem (65 stems × 3 = 195 files):
  architecture{,-containment,-delta}, axonometric-plan{,-campus,-coffee-shop,-warehouse},
  exploded{,-ai-stack,-keyboard,-phone,-unboxing}, high-level{,-vertical},
  sequence{,-oauth}, state{,-lifecycle}, tree{,-block-decomposition}, bar,
  beeswarm, bubble, bump, data-flow, datalake, db-schema, dependency, deployment,
  dp-integration, dp-security-matrix, er, fishbone, flowchart, gantt, heatmap,
  it-state, journey, kanban, layers, line, loop, marimekko, medallion, nested,
  org-chart, polar, process, pyramid, quadrant, radar, ridgeline, sankey,
  scatter, service-blueprint, slopegraph, story-map, streamgraph, swimlane,
  timeline, treemap, uml-class, venn, wardley, waterfall
- Animated only (10): paved-road, policy-trace, queue; axonometric-plan
  {-campus,-coffee-shop,-warehouse}; exploded{-ai-stack,-keyboard,-phone,-unboxing}
- Terminal only (1): loop — Single-file specials (4): quadrant-consultant,
  import-drawio, import-excalidraw, import-mermaid
