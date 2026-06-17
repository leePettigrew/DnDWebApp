import fs from "node:fs";
import path from "node:path";

/**
 * Minimal, dependency-free `.env` loader (so `tsx src/index.ts` works without a
 * flag). Values already in the environment (e.g. from docker-compose) win.
 */
function loadDotEnv(): void {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

export const config = {
  port: Number(process.env.PORT ?? 8787),
  authSecret: process.env.AUTH_SECRET ?? "",
  dbPath: process.env.DB_PATH ?? "./data/dragons-ledger.sqlite",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  /**
   * Username of the server owner / superadmin (case-insensitive). When that
   * account logs in it gets the admin panel. Empty = no admin. Set
   * ADMIN_USERNAME in the server env; the account still has to register first.
   */
  adminUsername: process.env.ADMIN_USERNAME ?? "",
  /** Token lifetime — long, since this is a private group. */
  tokenTtlSeconds: 60 * 60 * 24 * 30,
};

if (!config.authSecret) {
  config.authSecret = "dev-insecure-secret-change-me";
  console.warn(
    "[config] AUTH_SECRET is not set — using an INSECURE development secret. " +
      "Set AUTH_SECRET to a long random string before exposing this server.",
  );
}
