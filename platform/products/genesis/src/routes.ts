import { created, ok, type ProtectedContext, type Route } from "@ft/api";
import { NotFoundError, ValidationError } from "@ft/core";
import type { CreateMemberInput } from "./member.js";
import type { MembersRepository } from "./members-repository.js";

/**
 * Genesis HTTP routes (doc 08). These are thin: they declare their required permission and audit
 * action, validate input at the boundary, and delegate to the repository. Authentication, tenant
 * scoping, authorization, audit, and error mapping are all handled by the kernel (doc 01 §4) — the
 * product code here is only the domain-specific part.
 */
export function genesisRoutes(members: MembersRepository): Route[] {
  return [
    {
      method: "POST",
      path: "/genesis/members",
      authorization: { kind: "permission", permission: "genesis.member.create" },
      audit: { action: "genesis.member.create", resourceType: "member" },
      handler: async ({ request }: ProtectedContext) => {
        const input = parseCreateMemberInput(request.body);
        return created(await members.create(input));
      },
    },
    {
      method: "GET",
      path: "/genesis/members",
      authorization: { kind: "permission", permission: "genesis.member.view" },
      handler: async () => ok(await members.list()),
    },
    {
      method: "GET",
      path: "/genesis/members/:id",
      authorization: { kind: "permission", permission: "genesis.member.view" },
      handler: async ({ params }: ProtectedContext) => {
        const member = await members.getById(params["id"]!);
        if (!member) {
          // RLS + repository return nothing for another tenant's id; this surfaces as 404, never
          // revealing whether the record exists elsewhere (doc 04).
          throw new NotFoundError();
        }
        return ok(member);
      },
    },
  ];
}

/** Boundary validation (doc 08 §3): reject malformed input before any business logic runs. */
export function parseCreateMemberInput(body: unknown): CreateMemberInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Request body must be a JSON object.");
  }
  const record = body as Record<string, unknown>;
  const name = record["name"];
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new ValidationError("A non-empty 'name' is required.", { field: "name" });
  }
  if (name.length > 200) {
    throw new ValidationError("'name' must be at most 200 characters.", { field: "name" });
  }
  const email = record["email"];
  if (email !== undefined && email !== null) {
    if (typeof email !== "string" || !isPlausibleEmail(email)) {
      throw new ValidationError("'email' must be a valid email address.", { field: "email" });
    }
    return { name: name.trim(), email };
  }
  return { name: name.trim() };
}

function isPlausibleEmail(value: string): boolean {
  // Deliberately permissive: verify deliverability out of band, don't over-reject valid addresses.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}
