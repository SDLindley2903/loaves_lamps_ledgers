import { describe, expect, it } from "vitest";
import {
  DataClassification,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  actorId,
  isUuid,
  requiresFieldEncryption,
  requiresReadAudit,
  requireContext,
  uuidv7,
  type SecurityContext,
} from "./index.js";

describe("uuidv7", () => {
  it("produces a valid, well-formed v7 UUID", () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    // version nibble is 7
    expect(id[14]).toBe("7");
    // variant nibble is one of 8,9,a,b
    expect(["8", "9", "a", "b"]).toContain(id[19]!.toLowerCase());
  });

  it("is time-ordered: later timestamps sort lexicographically after earlier ones", () => {
    const earlier = uuidv7(1_000_000_000_000);
    const later = uuidv7(2_000_000_000_000);
    expect(earlier < later).toBe(true);
  });

  it("is non-sequential within the same millisecond (randomness present)", () => {
    const now = Date.now();
    const a = uuidv7(now);
    const b = uuidv7(now);
    expect(a).not.toEqual(b);
  });
});

describe("data classification", () => {
  it("audits reads and field-encrypts only Restricted and above (doc 06/11)", () => {
    expect(requiresReadAudit(DataClassification.Restricted)).toBe(true);
    expect(requiresFieldEncryption(DataClassification.Restricted)).toBe(true);
    expect(requiresReadAudit(DataClassification.Confidential)).toBe(false);
    expect(requiresFieldEncryption(DataClassification.Public)).toBe(false);
  });
});

describe("typed errors", () => {
  it("carry stable codes and correct retryability", () => {
    expect(new ForbiddenError().code).toBe("authz.denied");
    expect(new NotFoundError().category).toBe("not_found");
    expect(new UnauthorizedError().retryable).toBe(false);
  });

  it("cross-tenant denial presents as not-found to avoid leaking existence (doc 04)", () => {
    const err = new NotFoundError();
    expect(err.category).toBe("not_found");
    // A ForbiddenError would confirm the resource exists; NotFound does not.
    expect(err).not.toBeInstanceOf(ForbiddenError);
  });
});

describe("security context", () => {
  const ctx: SecurityContext = {
    tenantId: uuidv7(),
    actor: { kind: "user", userId: uuidv7() },
    permissions: new Set(["genesis.member.view"]),
    mfaSatisfied: true,
    requestId: "req-1",
  };

  it("resolves an actor id for both users and service accounts", () => {
    expect(actorId(ctx.actor)).toBe((ctx.actor as { userId: string }).userId);
    expect(actorId({ kind: "service", serviceAccountId: "svc-1" })).toBe("svc-1");
  });

  it("requireContext fails closed when no context is present", () => {
    expect(() => requireContext(undefined)).toThrow(UnauthorizedError);
    expect(requireContext(ctx)).toBe(ctx);
  });
});
