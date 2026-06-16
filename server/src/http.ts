import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError, loginUser, registerUser, statusFor } from "./auth";
import type { Repositories } from "./repositories";
import { config } from "./config";

function resolveOrigin(req: IncomingMessage): string {
  if (config.corsOrigin.trim() === "*") return "*";
  const allowed = config.corsOrigin
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) return origin;
  return allowed[0] ?? "*";
}

function setCors(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", resolveOrigin(req));
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage, limit = 1_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new AppError("bad_request", "Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new AppError("bad_request", "Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Handles the JSON auth endpoints. Returns true if it handled the request.
 * Everything realtime goes over the WebSocket instead.
 */
export async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  repos: Repositories,
): Promise<boolean> {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (req.method !== "POST") return false;
  if (req.url !== "/auth/register" && req.url !== "/auth/login") return false;

  try {
    const body = await readJson(req);
    const result =
      req.url === "/auth/register"
        ? await registerUser(repos, body)
        : await loginUser(repos, body);
    json(res, 200, result);
  } catch (err) {
    if (err instanceof AppError) {
      json(res, statusFor(err.code), { error: err.message });
    } else {
      console.error("[auth] unexpected error", err);
      json(res, 500, { error: "Server error." });
    }
  }
  return true;
}
