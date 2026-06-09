// Bake the merchant corpus artifact the journey-v2 dream merchant reads its
// card signals from.
//
//   node scripts/bake-merchant-corpus.mjs        # writes data/merchant_corpus.json
//
// Inputs are the adapted draft records (`docs/draft_records_adapted/*.jsonc`,
// parsed per seat exactly the way `scripts/setup-assets.mjs` bundles them) and
// `data/tabula/cards_v2.toml` for the name<->UUID maps. Everything in the
// artifact is keyed by card UUID; display names appear only in console output.
//
// Per card UUID the bake computes:
//   1. quality      — the conditional-logit `quality[c]` term fit on
//                     taken-over-passed pick choices, min-max normalized to
//                     [0, 1]. Plain-JS mirror of `fitChoiceModel` in
//                     src/draft/pool/variant-pickchoice.ts (PICKCHOICE tuning:
//                     40 epochs, lr 0.05, l2 0.01, minSupport 3).
//   2. multiplicity — mainboardsWith2Plus(c) / mainboardsWith1Plus(c), forced
//                     to 0 when fewer than 5 mainboards contain the card.
//   3. df           — number of corpus mainboards containing the card, so the
//                     runtime can apply minDf gates without the records.
//   4. cluster      — community id from deterministic synchronous label
//                     propagation over an IDF-weighted co-occurrence graph
//                     (top 10 edges per node; same idf/minDf/maxDfFrac
//                     conventions as scripts/draft-replay-experiment.mjs).
//                     Clusters with >= 8 members are retained; each cluster's
//                     flagship maximizes idf(c) * quality(c).
//
// The bake is a pure function of the records + cards_v2.toml: no Date.now, no
// Math.random, every tie broken deterministically (lexicographic UUID). Re-
// baking the same inputs yields a byte-identical artifact, which is what the
// parity check (`npm run merchant-corpus-parity`) verifies.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { loadCardMaps } from "./lib/card-refs.mjs";
import { buildDraftRecords } from "./setup-assets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Relative records directory, recorded in the artifact's `source` field. */
const SOURCE = "docs/draft_records_adapted";

// Mirror of the fit settings in PICKCHOICE (src/draft/pool/variant-pickchoice.ts).
// If you change them there, change them here.
const CHOICE_FIT = {
  minSupport: 3,
  epochs: 40,
  learningRate: 0.05,
  l2: 0.01,
};

// IDF conventions for the cluster graph: same knobs the replay fit model and
// scripts/draft-replay-experiment.mjs use (DEFAULT_FIT_TUNING).
const CLUSTER_GRAPH = {
  idfPower: 1,
  minDf: 2,
  maxDfFrac: 0.6,
  minDeckSize: 16,
  maxDeckSize: 34,
  topEdges: 10,
};

/** Multiplicity is 0 for cards in fewer than this many mainboards. */
const MULTIPLICITY_MIN_MAINBOARDS = 5;
/** Clusters smaller than this are dropped. */
const MIN_CLUSTER_SIZE = 8;
/** Label-propagation round cap (stops earlier on convergence). */
const LABEL_PROPAGATION_ROUNDS = 20;
/** Float rounding, matching DEFAULT_DECIMALS in affinity-corpus-io.ts. */
const DECIMALS = 6;

/** Round to {@link DECIMALS} places, collapsing -0 to 0. */
function round(x) {
  const factor = 10 ** DECIMALS;
  const r = Math.round(x * factor) / factor;
  return Object.is(r, -0) ? 0 : r;
}

// ===========================================================================
// Quality: conditional-logit fit, mirrored from variant-pickchoice.ts.
// ===========================================================================

/**
 * Accumulate the offer/take stats the fit needs from the UUID pick records.
 * Mirrors `accumulatePickStats` (src/draft/pool/pick-stats.ts) with the default
 * unit weight and no position cutoff, keeping only `offered`, `taken`, and
 * `offeredWith` — the maps `buildPickChoiceCorpus` consumes.
 */
