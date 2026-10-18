// Version 4 to 5: a version-4 run, saved before act assembly, migrates with no
// acts and every other field kept; a save without a run passes through. The
// committed version-4 golden (and, through the chain, version 1's) migrates
// and parses as version 5.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateSnapshot } from "../migrate";
import { parseSnapshotV5 } from "../schema-v5";
import { D97_SAVE_MIGRATIONS } from ".";
import { V4_TO_V5 } from "./v4-to-v5";

const RUN = { dreamId: "d0000000-0000-4000-8000-000000000001", essence: 12, bags: { stage: 1, drawn: {} } };

describe("V4_TO_V5", () => {
  it("gives a version-4 run no acts and keeps every other field", () => {
    const migrated = V4_TO_V5.migrate({ format: "dreamtides-97-save", schemaVersion: 4, d97: { screen: { type: "overworld" }, run: RUN } });
    expect(migrated).toEqual({ format: "dreamtides-97-save", schemaVersion: 4, d97: { screen: { type: "overworld" }, run: { ...RUN, acts: [] } } });
  });

  it("passes a save without a run through", () => {
    const save = { format: "dreamtides-97-save", schemaVersion: 4, d97: { screen: { type: "avatarSelect" }, run: null } };
    expect(V4_TO_V5.migrate(save)).toEqual(save);
  });

  it.each(["../fixtures/d97-save-v4.json", "../fixtures/d97-save-v1.json"])("migrates %s to a version-5 save with no acts", (path) => {
    const raw = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Record<string, unknown>;
    const migrated = migrateSnapshot(raw, D97_SAVE_MIGRATIONS, 5);
    const parsed = parseSnapshotV5(migrated?.value);
    expect(parsed?.schemaVersion).toBe(5);
    expect(parsed?.d97.run?.acts).toEqual([]);
  });
});
