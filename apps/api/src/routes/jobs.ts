import type { FastifyInstance } from "fastify";
import type { DocGraphCompiler } from "@docgraph/worker-ingest";

export async function registerJobRoutes(app: FastifyInstance, compiler: DocGraphCompiler): Promise<void> {
  app.get("/v1/jobs/:jobId", async (request, reply) => {
    const jobId = (request.params as { jobId?: string }).jobId;
    if (!jobId) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "jobId is required."
      });
    }

    const job = compiler.getJob(jobId);
    if (!job) {
      return reply.code(404).send({
        code: "JOB_NOT_FOUND",
        message: `Job ${jobId} was not found.`
      });
    }

    return reply.send(job);
  });

  app.get("/v1/jobs/:jobId/documents", async (request, reply) => {
    const jobId = (request.params as { jobId?: string }).jobId;
    if (!jobId) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "jobId is required."
      });
    }

    return reply.send({
      items: compiler.getJobDocuments(jobId).map((document) => ({
        docId: document.docId,
        path: document.path,
        title: document.title,
        format: document.format,
        canonicalHash: document.canonicalHash,
        diagnostics: document.diagnostics
      }))
    });
  });
}