function accumulateChoiceStats(pickRecords) {
  const offered = new Map();
  const taken = new Map();
  const offeredWith = new Map();

  const bumpPair = (outer, inner) => {
    let row = offeredWith.get(outer);
    if (row === undefined) {
      row = new Map();
      offeredWith.set(outer, row);
    }
    row.set(inner, (row.get(inner) ?? 0) + 1);
  };

  for (const rec of pickRecords) {
    const poolSoFar = new Set();
    const len = Math.min(rec.packs.length, rec.picks.length);
    for (let i = 0; i < len; i += 1) {
      const chosen = new Set(rec.picks[i]);
      for (const c of new Set(rec.packs[i])) {
        offered.set(c, (offered.get(c) ?? 0) + 1);
        if (chosen.has(c)) taken.set(c, (taken.get(c) ?? 0) + 1);
        for (const d of poolSoFar) {
          if (d !== c) bumpPair(d, c);
        }
      }
      for (const c of chosen) poolSoFar.add(c);
    }
  }

  return { offered, taken, offeredWith };
}

/**
 * One choice sample per taken card: the deduped pack, the index of the taken
 * card within it, and the cards already picked. Mirrors `collectSamples`.
 */
function collectSamples(pickRecords) {
  const samples = [];
  for (const rec of pickRecords) {
    const poolSoFar = [];
    const len = Math.min(rec.packs.length, rec.picks.length);
    for (let i = 0; i < len; i += 1) {
      const pack = [...new Set(rec.packs[i])];
      for (const chosen of rec.picks[i]) {
        const chosenIndex = pack.indexOf(chosen);
        if (chosenIndex !== -1) {
          samples.push({ pack, chosenIndex, pool: [...poolSoFar] });
        }
      }
      for (const c of rec.picks[i]) poolSoFar.push(c);
    }
  }
  return samples;
}

/**
 * Fit the conditional-logit choice model by gradient ascent and return the
 * min-max normalized quality map over the drawable (taken) cards. Mirrors
 * `fitChoiceModel` + the prior normalization in `buildPickChoiceCorpus`
 * (src/draft/pool/variant-pickchoice.ts); the synergy parameters are fit (they
 * shape the quality estimates) but only the quality map is kept.
 *
 * @returns Map of card UUID -> quality in [0, 1].
 */
function fitNormalizedQuality(pickRecords) {
  const { offered, taken, offeredWith } = accumulateChoiceStats(pickRecords);
  if (taken.size === 0) return new Map();

  // Tracked synergy parameters: pairs co-offered at least minSupport times,
  // stored as synergyByCard[c][d] = synergy[d->c], initialised to 0.
  const synergyByCard = new Map();
  for (const [d, row] of offeredWith) {
    for (const [c, ow] of row) {
      if (ow < CHOICE_FIT.minSupport) continue;
      let byD = synergyByCard.get(c);
      if (byD === undefined) {
        byD = new Map();
        synergyByCard.set(c, byD);
      }
      byD.set(d, 0);
    }
  }

  const quality = new Map();
  for (const c of offered.keys()) quality.set(c, 0);

  const samples = collectSamples(pickRecords);
  const { learningRate: lr, l2, epochs } = CHOICE_FIT;

  const utilityOf = (c, pool) => {
    let u = quality.get(c) ?? 0;
    const row = synergyByCard.get(c);
    if (row !== undefined) {
      for (const d of pool) {
        const v = row.get(d);
        if (v !== undefined) u += v;
      }
    }
    return u;
  };

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const { pack, chosenIndex, pool } of samples) {
      // Softmax over the pack.
      const utils = pack.map((c) => utilityOf(c, pool));
      let max = -Infinity;
      for (const u of utils) if (u > max) max = u;
      let sum = 0;
      const probs = utils.map((u) => {
        const e = Math.exp(u - max);
        sum += e;
        return e;
      });
      for (let k = 0; k < probs.length; k += 1) probs[k] /= sum;

      // Gradient of the log-likelihood: (1{chosen} - p_k) per candidate.
      for (let k = 0; k < pack.length; k += 1) {
        const g = (k === chosenIndex ? 1 : 0) - probs[k];
        if (g === 0) continue;
        const c = pack[k];
        quality.set(c, (quality.get(c) ?? 0) + lr * g);
        const row = synergyByCard.get(c);
        if (row !== undefined) {
          for (const d of pool) {
            const v = row.get(d);
            if (v !== undefined) row.set(d, v + lr * g);
          }
        }
      }
    }

    // L2 weight decay.
    const decay = 1 - l2;
    for (const [c, v] of quality) quality.set(c, v * decay);
    for (const row of synergyByCard.values()) {
      for (const [d, v] of row) row.set(d, v * decay);
    }
  }

  // Min-max normalize over the drawable (taken) cards, exactly the way the
  // pickchoice prior is normalized.
  const cards = [...taken.keys()];
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of cards) {
    const q = quality.get(c) ?? 0;
    if (q < lo) lo = q;
    if (q > hi) hi = q;
  }
  const span = hi - lo || 1;
  const normalized = new Map();
  for (const c of cards) normalized.set(c, ((quality.get(c) ?? 0) - lo) / span);
  return normalized;
}

