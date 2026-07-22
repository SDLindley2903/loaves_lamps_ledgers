import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryAuditLog } from "@ft/audit";
import {
  AuthorizationService,
  buildCatalog,
  resolvePermissions,
  type Role,
} from "@ft/authorization";
import { uuidv7 } from "@ft/core";
import { InMemorySessionStore, TokenService } from "@ft/identity";
import { InMemoryTenantScopedRepository, runInTenantScope, type TenantOwned } from "@ft/tenancy";
import {
  PlatformKernel,
  Router,
  created,
  ok,
  type PlatformRequest,
  type ProtectedContext,
  type Route,
} from "./index.js";

interface Member extends TenantOwned {
  readonly name: string;
}

const ISSUER = "https://id.faithtrail.test";
const AUDIENCE = "ft-platform";

const ROLES: Role[] = [
  { name: "Volunteer", permissions: ["genesis.member.view"] },
  {
    name: "MinistryAdmin",
    permissions: ["genesis.member.create", "genesis.member.export"],
    inherits: ["Volunteer"],
  },
];
const catalog = buildCatalog(ROLES);

// A harness that wires the real platform pieces together behind the kernel.
async function harness() {
  const tokens = await TokenService.create({ issuer: ISSUER, audience: AUDIENCE });
  const sessions = new InMemorySessionStore();
  const audit = new InMemoryAuditLog();
  const authorization = new AuthorizationService({
    stepUpRequired: new Set(["genesis.member.export"]),
  });
  const members = new InMemoryTenantScopedRepository<Member>();

  const routes: Route[] = [
    {
      method: "GET",
      path: "/health",
      authorization: { kind: "public", reason: "liveness probe" },
      handler: () => ok({ status: "up" }),
    },
    {
      method: "GET",
      path: "/genesis/members/:id",
      authorization: { kind: "permission", permission: "genesis.member.view" },
      handler: ({ params }: ProtectedContext) => ok(members.getById(params["id"]!)),
    },
    {
      method: "POST",
      path: "/genesis/members",
      authorization: { kind: "permission", permission: "genesis.member.create" },
      audit: { action: "genesis.member.create", resourceType: "member" },
      handler: ({ request, security }: ProtectedContext) => {
        const body = request.body as { name: string };
        const member = members.save({ id: uuidv7(), tenantId: security.tenantId, name: body.name });
        return created(member);
      },
    },
    {
      method: "POST",
      path: "/genesis/members/export",
      authorization: { kind: "permission", permission: "genesis.member.export" },
      audit: { action: "genesis.member.export", resourceType: "member" },
      handler: () => ok({ exported: members.list().length }),
    },
  ];
  // Register export before the :id route so it is not shadowed.
  const router = new Router()
    .register(routes[0]!)
    .register(routes[3]!)
    .register(routes[1]!)
    .register(routes[2]!);

  const kernel = new PlatformKernel({
    router,
    tokenVerifier: tokens,
    sessions,
    authorization,
    audit,
    resolvePermissions: (roleNames) => resolvePermissions(roleNames, catalog),
  });

  async function login(tenantId: string, roleNames: string[], mfa: boolean) {
    const userId = uuidv7();
    const issued = sessions.create({ userId, tenantId, mfaSatisfied: mfa });
    const token = await tokens.issueAccessToken({
      sub: userId,
      tid: tenantId,
      sid: issued.session.id,
      roles: roleNames,
      amr: mfa ? ["pwd", "mfa"] : ["pwd"],
    });
    return { userId, sessionId: issued.session.id, token };
  }

  return { kernel, sessions, audit, members, login };
}

