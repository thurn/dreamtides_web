import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadJourneyContent } from "../../src/data/journey-content";
import { buildTideOpponentDeck } from "../../src/battle/integration/tide-opponent-deck";
import { selectOpponentAvatar } from "../../src/battle/integration/opponent-deck";
import { createBattleRng } from "../../src/battle/random";
import { parseOpponentId } from "../../src/types/identifiers";
import { parseJourneySeed } from "../../src/types/journey-seed";
import { parseArgs } from "node:util";
import { digest, sourceProvenance } from "./provenance";
import type { DeckPool, PoolDeck } from "./types";
import { setLogSink } from "../../src/logging";
import SETTINGS from "./catalog.json";

const { values } = parseArgs({ options: { reason: { type: "string" }, seed: { type: "string", default: SETTINGS.poolSeed }, output: { type: "string", default: "scripts/tournament/deck-pool.json" } } });
if (values.reason === undefined || values.reason.trim() === "") throw new Error("Pool regeneration requires --reason");
const seed = parseJourneySeed(values.seed);
const generationLog = `logs/tournaments/pool-${new Date().toISOString().replace(/[:.]/gu, "-")}.jsonl`;
mkdirSync(dirname(generationLog), { recursive: true });
setLogSink((entry) => appendFileSync(generationLog, `${JSON.stringify(entry)}\n`));
const content = loadJourneyContent();
const tides4Decks = content.poolContext.poolData.tides4Decks;
if (tides4Decks === undefined) throw new Error("Tides4 deck catalog unavailable");
const decks: PoolDeck[] = [];
for (const layer of SETTINGS.layers) {
  for (let index = 0; index < SETTINGS.decksPerLayer; index++) {
    const poolSeed = Number.parseInt(digest(`${seed}|${String(layer)}|${String(index)}`).slice(0, 8), 16);
    const avatar = selectOpponentAvatar(content.avatars, null, createBattleRng(poolSeed, "enemyDescriptor"));
    if (avatar === null || content.poolContext.tides4Tuning === undefined) throw new Error("Opponent generator inputs unavailable");
    const affiliation = content.affiliations[(layer * SETTINGS.decksPerLayer + index) % content.affiliations.length] ?? null;
    const built = buildTideOpponentDeck({ opponentAvatar: avatar, affiliation, cardDatabase: content.cardDatabase,
      dreamsignTemplates: content.dreamsignTemplates, completionLevel: layer, poolSeed,
      opponentsContentHash: content.opponentsData.contentHash, progression: content.opponentsData.progression,
      deckSize: content.opponentsData.opponentDeckSize, tides4Decks: tides4Decks,
      tides4Tuning: content.poolContext.tides4Tuning, deferLog: (emit) => emit() });
    if (built === null || built.finalCards.length !== content.opponentsData.opponentDeckSize) throw new Error("Opponent generator returned an incomplete deck");
    decks.push({ id: parseOpponentId(`atlas-${String(layer)}-${String(index)}`), layer, avatarId: avatar.id,
      abilityActive: built.abilityActive, dreamsigns: built.dreamsign === null ? [] : [built.dreamsign.id],
      cards: built.finalCards.map((card) => card.id), archetypes: built.joinedTideIds,
      affiliationId: affiliation?.id ?? null, poolSeed });
  }
}
const pool: DeckPool = { schemaVersion: 1, provenance: { generatedAt: new Date().toISOString(), reason: values.reason, seed, sourceHash: sourceProvenance(process.cwd()).sourceHash, apollyon: "hv-umm2.295" }, decks };
const output = resolve(values.output ?? "scripts/tournament/deck-pool.json");
mkdirSync(dirname(output), { recursive: true });
// One immutable deck per line keeps the generated UUID catalog reviewable and compact.
const bytes = `{"schemaVersion":1,"provenance":${JSON.stringify(pool.provenance)},"decks":[\n${decks.map((deck) => JSON.stringify(deck)).join(",\n")}\n]}\n`;
writeFileSync(output, bytes);
setLogSink(null);
const regeneration = JSON.stringify({ event: "tournament.poolGenerated", output, seed, reason: values.reason, decks: decks.length, sourceHash: pool.provenance.sourceHash, poolHash: digest(bytes), generationLog, apollyon: { bead: "hv-umm2.295", status: "incarnation decks appended by dependent 5.8 apollyon-sanity bead" } });
appendFileSync(generationLog, `${regeneration}\n`);
console.log(regeneration);
