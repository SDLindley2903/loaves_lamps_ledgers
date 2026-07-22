import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP — time-based one-time passwords (RFC 6238), the MFA baseline (doc 02 §5).
 *
 * WHY TOTP is the pragmatic baseline factor: it works OFFLINE (critical for CampMedMgr at camps with
 * poor connectivity), has no telecom dependency or per-message cost, and is widely understood. Passkeys
 * / WebAuthn are the strategic default we push users toward (phishing-resistant) and are added at the
 * transport/API layer; TOTP is implemented here because it is self-contained and provable in tests.
 *
 * Implemented with Node's built-in HMAC only — no third-party OTP library (Principle 3).
 */
export interface TotpOptions {
  readonly digits?: number; // default 6
  readonly period?: number; // seconds, default 30
  readonly window?: number; // ± steps tolerated on verify, default 1
}

const DEFAULTS: Required<TotpOptions> = { digits: 6, period: 30, window: 1 };

/** Generate a new base32 shared secret (default 160 bits, per RFC 4226 recommendation). */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** The TOTP code for a given secret at time `atMs` (defaults to now). */
export function totp(
  secretBase32: string,
  options: TotpOptions = {},
  atMs: number = Date.now(),
): string {
  const { digits, period } = { ...DEFAULTS, ...options };
  const counter = Math.floor(atMs / 1000 / period);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * Verify a submitted code within ± window steps, constant-time.
 *
 * WHY a small window: it tolerates clock skew and a user typing a code as it rolls over, without
 * meaningfully widening the guess space. WHY constant-time compare: avoids leaking correctness via
 * response timing.
 */
export function verifyTotp(
  secretBase32: string,
  submitted: string,
  options: TotpOptions = {},
  atMs: number = Date.now(),
): boolean {
  const { digits, period, window } = { ...DEFAULTS, ...options };
  const key = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / period);
  const expectedLen = digits;
  if (submitted.length !== expectedLen) {
    return false;
  }
  for (let offset = -window; offset <= window; offset++) {
    const candidate = hotp(key, counter + offset, digits);
    const a = Buffer.from(candidate);
    const b = Buffer.from(submitted);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

/** otpauth:// provisioning URI for QR enrollment in an authenticator app. */
export function totpProvisioningUri(
  secretBase32: string,
  params: { issuer: string; account: string; digits?: number; period?: number },
): string {
  const digits = params.digits ?? DEFAULTS.digits;
  const period = params.period ?? DEFAULTS.period;
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: secretBase32,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(digits),
    period: String(period),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** HOTP (RFC 4226): HMAC-SHA1 + dynamic truncation. */
function hotp(key: Buffer, counter: number, digits: number): string {
  const counterBuf = Buffer.alloc(8);
  // 64-bit big-endian counter.
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(counterBuf).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

// --- RFC 4648 base32 (no padding on encode output for otpauth compatibility) ---
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error("Invalid base32 character in TOTP secret.");
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
