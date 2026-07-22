import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryAuditLog } from "@ft/audit";
import { AuthorizationService, buildCatalog, resolvePermissions } from "@ft/authorization";
import { uuidv7 } from "@ft/core";
import { InMemorySessionStore, TokenService } from "@ft/identity";
import { PlatformKernel, Router, type PlatformRequest } from "@ft/api";
import {
  GENESIS_ROLES,
  InMemoryMembersRepository,
  genesisRoutes,
  parseCreateMemberInput,
} from "./index.js";

const catalog = buildCatalog([...GENESIS_ROLES]);

async function harness() {
  const tokens = await TokenService.create({ issuer: "iss", audience: "aud" });
  const sessions = new InMemorySessionStore();
  const audit = new InMemoryAuditLog();
  const members = new InMemoryMembersRepository();
  const router = new Router().registerAll(genesisRoutes(members));
  const kernel = new PlatformKernel({
    router,
    tokenVerifier: tokens,
    sessions,
    audit,
    authorization: new AuthorizationService(),
    resolvePermissions: (roles) => resolvePermissions(roles, catalog),
  });

  async function login(tenantId: string, roleNames: string[]) {
    const userId = uuidv7();
    const issued = sessions.create({ userId, tenantId, mfaSatisfied: true });
    const token = await tokens.issueAccessToken({
      sub: userId,
      tid: tenantId,
      sid: issued.session.id,
      roles: roleNames,
      amr: ["pwd", "mfa"],
    });
    return token;
  }

  return { kernel, members, audit, login };
}

function req(
  method: PlatformRequest["method"],
  path: string,
  token?: string,
  body?: unknown,
): PlatformRequest {
  return {
    method,
    path,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body === undefined ? {} : { body }),
  };
}

describe("Genesis membership vertical (in-memory)", () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => {
    h = await harness();
  });

  it("creates, lists, and fetches a member for an authorized editor", async () => {
    const tenantId = uuidv7();
    const token = await h.login(tenantId, ["Genesis.Editor"]);

    const create = await h.kernel.handle(
      req("POST", "/genesis/members", token, { name: "Hannah", email: "hannah@example.org" }),
    );
    expect(create.status).toBe(201);
    const id = (create.body as { id: string }).id;

    const list = await h.kernel.handle(req("GET", "/genesis/members", token));
    expect(list.status).toBe(200);
    expect((list.body as unknown[]).length).toBe(1);

    const fetch = await h.kernel.handle(req("GET", `/genesis/members/${id}`, token));
    expect(fetch.status).toBe(200);
    expect((fetch.body as { name: string }).name).toBe("Hannah");
  });

  it("denies member creation to a viewer (403, deny-by-default)", async () => {
    const tenantId = uuidv7();
    const token = await h.login(tenantId, ["Genesis.Viewer"]);
    const res = await h.kernel.handle(
      req("POST", "/genesis/members", token, { name: "Miriam" }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects invalid input at the boundary (400)", async () => {
    const tenantId = uuidv7();
    const token = await h.login(tenantId, ["Genesis.Editor"]);
    const res = await h.kernel.handle(req("POST", "/genesis/members", token, { name: "" }));
    expect(res.status).toBe(400);
  });

  it("never returns another tenant's member (isolation → 404)", async () => {
    const tenantB = uuidv7();
    const bMember = h.members.seed(tenantB, { name: "Boaz" });

    const tenantA = uuidv7();
    const tokenA = await h.login(tenantA, ["Genesis.Viewer"]);
    const res = await h.kernel.handle(req("GET", `/genesis/members/${bMember.id}`, tokenA));
    expect(res.status).toBe(404);

    // And A's list does not include B's member.
    const list = await h.kernel.handle(req("GET", "/genesis/members", tokenA));
    expect((list.body as unknown[]).length).toBe(0);
  });
});

describe("parseCreateMemberInput", () => {
  it("accepts a valid name and trims it", () => {
    expect(parseCreateMemberInput({ name: "  Ada  " })).toEqual({ name: "Ada" });
  });
  it("accepts a valid email", () => {
    expect(parseCreateMemberInput({ name: "Ada", email: "ada@example.org" })).toEqual({
      name: "Ada",
      email: "ada@example.org",
    });
  });
  it("rejects a missing name, non-object body, and bad email", () => {
    expect(() => parseCreateMemberInput({})).toThrow();
    expect(() => parseCreateMemberInput("nope")).toThrow();
    expect(() => parseCreateMemberInput({ name: "Ada", email: "not-an-email" })).toThrow();
  });
});
