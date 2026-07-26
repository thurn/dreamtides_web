// Simulate draft pools for each v2 DreamAvatar and report aggregate statistics,
// so pool construction can be analyzed across many seeds.
//
// Pools are built with the exact algorithm the app uses: this script seeds the
// shared generator (`src/draft/pool/index.ts`) from each DreamAvatar's
// `draft-archetypes`. A DreamAvatar without that list rolls the unconstrained
// random pool, mirroring picking it in the draft test harness.
//
// For each DreamAvatar it runs N reproducible seeds (base-seed + i) and reports
// pool size, color-identity distribution, character/event mix, the energy-cost
// curve, the most frequently selected themes, and the most frequently included
// cards.
//
// Usage:
//   node scripts/simulate-dream-avatar-pools.mjs                       # all, 200 seeds
//   node scripts/simulate-dream-avatar-pools.mjs --seeds 500
//   node scripts/simulate-dream-avatar-pools.mjs --dream-avatar "Kell Tarn"
//   node scripts/simulate-dream-avatar-pools.mjs --top 15
//   node scripts/simulate-dream-avatar-pools.mjs --json > pools.json
import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import { buildPoolData, generatePoolFromData } from "../src/draft/pool/index.ts";
import { loadCards, loadDreamAvatars, findDreamAvatar } from "./generate-color-pool.mjs";

const CARD_TOML = new URL("../data/tabula/cards_v2.toml", import.meta.url)
  .pathname;

const DEFAULT_SEEDS = 200;
const DEFAULT_TOP = 12;

/** Build a card-name -> { cost, type, spark } metadata map from cards_v2.toml. */
function loadCardMeta(tomlPath = CARD_TOML) {
  const parsed = parse(readFileSync(tomlPath, "utf8"));
  const meta = new Map();
  for (const card of parsed.cards) {
    if (meta.has(card.name)) continue;
    const rawCost = card["energy-cost"];
    const cost = typeof rawCost === "number" ? rawCost : null; // null == "X"
    meta.set(card.name, {
      cost,
      type: card["card-type"] ?? "Unknown",
      spark: typeof card.spark === "number" ? card.spark : null,
    });
  }
  return meta;
}

function parseNumberFlag(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return Number(eq.slice(flag.length + 1));
  return fallback;
}

function parseStringFlag(argv, flag) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  return null;
}

