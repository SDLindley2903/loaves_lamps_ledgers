import type { Role } from "@ft/authorization";

/**
 * Genesis domain: a member of a congregation (doc 05).
 *
 * `Member` carries `tenantId` because every tenant-owned entity does (doc 04). `email` is nullable and
 * classified Confidential/PII (doc 07 §4), so downstream controls (audit, export) treat it accordingly.
 */
export interface Member {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly email: string | null;
  readonly createdAt: string;
}

export interface CreateMemberInput {
  readonly name: string;
  readonly email?: string;
}

/**
 * Genesis default roles (doc 03). Ministries use these as-is or derive custom roles from the
 * permission catalog. Permissions are product-scoped verbs; holding a Genesis role grants nothing in
 * other products (doc 03 §2).
 */
export const GENESIS_ROLES: readonly Role[] = [
  { name: "Genesis.Viewer", permissions: ["genesis.member.view"] },
  {
    name: "Genesis.Editor",
    permissions: ["genesis.member.create", "genesis.member.edit"],
    inherits: ["Genesis.Viewer"],
  },
  {
    name: "Genesis.Admin",
    permissions: ["genesis.member.delete", "genesis.member.export"],
    inherits: ["Genesis.Editor"],
  },
];
