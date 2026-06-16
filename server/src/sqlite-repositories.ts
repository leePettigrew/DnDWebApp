import type { DatabaseSync } from "node:sqlite";
import type {
  CombatState,
  Entity,
  RollHistoryEntry,
} from "../../shared/domain";
import type { ChatMessage, ScopedCollection } from "../../shared/protocol";
import { SCOPED_TABLES } from "./db";
import type {
  CampaignRecord,
  CampaignRepository,
  ChatRepository,
  CombatRepository,
  EntityRepository,
  MembershipRecord,
  MembershipRepository,
  Repositories,
  RollLogRepository,
  UserRecord,
  UserRepository,
} from "./repositories";

type Row = Record<string, unknown>;
const str = (v: unknown): string => v as string;
const opt = (v: unknown): string | undefined =>
  v === null || v === undefined ? undefined : (v as string);

function createUserRepository(db: DatabaseSync): UserRepository {
  const insert = db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const byId = db.prepare(`SELECT * FROM users WHERE id = ?`);
  const byName = db.prepare(
    `SELECT * FROM users WHERE username = ? COLLATE NOCASE`,
  );
  const map = (r: Row | undefined): UserRecord | null =>
    r
      ? {
          id: str(r.id),
          username: str(r.username),
          displayName: str(r.display_name),
          passwordHash: str(r.password_hash),
          createdAt: str(r.created_at),
        }
      : null;
  return {
    create(u) {
      insert.run(u.id, u.username, u.displayName, u.passwordHash, u.createdAt);
    },
    findById(id) {
      return map(byId.get(id) as Row | undefined);
    },
    findByUsername(name) {
      return map(byName.get(name) as Row | undefined);
    },
  };
}

