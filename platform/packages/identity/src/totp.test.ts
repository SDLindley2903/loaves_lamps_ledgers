import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  totp,
  totpProvisioningUri,
  verifyTotp,
} from "./index.js";

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    const buf = Buffer.from("The Three Jars", "utf8");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });
});

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC 6238 SHA-1 test vector at T=59s", () => {
    // RFC 6238 Appendix B seed "12345678901234567890" (ASCII) -> known 8-digit code 94287082.
    const secret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
    const code = totp(secret, { digits: 8, period: 30 }, 59_000);
    expect(code).toBe("94287082");
  });

  it("verifies the current code and rejects an unrelated one", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = totp(secret, {}, now);
    expect(verifyTotp(secret, code, {}, now)).toBe(true);
    expect(verifyTotp(secret, "000000", {}, now)).toBe(false);
  });

  it("tolerates one step of clock skew but not far drift", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const codeNow = totp(secret, {}, now);
    // One period earlier still validates (window = 1)...
    expect(verifyTotp(secret, codeNow, { window: 1 }, now + 30_000)).toBe(true);
    // ...but five periods away does not.
    expect(verifyTotp(secret, codeNow, { window: 1 }, now + 150_000)).toBe(false);
  });

  it("builds a valid otpauth provisioning URI", () => {
    const secret = generateTotpSecret();
    const uri = totpProvisioningUri(secret, {
      issuer: "Faith Trail Systems",
      account: "nurse@example.org",
    });
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(`secret=${secret}`);
  });
});
