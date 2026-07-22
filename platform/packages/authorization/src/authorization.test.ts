import { describe, expect, it } from "vitest";
import { ForbiddenError, uuidv7, type SecurityContext } from "@ft/core";
import {
  AuthorizationService,
  buildCatalog,
  resolvePermissions,
  type AbacCondition,
  type Role,
} from "./index.js";

function context(
  overrides: Partial<SecurityContext> & { permissions: Set<string> },
): SecurityContext {
  return {
    tenantId: uuidv7(),
    actor: { kind: "user", userId: uuidv7() },
    mfaSatisfied: true,
    requestId: "req-test",
    ...overrides,
  };
}

describe("role resolution (RBAC + inheritance)", () => {
  const roles: Role[] = [
    { name: "Volunteer", permissions: ["genesis.member.view"] },
    {
      name: "MinistryAdmin",
      permissions: ["genesis.member.edit", "platform.rbac.manage"],
      inherits: ["Volunteer"],
    },
    { name: "SelfReferential", permissions: ["a"], inherits: ["SelfReferential"] },
  ];
  const catalog = buildCatalog(roles);

  it("includes inherited permissions", () => {
    const perms = resolvePermissions(["MinistryAdmin"], catalog);
    expect(perms.has("genesis.member.edit")).toBe(true);
    expect(perms.has("genesis.member.view")).toBe(true); // inherited from Volunteer
  });

  it("is safe against inheritance cycles", () => {
    const perms = resolvePermissions(["SelfReferential"], catalog);
    expect(perms.has("a")).toBe(true);
  });

  it("ignores unknown roles (fails safe, never open)", () => {
    const perms = resolvePermissions(["DoesNotExist"], catalog);
    expect(perms.size).toBe(0);
  });
});

describe("AuthorizationService.can — deny by default", () => {
  const authz = new AuthorizationService();

  it("denies an action when the permission is absent", () => {
    const ctx = context({ permissions: new Set() });
    const decision = authz.can(ctx, "stewardship.fund.view");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("missing_permission");
  });

  it("allows an action when the permission is present", () => {
    const ctx = context({ permissions: new Set(["stewardship.fund.view"]) });
    expect(authz.can(ctx, "stewardship.fund.view").allowed).toBe(true);
  });
});

describe("AuthorizationService.can — ABAC scope conditions", () => {
  // "A nurse may administer medication only for a camp they are staffed on" (doc 03 §1).
  const staffedOnCamp: AbacCondition = (ctx, resource) => {
    const staffed = (ctx as unknown as { staffedCampIds?: string[] }).staffedCampIds ?? [];
    return staffed.includes(String(resource.attributes?.["campId"]));
  };
  const authz = new AuthorizationService({
    conditions: { "campmed.medication.administer": [staffedOnCamp] },
  });

  it("permits the action only on in-scope resources", () => {
    const ctx = {
      ...context({ permissions: new Set(["campmed.medication.administer"]) }),
      staffedCampIds: ["camp-1"],
    } as unknown as SecurityContext;

    expect(
      authz.can(ctx, "campmed.medication.administer", {
        type: "medication",
        attributes: { campId: "camp-1" },
      }).allowed,
    ).toBe(true);

    const denied = authz.can(ctx, "campmed.medication.administer", {
      type: "medication",
      attributes: { campId: "camp-2" },
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("abac_condition_failed");
  });
});

describe("AuthorizationService — step-up / MFA", () => {
  const authz = new AuthorizationService({
    stepUpRequired: new Set(["stewardship.payout.edit"]),
  });

  it("requires an MFA-satisfied session for sensitive permissions", () => {
    const ctx = context({ permissions: new Set(["stewardship.payout.edit"]), mfaSatisfied: false });
    const decision = authz.can(ctx, "stewardship.payout.edit");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("step_up_required");
  });
});

describe("AuthorizationService.assert — fail closed", () => {
  const authz = new AuthorizationService();

  it("throws ForbiddenError when not permitted", () => {
    const ctx = context({ permissions: new Set() });
    expect(() => authz.assert(ctx, "genesis.member.export")).toThrow(ForbiddenError);
  });

  it("does not throw when permitted", () => {
    const ctx = context({ permissions: new Set(["genesis.member.export"]) });
    expect(() => authz.assert(ctx, "genesis.member.export")).not.toThrow();
  });
});
