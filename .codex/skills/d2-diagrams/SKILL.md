---
name: d2-diagrams
description: Generate, validate, render, and document D2 diagrams for software architecture, infrastructure, cloud, service dependency, deployment, data-flow, and system overview tasks. Use when Codex is asked to draw diagrams with D2, create .d2 files, render SVG diagrams, add light/dark themed outputs, analyze a codebase for architecture or infrastructure diagrams, update ./diagrams documentation, or troubleshoot D2 syntax/rendering problems.
---

# D2 Diagrams

Use this skill to produce clear D2 diagrams and SVG outputs from a user request, existing architecture notes, or a codebase scan. Prefer D2 source as the durable artifact and SVG as the rendered deliverable.

This skill bundles its own D2 executable at `bin/d2.exe`. Use the provided Python scripts for validation and rendering so D2 is resolved from the skill directory first and does not depend on a system-wide install or PATH entry.

## Quick Start

1. Clarify the diagram type: architecture, infrastructure, sequence/data flow, dependency map, deployment, or general system overview.
2. If the request is based on a codebase, scan first with `rg --files` and targeted `rg` searches. Treat code and IaC as authoritative; use existing docs only as hints.
3. Create or update files under `./diagrams/` unless the user requests another location.
4. Write concise `.d2` source with explicit nodes, meaningful edge labels, and grouped containers.
5. Validate before rendering:

```bash
python .codex/skills/d2-diagrams/scripts/check_d2.py diagrams/example.d2
```

6. Render light and dark SVGs:

```bash
python .codex/skills/d2-diagrams/scripts/render_d2.py diagrams/example.d2 --light diagrams/example-light.svg --dark diagrams/example-dark.svg
```

7. Enhance SVGs with animation CSS when useful:

```bash
python .codex/skills/d2-diagrams/scripts/enhance_svg.py --all diagrams --css .codex/skills/d2-diagrams/assets/animations.css
```

8. Summarize created files, validation results, and any uncertainty.

## Codebase Diagram Workflow

For repo-derived diagrams, use this sequence:

1. Read `references/workflow.md`.
2. Scan infrastructure files: Terraform, Pulumi, CloudFormation, CDK, Kubernetes, Helm, Docker, Serverless, Ansible, CI/CD.
3. Scan application structure: package manifests, entry points, config, routes, handlers, service modules, clients, database access, queues, scheduled jobs.
4. Create supporting Markdown docs only when needed to make the diagram traceable. Keep claims tied to source paths.
5. Generate up to four standard diagram families when the user asks for comprehensive output:
   - `infrastructure.d2`
   - `infrastructure-simplified.d2`
   - `architecture.d2`
   - `architecture-simplified.d2`
6. Render each diagram to `*-light.svg` and `*-dark.svg`.
7. Create `./diagrams/README.md` with `scripts/write_diagram_readme.py` when the diagram set is complete.

## D2 Authoring Rules

Read `references/d2-style-guide.md` when creating non-trivial D2 or fixing syntax. Core rules:

- Use `->` for directed relationships; do not use `=>`.
- Use stable node IDs without spaces, and put human labels after `:`.
- Put connected nodes near each other in source order.
- Use `direction: down` or `direction: right` near the top.
- Group related nodes in containers only when it improves readability.
- Use `class:` for styling and direct `icon:` URLs for technology nodes when icons are desired.
- Do not set explicit `style.fill` for theme-aware diagrams; let D2 themes handle fills.
- For simplified diagrams, target 3-8 major components.
- Distinguish asynchronous flows with dashed edges.

## Rendering Standards

Use D2 with `--bundle` whenever icons are present so SVGs are self-contained. Default themes:

- Light: `--theme 0`
- Dark: `--theme 200`
- Preferred layout: `--layout elk`
- Fallback layout: `--layout dagre`

If rendering fails, inspect the exact D2 error, fix the smallest source issue, and retry. After three failures, simplify the diagram and report what changed.

## Project Rules

If `./diagrams/rules.md` exists, read it before creating diagrams. It may define naming preferences, paths to exclude, required extra components, style preferences, or whether icons should be disabled. Do not fail if the file is absent.

## Bundled Resources

- `bin/d2.exe`: Bundled D2 CLI used by this skill before falling back to PATH.
- `scripts/d2_executable.py`: Resolve the bundled D2 executable path for all skill scripts.
- `scripts/check_d2.py`: Check D2 availability, format validity, optional renderability, node/edge counts, and icon warnings.
- `scripts/render_d2.py`: Render one `.d2` file to light/dark SVGs with elk-first, dagre-fallback behavior.
- `scripts/enhance_svg.py`: Inject animation CSS into one SVG or every SVG in a directory.
- `scripts/inline_svg_icons.py`: Convert bundled base64 SVG `<image>` tags into inline `<svg>` elements for hosts that strip image tags.
- `scripts/write_diagram_readme.py`: Create a standard `./diagrams/README.md` landing page for generated diagram sets.
- `assets/animations.css`: Motion CSS for arrows, database shapes, queues, text protection, and reduced-motion support.
- `references/workflow.md`: Codebase scan and comprehensive diagram workflow.
- `references/d2-style-guide.md`: D2 syntax, layout, classes, icon use, and error recovery.
