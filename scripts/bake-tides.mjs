// Bake the committed tide-deck artifact the `tides` pool variant combines into
// draft pools.
//
//   node scripts/bake-tides.mjs                 # writes data/tides.jsonc + docs/cards2/tide_decklists.md
//   node scripts/bake-tides.mjs --out /tmp/tides.jsonc --doc /tmp/tides.md
//
// The `tides` variant is the human-legible counterpart of `idf3`: instead of
// growing each pool from a corpus of hundreds of real decklists, every pool is
// a shuffle of a few of 32 PRECONSTRUCTED decks ("tide decks") whose lists a
// player can go read. This bake derives those 32 decks from the same decklist
// corpus `idf3` reads, so combining them approximates the pools `idf3` grows:
//
//   1. Build the IDF corpus over the bundled real decklists (the exact filter
//      and weights `idf`/`idf2`/`idf3` use).
//   2. 32 ARCHETYPE tides: deterministic k-medoids clustering of the corpus
//      (distance = 1 - IDF-cosine, the similarity `idf3` grows by), balanced
//      so dense corpus regions get several tides (see `minClusterMembers`).
//      Each tide is its cluster's card list ranked by frequency x IDF
//      distinctiveness, with 2 copies for cards in at least `doubleShare` of
//      the cluster's decks, cut at ~`tideSize` copies. The tide's name is its
//      medoid deck's most distinctive (highest-IDF) cards. (No "core" staples
//      tide: the corpus's most-played card appears in only ~14% of decks, so
//      a deck forced into every pool would make its cards ubiquitous in a way
//      no real-deck distribution is.)
//   3. FAVORED tides per Dreamcaller: the tides most IDF-cosine-similar to the
//      Dreamcaller's signature cards — the same probe `idf3` uses to find its
//      anchor decks — baked as an inspectable list. The runtime draws a subset
//      of these, so a Dreamcaller's pools stay on-identity without any hidden
//      runtime scoring.
//
// The bake is a pure function of the bundled decklists + signatures (no
// randomness): re-baking the same inputs yields a byte-identical body. Cards
// are keyed by their stable cards_v2 UUID; `name` fields are informational and
// refreshed at bake time. Run `npm run setup-assets` first (it builds the
// public/ inputs this reads, and afterwards copies the baked artifact to
// public/tides-data.json for the app).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/pool-data.ts";
import { idfCorpus, idfCosine } from "../src/draft/pool/variant-idf.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Tuning ------------------------------------------------------------------
// The one-stop dial block. Re-bake + `npm run tides-similarity` after editing.
const TUNING = {
  // Tide deck count (the player-facing "32 tides").
  clusters: 32,
  // Target copies per tide (the cut point of the ranked card list).
  tideSize: 160,
  // Cluster-frequency floor: cards in fewer member decks than this are dropped
  // (only applied when the cluster has at least `minClusterFreqAt` members).
  minClusterFreq: 2,
  minClusterFreqAt: 4,
  // A card gets 2 copies in its tide when at least this fraction of the
  // cluster's decks run it.
  doubleShare: 0.35,
  // Exponent on a card's IDF weight in the tide ranking score
  // (frequency x idf^idfRankWeight). 0 ranks by raw cluster frequency; higher
  // values concentrate each tide on its cluster's DISTINCTIVE cards, raising
  // the on-theme support share a single tide contributes to a pool.
  idfRankWeight: 2,
  // How many favored tides are baked per signatured Dreamcaller. The runtime
  // draws a subset (see `TIDES.favoredDraw` in variant-tides.ts), so a wider
  // list here means more pool-to-pool variety per Dreamcaller.
  favoredPerDreamcaller: 4,
  // k-medoids refinement rounds (stops earlier when assignments stabilise).
  maxRefineRounds: 20,
  // Cluster balance: clusters with fewer member decks than this are dissolved
  // into their neighbours, and the largest clusters are split to keep the tide
  // count at `clusters`. Dense corpus regions then get several tides — the
  // share of tides covering an archetype tracks the share of real decks
  // playing it, which is what makes the random tide draw mirror the corpus.
  minClusterMembers: 6,
  // How many of the medoid's highest-IDF cards name a tide.
  nameCards: 2,
};

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

function str(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : fallback;
}

