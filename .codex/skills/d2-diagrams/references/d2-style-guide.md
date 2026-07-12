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
- Use `->` for directed edges and `--` for undirected edges.
- Quote labels containing punctuation when needed: `api -> db: "reads/writes"`.
- Avoid spaces in IDs. Use hyphens or underscores.
- Avoid dangling edges; define or clearly imply every source and target.

## Theme-Aware Styling

Do not set `style.fill` in reusable classes unless the user explicitly wants a fixed theme. Prefer:

- `style.stroke`
- `style.stroke-width`
- `style.stroke-dash`
- `style.border-radius`
- `shape`

D2 themes handle fill and text colors better than fixed custom fills.

## Layout

- Put `direction: down` or `direction: right` at the top.
- Define nodes in data-flow order.
- Define connected nodes close together in source order.
- Use containers for real boundaries such as VPC, cluster, region, service layer, or subsystem.
- Use `grid-columns` inside wide layers when it improves scanning.

## Connections

```d2
client -> api: HTTPS
api -> db: SQL {
  style.stroke: "#388E3C"
  style.stroke-width: 2
}
api -> queue: event {
  style.stroke: "#7B1FA2"
  style.stroke-width: 2
  style.stroke-dash: 5
}
worker -> queue: consumes {
  style.stroke-dash: 5
}
```

Use solid edges for synchronous request/response and dashed edges for asynchronous messaging, scheduled work, or eventual consistency.

## Icons

When icons are wanted, add `icon:` directly to each technology node. Do not rely on imported classes for icon URLs when rendering with `--bundle`.

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
| AWS EC2 | `https://icons.terrastruct.com/aws%2FCompute%2FAmazon-EC2.svg` |
| AWS Lambda | `https://icons.terrastruct.com/aws%2FCompute%2FAWS-Lambda.svg` |
| AWS ECS | `https://icons.terrastruct.com/aws%2FCompute%2FAmazon-Elastic-Container-Service.svg` |
| AWS S3 | `https://icons.terrastruct.com/aws%2FStorage%2FAmazon-Simple-Storage-Service-S3.svg` |
| AWS RDS | `https://icons.terrastruct.com/aws%2FDatabase%2FAmazon-RDS.svg` |
| AWS DynamoDB | `https://icons.terrastruct.com/aws%2FDatabase%2FAmazon-DynamoDB.svg` |
| AWS VPC | `https://icons.terrastruct.com/aws%2FNetworking%2FAmazon-VPC.svg` |
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

## Common Errors

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `unexpected token` | Missing brace, quote, or invalid property syntax | Run `d2 fmt --check`, inspect line number |
| Arrow not accepted | Used `=>` | Replace with `->` |
| Missing icons after bundle | Icon URL only exists in imported class | Put `icon:` directly on each node |
| Bad dark mode | Fixed fill colors | Remove `style.fill` |
| Cluttered simplified view | Too many nodes | Aggregate to 3-8 major components |
