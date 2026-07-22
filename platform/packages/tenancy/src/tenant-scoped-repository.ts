import { NotFoundError } from "@ft/core";
import { currentTenantId } from "./tenant-context.js";

/**
 * Application-layer tenant scoping (doc 04 §2, layer 4).
 *
 * This is the "belt" that complements the database "suspenders": in production, Postgres Row-Level
 * Security is the primary structural control that makes a forgotten tenant filter non-exploitable.
 * This repository adds an INDEPENDENT application-layer enforcement so that two independent mechanisms
 * must BOTH fail for a cross-tenant leak — the defense-in-depth the architecture requires.
 *
 * WHY cross-tenant access presents as NotFound (not Forbidden): returning "forbidden" would confirm
 * that another tenant's record exists. Not-found leaks nothing about other tenants' data (doc 04, and
 * the NotFoundError contract in @ft/core).
 *
 * This in-memory implementation is the reference the tenant-isolation invariant tests run against. The
 * real implementation issues tenant-scoped SQL under RLS (packages/tenancy/sql/rls.sql).
 */
export interface TenantOwned {
  readonly id: string;
  readonly tenantId: string;
}

export class InMemoryTenantScopedRepository<T extends TenantOwned> {
  private readonly byId = new Map<string, T>();

  /** Insert/replace a record. The record's tenantId MUST match the active scope. */
  save(record: T): T {
    const tenantId = currentTenantId();
    if (record.tenantId !== tenantId) {
      // Attempting to write a record belonging to a different tenant than the active scope is a bug
      // or an attack; refuse it. (In the DB, the RLS WITH CHECK clause enforces the same.)
      throw new NotFoundError();
    }
    this.byId.set(record.id, record);
    return record;
  }

  /** Fetch by id, but ONLY if it belongs to the active tenant; otherwise not-found. */
  findById(id: string): T | undefined {
    const tenantId = currentTenantId();
    const record = this.byId.get(id);
    if (!record || record.tenantId !== tenantId) {
      return undefined;
    }
    return record;
  }

  /** Fetch by id or throw NotFound — the fail-closed accessor used by handlers. */
  getById(id: string): T {
    const record = this.findById(id);
    if (!record) {
      throw new NotFoundError();
    }
    return record;
  }

  /** List all records for the ACTIVE tenant only. Never returns other tenants' rows. */
  list(): T[] {
    const tenantId = currentTenantId();
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  /** Delete by id, but only within the active tenant; deleting another tenant's row is a no-op-as-notfound. */
  delete(id: string): void {
    const record = this.findById(id);
    if (!record) {
      throw new NotFoundError();
    }
    this.byId.delete(id);
  }
}