// --- Deterministic k-medoids over the IDF corpus -----------------------------

// Pairwise IDF-cosine similarity matrix (n ~ 500, so n^2/2 cosines is cheap).
function similarityMatrix(decks, idfOf) {
  const n = decks.length;
  const sim = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    sim[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const s = idfCosine(decks[i], decks[j], idfOf);
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }
  return sim;
}

// k-medoids with deterministic ties: most-central seed, farthest-first
// initialisation, then alternate assign/recenter. Distance = 1 - similarity.
function kMedoids(sim, k, maxRounds) {
  const n = sim.length;
  const totalDistance = (i, members) => {
    let t = 0;
    for (const m of members) t += 1 - sim[i][m];
    return t;
  };

  const all = Array.from({ length: n }, (_, i) => i);
  // Seed: the most central deck (minimum total distance to the whole corpus).
  let seed = 0;
  let seedBest = Infinity;
  for (let i = 0; i < n; i++) {
    const t = totalDistance(i, all);
    if (t < seedBest) {
      seedBest = t;
      seed = i;
    }
  }
  // Farthest-first: grow the medoid set by the deck farthest from all chosen.
  const medoids = [seed];
  const chosen = new Set(medoids);
  while (medoids.length < k) {
    let next = -1;
    let nextBest = -Infinity;
    for (let i = 0; i < n; i++) {
      if (chosen.has(i)) continue;
      let nearest = Infinity;
      for (const m of medoids) nearest = Math.min(nearest, 1 - sim[i][m]);
      if (nearest > nextBest) {
        nextBest = nearest;
        next = i;
      }
    }
    medoids.push(next);
    chosen.add(next);
  }

  // Alternate assignment and recentering until stable.
  let assignment = new Array(n).fill(0);
  for (let round = 0; round < maxRounds; round++) {
    const nextAssignment = new Array(n);
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestSim = -Infinity;
      for (let c = 0; c < medoids.length; c++) {
        const s = sim[i][medoids[c]];
        if (s > bestSim) {
          bestSim = s;
          best = c;
        }
      }
      nextAssignment[i] = best;
    }
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (nextAssignment[i] !== assignment[i]) {
        changed = true;
        break;
      }
    }
    assignment = nextAssignment;

    for (let c = 0; c < medoids.length; c++) {
      const members = all.filter((i) => assignment[i] === c);
      if (members.length === 0) continue;
      let best = medoids[c];
      let bestTotal = Infinity;
      for (const i of members) {
        const t = totalDistance(i, members);
        if (t < bestTotal) {
          bestTotal = t;
          best = i;
        }
      }
      medoids[c] = best;
    }
    if (!changed && round > 0) break;
  }

  const clusters = medoids.map((medoid, c) => ({
    medoid,
    members: all.filter((i) => assignment[i] === c),
  }));
  return clusters;
}

// The cluster member minimizing total distance to its cluster (ties to the
// earliest member, keeping the bake deterministic).
function centralMember(sim, members) {
  let best = members[0];
  let bestTotal = Infinity;
  for (const i of members) {
    let t = 0;
    for (const m of members) t += 1 - sim[i][m];
    if (t < bestTotal) {
      bestTotal = t;
      best = i;
    }
  }
  return best;
}

// Split one cluster into two by 2-medoid refinement: the most central member
// and the member farthest from it seed the halves, then a few assign/recenter
// rounds settle the split. Deterministic ties throughout.
function splitCluster(sim, cluster, rounds = 10) {
  const members = cluster.members;
  let a = centralMember(sim, members);
  let b = members[0];
  let worst = Infinity;
  for (const i of members) {
    if (sim[i][a] < worst) {
      worst = sim[i][a];
      b = i;
    }
  }
  let left = [];
  let right = [];
  for (let round = 0; round < rounds; round++) {
    const nextLeft = [];
    const nextRight = [];
    for (const i of members) {
      if (sim[i][a] >= sim[i][b]) nextLeft.push(i);
      else nextRight.push(i);
    }
    if (
      nextLeft.length === left.length &&
      nextLeft.every((v, i) => v === left[i])
    ) {
      break;
    }
    left = nextLeft;
    right = nextRight;
    if (left.length === 0 || right.length === 0) break;
    a = centralMember(sim, left);
    b = centralMember(sim, right);
  }
  if (left.length === 0 || right.length === 0) return [cluster];
  return [
    { medoid: a, members: left },
    { medoid: b, members: right },
  ];
}