function createCampaignRepository(db: DatabaseSync): CampaignRepository {
  const insert = db.prepare(
    `INSERT INTO campaigns (id, name, setting, description, join_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const byId = db.prepare(`SELECT * FROM campaigns WHERE id = ?`);
  const byCode = db.prepare(
    `SELECT * FROM campaigns WHERE join_code = ? COLLATE NOCASE`,
  );
  const updateStmt = db.prepare(
    `UPDATE campaigns SET name = ?, setting = ?, description = ?, updated_at = ? WHERE id = ?`,
  );
  const map = (r: Row | undefined): CampaignRecord | null =>
    r
      ? {
          id: str(r.id),
          name: str(r.name),
          setting: opt(r.setting),
          description: opt(r.description),
          joinCode: str(r.join_code),
          createdAt: str(r.created_at),
          updatedAt: str(r.updated_at),
        }
      : null;
  return {
    create(c) {
      insert.run(
        c.id,
        c.name,
        c.setting ?? null,
        c.description ?? null,
        c.joinCode,
        c.createdAt,
        c.updatedAt,
      );
    },
    findById(id) {
      return map(byId.get(id) as Row | undefined);
    },
    findByJoinCode(code) {
      return map(byCode.get(code) as Row | undefined);
    },
    update(id, patch) {
      const existing = map(byId.get(id) as Row | undefined);
      if (!existing) return;
      const next = { ...existing, ...patch };
      updateStmt.run(
        next.name,
        next.setting ?? null,
        next.description ?? null,
        patch.updatedAt,
        id,
      );
    },
  };
}

function createMembershipRepository(db: DatabaseSync): MembershipRepository {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO memberships (user_id, campaign_id, role, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  const find = db.prepare(
    `SELECT * FROM memberships WHERE user_id = ? AND campaign_id = ?`,
  );
  const forUser = db.prepare(`SELECT * FROM memberships WHERE user_id = ?`);
  const forCampaign = db.prepare(
    `SELECT * FROM memberships WHERE campaign_id = ?`,
  );
  const map = (r: Row): MembershipRecord => ({
    userId: str(r.user_id),
    campaignId: str(r.campaign_id),
    role: str(r.role) as MembershipRecord["role"],
    createdAt: str(r.created_at),
  });
  return {
    create(m) {
      insert.run(m.userId, m.campaignId, m.role, m.createdAt);
    },
    find(userId, campaignId) {
      const r = find.get(userId, campaignId) as Row | undefined;
      return r ? map(r) : null;
    },
    listForUser(userId) {
      return (forUser.all(userId) as Row[]).map(map);
    },
    listForCampaign(campaignId) {
      return (forCampaign.all(campaignId) as Row[]).map(map);
    },
  };
}

function createEntityRepository(
  db: DatabaseSync,
  table: string,
): EntityRepository {
  const upsert = db.prepare(
    `INSERT INTO ${table} (id, campaign_id, owner_id, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       owner_id = excluded.owner_id,
       data = excluded.data,
       updated_at = excluded.updated_at`,
  );
  const listStmt = db.prepare(
    `SELECT data FROM ${table} WHERE campaign_id = ? ORDER BY created_at ASC`,
  );
  const getStmt = db.prepare(
    `SELECT data FROM ${table} WHERE campaign_id = ? AND id = ?`,
  );
  const delStmt = db.prepare(
    `DELETE FROM ${table} WHERE campaign_id = ? AND id = ?`,
  );
  return {
    list(campaignId) {
      return (listStmt.all(campaignId) as Row[]).map(
        (r) => JSON.parse(str(r.data)) as Entity,
      );
    },
    get(campaignId, id) {
      const r = getStmt.get(campaignId, id) as Row | undefined;
      return r ? (JSON.parse(str(r.data)) as Entity) : null;
    },
    upsert(campaignId, entity, ownerId) {
      upsert.run(
        entity.id,
        campaignId,
        ownerId ?? null,
        JSON.stringify(entity),
        entity.createdAt,
        entity.updatedAt,
      );
    },
    remove(campaignId, id) {
      delStmt.run(campaignId, id);
    },
  };
}

function createCombatRepository(db: DatabaseSync): CombatRepository {
  const getStmt = db.prepare(
    `SELECT data FROM combat_state WHERE campaign_id = ?`,
  );
  const setStmt = db.prepare(
    `INSERT INTO combat_state (campaign_id, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(campaign_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  );
  return {
    get(campaignId) {
      const r = getStmt.get(campaignId) as Row | undefined;
      return r ? (JSON.parse(str(r.data)) as CombatState) : null;
    },
    set(campaignId, state) {
      setStmt.run(campaignId, JSON.stringify(state), state.updatedAt);
    },
  };
}

function createRollLogRepository(db: DatabaseSync): RollLogRepository {
  const insert = db.prepare(
    `INSERT INTO roll_log (id, campaign_id, rolled_by_user_id, hidden, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const listAll = db.prepare(
    `SELECT data FROM roll_log WHERE campaign_id = ? ORDER BY created_at DESC LIMIT ?`,
  );
  const listVisible = db.prepare(
    `SELECT data FROM roll_log WHERE campaign_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT ?`,
  );
  return {
    append(campaignId, entry) {
      insert.run(
        entry.id,
        campaignId,
        entry.rolledByUserId ?? null,
        entry.hidden ? 1 : 0,
        JSON.stringify(entry),
        entry.createdAt,
      );
    },
    list(campaignId, opts) {
      const limit = opts.limit ?? 300;
      const stmt = opts.includeHidden ? listAll : listVisible;
      const rows = stmt.all(campaignId, limit) as Row[];
      return rows.map((r) => JSON.parse(str(r.data)) as RollHistoryEntry).reverse();
    },
  };
}

function createChatRepository(db: DatabaseSync): ChatRepository {
  const insert = db.prepare(
    `INSERT INTO chat_messages (id, campaign_id, user_id, data, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const listStmt = db.prepare(
    `SELECT data FROM chat_messages WHERE campaign_id = ? ORDER BY created_at DESC LIMIT ?`,
  );
  return {
    append(message) {
      insert.run(
        message.id,
        message.campaignId,
        message.userId,
        JSON.stringify(message),
        message.createdAt,
      );
    },
    list(campaignId, limit = 100) {
      const rows = listStmt.all(campaignId, limit) as Row[];
      return rows.map((r) => JSON.parse(str(r.data)) as ChatMessage).reverse();
    },
  };
}

export function createSqliteRepositories(db: DatabaseSync): Repositories {
  const entities = {} as Record<ScopedCollection, EntityRepository>;
  for (const [collection, table] of Object.entries(SCOPED_TABLES)) {
    entities[collection as ScopedCollection] = createEntityRepository(db, table);
  }
  return {
    users: createUserRepository(db),
    campaigns: createCampaignRepository(db),
    memberships: createMembershipRepository(db),
    entities,
    combat: createCombatRepository(db),
    rollLog: createRollLogRepository(db),
    chat: createChatRepository(db),
  };
}
