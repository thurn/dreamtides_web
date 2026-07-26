// Can pruning the worst decklists lift the idf3 build-around metric to ~95?
// For each raw decklist, score its own payoff support (self-adequacy). Drop the
// worst X% of decks that CARRY payoffs, rebuild the pool data from the survivors,
// and re-run the real idf3 metric. This is explicitly teaching-to-the-test: we
// filter the corpus against the very metric we then report.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData, generatePoolFromData } from "../src/draft/pool/index.ts";
import { scorePool, TIER_TARGET } from "./pool-metrics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const SHORT = new Set(["survivors", "spirit-animals", "discard", "warriors", "abandon"]);
const SEEDS = Number(process.argv[2] ?? 80);
const SIZE = Number(process.argv[3] ?? 200);

const cards = readJson("public/cards_v2-data.json");
const decklists = readJson("public/decklists-data.json");
// The idf3 engine scores on the id-keyed corpus; `decklistIds` is index-aligned
// to `decklists` (same seats), so a deck dropped by self-adequacy index drops from
// both. Self-adequacy stays scored on the name corpus (scorePool is name-keyed),
// but the engine is fed the id corpus so this mirror matches production.
const decklistIds = readJson("public/decklist-ids-data.json");
const dreamAvatars = readJson("public/dream-avatars-v2-data.json");
const meta = readJson("data/buildaround_support.json");

// Self-adequacy of one raw decklist over the SHORT themes (null if it carries no
// scored payoff at all -- those decks have no payoff risk and are never "worst").
function selfAdequacy(deck) {
  const counts = new Map();
  for (const c of deck) counts.set(c, Math.min(2, (counts.get(c) ?? 0) + 1));
  const inst = scorePool(counts, meta, TIER_TARGET, SHORT);
  return inst.length ? mean(inst.map((i) => i.adequacy)) : null;
}

// Rank decks that carry payoffs by self-adequacy (worst first).
const scored = decklists.map((d, i) => ({ i, a: selfAdequacy(d) }));
const withPayoff = scored.filter((x) => x.a !== null).sort((a, b) => a.a - b.a);
console.log(`Corpus: ${decklists.length} decks, ${withPayoff.length} carry a scored payoff.`);
console.log(`Their self-adequacy: worst ${(withPayoff[0].a * 100).toFixed(0)}, median ${(withPayoff[Math.floor(withPayoff.length / 2)].a * 100).toFixed(0)}, best ${(withPayoff.at(-1).a * 100).toFixed(0)}\n`);

function runMetric(keptDecklists, keptDecklistIds) {
  const poolData = buildPoolData(cards, keptDecklists, undefined, keptDecklistIds);
  const all = [];
  const byTheme = new Map();
  for (const dc of dreamAvatars)
    for (let s = 0; s < SEEDS; s++) {
      const pool = generatePoolFromData(poolData, s >>> 0, undefined, "idf3", undefined, SIZE, dc.signatureCardIds ?? []);
      for (const i of scorePool(pool.counts, meta, TIER_TARGET, SHORT)) {
        all.push(i.adequacy);
        if (!byTheme.has(i.theme)) byTheme.set(i.theme, []);
        byTheme.get(i.theme).push(i.adequacy);
      }
    }
  const themes = [...byTheme.entries()].map(([k, v]) => `${k}:${(mean(v) * 100).toFixed(0)}`).sort().join("  ");
  return { headline: mean(all) * 100, themes };
}

console.log(`Re-running idf3 metric (size ${SIZE}, ${SEEDS} seeds) after pruning worst X% of payoff-carrying decks:\n`);
for (const frac of [0, 0.1, 0.2, 0.3, 0.4, 0.5]) {
  const dropCount = Math.round(frac * withPayoff.length);
  const dropSet = new Set(withPayoff.slice(0, dropCount).map((x) => x.i));
  const kept = decklists.filter((_, i) => !dropSet.has(i));
  const keptIds = decklistIds.filter((_, i) => !dropSet.has(i));
  const r = runMetric(kept, keptIds);
  console.log(`drop ${String(Math.round(frac * 100)).padStart(2)}%  (${kept.length}/${decklists.length} decks)  headline ${r.headline.toFixed(1)}`);
  console.log(`        ${r.themes}`);
}
