import "fastify";
import type { Database } from "../db/pool.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }

  interface FastifyRequest {
    rawBody?: string;
  }
}
