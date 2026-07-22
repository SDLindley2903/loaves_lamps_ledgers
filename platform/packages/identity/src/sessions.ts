import { createHash, randomBytes } from "node:crypto";
import { UnauthorizedError, uuidv7 } from "@ft/core";

/**
 * Server-side sessions with rotating refresh tokens (doc 02 §3).
 *
 * WHY server-side sessions alongside stateless access tokens: access tokens are fast but cannot be
 * revoked before they expire. A server-side session record is the hard revocation mechanism —
 * logout-everywhere, admin force-logout, and revoke-on-role-change all work by invalidating the
 * session. Short access-token TTL (tokens.ts) bounds the window in which a revoked-but-unexpired token
 * still works.
 *
 * WHY refresh tokens are opaque, hashed-at-rest, rotated on every use, with reuse detection: a leaked
 * refresh token is the highest-value credential. Rotation means each refresh token works once;
 * presenting an already-rotated token indicates theft, so we revoke the ENTIRE session family. This
 * turns token theft from a silent compromise into a detectable, self-revoking event.
 */
export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly mfaSatisfied: boolean;
  readonly createdAt: number;
  readonly lastUsedAt: number;
  readonly revoked: boolean;
}

export interface IssuedSession {
  readonly session: Session;
  /** Opaque refresh token — returned to the client ONCE, never stored in plaintext. */
  readonly refreshToken: string;
}

export interface CreateSessionInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly mfaSatisfied: boolean;
}

interface SessionRecord extends Session {
  currentRefreshHash: string;
  /** Hashes of refresh tokens already rotated out — presenting one of these signals theft. */
  readonly usedRefreshHashes: Set<string>;
}

export interface SessionStore {
  create(input: CreateSessionInput): IssuedSession;
  /** Rotate the refresh token; returns a new session view + new refresh token, or throws on invalid/reuse. */
  rotate(refreshToken: string): IssuedSession;
  get(sessionId: string): Session | undefined;
  isActive(sessionId: string): boolean;
  revoke(sessionId: string): void;
  /** Revoke every session for a user — "sign out everywhere" / on-compromise (doc 02/05). */
  revokeAllForUser(userId: string): number;
}

export class InMemorySessionStore implements SessionStore {
  private readonly byId = new Map<string, SessionRecord>();
  /** refreshHash -> sessionId, for O(1) lookup on rotate. */
  private readonly refreshIndex = new Map<string, string>();

  create(input: CreateSessionInput): IssuedSession {
    const now = Date.now();
    const id = uuidv7();
    const refreshToken = mintRefreshToken();
    const currentRefreshHash = hashToken(refreshToken);

    const record: SessionRecord = {
      id,
      userId: input.userId,
      tenantId: input.tenantId,
      mfaSatisfied: input.mfaSatisfied,
      createdAt: now,
      lastUsedAt: now,
      revoked: false,
      currentRefreshHash,
      usedRefreshHashes: new Set(),
    };
    this.byId.set(id, record);
    this.refreshIndex.set(currentRefreshHash, id);
    return { session: view(record), refreshToken };
  }

  rotate(refreshToken: string): IssuedSession {
    const presentedHash = hashToken(refreshToken);
    const sessionId = this.refreshIndex.get(presentedHash);
    const record = sessionId ? this.byId.get(sessionId) : this.findByUsedHash(presentedHash);

    if (!record) {
      // Unknown token — never valid.
      throw new UnauthorizedError("Invalid refresh token.");
    }

    // Reuse detection: the presented token was already rotated out. Treat as theft and revoke family.
    if (
      record.usedRefreshHashes.has(presentedHash) ||
      record.currentRefreshHash !== presentedHash
    ) {
      this.revoke(record.id);
      throw new UnauthorizedError("Refresh token reuse detected; session revoked.");
    }

    if (record.revoked) {
      throw new UnauthorizedError("Session is revoked.");
    }

    // Rotate: retire the old hash, issue a new one.
    record.usedRefreshHashes.add(record.currentRefreshHash);
    this.refreshIndex.delete(record.currentRefreshHash);
    const nextToken = mintRefreshToken();
    const nextHash = hashToken(nextToken);
    record.currentRefreshHash = nextHash;
    (record as { lastUsedAt: number }).lastUsedAt = Date.now();
    this.refreshIndex.set(nextHash, record.id);

    return { session: view(record), refreshToken: nextToken };
  }

  get(sessionId: string): Session | undefined {
    const record = this.byId.get(sessionId);
    return record ? view(record) : undefined;
  }

  isActive(sessionId: string): boolean {
    const record = this.byId.get(sessionId);
    return record !== undefined && !record.revoked;
  }

  revoke(sessionId: string): void {
    const record = this.byId.get(sessionId);
    if (!record) {
      return;
    }
    (record as { revoked: boolean }).revoked = true;
    this.refreshIndex.delete(record.currentRefreshHash);
  }

  revokeAllForUser(userId: string): number {
    let count = 0;
    for (const record of this.byId.values()) {
      if (record.userId === userId && !record.revoked) {
        this.revoke(record.id);
        count++;
      }
    }
    return count;
  }

  private findByUsedHash(hash: string): SessionRecord | undefined {
    for (const record of this.byId.values()) {
      if (record.usedRefreshHashes.has(hash)) {
        return record;
      }
    }
    return undefined;
  }
}

/** Opaque, high-entropy refresh token. Never a JWT — it carries no claims, only identity. */
function mintRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Refresh tokens are stored only as SHA-256 hashes (they are single-use, high-entropy secrets). */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function view(record: SessionRecord): Session {
  return {
    id: record.id,
    userId: record.userId,
    tenantId: record.tenantId,
    mfaSatisfied: record.mfaSatisfied,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    revoked: record.revoked,
  };
}
