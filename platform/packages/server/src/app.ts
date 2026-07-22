import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryAuditLog, type AuditLog } from "@ft/audit";
import { AuthorizationService, buildCatalog, resolvePermissions } from "@ft/authorization";
import { ok, PlatformKernel, Router, type Route } from "@ft/api";
import { Database, loadMigrationFile, runMigrations } from "@ft/db";
import {
  InMemorySessionStore,
  PasswordPolicy,
  ScryptPasswordHasher,
  TokenService,
  type SessionStore,
} from "@ft/identity";
import { InMemoryUsersRepository, UserService } from "@ft/users";
import {
  GENESIS_ROLES,
  InMemoryMembersRepository,
  PgMembersRepository,
  genesisRoutes,
  type MembersRepository,
} from "@ft/genesis";
import { authRoutes } from "./auth-routes.js";
import { devAuthRoute } from "./dev-auth.js";

/**
 * The composition root (doc 01, doc 16).
 *
 * WHY a single place assembles everything: the platform's guarantees come from wiring the same shared
 * components together the same way every time. This function is where identity, authorization, tenancy,
 * audit, the database, and product routes are composed into one kernel. A product does not re-wire the
 * pipeline; it contributes routes and a repository, and inherits the rest.
 */
export interface AppConfig {
  readonly issuer: string;
  readonly audience: string;
  /**
   * Application database URL. MUST connect as a role that CANNOT bypass RLS (e.g. `ft_app`), because
   * the repository relies on Row-Level Security for tenant scoping (doc 04). When unset, an in-memory
   * repository is used for local/dev without a database.
   */
  readonly databaseUrl?: string;
  /**
   * Admin database URL for migrations and tenant provisioning (operations the app role is not
   * permitted to perform). Required when `migrate` is true or when the DEV auth endpoint must create
   * tenants. Connects as a privileged role and is NEVER used for product queries.
   */
  readonly adminDatabaseUrl?: string;
  /** Registers the DEV-ONLY token endpoint. Never enable outside local development. */
  readonly devAuth?: boolean;
  /** Run pending migrations on startup (requires adminDatabaseUrl). */
  readonly migrate?: boolean;
}

export interface App {
  readonly kernel: PlatformKernel;
  readonly tokens: TokenService;
  readonly sessions: SessionStore;
  readonly audit: AuditLog;
  readonly devAuth: boolean;
  /** Release resources (DB pool). */
  close(): Promise<void>;
}

const here = dirname(fileURLToPath(import.meta.url));

export async function buildApp(config: AppConfig): Promise<App> {
  const tokens = await TokenService.create({ issuer: config.issuer, audience: config.audience });
  const sessions = new InMemorySessionStore();
  const audit = new InMemoryAuditLog();
  const authorization = new AuthorizationService({
    // Sensitive actions require a step-up (MFA-satisfied) session (doc 02/03).
    stepUpRequired: new Set(["genesis.member.export", "genesis.member.delete"]),
  });

  const catalog = buildCatalog([...GENESIS_ROLES]);

  // Two distinct connections in DB mode (doc 04 §2): the app role (RLS-enforced) serves product
  // queries; the admin role runs migrations and tenant provisioning the app role may not perform.
  let appDb: Database | undefined;
  let adminDb: Database | undefined;
  let members: MembersRepository;
  let ensureTenant: ((tenantId: string, name?: string) => Promise<void>) | undefined;

  if (config.databaseUrl) {
    appDb = Database.fromUrl(config.databaseUrl);
    members = new PgMembersRepository(appDb);

    if (config.adminDatabaseUrl) {
      adminDb = Database.fromUrl(config.adminDatabaseUrl);
      const admin = adminDb;
      if (config.migrate) {
        await runStartupMigrations(admin);
      }
      ensureTenant = async (tenantId: string, name?: string) => {
        await admin.withConnection((exec) =>
          exec.query("INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
            tenantId,
            name ?? "Organization",
          ]),
        );
      };
    } else if (config.migrate) {
      throw new Error("migrate=true requires adminDatabaseUrl (a privileged connection).");
    }
  } else {
    members = new InMemoryMembersRepository();
  }

  // Account service: user accounts, memberships, credentials, and MFA (doc 02/05). Users are a
  // platform (cross-tenant) concern, so this uses an in-memory store for now (Postgres-backed users
  // are a later increment); product data remains RLS-scoped in Postgres.
  const userService = new UserService(
    new InMemoryUsersRepository(),
    new ScryptPasswordHasher(),
    new PasswordPolicy(),
    config.issuer,
  );

  const routes: Route[] = [
    {
      method: "GET",
      path: "/health",
      authorization: { kind: "public", reason: "liveness/readiness probe" },
      handler: () => ok({ status: "ok", time: new Date().toISOString() }),
    },
    ...authRoutes({
      userService,
      tokens,
      sessions,
      audit,
      ...(ensureTenant ? { ensureTenant } : {}),
    }),
    ...genesisRoutes(members),
  ];
  if (config.devAuth) {
    routes.push(devAuthRoute({ tokens, sessions, ...(ensureTenant ? { ensureTenant } : {}) }));
  }

  const kernel = new PlatformKernel({
    router: new Router().registerAll(routes),
    tokenVerifier: tokens,
    sessions,
    authorization,
    audit,
    resolvePermissions: (roleNames) => resolvePermissions(roleNames, catalog),
  });

  return {
    kernel,
    tokens,
    sessions,
    audit,
    devAuth: config.devAuth ?? false,
    close: async () => {
      await appDb?.end();
      await adminDb?.end();
    },
  };
}

async function runStartupMigrations(db: Database): Promise<void> {
  const migrations = [
    await loadMigrationFile(resolve(here, "../../db/sql/0001_tenants_and_roles.sql")),
    await loadMigrationFile(resolve(here, "../../../products/genesis/migrations/0001_members.sql")),
  ];
  await db.withConnection((exec) => runMigrations(exec, migrations));
}
