import {
  created,
  noContent,
  ok,
  type ProtectedContext,
  type PublicContext,
  type Route,
} from "@ft/api";
import type { AuditLog } from "@ft/audit";
import {
  UnauthorizedError,
  ValidationError,
  actorId,
  uuidv7,
  type SecurityContext,
} from "@ft/core";
import type { SessionStore, TokenService } from "@ft/identity";
import type { UserService } from "@ft/users";

/**
 * Real authentication endpoints (doc 02, doc 05) — the flow that replaces the DEV token shortcut:
 *
 *   POST /auth/register           create an account + a new organization (self-service signup)
 *   POST /auth/login              email + password -> tokens, or an MFA challenge if MFA is enrolled
 *   POST /auth/mfa/verify         complete an MFA challenge with a TOTP or recovery code -> tokens
 *   POST /auth/refresh            rotate a refresh token -> a fresh access token (doc 02 §3)
 *   POST /auth/logout             revoke the current session (hard revocation)
 *   POST /auth/mfa/enroll         (authenticated) begin TOTP enrollment -> secret + otpauth URI
 *   POST /auth/mfa/enroll/confirm (authenticated) confirm a code -> one-time recovery codes
 *
 * Login is intentionally uniform on failure (same response for unknown user and wrong password) so
 * account existence is never revealed. Successful auth events are written to the immutable audit trail.
 */
export interface AuthDeps {
  readonly userService: UserService;
  readonly tokens: TokenService;
  readonly sessions: SessionStore;
  readonly audit: AuditLog;
  /** In DB mode, provision the tenant row on registration so product FKs resolve (doc 04 lifecycle). */
  readonly ensureTenant?: (tenantId: string, name?: string) => Promise<void>;
}

/** Short-lived pending-MFA state between /auth/login and /auth/mfa/verify. */
interface Challenge {
  readonly userId: string;
  readonly tenantId: string;
  readonly roleNames: string[];
  readonly expiresAt: number;
}

class ChallengeStore {
  private readonly byId = new Map<string, Challenge>();
  constructor(private readonly ttlMs = 5 * 60 * 1000) {}

  create(data: Omit<Challenge, "expiresAt">): string {
    const id = uuidv7();
    this.byId.set(id, { ...data, expiresAt: Date.now() + this.ttlMs });
    return id;
  }
  peek(id: string): Challenge | undefined {
    const c = this.byId.get(id);
    if (!c) {
      return undefined;
    }
    if (c.expiresAt < Date.now()) {
      this.byId.delete(id);
      return undefined;
    }
    return c;
  }
  consume(id: string): void {
    this.byId.delete(id);
  }
}

