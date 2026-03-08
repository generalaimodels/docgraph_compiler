import type { FastifyInstance } from "fastify";
import type { DocGraphCompiler } from "@docgraph/worker-ingest";

export async function registerHealthRoutes(app: FastifyInstance, compiler: DocGraphCompiler): Promise<void> {
  app.get("/v1/health", async () => ({
    ok: true,
    metrics: compiler.getMetricsSnapshot()
  }));
}
