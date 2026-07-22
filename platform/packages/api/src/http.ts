import type { Resource } from "@ft/authorization";
import type { SecurityContext } from "@ft/core";

/**
 * Transport-agnostic HTTP types for the API kernel (doc 08).
 *
 * WHY transport-agnostic: the platform's guarantees — authentication, tenant scoping, authorization,
 * and audit on every request (doc 01 §4) — must not depend on which web framework we mount. The kernel
 * operates on these normalized types; a thin adapter (NestJS/Fastify in production) translates real
 * HTTP to/from them. That keeps the security-critical pipeline fully unit-testable and lets the
 * framework be a replaceable detail rather than the home of our security posture.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface PlatformRequest {
  readonly method: HttpMethod;
  readonly path: string;
  /** Header names MUST be lowercased by the adapter. */
  readonly headers: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | string[]>>;
  readonly body?: unknown;
  readonly ip?: string;
  /** Correlation id; the kernel generates one if absent (doc 12). */
  readonly requestId?: string;
}

export interface ApiResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/** Context passed to a handler on an authenticated, tenant-scoped route. */
export interface ProtectedContext {
  readonly request: PlatformRequest;
  readonly security: SecurityContext;
  readonly params: Readonly<Record<string, string>>;
}

/** Context passed to a handler on an explicitly public route (no security context). */
export interface PublicContext {
  readonly request: PlatformRequest;
  readonly params: Readonly<Record<string, string>>;
}

export type ProtectedHandler = (ctx: ProtectedContext) => Promise<ApiResponse> | ApiResponse;
export type PublicHandler = (ctx: PublicContext) => Promise<ApiResponse> | ApiResponse;

/**
 * How a route is authorized. This is a REQUIRED, discriminated field on every route, so there is no
 * way to define a route without deciding its authorization — a route that "forgot" to declare authz
 * is not representable, which is how fail-closed becomes structural (doc 03/08).
 */
export type RouteAuthorization =
  | { readonly kind: "public"; readonly reason: string }
  /**
   * Requires a valid, non-revoked session but no specific permission — for self-service account
   * routes (manage your own MFA, refresh, logout) that any authenticated user may call for themselves
   * (doc 02/05). Tenant scoping and audit still apply; only the permission check is skipped.
   */
  | { readonly kind: "authenticated" }
  | {
      readonly kind: "permission";
      readonly permission: string;
      /** Optionally derive the ABAC target resource from the request (doc 03). */
      readonly resource?: (ctx: ProtectedContext) => Resource;
    };

export interface AuditSpec {
  /** Stable action name recorded in the audit trail, e.g. "genesis.member.create" (doc 06). */
  readonly action: string;
  readonly resourceType: string;
}

export interface PublicRoute {
  readonly method: HttpMethod;
  readonly path: string;
  readonly authorization: { readonly kind: "public"; readonly reason: string };
  readonly handler: PublicHandler;
}

export interface ProtectedRoute {
  readonly method: HttpMethod;
  readonly path: string;
  readonly authorization: Exclude<RouteAuthorization, { kind: "public" }>;
  /** When present, the kernel records an audit event for this route (doc 06). */
  readonly audit?: AuditSpec;
  readonly handler: ProtectedHandler;
}

export type Route = PublicRoute | ProtectedRoute;

/**
 * Type guard so the kernel can narrow a matched route to its public/protected variant. The
 * authorization discriminant is nested under `authorization.kind`, so we expose an explicit guard
 * rather than relying on structural narrowing.
 */
export function isPublicRoute(route: Route): route is PublicRoute {
  return route.authorization.kind === "public";
}

/** Convenience response builders. */
export function ok(body?: unknown, status = 200): ApiResponse {
  return { status, body };
}

export function created(body?: unknown): ApiResponse {
  return { status: 201, body };
}

export function noContent(): ApiResponse {
  return { status: 204 };
}
