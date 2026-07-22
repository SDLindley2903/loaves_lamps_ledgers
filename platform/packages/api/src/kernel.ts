import { AuthorizationService, type Resource } from "@ft/authorization";
import type { AuditLog, AuditInput } from "@ft/audit";
import { NotFoundError, UnauthorizedError, actorId, uuidv7, type SecurityContext } from "@ft/core";
import type { AccessTokenClaims } from "@ft/identity";
import { runInContextScope } from "@ft/tenancy";
import {
  isPublicRoute,
  type ApiResponse,
  type HttpMethod,
  type PlatformRequest,
  type ProtectedContext,
} from "./http.js";
import { mapErrorToResponse } from "./problem-details.js";
import { Router } from "./router.js";
import {
  InMemoryIdempotencyStore,
  idempotencyScopeKey,
  type IdempotencyStore,
} from "./idempotency.js";

/**
 * The API kernel: the ONE request path every product shares (doc 01 §4, doc 08).
 *
 * The pipeline, in fixed order, so isolation/authorization/audit are never a product developer's
 * responsibility to remember:
 *   1. correlation id      — every request gets a requestId (doc 12)
 *   2. route match         — unknown route -> 404 (fails closed)
 *   3. public short-circuit — only for routes EXPLICITLY declared public (doc 08)
 *   4. authentication      — verify the access token's signature/expiry (doc 02)
 *   5. session check       — reject tokens whose server-side session was revoked (doc 02 hard revoke)
 *   6. context assembly    — resolve roles -> permissions, build the SecurityContext (doc 03)
 *   7. idempotency replay  — for unsafe methods carrying an Idempotency-Key (doc 08)
 *   8. authorization       — deny-by-default permission (+ optional ABAC/step-up) check (doc 03)
 *   9. tenant scope + run  — execute the handler inside the tenant scope so RLS/app scoping apply (doc 04)
 *  10. audit               — record the action's outcome immutably when the route declares it (doc 06)
 *  11. error mapping       — any thrown PlatformError becomes an RFC 9457 problem (doc 08/12)
 */
export interface TokenVerifier {
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
}

export interface SessionChecker {
  isActive(sessionId: string): boolean;
}

export interface PlatformKernelDeps {
  readonly router: Router;
  readonly tokenVerifier: TokenVerifier;
  readonly sessions: SessionChecker;
  readonly authorization: AuthorizationService;
  readonly audit: AuditLog;
  /** Resolve a token's role names into the effective permission set (doc 03). */
  readonly resolvePermissions: (roleNames: readonly string[]) => Set<string>;
  readonly idempotency?: IdempotencyStore;
}

const UNSAFE_METHODS: ReadonlySet<HttpMethod> = new Set(["POST", "PUT", "PATCH"]);

export class PlatformKernel {
  private readonly idempotency: IdempotencyStore;

  constructor(private readonly deps: PlatformKernelDeps) {
    this.idempotency = deps.idempotency ?? new InMemoryIdempotencyStore();
  }

  async handle(request: PlatformRequest): Promise<ApiResponse> {
    const requestId = request.requestId ?? uuidv7();
    try {
      return await this.route({ ...request, requestId });
    } catch (error) {
      return mapErrorToResponse(error, requestId);
    }
  }

  private async route(request: PlatformRequest): Promise<ApiResponse> {
    const requestId = request.requestId!;
    const match = this.deps.router.match(request.method, request.path);
    if (!match) {
      // Unknown route -> not found. Fails closed: no route, no access.
      throw new NotFoundError();
    }
    const { route, params } = match;

    // 3. Public routes are the only ones that skip authentication, and only because they said so.
    if (isPublicRoute(route)) {
      return route.handler({ request, params });
    }

    // 4-5. Authenticate and confirm the session is still active (hard revocation).
    const claims = await this.authenticate(request);
    if (!this.deps.sessions.isActive(claims.sid)) {
      throw new UnauthorizedError("Session is no longer active.");
    }

    // 6. Assemble the SecurityContext once; product code never re-derives any of this.
    const security: SecurityContext = {
      tenantId: claims.tid,
      actor: { kind: "user", userId: claims.sub },
      permissions: this.deps.resolvePermissions(claims.roles),
      sessionId: claims.sid,
      mfaSatisfied: claims.amr.includes("mfa"),
      requestId,
      ...(request.ip === undefined ? {} : { ip: request.ip }),
    };

    const ctx: ProtectedContext = { request, security, params };

    // 7. Idempotency replay (before doing any work) for unsafe methods with a key.
    const idemKey = request.headers["idempotency-key"];
    const scopedKey =
      idemKey && UNSAFE_METHODS.has(request.method)
        ? idempotencyScopeKey(security.tenantId, request.method, request.path, idemKey)
        : undefined;
    if (scopedKey) {
      const replay = this.idempotency.get(scopedKey);
      if (replay) {
        return replay;
      }
    }

    // 8. Authorization: deny-by-default permission (+ optional ABAC/step-up).
    const resource: Resource | undefined = route.authorization.resource?.(ctx);
    try {
      this.deps.authorization.assert(security, route.authorization.permission, resource);
    } catch (denial) {
      await this.recordAudit(route.audit, security, request, "denied", resource, denial);
      throw denial;
    }

    // 9. Run the handler inside the tenant scope so DB (RLS) and app-layer scoping apply (doc 04).
    let response: ApiResponse;
    try {
      response = await runInContextScope(security, () => route.handler(ctx));
    } catch (error) {
      await this.recordAudit(route.audit, security, request, "error", resource, error);
      throw error;
    }

    // 10. Audit the successful action when the route declares one.
    await this.recordAudit(route.audit, security, request, "success", resource);

    // 7 (cont.) store idempotent result for future retries.
    if (scopedKey) {
      this.idempotency.set(scopedKey, response);
    }
    return response;
  }

  private async authenticate(request: PlatformRequest): Promise<AccessTokenClaims> {
    const header = request.headers["authorization"];
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing bearer token.");
    }
    return this.deps.tokenVerifier.verifyAccessToken(header.slice("Bearer ".length));
  }

  private async recordAudit(
    spec: { action: string; resourceType: string } | undefined,
    security: SecurityContext,
    request: PlatformRequest,
    outcome: "success" | "denied" | "error",
    resource: Resource | undefined,
    cause?: unknown,
  ): Promise<void> {
    if (!spec) {
      return;
    }
    const input: AuditInput = {
      tenantId: security.tenantId,
      actor: { kind: security.actor.kind, id: actorId(security.actor) },
      action: spec.action,
      resource: {
        type: spec.resourceType,
        ...(resource?.id === undefined ? {} : { id: resource.id }),
      },
      outcome,
      requestId: security.requestId,
      ...(security.ip === undefined ? {} : { ip: security.ip }),
      ...(outcome !== "success" && cause instanceof Error ? { reason: cause.message } : {}),
    };
    await this.deps.audit.append(input);
  }
}
