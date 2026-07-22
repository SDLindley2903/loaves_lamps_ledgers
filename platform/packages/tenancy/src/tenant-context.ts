import { AsyncLocalStorage } from "node:async_hooks";
import { PlatformError, type SecurityContext } from "@ft/core";

/**
 * Ambient tenant scope (doc 04).
 *
 * WHY AsyncLocalStorage: the request pipeline enters a tenant scope once, at the start of a request or
 * background job, and every downstream call — sync or async — runs inside it without threading a
 * tenantId through every function signature. This mirrors how the production system sets the Postgres
 * `app.tenant_id` session variable that RLS reads (doc 04 §2): scope is established once, before any
 * product code runs, and cannot be widened by product code.
 *
 * WHY it fails closed: reading the current tenant when no scope is active throws. A background job that
 * forgets to establish scope gets an error, not silent access to an unscoped (or wrong) tenant.
 */
export class MissingTenantScopeError extends PlatformError {
  constructor() {
    super({
      code: "tenancy.no_scope",
      category: "internal",
      message: "No tenant scope is active for the current execution context.",
    });
  }
}

const storage = new AsyncLocalStorage<{ readonly tenantId: string }>();

/** Run `fn` with the given tenant as the ambient scope. */
export function runInTenantScope<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

/** Convenience: derive the scope from a SecurityContext (doc 01 §4). */
export function runInContextScope<T>(ctx: SecurityContext, fn: () => T): T {
  return runInTenantScope(ctx.tenantId, fn);
}

/** The active tenant id, or throw if none is set (fails closed). */
export function currentTenantId(): string {
  const store = storage.getStore();
  if (!store) {
    throw new MissingTenantScopeError();
  }
  return store.tenantId;
}

/** The active tenant id, or undefined — for the rare, deliberate cross-tenant paths (doc 04 §6). */
export function currentTenantIdOrNull(): string | undefined {
  return storage.getStore()?.tenantId;
}
