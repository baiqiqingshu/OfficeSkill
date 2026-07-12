# D2 Style Guide

## Minimal Template

```d2
direction: down

classes: {
  app: {
    style.stroke: "#1565C0"
    style.stroke-width: 2
    style.border-radius: 8
  }
  database: {
    shape: cylinder
    style.stroke: "#E65100"
    style.stroke-width: 2
  }
  queue: {
    shape: queue
    style.stroke: "#FF8F00"
    style.stroke-width: 2
  }
  external: {
    shape: cloud
    style.stroke: "#C62828"
    style.stroke-width: 2
  }
}

users: Users {
  class: external
  icon: https://icons.terrastruct.com/essentials%2F359-users.svg
}

api: API Service {
  class: app
  icon: https://icons.terrastruct.com/dev%2Fgo.svg
}

db: Database (PostgreSQL) {
  class: database
  icon: https://icons.terrastruct.com/dev%2Fpostgresql.svg
}

users -> api: HTTPS
api -> db: SQL
```

## Syntax Rules

- Use `id: Label` for labeled nodes.
- Use braces for properties: `node: Label { class: app }`.
- Use `->` for directed edges, `<-` for reverse, `<->` for bidirectional, and `--` for undirected edges.
- Quote labels containing punctuation when needed: `api -> db: "reads/writes"`.
- Avoid spaces in IDs. Use hyphens or underscores.
- Avoid dangling edges; define or clearly imply every source and target.
- Keys are case-insensitive: `postgresql` and `postgreSQL` reference the same shape.
- Use semicolons for multiple shapes on one line: `SQLite; Cassandra`.
- Use `\n` in labels for line breaks: `load\nbalancer`.

## Shape Catalog

Default shape is `rectangle`. Set `shape:` to one of:

| Shape | Notes |
| --- | --- |
| `rectangle` | Default |
| `square` | 1:1 ratio |
| `page` | |
| `parallelogram` | |
| `document` | |
| `cylinder` | Databases |
| `queue` | Message queues |
| `package` | |
| `step` | |
| `callout` | |
| `stored_data` | |
| `person` | Human figure |
| `diamond` | Decision |
| `oval` | |
| `circle` | 1:1 ratio |
| `hexagon` | |
| `cloud` | External services |
| `c4-person` | C4 person |
| `sequence_diagram` | Special: sequence diagram container |
| `sql_table` | Special: table with columns |
| `class` | Special: UML class |
| `image` | Standalone icon shape (requires `icon:`) |
| `text` | Plain text without border |

1:1 ratio shapes (`circle`, `square`): width and height are always equal.

## Containers

Containers are shapes that hold other shapes.

```d2
# Dot notation
server.process

# Nested syntax
clouds: {
  aws: AWS {
    load_balancer -> api
    api -> db
  }
  gcloud: Google Cloud {
    auth -> db
  }
  gcloud -> aws
}

# Reference parent with underscore
birthdays: {
  presents
  _.christmas.presents -> presents: regift
}
```

Container labels: use shorthand `gcloud: Google Cloud { ... }` or `label:` keyword.

## Connections

```d2
# Four valid connection types
a -- b
a -> b
a <- b
a <-> b

# Connection labels
Read Replica 1 -- Read Replica 2: Kept in sync

# Connection chaining
a -> b -> c -> d

# Repeated connections create multiple edges
Database -> S3: backup
Database -> S3: another backup

# Referencing connections by index
x -> y: hi
x -> y: hello
(x -> y)[0].style.stroke: red
(x -> y)[1].style.stroke: blue
```

Use solid edges for synchronous request/response and dashed edges for asynchronous messaging, scheduled work, or eventual consistency.

### Arrowheads

Override arrowhead shape or add labels with `source-arrowhead` and `target-arrowhead`:

```d2
a -> b: relationship {
  source-arrowhead: 1
  target-arrowhead: * {
    shape: diamond
    style.filled: true
  }
}
```

