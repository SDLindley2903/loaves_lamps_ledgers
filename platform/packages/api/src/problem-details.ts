import { PlatformError, type ErrorCategory } from "@ft/core";
import type { ApiResponse } from "./http.js";

/**
 * RFC 9457 "problem details" error mapping (doc 08 §2, doc 12 §5).
 *
 * WHY one consistent error shape across every product: clients (including the Flutter apps) can handle
 * errors programmatically against a stable machine `code`, and every error carries a `requestId` that
 * ties the user's report to the exact server-side logs/trace/audit. WHY nothing sensitive is exposed:
 * responses never leak stack traces, SQL, or internal identifiers — full detail stays server-side keyed
 * by requestId. Unknown/unexpected errors always become a generic 500 so an internal failure cannot
 * disclose implementation details.
 */
const STATUS_BY_CATEGORY: Record<ErrorCategory, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  dependency: 503,
  internal: 500,
};

const TITLE_BY_STATUS: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

const PROBLEM_CONTENT_TYPE = "application/problem+json";

export function mapErrorToResponse(error: unknown, requestId: string): ApiResponse {
  if (error instanceof PlatformError) {
    const status = STATUS_BY_CATEGORY[error.category];
    return {
      status,
      headers: { "content-type": PROBLEM_CONTENT_TYPE },
      body: {
        type: `https://faithtrail.dev/problems/${error.code}`,
        title: TITLE_BY_STATUS[status] ?? "Error",
        status,
        code: error.code,
        detail: error.message,
        retryable: error.retryable,
        requestId,
      },
    };
  }

  // Unknown error: never leak internals. Detail is intentionally generic.
  return {
    status: 500,
    headers: { "content-type": PROBLEM_CONTENT_TYPE },
    body: {
      type: "about:blank",
      title: TITLE_BY_STATUS[500],
      status: 500,
      code: "internal.error",
      detail: "An unexpected error occurred.",
      retryable: false,
      requestId,
    },
  };
}
