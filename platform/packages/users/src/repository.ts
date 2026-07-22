import { normalizeEmail, type Membership, type User } from "./model.js";

/**
 * User & membership persistence (doc 05).
 *
 * WHY users are a PLATFORM table, not tenant-scoped: a user is a global identity that may belong to
 * several tenants, so unlike product data (doc 04) the users table is not behind per-tenant RLS. Access
 * to it is guarded at the application/service layer instead. Memberships are the join that carries
 * tenant scope and roles.
 */
export interface UsersRepository {
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  save(user: User): Promise<void>;
  addMembership(membership: Membership): Promise<void>;
  membershipsForUser(userId: string): Promise<readonly Membership[]>;
  membership(userId: string, tenantId: string): Promise<Membership | undefined>;
}

export class InMemoryUsersRepository implements UsersRepository {
  private readonly usersById = new Map<string, User>();
  private readonly userIdByEmail = new Map<string, string>();
  private readonly memberships: Membership[] = [];

  findByEmail(email: string): Promise<User | undefined> {
    const id = this.userIdByEmail.get(normalizeEmail(email));
    return Promise.resolve(id ? this.usersById.get(id) : undefined);
  }

  findById(id: string): Promise<User | undefined> {
    return Promise.resolve(this.usersById.get(id));
  }

  save(user: User): Promise<void> {
    this.usersById.set(user.id, user);
    this.userIdByEmail.set(user.email, user.id);
    return Promise.resolve();
  }

  addMembership(membership: Membership): Promise<void> {
    const existing = this.memberships.findIndex(
      (m) => m.userId === membership.userId && m.tenantId === membership.tenantId,
    );
    if (existing >= 0) {
      this.memberships[existing] = membership;
    } else {
      this.memberships.push(membership);
    }
    return Promise.resolve();
  }

  membershipsForUser(userId: string): Promise<readonly Membership[]> {
    return Promise.resolve(this.memberships.filter((m) => m.userId === userId));
  }

  membership(userId: string, tenantId: string): Promise<Membership | undefined> {
    return Promise.resolve(
      this.memberships.find((m) => m.userId === userId && m.tenantId === tenantId),
    );
  }
}
