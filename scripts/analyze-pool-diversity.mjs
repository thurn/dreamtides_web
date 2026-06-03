// Analyze draft-pool diversity across the realistic draft-test flow: every pool
// is gated through a Dreamcaller. Players are offered three random Dreamcallers
// and pick one, which averages to a uniform draw over all 32, so this rotates
// uniformly through them — seeding each pool with the chosen Dreamcaller's
// draft archetypes (the 12 Dreamcallers without archetypes roll the
// unconstrained pool). Pass `--unconstrained` to instead analyze raw
// no-Dreamcaller pools.
//
// It aggregates how often each card and each theme is selected, how pool size
// and color identity are distributed, and how a card's inclusion rate tracks
// its metadata (core flag, number of color lists, number of draft archetypes).
// The goal is to quantify which cards/archetypes dominate the pool and why.
//
// Usage:
//   node scripts/analyze-pool-diversity.mjs                       # default, 3000 seeds
//   node scripts/analyze-pool-diversity.mjs --variant diverse
//   node scripts/analyze-pool-diversity.mjs --compare             # default vs diverse
//   node scripts/analyze-pool-diversity.mjs --unconstrained       # ignore Dreamcallers
//   node scripts/analyze-pool-diversity.mjs --seeds 5000 --top 30
import { buildPoolData, generatePoolFromData } from "../src/draft_test/color-pool.ts";
import { loadCards, loadDreamcallers } from "./generate-color-pool.mjs";

const DEFAULT_SEEDS = 3000;
const DEFAULT_TOP = 25;

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

const argv = process.argv.slice(2);
const seeds = num(argv, "--seeds", DEFAULT_SEEDS);
const top = num(argv, "--top", DEFAULT_TOP);
const compare = argv.includes("--compare");
const variant = str(argv, "--variant", "default");
const unconstrained = argv.includes("--unconstrained");

const cards = loadCards();
const poolData = buildPoolData(cards);
// Dreamcaller draft-archetype lists to rotate through (undefined == open pool).
// In `--unconstrained` mode a single null entry generates no-Dreamcaller pools.
const dreamcallers = loadDreamcallers();
const seedLists = unconstrained
  ? [undefined]
  : dreamcallers.map((d) => d.draftArchetypes);
const seedFor = (seed) => seedLists[seed % seedLists.length];
const meta = new Map(
  cards.map((c) => [
    c.name,
    {
      core: c.core,
      nColors: c.colors.length,
      nArch: c.draftArchetypes.length,
      nTides: c.tides.length,
    },
  ]),
);
const allNames = cards.map((c) => c.name);
const nonCore = allNames.filter((n) => !meta.get(n).core);
// Universe of possible themes: every mechanic + color-archetype list.
const themeUniverse = [
  ...[...poolData.archLists.keys()].map((k) => `A:${k}`),
  ...[...poolData.draftLists.keys()].filter((k) => k.includes("-")).map((k) => `D:${k}`),
];

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}
function stats(values) {
  const n = values.length;
  const mean = values.reduce((s, x) => s + x, 0) / n;
  const variance = values.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  return {
    mean,
    sd,
    cov: mean > 0 ? sd / mean : 0,
    min: sorted[0],
    max: sorted[n - 1],
    p10: q(0.1),
    p50: q(0.5),
    p90: q(0.9),
  };
}

/** Run `seeds` Dreamcaller-gated pools of `variant` and return aggregate counters. */
function simulate(variant) {
  const inclusion = new Map();
  const copies = new Map();
  const themeCount = new Map();
  const identityCount = new Map();
  const sizes = [];
  let totalSlots = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const pool = generatePoolFromData(poolData, seed, seedFor(seed), variant);
    sizes.push(pool.size);
    identityCount.set(pool.identity, (identityCount.get(pool.identity) ?? 0) + 1);
    for (const t of pool.themes) themeCount.set(t, (themeCount.get(t) ?? 0) + 1);
    for (const [name, n] of pool.counts) {
      const c = Math.min(2, n);
      inclusion.set(name, (inclusion.get(name) ?? 0) + 1);
      copies.set(name, (copies.get(name) ?? 0) + c);
      totalSlots += c;
    }
  }
  return { inclusion, copies, themeCount, identityCount, sizes, totalSlots };
}

/** Compact balance metrics for one variant's run. */
function metrics(agg) {
  const cardRates = nonCore.map((n) => (agg.inclusion.get(n) ?? 0) / seeds);
  const themeRates = themeUniverse.map((t) => (agg.themeCount.get(t) ?? 0) / seeds);
  const cardStat = stats(cardRates);
  const themeStat = stats(themeRates);
  const ranked = [...agg.copies.entries()].sort((a, b) => b[1] - a[1]);
  let topSlots = 0;
  for (let i = 0; i < 50 && i < ranked.length; i++) topSlots += ranked[i][1];
  return {
    avgSize: agg.sizes.reduce((s, x) => s + x, 0) / agg.sizes.length,
    identities: agg.identityCount.size,
    card: cardStat,
    cardZero: cardRates.filter((r) => r === 0).length,
    cardBelow5: cardRates.filter((r) => r < 0.05).length,
    theme: themeStat,
    themeZero: themeRates.filter((r) => r === 0).length,
    themeBelow1: themeRates.filter((r) => r < 0.01).length,
    top50Share: topSlots / agg.totalSlots,
  };
}

