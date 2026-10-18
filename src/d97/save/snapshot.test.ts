// The D97 snapshot contract: a folded run's snapshot round-trips through its
// encoding to exactly the fold state it was taken from; a journey game has no
// snapshot; foreign, newer or unmigratable saves do not decode; the golden
// schema-version-1 save is frozen: its committed bytes never change and they
// decode under the current migrations, version 1 to 2 dropping encounters'
// head starts (shown on the exported milestone save, whose encounters carry
// them) and version 2 to 3 placing the last place on its dream's own map;
// and the golden save of the current version has exactly the
// shape a run folded today writes (so a change to the persisted shape must
// bump the schema version and ship a migration, P5), re-encoding to its own
// JSON through the live phase union, which refuses a screen and run that
// disagree.

import { createHash } from "node:crypto";
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

beforeEach(() => registerSaveContent());
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

  it("reject a save whose screen and run disagree", () => {
    const { state, seq } = foldSyntheticRun();
    const raw = JSON.parse(encodeSnapshot(takeSnapshot(state, seq, [], BUILD)!)) as { d97: { run: unknown } };
    const withScreen = (type: string, run: unknown) => JSON.stringify({ ...raw, d97: { screen: { type }, run } });
    expect(decodeSnapshot(withScreen("overworld", raw.d97.run), D97_SAVE_MIGRATIONS)).not.toBeNull();
    expect(decodeSnapshot(withScreen("avatarSelect", null), D97_SAVE_MIGRATIONS)).not.toBeNull();
    expect(decodeSnapshot(withScreen("avatarSelect", raw.d97.run), D97_SAVE_MIGRATIONS)).toBeNull();
    expect(decodeSnapshot(withScreen("overworld", null), D97_SAVE_MIGRATIONS)).toBeNull();
    expect(decodeSnapshot(withScreen("sliceEnd", null), D97_SAVE_MIGRATIONS)).toBeNull();
  });

  describe("the frozen golden schema-version-1 save", () => {
    const raw = readFileSync(new URL("./fixtures/d97-save-v1.json", import.meta.url), "utf8").replace(/\r\n/gu, "\n");

    it("keeps its committed bytes", () => {
      // Frozen by bead 1.16. Never regenerate it: a change to the persisted
      // shape bumps the schema version, adds a migration from version 1 and
      // commits a new golden fixture beside this one.
      expect(createHash("sha256").update(raw).digest("hex")).toBe(GOLDEN_V1_SHA256);
      expect((JSON.parse(raw) as { schemaVersion: unknown }).schemaVersion).toBe(1);
    });

    it("loads under the current migrations", () => {
      const decoded = decodeSnapshot(raw, D97_SAVE_MIGRATIONS);
      expect(decoded).not.toBeNull();
      expect(decoded!.snapshot.format).toBe(D97_SAVE_FORMAT);
      expect(decoded!.snapshot.schemaVersion).toBe(D97_SAVE_SCHEMA_VERSION);
      expect(decoded!.migratedFrom).toBe(1);
      const restored = snapshotFoldState(SAVE_GENESIS, decoded!.snapshot);
      expect(restored.d97?.run?.collection.copies.length).toBeGreaterThan(0);
    });

    it("drops an encounter's head starts on the way to version 2", () => {
      const v1 = readFileSync(new URL("./fixtures/milestones/m1.json", import.meta.url), "utf8");
      const encounters = Object.values(decodeSnapshot(v1, D97_SAVE_MIGRATIONS)?.snapshot.d97.run?.encounters ?? {});
      expect(encounters.length).toBeGreaterThan(0);
      for (const encounter of encounters) expect(encounter).not.toHaveProperty("headStarts");
    });
  });

  describe("the golden save of the current schema version", () => {
    const raw = readFileSync(new URL(`./fixtures/d97-save-v${String(D97_SAVE_SCHEMA_VERSION)}.json`, import.meta.url), "utf8");

    it("loads unmigrated and has the shape a run folded today writes", () => {
      const decoded = decodeSnapshot(raw, D97_SAVE_MIGRATIONS);
      expect(decoded?.migratedFrom).toBeNull();
      const { state, seq } = foldSyntheticRun();
      const current = JSON.parse(encodeSnapshot(takeSnapshot(state, seq, [], BUILD)!)) as unknown;
      expect(shapeOf(current)).toEqual(shapeOf(JSON.parse(raw)));
    });

    it("re-encodes to its own JSON through the live state", () => {
      const decoded = decodeSnapshot(raw, D97_SAVE_MIGRATIONS);
      expect(encodeSnapshot(decoded!.snapshot)).toBe(JSON.stringify(JSON.parse(raw)));
    });
  });
});

/** SHA-256 of `fixtures/d97-save-v1.json`, LF line endings. */
const GOLDEN_V1_SHA256 = "d3b766ae02cf7c4a919de4ae19a8394e6e7dbe3fbf733476c413707cb89f5d85";

/** A JSON value's shape: object keys and value kinds, recursively; arrays by their elements' shapes. */
function shapeOf(value: unknown): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) return [...new Set(value.map((entry) => JSON.stringify(shapeOf(entry))))].sort();
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, shapeOf(entry)]));
  }
  return typeof value;
}