// ===========================================================================
// Multiplicity + df over the corpus mainboards.
// ===========================================================================

/**
 * Per-card mainboard counts over the UUID mainboards (which keep duplicate
 * copies). Returns { df, multiplicity } maps: df is the number of mainboards
 * containing the card at all; multiplicity is with2Plus/with1Plus, forced to 0
 * below {@link MULTIPLICITY_MIN_MAINBOARDS} containing mainboards.
 */
function computeMultiplicityAndDf(mainboards) {
  const with1 = new Map();
  const with2 = new Map();
  for (const deck of mainboards) {
    const copies = new Map();
    for (const c of deck) copies.set(c, (copies.get(c) ?? 0) + 1);
    for (const [c, n] of copies) {
      with1.set(c, (with1.get(c) ?? 0) + 1);
      if (n >= 2) with2.set(c, (with2.get(c) ?? 0) + 1);
    }
  }
  const multiplicity = new Map();
  for (const [c, n1] of with1) {
    multiplicity.set(
      c,
      n1 < MULTIPLICITY_MIN_MAINBOARDS ? 0 : (with2.get(c) ?? 0) / n1,
    );
  }
  return { df: with1, multiplicity };
}

// ===========================================================================
// Clusters: IDF co-occurrence graph + deterministic label propagation.
// ===========================================================================

/**
 * Build the IDF-weighted co-occurrence adjacency over the mainboard UUIDs:
 * hygiene-filter decks to the distinct-card range, derive df/idf with the
 * rare/common cutoffs (the draft-replay-experiment conventions), accumulate the
 * symmetric edge weights idf(a)*idf(b) per shared deck, then keep each node's
 * top {@link CLUSTER_GRAPH.topEdges} edges (weight desc, neighbor UUID asc).
 *
 * @returns { adjacency, idf } — adjacency maps node UUID -> array of
 *   [neighborUuid, weight] kept edges; idf covers every in-window card.
 */
