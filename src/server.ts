import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createDatabase } from "./db/pool.js";

const env = loadEnv();
const db = createDatabase(env);
const app = await buildApp({ env, db });
let shutdownPromise: Promise<void> | null = null;

async function shutdown(signal: string): Promise<void> {
  shutdownPromise ??= (async () => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await db.close();
  })();

  await shutdownPromise;
}

function handleSignal(signal: "SIGINT" | "SIGTERM"): void {
  void shutdown(signal)
    .then(() => {
      process.exit(0);
    })
    .catch((error: unknown) => {
      app.log.error({ error, signal }, "shutdown failed");
      process.exit(1);
    });
}

process.on("SIGINT", () => handleSignal("SIGINT"));

process.on("SIGTERM", () => handleSignal("SIGTERM"));

await app.listen({
  host: env.host,
  port: env.port
});