Arrowhead shape options:
- `triangle` (default; use `style.filled: false` for open)
- `arrow` (pointier than triangle)
- `diamond` (use `style.filled: true` for filled)
- `circle` (use `style.filled: true` for filled)
- `box` (use `style.filled: true` for filled)
- `cf-one`, `cf-one-required` (crows foot)
- `cf-many`, `cf-many-required` (crows foot)
- `cross`

Keep arrowhead labels short to avoid collision with surrounding objects.

## Classes

```d2
classes: {
  load balancer: {
    label: load\nbalancer
    width: 100
    height: 200
    style: {
      stroke-width: 0
      fill: "#44C7B1"
      shadow: true
      border-radius: 5
    }
  }
  unhealthy: {
    style.fill: "#FE7070"
    style.stroke: "#F69E03"
  }
}

# Apply class
web_lb.class: load balancer

# Multiple classes (applied left-to-right, later overrides earlier)
logo.class: [d2; sphere]

# Connection class (on declaration)
a -> b: {class: something}

# Connection class (targeting)
(a -> b)[0].class: something

# Object attributes override class attributes
x.class: unhealthy
x.style.fill: orange
```

Classes written into SVG as `class` attribute for post-processing with custom CSS/JS.

## Globs (Wildcards)

Globs make global changes in one line. They apply both backwards and forwards.

```d2
# Single glob: matches all shapes in current scope
*.style.fill: lightblue

# Suffix/prefix matching
*mini.height: 200
t*h*r.shape: person

# Recursive glob: targets all descendants
**.style.border-radius: 7

# Global glob: persists across layers and imports
***.style.fill: yellow

# Glob connections (self-connections omitted automatically)
* -> *: connected

# Scoped globs (only apply within their container)
foods: {
  pizzas: {
    *.shape: circle
  }
}

# Changing defaults for all shapes and connections
***.style.fill: lightblue
(*** -> ***)[*]: {
  style.stroke: red
}
```

### Glob Filters

Use `&` to filter targets, `!&` to inverse-filter:

```d2
# Filter by shape
*: {
  &shape: person
  style.multiple: true
}

# Inverse filter
*: {
  !&shape: person
  style.multiple: true
}

# Property filters
**: {
  &connected: true
  style.fill: yellow
}
**: {
  &leaf: true
  style.stroke: red
}

# Connection endpoint filters
(* -> *)[*]: {
  &src.style.fill: blue
  style.stroke-dash: 3
}

# Multiple filters = AND
*: {
  &shape: person
  &connected: true
  style.fill: red
}
```

## Text and Markdown

### Standalone Markdown text

```d2
explanation: |md
  # I can do headers
  - lists
  - lists

  And other normal markdown stuff
|
```

To put Markdown on a shape, explicitly declare the shape:
```d2
explanation: |md
  # Header
  Content here
|
explanation.shape: rectangle
```

### Code blocks

Change `md` to a programming language:
```d2
my_code: |go
  awsSession := From(c.Request.Context())
  client := s3.New(awsSession)
|
```

Aliases: `md`→markdown, `tex`→latex, `js`→javascript, `go`→golang, `py`→python, `rb`→ruby, `ts`→typescript.

### LaTeX

```d2
formula: |latex
  \lim_{h \rightarrow 0 } \frac{f(x+h)-f(x)}{h}
|
```

LaTeX blocks use MathJax. For multiline use `\displaylines{...}`. Size with `\tiny{}`, `\small{}`, `\large{}`, `\huge{}`.

Available LaTeX plugins: amscd, braket, cancel, color, gensymb, mhchem, physics.

### Block strings (pipe escaping)

For content containing `|`, add more pipes:
```d2
my_code: ||ts
  declare function getSmallPet(): Fish | Bird;
||

# Or use backtick delimiter
my_code: |`ts
  declare function getSmallPet(): Fish | Bird;
  const works = (a > 1) || (b < 2)
`|
```

### Plain text shape

```d2
title: A winning strategy {
  shape: text
  near: top-center
  style: {
    font-size: 55
    italic: true
  }
}
```

## Grid Diagrams

Display objects in a structured grid layout.