// Balance the clustering toward corpus density: dissolve clusters smaller
// than `minMembers` (their decks join the nearest surviving cluster), then
// split the largest clusters until the count is back to `k`. Dense regions of
// the corpus end up with several tides, in proportion to how many real decks
// play there.
function balanceClusters(sim, clusters, k, minMembers) {
  const cs = clusters.map((c) => ({ medoid: c.medoid, members: [...c.members] }));

  // Dissolve the smallest under-threshold cluster until none remain.
  for (;;) {
    let smallest = -1;
    for (let c = 0; c < cs.length; c++) {
      if (cs[c].members.length >= minMembers) continue;
      if (smallest === -1 || cs[c].members.length < cs[smallest].members.length) {
        smallest = c;
      }
    }
    if (smallest === -1 || cs.length <= 1) break;
    const orphans = cs[smallest].members;
    cs.splice(smallest, 1);
    for (const i of orphans) {
      let best = 0;
      let bestSim = -Infinity;
      for (let c = 0; c < cs.length; c++) {
        const s = sim[i][cs[c].medoid];
        if (s > bestSim) {
          bestSim = s;
          best = c;
        }
      }
      cs[best].members.push(i);
    }
    for (const c of cs) c.medoid = centralMember(sim, c.members);
  }

  // Split the largest cluster until the tide count is restored.
  while (cs.length < k) {
    let largest = 0;
    for (let c = 1; c < cs.length; c++) {
      if (cs[c].members.length > cs[largest].members.length) largest = c;
    }
    const parts = splitCluster(sim, cs[largest]);
    if (parts.length < 2) break;
    cs.splice(largest, 1, ...parts);
  }
  return cs;
}

// --- Tide construction --------------------------------------------------------

function buildClusterTide(cluster, decks, idfOf, tuning) {
  const members = cluster.members.map((i) => decks[i]);
  const freq = new Map();
  for (const d of members) {
    for (const c of d.cards) {
      freq.set(c, (freq.get(c) ?? 0) + 1);
    }
  }
  const minFreq = members.length >= tuning.minClusterFreqAt ? tuning.minClusterFreq : 1;
  const score = (name, f) => f * idfOf(name) ** tuning.idfRankWeight;
  const ranked = [...freq.entries()]
    .filter(([, f]) => f >= minFreq)
    .sort(
      (a, b) =>
        score(b[0], b[1]) - score(a[0], a[1]) ||
        b[1] - a[1] ||
        (a[0] < b[0] ? -1 : 1),
    );

  const cards = [];
  let total = 0;
  for (const [name, f] of ranked) {
    if (total >= tuning.tideSize) break;
    const copies = f / members.length >= tuning.doubleShare ? 2 : 1;
    cards.push({ name, copies });
    total += copies;
  }

  const medoid = decks[cluster.medoid];
  const name = [...medoid.cards]
    .filter((c) => idfOf(c) > 0)
    .sort((a, b) => idfOf(b) - idfOf(a) || (a < b ? -1 : 1))
    .slice(0, tuning.nameCards)
    .join(" / ");
  return { name, cards, memberCount: members.length };
}

// IDF-cosine of a Dreamcaller's signature probe against a tide's card multiset
// (copies weight the tide vector). This is the same similarity `idf3` scores
// its anchor decks with, applied to tide decks instead of corpus decks.
function probeTideCosine(probeNames, tide, idfOf) {
  let probeSq = 0;
  for (const c of probeNames) probeSq += idfOf(c) ** 2;
  const probeNorm = Math.sqrt(probeSq);
  let tideSq = 0;
  let dot = 0;
  for (const { name, copies } of tide.cards) {
    const w = idfOf(name) * copies;
    tideSq += w * w;
    if (probeNames.has(name)) dot += idfOf(name) ** 2 * copies;
  }
  const tideNorm = Math.sqrt(tideSq);
  if (probeNorm === 0 || tideNorm === 0) return 0;
  return dot / (probeNorm * tideNorm);
}

// --- Serialization -------------------------------------------------------------

