// Is the under-support DRIFT at the growth periphery? Two probes, real idf3 draw:
//  (1) target-size sweep: does a TIGHTER pool (fewer far decks) score higher?
//  (2) provenance prune: if we score only payoffs whose source deck is within
//      similarity T of the starter (drop the drift tail), how high can we get,
//      and how many payoff cards would we be dropping from the 200-card pool?
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData, generatePoolFromData } from "../src/draft/pool/index.ts";
import { scorePool, TIER_TARGET } from "./pool-metrics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const SHORT = new Set(["survivors", "spirit-animals", "discard", "warriors", "abandon"]);
const SEEDS = Number(process.argv[2] ?? 60);

const cards = readJson("public/cards_v2-data.json");
const decklists = readJson("public/decklists-data.json");
const dreamcallers = readJson("public/dreamcallers-v2-data.json");
const meta = readJson("data/buildaround_support.json");
const poolData = buildPoolData(cards, decklists);

console.log("(1) target-size sweep (does a tighter pool score higher?)");
for (const size of [120, 150, 180, 200, 240]) {
  const all = [];
  for (const dc of dreamcallers)
    for (let s = 0; s < SEEDS; s++) {
      const pool = generatePoolFromData(poolData, s >>> 0, undefined, "idf3", undefined, size, dc.signatureCards ?? []);
      for (const i of scorePool(pool.counts, meta, TIER_TARGET, SHORT)) all.push(i.adequacy);
    }
  console.log(`   size=${String(size).padStart(3)}  headline ${(mean(all) * 100).toFixed(1)}  (${all.length} instances)`);
}

console.log("\n(2) provenance prune: score only payoffs sourced within similarity >= T of starter");
for (const T of [0.0, 0.15, 0.25, 0.35, 0.45]) {
  const all = [];
  let kept = 0, dropped = 0;
  for (const dc of dreamcallers)
    for (let s = 0; s < SEEDS; s++) {
      const pool = generatePoolFromData(poolData, s >>> 0, undefined, "idf3", undefined, 200, dc.signatureCards ?? []);
      const prov = pool.idf3Provenance?.cardProvenanceByName ?? {};
      for (const i of scorePool(pool.counts, meta, TIER_TARGET, SHORT)) {
        const p = prov[i.payoff];
        const sim = p ? p.sourceSimilarity : 1;
        if (sim >= T) { all.push(i.adequacy); kept++; } else dropped++;
      }
    }
  console.log(`   T=${T.toFixed(2)}  headline ${(mean(all) * 100).toFixed(1)}  kept ${kept}  dropped ${dropped} payoff-instances`);
}