```d2
# Set rows only
grid-rows: 3
Executive
Legislative
Judicial

# Set columns only
grid-columns: 3

# Both (first keyword = dominant direction for fill order)
grid-rows: 2
grid-columns: 2

# Gap control
grid-gap: 0
vertical-gap: 10
horizontal-gap: 20

# Nested grids
grid-columns: 1
header
body: "" {
  grid-columns: 2
  content
  sidebar
}
footer
```

Key rules:
- First defined keyword (`grid-rows` or `grid-columns`) is the dominant fill direction.
- Cells expand to fill available space when only one dimension is defined.
- Use `width` / `height` on cells for specific sizing.
- Connections between grid cells are center-to-center straight lines (no path-finding).
- Nest grids within grids for complex layouts.
- Use invisible elements (`style.opacity: 0`) for alignment padding.

### Markdown Tables in Grids

For tabular data, prefer Markdown tables over grid:
```d2
savings: ||md
  | Month    | Savings | Expenses |
  | -------- | ------- | -------- |
  | January  | $250    | $150     |
  | February | $80     | $200     |
||
```

## Sequence Diagrams

```d2
shape: sequence_diagram
alice -> bob: What does it mean\nto be well-adjusted?
bob -> alice: The ability to play bridge or\ngolf as if they were games.
```

### Rules
- Children share the same scope throughout (no duplicate actors).
- Order matters: definition order = visual order.
- Actors appear left-to-right in declaration order.

### Features

```d2
# Spans (activation boxes)
shape: sequence_diagram
alice.t1 -> bob
alice.t2 -> bob.a
alice.t2.a -> bob.a

# Groups (labeled fragments)
shape: sequence_diagram
alice
bob
shower thoughts: {
  alice -> bob: A physicist is an atom's way of knowing about atoms.
}

# Notes (nested object with no connections)
shape: sequence_diagram
alice -> bob
bob."In the eyes of my dog, I'm a man."

# Self-messages
father -> father: internal debate ensues

# Actor shape customization
scorer: {shape: person}
```

Sequence diagrams are D2 objects: they can be contained, connected, relabeled, and styled.

## Positions

### `near` keyword

Position items on set points:
- `top-left`, `top-center`, `top-right`
- `center-left`, `center-right`
- `bottom-left`, `bottom-center`, `bottom-right`

```d2
# Diagram title
title: |md
  # A winning strategy
| {near: top-center}

# Legend
legend: {
  near: bottom-center
  color1: foo { shape: text; style.font-color: green }
}
```

### Label and icon positioning

```d2
x: worker {
  label.near: top-center
  icon: https://icons.terrastruct.com/essentials%2F005-programmer.svg
  icon.near: outside-top-right
}
```

Additional `near` values for labels/icons:
- `outside-top-left`, `outside-top-center`, `outside-top-right`
- `outside-left-center`, `outside-right-center`
- `outside-bottom-left`, `outside-bottom-center`, `outside-bottom-right`
- `border-top-center`, etc. (label on the border)

### Tooltip positioning

```d2
node: {
  tooltip: |md
    Details here
  |
  tooltip.near: center-left
}
```

## Theme-Aware Styling

Do not set `style.fill` in reusable classes unless the user explicitly wants a fixed theme. Prefer:

- `style.stroke`
- `style.stroke-width`
- `style.stroke-dash`
- `style.border-radius`
- `shape`

D2 themes handle fill and text colors better than fixed custom fills.

## Complete Style Keywords

| Keyword | Values | Applies to |
| --- | --- | --- |
| `opacity` | Float 0–1 | shapes, connections |
| `stroke` | CSS color, hex, gradient | shapes, connections |
| `fill` | CSS color, hex, gradient | shapes only |
| `fill-pattern` | `dots`, `lines`, `grain`, `none` | shapes only |
| `stroke-width` | Integer 1–15 | shapes, connections |
| `stroke-dash` | Integer 0–10 | shapes, connections |
| `border-radius` | Integer 0–20 (999 for pill) | shapes, connections |
| `shadow` | `true`/`false` | shapes only |
| `3d` | `true`/`false` | rectangle/square only |
| `multiple` | `true`/`false` | shapes only |
| `double-border` | `true`/`false` | rectangles, ovals |
| `font` | `mono` | shapes, connections |
| `font-size` | Integer 8–100 | shapes, connections |
| `font-color` | CSS color, hex, gradient | shapes, connections |
| `animated` | `true`/`false` | shapes, connections |
| `bold` | `true`/`false` | shapes, connections |
| `italic` | `true`/`false` | shapes, connections |
| `underline` | `true`/`false` | shapes, connections |
| `text-transform` | `uppercase`, `lowercase`, `title`, `none` | shapes, connections |
| `filled` | `true`/`false` | arrowheads only |