function printMetrics(label, m) {
  console.log(`\n## ${label}`);
  console.log(`avg pool size: ${m.avgSize.toFixed(1)}   identities seen: ${m.identities}/31`);
  console.log(`top-50 cards share of slots: ${pct(m.top50Share)}`);
  console.log(
    `non-core card inclusion: mean ${pct(m.card.mean)}  CoV ${m.card.cov.toFixed(2)}  ` +
      `min ${pct(m.card.min)}  p10 ${pct(m.card.p10)}  p50 ${pct(m.card.p50)}  ` +
      `p90 ${pct(m.card.p90)}  max ${pct(m.card.max)}`,
  );
  console.log(`  cards never included: ${m.cardZero}   below 5%: ${m.cardBelow5} of ${nonCore.length}`);
  console.log(
    `archetype selection: mean ${pct(m.theme.mean)}  CoV ${m.theme.cov.toFixed(2)}  ` +
      `min ${pct(m.theme.min)}  p10 ${pct(m.theme.p10)}  p50 ${pct(m.theme.p50)}  ` +
      `p90 ${pct(m.theme.p90)}  max ${pct(m.theme.max)}`,
  );
  console.log(`  themes never selected: ${m.themeZero}   below 1%: ${m.themeBelow1} of ${themeUniverse.length}`);
}

const flow = unconstrained
  ? "unconstrained (no Dreamcaller)"
  : `Dreamcaller-gated (uniform over ${seedLists.length})`;

if (compare) {
  console.log(
    `# diversity comparison over ${seeds} ${flow} pools (lower CoV = more balanced)`,
  );
  printMetrics("variant: default", metrics(simulate("default")));
  printMetrics("variant: diverse", metrics(simulate("diverse")));
} else {
  detailedReport(variant);
}

// --- detailed single-variant report ----------------------------------------
function detailedReport(variant) {
  const agg = simulate(variant);
  const { inclusion, copies, themeCount, identityCount, sizes, totalSlots } = agg;
  const rate = (name) => (inclusion.get(name) ?? 0) / seeds;
  const avgCopies = (name) =>
    (inclusion.get(name) ?? 0) > 0
      ? (copies.get(name) ?? 0) / (inclusion.get(name) ?? 1)
      : 0;
  const avgSize = sizes.reduce((s, x) => s + x, 0) / sizes.length;
  console.log(`# ${variant} pool diversity over ${seeds} ${flow} pools`);
  console.log(
    `pool size: avg ${avgSize.toFixed(1)}, min ${Math.min(...sizes)}, max ${Math.max(...sizes)}`,
  );
  console.log(`distinct cards in database: ${allNames.length}`);
  printMetrics(`balance metrics (${variant})`, metrics(agg));

  const buckets = [
    ["100%", (r) => r >= 0.999],
    ["90-99%", (r) => r >= 0.9 && r < 0.999],
    ["70-90%", (r) => r >= 0.7 && r < 0.9],
    ["50-70%", (r) => r >= 0.5 && r < 0.7],
    ["30-50%", (r) => r >= 0.3 && r < 0.5],
    ["10-30%", (r) => r >= 0.1 && r < 0.3],
    ["1-10%", (r) => r >= 0.01 && r < 0.1],
    ["<1% (>0)", (r) => r > 0 && r < 0.01],
    ["never (0%)", (r) => r === 0],
  ];
  console.log(`\n## card inclusion-rate histogram`);
  for (const [label, test] of buckets) {
    const n = allNames.filter((name) => test(rate(name))).length;
    console.log(`  ${label.padEnd(12)} ${String(n).padStart(4)} cards`);
  }

  const themesSorted = [...themeCount.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n## most-selected themes`);
  for (const [t, c] of themesSorted.slice(0, top)) {
    console.log(`  ${pct(c / seeds).padStart(6)}  ${t}`);
  }
  console.log(`\n## least-selected themes (of those ever selected)`);
  for (const [t, c] of themesSorted.slice(-12)) {
    console.log(`  ${pct(c / seeds).padStart(6)}  ${t}`);
  }

  const ranked = [...allNames]
    .map((name) => ({ name, r: rate(name), ...meta.get(name) }))
    .sort((a, b) => b.r - a.r || a.name.localeCompare(b.name));
  const fmt = (c) =>
    `${pct(c.r).padStart(6)} ${avgCopies(c.name).toFixed(2)}x  ` +
    `${c.core ? "CORE " : "     "}cols:${String(c.nColors).padStart(2)} ` +
    `arch:${String(c.nArch).padStart(2)}  ${c.name}`;
  console.log(`\n## most frequent non-core cards`);
  for (const c of ranked.filter((c) => !c.core).slice(0, top)) console.log(`  ${fmt(c)}`);
  console.log(`\n## rarest non-core cards`);
  for (const c of ranked.filter((c) => !c.core).slice(-top)) console.log(`  ${fmt(c)}`);
}
