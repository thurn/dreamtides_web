// Diagnostic: for each short theme, what is the BEST achievable support share a
// 200-card decklist-grown pool could reach? If even the most theme-dense pool
// can't hit the tier target, no idf3 tuning can fix that theme -- the limit is
// the corpus, not the draw. We grow a pool from EACH real deck as starter and
// record, per theme, the max support share any of those pools reaches, plus the
// payoff cards of that theme and where they live.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/index.ts";
import { idf2Corpus } from "../src/draft/pool/variant-idf2.ts";
import { growIdfPool } from "../src/draft/pool/variant-idf.ts";
import { TIER_TARGET } from "./pool-metrics.mjs";
import { supportEntryByName } from "./lib/card-refs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const cards = readJson("public/cards_v2-data.json");
const decklists = readJson("public/decklists-data.json");
const meta = readJson("data/buildaround_support.json");
const poolData = buildPoolData(cards, decklists);
const { base } = idf2Corpus(poolData);
const { decks, idf } = base;
const idfOf = (c) => idf.get(c) ?? 0;

const SHORT = ["survivors", "spirit-animals", "discard", "warriors", "abandon"];
const cap = (c) => Math.min(2, c);

// Per theme: support copies & payoff copies available in the WHOLE corpus pool
// (every distinct card once, capped at 2) -- the absolute ceiling.
function shareOf(counts, theme) {
  let size = 0, sup = 0;
  for (const [name, raw] of counts) {
    size += cap(raw);
    const e = supportEntryByName(meta, name);
    if (e && (e.supports ?? []).includes(theme)) sup += cap(raw);
  }
  return { share: sup / size, sup, size };
}

// Theme -> list of payoff card names and which themes they need at which tier.
console.log("Payoff cards per short theme (and how many decks carry each):");
const deckCountOf = (name) => decks.filter((d) => d.cards.has(name)).length;
for (const theme of SHORT) {
  const payoffs = Object.values(meta.cards)
    .filter((e) => (e.needs ?? []).some((n) => n.theme === theme))
    .map((e) => ({ name: e.name, tier: e.needs.find((n) => n.theme === theme).tier }));
  const supporters = Object.entries(meta.cards).filter(([, e]) => (e.supports ?? []).includes(theme));
  console.log(`\n== ${theme}  (target ${(TIER_TARGET[payoffs[0]?.tier] ?? 0) * 100}%, ${supporters.length} distinct supporters in metadata)`);
  for (const p of payoffs.sort((a, b) => deckCountOf(b.name) - deckCountOf(a.name))) {
    console.log(`   payoff tier${p.tier}  decks=${String(deckCountOf(p.name)).padStart(3)}  ${p.name}`);
  }
}

// Best achievable support share per theme: grow from every deck, take the max.
const best = Object.fromEntries(SHORT.map((t) => [t, { share: 0, starter: -1 }]));
for (let s = 0; s < decks.length; s++) {
  const { counts } = growIdfPool(decks, idfOf, s, 200);
  for (const theme of SHORT) {
    const { share } = shareOf(counts, theme);
    if (share > best[theme].share) best[theme] = { share, starter: s };
  }
}
console.log("\nBest achievable support share over all real-deck starters (the oracle ceiling):");
for (const theme of SHORT) {
  const payoffTier = Object.values(meta.cards).flatMap((e) => (e.needs ?? []).filter((n) => n.theme === theme).map((n) => n.tier));
  const tgt = TIER_TARGET[Math.max(...payoffTier, 1)];
  const b = best[theme];
  const hit = b.share >= tgt ? "OK " : "MISS";
  console.log(`  ${hit} ${theme.padEnd(16)} ceiling ${(b.share * 100).toFixed(1)}%  vs target ${(tgt * 100).toFixed(0)}%  (best starter deck #${b.starter})`);
}
