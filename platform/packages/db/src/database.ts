import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { currentTenantId } from "@ft/tenancy";

/**
 * PostgreSQL access bound to the tenant scope (doc 04, doc 07).
 *
 * WHY this class is the ONLY sanctioned way product code touches the database: it opens a transaction
 * and issues `SET LOCAL app.tenant_id = <current tenant>` before running any query, which is exactly
 * what the Row-Level Security policies read (packages/tenancy/sql/rls.sql). Combined with an
 * application DB role that CANNOT bypass RLS, this makes the most dangerous bug class — a query that
 * forgets its tenant filter — non-exploitable: the database itself refuses to return other tenants'
 * rows. The application-layer scoping (@ft/tenancy) and this DB-layer scoping are two independent
 * controls; both must fail for a cross-tenant leak.
 */
export interface QueryExecutor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>;
}

export class Database {
  constructor(private readonly pool: Pool) {}

  static fromUrl(connectionString: string): Database {
    return new Database(new Pool({ connectionString }));
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Run `fn` inside a transaction whose `app.tenant_id` is bound to the ambient tenant scope, so RLS
   * scopes every query. Reads the tenant from the AsyncLocalStorage scope established by the request
   * pipeline (doc 01 §4); fails closed if no scope is active.
   */
  async withTenantConnection<T>(fn: (exec: QueryExecutor) => Promise<T>): Promise<T> {
    const tenantId = currentTenantId(); // throws MissingTenantScopeError if unscoped
    return this.transaction(async (client) => {
      // set_config(name, value, is_local=true) is the parameterized form of SET LOCAL — no injection.
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      return fn(client);
    });
  }

  /**
   * Unscoped connection for migrations and the few deliberate cross-tenant platform operations
   * (doc 04 §6). Used sparingly and only by platform-level code, never by product handlers.
   */
  async withConnection<T>(fn: (exec: QueryExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  private async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
