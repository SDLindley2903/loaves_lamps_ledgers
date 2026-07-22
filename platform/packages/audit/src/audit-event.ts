/**
 * Audit event model (doc 06).
 *
 * WHY audit is separate from operational logging (doc 12): operational logs are lossy, sampled, and
 * short-lived debugging aids; audit is a COMPLETE, tamper-evident compliance record of who did what to
 * whose data, retained for years. Conflating them is a common, costly mistake, so they are different
 * systems with different guarantees.
 *
 * WHY sensitive values are referenced, not inlined: an audit log full of raw PHI/PII would be a second
 * breach target and would complicate data-subject deletion. The event proves THAT a camper's record was
 * accessed and by whom, without duplicating the sensitive contents into a second store (doc 06 §4).
 */
export type AuditOutcome = "success" | "denied" | "error";

/** Data supplied by a caller when recording an action. `id`, `occurredAt`, and the hashes are set by the log. */
export interface AuditInput {
  readonly tenantId: string;
  readonly actor: { readonly kind: "user" | "service"; readonly id: string };
  /** e.g. "campmed.medication.administer", "auth.mfa.challenge.failed". */
  readonly action: string;
  readonly resource: { readonly type: string; readonly id?: string };
  readonly outcome: AuditOutcome;
  /** Required for denials and break-glass; explains the decision (doc 03/06). */
  readonly reason?: string;
  /** Correlates to the operational trace / API error response (doc 12). */
  readonly requestId?: string;
  readonly ip?: string;
  /**
   * Non-sensitive structured context ONLY. Sensitive field changes are referenced (e.g. which fields
   * changed), never the raw before/after PHI values (doc 06 §4).
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A sealed, immutable audit record as stored. */
export interface AuditEvent extends AuditInput {
  readonly id: string;
  /** Server clock, UTC epoch milliseconds. */
  readonly occurredAt: number;
  /** Monotonic per-tenant position in the hash chain. */
  readonly sequence: number;
  /** Hash of the previous event in this tenant's chain (or the genesis constant for the first). */
  readonly prevHash: string;
  /** Hash of this event's canonical content chained to prevHash (doc 06 §3). */
  readonly hash: string;
}
