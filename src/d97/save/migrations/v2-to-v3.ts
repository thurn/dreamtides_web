// Schema version 2 to 3: the run's last place records the room it is in
// (decision P19). Every version-2 place lies on its dream's own map, so each
// gains `roomId: null`. The snapshot is read through the frozen version-2
// parser; one that does not parse is passed on unchanged, for the version-3
// parser to refuse.

import type { D97SaveMigration } from "../migrate";
import { parseSnapshotV2, type D97RunV2 } from "../schema-v2";
import type { D97RunV3, D97SnapshotV3 } from "../schema-v3";

function runToV3(run: D97RunV2): D97RunV3 {
  return { ...run, lastPlace: run.lastPlace === null ? null : { ...run.lastPlace, roomId: null } };
}

export const V2_TO_V3: D97SaveMigration = {
  from: 2,
  migrate: (snapshot) => {
    const v2 = parseSnapshotV2(snapshot);
    if (v2 === null) return { ...snapshot };
    const { run } = v2.d97;
    return { ...v2, d97: { ...v2.d97, run: run === null ? null : runToV3(run) } } satisfies Omit<D97SnapshotV3, "schemaVersion">;
  },
};