// The committed-file header, differing by variant: `tides` selects tides by a
// favored-plus-random draw, while `tides2` is selected by the curated
// relationships in data/tides2_relationships.jsonc (this artifact carries only
// the decklists; its `favoredTidesByDreamcaller` is unused by `tides2`).
function bakeHeader(variant) {
  if (variant === "tides2") {
    return `// data/tides2.jsonc — the committed tide decks the \`tides2\` draft-pool variant
// combines into draft pools.
//
// GENERATED FILE. Regenerated by \`npm run bake-tides2\` from the bundled real
// decklists (public/decklists-data.json) and the Dreamcaller signatures — do
// not hand-edit the JSON body. The human-readable rendering of the same data
// is docs/cards2/tides2_decklists.md.
//
// Player-facing contract: a draft pool is built by drawing a lead tide from the
// Dreamcaller's tide pool, shuffling in the lead's allied tides until there are
// enough cards, then dealing the first 200 (never more than 2 copies of a card).
// Which tides are allied and which a Dreamcaller draws from live in the curated
// data/tides2_relationships.jsonc.
//
// Cards are keyed by stable cards_v2 UUID; \`name\` fields are informational,
// refreshed at bake time.
//
// To update: edit the tuning block in scripts/bake-tides.mjs (or let new draft
// records flow in), then:
//   npm run bake-tides2              # rewrites this file + the markdown rendering
//   npm run seed-tide-relationships --force   # re-seed the relationships, then re-curate
//   npm run setup-assets            # copies both to public/`;
  }
  return `// data/tides.jsonc — the 32 committed tide decks the \`tides\` draft-pool variant
// combines into draft pools.
//
// GENERATED FILE. Regenerated by \`npm run bake-tides\` from the bundled real
// decklists (public/decklists-data.json) and the Dreamcaller signatures — do
// not hand-edit the JSON body. The human-readable rendering of the same data
// is docs/cards2/tide_decklists.md.
//
// Player-facing contract: a draft pool is built by shuffling together one of
// the Dreamcaller's favored tides with tides drawn at random until there are
// enough cards, then dealing the first 200 (never more than 2 copies of a
// card).
//
// Cards are keyed by stable cards_v2 UUID; \`name\` fields are informational,
// refreshed at bake time. \`favoredTidesByDreamcaller\` is keyed by Dreamcaller
// UUID, most signature-similar tide first.
//
// To update: edit the tuning block in scripts/bake-tides.mjs (or let new draft
// records / signature changes flow in), then:
//   npm run bake-tides        # rewrites this file + the markdown rendering
//   npm run setup-assets      # copies it to public/tides-data.json
//   npm run tides-similarity  # measures the result against idf3`;
}

function serializeArtifact(json, header) {
  const coreLine =
    json.coreTideId === undefined
      ? []
      : [`  "coreTideId": ${JSON.stringify(json.coreTideId)},`];
  const tideLines = json.tides.map((tide, t) => {
    const cards = tide.cards.map(
      (c, i) =>
        `        ${JSON.stringify(c)}${i < tide.cards.length - 1 ? "," : ""}`,
    );
    return [
      "    {",
      `      "id": ${JSON.stringify(tide.id)},`,
      `      "name": ${JSON.stringify(tide.name)},`,
      `      "cards": [`,
      ...cards,
      "      ]",
      `    }${t < json.tides.length - 1 ? "," : ""}`,
    ].join("\n");
  });
  const favored = Object.entries(json.favoredTidesByDreamcaller).map(
    ([dc, tides], i, arr) =>
      `    ${JSON.stringify(dc)}: ${JSON.stringify(tides)}${i < arr.length - 1 ? "," : ""}`,
  );
  return (
    [
      header,
      "{",
      `  "version": ${json.version},`,
      ...coreLine,
      `  "tides": [`,
      ...tideLines,
      "  ],",
      `  "favoredTidesByDreamcaller": {`,
      ...favored,
      "  }",
      "}",
    ].join("\n") + "\n"
  );
}

// Marker the `tides2` doc ends the baked (decklists) section with; the seeder
// appends the relationship tables (allied tides, Dreamcaller tide pools) after
// it, since those are generated separately.
export const RELATIONSHIPS_MARKER =
  "<!-- relationships appended by seed-tide-relationships -->";