function buildClusterGraph(mainboards) {
  const filtered = [];
  for (const deck of mainboards) {
    const distinct = new Set(deck);
    if (
      distinct.size >= CLUSTER_GRAPH.minDeckSize &&
      distinct.size <= CLUSTER_GRAPH.maxDeckSize
    ) {
      filtered.push(distinct);
    }
  }
  const n = filtered.length;

  const df = new Map();
  for (const s of filtered) for (const c of s) df.set(c, (df.get(c) ?? 0) + 1);
  const maxDf = CLUSTER_GRAPH.maxDfFrac * n;
  const idf = new Map();
  for (const [c, d] of df) {
    if (d < CLUSTER_GRAPH.minDf || d > maxDf) {
      idf.set(c, 0);
      continue;
    }
    idf.set(c, Math.log((n + 1) / d) ** CLUSTER_GRAPH.idfPower);
  }
  const idfOf = (c) => idf.get(c) ?? 0;

  // Symmetric IDF-weighted co-occurrence.
  const cooc = new Map();
  const bump = (a, b, w) => {
    let row = cooc.get(a);
    if (row === undefined) {
      row = new Map();
      cooc.set(a, row);
    }
    row.set(b, (row.get(b) ?? 0) + w);
  };
  for (const s of filtered) {
    const cards = [...s];
    for (let i = 0; i < cards.length; i += 1) {
      const a = cards[i];
      const wa = idfOf(a);
      if (wa === 0) continue;
      for (let j = i + 1; j < cards.length; j += 1) {
        const b = cards[j];
        const w = wa * idfOf(b);
        if (w === 0) continue;
        bump(a, b, w);
        bump(b, a, w);
      }
    }
  }

  // Keep each node's top edges; ties broken by neighbor UUID so the graph is
  // independent of Map iteration order.
  const adjacency = new Map();
  for (const a of [...cooc.keys()].sort()) {
    const edges = [...cooc.get(a)]
      .sort(([ub, wb], [uc, wc]) => wc - wb || (ub < uc ? -1 : 1))
      .slice(0, CLUSTER_GRAPH.topEdges);
    if (edges.length > 0) adjacency.set(a, edges);
  }
  return { adjacency, idf };
}

/**
 * Deterministic synchronous label propagation over the kept-edge adjacency.
 * Every node starts labeled with its own UUID; each round every node adopts the
 * label with the highest total edge weight among its neighbors (lexicographic
 * smallest label on a tie), all reads against the previous round. Stops after
 * {@link LABEL_PROPAGATION_ROUNDS} rounds or when no label changes.
 *
 * @returns Map of node UUID -> final label.
 */
function propagateLabels(adjacency) {
  const nodes = [...adjacency.keys()].sort();
  let labels = new Map(nodes.map((u) => [u, u]));

  for (let r = 0; r < LABEL_PROPAGATION_ROUNDS; r += 1) {
    const next = new Map();
    let changed = false;
    for (const node of nodes) {
      const weightByLabel = new Map();
      for (const [nb, w] of adjacency.get(node)) {
        const label = labels.get(nb) ?? nb;
        weightByLabel.set(label, (weightByLabel.get(label) ?? 0) + w);
      }
      let best = labels.get(node);
      let bestWeight = -Infinity;
      for (const [label, w] of weightByLabel) {
        if (w > bestWeight || (w === bestWeight && label < best)) {
          best = label;
          bestWeight = w;
        }
      }
      next.set(node, best);
      if (best !== labels.get(node)) changed = true;
    }
    labels = next;
    if (!changed) break;
  }
  return labels;
}

/**
 * Group the propagated labels into retained clusters: >= {@link
 * MIN_CLUSTER_SIZE} members, ordered by size descending then smallest member
 * UUID, ids assigned sequentially from 0. Flagship = member maximizing
 * idf(c) * quality(c), ties to the lexicographically smallest UUID.
 *
 * @returns Array of { id, flagship, members } with members sorted by UUID.
 */
function buildClusters(labels, idf, quality) {
  const byLabel = new Map();
  for (const [node, label] of labels) {
    let members = byLabel.get(label);
    if (members === undefined) {
      members = [];
      byLabel.set(label, members);
    }
    members.push(node);
  }

  const retained = [...byLabel.values()]
    .filter((members) => members.length >= MIN_CLUSTER_SIZE)
    .map((members) => members.sort())
    .sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));

  return retained.map((members, id) => {
    let flagship = members[0];
    let bestScore = -Infinity;
    for (const c of members) {
      const score = (idf.get(c) ?? 0) * (quality.get(c) ?? 0);
      if (score > bestScore) {
        flagship = c;
        bestScore = score;
      }
    }
    return { id, flagship, members };
  });
}

// ===========================================================================
// Assembly.
// ===========================================================================

/**
 * Compute the full merchant corpus artifact from the adapted draft records and
 * cards_v2.toml. Pure function of the inputs: deterministic, no I/O beyond the
 * reads. Returns `{ artifact, idToName }` — `artifact` is the JSON-shaped
 * object the bake writes and the parity script re-derives; `idToName` lets
 * callers render display names in console output only.
 */
