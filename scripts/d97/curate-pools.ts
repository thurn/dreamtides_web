// Curates the Dreamtides 97 pinned pools (decision P29, Appendix A §A2) and,
// with `--write`, rewrites `src/content/d97/pools/`. An offline tool, never
// run at build: the committed modules are the content. Deterministic: the same
// catalogs always pin the same pools (`npm run d97:pools -- --write`).
//
// 1. Tide sets. Every Avatar gets a signature tide (its own; a signatureless
//    Avatar borrows one, each signature lent to at most one other Avatar) and
//    three facet tides from all 32. Over eligible cards only (§A1), a
//    candidate qualifies when each facet adds at least `FACET_MIN_ADDED`
//    cards outside the signature and ring 2 (the facets' cards outside the
//    signature) holds `RING2_MIN`–`RING2_MAX` cards. A qualifying candidate
//    scores kinship with its Avatar: +4 per facet the Avatar's journey tide
//    pool lists, +2 per facet sharing the signature's resonance, +0.25 per
//    eligible card a facet shares with the signature (at most 12 counted),
//    and −0.1 per card ring 2 sits away from `RING2_TARGET`. A deterministic
//    local search then picks one candidate per Avatar maximizing the total
//    score subject to the spread rules: each facet serves two to four Avatars
//    and no signature is lent twice.
// 2. Deals. For each chosen tide set the tides4 deal (the journey draft's
//    pool construction: `generatePoolFromData`, the per-card pool caps, then
//    eligible cards only) runs from seeds 0..N−1 over that tide set alone.
//    Deals that drew all three facets compete on: facet reach (the facets the
//    deal folded into its bag before the bag could deal a full pool, over
//    three), ring-2 coverage (distinct ring-2 cards dealt over ring 2's size),
//    minus the L1 distance between the dealt and ring rarity mixes. The best
//    deal, lowest seed on a tie, is pinned.
//
// Usage: npm run d97:pools -- [--candidates 64] [--write]

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { D97_COLLECTION } from "../../src/content/d97/collection";
import { resolvePool } from "../../src/data/cards-v2-database";
import { loadJourneyContent } from "../../src/data/journey-content";
import { generatePoolFromData } from "../../src/draft/pool/generate";
import type { Tides4DecksJson } from "../../src/draft/pool/tides4-io";
import type { PoolData } from "../../src/draft/pool/types";
import { setLogSink } from "../../src/logging";
import type { CardId } from "../../src/types/card-identity";
import type { Rarity } from "../../src/types/cards";
import { identityEntries, type AvatarId, type TideId } from "../../src/types/identifiers";

const FACET_MIN_ADDED = 25;
const RING2_MIN = 60;
const RING2_MAX = 100;
const RING2_TARGET = 80;
const FACET_USES_MIN = 2;
const FACET_USES_MAX = 4;
const FACET_COUNT = 3;

const { values } = parseArgs({ options: { candidates: { type: "string", default: "64" }, write: { type: "boolean", default: false } } });
const DEAL_CANDIDATES = Number.parseInt(values.candidates ?? "64", 10);

setLogSink(() => {});
const content = loadJourneyContent();
const pool = content.poolContext;
const decks: Tides4DecksJson | undefined = pool.poolData.tides4Decks;
if (decks === undefined || pool.tides4Tuning === undefined) throw new Error("the tide catalog is unavailable");
const tuning = pool.tides4Tuning;

const bagRarities = new Set<Rarity>(D97_COLLECTION.bagRarities);
const starterNumbers = new Set(pool.starterCardNumbers);
const cardById = new Map([...content.cardDatabase.values()].map((card) => [card.id, card]));
function eligible(cardId: CardId): boolean {
  const card = cardById.get(cardId);
  return card !== undefined && !card.isStarter && !starterNumbers.has(card.cardNumber) && card.rarity !== undefined && bagRarities.has(card.rarity);
}
function rarityOf(cardId: CardId): Rarity {
  const rarity = cardById.get(cardId)?.rarity;
  if (rarity === undefined) throw new Error(`card ${cardId} has no rarity`);
  return rarity;
}

