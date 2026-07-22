import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "./app.js";
import { createHttpServer } from "./build-server.js";

/**
 * End-to-end test over REAL HTTP: starts the server on an ephemeral port and drives it with fetch,
 * exercising the actual transport adapter + kernel together (doc 08). Uses the in-memory repository so
 * it needs no database.
 */
describe("HTTP server (real requests)", () => {
  let app: App;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    app = await buildApp({ issuer: "iss", audience: "aud", devAuth: true });
    server = createHttpServer(app.kernel);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
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
    return {
      status: res.status,
      headers: res.headers,
      json: text ? JSON.parse(text) : undefined,
    };
  }

  it("serves /health without a token and sets security headers", async () => {
    const res = await call("GET", "/health");
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("ok");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a protected route without a token (401)", async () => {
    const res = await call("GET", "/genesis/members");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("mints a dev token and uses it to create, list, and fetch a member", async () => {
    const loginRes = await call("POST", "/dev/login", { body: { roles: ["Genesis.Editor"] } });
    expect(loginRes.status).toBe(200);
    const token = loginRes.json.accessToken as string;
    expect(token).toBeTruthy();

    const createRes = await call("POST", "/genesis/members", {
      token,
      body: { name: "Priscilla", email: "priscilla@example.org" },
    });
    expect(createRes.status).toBe(201);
    const id = createRes.json.id as string;

    const listRes = await call("GET", "/genesis/members", { token });
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.json)).toBe(true);
    expect(listRes.json.length).toBe(1);

    const getRes = await call("GET", `/genesis/members/${id}`, { token });
    expect(getRes.status).toBe(200);
    expect(getRes.json.name).toBe("Priscilla");
  });

  it("returns 400 for malformed JSON", async () => {
    const loginRes = await call("POST", "/dev/login", {});
    const token = loginRes.json.accessToken as string;
    const res = await call("POST", "/genesis/members", { token, rawBody: "{ not json" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown route", async () => {
    const res = await call("GET", "/does/not/exist");
    expect(res.status).toBe(404);
  });

  it("keeps tenants isolated: a token for one dev tenant cannot see another's members", async () => {
    const a = await call("POST", "/dev/login", { body: { roles: ["Genesis.Editor"] } });
    const b = await call("POST", "/dev/login", { body: { roles: ["Genesis.Editor"] } });
    const tokenA = a.json.accessToken as string;
    const tokenB = b.json.accessToken as string;

    const createB = await call("POST", "/genesis/members", {
      token: tokenB,
      body: { name: "Lydia" },
    });
    const bId = createB.json.id as string;

    // A cannot fetch B's member.
    const cross = await call("GET", `/genesis/members/${bId}`, { token: tokenA });
    expect(cross.status).toBe(404);
  });
});
