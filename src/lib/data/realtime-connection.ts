import type { ClientMessage, ServerMessage } from "@shared/protocol";

/**
 * Raw WebSocket lifecycle manager for the realtime provider.
 *
 * Owns nothing about app data — it just keeps a socket alive, reconnects with
 * exponential backoff, heartbeats, and fans out parsed ServerMessages + status.
 *
 *  - "connecting"   first attempt, never connected yet
 *  - "connected"    socket open
 *  - "reconnecting" was connected, dropped, retrying
 *  - "offline"      could not reach the server (keeps retrying in the background)
 */
export type SocketStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

const HEARTBEAT_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

export class SocketConnection {
  private ws: WebSocket | null = null;
  private shouldRun = false;
  private everConnected = false;
  private retries = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: SocketStatus = "offline";

  private statusListeners = new Set<(s: SocketStatus) => void>();
  private messageListeners = new Set<(m: ServerMessage) => void>();
  private openListeners = new Set<() => void>();

  constructor(private readonly url: string) {}

  get status(): SocketStatus {
    return this._status;
  }

  onStatus(cb: (s: SocketStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this._status);
    return () => this.statusListeners.delete(cb);
  }
  onMessage(cb: (m: ServerMessage) => void): () => void {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }
  /** Fired every time the socket (re)opens — use it to (re)send auth + rejoin. */
  onOpen(cb: () => void): () => void {
    this.openListeners.add(cb);
    return () => this.openListeners.delete(cb);
  }

  connect(): void {
    this.shouldRun = true;
    this.open();
  }

  close(): void {
    this.shouldRun = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.setStatus("offline");
  }

  reconnectNow(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.retries = 0;
    this.open();
  }

  send(message: ClientMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private setStatus(s: SocketStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  private open(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.setStatus(
      this.everConnected ? "reconnecting" : this.retries > 0 ? "offline" : "connecting",
    );

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.everConnected = true;
      this.retries = 0;
      this.setStatus("connected");
      this.startHeartbeat();
      this.openListeners.forEach((l) => l());
    };
    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return; // ignore malformed frames
      }
      this.messageListeners.forEach((l) => l(msg));
    };
    ws.onclose = () => {
      this.stopHeartbeat();
      this.ws = null;
      if (this.shouldRun) this.scheduleReconnect();
      else this.setStatus("offline");
    };
    ws.onerror = () => {
      // onclose will follow and drive the reconnect.
    };
  }

  private scheduleReconnect(): void {
    this.retries += 1;
    this.setStatus(this.everConnected ? "reconnecting" : "offline");
    const delay = Math.min(
      MAX_BACKOFF_MS,
      500 * 2 ** Math.min(this.retries, 6),
    );
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldRun) this.open();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      this.send({ type: "ping" });
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}
