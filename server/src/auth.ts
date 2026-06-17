import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { newId, nowISO } from "../../shared/ids";
import type { AuthResponse, ErrorCode, UserDTO } from "../../shared/protocol";
import type { Repositories, UserRecord } from "./repositories";
import { config } from "./config";

/** A typed error carrying the protocol error code (mapped to HTTP/WS status). */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};
export function statusFor(code: ErrorCode): number {
  return STATUS[code];
}

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username is too long")
    .regex(/^[A-Za-z0-9_.-]+$/, "Use letters, numbers, and _ . - only"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(200, "Password is too long"),
  displayName: z.string().trim().min(1).max(40).optional(),
});

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

/** The server owner, identified by the ADMIN_USERNAME env (case-insensitive). */
export function isAdminUser(u: Pick<UserRecord, "username">): boolean {
  const admin = config.adminUsername.trim().toLowerCase();
  return admin !== "" && u.username.trim().toLowerCase() === admin;
}

function toDTO(u: UserRecord): UserDTO {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    isAdmin: isAdminUser(u),
  };
}

/** Verify a Bearer token and return the user only if they are the admin. */
export function requireAdmin(
  repos: Repositories,
  authHeader: string | undefined,
): UserRecord | null {
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) return null;
  const verified = verifyToken(token);
  if (!verified) return null;
  const user = repos.users.findById(verified.userId);
  if (!user || !isAdminUser(user)) return null;
  return user;
}

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input.";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.authSecret, {
    expiresIn: config.tokenTtlSeconds,
  });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, config.authSecret);
    if (
      typeof payload === "object" &&
      payload !== null &&
      typeof payload.sub === "string"
    ) {
      return { userId: payload.sub };
    }
    return null;
  } catch {
    return null;
  }
}

export async function registerUser(
  repos: Repositories,
  body: unknown,
): Promise<AuthResponse> {
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) throw new AppError("bad_request", firstIssue(parsed.error));
  const { username, password, displayName } = parsed.data;

  if (repos.users.findByUsername(username)) {
    throw new AppError("conflict", "That username is already taken.");
  }
  const user: UserRecord = {
    id: newId(),
    username,
    displayName: displayName || username,
    passwordHash: await hashPassword(password),
    createdAt: nowISO(),
  };
  repos.users.create(user);
  return { token: signToken(user.id), user: toDTO(user) };
}

export async function loginUser(
  repos: Repositories,
  body: unknown,
): Promise<AuthResponse> {
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) throw new AppError("bad_request", firstIssue(parsed.error));
  const { username, password } = parsed.data;

  const user = repos.users.findByUsername(username);
  // Same error whether the user is missing or the password is wrong.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError("unauthorized", "Invalid username or password.");
  }
  return { token: signToken(user.id), user: toDTO(user) };
}
