import { describe, expect, it } from "vitest";
import { InMemoryIdempotencyStore, idempotencyScopeKey, ok } from "./index.js";

describe("idempotency store", () => {
  it("stores and replays a response by scoped key", () => {
    const store = new InMemoryIdempotencyStore();
    const key = idempotencyScopeKey("tenant-1", "POST", "/x", "abc");
    expect(store.get(key)).toBeUndefined();
    store.set(key, ok({ done: true }));
    expect(store.get(key)).toEqual(ok({ done: true }));
  });

  it("scopes keys by tenant so identical client keys never collide across tenants", () => {
    const a = idempotencyScopeKey("tenant-A", "POST", "/x", "same-key");
    const b = idempotencyScopeKey("tenant-B", "POST", "/x", "same-key");
    expect(a).not.toEqual(b);
  });

  it("scopes keys by method and path so a key cannot satisfy a different operation", () => {
    const post = idempotencyScopeKey("tenant-A", "POST", "/x", "k");
    const put = idempotencyScopeKey("tenant-A", "PUT", "/x", "k");
    const otherPath = idempotencyScopeKey("tenant-A", "POST", "/y", "k");
    expect(new Set([post, put, otherPath]).size).toBe(3);
  });
});
