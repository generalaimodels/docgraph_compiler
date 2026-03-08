import Fastify from "fastify";
import cors from "@fastify/cors";
import { DocGraphCompiler } from "@docgraph/worker-ingest";
import { registerDocumentRoutes } from "./routes/documents.js";
import { registerGraphRoutes } from "./routes/graphs.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerImportRoutes } from "./routes/import.js";
import { registerJobRoutes } from "./routes/jobs.js";

export async function createServer() {
  const app = Fastify({
    logger: false
  });
  const compiler = new DocGraphCompiler();

  await app.register(cors, {
    origin: true
  });

  await registerHealthRoutes(app, compiler);
  await registerImportRoutes(app, compiler);
  await registerJobRoutes(app, compiler);
  await registerDocumentRoutes(app, compiler);
  await registerGraphRoutes(app, compiler);

  return app;
}
