import { describe, expect, it } from "vitest";
import { UnauthorizedError, uuidv7 } from "@ft/core";
import { InMemorySessionStore } from "./index.js";

function newSession(store: InMemorySessionStore) {
  return store.create({ userId: uuidv7(), tenantId: uuidv7(), mfaSatisfied: true });
}

describe("sessions & refresh-token rotation (doc 02 §3)", () => {
  it("creates an active session with a refresh token", () => {
    const store = new InMemorySessionStore();
    const { session, refreshToken } = newSession(store);
    expect(store.isActive(session.id)).toBe(true);
    expect(refreshToken).toMatch(/^[A-Za-z0-9_-]+$/); // opaque base64url, not a JWT
  });

  it("rotates the refresh token: the old one stops working, the new one works", () => {
    const store = new InMemorySessionStore();
    const { refreshToken: first } = newSession(store);

    const rotated = store.rotate(first);
    expect(rotated.refreshToken).not.toEqual(first);

    // The rotated (new) token can itself be rotated again.
    expect(() => store.rotate(rotated.refreshToken)).not.toThrow();
  });

  it("detects reuse of a rotated-out token and revokes the whole session (theft response)", () => {
    const store = new InMemorySessionStore();
    const { session, refreshToken: first } = newSession(store);

    store.rotate(first); // `first` is now retired

    // An attacker replays the stolen, already-rotated token.
    expect(() => store.rotate(first)).toThrow(UnauthorizedError);
    // The session is revoked as a result, protecting the legitimate user too.
    expect(store.isActive(session.id)).toBe(false);
  });

  it("rejects an unknown refresh token", () => {
    const store = new InMemorySessionStore();
    expect(() => store.rotate("totally-made-up-token")).toThrow(UnauthorizedError);
  });

  it("supports hard revocation and sign-out-everywhere", () => {
    const store = new InMemorySessionStore();
    const userId = uuidv7();
    const tenantId = uuidv7();
    store.create({ userId, tenantId, mfaSatisfied: true });
    const b = store.create({ userId, tenantId, mfaSatisfied: false });
    store.create({ userId: uuidv7(), tenantId, mfaSatisfied: true }); // a different user

    const revoked = store.revokeAllForUser(userId);
    expect(revoked).toBe(2);
    expect(store.isActive(b.session.id)).toBe(false);
  });

  it("refuses to rotate a revoked session's token", () => {
    const store = new InMemorySessionStore();
    const { session, refreshToken } = newSession(store);
    store.revoke(session.id);
    expect(() => store.rotate(refreshToken)).toThrow(UnauthorizedError);
  });
});
