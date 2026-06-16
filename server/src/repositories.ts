import type { CombatState, Entity, RollHistoryEntry } from "../../shared/domain";
import type {
  ChatMessage,
  Role,
  ScopedCollection,
} from "../../shared/protocol";

/**
 * The persistence abstraction. App logic (rooms, handlers) depends ONLY on
 * these interfaces — never on SQLite directly — so the storage engine can be
 * swapped for Postgres later by providing a different `Repositories` factory.
 */

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
}

export interface CampaignRecord {
  id: string;
  name: string;
  setting?: string;
  description?: string;
  joinCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipRecord {
  userId: string;
  campaignId: string;
  role: Role;
  createdAt: string;
}

export interface UserRepository {
  create(user: UserRecord): void;
  findById(id: string): UserRecord | null;
  findByUsername(username: string): UserRecord | null;
}

export interface CampaignRepository {
  create(campaign: CampaignRecord): void;
  findById(id: string): CampaignRecord | null;
  findByJoinCode(code: string): CampaignRecord | null;
  update(
    id: string,
    patch: Partial<Pick<CampaignRecord, "name" | "setting" | "description">> & {
      updatedAt: string;
    },
  ): void;
}

export interface MembershipRepository {
  create(membership: MembershipRecord): void;
  find(userId: string, campaignId: string): MembershipRecord | null;
  listForUser(userId: string): MembershipRecord[];
  listForCampaign(campaignId: string): MembershipRecord[];
}

/** One per scoped collection (characters, statBlocks, …). Stores full entities. */
export interface EntityRepository {
  list(campaignId: string): Entity[];
  get(campaignId: string, id: string): Entity | null;
  upsert(campaignId: string, entity: Entity, ownerId?: string | null): void;
  remove(campaignId: string, id: string): void;
}

export interface CombatRepository {
  get(campaignId: string): CombatState | null;
  set(campaignId: string, state: CombatState): void;
}

export interface RollLogRepository {
  append(campaignId: string, entry: RollHistoryEntry): void;
  /** Most recent rolls (chronological). `includeHidden` gates DM-only rolls. */
  list(
    campaignId: string,
    opts: { includeHidden: boolean; limit?: number },
  ): RollHistoryEntry[];
}

export interface ChatRepository {
  append(message: ChatMessage): void;
  /** Most recent messages, chronological. */
  list(campaignId: string, limit?: number): ChatMessage[];
}

export interface Repositories {
  users: UserRepository;
  campaigns: CampaignRepository;
  memberships: MembershipRepository;
  entities: Record<ScopedCollection, EntityRepository>;
  combat: CombatRepository;
  rollLog: RollLogRepository;
  chat: ChatRepository;
}
