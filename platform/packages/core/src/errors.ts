/**
 * Typed platform errors (doc 12 §5).
 *
 * WHY typed errors instead of strings: callers and the API boundary can handle errors
 * programmatically — decide retryability, map to an HTTP status and an RFC 9457 problem-details
 * response (doc 08), and increment the right metric (doc 12). A string message is unhandleable and
 * unstable. Every error carries a STABLE machine `code`, a `category`, and whether it is `retryable`.
 *
 * WHY fail-closed: security-relevant ambiguity resolves to denial, never to a guess. `Forbidden` and
 * `Unauthorized` are first-class so the platform's deny-by-default posture (doc 03) is expressed in
 * the type system, not left to convention.
 */
export type ErrorCategory =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "dependency"
  | "internal";

export interface PlatformErrorOptions {
  /** Stable machine-readable code, e.g. "authz.denied". Safe to expose to clients. */
  readonly code: string;
  readonly category: ErrorCategory;
  /** Human-safe message. MUST NOT contain secrets, PHI/PII, SQL, or internal identifiers (doc 12). */
  readonly message: string;
  readonly retryable?: boolean;
  /** Non-exposed structured detail for logs/traces, keyed off the request id (doc 12). */
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export class PlatformError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly detail?: Readonly<Record<string, unknown>>;

  constructor(options: PlatformErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.category = options.category;
    this.retryable = options.retryable ?? false;
    if (options.detail !== undefined) {
      this.detail = options.detail;
    }
  }
}

/** Input failed validation at a boundary (doc 08). Not retryable — the request itself is wrong. */
export class ValidationError extends PlatformError {
  constructor(message: string, detail?: Readonly<Record<string, unknown>>) {
    super({
      code: "validation.failed",
      category: "validation",
      message,
      retryable: false,
      ...(detail === undefined ? {} : { detail }),
    });
  }
}

/** Caller is not authenticated (doc 02). */
export class UnauthorizedError extends PlatformError {
  constructor(message = "Authentication required.") {
    super({ code: "auth.unauthenticated", category: "unauthorized", message, retryable: false });
  }
}

/** Caller is authenticated but not permitted (doc 03). The deny-by-default outcome. */
export class ForbiddenError extends PlatformError {
  constructor(message = "You do not have permission to perform this action.", reason?: string) {
    super({
      code: "authz.denied",
      category: "forbidden",
      message,
      retryable: false,
      ...(reason === undefined ? {} : { detail: { reason } }),
    });
  }
}

/**
 * Resource does not exist OR is not visible to this caller.
 *
 * WHY collapse "not found" and "forbidden cross-tenant" into the same 404-shaped error: revealing
 * "this exists but you can't see it" leaks the existence of another tenant's data (doc 04). Cross-
 * tenant denials therefore present as not-found, never as forbidden.
 */
export class NotFoundError extends PlatformError {
  constructor(message = "Resource not found.") {
    super({ code: "resource.not_found", category: "not_found", message, retryable: false });
  }
}

/** A conflicting state (e.g. duplicate, version mismatch). */
export class ConflictError extends PlatformError {
  constructor(message = "The request conflicts with the current state.") {
    super({ code: "resource.conflict", category: "conflict", message, retryable: false });
  }
}