### Root-level styles

Apply to the diagram background:
```d2
style: {
  fill: LightBlue
  fill-pattern: dots
  stroke: FireBrick
  stroke-width: 2
  stroke-dash: 3
  double-border: true
}
```

## Layout

- Put `direction: down` or `direction: right` at the top.
- Define nodes in data-flow order.
- Define connected nodes close together in source order.
- Use containers for real boundaries such as VPC, cluster, region, service layer, or subsystem.
- Use `grid-columns` inside wide layers when it improves scanning.

## Icons

When icons are wanted, add `icon:` directly to each technology node. Do not rely on imported classes for icon URLs when rendering with `--bundle`.

For standalone icon shapes use `shape: image`:
```d2
server: {
  shape: image
  icon: https://icons.terrastruct.com/tech/022-server.svg
}
```

Icon placement is automatic. Container icons appear top-left; non-container icons appear centered. Use `icon.near:` to override placement.

Local images supported with D2 CLI: `icon: ./my_cat.png`.

Common icons:

| Technology | URL |
| --- | --- |
| Users | `https://icons.terrastruct.com/essentials%2F359-users.svg` |
| Server | `https://icons.terrastruct.com/tech%2F022-server.svg` |
| Browser | `https://icons.terrastruct.com/tech%2Fbrowser-2.svg` |
| Go | `https://icons.terrastruct.com/dev%2Fgo.svg` |
| Python | `https://icons.terrastruct.com/dev%2Fpython.svg` |
| Node.js | `https://icons.terrastruct.com/dev%2Fnodejs.svg` |
| TypeScript | `https://icons.terrastruct.com/dev%2Ftypescript.svg` |
| Docker | `https://icons.terrastruct.com/dev%2Fdocker.svg` |
| Kubernetes | `https://icons.terrastruct.com/dev%2Fkubernetes.svg` |
| Terraform | `https://icons.terrastruct.com/dev%2Fterraform.svg` |
| PostgreSQL | `https://icons.terrastruct.com/dev%2Fpostgresql.svg` |
| MySQL | `https://icons.terrastruct.com/dev%2Fmysql.svg` |
| Redis | `https://icons.terrastruct.com/dev%2Fredis.svg` |
| MongoDB | `https://icons.terrastruct.com/dev%2Fmongodb.svg` |
| GitHub | `https://icons.terrastruct.com/dev%2Fgithub.svg` |
| AWS EC2 | `https://icons.terrastruct.com/aws%2FCompute%2FAmazon-EC2.svg` |
| AWS Lambda | `https://icons.terrastruct.com/aws%2FCompute%2FAWS-Lambda.svg` |
| AWS ECS | `https://icons.terrastruct.com/aws%2FCompute%2FAmazon-Elastic-Container-Service.svg` |
| AWS S3 | `https://icons.terrastruct.com/aws%2FStorage%2FAmazon-Simple-Storage-Service-S3.svg` |
| AWS RDS | `https://icons.terrastruct.com/aws%2FDatabase%2FAmazon-RDS.svg` |
| AWS DynamoDB | `https://icons.terrastruct.com/aws%2FDatabase%2FAmazon-DynamoDB.svg` |
| AWS VPC | `https://icons.terrastruct.com/aws%2FNetworking%2FAmazon-VPC.svg` |
| AWS CodeDeploy | `https://icons.terrastruct.com/aws%2FDeveloper%20Tools%2FAWS-CodeDeploy.svg` |
| AWS Backup | `https://icons.terrastruct.com/aws%2FStorage%2FAWS-Backup.svg` |
| GCP BigQuery | `https://icons.terrastruct.com/gcp%2FAnalytics%2FBigQuery.svg` |
| Azure Blob Storage | `https://icons.terrastruct.com/azure%2FStorage%2FBlob-Storage.svg` |

