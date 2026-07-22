import { createHash } from "node:crypto";
import type { AuditEvent } from "./audit-event.js";

/**
 * Tamper-evidence via hash chaining (doc 06 §3).
 *
 * Each event stores hash = SHA-256(canonical(event content) ‖ prevHash). Altering or removing any
 * historical event breaks the hash of every subsequent event, so verification fails at a known point.
 * This converts "trust our admins/DBAs" into "verify the chain" — the property SOC 2 / HIPAA auditors
 * want and can test themselves.
 */

/** The genesis prevHash for the first event in a tenant's chain. */
export const GENESIS_HASH = "0".repeat(64);

/**
 * Deterministic canonical serialization of the parts of an event that are covered by the hash.
 *
 * WHY a fixed field order and explicit null handling: the hash must be reproducible byte-for-byte
 * during verification. Relying on JS object key order or `JSON.stringify` of an ad-hoc object would
 * make the hash fragile. We serialize an explicit ordered tuple instead.
 */
export function canonicalize(
  event: Pick<
    AuditEvent,
    | "id"
    | "occurredAt"
    | "sequence"
    | "tenantId"
    | "actor"
    | "action"
    | "resource"
    | "outcome"
    | "reason"
    | "requestId"
    | "ip"
    | "metadata"
  >,
): string {
  const tuple: unknown[] = [
    event.id,
    event.occurredAt,
    event.sequence,
    event.tenantId,
    event.actor.kind,
    event.actor.id,
    event.action,
    event.resource.type,
    event.resource.id ?? null,
    event.outcome,
    event.reason ?? null,
    event.requestId ?? null,
    event.ip ?? null,
    event.metadata === undefined ? null : stableStringify(event.metadata),
  ];
  return JSON.stringify(tuple);
}

export function computeHash(canonical: string, prevHash: string): string {
  return createHash("sha256").update(prevHash).update("\n").update(canonical).digest("hex");
}

/** Stable stringify with sorted keys, so metadata hashes are order-independent. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
