/**
 * Data classification tiers (doc 07 §4, doc 15 §2).
 *
 * WHY a single classification enum: classification is the one declaration that drives many downstream
 * controls consistently — encryption strength and location (doc 11), audit depth incl. read-logging
 * (doc 06), export/deletion behavior (doc 05), and compliance scoping (doc 15). Centralizing it means
 * each subsystem does not re-decide how sensitive a field is; it reads the classification and behaves
 * accordingly.
 */
export enum DataClassification {
  /** Freely shareable (e.g. public marketing content). No special controls. */
  Public = "public",
  /** Internal, access-controlled, not sensitive per se (e.g. aggregate metrics). */
  Internal = "internal",
  /** Personal data / giving amounts. Encrypted at rest, access-logged. */
  Confidential = "confidential",
  /** PHI and equivalent (CampMedMgr health data). Field-level encryption, reads audited, silo-eligible. */
  Restricted = "restricted",
  /** Credentials, keys, tokens. Secrets manager only; never stored in the application database. */
  Secret = "secret",
}

/** Ordering for "at least this sensitive" comparisons. Higher = more sensitive. */
const RANK: Record<DataClassification, number> = {
  [DataClassification.Public]: 0,
  [DataClassification.Internal]: 1,
  [DataClassification.Confidential]: 2,
  [DataClassification.Restricted]: 3,
  [DataClassification.Secret]: 4,
};

export function isAtLeastAsSensitiveAs(
  value: DataClassification,
  threshold: DataClassification,
): boolean {
  return RANK[value] >= RANK[threshold];
}

/** Whether reads of this classification must be recorded as audit events (doc 06). */
export function requiresReadAudit(value: DataClassification): boolean {
  return isAtLeastAsSensitiveAs(value, DataClassification.Restricted);
}

/** Whether this classification must be encrypted at the application layer before hitting the DB (doc 11). */
export function requiresFieldEncryption(value: DataClassification): boolean {
  return isAtLeastAsSensitiveAs(value, DataClassification.Restricted);
}