function renderMarkdown(json, dreamcallers, tideStats, variant) {
  const tideById = new Map(json.tides.map((t) => [t.id, t]));
  const lines = [];
  if (variant === "tides2") {
    lines.push("# Tides2 decklists");
    lines.push("");
    lines.push(
      `The ${String(json.tides.length)} preconstructed decks ("tides") the \`?algo=tides2\``,
      "draft-pool variant combines into draft pools. A pool is built by drawing a",
      "lead tide from the Dreamcaller's tide pool, shuffling in the lead's allied",
      "tides until there are enough cards, then dealing the first 200 (never more",
      "than 2 copies of a card). Which tides are allied and which a Dreamcaller",
      "draws from are listed at the end of this file.",
      "",
      "GENERATED FILE — the decklists below are regenerated by `npm run bake-tides2`",
      "together with `data/tides2.jsonc`; the relationship tables at the end are",
      "appended by `npm run seed-tide-relationships` from",
      "`data/tides2_relationships.jsonc`.",
      "",
    );
  } else {
    lines.push("# Tide decklists");
    lines.push("");
    lines.push(
      "The 32 preconstructed decks (\"tides\") the `?algo=tides` draft-pool variant",
      "combines into draft pools. A pool is built by shuffling together one of the",
      "Dreamcaller's favored tides with tides drawn at random until there are",
      "enough cards, then dealing the first 200 (never more than 2 copies of a",
      "card).",
      "",
      "GENERATED FILE — regenerated by `npm run bake-tides` together with",
      "`data/tides.jsonc` (the machine-readable artifact, keyed by card UUID).",
      "",
    );
    lines.push("## Favored tides by Dreamcaller");
    lines.push("");
    lines.push("| Dreamcaller | Favored tides |");
    lines.push("| --- | --- |");
    for (const dc of dreamcallers) {
      const favored = json.favoredTidesByDreamcaller[dc.id] ?? [];
      const names = favored.map((id) => tideById.get(id)?.name ?? id);
      lines.push(`| ${dc.name} | ${names.join("; ") || "(random tides)"} |`);
    }
    lines.push("");
  }
  for (const tide of json.tides) {
    const stats = tideStats.get(tide.id);
    const copies = tide.cards.reduce((s, c) => s + c.copies, 0);
    lines.push(`## ${tide.name}`);
    lines.push("");
    lines.push(
      `\`${tide.id}\` — ${String(tide.cards.length)} distinct cards, ` +
        `${String(copies)} copies` +
        (stats?.memberCount
          ? `, distilled from ${String(stats.memberCount)} real decks`
          : ""),
    );
    lines.push("");
    for (const card of tide.cards) {
      lines.push(`- ${String(card.copies)}× ${card.name}`);
    }
    lines.push("");
  }
  if (variant === "tides2") {
    lines.push(RELATIONSHIPS_MARKER);
    lines.push("");
  }
  return lines.join("\n");
}

// --- Main ----------------------------------------------------------------------

function num(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? Number(eq.slice(flag.length + 1)) : fallback;
}