Some icon URLs may return 403 depending on Terrastruct availability. If an icon blocks rendering, remove the icon and rely on shape plus class styling.

## Rendering

Use:

```bash
d2 --bundle input.d2 output-light.svg --theme 0 --layout elk --animate-interval=1200
d2 --bundle input.d2 output-dark.svg --theme 200 --layout elk --animate-interval=1200
```

If `elk` fails, retry with `--layout dagre`.

## Themes

D2 内置 20 种主题。通过 `--theme <ID>` 指定亮色主题，`--dark-theme <ID>` 指定暗色主题。

### Light 主题

| ID | Name | Style |
| --- | --- | --- |
| 0 | Neutral Default | 默认，中性灰蓝 |
| 1 | Neutral Grey | 纯灰色系，正式文档 |
| 3 | Flagship Terrastruct | 蓝绿品牌色 |
| 4 | Cool Classics | 经典冷色 |
| 5 | Mixed Berry Blue | 浆果蓝 |
| 6 | Grape Soda | 紫色调 |
| 7 | Aubergine | 茄紫优雅 |
| 8 | Colorblind Clear | 色盲友好 |
| 100 | Vanilla Nitro Cola | 暖棕复古 |
| 101 | Orange Creamsicle | 橙色活力 |
| 102 | Shirley Temple | 粉红柔和 |
| 103 | Earth Tones | 大地色系 |
| 104 | Everglade Green | 清新绿色 |
| 105 | Buttered Toast | 黄棕暖色 |
| 300 | Terminal | 特殊：终端风格（大写、等宽、无圆角、dots 填充） |
| 301 | Terminal Grayscale | 终端灰度 |
| 302 | Origami | 特殊：折纸风格 |
| 303 | C4 | 特殊：C4 架构模型 |

### Dark 主题

| ID | Name | Style |
| --- | --- | --- |
| 200 | Dark Mauve | 暗紫红 |
| 201 | Dark Flagship Terrastruct | 品牌暗色 |

### 在 D2 文件中设置主题

```d2
vars: {
  d2-config: {
    theme-id: 104
    dark-theme-id: 200
    layout-engine: elk
  }
}
```

### 自定义主题颜色

```d2
vars: {
  d2-config: {
    theme-overrides: {
      B1: "#2E7D32"
      B2: "#66BB6A"
      B3: "#A5D6A7"
      B4: "#C5E1A5"
      B5: "#E6EE9C"
      B6: "#FFF59D"
      AA2: "#0D47A1"
      AA4: "#42A5F5"
      AA5: "#90CAF9"
      AB4: "#F44336"
      AB5: "#FFCDD2"
    }
  }
}
```

色码说明：`B1`–`B6` 为主要填充色梯度（B1 深 → B6 浅），`AA*` 为强调色 A 系列，`AB*` 为强调色 B 系列。

### 特殊主题行为

**Terminal (300)**: 自动应用全大写、无圆角、等宽字体、容器 dots 填充、最外层 double-border。
**C4 (303)**: 适配 C4 架构模型配色，配合 `c4-person` shape。

## Common Errors

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `unexpected token` | Missing brace, quote, or invalid property syntax | Run `d2 fmt --check`, inspect line number |
| Arrow not accepted | Used `=>` | Replace with `->` |
| Missing icons after bundle | Icon URL only exists in imported class | Put `icon:` directly on each node |
| Bad dark mode | Fixed fill colors | Remove `style.fill` |
| Cluttered simplified view | Too many nodes | Aggregate to 3-8 major components |
| Grid cells misaligned | Cells in same row/column differ in content width | Set explicit `width` on cells |
| Sequence actor duplicated | Redeclared actor in different group scope | Predeclare actors before groups |
| Glob not applying | Glob defined in wrong scope | Move glob to correct container or use `**` for recursive |
