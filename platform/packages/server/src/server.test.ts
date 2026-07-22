import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "@ft/core";
import { totp } from "@ft/identity";
import { buildApp, type App } from "./app.js";
import { createHttpServer } from "./build-server.js";

/**
 * End-to-end test over REAL HTTP against the REAL authentication flow (doc 02): register, password
 * login, token refresh, logout, and full TOTP MFA enrollment + MFA login. Uses the in-memory
 * repositories so it needs no database.
 */
describe("HTTP server — real auth flow", () => {
  let app: App;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    app = await buildApp({ issuer: "iss", audience: "aud" });
    server = createHttpServer(app.kernel);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await app.close();
  });

  async function call(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; rawBody?: string } = {},
  ) {
    const headers: Record<string, string> = {};
    if (opts.token) {
      headers["authorization"] = `Bearer ${opts.token}`;
    }
    let body: string | undefined;
    if (opts.rawBody !== undefined) {
      headers["content-type"] = "application/json";
      body = opts.rawBody;
    } else if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, ...(body ? { body } : {}) });
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : undefined };
  }

  /** Register a fresh account + org and log in (no MFA), returning tokens and identifiers. */
  async function registerAndLogin(password = "a decent passphrase") {
    const email = `${uuidv7()}@example.org`;
    const reg = await call("POST", "/auth/register", {
      body: { email, password, organizationName: "Test Church" },
    });
    expect(reg.status).toBe(201);
    const login = await call("POST", "/auth/login", { body: { email, password } });
    expect(login.status).toBe(200);
    return {
      email,
      password,
      accessToken: login.json.accessToken as string,
      refreshToken: login.json.refreshToken as string,
      tenantId: reg.json.tenantId as string,
      userId: reg.json.userId as string,
    };
  }

  it("serves /health with security headers and no token", async () => {
    const res = await call("GET", "/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects a protected route without a token (401)", async () => {
    const res = await call("GET", "/genesis/members");
    expect(res.status).toBe(401);
  });

  it("registers, logs in, and uses the token to create/list/fetch a member", async () => {
    const { accessToken } = await registerAndLogin();

    const create = await call("POST", "/genesis/members", {
      token: accessToken,
      body: { name: "Priscilla", email: "priscilla@example.org" },
    });
    expect(create.status).toBe(201);
    const id = create.json.id as string;

    const list = await call("GET", "/genesis/members", { token: accessToken });
    expect(list.status).toBe(200);
    expect(list.json.length).toBe(1);

    const get = await call("GET", `/genesis/members/${id}`, { token: accessToken });
    expect(get.json.name).toBe("Priscilla");
  });

  it("rejects unknown user / wrong password uniformly (401)", async () => {
    const { email } = await registerAndLogin();
    expect(
      (await call("POST", "/auth/login", { body: { email, password: "wrong password!!" } })).status,
    ).toBe(401);
    expect(
      (
        await call("POST", "/auth/login", {
          body: { email: "ghost@example.org", password: "whatever now" },
        })
      ).status,
    ).toBe(401);
  });

  it("refreshes an access token by rotating the refresh token", async () => {
    const { refreshToken } = await registerAndLogin();
    const res = await call("POST", "/auth/refresh", { body: { refreshToken } });
    expect(res.status).toBe(200);
    expect(res.json.accessToken).toBeTruthy();
    expect(res.json.refreshToken).not.toEqual(refreshToken); // rotated

    // The old refresh token is now invalid (rotation + reuse detection).
    expect((await call("POST", "/auth/refresh", { body: { refreshToken } })).status).toBe(401);
  });

  it("logs out, revoking the session so the access token stops working", async () => {
    const { accessToken } = await registerAndLogin();
    expect((await call("GET", "/genesis/members", { token: accessToken })).status).toBe(200);

    const logout = await call("POST", "/auth/logout", { token: accessToken });
    expect(logout.status).toBe(204);

    // Session revoked -> the (still-unexpired) access token is now rejected (hard revocation).
    expect((await call("GET", "/genesis/members", { token: accessToken })).status).toBe(401);
  });

  it("enrolls TOTP MFA and then requires it on the next login", async () => {
    const { email, password, accessToken } = await registerAndLogin();

    const enroll = await call("POST", "/auth/mfa/enroll", { token: accessToken });
    expect(enroll.status).toBe(200);
    const secret = enroll.json.secret as string;

    const confirm = await call("POST", "/auth/mfa/enroll/confirm", {
      token: accessToken,
      body: { code: totp(secret) },
    });
    expect(confirm.status).toBe(200);
    expect(confirm.json.recoveryCodes.length).toBeGreaterThan(0);

    // Logging in again now returns an MFA challenge instead of tokens.
    const login = await call("POST", "/auth/login", { body: { email, password } });
    expect(login.status).toBe(200);
    expect(login.json.mfaRequired).toBe(true);
    const challengeId = login.json.challengeId as string;

    // Wrong code is rejected; correct TOTP completes the login.
    expect(
      (await call("POST", "/auth/mfa/verify", { body: { challengeId, code: "000000" } })).status,
    ).toBe(401);
    const verified = await call("POST", "/auth/mfa/verify", {
      body: { challengeId, code: totp(secret) },
    });
    expect(verified.status).toBe(200);
    expect(verified.json.accessToken).toBeTruthy();
  });

  it("keeps tenants isolated between two independently-registered orgs", async () => {
    const a = await registerAndLogin();
    const b = await registerAndLogin();

    const created = await call("POST", "/genesis/members", {
      token: b.accessToken,
      body: { name: "Lydia" },
    });
    const bId = created.json.id as string;

    // A cannot read B's member.
    expect((await call("GET", `/genesis/members/${bId}`, { token: a.accessToken })).status).toBe(
      404,
    );
  });

  it("returns 400 for malformed JSON and 404 for unknown routes", async () => {
    const { accessToken } = await registerAndLogin();
    expect(
      (await call("POST", "/genesis/members", { token: accessToken, rawBody: "{ bad" })).status,
    ).toBe(400);
    expect((await call("GET", "/nope", { token: accessToken })).status).toBe(404);
  });
});
