import http from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { openDatabase } from "./db";
import { createSqliteRepositories } from "./sqlite-repositories";

const db = openDatabase(config.dbPath);
const repos = createSqliteRepositories(db);
console.log(`SQLite ready at ${config.dbPath}`);

/**
 * Entry point: one Node HTTP server hosts BOTH the JSON auth endpoints
 * (/auth/register, /auth/login) and the WebSocket upgrade, so a reverse proxy /
 * tunnel only needs to forward a single port. TLS is terminated upstream (wss).
 *
 * (DB, auth, and realtime handlers are wired up in the following commits.)
 */
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "dragons-ledger-server" }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({ server });
wss.on("connection", (socket) => {
  socket.on("error", () => {});
  // Realtime message handling is added in a later commit.
});

server.listen(config.port, () => {
  console.log(`Dragon's Ledger server listening on :${config.port}`);
});