const tideById = new Map(decks.tides.map((tide) => [tide.id, tide]));
const eligibleOf = new Map(decks.tides.map((tide) => [tide.id, new Set(tide.cards.map((card) => card.id).filter(eligible))]));
function cardsOf(tideId: TideId): ReadonlySet<CardId> {
  const cards = eligibleOf.get(tideId);
  if (cards === undefined) throw new Error(`unknown tide ${tideId}`);
  return cards;
}
const signatures = decks.tides.filter((tide) => tide.role === "signature").map((tide) => tide.id);
const facets = decks.tides.filter((tide) => tide.role === "facet").map((tide) => tide.id);

function codeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

// --- Tide sets ---------------------------------------------------------------

interface TideSetCandidate {
  readonly signature: TideId;
  readonly facets: readonly [TideId, TideId, TideId];
  readonly added: readonly number[];
  readonly ring2: number;
  readonly score: number;
  readonly key: string;
}

function ring2Of(signature: TideId, chosen: readonly TideId[]): Set<CardId> {
  const sig = cardsOf(signature);
  const ring = new Set<CardId>();
  for (const facet of chosen) for (const cardId of cardsOf(facet)) if (!sig.has(cardId)) ring.add(cardId);
  return ring;
}

function candidatesFor(avatarId: AvatarId, own: TideId | null, listed: ReadonlySet<TideId>): TideSetCandidate[] {
  const result: TideSetCandidate[] = [];
  for (const signature of own === null ? signatures : [own]) {
    const sig = cardsOf(signature);
    const resonance = tideById.get(signature)?.resonance;
    const usable = facets.filter((facet) => [...cardsOf(facet)].filter((cardId) => !sig.has(cardId)).length >= FACET_MIN_ADDED);
    const kinship = new Map(usable.map((facet) => {
      const shared = [...cardsOf(facet)].filter((cardId) => sig.has(cardId)).length;
      const bonus = (own !== null && listed.has(facet) ? 4 : 0) + (tideById.get(facet)?.resonance === resonance ? 2 : 0) + 0.25 * Math.min(shared, 12);
      return [facet, bonus] as const;
    }));
    for (let i = 0; i < usable.length; i += 1) {
      for (let j = i + 1; j < usable.length; j += 1) {
        for (let k = j + 1; k < usable.length; k += 1) {
          const chosen = [usable[i], usable[j], usable[k]] as const;
          const ring2 = ring2Of(signature, chosen).size;
          if (ring2 < RING2_MIN || ring2 > RING2_MAX) continue;
          const added = chosen.map((facet) => [...cardsOf(facet)].filter((cardId) => !sig.has(cardId)).length);
          const score = chosen.reduce((sum, facet) => sum + (kinship.get(facet) ?? 0), 0) - 0.1 * Math.abs(ring2 - RING2_TARGET);
          result.push({ signature, facets: chosen, added, ring2, score, key: `${avatarId}|${signature}|${chosen.join("|")}` });
        }
      }
    }
  }
  return result.sort((left, right) => right.score - left.score || codeUnits(left.key, right.key));
}

interface AvatarPlan {
  readonly avatarId: AvatarId;
  readonly name: string;
  readonly own: TideId | null;
  readonly candidates: readonly TideSetCandidate[];
}

const plans: AvatarPlan[] = content.avatars.map((avatar) => {
  const entry = decks.tidePoolByAvatar[avatar.id];
  if (entry === undefined) throw new Error(`Avatar ${avatar.id} has no tide pool`);
  const candidates = candidatesFor(avatar.id, entry.starter, new Set(entry.facets));
  if (candidates.length === 0) throw new Error(`Avatar ${avatar.id} has no qualifying tide set`);
  return { avatarId: avatar.id, name: avatar.name, own: entry.starter, candidates };
});

/** Spread violations: facets outside two to four uses, signatures lent twice. */
function violations(choice: readonly number[]): number {
  const uses = new Map(facets.map((facet) => [facet, 0]));
  const lent = new Map<TideId, number>();
  plans.forEach((plan, index) => {
    const candidate = plan.candidates[choice[index]];
    for (const facet of candidate.facets) uses.set(facet, (uses.get(facet) ?? 0) + 1);
    if (plan.own === null) lent.set(candidate.signature, (lent.get(candidate.signature) ?? 0) + 1);
  });
  let total = 0;
  for (const count of uses.values()) total += Math.max(0, FACET_USES_MIN - count) + Math.max(0, count - FACET_USES_MAX);
  for (const count of lent.values()) total += Math.max(0, count - 1);
  return total;
}

