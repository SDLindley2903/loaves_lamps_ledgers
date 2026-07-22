import { ForbiddenError, type SecurityContext } from "@ft/core";

/**
 * The authorization decision engine (doc 03).
 *
 * WHY a single `can()` seam: every authorization decision in the platform flows through this one
 * function. That keeps the decision deny-by-default and deterministic, makes denials loggable in one
 * place (doc 06), and — crucially — means the *model* (RBAC + ABAC today) can be replaced by a
 * Zanzibar-style ReBAC backend later WITHOUT changing any product code (ADR-0005). Product code asks
 * "can this context do this action on this resource?"; it never inspects roles directly.
 *
 * WHY RBAC + ABAC (not pure RBAC): pure RBAC forces role explosion to express scoping
 * ("NurseForCampA", "NurseForCampB", ...). An ABAC condition ("only for a camp you are staffed on")
 * keeps the role count small while still expressing real-world constraints (doc 03 §1).
 */

/** The thing being acted upon. `attributes` feed ABAC conditions (e.g. its campId, ownerId). */
export interface Resource {
  readonly type: string;
  readonly id?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/**
 * An ABAC condition: given the caller and the resource, may this specific instance be acted on?
 * Conditions refine a permission grant; they are only consulted once the RBAC permission is present.
 */
export type AbacCondition = (ctx: SecurityContext, resource: Resource) => boolean;

export interface Decision {
  readonly allowed: boolean;
  /** Machine-readable explanation, so "why was I denied?" is always answerable (doc 03 §7). */
  readonly reason: "granted" | "missing_permission" | "abac_condition_failed" | "step_up_required";
}

export interface AuthorizationPolicy {
  /**
   * ABAC conditions keyed by permission. If a permission has conditions, ALL must pass for the
   * specific resource instance. A permission with no entry here is scoped by RBAC + tenancy alone.
   */
  readonly conditions?: Readonly<Record<string, readonly AbacCondition[]>>;
  /**
   * Permissions that require a step-up / MFA-satisfied session regardless of session age (doc 02/03):
   * PHI export, RBAC edits, banking changes, destructive admin actions.
   */
  readonly stepUpRequired?: ReadonlySet<string>;
}

const ALLOW: Decision = { allowed: true, reason: "granted" };

export class AuthorizationService {
  constructor(private readonly policy: AuthorizationPolicy = {}) {}

  /**
   * Deny-by-default decision. Returns a structured Decision; callers that want the fail-closed throw
   * semantics use {@link AuthorizationService.assert}.
   *
   * Note: tenant isolation is enforced separately and structurally (doc 04, `@ft/tenancy` + RLS).
   * This function assumes the resource is already within the caller's tenant; it decides *permission*,
   * not *tenancy*. The two controls are independent layers of defense in depth.
   */
  can(ctx: SecurityContext, permission: string, resource?: Resource): Decision {
    // 1. RBAC: the permission must be present in the caller's effective set.
    if (!ctx.permissions.has(permission)) {
      return { allowed: false, reason: "missing_permission" };
    }

    // 2. Step-up: sensitive permissions require an MFA-satisfied session (doc 02).
    if (this.policy.stepUpRequired?.has(permission) && !ctx.mfaSatisfied) {
      return { allowed: false, reason: "step_up_required" };
    }

    // 3. ABAC: every configured condition for this permission must pass for THIS resource.
    const conditions = this.policy.conditions?.[permission];
    if (conditions && conditions.length > 0) {
      const target: Resource = resource ?? { type: "unknown" };
      for (const condition of conditions) {
        if (!condition(ctx, target)) {
          return { allowed: false, reason: "abac_condition_failed" };
        }
      }
    }

    return ALLOW;
  }

  /**
   * Fail-closed variant: throws {@link ForbiddenError} unless the action is allowed. This is what
   * product handlers and the request guard use, so a missing or failed check stops the operation
   * rather than letting it proceed (doc 03 fail-closed).
   */
  assert(ctx: SecurityContext, permission: string, resource?: Resource): void {
    const decision = this.can(ctx, permission, resource);
    if (!decision.allowed) {
      throw new ForbiddenError(undefined, decision.reason);
    }
  }
}