/** Increment `map[key]` by `by` (default 1). */
function bump(map, key, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

/**
 * Run `seeds` generations for one DreamAvatar and aggregate statistics over the
 * resulting pools.
 */
function simulateDreamAvatar(dreamAvatar, poolData, cardMeta, seeds, baseSeed) {
  const seedArchetypes = dreamAvatar.draftArchetypes;
  const sizes = [];
  const uniqueCounts = [];
  const identityCounts = new Map();
  const themeCounts = new Map();
  const cardPoolCounts = new Map(); // pools that include the card at all
  const costCurve = new Map(); // bucketed numeric cost -> total copies across pools
  let totalCopies = 0;
  let characterCopies = 0;
  let eventCopies = 0;
  let xCostCopies = 0;
  let numericCostSum = 0;
  let numericCostCopies = 0;
  let sparkSum = 0;
  let sparkCopies = 0;

  for (let i = 0; i < seeds; i++) {
    const pool = generatePoolFromData(poolData, baseSeed + i, seedArchetypes);
    sizes.push(pool.size);
    uniqueCounts.push(pool.counts.size);
    bump(identityCounts, pool.identity);
    for (const theme of pool.themes) bump(themeCounts, theme);

    for (const [name, rawCopies] of pool.counts) {
      const copies = Math.min(2, rawCopies);
      bump(cardPoolCounts, name);
      totalCopies += copies;
      const meta = cardMeta.get(name);
      if (!meta) continue;
      if (meta.type === "Character") characterCopies += copies;
      else if (meta.type === "Event") eventCopies += copies;
      if (meta.cost === null) {
        xCostCopies += copies;
      } else {
        numericCostSum += meta.cost * copies;
        numericCostCopies += copies;
        bump(costCurve, Math.min(7, meta.cost), copies);
      }
      if (meta.spark !== null && meta.type === "Character") {
        sparkSum += meta.spark * copies;
        sparkCopies += copies;
      }
    }
  }

  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ratesByCard = [...cardPoolCounts.entries()]
    .map(([name, count]) => ({ name, rate: count / seeds }))
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));

  return {
    name: dreamAvatar.name,
    title: dreamAvatar.title,
    seeded: Boolean(seedArchetypes),
    archetypeCount: seedArchetypes ? seedArchetypes.length : 0,
    seeds,
    size: { avg: avg(sizes), min: Math.min(...sizes), max: Math.max(...sizes) },
    avgUnique: avg(uniqueCounts),
    identityDistribution: [...identityCounts.entries()]
      .map(([identity, count]) => ({ identity, rate: count / seeds }))
      .sort((a, b) => b.rate - a.rate),
    characterShare: totalCopies > 0 ? characterCopies / totalCopies : 0,
    eventShare: totalCopies > 0 ? eventCopies / totalCopies : 0,
    avgEnergyCost: numericCostCopies > 0 ? numericCostSum / numericCostCopies : 0,
    avgSpark: sparkCopies > 0 ? sparkSum / sparkCopies : 0,
    xCostShare: totalCopies > 0 ? xCostCopies / totalCopies : 0,
    costCurve: [...costCurve.entries()]
      .map(([bucket, copies]) => ({ bucket, avgCopies: copies / seeds }))
      .sort((a, b) => a.bucket - b.bucket),
    themeRates: [...themeCounts.entries()]
      .map(([theme, count]) => ({ theme, rate: count / seeds }))
      .sort((a, b) => b.rate - a.rate),
    distinctCards: ratesByCard.length,
    cardRates: ratesByCard,
  };
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function printReport(report, top) {
  const tag = report.seeded
    ? `seeded · ${report.archetypeCount} archetypes`
    : "open pool";
  console.log(`\n${"=".repeat(72)}`);
  console.log(`${report.name} — ${report.title}  [${tag}]`);
  console.log(`${"=".repeat(72)}`);
  console.log(
    `pools: ${report.seeds}   size avg ${report.size.avg.toFixed(1)} ` +
      `(min ${report.size.min}, max ${report.size.max})   ` +
      `unique avg ${report.avgUnique.toFixed(1)}   ` +
      `distinct cards across all pools: ${report.distinctCards}`,
  );
  console.log(
    `mix: ${pct(report.characterShare)} characters / ` +
      `${pct(report.eventShare)} events   ` +
      `avg cost ${report.avgEnergyCost.toFixed(2)}   ` +
      `avg spark ${report.avgSpark.toFixed(2)}   ` +
      `X-cost ${pct(report.xCostShare)}`,
  );

  const curve = report.costCurve
    .map((c) => `${c.bucket === 7 ? "7+" : c.bucket}:${c.avgCopies.toFixed(1)}`)
    .join("  ");
  console.log(`cost curve (avg copies): ${curve}`);

  console.log(`identities:`);
  for (const entry of report.identityDistribution.slice(0, 8)) {
    console.log(
      `  ${entry.identity.toUpperCase().padEnd(6)} ${pct(entry.rate)}`,
    );
  }

  console.log(`top themes:`);
  for (const entry of report.themeRates.slice(0, top)) {
    console.log(`  ${pct(entry.rate).padStart(6)}  ${entry.theme}`);
  }

  console.log(`top cards (pool inclusion rate):`);
  for (const entry of report.cardRates.slice(0, top)) {
    console.log(`  ${pct(entry.rate).padStart(6)}  ${entry.name}`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const seeds = parseNumberFlag(argv, "--seeds", DEFAULT_SEEDS);
  const baseSeed = parseNumberFlag(argv, "--base-seed", 0) >>> 0;
  const top = parseNumberFlag(argv, "--top", DEFAULT_TOP);
  const filter = parseStringFlag(argv, "--dream-avatar");
  const asJson = argv.includes("--json");

  const poolData = buildPoolData(loadCards());
  const cardMeta = loadCardMeta();
  const allDreamAvatars = loadDreamAvatars();

  const targets =
    filter !== null
      ? [findDreamAvatar(allDreamAvatars, filter)].filter(Boolean)
      : allDreamAvatars;

  if (targets.length === 0) {
    process.stderr.write(`# no DreamAvatar matched: ${String(filter)}\n`);
    process.exit(1);
  }

  const reports = targets.map((d) =>
    simulateDreamAvatar(d, poolData, cardMeta, seeds, baseSeed),
  );

  if (asJson) {
    process.stdout.write(JSON.stringify({ seeds, baseSeed, reports }, null, 2) + "\n");
    return;
  }

  process.stderr.write(
    `# simulating ${reports.length} DreamAvatar(s) × ${seeds} seeds (base ${baseSeed})\n`,
  );
  for (const report of reports) printReport(report, top);
}

main();
