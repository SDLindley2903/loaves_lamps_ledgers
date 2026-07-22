import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { QueryExecutor } from "./database.js";

/**
 * Minimal forward-only migration runner (doc 07 §3, doc 13).
 *
 * WHY forward-only + recorded: migrations are versioned, applied in order, and never re-run. A
 * `schema_migrations` ledger records what has been applied so re-running the runner is a no-op. This
 * is deliberately small; a production system may adopt a dedicated tool, but the contract (ordered,
 * idempotent, recorded) is what matters and is preserved here.
 */
export interface Migration {
  readonly id: string;
  readonly sql: string;
}

export async function loadMigration(id: string, filePath: string): Promise<Migration> {
  return { id, sql: await readFile(filePath, "utf8") };
}

/** Convenience: derive the migration id from the file name (e.g. "0001_members.sql" -> "0001_members"). */
export async function loadMigrationFile(filePath: string): Promise<Migration> {
  return loadMigration(basename(filePath).replace(/\.sql$/, ""), filePath);
}

export async function runMigrations(
  exec: QueryExecutor,
  migrations: readonly Migration[],
): Promise<string[]> {
  await exec.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const applied: string[] = [];
  for (const migration of migrations) {
    const existing = await exec.query<{ id: string }>(
      "SELECT id FROM schema_migrations WHERE id = $1",
      [migration.id],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      continue; // already applied
    }
    // Each migration's SQL may contain multiple statements; pg runs them as one simple query.
    await exec.query(migration.sql);
    await exec.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
    applied.push(migration.id);
  }
  return applied;
}
