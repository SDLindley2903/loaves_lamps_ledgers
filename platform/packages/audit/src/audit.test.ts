import { describe, expect, it } from "vitest";
import { uuidv7 } from "@ft/core";
import { InMemoryAuditLog, type AuditEvent, type AuditInput } from "./index.js";

function input(overrides: Partial<AuditInput> & { tenantId: string }): AuditInput {
  return {
    actor: { kind: "user", id: uuidv7() },
    action: "campmed.medication.administer",
    resource: { type: "medication", id: uuidv7() },
    outcome: "success",
    ...overrides,
  };
}

describe("append-only audit log", () => {
  it("appends events into a per-tenant chain with monotonic sequence", async () => {
    const log = new InMemoryAuditLog();
    const tenantId = uuidv7();

    const a = await log.append(input({ tenantId }));
    const b = await log.append(input({ tenantId }));

    expect(a.sequence).toBe(0);
    expect(b.sequence).toBe(1);
    expect(b.prevHash).toBe(a.hash);
  });

  it("keeps tenant chains isolated from one another (doc 04/06)", async () => {
    const log = new InMemoryAuditLog();
    const t1 = uuidv7();
    const t2 = uuidv7();

    await log.append(input({ tenantId: t1 }));
    await log.append(input({ tenantId: t2 }));

    expect((await log.list(t1)).length).toBe(1);
    expect((await log.list(t2)).length).toBe(1);
    // Each tenant's first event starts its own chain from genesis.
    expect((await log.list(t1))[0]!.sequence).toBe(0);
    expect((await log.list(t2))[0]!.sequence).toBe(0);
  });
});

describe("tamper-evidence (doc 06 §3)", () => {
  it("verifies an untouched chain", async () => {
    const log = new InMemoryAuditLog();
    const tenantId = uuidv7();
    for (let i = 0; i < 5; i++) {
      await log.append(input({ tenantId }));
    }
    const result = await log.verify(tenantId);
    expect(result).toEqual({ ok: true, count: 5 });
  });

  it("detects an altered historical event", async () => {
    const log = new InMemoryAuditLog();
    const tenantId = uuidv7();
    for (let i = 0; i < 5; i++) {
      await log.append(input({ tenantId }));
    }

    // Tamper: reach past the append-only API into stored state and mutate a middle event's action,
    // simulating a malicious DBA editing the row directly.
    const events = (await log.list(tenantId)) as AuditEvent[];
    const stored = (log as unknown as { chains: Map<string, AuditEvent[]> }).chains.get(tenantId)!;
    stored[2] = { ...events[2]!, action: "campmed.medication.tampered" };

    const result = await log.verify(tenantId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.brokenAtSequence).toBe(2);
    }
  });

  it("detects a deleted event (chain break / resequencing)", async () => {
    const log = new InMemoryAuditLog();
    const tenantId = uuidv7();
    for (let i = 0; i < 5; i++) {
      await log.append(input({ tenantId }));
    }

    const stored = (log as unknown as { chains: Map<string, AuditEvent[]> }).chains.get(tenantId)!;
    stored.splice(2, 1); // remove the event at sequence 2

    const result = await log.verify(tenantId);
    expect(result.ok).toBe(false);
  });
});
