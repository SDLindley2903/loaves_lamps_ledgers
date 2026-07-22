import { randomBytes } from "node:crypto";

/**
 * UUIDv7 generation (doc 07 §3).
 *
 * WHY UUIDv7: it is time-ordered in its most-significant bits, so it indexes well in Postgres
 * (avoids the index fragmentation of fully-random UUIDv4) while remaining non-sequential and
 * non-guessable. Non-guessable IDs matter because IDs appear in URLs and API payloads; a sequential
 * integer would leak record counts and enable cross-tenant enumeration attacks (doc 04, doc 08).
 *
 * Layout (RFC 9562): 48-bit big-endian Unix milliseconds, 4-bit version (0b0111), 12 bits of
 * randomness, 2-bit variant (0b10), 62 bits of randomness.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);

  // 48-bit timestamp (milliseconds) in the first 6 bytes.
  const ts = BigInt(now);
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  // Version 7 in the high nibble of byte 6; keep the low nibble random.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // Variant 0b10 in the two high bits of byte 8; keep the rest random.
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
