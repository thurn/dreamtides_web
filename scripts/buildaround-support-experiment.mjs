// Measure how well the generated draft pools support their build-around cards.
//
// A *build-around* (catalogued in docs/cards2/buildarounds.md) does little on its
// own; it only becomes good once the pool supplies the supporting pieces it
// references -- a tribe, a repeatable action, or a board/void state. A pool that
// contains a build-around but too little support for it is a trap: the player
// picks the payoff and can never assemble the deck.
//
// This script simulates the real draft experience -- pick a Dreamcaller, get an
// `idf3` pool (the shipping algorithm, steered by the Dreamcaller's signature
// cards) -- across every Dreamcaller and many seeds, using the exact prototype
// pool code (src/draft/pool). For each build-around present in a pool it measures
// what fraction of the pool supports it and scores that against a per-payoff
// demand target, then synthesizes everything into one headline number plus
// breakdowns that pinpoint the worst-supported payoffs.
//
// The support classification lives in data/buildaround_support.json: per card,
// `needs` (themes it is a build-around payoff for, each with a demand tier 1/2/3)
// and `supports` (themes it provides support for). It was produced by a
// first-principles read of every card's printed text.
//
// Scoring (one-sided -- only under-support is penalized):
//   payoff instance = (build-around card present in a pool, one theme it needs)
//   share    = supportCopies(theme) / poolSize     (the payoff's own copies are
//              excluded from its support tally)
//   target   = TIER_TARGET[tier]
//   adequacy = min(1, share / target)              in [0, 1]
//   headline = mean(adequacy) over all payoff instances, x100  (per-instance)
//
// Trap mode (`--traps`) answers a different question the mean headline hides:
// how many TRAP cards does a real pool carry? A trap is a build-around payoff
// sitting in a pool the pool cannot support, so a player who picks it is stuck.
// A mean washes traps out -- a pool with 50 supported payoffs and 3 dead traps
// still averages ~94. Trap detection reports a COUNT/RATE instead. It collapses
// each payoff card to one adequacy = the MAX over its needed themes (a card is
// only a trap if even its best-supportable theme is unsupported) and flags the
// card when that best adequacy < tau. Trap mode evaluates the REAL production
// pools: it passes each Dreamcaller's FULL signature (no off-theme signature
// omission) and considers ALL themes, because off-identity drift payoffs (e.g. a
// survivors payoff that leaked into an outsiders pool) are exactly the traps.
//
// Usage:
//   node scripts/buildaround-support-experiment.mjs                 # short themes, 200 seeds
//   node scripts/buildaround-support-experiment.mjs --themes all    # score every theme
//   node scripts/buildaround-support-experiment.mjs --seeds 500
//   node scripts/buildaround-support-experiment.mjs --dreamcaller "Kell Tarn"
//   node scripts/buildaround-support-experiment.mjs --top 30
//   node scripts/buildaround-support-experiment.mjs --pool-size 100  # smaller pool
//   node scripts/buildaround-support-experiment.mjs --json > result.json
//   node scripts/buildaround-support-experiment.mjs --traps          # trap-card mode
//   node scripts/buildaround-support-experiment.mjs --traps --trap-tau 0.4
// `--traps` switches into trap mode; `--trap-tau N` (default 0.35) sets the
// adequacy threshold below which a payoff's best theme makes it a trap. Trap
// mode respects --seeds, --pool-size, --variant, --dreamcaller, --top, and
// --json; `--themes` does NOT apply in trap mode (traps are scored across all
// themes, on the real production pool with every signature card).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData, generatePoolFromData } from "../src/draft/pool/index.ts";
import { supportEntryByName } from "./lib/card-refs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

// Demand-tier -> target support share (fraction of the whole pool, in copies).
// One tunable block. Anchored to the user's warrior example: a "+1 for each
// allied warrior" payoff wants ~3-4 warriors on board -> ~25% of the pool warrior
// (tier 3). Tier 2 is a repeated action / 2-3 threshold; tier 1 needs a single
// partner. Recalibrate here after reading the real numbers below.
export const TIER_TARGET = { 1: 0.1, 2: 0.18, 3: 0.25 };

// Matches src/data/quest-content.ts (POOL_TARGET_SIZE) so simulated pools are the
// size the game actually ships. Overridable with `--pool-size N` to study how the
// pool's size trades off against build-around adequacy.
const POOL_TARGET_SIZE = 200;
const DEFAULT_SEEDS = 200;
const DEFAULT_TOP = 20;
// Default trap threshold: a payoff whose best-supportable theme sits under 35%
// of its demand target is a trap (picking it leaves the player stuck).
const DEFAULT_TRAP_TAU = 0.35;

