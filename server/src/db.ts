import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * Opens (creating if needed) the SQLite database and applies the schema.
 * Uses Node's built-in `node:sqlite` — no native module to compile, which keeps
 * self-hosting and the Docker image trivial.
 */

/** The seven scoped collections each get an identically-shaped table. */
export const SCOPED_TABLES: Record<string, string> = {
  characters: "characters",
  statBlocks: "stat_blocks",
  encounters: "encounters",
  notes: "notes",
  sessionLogs: "session_logs",
  maps: "maps",
  rollPresets: "roll_presets",
};

export function openDatabase(dbPath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  applySchema(db);
  return db;
}

function applySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name  TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      setting     TEXT,
      description TEXT,
      join_code   TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memberships (
      user_id     TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      role        TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      PRIMARY KEY (user_id, campaign_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_campaign ON memberships(campaign_id);

    CREATE TABLE IF NOT EXISTS combat_state (
      campaign_id TEXT PRIMARY KEY,
      data        TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roll_log (
      id                TEXT PRIMARY KEY,
      campaign_id       TEXT NOT NULL,
      rolled_by_user_id TEXT,
      hidden            INTEGER NOT NULL DEFAULT 0,
      data              TEXT NOT NULL,
      created_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_roll_log_campaign ON roll_log(campaign_id);
  `);

  for (const table of Object.values(SCOPED_TABLES)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        owner_id    TEXT,
        data        TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_${table}_campaign ON ${table}(campaign_id);
    `);
  }
}
