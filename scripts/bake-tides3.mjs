// Bake the committed `tides3` artifact the `tides3` pool variant combines into
// draft pools.
//
//   node scripts/bake-tides3.mjs           # writes data/tides3.jsonc + docs/cards2/tides3_decklists.md
//   node scripts/bake-tides3.mjs --out /tmp/tides3.jsonc --doc /tmp/tides3.md
//
// `tides3` is the human-legible counterpart of `sigseed`: instead of growing
// each pool live from a DreamAvatar's signature cards through the pick-affinity
// corpus, every pool is a combination of a few of 32 PRECONSTRUCTED decks
// ("tides") whose lists a player can go read. This bake derives those 32 decks
// from the exact corpus and affinity grower `sigseed` uses, so combining them
// reproduces the pools `sigseed` grows:
//
//   1. Build the pick-affinity corpus `sigseed` grows from (`buildSigSeedCorpus`,
//      i.e. the availability-corrected pick-rate prior + shrunk excess-lift
//      synergy of `pickfit`).
//   2. 20 SIGNATURE tides — one per signatured DreamAvatar: grow `sigseed`'s
//      pool from the DreamAvatar's FULL resolved signature set, baked as a deck.
//      This is the deterministic centre of the pools `sigseed` grows for that
//      DreamAvatar (whose per-run variety is a random signature SUBSET).
//   3. 12 NEUTRAL tides — broad, format-spanning decks grown from farthest-point
//      seed cards, the kind of pool `sigseed` reduces to (plain `pickcohere`)
//      for a signatureless DreamAvatar. They are the generic tail of a signatured
//      pool and the body of a neutral DreamAvatar's pool.
//   4. tidePoolByDreamAvatar — per DreamAvatar, the tides a pool combines, split
//      into LEADS (one drawn at random per run, always joined) and FILL (broad
//      tail). A signatured DreamAvatar has one lead, its own signature tide; a
//      neutral DreamAvatar has every signature tide as a lead candidate, so each
//      run leans toward a random coherent archetype. The fill is broad neutral
//      tides for everyone.
//
// The bake is a pure function of the bundled cards + draft records + signatures
// (no randomness; sorted tie-breaks throughout): re-baking the same inputs yields
// a byte-identical body. Cards are keyed by their stable cards_v2 UUID; `name`
// fields are informational, refreshed at bake time. Run `npm run setup-assets`
// first (it builds the public/ inputs this reads, and afterwards copies the baked
// artifact to public/tides3-data.json for the app).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/pool-data.ts";
import { growAffinityPoolFromSeeds } from "../src/draft/pool/affinity-grower.ts";
import { buildSigSeedCorpus, SIGSEED } from "../src/draft/pool/variant-sigseed.ts";
import { resolveSignatureToCorpus } from "../src/draft/pool/variant-picksig.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Tuning ------------------------------------------------------------------
// The one-stop dial block. Re-bake + `npm run pool-metrics -- --variant tides3`
// and `npm run tides-similarity -- --a tides3 --b sigseed` after editing.
const TUNING = {
  // Copies in a signature tide — one signatured DreamAvatar's `sigseed` pool.
  // Matched to `sigseed`'s own pool size (TIDES3.dealSize = 150) so a signature
  // tide IS a `sigseed` pool: it dominates the pool it leads, keeping the pool
  // as on-identity as `sigseed`'s. (Growing it larger adds a less-on-theme
  // affinity tail that shows up as off-theme traps; 150 is the purity sweet
  // spot.)
  signatureTideSize: 150,
  // Copies in a neutral (broad) tide. Small: one joins every signatured pool as
  // the generic tail (so every pool combines decks and varies run to run via the
  // deal), and neutral DreamAvatars combine several into a broad pool.
  neutralTideSize: 30,
  // How many neutral tides to bake (the format-spanning decks). 20 signature +
  // 12 neutral = 32 tides, the player-facing count.
  neutralTideCount: 12,
  // Only cards whose play-rate prior is at least this fraction of the maximum
  // prior are eligible as a neutral tide's farthest-point seed, so neutral decks
  // anchor on genuinely-played cards rather than fringe singletons.
  neutralSeedPriorFloor: 0.25,
  // How many broad (neutral) tides a signatured DreamAvatar's pool lists as fill,
  // closest first. The runtime joins only enough to fill the pool (usually one),
  // but listing several gives the shuffle room for run-to-run variety.
  signatureFillWidth: 12,
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
// rows are normalised per source card, so the max captures "these two are
// tightly connected"). Used for the neutral-seed farthest-point spread.
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
    .sort((a, b) => a < b ? -1 : 1);
  const priorOf = (c) => corpus.prior.get(c) ?? 0;

  // Seed 0: the highest-prior eligible card.
  let first = eligible[0];
  for (const c of eligible) if (priorOf(c) > priorOf(first)) first = c;
  const seeds = [first];

  while (seeds.length < count && seeds.length < eligible.length) {
    let best = null;
    let bestDist = -Infinity;
    let bestPrior = -Infinity;
    for (const c of eligible) {
      if (seeds.includes(c)) continue;
      // Distance to the nearest chosen seed (smaller affinity = farther).
      let nearest = Infinity;
      for (const s of seeds) {
        const d = 1 - pairAffinity(corpus, c, s);
        if (d < nearest) nearest = d;
      }
      const p = priorOf(c);
      if (
        nearest > bestDist ||
        (nearest === bestDist && (p > bestPrior || (p === bestPrior && best !== null && c < best)))
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
// descending copies then by the grow order's tie-break (id ascending), dropping
// any key with no current name.
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
// by card id. Used to order a signatured DreamAvatar's broad fill tides.
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

// --- Serialization ------------------------------------------------------------

const HEADER = `// data/tides3.jsonc — the 32 committed tide decks the \`tides3\` draft-pool
// variant combines into draft pools.
//
// GENERATED FILE. Regenerated by \`npm run bake-tides3\` from the bundled cards,
// draft records (public/draft-records-data.json) and DreamAvatar signatures — do
// not hand-edit the JSON body. The human-readable rendering of the same data is
// docs/cards2/tides3_decklists.md.
//
// Player-facing contract: a draft pool is built by combining a few tides — the
// DreamAvatar's own signature tide leads, shuffled together with broad tides
// until there are enough cards, then dealing the first 150 (never more than 2
// copies of a card). \`tides3\` is the human-legible counterpart of \`sigseed\`:
// each signature tide is a DreamAvatar's full-signature \`sigseed\` pool baked as
// a deck, and the neutral tides are the broad pools \`sigseed\` reduces to for a
// signatureless DreamAvatar.
//
// Cards are keyed by stable cards_v2 UUID; \`name\` fields are informational,
// refreshed at bake time. \`tidePoolByDreamAvatar\` is keyed by DreamAvatar UUID;
// each entry has \`leads\` (one drawn at random per run, always joined) and
// \`fill\` (the broad tail, shuffled at runtime).
//
// To update: edit the tuning block in scripts/bake-tides3.mjs (or let new draft
// records / signature changes flow in), then:
//   npm run bake-tides3       # rewrites this file + the markdown rendering
//   npm run setup-assets      # copies it to public/tides3-data.json
//   npm run pool-metrics -- --variant tides3   # measures it against sigseed`;

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
  const pools = Object.entries(json.tidePoolByDreamAvatar).map(
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
      `  "tidePoolByDreamAvatar": {`,
      ...pools,
      "  }",
      "}",
    ].join("\n") + "\n"
  );
}

function renderMarkdown(json, dreamAvatars) {
  const tideById = new Map(json.tides.map((t) => [t.id, t]));
  const dcById = new Map(dreamAvatars.map((d) => [d.id, d]));
  const lines = [];
  lines.push("# Tides3 decklists");
  lines.push("");
  lines.push(
    "The 32 preconstructed decks (\"tides\") the `?algo=tides3` draft-pool variant",
    "combines into draft pools. A pool is built by combining a few tides: one lead",
    "tide is drawn at random, shuffled together with broad tides until there are",
    "enough cards, then dealing the first 150 (never more than 2 copies of a card).",
    "`tides3` is the human-legible counterpart of `sigseed` — each signature tide is",
    "a DreamAvatar's full-signature `sigseed` pool baked as a deck. A signatured",
    "DreamAvatar has one lead candidate (its own signature tide), so it always leans",
    "the same way; a neutral DreamAvatar has every signature tide as a lead",
    "candidate, so each run draws a different coherent archetype to lean on — the",
    "way `sigseed` reduces to a coherent, randomly-themed pool for a signatureless",
    "DreamAvatar. The neutral tides are the broad generic tail every pool fills with.",
    "",
    "GENERATED FILE — regenerated by `npm run bake-tides3` together with",
    "`data/tides3.jsonc` (the machine-readable artifact, keyed by card UUID).",
    "",
  );
  lines.push("## Tide pools by DreamAvatar");
  lines.push("");
  lines.push("| DreamAvatar | Lead tide(s) | Fill tides |");
  lines.push("| --- | --- | --- |");
  const nameOfTide = (id) => tideById.get(id)?.name ?? id;
  for (const dc of dreamAvatars) {
    const entry = json.tidePoolByDreamAvatar[dc.id] ?? { leads: [], fill: [] };
    const leads =
      entry.leads.length > 3
        ? `any of ${entry.leads.length} signature archetypes`
        : entry.leads.map(nameOfTide).join("; ");
    const fill = entry.fill.map(nameOfTide).join("; ");
    lines.push(`| ${dc.name} | ${leads || "(none)"} | ${fill || "(none)"} |`);
  }
  lines.push("");
  for (const tide of json.tides) {
    const copies = tide.cards.reduce((s, c) => s + c.copies, 0);
    const owner = tide.dreamAvatarId
      ? dcById.get(tide.dreamAvatarId)?.name
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
  const outRel = str(argv, "--out", "data/tides3.jsonc");
  const docRel = str(argv, "--doc", "docs/cards2/tides3_decklists.md");
  TUNING.signatureTideSize = num(argv, "--signature-size", TUNING.signatureTideSize);
  TUNING.neutralTideSize = num(argv, "--neutral-size", TUNING.neutralTideSize);

  const cards = readJson("public/cards_v2-data.json");
  const decklists = readJson("public/decklists-data.json");
  const draftRecords = readJson("public/draft-records-data.json");
  const dreamAvatars = readJson("public/dream-avatars-v2-data.json");

  const pickRecords = draftRecords.map((r) => ({ packs: r.packIds, picks: r.pickIds }));
  const poolData = buildPoolData(cards, decklists, pickRecords);
  const corpus = buildSigSeedCorpus(poolData);
  if (!corpus || corpus.cards.length === 0) {
    console.error("Empty pick-affinity corpus (no usable draft records).");
    process.exit(1);
  }
  const nameOf = (id) => poolData.cardNameById?.get(id);
  console.log(`Corpus: ${corpus.cards.length} cards from the draft records.`);

  const tides = [];
  // 20 SIGNATURE tides — one per signatured DreamAvatar, grown from its full
  // signature exactly as `sigseed` would (the deterministic all-signatures pool).
  const signatureTideByDreamAvatar = new Map();
  const noSignal = [];
  let sigIdx = 0;
  for (const dc of dreamAvatars) {
    const signature = dc.signatureCardIds ?? [];
    if (signature.length === 0) continue;
    const keys = [...resolveSignatureToCorpus(corpus, signature)].sort();
    if (keys.length === 0) {
      noSignal.push(dc.name);
      continue;
    }
    sigIdx += 1;
    const id = `tide-sig-${String(sigIdx).padStart(2, "0")}`;
    const cardsList = growTideCards(corpus, keys, TUNING.signatureTideSize, nameOf);
    tides.push({
      id,
      name: `${dc.name} signature`,
      role: "signature",
      dreamAvatarId: dc.id,
      cards: cardsList,
    });
    signatureTideByDreamAvatar.set(dc.id, id);
  }

  // 12 NEUTRAL tides — broad, format-spanning decks grown from farthest-point
  // seed cards (the `pickcohere`-style pools `sigseed` reduces to for neutrals).
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

  // tidePoolByDreamAvatar — leads (one drawn at random per run) plus a broad fill
  // tail. The fill is always the broad neutral tides: they carry the generic tail
  // a `sigseed` pool's play-rate prior pulls in, without adding a second theme (an
  // allied signature tide would pull the pool off its lead's identity). The lead
  // is what differs:
  //   * a SIGNATURED DreamAvatar has a single lead candidate — its own signature
  //     tide — so every pool leans the same way, on its own identity;
  //   * a NEUTRAL DreamAvatar has every signature tide as a lead candidate (the
  //     format's coherent archetypes), so each run draws a different one and the
  //     pool is a coherent pool leaning toward a random archetype — the way
  //     `sigseed` reduces to a coherent, randomly-themed `pickcohere` pool for a
  //     signatureless DreamAvatar. Leading with a coherent archetype (rather than
  //     a broad tide combined with unrelated tides) is what keeps a neutral pool
  //     from feeling disjointed.
  const tidePoolByDreamAvatar = {};
  const signatureTideIds = tides
    .filter((t) => t.role === "signature")
    .map((t) => t.id);
  const neutralTideIds = neutralTides.map((t) => t.id);
  for (const dc of dreamAvatars) {
    const ownSig = signatureTideByDreamAvatar.get(dc.id);
    if (ownSig) {
      const lead = tides.find((t) => t.id === ownSig);
      const fill = neutralTides
        .map((t) => ({ id: t.id, s: tideCosine(lead, t) }))
        .sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1))
        .slice(0, TUNING.signatureFillWidth)
        .map((x) => x.id);
      tidePoolByDreamAvatar[dc.id] = { leads: [ownSig], fill };
    } else {
      tidePoolByDreamAvatar[dc.id] = {
        leads: [...signatureTideIds],
        fill: [...neutralTideIds],
      };
    }
  }

  // Strip the bake-only `dreamAvatarId` from the serialized tides (it is recorded
  // in the rendered doc but not part of the runtime schema).
  const json = {
    version: 1,
    tides: tides.map(({ id, name, role, cards }) => ({ id, name, role, cards })),
    tidePoolByDreamAvatar,
  };

  writeFileSync(resolve(ROOT, outRel), serializeArtifact(json));
  // Render with the dream-avatar-id-carrying tides for the owner column.
  writeFileSync(
    resolve(ROOT, docRel),
    renderMarkdown({ ...json, tides }, dreamAvatars) + "\n",
  );

  // Stats.
  const distinct = new Set();
  for (const t of tides) for (const c of t.cards) distinct.add(c.id);
  const sigCount = tides.filter((t) => t.role === "signature").length;
  const neuCount = tides.filter((t) => t.role === "neutral").length;
  console.log(
    `Tides: ${tides.length} (${sigCount} signature, ${neuCount} neutral).`,
  );
  console.log(
    `Sizes: signature ${TUNING.signatureTideSize}, neutral ${TUNING.neutralTideSize} copies.`,
  );
  console.log(
    `Coverage: ${distinct.size} distinct cards across all tides ` +
      `(corpus has ${corpus.cards.length}).`,
  );
  console.log(
    `Tide pools: ${Object.keys(tidePoolByDreamAvatar).length} of ${dreamAvatars.length} DreamAvatars.`,
  );
  if (noSignal.length > 0) {
    console.warn(`Signatured DreamAvatars with no corpus signature: ${noSignal.join(", ")}.`);
  }
  console.log(`Wrote ${outRel} and ${docRel}.`);
}

run();
