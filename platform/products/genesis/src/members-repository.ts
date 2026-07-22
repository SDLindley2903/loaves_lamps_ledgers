import type { Database, QueryExecutor } from "@ft/db";
import { uuidv7 } from "@ft/core";
import { currentTenantId, runInTenantScope } from "@ft/tenancy";
import type { CreateMemberInput, Member } from "./member.js";

/**
 * Members data access (doc 05, doc 07).
 *
 * The repository never accepts or trusts a tenant id from the caller — it derives the tenant from the
 * ambient scope (`currentTenantId`) established by the request pipeline (doc 01 §4). Combined with the
 * DB-layer RLS (via {@link Database.withTenantConnection}), a member can only ever be created in, or
 * read from, the caller's own tenant.
 */
export interface MembersRepository {
  create(input: CreateMemberInput): Promise<Member>;
  getById(id: string): Promise<Member | undefined>;
  list(): Promise<readonly Member[]>;
}

interface MemberRow {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  created_at: Date;
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at.toISOString(),
  };
}

/** PostgreSQL-backed repository. All access flows through tenant-scoped transactions (RLS enforced). */
export class PgMembersRepository implements MembersRepository {
  constructor(private readonly db: Database) {}

  create(input: CreateMemberInput): Promise<Member> {
    return this.db.withTenantConnection(async (exec: QueryExecutor) => {
      const id = uuidv7();
      const tenantId = currentTenantId();
      const result = await exec.query<MemberRow>(
        `INSERT INTO members (id, tenant_id, name, email)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, name, email, created_at`,
        [id, tenantId, input.name, input.email ?? null],
      );
      return toMember(result.rows[0]!);
    });
  }

  getById(id: string): Promise<Member | undefined> {
    return this.db.withTenantConnection(async (exec) => {
      // No explicit tenant filter needed: RLS restricts the result to the current tenant. A member in
      // another tenant simply returns zero rows here.
      const result = await exec.query<MemberRow>(
        `SELECT id, tenant_id, name, email, created_at FROM members WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      return row ? toMember(row) : undefined;
    });
  }

  list(): Promise<readonly Member[]> {
    return this.db.withTenantConnection(async (exec) => {
      const result = await exec.query<MemberRow>(
        `SELECT id, tenant_id, name, email, created_at FROM members ORDER BY created_at, id`,
      );
      return result.rows.map(toMember);
    });
  }
}

/**
 * In-memory repository for unit tests and local development without a database. It reproduces the
 * tenant-scoping contract (derives tenant from the ambient scope; never returns another tenant's data)
 * so route/handler tests can run without Postgres while still exercising isolation behavior.
 */
export class InMemoryMembersRepository implements MembersRepository {
  private readonly rows: Member[] = [];

  create(input: CreateMemberInput): Promise<Member> {
    const tenantId = currentTenantId();
    const member: Member = {
      id: uuidv7(),
      tenantId,
      name: input.name,
      email: input.email ?? null,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(member);
    return Promise.resolve(member);
  }

  getById(id: string): Promise<Member | undefined> {
    const tenantId = currentTenantId();
    const found = this.rows.find((m) => m.id === id && m.tenantId === tenantId);
    return Promise.resolve(found);
  }

  list(): Promise<readonly Member[]> {
    const tenantId = currentTenantId();
    return Promise.resolve(this.rows.filter((m) => m.tenantId === tenantId));
  }

  /** Test helper: seed a member into a specific tenant (mimics data owned by another org). */
  seed(tenantId: string, input: CreateMemberInput): Member {
    return runInTenantScope(tenantId, () => {
      const member: Member = {
        id: uuidv7(),
        tenantId,
        name: input.name,
        email: input.email ?? null,
        createdAt: new Date().toISOString(),
      };
      this.rows.push(member);
      return member;
    });
  }
}
