import type { IncomingMessage, ServerResponse } from "node:http";
import { ValidationError } from "@ft/core";
import type { ApiResponse, HttpMethod, PlatformRequest } from "@ft/api";

/**
 * The HTTP transport adapter (doc 01, doc 08).
 *
 * WHY this is thin and separate: the kernel (@ft/api) owns all the security guarantees and operates on
 * normalized {@link PlatformRequest}/{@link ApiResponse} values. This file only translates real Node
 * HTTP to/from those values. Because it holds no security logic, the web framework is a replaceable
 * detail — swapping Node's http for Fastify or NestJS means rewriting only this adapter, not the
 * pipeline. That is the whole point of keeping the kernel transport-agnostic.
 */

const KNOWN_METHODS: ReadonlySet<string> = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/**
 * Security headers applied to every response (doc 11 §3). The API returns only JSON, so the CSP is
 * maximally restrictive and responses are never cached.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "cache-control": "no-store",
};

/** Read the full request body as a Buffer, enforcing a maximum size (basic abuse protection). */
export async function readBody(req: IncomingMessage, maxBytes = 1_000_000): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      throw new ValidationError("Request body too large.");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/**
 * Build a normalized PlatformRequest from a Node request + already-read body. Throws ValidationError
 * on malformed JSON so the kernel maps it to a clean 400 (doc 08/12).
 */
export function toPlatformRequest(req: IncomingMessage, body: Buffer): PlatformRequest {
  const url = new URL(req.url ?? "/", "http://localhost");
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    headers[name.toLowerCase()] = Array.isArray(value) ? value.join(",") : value;
  }

  const query: Record<string, string | string[]> = {};
  for (const key of url.searchParams.keys()) {
    const all = url.searchParams.getAll(key);
    query[key] = all.length > 1 ? all : all[0]!;
  }

  const method = (req.method ?? "GET").toUpperCase();
  const request: PlatformRequest = {
    method: (KNOWN_METHODS.has(method) ? method : "GET") as HttpMethod,
    path: url.pathname,
    headers,
    query,
    body: parseBody(headers["content-type"], body),
    ...(headers["x-request-id"] === undefined ? {} : { requestId: headers["x-request-id"] }),
    ...(req.socket.remoteAddress === undefined ? {} : { ip: req.socket.remoteAddress }),
  };
  return request;
}

/** Write an ApiResponse to the Node response, merging in the security headers. */
export function writeApiResponse(res: ServerResponse, response: ApiResponse): void {
  const headers: Record<string, string> = { ...SECURITY_HEADERS, ...(response.headers ?? {}) };

  let payload: string | undefined;
  if (response.body !== undefined) {
    payload = typeof response.body === "string" ? response.body : JSON.stringify(response.body);
    if (headers["content-type"] === undefined) {
      headers["content-type"] = "application/json; charset=utf-8";
    }
  }

  res.writeHead(response.status, headers);
  res.end(payload);
}

function parseBody(contentType: string | undefined, body: Buffer): unknown {
  if (body.length === 0) {
    return undefined;
  }
  if (contentType && contentType.includes("application/json")) {
    try {
      return JSON.parse(body.toString("utf8"));
    } catch {
      throw new ValidationError("Request body is not valid JSON.");
    }
  }
  return body.toString("utf8");
}
