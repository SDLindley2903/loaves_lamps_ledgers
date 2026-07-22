import { randomBytes } from "node:crypto";
import type { PasswordHasher } from "./password.js";

/**
 * MFA recovery codes (doc 02 §5).
 *
 * WHY recovery codes matter: account recovery is where MFA is bypassed in the real world. Every MFA
 * enrollment issues a set of one-time codes, shown once and stored ONLY as hashes. A user who loses
 * their authenticator uses a code instead of being locked out — without us weakening the login path.
 *
 * WHY codes are hashed with the same PasswordHasher: a stolen database must not yield usable recovery
 * codes. They are single-use: verifying a code consumes it so it cannot be replayed.
 */
export interface RecoveryCodeSet {
  /** The plaintext codes to display to the user ONCE at enrollment. Never stored. */
  readonly plaintext: readonly string[];
  /** The hashes to persist. */
  readonly hashes: readonly string[];
}

export async function generateRecoveryCodes(
  hasher: PasswordHasher,
  count = 10,
): Promise<RecoveryCodeSet> {
  const plaintext: string[] = [];
  for (let i = 0; i < count; i++) {
    plaintext.push(formatCode(randomBytes(5)));
  }
  const hashes = await Promise.all(plaintext.map((code) => hasher.hash(normalize(code))));
  return { plaintext, hashes };
}

/**
 * Consume a submitted recovery code against the stored hashes.
 *
 * Returns the remaining hashes (with the matched one removed) on success, or `null` if no code
 * matched. The caller persists the returned remaining set so the used code cannot be replayed.
 */
export async function consumeRecoveryCode(
  submitted: string,
  storedHashes: readonly string[],
  hasher: PasswordHasher,
): Promise<readonly string[] | null> {
  const normalized = normalize(submitted);
  for (let i = 0; i < storedHashes.length; i++) {
    if (await hasher.verify(normalized, storedHashes[i]!)) {
      return [...storedHashes.slice(0, i), ...storedHashes.slice(i + 1)];
    }
  }
  return null;
}

/** Format as groups for readability, e.g. "abcd-efgh-ij". */
function formatCode(buf: Buffer): string {
  const raw = base32Lower(buf);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

function normalize(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const LOWER = "abcdefghijklmnopqrstuvwxyz234567";
function base32Lower(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += LOWER[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += LOWER[(value << (5 - bits)) & 31];
  }
  return out;
}
