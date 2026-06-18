import http from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { openDatabase } from "./db";
import { createSqliteRepositories } from "./sqlite-repositories";
import { handleHttpRequest } from "./http";
import { RoomManager } from "./rooms";
import { handleConnection } from "./handlers";

const db = openDatabase(config.dbPath);
const repos = createSqliteRepositories(db);
const rooms = new RoomManager(repos);
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
  void handleHttpRequest(req, res, repos, rooms)
    .then((handled) => {
      if (!handled) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
      }
    })
    .catch(() => {
      try {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Server error." }));
      } catch {
        /* response already sent */
      }
    });
});

const wss = new WebSocketServer({ server });
wss.on("connection", (socket) => handleConnection(socket, repos, rooms));

server.listen(config.port, () => {
  console.log(`Dragon's Ledger server listening on :${config.port}`);
});