function bearer(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${token}`, ...extra };
}

function req(
  partial: Partial<PlatformRequest> & Pick<PlatformRequest, "method" | "path">,
): PlatformRequest {
  return { headers: {}, ...partial };
}

describe("API kernel — the shared secure request path", () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => {
    h = await harness();
  });

  it("serves an explicitly public route with no token", async () => {
    const res = await h.kernel.handle(req({ method: "GET", path: "/health" }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "up" });
  });

  it("rejects a protected route with no token (401)", async () => {
    const res = await h.kernel.handle(req({ method: "GET", path: "/genesis/members/x" }));
    expect(res.status).toBe(401);
  });

  it("rejects a garbage token (401)", async () => {
    const res = await h.kernel.handle(
      req({ method: "GET", path: "/genesis/members/x", headers: bearer("not.a.jwt") }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown route (fails closed)", async () => {
    const { token } = await h.login(uuidv7(), ["Volunteer"], false);
    const res = await h.kernel.handle(
      req({ method: "GET", path: "/nope", headers: bearer(token) }),
    );
    expect(res.status).toBe(404);
  });

  it("allows an authorized read and returns the resource", async () => {
    const tenantId = uuidv7();
    const { token } = await h.login(tenantId, ["Volunteer"], false);
    const id = uuidv7();
    runInTenantScope(tenantId, () => h.members.save({ id, tenantId, name: "Ruth" }));

    const res = await h.kernel.handle(
      req({ method: "GET", path: `/genesis/members/${id}`, headers: bearer(token) }),
    );
    expect(res.status).toBe(200);
    expect((res.body as Member).name).toBe("Ruth");
  });

  it("enforces tenant isolation THROUGH the pipeline (A cannot read B's record)", async () => {
    const tenantA = uuidv7();
    const tenantB = uuidv7();
    const bMemberId = uuidv7();
    runInTenantScope(tenantB, () =>
      h.members.save({ id: bMemberId, tenantId: tenantB, name: "Boaz" }),
    );

    const { token } = await h.login(tenantA, ["Volunteer"], false);
    const res = await h.kernel.handle(
      req({ method: "GET", path: `/genesis/members/${bMemberId}`, headers: bearer(token) }),
    );
    // Not 403 — cross-tenant reads present as not-found so existence is never leaked.
    expect(res.status).toBe(404);
  });

  it("denies an action the caller lacks permission for (403) and audits the denial", async () => {
    const tenantId = uuidv7();
    const { token } = await h.login(tenantId, ["Volunteer"], false); // no create permission
    const res = await h.kernel.handle(
      req({
        method: "POST",
        path: "/genesis/members",
        headers: bearer(token),
        body: { name: "Esther" },
      }),
    );
    expect(res.status).toBe(403);
    const events = await h.audit.list(tenantId);
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("genesis.member.create");
    expect(events[0]!.outcome).toBe("denied");
  });

  it("performs an authorized mutation, persists it, and audits success", async () => {
    const tenantId = uuidv7();
    const { token } = await h.login(tenantId, ["MinistryAdmin"], true);
    const res = await h.kernel.handle(
      req({
        method: "POST",
        path: "/genesis/members",
        headers: bearer(token),
        body: { name: "Esther" },
      }),
    );
    expect(res.status).toBe(201);
    expect((res.body as Member).name).toBe("Esther");

    const events = await h.audit.list(tenantId);
    expect(events).toHaveLength(1);
    expect(events[0]!.outcome).toBe("success");
    const verify = await h.audit.verify(tenantId);
    expect(verify.ok).toBe(true);
  });

  it("requires a step-up (MFA) session for a sensitive action (403 without MFA)", async () => {
    const tenantId = uuidv7();
    const withoutMfa = await h.login(tenantId, ["MinistryAdmin"], false);
    const denied = await h.kernel.handle(
      req({ method: "POST", path: "/genesis/members/export", headers: bearer(withoutMfa.token) }),
    );
    expect(denied.status).toBe(403);

    const withMfa = await h.login(tenantId, ["MinistryAdmin"], true);
    const allowed = await h.kernel.handle(
      req({ method: "POST", path: "/genesis/members/export", headers: bearer(withMfa.token) }),
    );
    expect(allowed.status).toBe(200);
  });

  it("rejects a token whose session has been revoked (hard revocation)", async () => {
    const tenantId = uuidv7();
    const { token, sessionId } = await h.login(tenantId, ["Volunteer"], false);
    h.sessions.revoke(sessionId);
    const res = await h.kernel.handle(
      req({ method: "GET", path: `/genesis/members/${uuidv7()}`, headers: bearer(token) }),
    );
    expect(res.status).toBe(401);
  });

  it("replays an idempotent mutation instead of applying it twice", async () => {
    const tenantId = uuidv7();
    const { token } = await h.login(tenantId, ["MinistryAdmin"], true);
    const request = req({
      method: "POST",
      path: "/genesis/members",
      headers: bearer(token, { "idempotency-key": "key-123" }),
      body: { name: "Naomi" },
    });

    const first = await h.kernel.handle(request);
    const second = await h.kernel.handle(request);

    expect(first.status).toBe(201);
    expect(second.body).toEqual(first.body); // same response replayed
    // Only ONE member and ONE audit event were created despite two requests.
    const created = runInTenantScope(tenantId, () => h.members.list());
    expect(created).toHaveLength(1);
    expect(await h.audit.list(tenantId)).toHaveLength(1);
  });
});
