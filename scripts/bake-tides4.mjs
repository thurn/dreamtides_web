// Bake the committed `tides4` artifact the `tides4` pool variant combines into
// draft pools.
//
//   node scripts/bake-tides4.mjs           # writes data/tides4.jsonc + docs/cards2/tides4_decklists.md
//   node scripts/bake-tides4.mjs --out /tmp/tides4.jsonc --doc /tmp/tides4.md
//
// `tides4` is the human-legible counterpart of `sigseed`, built to reproduce the
// run-to-run VARIETY `sigseed` gets from growing each pool from a fresh random
// SUBSET of a Dreamcaller's signature cards. `tides3` bakes only the deterministic
// CENTRE of that variety (one all-signatures pool per Dreamcaller) and so ships
// nearly the same pool every run; `tides4` instead bakes the AXES of the variety
// as separate decks and recombines a random few per run, the way `sigseed`
// recombines a random subset of signature anchors. This bake derives those decks
// from the exact corpus and affinity grower `sigseed` uses:
//
//   1. Build the pick-affinity corpus `sigseed` grows from (`buildSigSeedCorpus`).
//   2. SIGNATURE tides — one per signatured Dreamcaller: its signature cards
//      themselves, at `starterCopies` copies each. This is the always-joined
//      identity floor, standing in for the signature anchors `sigseed` always
//      seeds with.
//   3. FACET tides — a shared library of single-anchor `sigseed` pools, one per
//      selected anchor card. Each facet is the coherent "lean" that one
//      signature-region card grows into. Drawing a random few of a Dreamcaller's
//      facets each run is the direct analogue of `sigseed`'s random signature
//      subset. The facet anchors are chosen from the union of every signatured
//      Dreamcaller's signature cards by per-Dreamcaller round-robin (most-played
//      first), so every Dreamcaller's strongest signature cards become facets and
//      the library stays within `facetBudget` decks.
//   4. NEUTRAL tides — broad, format-spanning decks grown from farthest-point seed
//      cards, the kind of pool `sigseed` reduces to (plain `pickcohere`) for a
//      signatureless Dreamcaller; also the generic tail that tops a pool up.
//   5. tidePoolByDreamcaller — per Dreamcaller, its starter (its signature tide,
//      or null), the on-identity facets a random subset is drawn from, and the
//      broad neutral tail. A signatured Dreamcaller draws its subset from its own
//      on-identity facets; a signatureless Dreamcaller draws from the whole facet
//      library, so each run leans toward a random coherent archetype.
//
// The bake is a pure function of the bundled cards + draft records + signatures
// (no randomness; sorted tie-breaks throughout): re-baking the same inputs yields
// a byte-identical body. Cards are keyed by their stable cards_v2 UUID; `name`
// fields are informational, refreshed at bake time. Run `npm run setup-assets`
// first (it builds the public/ inputs this reads, and afterwards copies the baked
// artifact to public/tides4-data.json for the app).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/pool-data.ts";
import { growAffinityPoolFromSeeds } from "../src/draft/pool/affinity-grower.ts";
import { buildSigSeedCorpus, SIGSEED } from "../src/draft/pool/variant-sigseed.ts";
import {
  buildSignatureAffinity,
  resolveSignatureToCorpus,
} from "../src/draft/pool/variant-picksig.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Tuning ------------------------------------------------------------------
// The one-stop dial block. Re-bake + `npm run pool-metrics -- --variant tides4`
// (against `--variant sigseed`) after editing.
const TUNING = {
  // Copies in a Dreamcaller's signature (starter) tide — its full-signature
  // `sigseed` pool, grown from all its signature cards at once. This is the dense,
  // on-theme CORE every one of the Dreamcaller's pools is built on (it is exactly
  // `tides3`'s signature tide), always joined; the facets perturb the lean on top
  // of it. Sized below `sigseed`'s 150 so a few facet cards always join, which is
  // where the run-to-run variety comes from.
  starterSize: 110,
  // Copies in a facet tide — one single-anchor `sigseed` pool, the coherent lean
  // one signature-region card grows into. Small, so drawing a random few of them
  // perturbs the starter's lean (the variety engine) without swamping its
  // on-theme core. A few join every pool to top it past `sigseed`'s 150.
  facetSize: 45,
  // How many facet tides to bake (the shared library spanning the signature
  // anchors). Capped so the player-facing deck count stays small.
  facetBudget: 32,
  // The most on-identity facets a signatured Dreamcaller lists (a random subset is
  // drawn from these each run). Wider than the runtime subset size so the subset
  // draw has room for run-to-run variety.
  facetsPerDreamcaller: 8,
  // A facet is on a Dreamcaller's identity when its anchor's normalised signature
  // affinity clears this floor. Keeps a Dreamcaller's facet list on-theme rather
  // than pulling in distant leans.
  facetAffinityFloor: 0.15,
  // Copies in a neutral (broad) tide.
  neutralTideSize: 30,
  // How many neutral tides to bake (the format-spanning decks).
  neutralTideCount: 12,
  // Only cards whose play-rate prior is at least this fraction of the maximum
  // prior are eligible as a neutral tide's farthest-point seed, so neutral decks
  // anchor on genuinely-played cards rather than fringe singletons.
  neutralSeedPriorFloor: 0.25,
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

function num(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? Number(eq.slice(flag.length + 1)) : fallback;
}

// --- Affinity helpers (operate in the corpus's UUID key space) ----------------

// A card's strongest partnership to another card, in either direction (affinity
// rows are normalised per source card). Used for the neutral-seed farthest-point
// spread.
function pairAffinity(corpus, a, b) {
  const fromA = corpus.affinity.get(a)?.get(b) ?? 0;
  const fromB = corpus.affinity.get(b)?.get(a) ?? 0;
  return fromA > fromB ? fromA : fromB;
}

// Choose `count` neutral-tide seed cards by farthest-point sampling: start from
// the highest-prior card, then repeatedly add the eligible card whose nearest
// already-chosen seed is the most distant (1 - affinity). Eligible cards clear a
// play-rate-prior floor so neutral decks anchor on played cards. Deterministic
// ties: higher prior, then id ascending.
function chooseNeutralSeeds(corpus, count, priorFloor) {
  let maxPrior = 0;
  for (const c of corpus.cards) {
    const p = corpus.prior.get(c) ?? 0;
    if (p > maxPrior) maxPrior = p;
  }
  const floor = maxPrior * priorFloor;
  const eligible = corpus.cards
    .filter((c) => (corpus.prior.get(c) ?? 0) >= floor)
    .sort((a, b) => (a < b ? -1 : 1));
  const priorOf = (c) => corpus.prior.get(c) ?? 0;

  let first = eligible[0];
  for (const c of eligible) if (priorOf(c) > priorOf(first)) first = c;
  const seeds = [first];

  while (seeds.length < count && seeds.length < eligible.length) {
    let best = null;
    let bestDist = -Infinity;
    let bestPrior = -Infinity;
    for (const c of eligible) {
      if (seeds.includes(c)) continue;
      let nearest = Infinity;
      for (const s of seeds) {
        const d = 1 - pairAffinity(corpus, c, s);
        if (d < nearest) nearest = d;
      }
      const p = priorOf(c);
      if (
        nearest > bestDist ||
        (nearest === bestDist &&
          (p > bestPrior || (p === bestPrior && best !== null && c < best)))
      ) {
        bestDist = nearest;
        bestPrior = p;
        best = c;
      }
    }
    if (best === null) break;
    seeds.push(best);
  }
  return seeds;
}

// Grow one tide and turn the UUID-keyed counts into `{ id, name, copies }` card
// entries (id = the corpus UUID key, name from `cardNameById`), ordered by
// descending copies then by id ascending, dropping any key with no current name.
function growTideCards(corpus, seedKeys, size, nameOf) {
  const { counts } = growAffinityPoolFromSeeds(corpus, seedKeys, size, SIGSEED);
  const cards = [];
  for (const [id, copies] of counts) {
    const name = nameOf(id);
    if (name === undefined) continue;
    cards.push({ id, name, copies });
  }
  cards.sort((a, b) => b.copies - a.copies || (a.id < b.id ? -1 : 1));
  return cards;
}

// Cosine similarity between two tides' card multisets (copies as weights), keyed
// by card id. Used to order a signatured Dreamcaller's broad neutral tail.
function tideCosine(a, b) {
  const va = new Map(a.cards.map((c) => [c.id, c.copies]));
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of va.values()) na += v * v;
  for (const c of b.cards) {
    nb += c.copies * c.copies;
    const w = va.get(c.id);
    if (w) dot += w * c.copies;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Select up to `budget` facet-anchor cards from the per-Dreamcaller resolved
// signature lists by round-robin: in round r, each Dreamcaller (in id order)
// contributes its r-th most-played not-yet-chosen anchor. This guarantees every
// Dreamcaller's strongest signature cards become facets before any Dreamcaller's
// weaker ones, and shared anchors are baked once. Deterministic throughout.
function chooseFacetAnchors(dcAnchors, priorOf, budget) {
  // Each Dreamcaller's anchors, most-played first (tie: id ascending).
  const ranked = dcAnchors.map(({ dcId, keys }) => ({
    dcId,
    keys: [...keys].sort((a, b) => priorOf(b) - priorOf(a) || (a < b ? -1 : 1)),
  }));
  ranked.sort((a, b) => (a.dcId < b.dcId ? -1 : 1));
  const chosen = [];
  const chosenSet = new Set();
  const maxRounds = Math.max(0, ...ranked.map((r) => r.keys.length));
  for (let round = 0; round < maxRounds && chosen.length < budget; round++) {
    for (const r of ranked) {
      if (chosen.length >= budget) break;
      const key = r.keys[round];
      if (key !== undefined && !chosenSet.has(key)) {
        chosen.push(key);
        chosenSet.add(key);
      }
    }
  }
  return chosen;
}

// --- Serialization ------------------------------------------------------------

const HEADER = `// data/tides4.jsonc — the committed tide decks the \`tides4\` draft-pool variant
// combines into draft pools.
//
// GENERATED FILE. Regenerated by \`npm run bake-tides4\` from the bundled cards,
// draft records (public/draft-records-data.json) and Dreamcaller signatures — do
// not hand-edit the JSON body. The human-readable rendering of the same data is
// docs/cards2/tides4_decklists.md.
//
// Player-facing contract: a draft pool is built by combining a few tides — the
// Dreamcaller's signature tide, plus a random subset of its theme (facet) tides,
// shuffled together and topped up with broad tides until there are enough cards,
// then dealing the first 150 (never more than 2 copies of a card). \`tides4\` is
// the human-legible counterpart of \`sigseed\`: each facet tide is a single-anchor
// \`sigseed\` pool, and drawing a random subset of them reproduces the variety
// \`sigseed\` gets from a random signature subset.
//
// Cards are keyed by stable cards_v2 UUID; \`name\` fields are informational,
// refreshed at bake time. \`tidePoolByDreamcaller\` is keyed by Dreamcaller UUID;
// each entry has \`starter\` (the always-joined signature tide, or null), \`facets\`
// (a random subset is drawn each run) and \`neutral\` (the broad tail).
//
// To update: edit the tuning block in scripts/bake-tides4.mjs (or let new draft
// records / signature changes flow in), then:
//   npm run bake-tides4       # rewrites this file + the markdown rendering
//   npm run setup-assets      # copies it to public/tides4-data.json
//   npm run pool-metrics -- --variant tides4   # measures it against sigseed`;

function serializeArtifact(json) {
  const tideLines = json.tides.map((tide, t) => {
    const cards = tide.cards.map(
      (c, i) =>
        `        ${JSON.stringify(c)}${i < tide.cards.length - 1 ? "," : ""}`,
    );
    return [
      "    {",
      `      "id": ${JSON.stringify(tide.id)},`,
      `      "name": ${JSON.stringify(tide.name)},`,
      `      "role": ${JSON.stringify(tide.role)},`,
      `      "cards": [`,
      ...cards,
      "      ]",
      `    }${t < json.tides.length - 1 ? "," : ""}`,
    ].join("\n");
  });
  const pools = Object.entries(json.tidePoolByDreamcaller).map(
    ([dc, entry], i, arr) =>
      `    ${JSON.stringify(dc)}: ${JSON.stringify(entry)}${i < arr.length - 1 ? "," : ""}`,
  );
  return (
    [
      HEADER,
      "{",
      `  "version": ${json.version},`,
      `  "tides": [`,
      ...tideLines,
      "  ],",
      `  "tidePoolByDreamcaller": {`,
      ...pools,
      "  }",
      "}",
    ].join("\n") + "\n"
  );
}

function renderMarkdown(json, dreamcallers) {
  const tideById = new Map(json.tides.map((t) => [t.id, t]));
  const dcById = new Map(dreamcallers.map((d) => [d.id, d]));
  const lines = [];
  lines.push("# Tides4 decklists");
  lines.push("");
  lines.push(
    "The preconstructed decks (\"tides\") the `?algo=tides4` draft-pool variant",
    "combines into draft pools. A pool is built by combining a few tides: the",
    "Dreamcaller's signature tide is always joined, a random subset of its theme",
    "(facet) tides is drawn, and broad tides top the pool up; the combined bag is",
    "shuffled and the first 150 cards are dealt (never more than 2 copies of a",
    "card). `tides4` is the human-legible counterpart of `sigseed` — each facet tide",
    "is a single-anchor `sigseed` pool, and drawing a random subset of a",
    "Dreamcaller's facets reproduces the variety `sigseed` gets from growing each",
    "pool from a random subset of its signature cards. A signatureless Dreamcaller",
    "draws its subset from the whole facet library, so each run leans toward a",
    "different coherent archetype.",
    "",
    "GENERATED FILE — regenerated by `npm run bake-tides4` together with",
    "`data/tides4.jsonc` (the machine-readable artifact, keyed by card UUID).",
    "",
  );
  lines.push("## Tide pools by Dreamcaller");
  lines.push("");
  lines.push("| Dreamcaller | Starter | Facets (random subset drawn) | Neutral tail |");
  lines.push("| --- | --- | --- | --- |");
  const nameOfTide = (id) => tideById.get(id)?.name ?? id;
  for (const dc of dreamcallers) {
    const entry = json.tidePoolByDreamcaller[dc.id] ?? {
      starter: null,
      facets: [],
      neutral: [],
    };
    const starter = entry.starter ? nameOfTide(entry.starter) : "(none)";
    const facets =
      entry.facets.length > 4
        ? `${entry.facets.slice(0, 4).map(nameOfTide).join("; ")}; … (${entry.facets.length})`
        : entry.facets.map(nameOfTide).join("; ");
    const neutral =
      entry.neutral.length > 3
        ? `${entry.neutral.length} broad tides`
        : entry.neutral.map(nameOfTide).join("; ");
    lines.push(
      `| ${dc.name} | ${starter} | ${facets || "(none)"} | ${neutral || "(none)"} |`,
    );
  }
  lines.push("");
  for (const tide of json.tides) {
    const copies = tide.cards.reduce((s, c) => s + c.copies, 0);
    const owner = tide.dreamcallerId
      ? dcById.get(tide.dreamcallerId)?.name
      : undefined;
    lines.push(`## ${tide.name}`);
    lines.push("");
    lines.push(
      `\`${tide.id}\` — ${tide.role} tide, ${String(tide.cards.length)} distinct cards, ` +
        `${String(copies)} copies` +
        (owner ? `, ${owner}'s signature` : ""),
    );
    lines.push("");
    for (const card of tide.cards) {
      lines.push(`- ${String(card.copies)}× ${card.name}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// --- Main ---------------------------------------------------------------------

function run() {
  const argv = process.argv.slice(2);
  const outRel = str(argv, "--out", "data/tides4.jsonc");
  const docRel = str(argv, "--doc", "docs/cards2/tides4_decklists.md");
  TUNING.facetSize = num(argv, "--facet-size", TUNING.facetSize);
  TUNING.facetBudget = num(argv, "--facet-budget", TUNING.facetBudget);
  TUNING.neutralTideSize = num(argv, "--neutral-size", TUNING.neutralTideSize);

  const cards = readJson("public/cards_v2-data.json");
  const decklists = readJson("public/decklists-data.json");
  const draftRecords = readJson("public/draft-records-data.json");
  const dreamcallers = readJson("public/dreamcallers-v2-data.json");

  const pickRecords = draftRecords.map((r) => ({ packs: r.packIds, picks: r.pickIds }));
  const poolData = buildPoolData(cards, decklists, pickRecords);
  const corpus = buildSigSeedCorpus(poolData);
  if (!corpus || corpus.cards.length === 0) {
    console.error("Empty pick-affinity corpus (no usable draft records).");
    process.exit(1);
  }
  const nameOf = (id) => poolData.cardNameById?.get(id);
  const priorOf = (id) => corpus.prior.get(id) ?? 0;
  console.log(`Corpus: ${corpus.cards.length} cards from the draft records.`);

  const tides = [];

  // SIGNATURE (starter) tides — one per signatured Dreamcaller: its signature
  // cards at `starterCopies` copies each. Records the resolved anchor keys per
  // Dreamcaller for facet selection and per-Dreamcaller facet ranking.
  const starterByDreamcaller = new Map();
  const anchorsByDreamcaller = new Map(); // dcId -> resolved corpus keys (sorted)
  const noSignal = [];
  let sigIdx = 0;
  for (const dc of dreamcallers) {
    const signature = dc.signatureCards ?? [];
    if (signature.length === 0) continue;
    const keys = [
      ...resolveSignatureToCorpus(corpus, signature, poolData.cardIdByName),
    ].sort();
    if (keys.length === 0) {
      noSignal.push(dc.name);
      continue;
    }
    anchorsByDreamcaller.set(dc.id, keys);
    sigIdx += 1;
    const id = `tide-sig-${String(sigIdx).padStart(2, "0")}`;
    // The starter is the full-signature `sigseed` pool — the dense on-theme core.
    const cardsList = growTideCards(corpus, keys, TUNING.starterSize, nameOf);
    tides.push({
      id,
      name: `${dc.name} signature`,
      role: "signature",
      dreamcallerId: dc.id,
      cards: cardsList,
    });
    starterByDreamcaller.set(dc.id, id);
  }

  // FACET tides — a shared library of single-anchor `sigseed` pools. Anchors are
  // chosen from the union of all signatures by per-Dreamcaller round-robin so
  // every Dreamcaller's strongest cards become facets within the budget.
  const dcAnchors = [...anchorsByDreamcaller.entries()].map(([dcId, keys]) => ({
    dcId,
    keys,
  }));
  const facetAnchors = chooseFacetAnchors(dcAnchors, priorOf, TUNING.facetBudget);
  const facetTideByAnchor = new Map();
  facetAnchors.forEach((anchor, i) => {
    const id = `tide-fac-${String(i + 1).padStart(2, "0")}`;
    const cardsList = growTideCards(corpus, [anchor], TUNING.facetSize, nameOf);
    tides.push({
      id,
      name: `Lean: ${nameOf(anchor) ?? anchor}`,
      role: "facet",
      anchorKey: anchor,
      cards: cardsList,
    });
    facetTideByAnchor.set(anchor, id);
  });
  const facetTides = tides.filter((t) => t.role === "facet");

  // NEUTRAL tides — broad, format-spanning decks (the `pickcohere`-style pools
  // `sigseed` reduces to for signatureless Dreamcallers, and the generic tail).
  const neutralSeeds = chooseNeutralSeeds(
    corpus,
    TUNING.neutralTideCount,
    TUNING.neutralSeedPriorFloor,
  );
  const neutralTides = [];
  neutralSeeds.forEach((seed, i) => {
    const id = `tide-neu-${String(i + 1).padStart(2, "0")}`;
    const cardsList = growTideCards(corpus, [seed], TUNING.neutralTideSize, nameOf);
    const top = cardsList.slice(0, 2).map((c) => c.name).join(" / ");
    const tide = { id, name: `Broad: ${top}`, role: "neutral", cards: cardsList };
    tides.push(tide);
    neutralTides.push(tide);
  });
  const neutralIds = neutralTides.map((t) => t.id);
  const allFacetIds = facetTides.map((t) => t.id);

  // tidePoolByDreamcaller — starter + on-identity facets + broad neutral tail.
  //   * a SIGNATURED Dreamcaller's facets are the library facets whose anchor
  //     clears its signature-affinity floor (always including its own anchors'
  //     facets), most on-theme first, capped at `facetsPerDreamcaller`; its
  //     neutral tail is the broad tides nearest its starter by cosine.
  //   * a SIGNATURELESS Dreamcaller draws its subset from the whole facet library
  //     (so each run leans a random coherent archetype) and its tail is every
  //     broad tide — mirroring how `sigseed` reduces to `pickcohere`.
  const tidePoolByDreamcaller = {};
  const facetById = new Map(facetTides.map((t) => [t.id, t]));
  for (const dc of dreamcallers) {
    const starter = starterByDreamcaller.get(dc.id) ?? null;
    const anchors = anchorsByDreamcaller.get(dc.id);
    if (starter && anchors) {
      const sigAff = buildSignatureAffinity(
        corpus,
        dc.signatureCards ?? [],
        poolData.cardIdByName,
      );
      const ownAnchorSet = new Set(anchors);
      const ranked = facetTides
        .map((t) => ({
          id: t.id,
          // Own-anchor facets sit at affinity 1 (anchors are in the signature
          // set), so they always rank first and are always included.
          aff: sigAff.get(t.anchorKey) ?? 0,
          own: ownAnchorSet.has(t.anchorKey),
        }))
        .filter((x) => x.own || x.aff >= TUNING.facetAffinityFloor)
        .sort((a, b) => b.aff - a.aff || (a.id < b.id ? -1 : 1));
      // Guarantee a non-empty facet list even if the floor excludes everything.
      const facets = (ranked.length > 0 ? ranked : facetTides.map((t) => ({ id: t.id })))
        .slice(0, TUNING.facetsPerDreamcaller)
        .map((x) => x.id);
      const starterTide = tides.find((t) => t.id === starter);
      const neutral = neutralTides
        .map((t) => ({ id: t.id, s: tideCosine(starterTide, t) }))
        .sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1))
        .map((x) => x.id);
      tidePoolByDreamcaller[dc.id] = { starter, facets, neutral };
    } else {
      tidePoolByDreamcaller[dc.id] = {
        starter: null,
        facets: [...allFacetIds],
        neutral: [...neutralIds],
      };
    }
  }

  // Strip the bake-only `dreamcallerId`/`anchorKey` from the serialized tides (the
  // runtime schema carries id/name/role/cards only); the doc render keeps them.
  const json = {
    version: 1,
    tides: tides.map(({ id, name, role, cards }) => ({ id, name, role, cards })),
    tidePoolByDreamcaller,
  };

  writeFileSync(resolve(ROOT, outRel), serializeArtifact(json));
  writeFileSync(
    resolve(ROOT, docRel),
    renderMarkdown({ ...json, tides }, dreamcallers) + "\n",
  );

  // Stats.
  const distinct = new Set();
  for (const t of tides) for (const c of t.cards) distinct.add(c.id);
  const sigCount = tides.filter((t) => t.role === "signature").length;
  const facCount = tides.filter((t) => t.role === "facet").length;
  const neuCount = tides.filter((t) => t.role === "neutral").length;
  const sigFacetCounts = [...anchorsByDreamcaller.keys()].map(
    (dcId) => tidePoolByDreamcaller[dcId].facets.length,
  );
  const meanFacets = sigFacetCounts.length
    ? sigFacetCounts.reduce((s, x) => s + x, 0) / sigFacetCounts.length
    : 0;
  console.log(
    `Tides: ${tides.length} (${sigCount} signature, ${facCount} facet, ${neuCount} neutral).`,
  );
  console.log(
    `Facets per signatured Dreamcaller: min ${Math.min(...sigFacetCounts)}, ` +
      `mean ${meanFacets.toFixed(1)}, max ${Math.max(...sigFacetCounts)}.`,
  );
  console.log(
    `Coverage: ${distinct.size} distinct cards across all tides ` +
      `(corpus has ${corpus.cards.length}).`,
  );
  console.log(
    `Tide pools: ${Object.keys(tidePoolByDreamcaller).length} of ${dreamcallers.length} Dreamcallers.`,
  );
  if (noSignal.length > 0) {
    console.warn(
      `Signatured Dreamcallers with no corpus signature: ${noSignal.join(", ")}.`,
    );
  }
  console.log(`Wrote ${outRel} and ${docRel}.`);
}

run();
