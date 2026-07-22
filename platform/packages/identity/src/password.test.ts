import { describe, expect, it } from "vitest";
import { ValidationError } from "@ft/core";
import {
  NoopBreachChecker,
  PasswordPolicy,
  ScryptPasswordHasher,
  consumeRecoveryCode,
  generateRecoveryCodes,
  type BreachChecker,
} from "./index.js";

// Small scrypt parameters keep the test suite fast; production uses the defaults.
const fastHasher = new ScryptPasswordHasher({ n: 1024, r: 8, p: 1, keylen: 32 });

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const stored = await fastHasher.hash("correct horse battery staple");
    expect(await fastHasher.verify("correct horse battery staple", stored)).toBe(true);
    expect(await fastHasher.verify("wrong password entirely", stored)).toBe(false);
  });

  it("produces a different hash each time (salted)", async () => {
    const a = await fastHasher.hash("same-password-1234");
    const b = await fastHasher.hash("same-password-1234");
    expect(a).not.toEqual(b);
  });

  it("returns false (never throws) on a malformed stored hash", async () => {
    expect(await fastHasher.verify("whatever", "not-a-valid-hash")).toBe(false);
  });

  it("flags credentials hashed under weaker parameters for rehash", async () => {
    const weak = await new ScryptPasswordHasher({ n: 512, r: 8, p: 1, keylen: 32 }).hash(
      "pw12345678",
    );
    expect(new ScryptPasswordHasher({ n: 1024, r: 8, p: 1, keylen: 32 }).needsRehash(weak)).toBe(
      true,
    );
  });
});

describe("password policy (NIST-aligned)", () => {
  it("rejects short and common passwords", async () => {
    const policy = new PasswordPolicy();
    expect(await policy.check("short")).not.toHaveLength(0);
    expect(await policy.check("password")).not.toHaveLength(0);
    expect(await policy.check("aaaaaaaaaaaaaa")).not.toHaveLength(0); // repeated char
  });

  it("accepts a long, non-trivial password", async () => {
    const policy = new PasswordPolicy();
    expect(await policy.check("a fairly long unique passphrase")).toHaveLength(0);
  });

  it("screens against a breach checker and fails closed via assert", async () => {
    const breached: BreachChecker = { isBreached: async () => true };
    const policy = new PasswordPolicy({}, breached);
    await expect(policy.assert("a fairly long unique passphrase")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("uses NoopBreachChecker by default (no external dependency in tests)", async () => {
    const policy = new PasswordPolicy({}, new NoopBreachChecker());
    expect(await policy.check("another perfectly fine passphrase")).toHaveLength(0);
  });
});

describe("recovery codes", () => {
  it("issues codes, verifies one, consumes it (single-use), and rejects unknown codes", async () => {
    const { plaintext, hashes } = await generateRecoveryCodes(fastHasher, 5);
    expect(plaintext).toHaveLength(5);
    expect(hashes).toHaveLength(5);

    const used = plaintext[0]!;
    const remaining = await consumeRecoveryCode(used, hashes, fastHasher);
    expect(remaining).not.toBeNull();
    expect(remaining!).toHaveLength(4);

    // The consumed code no longer matches the remaining set.
    expect(await consumeRecoveryCode(used, remaining!, fastHasher)).toBeNull();
    // An unknown code never matches.
    expect(await consumeRecoveryCode("zzzz-zzzz", hashes, fastHasher)).toBeNull();
  });
});
