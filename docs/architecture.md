# Architecture

DocGraph Compiler is implemented as a compiler pipeline:

1. Source adapters ingest `.md`, `.mdx`, `.rdx`, `.docx`, and `.ipynb`.
2. Each adapter emits the same canonical `DocumentIR`.
3. Renderers and projections consume only the canonical IR.
4. The orchestration layer stores jobs, compiled documents, resolved links, and backlinks in memory.
5. The API and the admin console operate on those derived artifacts without format-specific branching.

The current implementation is intentionally storage-light so the repository remains runnable without external infrastructure. The package boundaries match the architecture spec, so Redis, Postgres, a queue, and object storage can be introduced later without rewriting the parser and renderer contracts.
