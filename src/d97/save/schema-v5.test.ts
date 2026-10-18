// The schema-v5 parser accepts every committed save once migrated (the frozen
// version-1 to -4 goldens, the version-5 golden and the exported milestone
// save), accepts a run holding a multi-dream assembled act exactly as written,
// and rejects a migrated save whose acts are missing or malformed.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assembleAct } from "../assembly/assemble";
import { runSeed, startDream, SYNTHETIC_ACT_CATALOG, SYNTHETIC_ACT_DREAMS, SYNTHETIC_ACT_SHAPE } from "../assembly/assembly.fixtures";
import { migrateSnapshot } from "./migrate";
import { D97_SAVE_MIGRATIONS } from "./migrations";
import { parseSnapshotV5 } from "./schema-v5";

type Json = Record<string, unknown>;

function migrated(path: string): Json {
  const raw = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Json;
  const result = migrateSnapshot(raw, D97_SAVE_MIGRATIONS, 5);
  if (result === null) throw new Error(`${path} does not migrate`);
  return result.value;
}

function withRun(value: Json, edit: (run: Json) => Json): Json {
  const d97 = value.d97 as Json;
  return { ...value, d97: { ...d97, run: edit(d97.run as Json) } };
}

const FIXTURES = [1, 2, 3, 4, 5].map((version) => `./fixtures/d97-save-v${String(version)}.json`).concat("./fixtures/milestones/m1.json");

describe("parseSnapshotV5", () => {
  it.each(FIXTURES)("accepts %s once migrated, unchanged", (path) => {
    const value = migrated(path);
    expect(parseSnapshotV5(value)).toEqual(value);
  });

  it("accepts a run holding an assembled multi-dream act, as written", () => {
    const result = assembleAct({ runSeed: runSeed(1), number: 1, start: startDream(SYNTHETIC_ACT_DREAMS[0]), catalog: SYNTHETIC_ACT_CATALOG, shape: SYNTHETIC_ACT_SHAPE });
    if (!result.ok) throw new Error("the synthetic catalog did not assemble");
    expect(result.act.doors.length).toBeGreaterThan(0);
    expect(result.act.challengers.some((seat) => seat.occupant.kind === "generic")).toBe(true);
    const value = withRun(migrated("./fixtures/d97-save-v5.json"), (run) => ({ ...run, acts: [result.act] }));
    const json = JSON.parse(JSON.stringify(value)) as Json;
    expect(parseSnapshotV5(json)).toEqual(json);
  });

  it("rejects a run without its acts, or with an act whose door or seat does not decode", () => {
    const value = migrated("./fixtures/d97-save-v5.json");
    const [act] = ((value.d97 as Json).run as { acts: Json[] }).acts;
    expect(parseSnapshotV5(withRun(value, ({ acts: _acts, ...run }) => run))).toBeNull();
    expect(parseSnapshotV5(withRun(value, (run) => ({ ...run, acts: [{ ...act, exitDoor: { dreamId: "not-a-dream", anchorId: "x" } }] })))).toBeNull();
    expect(parseSnapshotV5(withRun(value, (run) => ({ ...run, acts: [{ ...act, guardians: [{ ...(act.guardians as Json[])[0], seat: "boss" }] }] })))).toBeNull();
  });
});
