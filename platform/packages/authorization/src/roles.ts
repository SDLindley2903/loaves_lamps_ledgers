/**
 * Roles and permissions (doc 03).
 *
 * WHY RBAC as the backbone: it maps to how ministries actually think ("nurses", "treasurers",
 * "volunteers"), it is the model SOC 2 / HIPAA auditors expect, and it makes least-privilege
 * administrable at human scale. Permissions are fine-grained verbs on resources
 * ("campmed.medication.administer"); roles are named bundles of them; role inheritance avoids
 * duplicating a base role's permissions into every role that extends it.
 */
export type Permission = string;

export interface Role {
  readonly name: string;
  readonly permissions: readonly Permission[];
  /** Names of roles whose permissions this role also includes (doc 03). */
  readonly inherits?: readonly string[];
}

/**
 * Resolve the full permission set for a set of assigned roles, following inheritance.
 *
 * Cycle-safe (a role that transitively inherits itself terminates). Unknown inherited role names are
 * ignored rather than throwing, so a partially-migrated role catalog fails safe (fewer permissions),
 * never open.
 */
export function resolvePermissions(
  assignedRoleNames: readonly string[],
  catalog: ReadonlyMap<string, Role>,
): Set<Permission> {
  const out = new Set<Permission>();
  const visited = new Set<string>();

  const visit = (name: string): void => {
    if (visited.has(name)) {
      return;
    }
    visited.add(name);
    const role = catalog.get(name);
    if (!role) {
      return; // unknown role -> contributes nothing (fail safe)
    }
    for (const p of role.permissions) {
      out.add(p);
    }
    for (const parent of role.inherits ?? []) {
      visit(parent);
    }
  };

  for (const name of assignedRoleNames) {
    visit(name);
  }
  return out;
}

export function buildCatalog(roles: readonly Role[]): Map<string, Role> {
  const map = new Map<string, Role>();
  for (const role of roles) {
    map.set(role.name, role);
  }
  return map;
}
