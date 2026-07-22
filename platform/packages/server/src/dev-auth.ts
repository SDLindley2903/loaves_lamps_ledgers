import { ok, type ProtectedContext, type PublicContext, type Route } from "@ft/api";
import { uuidv7 } from "@ft/core";
import type { SessionStore, TokenService } from "@ft/identity";

/**
 * DEV-ONLY token minting (doc 02 — placeholder until the real login flow lands).
 *
 * WHY this exists and why it is gated: the real identity endpoints (password + MFA login, refresh) are
 * the next increment. To make the server usable for local testing NOW, this route issues a session and
 * access token for an arbitrary tenant/roles. It is registered ONLY when devAuth is enabled and must
 * never be enabled in a real environment — it is the one place that bypasses authentication, by design,
 * for local development. Marked loudly so it cannot be mistaken for production auth.
 */
export interface DevAuthDeps {
  readonly tokens: TokenService;
  readonly sessions: SessionStore;
  /** In DB mode, ensure the tenant row exists so member inserts satisfy the FK (doc 04 lifecycle). */
  readonly ensureTenant?: (tenantId: string) => Promise<void>;
}

interface DevLoginBody {
  tenantId?: string;
  userId?: string;
  roles?: string[];
  mfa?: boolean;
}

export function devAuthRoute(deps: DevAuthDeps): Route {
  return {
    method: "POST",
    path: "/dev/login",
    authorization: {
      kind: "public",
      reason: "DEV ONLY: mints a token for local testing; never enable in production",
    },
    handler: async (ctx: PublicContext | ProtectedContext) => {
      const body = (ctx.request.body ?? {}) as DevLoginBody;
      const tenantId = body.tenantId ?? uuidv7();
      const userId = body.userId ?? uuidv7();
      const roles = body.roles ?? ["Genesis.Admin"];
      const mfa = body.mfa ?? true;

      if (deps.ensureTenant) {
        await deps.ensureTenant(tenantId);
      }

      const issued = deps.sessions.create({ userId, tenantId, mfaSatisfied: mfa });
      const accessToken = await deps.tokens.issueAccessToken({
        sub: userId,
        tid: tenantId,
        sid: issued.session.id,
        roles,
        amr: mfa ? ["pwd", "mfa"] : ["pwd"],
      });

      return ok({
        note: "DEV token — do not use in production.",
        accessToken,
        refreshToken: issued.refreshToken,
        tokenType: "Bearer",
        tenantId,
        userId,
        sessionId: issued.session.id,
        roles,
      });
    },
  };
}