export function authRoutes(deps: AuthDeps): Route[] {
  const challenges = new ChallengeStore();

  async function issueTokens(
    userId: string,
    tenantId: string,
    roleNames: string[],
    mfaSatisfied: boolean,
    ip: string | undefined,
  ) {
    const issued = deps.sessions.create({ userId, tenantId, mfaSatisfied });
    const accessToken = await deps.tokens.issueAccessToken({
      sub: userId,
      tid: tenantId,
      sid: issued.session.id,
      roles: roleNames,
      amr: mfaSatisfied ? ["pwd", "mfa"] : ["pwd"],
    });
    await deps.audit.append({
      tenantId,
      actor: { kind: "user", id: userId },
      action: "auth.login.success",
      resource: { type: "session", id: issued.session.id },
      outcome: "success",
      ...(ip === undefined ? {} : { ip }),
      metadata: { mfaSatisfied },
    });
    return ok({
      accessToken,
      refreshToken: issued.refreshToken,
      tokenType: "Bearer",
      tenantId,
      userId,
      roles: roleNames,
    });
  }

  return [
    {
      method: "POST",
      path: "/auth/register",
      authorization: { kind: "public", reason: "self-service account + organization creation" },
      handler: async ({ request }: PublicContext) => {
        const body = asObject(request.body);
        const email = requireString(body, "email");
        const password = requireString(body, "password");
        const organizationName = requireString(body, "organizationName");

        const user = await deps.userService.register({ email, password });
        const tenantId = uuidv7();
        if (deps.ensureTenant) {
          await deps.ensureTenant(tenantId, organizationName);
        }
        // The first user of a new organization is its administrator (doc 03/05).
        await deps.userService.createMembership(user.id, tenantId, ["Genesis.Admin"]);
        return created({ userId: user.id, tenantId });
      },
    },
    {
      method: "POST",
      path: "/auth/login",
      authorization: { kind: "public", reason: "password authentication" },
      handler: async ({ request }: PublicContext) => {
        const body = asObject(request.body);
        const email = requireString(body, "email");
        const password = requireString(body, "password");
        const requestedTenant = optionalString(body, "tenantId");

        const user = await deps.userService.verifyCredentials(email, password);
        if (!user) {
          throw new UnauthorizedError("Invalid email or password.");
        }
        const memberships = await deps.userService.membershipsForUser(user.id);
        if (memberships.length === 0) {
          throw new UnauthorizedError("This account has no organization access.");
        }
        const membership = requestedTenant
          ? memberships.find((m) => m.tenantId === requestedTenant)
          : memberships.length === 1
            ? memberships[0]
            : undefined;
        if (!membership) {
          // The user belongs to several organizations and must choose one. Returning their own
          // membership list is not a leak — it is the caller's own data.
          throw new ValidationError("Select an organization to sign in to.", {
            tenantIds: memberships.map((m) => m.tenantId),
          });
        }

        const roleNames = [...membership.roleNames];
        if (deps.userService.hasMfa(user)) {
          const challengeId = challenges.create({
            userId: user.id,
            tenantId: membership.tenantId,
            roleNames,
          });
          return ok({ mfaRequired: true, challengeId });
        }
        return issueTokens(user.id, membership.tenantId, roleNames, false, request.ip);
      },
    },
    {
      method: "POST",
      path: "/auth/mfa/verify",
      authorization: { kind: "public", reason: "second factor verification for a pending login" },
      handler: async ({ request }: PublicContext) => {
        const body = asObject(request.body);
        const challengeId = requireString(body, "challengeId");
        const code = requireString(body, "code");

        const challenge = challenges.peek(challengeId);
        if (!challenge) {
          throw new UnauthorizedError("Challenge expired or invalid; please sign in again.");
        }
        if (!(await deps.userService.verifyMfa(challenge.userId, code))) {
          throw new UnauthorizedError("Incorrect verification code.");
        }
        challenges.consume(challengeId);
        return issueTokens(
          challenge.userId,
          challenge.tenantId,
          challenge.roleNames,
          true,
          request.ip,
        );
      },
    },
    {
      method: "POST",
      path: "/auth/refresh",
      authorization: { kind: "public", reason: "refresh-token rotation" },
      handler: async ({ request }: PublicContext) => {
        const body = asObject(request.body);
        const refreshToken = requireString(body, "refreshToken");

        const issued = deps.sessions.rotate(refreshToken); // throws Unauthorized on invalid/reuse
        const membership = await deps.userService.membership(
          issued.session.userId,
          issued.session.tenantId,
        );
        const roleNames = membership ? [...membership.roleNames] : [];
        const accessToken = await deps.tokens.issueAccessToken({
          sub: issued.session.userId,
          tid: issued.session.tenantId,
          sid: issued.session.id,
          roles: roleNames,
          amr: issued.session.mfaSatisfied ? ["pwd", "mfa"] : ["pwd"],
        });
        return ok({ accessToken, refreshToken: issued.refreshToken, tokenType: "Bearer" });
      },
    },
    {
      method: "POST",
      path: "/auth/logout",
      authorization: { kind: "authenticated" },
      audit: { action: "auth.logout", resourceType: "session" },
      handler: ({ security }: ProtectedContext) => {
        if (security.sessionId) {
          deps.sessions.revoke(security.sessionId);
        }
        return noContent();
      },
    },
    {
      method: "POST",
      path: "/auth/mfa/enroll",
      authorization: { kind: "authenticated" },
      handler: async ({ security }: ProtectedContext) => {
        const start = await deps.userService.beginTotpEnrollment(userIdOf(security));
        return ok({ secret: start.secret, provisioningUri: start.provisioningUri });
      },
    },
    {
      method: "POST",
      path: "/auth/mfa/enroll/confirm",
      authorization: { kind: "authenticated" },
      audit: { action: "auth.mfa.enrolled", resourceType: "user" },
      handler: async ({ request, security }: ProtectedContext) => {
        const code = requireString(asObject(request.body), "code");
        const result = await deps.userService.confirmTotpEnrollment(userIdOf(security), code);
        return ok({ recoveryCodes: result.recoveryCodes });
      },
    },
  ];
}

function userIdOf(security: SecurityContext): string {
  if (security.actor.kind !== "user") {
    throw new UnauthorizedError("Only user accounts can manage MFA.");
  }
  return actorId(security.actor);
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`'${field}' is required.`, { field });
  }
  return value;
}

function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ValidationError(`'${field}' must be a string.`, { field });
  }
  return value;
}
