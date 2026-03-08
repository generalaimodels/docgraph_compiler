import { createServer } from "./server.js";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 3000);

const app = await createServer();
await app.listen({
  host,
  port
});
