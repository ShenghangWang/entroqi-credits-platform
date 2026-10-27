import { parsePricingOperators } from "./pricing/routes.js";
import { buildPrivateApp, parseCredentials } from "./private-api.js";
import { loadEnv } from "./config/env.js";
import { createDatabase } from "./db/pool.js";
import { registerIdentityNamespaces } from './customer/identity-namespaces.js';

const env = loadEnv();
const credentials = parseCredentials(process.env.CREDITS_SERVICE_CREDENTIALS ?? "[]");
const db = createDatabase(env);
if (!credentials.some(c => c.identityMode === 'company')) await registerIdentityNamespaces(db, credentials);
const app = await buildPrivateApp(db, credentials, parsePricingOperators(process.env.CREDITS_PRICING_OPERATORS ?? "[]"));
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
