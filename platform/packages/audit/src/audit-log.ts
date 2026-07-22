import { uuidv7 } from "@ft/core";
import type { AuditEvent, AuditInput } from "./audit-event.js";
import { GENESIS_HASH, canonicalize, computeHash } from "./hash-chain.js";

/**
 * The append-only audit log interface (doc 06).
 *
 * WHY append-only with no update/delete in the type: the log exposes only `append`, `list`, and
 * `verify`. There is deliberately NO mutation method. In production this is backed by a Postgres table
 * whose DB role has INSERT/SELECT only (no UPDATE/DELETE grant) plus an externalized WORM copy (S3
 * Object Lock) — see docs 06 §2 and packages/audit/sql. This in-memory implementation encodes the same
 * contract and is what the invariant tests run against.
 */
export interface AuditLog {
  append(input: AuditInput): Promise<AuditEvent>;
  /** Events for a tenant in chain order. Tenant-scoped, mirroring RLS in the DB implementation (doc 04). */
  list(tenantId: string): Promise<readonly AuditEvent[]>;
  /** Verify the tamper-evidence chain for a tenant. */
  verify(tenantId: string): Promise<VerificationResult>;
}

export type VerificationResult =
  | { readonly ok: true; readonly count: number }
  | { readonly ok: false; readonly brokenAtSequence: number; readonly reason: string };

/**
 * In-memory reference implementation of the append-only, hash-chained audit log.
 *
 * It is intentionally faithful to the production contract so the invariant tests (tamper detection,
 * per-tenant chains) exercise real behavior, not a mock.
 */
export class InMemoryAuditLog implements AuditLog {
  /** tenantId -> ordered events. Separate chains per tenant (doc 06 §3). */
  private readonly chains = new Map<string, AuditEvent[]>();

  append(input: AuditInput): Promise<AuditEvent> {
    const chain = this.chains.get(input.tenantId) ?? [];
    const prev = chain[chain.length - 1];
    const prevHash = prev?.hash ?? GENESIS_HASH;
    const sequence = chain.length;

    const base = {
      ...input,
      id: uuidv7(),
      occurredAt: Date.now(),
      sequence,
      prevHash,
    };
    const hash = computeHash(canonicalize({ ...base, hash: "" } as AuditEvent), prevHash);
    const event: AuditEvent = { ...base, hash };

    chain.push(event);
    this.chains.set(input.tenantId, chain);
    return Promise.resolve(event);
  }

  list(tenantId: string): Promise<readonly AuditEvent[]> {
    return Promise.resolve([...(this.chains.get(tenantId) ?? [])]);
  }

  verify(tenantId: string): Promise<VerificationResult> {
    const chain = this.chains.get(tenantId) ?? [];
    let prevHash = GENESIS_HASH;
    for (let i = 0; i < chain.length; i++) {
      const event = chain[i]!;
      if (event.sequence !== i) {
        return Promise.resolve({
          ok: false,
          brokenAtSequence: i,
          reason: "sequence gap or reorder detected",
        });
      }
      if (event.prevHash !== prevHash) {
        return Promise.resolve({
          ok: false,
          brokenAtSequence: event.sequence,
          reason: "prevHash does not match the prior event",
        });
      }
      const expected = computeHash(canonicalize(event), prevHash);
      if (expected !== event.hash) {
        return Promise.resolve({
          ok: false,
          brokenAtSequence: event.sequence,
          reason: "event content has been altered (hash mismatch)",
        });
      }
      prevHash = event.hash;
    }
    return Promise.resolve({ ok: true, count: chain.length });
  }
}
