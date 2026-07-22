import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryAuditLog } from "@ft/audit";
import { AuthorizationService, buildCatalog, resolvePermissions } from "@ft/authorization";
import { uuidv7 } from "@ft/core";
import { InMemorySessionStore, TokenService } from "@ft/identity";
import { PlatformKernel, Router, type PlatformRequest } from "@ft/api";
import { Database, loadMigrationFile, runMigrations } from "@ft/db";
import { runInTenantScope } from "@ft/tenancy";
import { GENESIS_ROLES, PgMembersRepository, genesisRoutes, type Member } from "./index.js";

/**
 * Integration test: the Genesis vertical against a REAL PostgreSQL, proving tenant isolation is
 * enforced by the database (RLS), not merely the application (doc 04, doc 07).
 *
 * Runs only when FT_TEST_DATABASE_URL points at a Postgres the test may migrate (a throwaway DB). It
 * is skipped otherwise so the default `pnpm test` needs no database. CI provides a Postgres service.
 */
const ADMIN_URL = process.env["FT_TEST_DATABASE_URL"];
const here = dirname(fileURLToPath(import.meta.url));

function appUrlFrom(adminUrl: string): string {
  const url = new URL(adminUrl);
  url.username = "ft_app";
  url.password = "ft_app_local_dev";
  return url.toString();
}

describe.skipIf(!ADMIN_URL)("Genesis on PostgreSQL (RLS-enforced isolation)", () => {
  let adminDb: Database;
  let appDb: Database;
  let kernel: PlatformKernel;
  let sessions: InMemorySessionStore;
  let tokens: TokenService;
  const tenantA = uuidv7();
  const tenantB = uuidv7();

  async function login(tenantId: string, roleNames: string[]): Promise<string> {
    const userId = uuidv7();
    const issued = sessions.create({ userId, tenantId, mfaSatisfied: true });
    return tokens.issueAccessToken({
      sub: userId,
      tid: tenantId,
      sid: issued.session.id,
      roles: roleNames,
      amr: ["pwd", "mfa"],
    });
  }

  beforeAll(async () => {
    adminDb = Database.fromUrl(ADMIN_URL!);

    // Apply platform + product migrations under the admin connection.
    const migrations = [
      await loadMigrationFile(resolve(here, "../../../packages/db/sql/0001_tenants_and_roles.sql")),
      await loadMigrationFile(resolve(here, "../migrations/0001_members.sql")),
    ];
    await adminDb.withConnection((exec) => runMigrations(exec, migrations));

    // Seed two tenants and one member belonging to tenant B (admin insert; bypasses RLS for setup).
    await adminDb.withConnection(async (exec) => {
      await exec.query(
        "INSERT INTO tenants (id, name) VALUES ($1,$2),($3,$4) ON CONFLICT DO NOTHING",
        [tenantA, "First Church", tenantB, "Second Church"],
      );
    });

    appDb = Database.fromUrl(appUrlFrom(ADMIN_URL!));
    tokens = await TokenService.create({ issuer: "iss", audience: "aud" });
    sessions = new InMemorySessionStore();
    const catalog = buildCatalog([...GENESIS_ROLES]);
    kernel = new PlatformKernel({
      router: new Router().registerAll(genesisRoutes(new PgMembersRepository(appDb))),
      tokenVerifier: tokens,
      sessions,
      audit: new InMemoryAuditLog(),
      authorization: new AuthorizationService(),
      resolvePermissions: (roles) => resolvePermissions(roles, catalog),
    });
  });

  afterAll(async () => {
    await appDb?.end();
    await adminDb?.end();
  });

  function req(
    method: PlatformRequest["method"],
    path: string,
    token: string,
    body?: unknown,
  ): PlatformRequest {
    return {
      method,
      path,
      headers: { authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body }),
    };
  }

  it("creates a member through the full pipeline and reads it back", async () => {
    const token = await login(tenantA, ["Genesis.Editor"]);
    const create = await kernel.handle(
      req("POST", "/genesis/members", token, { name: "Deborah", email: "deborah@example.org" }),
    );
    expect(create.status).toBe(201);
    const id = (create.body as Member).id;

    const fetched = await kernel.handle(req("GET", `/genesis/members/${id}`, token));
    expect(fetched.status).toBe(200);
    expect((fetched.body as Member).name).toBe("Deborah");
  });

  it("enforces isolation at the DATABASE: tenant A cannot read a member created by tenant B", async () => {
    // Create a member as tenant B through the pipeline.
    const tokenB = await login(tenantB, ["Genesis.Editor"]);
    const createB = await kernel.handle(req("POST", "/genesis/members", tokenB, { name: "Silas" }));
    const bMemberId = (createB.body as Member).id;

    // Tenant A tries to read it -> RLS returns nothing -> 404 (existence not revealed).
    const tokenA = await login(tenantA, ["Genesis.Viewer"]);
    const res = await kernel.handle(req("GET", `/genesis/members/${bMemberId}`, tokenA));
    expect(res.status).toBe(404);
  });

  it("A's list contains only A's members, never B's", async () => {
    const tokenA = await login(tenantA, ["Genesis.Viewer"]);
    const list = await kernel.handle(req("GET", "/genesis/members", tokenA));
    const members = list.body as Member[];
    expect(members.length).toBeGreaterThan(0);
    expect(members.every((m) => m.tenantId === tenantA)).toBe(true);
  });

  it("the DB WITH CHECK policy blocks writing a row into a different tenant than the active scope", async () => {
    // Directly attempt a cross-tenant insert while scoped to A. RLS WITH CHECK must reject it.
    await expect(
      runInTenantScope(tenantA, () =>
        appDb.withTenantConnection((exec) =>
          exec.query("INSERT INTO members (id, tenant_id, name) VALUES ($1,$2,$3)", [
            uuidv7(),
            tenantB, // smuggling B's id while scoped to A
            "smuggled",
          ]),
        ),
      ),
    ).rejects.toThrow();
  });
});
