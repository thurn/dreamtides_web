// Committed QA helper: generates a v2 mid-run Dream Atlas with every
// AtlasNodeState present and writes it into a saved-journey fixture so the atlas
// screen's completed/forgone visuals can be browser-QA'd. Run with vite-node.
import { readFileSync, writeFileSync } from "node:fs";
import {
  generateInitialAtlas,
  advanceAtlas,
} from "../src/atlas/atlas-generator";
import {
  loadTestDreamscapes,
  loadTestAtlasConfig,
} from "../src/__test-helpers__/atlas-fixtures";

const dreamscapes = loadTestDreamscapes();
const atlasConfig = loadTestAtlasConfig();
const build = {
  dreamscapes,
  atlasConfig,
  dreamsignPoolIds: Array.from({ length: 8 }, (_, i) => `qa-ds-${String(i)}`),
};

let atlas = generateInitialAtlas(0, {}, build, { logEvents: false });
// Complete layer 0 and one layer-1 node so we get completed + forgone + a deeper
// revealed layer, alongside the start-state available/revealedLocked/unrevealed.
atlas = advanceAtlas(atlas, atlas.startingNodeId, 0, {}, build, {
  logEvents: false,
});
const layer1 = atlas.layers[1];
const chosen = layer1.find((id) => atlas.nodes[id].state === "available") ?? layer1[0];
atlas = advanceAtlas(atlas, chosen, 1, {}, build, { logEvents: false });

const states: Record<string, number> = {};
for (const n of Object.values(atlas.nodes)) {
  states[n.state] = (states[n.state] ?? 0) + 1;
}
console.log("states:", states);

const base = JSON.parse(
  readFileSync("saved-journeys/spirit-animals-after-first-battle-a1021b7.json", "utf8"),
) as { name: string; savedAt: string; journeyState: Record<string, unknown> };

base.name = "qa_midrun_atlas";
base.journeyState.atlas = atlas;
base.journeyState.completionLevel = 2;
base.journeyState.currentDreamscape = chosen;
base.journeyState.screen = { type: "atlas" };
base.journeyState.activeSiteId = null;

writeFileSync(
  "saved-journeys/qa-midrun-atlas.json",
  JSON.stringify(base, null, 2),
);
console.log("wrote saved-journeys/qa-midrun-atlas.json");
