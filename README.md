# DocGraph Compiler

DocGraph Compiler is a compiler-style document ingestion platform that normalizes heterogeneous document formats into a canonical typed IR, builds navigation and link projections, and renders preview/export outputs through a single deterministic pipeline.

## Implemented Scope

- Type-safe canonical IR with provenance, diagnostics, fidelity scoring, link graph edges, and notebook-aware block nodes.
- Format adapters for `.md`, `.mdx`, `.rdx`, `.docx`, and `.ipynb`.
- HTML, Markdown, and JSON renderers fed exclusively from the canonical IR.
- In-memory orchestration layer with asynchronous job state tracking, idempotency support, repository import, and backlink generation.
- Fastify API for file import, GitHub repository import, job inspection, document retrieval, previews, and graph endpoints.
- Responsive admin console focused on import, preview, diagnostics, and link graph inspection. A dummy text mark is used instead of a designed logo.

## Workspace Layout

```text
apps/
  api/                Fastify API surface
  admin-console/      React/Vite operator console
packages/
  core-types/         Canonical IR vocabulary
  core-ir/            Builder, adapter contract, hashing
  source-sniffer/     Source descriptor creation
  parser-*/           Format adapters
  renderer-*/         Canonical renderers
  projection-*/       TOC, backlinks, search projections
  worker-ingest/      In-memory orchestration engine
  api-contracts/      Shared API request/response contracts
  observability/      Structured logger and in-memory metrics
  security/           Path and size boundary guards
```

## Commands

```bash
npm install
npm run build
npm run test
npm run dev:api
npm run dev:web
```

## Environment

Copy `.env.example` and set the variables that apply to your environment. `GITHUB_TOKEN` is optional but recommended for repository imports to avoid low unauthenticated rate limits.