function objective(choice: readonly number[]): number {
  const score = plans.reduce((sum, plan, index) => sum + plan.candidates[choice[index]].score, 0);
  return score - 1000 * violations(choice);
}

const choice = plans.map(() => 0);
let best = objective(choice);
for (let pass = 0; pass < 200; pass += 1) {
  let improved = false;
  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    let bestIndex = choice[index];
    for (let option = 0; option < plan.candidates.length; option += 1) {
      if (option === choice[index]) continue;
      choice[index] = option;
      const value = objective(choice);
      if (value > best + 1e-9) {
        best = value;
        bestIndex = option;
        improved = true;
      }
    }
    choice[index] = bestIndex;
  }
  if (!improved) break;
}
if (violations(choice) > 0) throw new Error(`no tide-set assignment meets the spread rules (${String(violations(choice))} violations)`);

// --- Deals -------------------------------------------------------------------

interface PinnedDeal {
  readonly seed: number;
  readonly dealt: readonly (readonly [CardId, number])[];
  readonly balance: number;
  readonly coverage: number;
  readonly rarityDistance: number;
  readonly score: number;
  readonly accepted: number;
}

function rarityMix(cardIds: Iterable<CardId>): Map<Rarity, number> {
  const counts = new Map<Rarity, number>();
  let total = 0;
  for (const cardId of cardIds) {
    counts.set(rarityOf(cardId), (counts.get(rarityOf(cardId)) ?? 0) + 1);
    total += 1;
  }
  return new Map([...counts].map(([rarity, count]) => [rarity, count / Math.max(1, total)]));
}

function deal(avatarId: AvatarId, candidate: TideSetCandidate): PinnedDeal {
  const poolData: PoolData = {
    ...pool.poolData,
    tides4Decks: { ...decks!, tidePoolByAvatar: { ...decks!.tidePoolByAvatar, [avatarId]: { starter: candidate.signature, facets: [...candidate.facets], neutral: [] } } },
  };
  const sig = cardsOf(candidate.signature);
  const ring2 = ring2Of(candidate.signature, candidate.facets);
  const ringMix = rarityMix([...sig, ...ring2]);
  let pinned: PinnedDeal | null = null;
  let accepted = 0;
  for (let seed = 0; seed < DEAL_CANDIDATES; seed += 1) {
    const generated = generatePoolFromData(poolData, seed, avatarId, tuning);
    if (generated.tides4Provenance.facetDrawnCount !== FACET_COUNT) continue;
    accepted += 1;
    const { draftPoolCopiesByCard } = resolvePool(generated, pool.idIndex, pool.defaultPoolCopyCap, pool.poolCopyCapsByCardNumber);
    const dealt: [CardId, number][] = [];
    for (const [key, copies] of identityEntries(draftPoolCopiesByCard)) {
      const card = content.cardDatabase.get(Number(key));
      if (card !== undefined && eligible(card.id)) dealt.push([card.id, copies]);
    }
    dealt.sort(([left], [right]) => codeUnits(left, right));
    const dealtIds = new Set(dealt.map(([cardId]) => cardId));
    const joined = generated.tides4Provenance.tides.filter((tide) => tide.joined && candidate.facets.includes(tide.id)).length;
    const balance = joined / FACET_COUNT;
    const coverage = [...ring2].filter((cardId) => dealtIds.has(cardId)).length / ring2.size;
    const dealtMix = rarityMix(dealtIds);
    const rarityDistance = [...bagRarities].reduce((sum, rarity) => sum + Math.abs((dealtMix.get(rarity) ?? 0) - (ringMix.get(rarity) ?? 0)), 0);
    const score = balance + coverage - rarityDistance;
    if (pinned === null || score > pinned.score + 1e-9) pinned = { seed, dealt, balance, coverage, rarityDistance, score, accepted: 0 };
  }
  if (pinned === null) throw new Error(`Avatar ${avatarId}: no deal of ${String(DEAL_CANDIDATES)} drew all three facets`);
  return { ...pinned, accepted };
}

// --- Output ------------------------------------------------------------------

