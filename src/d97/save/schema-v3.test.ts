// The schema-v3 parser accepts every committed save once migrated (the frozen
// version-1 golden, the version-2 golden, the version-3 golden and the
// exported milestone save) and rejects a migrated save whose last place lacks
// its room or names a room id that does not decode. Migrating version 2 to 3
// places every last place on its dream's own map and refuses a version-2
// save that does not parse.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateSnapshot } from "./migrate";
import { D97_SAVE_MIGRATIONS } from "./migrations";
import { V2_TO_V3 } from "./migrations/v2-to-v3";
import { parseSnapshotV3 } from "./schema-v3";

type Json = Record<string, unknown>;

function read(path: string): Json {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Json;
}

function migrated(path: string): Json {
  const result = migrateSnapshot(read(path), D97_SAVE_MIGRATIONS, 3);
  if (result === null) throw new Error(`${path} does not migrate`);
  return result.value;
}

const FIXTURES = [
  "./fixtures/d97-save-v1.json",
  "./fixtures/d97-save-v2.json",
  "./fixtures/d97-save-v3.json",
  "./fixtures/milestones/m1.json",
];

function withLastPlace(value: Json, lastPlace: unknown): Json {
  const d97 = value.d97 as Json;
  return { ...value, d97: { ...d97, run: { ...(d97.run as Json), lastPlace } } };
}

describe("parseSnapshotV3", () => {
  it.each(FIXTURES)("accepts %s once migrated, unchanged", (path) => {
    const value = migrated(path);
    expect(parseSnapshotV3(value)).toEqual(value);
  });

  it("rejects a last place without its room, or with a room id that does not decode", () => {
    const value = migrated("./fixtures/d97-save-v3.json");
    const place = ((value.d97 as Json).run as Json).lastPlace as Json;
    const { roomId: _roomId, ...withoutRoom } = place;
    expect(parseSnapshotV3(withLastPlace(value, withoutRoom))).toBeNull();
    expect(parseSnapshotV3(withLastPlace(value, { ...place, roomId: "the inn" }))).toBeNull();
    expect(parseSnapshotV3(withLastPlace(value, { ...place, roomId: null }))).not.toBeNull();
  });
});

describe("the version 2 to 3 migration", () => {
  it("places every last place on its dream's own map", () => {
    const v2 = read("./fixtures/d97-save-v2.json");
    const place = ((v2.d97 as Json).run as Json).lastPlace as Json;
    expect(place).not.toBeNull();
    const v3 = V2_TO_V3.migrate(v2);
    expect(((v3.d97 as Json).run as Json).lastPlace).toEqual({ ...place, roomId: null });
    expect(parseSnapshotV3({ ...v3, schemaVersion: 3 })).not.toBeNull();
  });

  it("keeps a run with no last place without one", () => {
    const v2 = withLastPlace(read("./fixtures/d97-save-v2.json"), null);
    expect(((V2_TO_V3.migrate(v2).d97 as Json).run as Json).lastPlace).toBeNull();
  });

  it("passes a version-2 save that does not parse on, for the version-3 parser to refuse", () => {
    const broken = { ...read("./fixtures/d97-save-v2.json"), seq: "seven" };
    const v3 = V2_TO_V3.migrate(broken);
    expect(v3).toEqual(broken);
    expect(parseSnapshotV3({ ...v3, schemaVersion: 3 })).toBeNull();
  });
});
