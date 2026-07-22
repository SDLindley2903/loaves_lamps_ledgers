/**
 * User & membership model (doc 05).
 *
 * WHY identity and membership are separate: a User is a GLOBAL identity (one person, one set of
 * credentials and MFA) while a Membership links that user to a tenant with roles. The same person can
 * be a nurse in one camp and a treasurer in a church without duplicate accounts. Credentials live once
 * on the user; authorization is per-membership (doc 05 §1).
 */
export type UserStatus = "active" | "suspended" | "deactivated";

export interface MfaEnrollment {
  /** Active TOTP shared secret (base32). Classified Secret (doc 07/11). */
  readonly totpSecret: string;
  /** Hashes of the one-time recovery codes; plaintext is shown to the user once at enrollment. */
  readonly recoveryHashes: readonly string[];
  readonly enrolledAt: string;
}

export interface User {
  readonly id: string;
  /** Normalized (lowercased, trimmed) email; the login identifier. */
  readonly email: string;
  readonly passwordHash: string;
  readonly status: UserStatus;
  /** Present once MFA is active. Absence means MFA is not enrolled. */
  readonly mfa?: MfaEnrollment;
  /** Set during enrollment, before the user has confirmed a first code. Not yet usable for login. */
  readonly pendingTotpSecret?: string;
  readonly createdAt: string;
}

export interface Membership {
  readonly userId: string;
  readonly tenantId: string;
  readonly roleNames: readonly string[];
}

/** Canonical email normalization used everywhere a user is looked up by email. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
