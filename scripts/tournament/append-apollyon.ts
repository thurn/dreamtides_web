import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs, isDeepStrictEqual } from "node:util";
import { loadJourneyContent } from "../../src/data/journey-content";
import { buildTideOpponentDeck } from "../../src/battle/integration/tide-opponent-deck";
import { journeyContentEngine } from "../../src/session/providers/battle-init-provider";
import { parseJourneySeed } from "../../src/types/journey-seed";
import { parseOpponentId } from "../../src/types/identifiers";
import { setLogSink } from "../../src/logging";
import { digest, sourceProvenance } from "./provenance";
import { decodePool } from "./pool";
import type { PoolDeck } from "./types";
import SETTINGS from "./catalog.json";

export function appendApollyon(args: readonly string[]): void {
const { values } = parseArgs({ args: [...args], options: { reason: { type: "string" }, pool: { type: "string", default: "scripts/tournament/deck-pool.json" }, seed: { type: "string", default: SETTINGS.apollyon.poolSeed } } });
if (values.reason === undefined || values.reason.trim() === "") throw new Error("Appending boss decks requires --reason");
const path = values.pool ?? "scripts/tournament/deck-pool.json";
const seed = parseJourneySeed(values.seed);
const originalBytes = readFileSync(path, "utf8");
const original: unknown = JSON.parse(originalBytes);
const content = loadJourneyContent();
const engine = journeyContentEngine(content);
const tides4Decks = content.poolContext.poolData.tides4Decks;
if (tides4Decks === undefined || content.poolContext.tides4Tuning === undefined) throw new Error("Missing production Tide data");
const rules = { tides: new Set(tides4Decks.tides.map((tide) => tide.id)), affiliations: new Set(content.affiliations.map((affiliation) => affiliation.id)), ...content.opponentsData.progression, deckSize: content.opponentsData.opponentDeckSize, incarnations: content.apollyonIncarnations, rosterAvatarIds: new Set(content.avatars.map((avatar) => avatar.id)) };
const base = decodePool(original, engine.catalog, rules);
if (base.apollyonAppend !== undefined || base.decks.some((deck) => deck.incarnationId !== undefined)) throw new Error("Pool already contains boss additions");
const lines = originalBytes.split("\n");
const deckLines = lines.slice(1, -2);
if (lines.at(-2) !== "]}" || lines.at(-1) !== "" || deckLines.length !== base.decks.length || deckLines.some((line, index) => !isDeepStrictEqual(JSON.parse(line.replace(/,$/u, "")), base.decks[index]))) throw new Error("Pool must retain the canonical one-deck-per-line layout");
const generationLog = `logs/tournaments/apollyon-pool-${new Date().toISOString().replace(/[:.]/gu, "-")}.jsonl`;
mkdirSync(dirname(generationLog), { recursive: true });
setLogSink((entry) => appendFileSync(generationLog, `${JSON.stringify(entry)}\n`));
try {
  const additions: PoolDeck[] = content.apollyonIncarnations.map((incarnation) => {
    if (engine.catalog.avatar(incarnation.aspect.id).status !== "authored") throw new Error(`Pending Aspect ${incarnation.aspect.id}`);
    const poolSeed = Number.parseInt(digest(`${seed}|${incarnation.id}`).slice(0, 8), 16);
    const opponentAvatar = content.avatars.find((avatar) => avatar.id === incarnation.deckRecipe.poolAvatarId);
    if (opponentAvatar === undefined) throw new Error(`Missing recipe Avatar ${incarnation.deckRecipe.poolAvatarId}`);
    const built = buildTideOpponentDeck({ opponentAvatar, affiliation: null, cardDatabase: content.cardDatabase, dreamsignTemplates: content.dreamsignTemplates,
      completionLevel: SETTINGS.apollyon.layer, poolSeed, opponentsContentHash: content.opponentsData.contentHash, progression: content.opponentsData.progression,
      deckSize: content.opponentsData.opponentDeckSize, tides4Decks, tides4Tuning: content.poolContext.tides4Tuning!, curated: incarnation });
    if (built === null || built.curatedDreamsigns === undefined || built.finalCards.length !== content.opponentsData.opponentDeckSize || new Set(built.finalCards.map((card) => card.id)).size !== built.finalCards.length) throw new Error("Incomplete curated boss deck");
    return { id: parseOpponentId(`apollyon:${incarnation.id}`), incarnationId: incarnation.id, layer: SETTINGS.apollyon.layer, avatarId: incarnation.aspect.id,
      abilityActive: true, dreamsigns: built.curatedDreamsigns.map((sign) => sign.id), cards: built.finalCards.map((card) => card.id),
      archetypes: [...new Set([...built.joinedTideIds, ...incarnation.deckRecipe.archetypeTideIds])], affiliationId: null, poolSeed };
  });
  const apollyonAppend = { generatedAt: new Date().toISOString(), reason: values.reason, sourceHash: sourceProvenance(process.cwd()).sourceHash, basePoolHash: digest(originalBytes) };
  decodePool({ ...base, apollyonAppend, decks: [...base.decks, ...additions] }, engine.catalog, rules);
  const head = `{"schemaVersion":1,"provenance":${JSON.stringify(base.provenance)},"apollyonAppend":${JSON.stringify(apollyonAppend)},"decks":[`;
  const bytes = `${head}\n${deckLines.join("\n")}\n,${additions.map((deck) => JSON.stringify(deck)).join(",\n")}\n]}\n`;
  writeFileSync(path, bytes);
  const record = { event: "tournament.apollyonPoolAppended", path, seed, ...apollyonAppend, poolHash: digest(bytes), generationLog, preservedAtlasDecks: base.decks.length, additions };
  appendFileSync(generationLog, `${JSON.stringify(record)}\n`);
  console.log(JSON.stringify(record));
} finally { setLogSink(null); }
}
