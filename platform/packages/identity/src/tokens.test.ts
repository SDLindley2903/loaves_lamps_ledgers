import { describe, expect, it } from "vitest";
import { UnauthorizedError, uuidv7 } from "@ft/core";
import { TokenService, type AccessTokenClaims } from "./index.js";

const config = { issuer: "https://id.faithtrail.test", audience: "ft-platform" };

function claims(): AccessTokenClaims {
  return {
    sub: uuidv7(),
    tid: uuidv7(),
    sid: uuidv7(),
    roles: ["MinistryAdmin"],
    amr: ["pwd", "mfa"],
  };
}

describe("access tokens (EdDSA, stateless)", () => {
  it("issues a token that verifies and round-trips its claims", async () => {
    const svc = await TokenService.create(config);
    const input = claims();
    const token = await svc.issueAccessToken(input);
    const decoded = await svc.verifyAccessToken(token);
    expect(decoded.sub).toBe(input.sub);
    expect(decoded.tid).toBe(input.tid);
    expect(decoded.sid).toBe(input.sid);
    expect(decoded.roles).toEqual(input.roles);
    expect(decoded.amr).toEqual(input.amr);
  });

  it("rejects a token signed by a different key (no cross-issuer trust)", async () => {
    const a = await TokenService.create(config);
    const b = await TokenService.create(config);
    const token = await a.issueAccessToken(claims());
    await expect(b.verifyAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a garbage token (fail closed)", async () => {
    const svc = await TokenService.create(config);
    await expect(svc.verifyAccessToken("not.a.jwt")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects an expired token", async () => {
    const svc = await TokenService.create({ ...config, accessTtlSeconds: 1 });
    const token = await svc.issueAccessToken(claims());
    // Wait just past expiry (jose allows no clock tolerance by default).
    await new Promise((r) => setTimeout(r, 1100));
    await expect(svc.verifyAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("refuses to mint a token whose TTL exceeds the 15-minute policy", async () => {
    const svc = await TokenService.create({ ...config, accessTtlSeconds: 3600 });
    await expect(svc.issueAccessToken(claims())).rejects.toThrow(/15-minute/);
  });

  it("publishes a JWKS with only the public key", async () => {
    const svc = await TokenService.create(config);
    const jwks = await svc.publicJwks();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]!.use).toBe("sig");
    // A public JWK must not carry the private scalar `d`.
    expect(jwks.keys[0]!).not.toHaveProperty("d");
  });
});
