import type { FastifyInstance } from "fastify";
import type { DocGraphCompiler } from "@docgraph/worker-ingest";

export async function registerGraphRoutes(app: FastifyInstance, compiler: DocGraphCompiler): Promise<void> {
  app.get("/v1/graphs/:docId/links", async (request, reply) => {
    const docId = (request.params as { docId?: string }).docId;
    if (!docId) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "docId is required."
      });
    }

    return reply.send({
      items: compiler.getOutgoingLinks(docId)
    });
  });

  app.get("/v1/graphs/:docId/backlinks", async (request, reply) => {
    const docId = (request.params as { docId?: string }).docId;
    if (!docId) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "docId is required."
      });
    }

    return reply.send({
      items: compiler.getBacklinks(docId)
    });
  });
}
