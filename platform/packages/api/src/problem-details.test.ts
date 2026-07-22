import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@ft/core";
import { mapErrorToResponse } from "./index.js";

describe("problem-details mapping (RFC 9457)", () => {
  it("maps platform errors to the right status and a stable code", () => {
    expect(mapErrorToResponse(new ForbiddenError(), "req-1").status).toBe(403);
    expect(mapErrorToResponse(new NotFoundError(), "req-1").status).toBe(404);
    const v = mapErrorToResponse(new ValidationError("bad"), "req-1");
    expect(v.status).toBe(400);
    expect((v.body as { code: string }).code).toBe("validation.failed");
    expect(v.headers?.["content-type"]).toBe("application/problem+json");
  });

  it("carries the requestId for correlation", () => {
    const res = mapErrorToResponse(new NotFoundError(), "req-abc");
    expect((res.body as { requestId: string }).requestId).toBe("req-abc");
  });

  it("never leaks internals for unexpected errors (generic 500)", () => {
    const res = mapErrorToResponse(new Error("SELECT * FROM secrets WHERE ..."), "req-2");
    expect(res.status).toBe(500);
    const body = res.body as { code: string; detail: string };
    expect(body.code).toBe("internal.error");
    expect(body.detail).toBe("An unexpected error occurred.");
    expect(JSON.stringify(res.body)).not.toContain("SELECT");
  });
});
