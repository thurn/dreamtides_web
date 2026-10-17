// The D97 snapshot contract: a folded run's snapshot round-trips through its
// encoding to exactly the fold state it was taken from; a journey game has no
// snapshot; foreign, newer or unmigratable saves do not decode; and the golden
// schema-version-1 save loads under the current migrations.

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerD97ContentProvider } from "../../rules/d97/d97-content";
import { genesisFoldState } from "../../rules/fold-state";
import { GENESIS } from "../../rules/reducer-fixtures";
import { parseIntentKey } from "../../types/identifiers";
import { D97_SAVE_MIGRATIONS } from "./migrations";
import { foldSyntheticRun, registerSaveContent, SAVE_GENESIS } from "./save.fixtures";
import {
  D97_SAVE_FORMAT,
  D97_SAVE_SCHEMA_VERSION,
  decodeSnapshot,
  encodeSnapshot,
  snapshotFoldState,
  takeSnapshot,
  type D97SaveBuild,
} from "./snapshot";

const BUILD = { reducerVersion: "test", gitRevision: "unknown" } as D97SaveBuild;

beforeEach(registerSaveContent);
afterEach(() => registerD97ContentProvider(null));

describe("D97 snapshots", () => {
  it("round-trip a folded run to the identical fold state", () => {
    const { state, seq } = foldSyntheticRun();
    const keys = [[parseIntentKey("save-key"), 2] as const];
    const snapshot = takeSnapshot(state, seq, keys, BUILD);
    expect(snapshot).not.toBeNull();
    const decoded = decodeSnapshot(encodeSnapshot(snapshot!), D97_SAVE_MIGRATIONS);
    expect(decoded?.migratedFrom).toBeNull();
    expect(decoded?.snapshot.seq).toBe(seq);
    expect(decoded?.snapshot.intentKeys).toEqual(keys);
    expect(snapshotFoldState(SAVE_GENESIS, decoded!.snapshot)).toEqual(state);
  });

  it("are absent for a journey game", () => {
    expect(takeSnapshot(genesisFoldState(GENESIS), 0, [], BUILD)).toBeNull();
  });

  it("reject foreign, malformed and newer saves", () => {
    const { state, seq } = foldSyntheticRun();
    const raw = JSON.parse(encodeSnapshot(takeSnapshot(state, seq, [], BUILD)!)) as Record<string, unknown>;
    expect(decodeSnapshot("not json", D97_SAVE_MIGRATIONS)).toBeNull();
    expect(decodeSnapshot(JSON.stringify({ ...raw, format: "other" }), D97_SAVE_MIGRATIONS)).toBeNull();
    expect(decodeSnapshot(JSON.stringify({ ...raw, schemaVersion: D97_SAVE_SCHEMA_VERSION + 1 }), D97_SAVE_MIGRATIONS)).toBeNull();
    expect(decodeSnapshot(JSON.stringify({ ...raw, d97: null }), D97_SAVE_MIGRATIONS)).toBeNull();
  });

  it("load the golden schema-version-1 save", () => {
    const raw = readFileSync(new URL("./fixtures/d97-save-v1.json", import.meta.url), "utf8");
    const decoded = decodeSnapshot(raw, D97_SAVE_MIGRATIONS);
    expect(decoded).not.toBeNull();
    expect(decoded!.snapshot.format).toBe(D97_SAVE_FORMAT);
    expect(decoded!.snapshot.schemaVersion).toBe(D97_SAVE_SCHEMA_VERSION);
    const restored = snapshotFoldState(SAVE_GENESIS, decoded!.snapshot);
    expect(restored.d97?.run?.collection.copies.length).toBeGreaterThan(0);
  });
});
