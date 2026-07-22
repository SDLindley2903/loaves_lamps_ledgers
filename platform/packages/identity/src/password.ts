import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { ValidationError } from "@ft/core";

/** Promise wrapper that preserves the options argument (Node's promisified scrypt type drops it). */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) => {
      if (err) {
        reject(err);
      } else {
        resolve(derived);
      }
    });
  });
}

/**
 * Password hashing (doc 02 §4).
 *
 * WHY an interface + a swappable implementation: the architecture names Argon2id as the production
 * target (memory-hard, GPU-resistant), with bcrypt as a fallback. Both require native modules. We
 * define a `PasswordHasher` interface and ship a **scrypt** implementation that uses only Node's
 * built-in crypto — scrypt is itself memory-hard and a legitimate KDF, so the platform has a correct,
 * dependency-free default now, and Argon2id can be dropped in behind the same interface without
 * touching any caller (Principle 3: don't hand-roll crypto; keep it swappable).
 *
 * WHY the stored format embeds parameters: it lets `needsRehash` detect credentials hashed under
 * weaker/older parameters and transparently upgrade them on the user's next successful login.
 */
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  /** Constant-time verification. Never throws on mismatch — returns false. */
  verify(plaintext: string, stored: string): Promise<boolean>;
  /** True if `stored` was produced with parameters weaker than the current policy. */
  needsRehash(stored: string): boolean;
}

interface ScryptParams {
  readonly n: number; // CPU/memory cost (power of two)
  readonly r: number; // block size
  readonly p: number; // parallelization
  readonly keylen: number;
}

const CURRENT: ScryptParams = { n: 16384, r: 8, p: 1, keylen: 32 };

export class ScryptPasswordHasher implements PasswordHasher {
  constructor(private readonly params: ScryptParams = CURRENT) {}

  async hash(plaintext: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = (await scrypt(plaintext.normalize("NFKC"), salt, this.params.keylen, {
      N: this.params.n,
      r: this.params.r,
      p: this.params.p,
      // scrypt needs a larger maxmem for higher N; size it to the parameters.
      maxmem: 256 * this.params.n * this.params.r,
    })) as Buffer;
    return `scrypt$${this.params.n}$${this.params.r}$${this.params.p}$${salt.toString(
      "base64",
    )}$${derived.toString("base64")}`;
  }

  async verify(plaintext: string, stored: string): Promise<boolean> {
    const parsed = parse(stored);
    if (!parsed) {
      return false;
    }
    const { params, salt, hash } = parsed;
    const derived = (await scrypt(plaintext.normalize("NFKC"), salt, hash.length, {
      N: params.n,
      r: params.r,
      p: params.p,
      maxmem: 256 * params.n * params.r,
    })) as Buffer;
    // Both buffers are the same length by construction; timingSafeEqual guards against timing attacks.
    return derived.length === hash.length && timingSafeEqual(derived, hash);
  }

  needsRehash(stored: string): boolean {
    const parsed = parse(stored);
    if (!parsed) {
      return true;
    }
    const p = parsed.params;
    return p.n < this.params.n || p.r < this.params.r || p.p < this.params.p;
  }
}

function parse(stored: string): { params: ScryptParams; salt: Buffer; hash: Buffer } | undefined {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return undefined;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return undefined;
  }
  const salt = Buffer.from(parts[4]!, "base64");
  const hash = Buffer.from(parts[5]!, "base64");
  return { params: { n, r, p, keylen: hash.length }, salt, hash };
}

/**
 * Password policy (doc 02 §4), aligned to NIST SP 800-63B.
 *
 * WHY NIST-aligned rather than "classic" complexity rules: forced periodic rotation and symbol
 * requirements are now understood to REDUCE real-world security (they push users to weak, incremented
 * passwords). We enforce a length floor, screen against known-bad values, and otherwise stay out of
 * the user's way. Screening against a breach corpus (doc 02 §4) is modeled by {@link BreachChecker}.
 */
export interface BreachChecker {
  isBreached(plaintext: string): Promise<boolean>;
}

/** Default no-op checker; production wires a k-anonymity range API (doc 02 §4). */
export class NoopBreachChecker implements BreachChecker {
  isBreached(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

export interface PasswordPolicyOptions {
  readonly minLength?: number;
  /** Values that must never be used (e.g. common passwords, tenant/app-specific words). */
  readonly denylist?: readonly string[];
}

export class PasswordPolicy {
  private readonly minLength: number;
  private readonly denylist: Set<string>;

  constructor(
    options: PasswordPolicyOptions = {},
    private readonly breachChecker: BreachChecker = new NoopBreachChecker(),
  ) {
    this.minLength = options.minLength ?? 12;
    this.denylist = new Set((options.denylist ?? DEFAULT_DENYLIST).map((v) => v.toLowerCase()));
  }

  /** Returns the list of violations (empty = acceptable). */
  async check(plaintext: string): Promise<string[]> {
    const violations: string[] = [];
    const pw = plaintext.normalize("NFKC");

    if (pw.length < this.minLength) {
      violations.push(`Password must be at least ${this.minLength} characters.`);
    }
    if (this.denylist.has(pw.toLowerCase())) {
      violations.push("Password is too common or easily guessed.");
    }
    if (/^(.)\1+$/.test(pw)) {
      violations.push("Password must not be a single repeated character.");
    }
    if (await this.breachChecker.isBreached(pw)) {
      violations.push("Password has appeared in a known data breach.");
    }
    return violations;
  }

  /** Fail-closed variant: throws ValidationError if the password is unacceptable. */
  async assert(plaintext: string): Promise<void> {
    const violations = await this.check(plaintext);
    if (violations.length > 0) {
      throw new ValidationError("Password does not meet the policy.", { violations });
    }
  }
}

const DEFAULT_DENYLIST = [
  "password",
  "password1",
  "12345678",
  "123456789",
  "qwertyuiop",
  "letmein12345",
  "iloveyou1234",
];
