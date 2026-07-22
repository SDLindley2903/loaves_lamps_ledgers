import { UnauthorizedError } from "./errors.js";

/**
 * The SecurityContext (doc 01 §4, docs 02/03/04).
 *
 * WHY this shape: the shared request pipeline resolves every caller into exactly this object BEFORE
 * any product code runs. Product code never parses tokens or decides tenancy itself — it receives an
 * already-authenticated, already-tenant-scoped context. Isolation, authorization, and audit
 * attribution all read from here, which is how those guarantees become structural rather than the
 * product developer's responsibility to remember.
 *
 * `actor` is a discriminated union so a human user and a machine identity (doc 05 §5) are both
 * representable and always attributable — automated actions never lose the "who did what" chain.
 */
export type Actor =
  | { readonly kind: "user"; readonly userId: string }
  | { readonly kind: "service"; readonly serviceAccountId: string };

export interface SecurityContext {
  /** The tenant every operation in this request is scoped to (doc 04). */
  readonly tenantId: string;
  readonly actor: Actor;
  /** Effective permission strings for this actor within this tenant (doc 03). */
  readonly permissions: ReadonlySet<string>;
  /** Server-side session id, enabling hard revocation (doc 02). Absent for service accounts. */
  readonly sessionId?: string;
  /** Whether MFA was satisfied for this session (doc 02) — gates step-up-required actions. */
  readonly mfaSatisfied: boolean;
  /** Correlation id shared across logs, traces, audit, and the API error response (doc 12). */
  readonly requestId: string;
  /** Client network address, for audit and risk signals (docs 02/06). */
  readonly ip?: string;
}

/** Stable string identifying the actor for audit records (doc 06). */
export function actorId(actor: Actor): string {
  return actor.kind === "user" ? actor.userId : actor.serviceAccountId;
}

/**
 * Guard used at the start of protected operations. Fails closed with UnauthorizedError if a context
 * is missing — a code path that forgets to establish a context denies rather than runs unscoped.
 */
export function requireContext(ctx: SecurityContext | undefined | null): SecurityContext {
  if (!ctx) {
    throw new UnauthorizedError();
  }
  return ctx;
}