const outDir = fileURLToPath(new URL("../../src/content/d97/pools/", import.meta.url));
const facetUses = new Map(facets.map((facet) => [facet, 0]));
for (let index = 0; index < plans.length; index += 1) for (const facet of plans[index].candidates[choice[index]].facets) facetUses.set(facet, (facetUses.get(facet) ?? 0) + 1);
const modules: { readonly file: string; readonly binding: string }[] = [];
const fixed = (value: number): string => value.toFixed(2);
console.log("avatar    sig      borrowed ring1 ring2 facet+         kin   seed reach   cover rarityL1");
for (let index = 0; index < plans.length; index += 1) {
  const plan = plans[index];
  const candidate = plan.candidates[choice[index]];
  const pinned = deal(plan.avatarId, candidate);
  const ring1 = cardsOf(candidate.signature).size;
  console.log(`${plan.avatarId.slice(0, 8)}  ${candidate.signature.slice(0, 8)} ${plan.own === null ? "yes     " : "no      "} ${String(ring1).padStart(5)} ${String(candidate.ring2).padStart(5)} ${candidate.added.join("/").padEnd(14)} ${fixed(candidate.score).padStart(5)} ${String(pinned.seed).padStart(4)} ${fixed(pinned.balance).padStart(7)} ${fixed(pinned.coverage).padStart(5)} ${fixed(pinned.rarityDistance).padStart(8)}`);
  const slug = `${plan.name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}-${plan.avatarId.slice(0, 8)}`;
  const binding = slug.replace(/-([a-z0-9])/gu, (_, letter: string) => letter.toUpperCase());
  modules.push({ file: slug, binding });
  const header = [
    `// The pinned D97 pool of Avatar ${plan.avatarId} (${plan.name}), written by`,
    "// scripts/d97/curate-pools.ts; never edit by hand, rerun the script.",
    "//",
    `// Tide set: ${plan.own === null ? "borrowed" : "own"} signature ${candidate.signature} (ring 1: ${String(ring1)} eligible`,
    `// cards); facets add ${candidate.added.join(", ")} eligible cards outside it (ring 2: ${String(candidate.ring2)}).`,
    `// Kinship score ${fixed(candidate.score)}; facet uses ${candidate.facets.map((facet) => String(facetUses.get(facet))).join(", ")}.`,
    `// Deal: seed ${String(pinned.seed)}, the best of ${String(pinned.accepted)} of ${String(DEAL_CANDIDATES)} seeded tides4 deals that drew`,
    `// all three facets: facet reach ${fixed(pinned.balance)}, ring-2 coverage ${fixed(pinned.coverage)}, rarity L1 ${fixed(pinned.rarityDistance)};`,
    `// ${String(pinned.dealt.length)} distinct cards, ${String(pinned.dealt.reduce((sum, [, copies]) => sum + copies, 0))} copies.`,
  ];
  const body = [
    ...header,
    "",
    'import { pinnedPool } from "./schema";',
    "",
    "export default pinnedPool({",
    `  avatarId: "${plan.avatarId}",`,
    `  signatureTideId: "${candidate.signature}",`,
    `  borrowedSignature: ${String(plan.own === null)},`,
    `  facetTideIds: [${candidate.facets.map((facet) => `"${facet}"`).join(", ")}],`,
    `  dealSeed: ${String(pinned.seed)},`,
    "  dealt: [",
    ...pinned.dealt.map(([cardId, copies]) => `    ["${cardId}", ${String(copies)}],`),
    "  ],",
    "});",
    "",
  ];
  if (values.write) writeFileSync(`${outDir}${slug}.ts`, body.join("\n"));
}
console.log(`facet uses: ${[...facetUses.values()].join(",")}`);

if (values.write) {
  mkdirSync(outDir, { recursive: true });
  const expected = new Set([...modules.map((module) => `${module.file}.ts`), "index.ts", "schema.ts", "pools.test.ts"]);
  for (const name of readdirSync(outDir)) if (!expected.has(name)) rmSync(`${outDir}${name}`);
  const index = [
    "// The D97 pinned pools (decision P29, Appendix A §A2): one per roster Avatar,",
    "// written by scripts/d97/curate-pools.ts. Keyed by Avatar UUID through",
    "// `avatarId`; the D97 content provider indexes them.",
    "",
    ...modules.map((module) => `import ${module.binding} from "./${module.file}";`),
    'import type { D97PinnedPool } from "./schema";',
    "",
    "export const D97_PINNED_POOLS: readonly D97PinnedPool[] = [",
    ...modules.map((module) => `  ${module.binding},`),
    "];",
    "",
  ];
  writeFileSync(`${outDir}index.ts`, index.join("\n"));
  console.log(`Wrote ${String(modules.length)} pinned pools to ${outDir}`);
}
