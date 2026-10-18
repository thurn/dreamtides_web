// The schema-v4 parser accepts every committed save once migrated (the frozen
// version-1, -2 and -3 goldens, the version-4 golden and the exported
// milestone save), carrying each bag-v0 run's draws into its Avatar's bag at
// stage 1, and rejects a migrated save whose bags are missing or whose draw
// counts do not decode.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateSnapshot } from "./migrate";
import { D97_SAVE_MIGRATIONS } from "./migrations";
import { parseSnapshotV4 } from "./schema-v4";

type Json = Record<string, unknown>;

function migrated(path: string): Json {
  const raw = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Json;
  const result = migrateSnapshot(raw, D97_SAVE_MIGRATIONS, 4);
  if (result === null) throw new Error(`${path} does not migrate`);
  return result.value;
}

function withRun(value: Json, edit: (run: Json) => Json): Json {
  const d97 = value.d97 as Json;
  return { ...value, d97: { ...d97, run: edit(d97.run as Json) } };
}

const FIXTURES = [
  "./fixtures/d97-save-v1.json",
  "./fixtures/d97-save-v2.json",
  "./fixtures/d97-save-v3.json",
  "./fixtures/d97-save-v4.json",
  "./fixtures/milestones/m1.json",
];

describe("parseSnapshotV4", () => {
  it.each(FIXTURES)("accepts %s once migrated, unchanged", (path) => {
    const value = migrated(path);
    expect(parseSnapshotV4(value)).toEqual(value);
  });

  it.each(["./fixtures/d97-save-v1.json", "./fixtures/d97-save-v2.json", "./fixtures/d97-save-v3.json", "./fixtures/milestones/m1.json"])(
    "carries %s's bag-v0 draws into its Avatar's bag at stage 1",
    (path) => {
      const run = (migrated(path).d97 as Json).run as Json;
      const bags = run.bags as { stage: number; drawn: Record<string, Record<string, number>> };
      expect(run).not.toHaveProperty("bag");
      expect(bags.stage).toBe(1);
      expect(Object.keys(bags.drawn)).toEqual([run.avatarId]);
    },
  );

  it("rejects a run without its bags, or with a draw count that is not an integer", () => {
    const value = migrated("./fixtures/d97-save-v4.json");
    expect(parseSnapshotV4(withRun(value, ({ bags: _bags, ...run }) => run))).toBeNull();
    const avatarId = ((value.d97 as Json).run as Json).avatarId as string;
    const broken = withRun(value, (run) => ({ ...run, bags: { stage: 1, drawn: { [avatarId]: { notACard: 1 } } } }));
    expect(parseSnapshotV4(broken)).toBeNull();
    expect(parseSnapshotV4(withRun(value, (run) => ({ ...run, bags: { stage: 1, drawn: { [avatarId]: {} } } })))).not.toBeNull();
  });
});
