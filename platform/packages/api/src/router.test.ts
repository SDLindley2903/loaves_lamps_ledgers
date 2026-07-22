import { describe, expect, it } from "vitest";
import { Router, ok, type Route } from "./index.js";

const noop: Route = {
  method: "GET",
  path: "/health",
  authorization: { kind: "public", reason: "liveness probe" },
  handler: () => ok({ status: "up" }),
};

describe("router", () => {
  it("matches static paths for the right method only", () => {
    const router = new Router().register(noop);
    expect(router.match("GET", "/health")).toBeDefined();
    expect(router.match("POST", "/health")).toBeUndefined();
    expect(router.match("GET", "/nope")).toBeUndefined();
  });

  it("extracts path params and url-decodes them", () => {
    const router = new Router().register({
      method: "GET",
      path: "/genesis/members/:id",
      authorization: { kind: "permission", permission: "genesis.member.view" },
      handler: () => ok(),
    });
    const match = router.match("GET", "/genesis/members/abc%20123");
    expect(match?.params["id"]).toBe("abc 123");
  });

  it("respects registration order (first match wins)", () => {
    const router = new Router()
      .register({
        method: "GET",
        path: "/genesis/members/export",
        authorization: { kind: "permission", permission: "genesis.member.export" },
        handler: () => ok({ which: "export" }),
      })
      .register({
        method: "GET",
        path: "/genesis/members/:id",
        authorization: { kind: "permission", permission: "genesis.member.view" },
        handler: () => ok({ which: "byId" }),
      });
    const match = router.match("GET", "/genesis/members/export");
    expect((match?.route.authorization as { permission: string }).permission).toBe(
      "genesis.member.export",
    );
  });
});