export function computeMerchantCorpus({
  recordsDir = resolve(ROOT, SOURCE),
  cardsTomlPath = join(ROOT, "data", "tabula", "cards_v2.toml"),
} = {}) {
  const cardMaps = loadCardMaps(cardsTomlPath);
  const records = buildDraftRecords(recordsDir, cardMaps);

  // UUID pick records for the quality fit, exactly the bundle's shape.
  const pickRecords = records.map((r) => ({ packs: r.packIds, picks: r.pickIds }));
  const quality = fitNormalizedQuality(pickRecords);

  // Mainboards as UUID arrays (duplicates preserved). `buildDraftRecords`
  // resolves mainboards to current display names; map back through nameToId.
  const mainboards = records.map((r) =>
    r.mainboard
      .map((name) => cardMaps.nameToId.get(name))
      .filter((id) => id !== undefined),
  );
  const { df, multiplicity } = computeMultiplicityAndDf(mainboards);

  const { adjacency, idf } = buildClusterGraph(mainboards);
  const labels = propagateLabels(adjacency);
  const clusters = buildClusters(labels, idf, quality);
  const clusterOf = new Map();
  for (const cluster of clusters) {
    for (const member of cluster.members) clusterOf.set(member, cluster.id);
  }

  // A card has corpus signal when it was ever taken (quality) or ever
  // mainboarded (df/multiplicity); cards absent from `cards` have none.
  const uuids = [...new Set([...quality.keys(), ...df.keys()])].sort();
  const cards = {};
  for (const uuid of uuids) {
    const entry = {
      quality: round(quality.get(uuid) ?? 0),
      multiplicity: round(multiplicity.get(uuid) ?? 0),
      df: df.get(uuid) ?? 0,
    };
    const cluster = clusterOf.get(uuid);
    if (cluster !== undefined) entry.cluster = cluster;
    cards[uuid] = entry;
  }

  return {
    artifact: { version: 1, source: SOURCE, cards, clusters },
    idToName: cardMaps.idToName,
  };
}

/**
 * Serialize the artifact with one line per card and per cluster, so the
 * committed file diffs row-by-row.
 */
export function serializeMerchantCorpus(artifact) {
  const cardEntries = Object.entries(artifact.cards);
  const cardLines = cardEntries.map(
    ([uuid, entry], i) =>
      `    ${JSON.stringify(uuid)}: ${JSON.stringify(entry)}` +
      (i < cardEntries.length - 1 ? "," : ""),
  );
  const clusterLines = artifact.clusters.map(
    (cluster, i) =>
      `    ${JSON.stringify(cluster)}` +
      (i < artifact.clusters.length - 1 ? "," : ""),
  );
  return (
    [
      "{",
      `  "version": ${artifact.version},`,
      `  "source": ${JSON.stringify(artifact.source)},`,
      '  "cards": {',
      ...cardLines,
      "  },",
      '  "clusters": [',
      ...clusterLines,
      "  ]",
      "}",
    ].join("\n") + "\n"
  );
}

function main() {
  const { artifact, idToName } = computeMerchantCorpus();
  const outPath = join(ROOT, "data", "merchant_corpus.json");
  writeFileSync(outPath, serializeMerchantCorpus(artifact));

  const cardEntries = Object.values(artifact.cards);
  const withQuality = cardEntries.filter((c) => c.quality > 0).length;
  const sizes = artifact.clusters.map((c) => c.members.length);
  console.log(`Wrote ${outPath}`);
  console.log(
    `Cards with corpus signal: ${cardEntries.length} (${withQuality} with quality > 0)`,
  );
  console.log(
    `Clusters: ${artifact.clusters.length} (sizes: ${sizes.join(", ") || "none"})`,
  );
  const flagships = artifact.clusters
    .slice(0, 3)
    .map((c) => `${idToName.get(c.flagship) ?? c.flagship} (cluster ${c.id}, ${c.members.length} members)`);
  console.log(`Top flagships: ${flagships.join("; ") || "none"}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) main();
