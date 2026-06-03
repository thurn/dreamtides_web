// Analyze draft-pool diversity across many unconstrained (no-Dreamcaller) pools.
//
// It generates N pools with the shared algorithm (src/draft_test/color-pool.ts)
// and aggregates how often each card and each theme is selected, how pool size
// and color identity are distributed, and how a card's inclusion rate tracks
// its metadata (core flag, number of color lists, number of draft archetypes).
// The goal is to quantify which cards/archetypes dominate the pool and why.
//
// Usage:
//   node scripts/analyze-pool-diversity.mjs              # 3000 seeds
//   node scripts/analyze-pool-diversity.mjs --seeds 5000 --top 30
import { buildPoolData, generatePoolFromData } from "../src/draft_test/color-pool.ts";
import { loadCards } from "./generate-color-pool.mjs";

const DEFAULT_SEEDS = 3000;
const DEFAULT_TOP = 25;

function num(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? Number(eq.slice(flag.length + 1)) : fallback;
}

const argv = process.argv.slice(2);
const seeds = num(argv, "--seeds", DEFAULT_SEEDS);
const top = num(argv, "--top", DEFAULT_TOP);

const cards = loadCards();
const poolData = buildPoolData(cards);
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

const inclusion = new Map(); // name -> pools containing it
const copies = new Map(); // name -> total copies summed across pools
const themeCount = new Map();
const identityCount = new Map();
const sizes = [];

for (let seed = 0; seed < seeds; seed++) {
  const pool = generatePoolFromData(poolData, seed);
  sizes.push(pool.size);
  identityCount.set(pool.identity, (identityCount.get(pool.identity) ?? 0) + 1);
  for (const t of pool.themes) themeCount.set(t, (themeCount.get(t) ?? 0) + 1);
  for (const [name, n] of pool.counts) {
    inclusion.set(name, (inclusion.get(name) ?? 0) + 1);
    copies.set(name, (copies.get(name) ?? 0) + Math.min(2, n));
  }
}

const rate = (name) => (inclusion.get(name) ?? 0) / seeds;
const avgCopies = (name) =>
  (inclusion.get(name) ?? 0) > 0
    ? (copies.get(name) ?? 0) / (inclusion.get(name) ?? 1)
    : 0;
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const allNames = cards.map((c) => c.name);

// --- summary ---------------------------------------------------------------
const avgSize = sizes.reduce((s, x) => s + x, 0) / sizes.length;
console.log(`# unconstrained pool diversity over ${seeds} seeds`);
console.log(
  `pool size: avg ${avgSize.toFixed(1)}, min ${Math.min(...sizes)}, max ${Math.max(...sizes)}`,
);
console.log(`distinct cards in database: ${allNames.length}`);

// --- inclusion-rate histogram ---------------------------------------------
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

// --- correlation: inclusion vs metadata -----------------------------------
function groupAvg(keyFn) {
  const groups = new Map();
  for (const name of allNames) {
    const k = keyFn(meta.get(name));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(rate(name));
  }
  return [...groups.entries()]
    .map(([k, rs]) => [k, rs.reduce((s, x) => s + x, 0) / rs.length, rs.length])
    .sort((a, b) => Number(a[0]) - Number(b[0]));
}
console.log(`\n## avg inclusion rate by core flag`);
for (const [k, r, n] of groupAvg((m) => (m.core ? "core" : "non-core"))) {
  console.log(`  ${String(k).padEnd(10)} ${pct(r)}  (${n} cards)`);
}
console.log(`\n## avg inclusion rate by number of color lists a card belongs to`);
for (const [k, r, n] of groupAvg((m) =>
  m.nColors === 0 ? 0 : Math.min(20, m.nColors),
)) {
  console.log(`  ${String(k).padStart(2)} color lists  ${pct(r)}  (${n} cards)`);
}
console.log(`\n## avg inclusion rate by number of draft-archetypes`);
for (const [k, r, n] of groupAvg((m) =>
  m.nArch === 0 ? 0 : Math.min(30, Math.floor(m.nArch / 5) * 5),
)) {
  console.log(
    `  ${String(k).padStart(2)}+ archetypes  ${pct(r)}  (${n} cards)`,
  );
}

// --- theme selection frequency --------------------------------------------
const themesSorted = [...themeCount.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n## most-selected themes (of pool's chosen themes)`);
for (const [t, c] of themesSorted.slice(0, top)) {
  console.log(`  ${pct(c / seeds).padStart(6)}  ${t}`);
}
console.log(`\n## least-selected themes`);
for (const [t, c] of themesSorted.slice(-12)) {
  console.log(`  ${pct(c / seeds).padStart(6)}  ${t}`);
}

// --- identity distribution -------------------------------------------------
console.log(`\n## color-identity distribution (top ${top})`);
for (const [id, c] of [...identityCount.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, top)) {
  console.log(`  ${id.toUpperCase().padEnd(6)} ${pct(c / seeds)}`);
}
console.log(`  distinct identities seen: ${identityCount.size} of 31 possible`);

// --- most/least frequent cards with metadata ------------------------------
const ranked = [...allNames]
  .map((name) => ({ name, r: rate(name), ...meta.get(name) }))
  .sort((a, b) => b.r - a.r || a.name.localeCompare(b.name));
const fmt = (c) =>
  `${pct(c.r).padStart(6)} ${avgCopies(c.name).toFixed(2)}x  ` +
  `${c.core ? "CORE " : "     "}cols:${String(c.nColors).padStart(2)} ` +
  `arch:${String(c.nArch).padStart(2)} tides:${String(c.nTides).padStart(1)}  ${c.name}`;
console.log(`\n## most frequent cards (rate, avg copies when present, metadata)`);
for (const c of ranked.slice(0, top)) console.log(`  ${fmt(c)}`);
console.log(`\n## rarest non-core cards that still appear`);
for (const c of ranked.filter((c) => c.r > 0 && !c.core).slice(-top))
  console.log(`  ${fmt(c)}`);
const never = ranked.filter((c) => c.r === 0);
console.log(`\n## cards that NEVER appeared (${never.length})`);
for (const c of never.slice(0, top)) console.log(`  ${fmt(c)}`);
