// The D97 save migration runner (decision P5): ordered pure functions, each
// taking a snapshot from one schema version to the next, applied in turn
// until the snapshot reaches the current version.

/** One migration: a snapshot of schema version `from` to `from + 1`. */
export interface D97SaveMigration {
  readonly from: number;
  readonly migrate: (snapshot: Readonly<Record<string, unknown>>) => Record<string, unknown>;
}

/**
 * Migrate `snapshot` to `target`, or null when its version is missing, newer
 * than `target`, or has no migration on the way.
 */
export function migrateSnapshot(
  snapshot: Readonly<Record<string, unknown>>,
  migrations: readonly D97SaveMigration[],
  target: number,
): { readonly value: Record<string, unknown>; readonly from: number } | null {
  const from = snapshot.schemaVersion;
  if (typeof from !== "number" || !Number.isInteger(from) || from > target) return null;
  let value: Record<string, unknown> = { ...snapshot };
  for (let version = from; version < target; version += 1) {
    const step = migrations.find((migration) => migration.from === version);
    if (step === undefined) return null;
    value = { ...step.migrate(value), schemaVersion: version + 1 };
  }
  return { value, from };
}
