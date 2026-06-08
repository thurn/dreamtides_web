// Bake the committed card embedding the `embedded` pool variant grows from.
//
//   node scripts/bake-affinity-corpus.mjs            # rank 32 (default), writes data/affinity_embedding.json
//   node scripts/bake-affinity-corpus.mjs --rank 16
//   node scripts/bake-affinity-corpus.mjs --out /tmp/embedding.json
//   node scripts/bake-affinity-corpus.mjs --matrix-dump /tmp/matrix.json   # debug only, not committed
//
// Pipeline (see docs/cards2/affinity_corpus_distillation_design.md §5-§8):
//   1. Load the same inputs the metric reads from `public/` (run
//      `npm run setup-assets` first to produce them).
//   2. Build the base record-derived affinity corpus (`buildPickfitCorpus`).
//   3. Fold in the committed overlay recipes (`data/affinity_overlay.jsonc`).
//   4. Fit the low-rank embedding via a seeded randomized truncated SVD.
//   5. Write `data/affinity_embedding.json` (committed — run on demand, not by
//      setup-assets, so the committed embedding stays authoritative).
//
// All randomness is seeded from a fixed constant, so re-baking the same inputs
// (records + overlay) yields byte-identical output.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/pool-data.ts";
import { buildPickfitCorpus } from "../src/draft/pool/variant-pickfit.ts";
import {
  applyOverlay,
  fitEmbedding,
  DEFAULT_EMBEDDING_RANK,
} from "../src/draft/pool/affinity-corpus-io.ts";
import { stripJsonComments } from "./lib/card-refs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function num(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? Number(eq.slice(flag.length + 1)) : fallback;
}
function str(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : fallback;
}

function readJson(rel) {
  const path = resolve(ROOT, rel);
  if (!existsSync(path)) {
    console.error(
      `Missing ${rel}. Run \`npm run setup-assets\` first to build the public assets the bake reads.`,
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

// Serialize with cards/prior on one line each and one U/V row per line, so the
// committed artifact diffs row-by-row and stays reviewable for size and sanity.
function serializeEmbedding(json) {
  const rows = (arr) =>
    arr.map((row, i) => `    ${JSON.stringify(row)}${i < arr.length - 1 ? "," : ""}`);
  return (
    [
      "{",
      `  "version": ${json.version},`,
      `  "kind": ${JSON.stringify(json.kind)},`,
      `  "rank": ${json.rank},`,
      `  "cards": ${JSON.stringify(json.cards)},`,
      `  "prior": ${JSON.stringify(json.prior)},`,
      `  "U": [`,
      ...rows(json.U),
      "  ],",
      `  "V": [`,
      ...rows(json.V),
      "  ]",
      "}",
    ].join("\n") + "\n"
  );
}

function loadBaseCorpus() {
  const cards = readJson("public/cards_v2-data.json");
  const draftRecords = readJson("public/draft-records-data.json");
  const decklists = readJson("public/decklists-data.json");
  const pickRecords =
    Array.isArray(draftRecords) && draftRecords.length
      ? draftRecords.map((r) => ({ packs: r.packIds, picks: r.pickIds }))
      : undefined;
  const poolData = buildPoolData(cards, decklists, pickRecords);
  const corpus = buildPickfitCorpus(poolData);
  if (!corpus || corpus.cards.length === 0) {
    console.error(
      "The base affinity corpus is empty — public/draft-records-data.json carries no usable picks.",
    );
    process.exit(1);
  }
  return corpus;
}

function loadOverlay() {
  const path = resolve(ROOT, "data/affinity_overlay.jsonc");
  if (!existsSync(path)) return { add: [], edit: [] };
  const parsed = JSON.parse(stripJsonComments(readFileSync(path, "utf8")));
  return { add: parsed.add ?? [], edit: parsed.edit ?? [] };
}

// Index-keyed sparse matrix dump (Section 6.3): a debugging convenience for
// inspecting raw post-overlay synergies, never committed or shipped.
function dumpMatrix(corpus) {
  const index = new Map(corpus.cards.map((c, i) => [c, i]));
  const affinity = [];
  for (const [d, row] of corpus.affinity) {
    const di = index.get(d);
    if (di === undefined) continue;
    const entries = [];
    for (const [c, v] of row) {
      const ci = index.get(c);
      if (ci !== undefined) entries.push([ci, Math.round(v * 1e5) / 1e5]);
    }
    if (entries.length) affinity.push([di, entries]);
  }
  return {
    cards: corpus.cards,
    prior: corpus.cards.map((c) => Math.round((corpus.prior.get(c) ?? 0) * 1e5) / 1e5),
    affinity,
  };
}

function run() {
  const argv = process.argv.slice(2);
  const rank = num(argv, "--rank", DEFAULT_EMBEDDING_RANK);
  const outRel = str(argv, "--out", "data/affinity_embedding.json");
  const matrixDump = str(argv, "--matrix-dump", null);

  const base = loadBaseCorpus();
  const overlay = loadOverlay();
  const added = (overlay.add ?? []).length;
  const edited = (overlay.edit ?? []).length;
  const corpus = applyOverlay(base, overlay);

  let nnz = 0;
  for (const row of corpus.affinity.values()) nnz += row.size;
  console.log(
    `Base+overlay corpus: ${corpus.cards.length} cards, ${nnz} nonzero affinities ` +
      `(overlay: ${added} added, ${edited} edited).`,
  );

  if (matrixDump) {
    const out = resolve(ROOT, matrixDump);
    writeFileSync(out, JSON.stringify(dumpMatrix(corpus)) + "\n");
    console.log(`Wrote debug matrix dump to ${matrixDump}.`);
  }

  const embedding = fitEmbedding(corpus, { rank });
  const out = resolve(ROOT, outRel);
  writeFileSync(out, serializeEmbedding(embedding));
  console.log(
    `Wrote rank-${embedding.rank} embedding (${embedding.cards.length} cards) to ${outRel}.`,
  );
}

run();
