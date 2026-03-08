import type { FastifyInstance } from "fastify";
import type { ImportFileRequest, ImportRepoRequest } from "@docgraph/api-contracts";
import type { DocGraphCompiler } from "@docgraph/worker-ingest";

function isImportFileRequest(value: unknown): value is ImportFileRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.path === "string" && typeof record.contentBase64 === "string";
}

function isImportRepoRequest(value: unknown): value is ImportRepoRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const source = record.source as Record<string, unknown> | undefined;
  return Boolean(
    source &&
      source.provider === "github" &&
      typeof source.owner === "string" &&
      typeof source.repo === "string"
  );
}

export async function registerImportRoutes(app: FastifyInstance, compiler: DocGraphCompiler): Promise<void> {
  app.post("/v1/import/files", async (request, reply) => {
    if (!isImportFileRequest(request.body)) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "Expected { path, contentBase64 }."
      });
    }

    const idempotencyKey = typeof request.headers["idempotency-key"] === "string" ? request.headers["idempotency-key"] : undefined;
    const job = compiler.scheduleFileImport(request.body, idempotencyKey);
    return reply.code(202).send(job);
  });

  app.post("/v1/import/repos", async (request, reply) => {
    if (!isImportRepoRequest(request.body)) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "Expected a GitHub repository import payload."
      });
    }

    const idempotencyKey = typeof request.headers["idempotency-key"] === "string" ? request.headers["idempotency-key"] : undefined;
    const job = compiler.scheduleRepoImport(request.body, idempotencyKey);
    return reply.code(202).send(job);
  });
}
