import { SignJWT, exportJWK, generateKeyPair, jwtVerify, type JWK, type KeyLike } from "jose";
import { UnauthorizedError } from "@ft/core";

/**
 * Access token service (doc 02 §3).
 *
 * WHY short-lived, asymmetrically-signed, STATELESS access tokens: they are verified by signature at
 * the API gateway with no per-request database lookup, which is what lets the app tier scale
 * horizontally (doc 01 §5). Asymmetric signing (EdDSA/Ed25519) means verifiers hold only the PUBLIC
 * key — a compromised verifier cannot mint tokens. The ≤15-minute TTL bounds the blast radius of a
 * leaked token; hard revocation is provided separately by server-side sessions (see sessions.ts), the
 * deliberate counterweight to statelessness.
 *
 * WHY EdDSA over RS256: smaller keys/signatures, faster, and no footguns around key size or padding.
 */
export interface AccessTokenClaims {
  /** Subject: user id (or service account id). */
  readonly sub: string;
  /** Tenant id the token is scoped to. */
  readonly tid: string;
  /** Server-side session id, for correlation and revocation checks. */
  readonly sid: string;
  /** Role names granted in this tenant (permissions are resolved from these). */
  readonly roles: readonly string[];
  /** Authentication methods satisfied, e.g. ["pwd"] or ["pwd","mfa"] (doc 02). */
  readonly amr: readonly string[];
}

export interface TokenServiceConfig {
  readonly issuer: string;
  readonly audience: string;
  /** Access-token lifetime in seconds. Must be short (doc 02 §3). Default 900 (15 min). */
  readonly accessTtlSeconds?: number;
}

export class TokenService {
  private constructor(
    private readonly privateKey: KeyLike,
    private readonly publicKey: KeyLike,
    private readonly config: Required<TokenServiceConfig>,
    private readonly kid: string,
  ) {}

  /** Create a service with a freshly generated Ed25519 key pair. */
  static async create(config: TokenServiceConfig): Promise<TokenService> {
    const { publicKey, privateKey } = await generateKeyPair("EdDSA", { extractable: true });
    return new TokenService(privateKey, publicKey, withDefaults(config), "ed25519-1");
  }

  async issueAccessToken(claims: AccessTokenClaims): Promise<string> {
    // TTL guard: refuse to mint a token that lives longer than the policy allows.
    if (this.config.accessTtlSeconds > 900) {
      throw new Error("Access-token TTL exceeds the 15-minute policy maximum (doc 02 §3).");
    }
    return new SignJWT({
      tid: claims.tid,
      sid: claims.sid,
      roles: claims.roles,
      amr: claims.amr,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: this.kid, typ: "JWT" })
      .setSubject(claims.sub)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTtlSeconds}s`)
      .sign(this.privateKey);
  }

  /**
   * Verify signature, issuer, audience, and expiry. Throws UnauthorizedError on any failure — a bad or
   * expired token results in denial, never in a partially-trusted context (fail closed).
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ["EdDSA"],
      });
      return {
        sub: String(payload.sub),
        tid: String(payload["tid"]),
        sid: String(payload["sid"]),
        roles: (payload["roles"] as string[] | undefined) ?? [],
        amr: (payload["amr"] as string[] | undefined) ?? [],
      };
    } catch {
      throw new UnauthorizedError("Invalid or expired access token.");
    }
  }

  /** Public JWKS for gateway/verifier distribution (doc 02 §7, cached JWKS survives IdP blips). */
  async publicJwks(): Promise<{ keys: JWK[] }> {
    const jwk = await exportJWK(this.publicKey);
    return { keys: [{ ...jwk, kid: this.kid, use: "sig", alg: "EdDSA" }] };
  }
}

function withDefaults(config: TokenServiceConfig): Required<TokenServiceConfig> {
  return { accessTtlSeconds: 900, ...config };
}
