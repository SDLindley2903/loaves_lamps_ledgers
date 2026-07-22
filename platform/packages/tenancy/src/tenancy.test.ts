import { describe, expect, it } from "vitest";
import { NotFoundError, uuidv7 } from "@ft/core";
import {
  InMemoryTenantScopedRepository,
  MissingTenantScopeError,
  currentTenantId,
  runInTenantScope,
  type TenantOwned,
} from "./index.js";

interface Member extends TenantOwned {
  readonly name: string;
}

describe("tenant scope", () => {
  it("fails closed when no scope is active (doc 04)", () => {
    expect(() => currentTenantId()).toThrow(MissingTenantScopeError);
  });

  it("exposes the active tenant within a scope", () => {
    const tenantId = uuidv7();
    const seen = runInTenantScope(tenantId, () => currentTenantId());
    expect(seen).toBe(tenantId);
  });
});

describe("tenant isolation invariant (THE core promise, doc 04)", () => {
  const tenantA = uuidv7();
  const tenantB = uuidv7();

  function seed(): { repo: InMemoryTenantScopedRepository<Member>; aId: string; bId: string } {
    const repo = new InMemoryTenantScopedRepository<Member>();
    const aId = uuidv7();
    const bId = uuidv7();
    runInTenantScope(tenantA, () => repo.save({ id: aId, tenantId: tenantA, name: "Alice (A)" }));
    runInTenantScope(tenantB, () => repo.save({ id: bId, tenantId: tenantB, name: "Bob (B)" }));
    return { repo, aId, bId };
  }

  it("a caller scoped to Tenant A cannot READ Tenant B's record", () => {
    const { repo, bId } = seed();
    runInTenantScope(tenantA, () => {
      expect(repo.findById(bId)).toBeUndefined();
      expect(() => repo.getById(bId)).toThrow(NotFoundError);
    });
  });

  it("a caller scoped to Tenant A cannot LIST Tenant B's records", () => {
    const { repo } = seed();
    const listedForA = runInTenantScope(tenantA, () => repo.list());
    expect(listedForA).toHaveLength(1);
    expect(listedForA[0]!.tenantId).toBe(tenantA);
  });

  it("a caller scoped to Tenant A cannot DELETE Tenant B's record", () => {
    const { repo, bId } = seed();
    runInTenantScope(tenantA, () => {
      expect(() => repo.delete(bId)).toThrow(NotFoundError);
    });
    // B's record survives the cross-tenant delete attempt.
    const stillThere = runInTenantScope(tenantB, () => repo.findById(bId));
    expect(stillThere).toBeDefined();
  });

  it("a caller cannot WRITE a record belonging to a different tenant than its scope", () => {
    const { repo } = seed();
    runInTenantScope(tenantA, () => {
      expect(() => repo.save({ id: uuidv7(), tenantId: tenantB, name: "smuggled" })).toThrow(
        NotFoundError,
      );
    });
  });

  it("each tenant sees exactly and only its own data", () => {
    const { repo, aId, bId } = seed();
    expect(runInTenantScope(tenantA, () => repo.getById(aId)).name).toBe("Alice (A)");
    expect(runInTenantScope(tenantB, () => repo.getById(bId)).name).toBe("Bob (B)");
  });
});
