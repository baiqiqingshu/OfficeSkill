# D2 Diagram Workflow

Use this reference for repo-derived infrastructure and architecture diagrams.

## Discovery

Run broad searches first, then read selected files:

- Infrastructure: `*.tf`, `*.tfvars`, `Pulumi.yaml`, `cdk.json`, `serverless.yml`, CloudFormation templates, `Dockerfile*`, `docker-compose*.yml`, Kubernetes YAML with `apiVersion:`, Helm charts, Ansible playbooks.
- Documentation: `README.md`, `ARCHITECTURE.md`, `INFRASTRUCTURE.md`, `docs/**/*.md`, existing `diagrams/**/*`.
- Application structure: `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `requirements.txt`, `pom.xml`, `main.*`, `index.*`, `app.*`, `server.*`, route files, handlers, clients, config.
- Runtime relationships: environment variables, SDK clients, database connection code, queue/topic names, webhook URLs, scheduled jobs.

Skip `.git`, `node_modules`, `vendor`, build outputs, and generated binaries unless the user asks otherwise.

## Source of Truth

Prefer source files and IaC over existing docs. Existing diagrams are hints only and may be stale. When evidence is uncertain, label it as unverified in the supporting notes or final summary.

## Standard Output Set

For a comprehensive generation request, create:

- `diagrams/infrastructure.md`
- `diagrams/infrastructure.d2`
- `diagrams/infrastructure-light.svg`
- `diagrams/infrastructure-dark.svg`
- `diagrams/infrastructure-simplified.md`
- `diagrams/infrastructure-simplified.d2`
- `diagrams/infrastructure-simplified-light.svg`
- `diagrams/infrastructure-simplified-dark.svg`
- `diagrams/architecture.md`
- `diagrams/architecture.d2`
- `diagrams/architecture-light.svg`
- `diagrams/architecture-dark.svg`
- `diagrams/architecture-simplified.md`
- `diagrams/architecture-simplified.d2`
- `diagrams/architecture-simplified-light.svg`
- `diagrams/architecture-simplified-dark.svg`
- `diagrams/README.md`

Create fewer files when the user asks for a focused diagram.

## Infrastructure Documentation

Capture:

- Compute: services, containers, functions, VMs, workers, jobs.
- Data: databases, caches, buckets, queues, streams, search indexes.
- Network: VPCs, subnets, gateways, load balancers, DNS, CDN, ingress.
- Security: IAM, secrets, KMS, security groups, policy boundaries.
- External services: SaaS, third-party APIs, webhooks, payment or identity providers.
- Relationships: protocol, direction, sync/async, data exchanged.

## Architecture Documentation

Capture:

- System context: users and external systems.
- Services/modules: purpose, technology, entry points, dependencies, exposed interfaces.
- Data flows: 2-3 critical request or event paths.
- Deployment mapping: how logical components map to infrastructure.
- Risks or uncertainty: circular dependencies, missing IaC, undocumented services.

## Simplification Rules

For simplified diagrams:

- Keep 3-8 major components.
- Aggregate similar resources into logical groups.
- Keep technology names in labels, for example `Database (PostgreSQL)`.
- Hide instance sizes, counts, availability zones, IAM details, and low-level network plumbing unless essential.
- Keep major boundaries: external/internal, edge/app/data, cloud/VPC/cluster.

## README Integration

Use `scripts/write_diagram_readme.py diagrams` after rendering a standard diagram set. Update the main project README only when the user asks or when the task explicitly includes README integration.
