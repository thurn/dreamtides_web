// The migration runner over a fixture migration: a version-0 save renames a
// field on its way to version 1; a save already current passes unchanged; a
// save newer than the target, or with a missing step, does not migrate.

import { describe, expect, it } from "vitest";
import { migrateSnapshot, type D97SaveMigration } from "./migrate";

const RENAME_PURSE: D97SaveMigration = {
  from: 0,
  migrate: ({ purse, ...rest }) => ({ ...rest, essence: purse }),
};

describe("migrateSnapshot", () => {
  it("runs each step from the save's version to the target", () => {
    const migrated = migrateSnapshot({ schemaVersion: 0, purse: 40 }, [RENAME_PURSE], 1);
    expect(migrated).toEqual({ value: { schemaVersion: 1, essence: 40 }, from: 0 });
  });

  it("passes a current save through unchanged", () => {
    expect(migrateSnapshot({ schemaVersion: 1, essence: 40 }, [RENAME_PURSE], 1)).toEqual({ value: { schemaVersion: 1, essence: 40 }, from: 1 });
  });

  it("refuses newer saves, missing steps and missing versions", () => {
    expect(migrateSnapshot({ schemaVersion: 2 }, [RENAME_PURSE], 1)).toBeNull();
    expect(migrateSnapshot({ schemaVersion: 0 }, [], 1)).toBeNull();
    expect(migrateSnapshot({}, [RENAME_PURSE], 1)).toBeNull();
  });
});
