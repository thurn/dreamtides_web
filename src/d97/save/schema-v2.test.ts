// The schema-v2 parser accepts every committed save once migrated (the frozen
// version-1 golden, the version-2 golden and the exported milestone save) and
// rejects a migrated save that is missing a field or carries an identity that
// does not decode.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateSnapshot } from "./migrate";
import { D97_SAVE_MIGRATIONS } from "./migrations";
import { parseSnapshotV2 } from "./schema-v2";

type Json = Record<string, unknown>;

function migrated(path: string): Json {
  const raw = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Json;
  const result = migrateSnapshot(raw, D97_SAVE_MIGRATIONS, 2);
  if (result === null) throw new Error(`${path} does not migrate`);
  return result.value;
}

const FIXTURES = ["./fixtures/d97-save-v1.json", "./fixtures/d97-save-v2.json", "./fixtures/milestones/m1.json"];

describe("parseSnapshotV2", () => {
  it.each(FIXTURES)("accepts %s once migrated, unchanged", (path) => {
    const value = migrated(path);
    expect(parseSnapshotV2(value)).toEqual(value);
  });

  it("rejects a run without its shops", () => {
    const value = migrated("./fixtures/milestones/m1.json");
    const { shops: _shops, ...run } = (value.d97 as Json).run as Json;
    expect(parseSnapshotV2({ ...value, d97: { ...(value.d97 as Json), run } })).toBeNull();
  });

  it("rejects an owned copy whose id does not decode", () => {
    const value = structuredClone(migrated("./fixtures/milestones/m1.json"));
    const copies = (((value.d97 as Json).run as Json).collection as Json).copies as Json[];
    copies[0] = { ...copies[0], copyId: 7 };
    expect(parseSnapshotV2(value)).toBeNull();
  });
});
