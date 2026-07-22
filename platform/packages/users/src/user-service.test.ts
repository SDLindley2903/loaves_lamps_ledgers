import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ValidationError, uuidv7 } from "@ft/core";
import { PasswordPolicy, ScryptPasswordHasher, totp } from "@ft/identity";
import { InMemoryUsersRepository, UserService } from "./index.js";

const hasher = new ScryptPasswordHasher({ n: 1024, r: 8, p: 1, keylen: 32 });

function service() {
  return new UserService(
    new InMemoryUsersRepository(),
    hasher,
    new PasswordPolicy(),
    "Faith Trail Systems",
  );
}

describe("registration", () => {
  let svc: UserService;
  beforeEach(() => {
    svc = service();
  });

  it("creates an active user with a hashed password", async () => {
    const user = await svc.register({
      email: "Grace@Example.org ",
      password: "a decent passphrase",
    });
    expect(user.email).toBe("grace@example.org"); // normalized
    expect(user.status).toBe("active");
    expect(user.passwordHash).not.toContain("passphrase");
  });

  it("rejects a weak password and an invalid email", async () => {
    await expect(svc.register({ email: "x@y.z", password: "short" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      svc.register({ email: "not-an-email", password: "a decent passphrase" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a duplicate email", async () => {
    await svc.register({ email: "dup@example.org", password: "a decent passphrase" });
    await expect(
      svc.register({ email: "dup@example.org", password: "another good passphrase" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("credential verification", () => {
  it("returns the user for correct credentials and undefined otherwise", async () => {
    const svc = service();
    await svc.register({ email: "ruth@example.org", password: "a decent passphrase" });

    expect(await svc.verifyCredentials("ruth@example.org", "a decent passphrase")).toBeDefined();
    expect(await svc.verifyCredentials("ruth@example.org", "wrong password here")).toBeUndefined();
    // Non-existent account returns undefined identically (no enumeration).
    expect(await svc.verifyCredentials("nobody@example.org", "whatever password")).toBeUndefined();
  });
});

describe("memberships", () => {
  it("links a user to tenants with roles", async () => {
    const svc = service();
    const user = await svc.register({
      email: "multi@example.org",
      password: "a decent passphrase",
    });
    const t1 = uuidv7();
    const t2 = uuidv7();
    await svc.createMembership(user.id, t1, ["Genesis.Admin"]);
    await svc.createMembership(user.id, t2, ["Genesis.Viewer"]);

    const memberships = await svc.membershipsForUser(user.id);
    expect(memberships).toHaveLength(2);
    expect((await svc.membership(user.id, t1))?.roleNames).toEqual(["Genesis.Admin"]);
  });
});

describe("MFA enrollment and verification", () => {
  it("enrolls TOTP, confirms it, issues recovery codes, and verifies codes", async () => {
    const svc = service();
    const user = await svc.register({
      email: "nurse@example.org",
      password: "a decent passphrase",
    });
    expect(svc.hasMfa(user)).toBe(false);

    const { secret } = await svc.beginTotpEnrollment(user.id);
    const confirm = await svc.confirmTotpEnrollment(user.id, totp(secret));
    expect(confirm.recoveryCodes.length).toBeGreaterThan(0);

    // A valid TOTP now verifies; a wrong code does not.
    expect(await svc.verifyMfa(user.id, totp(secret))).toBe(true);
    expect(await svc.verifyMfa(user.id, "000000")).toBe(false);

    // A recovery code works once, then is consumed.
    const recovery = confirm.recoveryCodes[0]!;
    expect(await svc.verifyMfa(user.id, recovery)).toBe(true);
    expect(await svc.verifyMfa(user.id, recovery)).toBe(false);
  });

  it("rejects confirmation with an incorrect code", async () => {
    const svc = service();
    const user = await svc.register({ email: "x@example.org", password: "a decent passphrase" });
    await svc.beginTotpEnrollment(user.id);
    await expect(svc.confirmTotpEnrollment(user.id, "000000")).rejects.toThrow();
  });
});
