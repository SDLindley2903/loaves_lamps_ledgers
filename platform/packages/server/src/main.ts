import { buildApp } from "./app.js";
import { createHttpServer } from "./build-server.js";

/**
 * Entrypoint (doc 13). Reads configuration from the environment and starts the server. Secrets and
 * connection strings come from the environment / secrets manager, never from committed config (doc 11).
 *
 *   PORT              listen port (default 8080)
 *   FT_ISSUER         token issuer (default https://id.faithtrail.local)
 *   FT_AUDIENCE       token audience (default ft-platform)
 *   DATABASE_URL        app Postgres URL (a NON-bypass role, e.g. ft_app); unset -> in-memory (dev)
 *   FT_ADMIN_DATABASE_URL  privileged URL for migrations + tenant provisioning (dev/ops only)
 *   FT_DEV_AUTH=1       enable the DEV-ONLY token endpoint (never in production)
 *   FT_MIGRATE=1        run pending DB migrations on startup (requires FT_ADMIN_DATABASE_URL)
 */
async function main(): Promise<void> {
  const port = Number(process.env["PORT"] ?? 8080);
  const app = await buildApp({
    issuer: process.env["FT_ISSUER"] ?? "https://id.faithtrail.local",
    audience: process.env["FT_AUDIENCE"] ?? "ft-platform",
    ...(process.env["DATABASE_URL"] ? { databaseUrl: process.env["DATABASE_URL"] } : {}),
    ...(process.env["FT_ADMIN_DATABASE_URL"]
      ? { adminDatabaseUrl: process.env["FT_ADMIN_DATABASE_URL"] }
      : {}),
    devAuth: process.env["FT_DEV_AUTH"] === "1",
    migrate: process.env["FT_MIGRATE"] === "1",
  });

  const server = createHttpServer(app.kernel);

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `FTS platform listening on :${port} ` +
        `(db=${process.env["DATABASE_URL"] ? "postgres" : "in-memory"}, devAuth=${app.devAuth})`,
    );
  });

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received; shutting down.`);
    server.close(() => {
      void app.close().then(() => process.exit(0));
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", error);
  process.exit(1);
});