function run() {
  const argv = process.argv.slice(2);
  const outRel = str(argv, "--out", "data/tides.jsonc");
  const docRel = str(argv, "--doc", "docs/cards2/tide_decklists.md");
  // Which variant this bake feeds: `tides` (default) or `tides2`, derived from
  // the output path, so the header and rendered doc carry the right story.
  const variant = outRel.includes("tides2") ? "tides2" : "tides";
  // Experiment overrides for the headline tuning dials (see TUNING above).
  TUNING.tideSize = num(argv, "--tide-size", TUNING.tideSize);
  TUNING.idfRankWeight = num(argv, "--idf-rank-weight", TUNING.idfRankWeight);
  TUNING.doubleShare = num(argv, "--double-share", TUNING.doubleShare);

  const cards = readJson("public/cards_v2-data.json");
  const decklists = readJson("public/decklists-data.json");
  const dreamcallers = readJson("public/dreamcallers-v2-data.json");

  const idByName = new Map();
  for (const card of cards) {
    if (card.id && !idByName.has(card.name)) idByName.set(card.name, card.id);
  }

  const poolData = buildPoolData(cards, decklists);
  const corpus = idfCorpus(poolData);
  if (!corpus) {
    console.error("No usable decklists in public/decklists-data.json.");
    process.exit(1);
  }
  const { decks, idf } = corpus;
  const idfOf = (c) => idf.get(c) ?? 0;
  console.log(`Corpus: ${decks.length} filtered decklists, ${idf.size} distinct cards.`);

  // Archetype tides from deterministic k-medoids clusters, balanced so the
  // tide count per corpus region tracks how many real decks play there.
  const sim = similarityMatrix(decks, idfOf);
  const clusters = balanceClusters(
    sim,
    kMedoids(sim, TUNING.clusters, TUNING.maxRefineRounds),
    TUNING.clusters,
    TUNING.minClusterMembers,
  );
  const namedTides = clusters
    .map((cluster) => buildClusterTide(cluster, decks, idfOf, TUNING))
    .filter((t) => t.cards.length > 0);

  // Resolve names to UUIDs, dropping (with a warning) any unresolvable card.
  const dropped = new Set();
  const toJsonCards = (cardList) =>
    cardList.flatMap(({ name, copies }) => {
      const id = idByName.get(name);
      if (!id) {
        dropped.add(name);
        return [];
      }
      return [{ id, name, copies }];
    });

  const tideStats = new Map();
  const tides = [];
  namedTides.forEach((tide, i) => {
    const id = `tide-${String(i + 1).padStart(2, "0")}`;
    tides.push({ id, name: tide.name, cards: toJsonCards(tide.cards) });
    tideStats.set(id, { memberCount: tide.memberCount });
  });

  // Favored tides per signatured Dreamcaller, by signature-probe cosine.
  const archetypeTides = tides;
  const favoredTidesByDreamcaller = {};
  const noSignal = [];
  for (const dc of dreamcallers) {
    const signature = dc.signatureCards ?? [];
    const probeNames = new Set(signature.filter((c) => idfOf(c) > 0));
    const droppedSig = signature.filter((c) => !probeNames.has(c));
    if (droppedSig.length > 0) {
      console.warn(
        `Signature cards with no corpus IDF weight for ${dc.name}: ` +
          `${droppedSig.join(", ")}.`,
      );
    }
    if (probeNames.size === 0) {
      if (signature.length > 0) noSignal.push(dc.name);
      continue;
    }
    const scored = archetypeTides
      .map((tide) => ({
        tide,
        score: probeTideCosine(
          probeNames,
          { cards: tide.cards },
          idfOf,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (a.tide.id < b.tide.id ? -1 : 1))
      .slice(0, TUNING.favoredPerDreamcaller);
    if (scored.length > 0) {
      favoredTidesByDreamcaller[dc.id] = scored.map((x) => x.tide.id);
    }
  }

  const json = {
    version: 1,
    tides,
    favoredTidesByDreamcaller,
  };

  writeFileSync(resolve(ROOT, outRel), serializeArtifact(json, bakeHeader(variant)));
  writeFileSync(
    resolve(ROOT, docRel),
    renderMarkdown(json, dreamcallers, tideStats, variant) + "\n",
  );

  // Stats.
  const distinctPooled = new Set();
  for (const t of tides) for (const c of t.cards) distinctPooled.add(c.name);
  const weighted = [...idf.entries()].filter(([, w]) => w > 0).length;
  const sizes = tides.map(
    (t) => `${t.id}:${String(t.cards.reduce((s, c) => s + c.copies, 0))}`,
  );
  console.log(`Tides: ${tides.length}.`);
  console.log(`Copies per tide: ${sizes.join(" ")}`);
  console.log(
    `Coverage: ${distinctPooled.size} distinct cards across all tides ` +
      `(corpus has ${idf.size} cards, ${weighted} IDF-weighted).`,
  );
  console.log(
    `Favored tides baked for ${Object.keys(favoredTidesByDreamcaller).length} ` +
      `of ${dreamcallers.length} Dreamcallers.`,
  );
  if (noSignal.length > 0) {
    console.warn(`Signatured Dreamcallers with no usable probe: ${noSignal.join(", ")}.`);
  }
  if (dropped.size > 0) {
    console.warn(
      `Dropped ${dropped.size} card names with no cards_v2 UUID: ` +
        `${[...dropped].join(", ")}.`,
    );
  }
  console.log(`Wrote ${outRel} and ${docRel}.`);
}

run();