// `--themes short` (the default) scores only this focused set of build-around
// themes; `--themes all` scores every theme in the metadata.
const SHORT_THEMES = new Set([
  "survivors",
  "spirit-animals",
  "discard",
  "warriors",
  "abandon",
]);

/**
 * The dominant theme a Dreamcaller's signature steers toward: the theme cited
 * most often across the signature cards' own `supports`/`needs`. This is the
 * Dreamcaller's intended build-around identity, read straight off the signature
 * (not from whatever incidental support share the grown pool ends up with).
 * Returns null for a neutral Dreamcaller (no signature, or none of its signature
 * cards carry a theme tag).
 */
export function dominantSignatureTheme(signatureCards, meta) {
  const tally = new Map();
  for (const name of signatureCards ?? []) {
    const entry = supportEntryByName(meta, name);
    if (!entry) continue;
    for (const t of entry.supports ?? []) tally.set(t, (tally.get(t) ?? 0) + 1);
    for (const n of entry.needs ?? []) tally.set(n.theme, (tally.get(n.theme) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [t, c] of tally) {
    if (c > bestCount) {
      best = t;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Score one generated pool against the support metadata. Returns one record per
 * *payoff instance*: a build-around present in the pool, for each theme it needs.
 *
 * @param counts Map<cardName, copies> (a 2-of is capped at 2 copies).
 * @param meta   { cards: Record<cardId,{name,needs,supports}>, themes };
 *   entries are looked up by current card name via `supportEntryByName`.
 * @param tierTarget tier -> target support share.
 * @param allowedThemes optional Set; when given, only emit instances whose theme
 *   is in it (support copies are still counted across every theme).
 */
export function scorePool(
  counts,
  meta,
  tierTarget = TIER_TARGET,
  allowedThemes = null,
) {
  const cap = (c) => Math.min(2, c);
  let size = 0;
  for (const c of counts.values()) size += cap(c);

  // Total support copies available per theme across the whole pool.
  const supportCopies = new Map();
  for (const [name, raw] of counts) {
    const entry = supportEntryByName(meta, name);
    if (!entry) continue;
    const copies = cap(raw);
    for (const theme of entry.supports ?? []) {
      supportCopies.set(theme, (supportCopies.get(theme) ?? 0) + copies);
    }
  }

  const instances = [];
  if (size === 0) return instances;
  for (const [name, raw] of counts) {
    const entry = supportEntryByName(meta, name);
    if (!entry || !(entry.needs ?? []).length) continue;
    const copies = cap(raw);
    for (const need of entry.needs) {
      if (allowedThemes && !allowedThemes.has(need.theme)) continue;
      const target = tierTarget[need.tier];
      // Exclude the payoff's own copies, so a lone lord isn't self-supported.
      const self = (entry.supports ?? []).includes(need.theme) ? copies : 0;
      const sc = (supportCopies.get(need.theme) ?? 0) - self;
      const share = sc / size;
      const adequacy = target > 0 ? Math.min(1, share / target) : 1;
      instances.push({
        payoff: name,
        theme: need.theme,
        tier: need.tier,
        supportCopies: sc,
        poolSize: size,
        share,
        adequacy,
      });
    }
  }
  return instances;
}

/**
 * Collapse a pool's payoff instances to one adequacy per *card*: the MAX over
 * the themes that card needs (its best-supportable theme). A card is only a trap
 * if even its best theme is unsupported, so the max is the right collapse.
 *
 * @returns Map<cardName, bestAdequacy in [0,1]>.
 */
export function cardBestAdequacies(
  counts,
  meta,
  tierTarget = TIER_TARGET,
  allowedThemes = null,
) {
  const byCard = new Map();
  for (const inst of scorePool(counts, meta, tierTarget, allowedThemes)) {
    byCard.set(
      inst.payoff,
      Math.max(byCard.get(inst.payoff) ?? 0, inst.adequacy),
    );
  }
  return byCard;
}

/**
 * The payoff cards in a pool that are traps: their best-supportable theme is
 * still under `tau`. Built on top of `cardBestAdequacies`.
 *
 * @returns string[] of trap card names.
 */
export function trapCards(
  counts,
  meta,
  tierTarget = TIER_TARGET,
  tau = DEFAULT_TRAP_TAU,
  allowedThemes = null,
) {
  const traps = [];
  for (const [card, best] of cardBestAdequacies(
    counts,
    meta,
    tierTarget,
    allowedThemes,
  )) {
    if (best < tau) traps.push(card);
  }
  return traps;
}

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

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Mean/append accumulator keyed by an arbitrary string. */
function group() {
  const m = new Map();
  return {
    add(key, adequacy, share) {
      let g = m.get(key);
      if (!g) {
        g = { adequacies: [], shares: [] };
        m.set(key, g);
      }
      g.adequacies.push(adequacy);
      g.shares.push(share);
    },
    entries() {
      return [...m.entries()].map(([key, g]) => ({
        key,
        count: g.adequacies.length,
        meanAdequacy: mean(g.adequacies),
        meanShare: mean(g.shares),
      }));
    },
  };
}

function runTraps(argv) {
  const seeds = num(argv, "--seeds", DEFAULT_SEEDS);
  const top = num(argv, "--top", DEFAULT_TOP);
  const poolSize = num(argv, "--pool-size", POOL_TARGET_SIZE);
  const variant = str(argv, "--variant", "idf3");
  const dcFilter = str(argv, "--dreamcaller", null);
  const asJson = argv.includes("--json");
  const tau = num(argv, "--trap-tau", DEFAULT_TRAP_TAU);

  const cards = readJson("public/cards_v2-data.json");
  const decklists = readJson("public/decklists-data.json");
  let dreamcallers = readJson("public/dreamcallers-v2-data.json");
  const meta = readJson("data/buildaround_support.json");

  if (dcFilter) {
    const q = dcFilter.toLowerCase();
    dreamcallers = dreamcallers.filter(
      (d) => d.id === dcFilter || d.name.toLowerCase() === q,
    );
    if (!dreamcallers.length) {
      console.error(`No Dreamcaller matches "${dcFilter}".`);
      process.exit(1);
    }
  }

  const poolData = buildPoolData(cards, decklists);

  const trapsPerPool = [];
  const poolSizes = [];
  let poolsWithTrap = 0;
  // per-Dreamcaller: trap count and pools-with-trap count.
  const dcTraps = new Map();
  // per-card: number of pools where it appeared as a trap.
  const trapCardPools = new Map();

  for (const dc of dreamcallers) {
    let dcStat = { traps: 0, poolsWithTrap: 0, pools: 0 };
    dcTraps.set(dc.name, dcStat);
    for (let seed = 0; seed < seeds; seed++) {
      // REAL production pool: the FULL signature, every Dreamcaller, all themes.
      const pool = generatePoolFromData(
        poolData,
        seed >>> 0,
        undefined,
        variant,
        undefined,
        poolSize,
        dc.signatureCards ?? [],
      );
      poolSizes.push(pool.size);
      const traps = trapCards(pool.counts, meta, TIER_TARGET, tau, null);
      trapsPerPool.push(traps.length);
      dcStat.pools += 1;
      dcStat.traps += traps.length;
      if (traps.length) {
        poolsWithTrap += 1;
        dcStat.poolsWithTrap += 1;
      }
      for (const card of traps) {
        trapCardPools.set(card, (trapCardPools.get(card) ?? 0) + 1);
      }
    }
  }

  const totalPools = dreamcallers.length * seeds;
  const expectedTrapsPerPool = mean(trapsPerPool);
  const poolsWithTrapPct = totalPools ? poolsWithTrap / totalPools : 0;
  const meanPoolSize = mean(poolSizes);

  const byDreamcaller = [...dcTraps.entries()]
    .map(([name, s]) => ({
      dreamcaller: name,
      trapsPerPool: s.pools ? s.traps / s.pools : 0,
      poolsWithTrapPct: s.pools ? s.poolsWithTrap / s.pools : 0,
      pools: s.pools,
    }))
    .sort((a, b) => b.trapsPerPool - a.trapsPerPool);

  const worstTrapCards = [...trapCardPools.entries()]
    .map(([card, pools]) => ({
      card,
      pools,
      pct: totalPools ? pools / totalPools : 0,
    }))
    .sort((a, b) => b.pools - a.pools);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          config: {
            variant,
            poolSize,
            tau,
            seeds,
            dreamcallers: dreamcallers.length,
            totalPools,
          },
          expectedTrapsPerPool,
          poolsWithTrapPct,
          meanPoolSize,
          byDreamcaller,
          worstTrapCards,
        },
        null,
        2,
      ),
    );
    return;
  }

  const tauPct = Math.round(tau * 100);
  console.log(
    `Trap metric (${variant}, pool size ${poolSize}, tau=${tau}, real production pools, ${seeds} seeds x ${dreamcallers.length} Dreamcallers = ${totalPools} pools)`,
  );
  console.log(
    `  (a trap = a build-around whose best-supported theme is under ${tauPct}% of its demand target)`,
  );
  console.log("");
  console.log(
    `  ===  EXPECTED TRAP CARDS PER POOL: ${expectedTrapsPerPool.toFixed(2)}  ===`,
  );
  console.log(
    `  pools carrying >=1 trap card: ${(poolsWithTrapPct * 100).toFixed(0)}%   (mean pool size ${meanPoolSize.toFixed(0)} copies)`,
  );

  console.log(`\nBy Dreamcaller (most traps per pool first):`);
  for (const e of byDreamcaller) {
    console.log(
      `  ${e.dreamcaller.padEnd(20)} ${e.trapsPerPool.toFixed(2).padStart(5)}   (${(e.poolsWithTrapPct * 100).toFixed(0)}%)`,
    );
  }

  console.log(
    `\nWorst trap cards (pools where the card was a trap, of ${totalPools}), top ${top}:`,
  );
  for (const e of worstTrapCards.slice(0, top)) {
    console.log(
      `  ${String(e.pools).padStart(5)}  ${(e.pct * 100).toFixed(0).padStart(3)}%  ${e.card}`,
    );
  }
}

function run() {
  const argv = process.argv.slice(2);
  if (argv.includes("--traps")) {
    runTraps(argv);
    return;
  }
  const seeds = num(argv, "--seeds", DEFAULT_SEEDS);
  const top = num(argv, "--top", DEFAULT_TOP);
  const poolSize = num(argv, "--pool-size", POOL_TARGET_SIZE);
  const variant = str(argv, "--variant", "idf3");
  const dcFilter = str(argv, "--dreamcaller", null);
  const asJson = argv.includes("--json");
  const themeMode = str(argv, "--themes", "short");
  if (themeMode !== "short" && themeMode !== "all") {
    console.error(`--themes must be "short" or "all" (got "${themeMode}").`);
    process.exit(1);
  }
  const allowedThemes = themeMode === "short" ? SHORT_THEMES : null;

  const cards = readJson("public/cards_v2-data.json");
  const decklists = readJson("public/decklists-data.json");
  let dreamcallers = readJson("public/dreamcallers-v2-data.json");
  const meta = readJson("data/buildaround_support.json");

  if (dcFilter) {
    const q = dcFilter.toLowerCase();
    dreamcallers = dreamcallers.filter(
      (d) => d.id === dcFilter || d.name.toLowerCase() === q,
    );
    if (!dreamcallers.length) {
      console.error(`No Dreamcaller matches "${dcFilter}".`);
      process.exit(1);
    }
  }

  const poolData = buildPoolData(cards, decklists);

  const all = []; // every payoff instance, tagged with its Dreamcaller
  const byTheme = group();
  const byDreamcaller = group();
  const byPayoff = group();
  const poolSizes = [];
  let poolsWithPayoffs = 0;

  for (const dc of dreamcallers) {
    // When scoring a focused theme set (e.g. `--themes short`), a Dreamcaller
    // whose signature steers toward an OUT-OF-SCOPE theme would otherwise be
    // judged purely on drift -- short-theme payoffs that leaked into a pool built
    // around something we deliberately excluded. Omit its off-theme signature so
    // it generates the neutral idf2 pool (like a no-signature Dreamcaller) and is
    // evaluated as a pool, rather than penalised for an identity out of scope. In
    // `--themes all` every signature is in scope, so this never fires.
    const dom = dominantSignatureTheme(dc.signatureCards, meta);
    const signatureInScope = !allowedThemes || dom === null || allowedThemes.has(dom);
    const effectiveSignature = signatureInScope ? dc.signatureCards ?? [] : [];
    // A pool is "steered" when an in-scope signature actually shaped it; neutral
    // and off-theme (omitted-signature) Dreamcallers produce the idf2 pool.
    const steered = effectiveSignature.length > 0 && dom !== null;
    for (let seed = 0; seed < seeds; seed++) {
      const pool = generatePoolFromData(
        poolData,
        seed >>> 0,
        undefined,
        variant,
        undefined,
        poolSize,
        effectiveSignature,
      );
      poolSizes.push(pool.size);
      const instances = scorePool(pool.counts, meta, TIER_TARGET, allowedThemes);
      if (instances.length) poolsWithPayoffs++;
      for (const inst of instances) {
        all.push({ dreamcaller: dc.name, steered, ...inst });
        byTheme.add(inst.theme, inst.adequacy, inst.share);
        byDreamcaller.add(dc.name, inst.adequacy, inst.share);
        byPayoff.add(inst.payoff, inst.adequacy, inst.share);
      }
    }
  }

  const headline = mean(all.map((i) => i.adequacy)) * 100;
  const totalPools = dreamcallers.length * seeds;

  // Worst-supported payoffs: only those that appear often enough to be
  // meaningful (>=2% of their possible appearances), sorted by mean adequacy.
  const minAppear = Math.max(3, Math.ceil(0.02 * totalPools));
  const worstPayoffs = byPayoff
    .entries()
    .filter((e) => e.count >= minAppear)
    .sort((a, b) => a.meanAdequacy - b.meanAdequacy);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          config: {
            variant,
            poolSize,
            seeds,
            dreamcallers: dreamcallers.length,
            themes: themeMode,
            scoredThemes: allowedThemes ? [...allowedThemes] : Object.keys(meta.themes),
            tierTarget: TIER_TARGET,
          },
          headline,
          totalPools,
          poolsWithPayoffs,
          meanPoolSize: mean(poolSizes),
          totalInstances: all.length,
          byTheme: byTheme.entries().sort((a, b) => a.meanAdequacy - b.meanAdequacy),
          byDreamcaller: byDreamcaller.entries().sort((a, b) => a.meanAdequacy - b.meanAdequacy),
          worstPayoffs,
          instances: all,
        },
        null,
        2,
      ),
    );
    return;
  }

  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const themeName = (k) => meta.themes[k]?.name ?? k;

  const themeLabel =
    themeMode === "short"
      ? `short themes (${[...SHORT_THEMES].length})`
      : `all themes (${Object.keys(meta.themes).length})`;
  console.log(
    `Build-around support metric (${variant}, pool size ${poolSize}, ${themeLabel}, ${seeds} seeds x ${dreamcallers.length} Dreamcallers = ${totalPools} pools)`,
  );
  console.log(
    `Tier targets: 1=${pct(TIER_TARGET[1])}  2=${pct(TIER_TARGET[2])}  3=${pct(TIER_TARGET[3])}   mean pool size ${mean(poolSizes).toFixed(0)} copies`,
  );
  console.log("");
  console.log(`  ===  HEADLINE SCORE: ${headline.toFixed(1)} / 100  ===`);
  console.log(
    `  (mean adequacy over ${all.length} payoff instances; ${poolsWithPayoffs}/${totalPools} pools contained a build-around)`,
  );
  if (allowedThemes) {
    // Split the headline by whether an in-scope signature steered the pool. The
    // steered subset answers the question the focused metric is really about:
    // when a player leans into a Dreamcaller built around a scored theme, do its
    // build-arounds get supported? The neutral subset is just the idf2 floor.
    const steeredInst = all.filter((i) => i.steered);
    const neutralInst = all.filter((i) => !i.steered);
    const steeredDc = new Set(steeredInst.map((i) => i.dreamcaller)).size;
    console.log(
      `  steered (${steeredDc} in-scope Dreamcallers): ${(mean(steeredInst.map((i) => i.adequacy)) * 100).toFixed(1)}` +
        `   neutral pools: ${(mean(neutralInst.map((i) => i.adequacy)) * 100).toFixed(1)}`,
    );
  }

  console.log("\nBy theme (mean adequacy, worst first):");
  console.log(`  ${"theme".padEnd(26)} ${"adeq".padStart(6)} ${"support".padStart(8)} ${"instances".padStart(10)}`);
  for (const e of byTheme.entries().sort((a, b) => a.meanAdequacy - b.meanAdequacy)) {
    console.log(
      `  ${themeName(e.key).padEnd(26)} ${(e.meanAdequacy * 100).toFixed(0).padStart(5)}% ${pct(e.meanShare).padStart(8)} ${String(e.count).padStart(10)}`,
    );
  }

  console.log(`\nBy Dreamcaller (mean adequacy, worst first):`);
  for (const e of byDreamcaller.entries().sort((a, b) => a.meanAdequacy - b.meanAdequacy)) {
    console.log(
      `  ${e.key.padEnd(20)} ${(e.meanAdequacy * 100).toFixed(0).padStart(5)}%   (${e.count} instances)`,
    );
  }

  console.log(
    `\nWorst-supported build-arounds (mean adequacy, appears >= ${minAppear} pools), top ${top}:`,
  );
  for (const e of worstPayoffs.slice(0, top)) {
    console.log(
      `  ${(e.meanAdequacy * 100).toFixed(0).padStart(4)}%  support ${pct(e.meanShare).padStart(6)}  x${String(e.count).padStart(5)}  ${e.key}`,
    );
  }
}

// Only run when invoked directly (not when imported by the test).
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) run();
