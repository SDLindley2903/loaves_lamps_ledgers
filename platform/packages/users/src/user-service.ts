import { ConflictError, UnauthorizedError, ValidationError, uuidv7 } from "@ft/core";
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  totpProvisioningUri,
  verifyTotp,
  generateTotpSecret,
  type PasswordHasher,
  type PasswordPolicy,
} from "@ft/identity";
import { normalizeEmail, type Membership, type User } from "./model.js";
import type { UsersRepository } from "./repository.js";

/**
 * Account, credential, and MFA lifecycle (doc 02, doc 05).
 *
 * Orchestrates the identity primitives (hashing, policy, TOTP, recovery codes) over the user store. It
 * never returns secrets except the one-time values a user must see (recovery codes, TOTP secret at
 * enrollment). Credential verification is uniform to avoid leaking which accounts exist.
 */
export interface RegistrationInput {
  readonly email: string;
  readonly password: string;
}

export interface TotpEnrollmentStart {
  readonly secret: string;
  readonly provisioningUri: string;
}

export class UserService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly policy: PasswordPolicy,
    private readonly issuer: string,
  ) {}

  /** Create a new active user. Rejects duplicate emails and policy-violating passwords (doc 02 §4). */
  async register(input: RegistrationInput): Promise<User> {
    const email = normalizeEmail(input.email);
    if (!isPlausibleEmail(email)) {
      throw new ValidationError("A valid email is required.", { field: "email" });
    }
    await this.policy.assert(input.password);
    if (await this.repo.findByEmail(email)) {
      throw new ConflictError("An account with that email already exists.");
    }
    const user: User = {
      id: uuidv7(),
      email,
      passwordHash: await this.hasher.hash(input.password),
      status: "active",
      createdAt: new Date().toISOString(),
    };
    await this.repo.save(user);
    return user;
  }

  async createMembership(
    userId: string,
    tenantId: string,
    roleNames: string[],
  ): Promise<Membership> {
    const membership: Membership = { userId, tenantId, roleNames };
    await this.repo.addMembership(membership);
    return membership;
  }

  membershipsForUser(userId: string): Promise<readonly Membership[]> {
    return this.repo.membershipsForUser(userId);
  }

  membership(userId: string, tenantId: string): Promise<Membership | undefined> {
    return this.repo.membership(userId, tenantId);
  }

  /**
   * Verify email + password. Returns the user on success, or undefined on any failure — the caller
   * responds identically for "no such user" and "wrong password" so account existence never leaks.
   * Transparently upgrades the stored hash if parameters have strengthened (doc 02 §4).
   */
  async verifyCredentials(email: string, password: string): Promise<User | undefined> {
    const user = await this.repo.findByEmail(email);
    if (!user || user.status !== "active") {
      // Still perform a hash to keep timing roughly uniform against user enumeration.
      await this.hasher.hash(password).catch(() => undefined);
      return undefined;
    }
    if (!(await this.hasher.verify(password, user.passwordHash))) {
      return undefined;
    }
    if (this.hasher.needsRehash(user.passwordHash)) {
      await this.repo.save({ ...user, passwordHash: await this.hasher.hash(password) });
    }
    return user;
  }

  hasMfa(user: User): boolean {
    return user.mfa !== undefined;
  }

  /** Begin TOTP enrollment: generate a secret, store it as pending, return it + a provisioning URI. */
  async beginTotpEnrollment(userId: string): Promise<TotpEnrollmentStart> {
    const user = await this.requireUser(userId);
    const secret = generateTotpSecret();
    await this.repo.save({ ...user, pendingTotpSecret: secret });
    return {
      secret,
      provisioningUri: totpProvisioningUri(secret, { issuer: this.issuer, account: user.email }),
    };
  }

  /**
   * Confirm enrollment by verifying a code against the pending secret. On success, activates MFA and
   * returns the one-time recovery codes (shown to the user exactly once).
   */
  async confirmTotpEnrollment(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.requireUser(userId);
    if (!user.pendingTotpSecret) {
      throw new ValidationError("No enrollment in progress.");
    }
    if (!verifyTotp(user.pendingTotpSecret, code)) {
      throw new UnauthorizedError("Incorrect verification code.");
    }
    const recovery = await generateRecoveryCodes(this.hasher);
    const { pendingTotpSecret, ...rest } = user;
    void pendingTotpSecret;
    await this.repo.save({
      ...rest,
      mfa: {
        totpSecret: user.pendingTotpSecret,
        recoveryHashes: recovery.hashes,
        enrolledAt: new Date().toISOString(),
      },
    });
    return { recoveryCodes: [...recovery.plaintext] };
  }

  /**
   * Verify an MFA response during login: a TOTP code, or (fallback) a one-time recovery code which is
   * consumed on use. Returns whether it succeeded.
   */
  async verifyMfa(userId: string, code: string): Promise<boolean> {
    const user = await this.requireUser(userId);
    if (!user.mfa) {
      return false;
    }
    if (verifyTotp(user.mfa.totpSecret, code)) {
      return true;
    }
    const remaining = await consumeRecoveryCode(code, user.mfa.recoveryHashes, this.hasher);
    if (remaining) {
      await this.repo.save({ ...user, mfa: { ...user.mfa, recoveryHashes: remaining } });
      return true;
    }
    return false;
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new UnauthorizedError();
    }
    return user;
  }
}

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}
