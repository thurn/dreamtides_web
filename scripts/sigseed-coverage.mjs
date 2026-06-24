// Which non-starter cards are NEVER shown in any `sigseed` draft pool?
//
// A `sigseed` pool is a pure, deterministic function of the signature SUBSET it is
// grown from (the only run-to-run randomness is which subset is drawn). So the
// COMPLETE set of cards `sigseed` can ever surface is found by enumerating EVERY
// subset of size 1..maxSeedCards of every Dreamcaller's resolved signature and
// growing a pool from each — no sampling, an exact answer. The union of all those
// pools is everything `sigseed` shows; the non-starter cards outside it are the
// answer.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/index.ts";
import { growAffinityPoolFromSeeds } from "../src/draft/pool/affinity-grower.ts";
import { resolveSignatureToCorpus } from "../src/draft/pool/variant-picksig.ts";
import { SIGSEED, buildSigSeedCorpus } from "../src/draft/pool/variant-sigseed.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const cards = readJson("public/cards_v2-data.json");
const draftRecords = readJson("public/draft-records-data.json");
const dreamcallers = readJson("public/dreamcallers-v2-data.json");

const pickRecords =
  Array.isArray(draftRecords) && draftRecords.length
    ? draftRecords.map((r) => ({ packs: r.packIds, picks: r.pickIds }))
    : undefined;
const poolData = buildPoolData(cards, undefined, pickRecords);
const corpus = buildSigSeedCorpus(poolData);
if (!corpus) {
  console.error("No corpus.");
  process.exit(1);
}

// All subsets of `arr` of size 1..maxK.
function subsets(arr, maxK) {
  const out = [];
  const rec = (start, cur) => {
    if (cur.length > 0) out.push(cur.slice());
    if (cur.length === maxK) return;
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i]);
      rec(i + 1, cur);
      cur.pop();
    }
  };
  rec(0, []);
  return out;
}

const shown = new Set(); // corpus keys (lowercase UUIDs) ever in a sigseed pool
let poolsGrown = 0;
const withSig = dreamcallers.filter((d) => (d.signatureCards ?? []).length > 0);

for (const dc of withSig) {
  const resolved = resolveSignatureToCorpus(corpus, dc.signatureCardIds ?? []);
  const keys = [...resolved].sort();
  if (keys.length === 0) continue;
  for (const sub of subsets(keys, SIGSEED.maxSeedCards)) {
    const grown = growAffinityPoolFromSeeds(corpus, sub, SIGSEED.targetSize, SIGSEED);
    for (const key of grown.counts.keys()) shown.add(key.toLowerCase());
    poolsGrown += 1;
  }
}

// Card universe: every non-starter card in cards_v2, keyed by lowercase UUID.
const nameById = new Map();
const universe = [];
for (const c of cards) {
  if (c.isStarter) continue;
  const id = String(c.id).toLowerCase();
  nameById.set(id, c.name);
  universe.push({ id, name: c.name });
}

const corpusKeys = new Set(corpus.cards.map((k) => k.toLowerCase()));
const neverShown = universe
  .filter((c) => !shown.has(c.id))
  .map((c) => ({ ...c, inCorpus: corpusKeys.has(c.id) }))
  .sort((a, b) => a.name.localeCompare(b.name));

console.log(
  `Signature Dreamcallers: ${withSig.length} | pools grown (all subsets): ${poolsGrown}`,
);
console.log(`Non-starter card universe: ${universe.length}`);
console.log(`Distinct non-starter cards ever shown by sigseed: ${universe.length - neverShown.length}`);
console.log(`NEVER shown (non-starter): ${neverShown.length}\n`);

const notInCorpus = neverShown.filter((c) => !c.inCorpus);
const inCorpusUnshown = neverShown.filter((c) => c.inCorpus);
console.log(`  -- of those, absent from the pick corpus entirely: ${notInCorpus.length}`);
console.log(`  -- in the corpus but never selected: ${inCorpusUnshown.length}\n`);

const fmt = (list) =>
  list.map((c) => `  ${c.name}  [${c.id}]`).join("\n");
console.log("=== NEVER SHOWN — not in pick corpus at all ===");
console.log(fmt(notInCorpus) || "  (none)");
console.log("\n=== NEVER SHOWN — in corpus but never selected by any sigseed pool ===");
console.log(fmt(inCorpusUnshown) || "  (none)");
