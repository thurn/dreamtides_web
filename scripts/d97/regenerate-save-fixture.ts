// Regenerates the golden D97 save fixture of the current schema version
// (src/d97/save/fixtures/d97-save-v<N>.json) from the synthetic run in
// src/d97/save/save.fixtures.ts. Run it when a bead changes the snapshot's
// shape before schema version 1 is frozen, and, with each migration after
// that, keep the previous version's fixture as it was written
// (`npm run d97:save-fixture`).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { foldSyntheticRun, registerSaveContent } from "../../src/d97/save/save.fixtures.ts";
import { D97_SAVE_SCHEMA_VERSION, encodeSnapshot, takeSnapshot, type D97SaveBuild } from "../../src/d97/save/snapshot.ts";

const GOLDEN_BUILD = { reducerVersion: "golden", gitRevision: "unknown" } as D97SaveBuild;

registerSaveContent();
const { state, seq } = foldSyntheticRun();
const snapshot = takeSnapshot(state, seq, [], GOLDEN_BUILD);
if (snapshot === null) throw new Error("the synthetic run has no D97 slice");
const path = fileURLToPath(new URL(`../../src/d97/save/fixtures/d97-save-v${String(D97_SAVE_SCHEMA_VERSION)}.json`, import.meta.url));
writeFileSync(path, `${JSON.stringify(JSON.parse(encodeSnapshot(snapshot)), null, 2)}\n`);
console.log(`Wrote ${path}`);
