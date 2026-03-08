import type { FastifyInstance } from "fastify";
import type { DocGraphCompiler } from "@docgraph/worker-ingest";

export async function registerDocumentRoutes(app: FastifyInstance, compiler: DocGraphCompiler): Promise<void> {
  app.get("/v1/documents/:docId", async (request, reply) => {
    const docId = (request.params as { docId?: string }).docId;
    if (!docId) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "docId is required."
      });
    }

    const document = compiler.getDocument(docId);
    if (!document) {
      return reply.code(404).send({
        code: "DOCUMENT_NOT_FOUND",
        message: `Document ${docId} was not found.`
      });
    }

    return reply.send(document);
  });

  app.get("/v1/documents/:docId/ir", async (request, reply) => {
    const docId = (request.params as { docId?: string }).docId;
    const document = docId ? compiler.getDocument(docId) : null;
    if (!document) {
      return reply.code(404).send({
        code: "DOCUMENT_NOT_FOUND",
        message: `Document ${docId ?? ""} was not found.`
      });
    }

    return reply.send(document.ir);
  });

  app.get("/v1/documents/:docId/preview", async (request, reply) => {
    const docId = (request.params as { docId?: string }).docId;
    const document = docId ? compiler.getDocument(docId) : null;
    if (!document) {
      return reply.code(404).send({
        code: "DOCUMENT_NOT_FOUND",
        message: `Document ${docId ?? ""} was not found.`
      });
    }

    const format = ((request.query as { format?: string }).format ?? "html").toLowerCase();
    if (format === "md") {
      reply.type("text/markdown");
      return reply.send(document.markdownPreview);
    }

    if (format === "json") {
      reply.type("application/json");
      return reply.send(document.jsonPreview);
    }

    reply.type("text/html");
    return reply.send(document.htmlPreview);
  });

  app.post("/v1/render", async (request, reply) => {
    const body = request.body as { docId?: string; format?: "html" | "md" | "json" };
    if (!body?.docId) {
      return reply.code(400).send({
        code: "INVALID_REQUEST",
        message: "docId is required."
      });
    }

    const document = compiler.getDocument(body.docId);
    if (!document) {
      return reply.code(404).send({
        code: "DOCUMENT_NOT_FOUND",
        message: `Document ${body.docId} was not found.`
      });
    }

    switch (body.format) {
      case "md":
        reply.type("text/markdown");
        return reply.send(document.markdownPreview);
      case "json":
        reply.type("application/json");
        return reply.send(document.jsonPreview);
      default:
        reply.type("text/html");
        return reply.send(document.htmlPreview);
    }
  });
}
