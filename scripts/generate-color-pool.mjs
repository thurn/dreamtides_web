// Generate a random Dreamtides card pool of 180-220 cards using the
// color-identity algorithm documented in docs/cards2/draft_pool_algorithms.md.
//
// The pool-construction algorithm itself lives in `src/draft/pool/index.ts`
// and is the single source of truth shared with the in-app draft test harness:
// this script only loads the source data (cards_v2.toml, dreamcallers_v2.toml)
// and formats the result. Node strips the TypeScript types on import, so the
// same code runs here and in the browser — pools generated here match the app
// byte-for-byte for a given seed.
//
// The pool is sourced from per-card draft metadata that lives in TypeScript
// (`src/data/cards-v2-metadata.ts`), keyed by card name:
//   - core             cards seed every pool
//   - tides            supply the mechanic-archetype themes (one per tide base name)
//   - colors           the bare color-combo lists that define legality + fill
//   - draftArchetypes  the color+archetype slices that supply color-tied themes
// cards_v2.toml supplies the card list (names); the metadata is merged in here.
//
// A Dreamcaller's `draftArchetypes` (from {@link DREAMCALLER_ARCHETYPES} in
// `src/data/dreamcallers-v2-database.ts`) seed construction; passing
// `--dreamcaller <name|id>` seeds from that list, the same way picking the
// Dreamcaller does in the app.
//
// Card names are written newline-delimited to stdout; a 2-of is printed twice,
// so the line count equals the pool size. A one-line summary (color identity,
// size, themes) is written to stderr so stdout stays pipeable.
//
// Usage:
//   node scripts/generate-color-pool.mjs                         # random pool
//   node scripts/generate-color-pool.mjs --seed 42               # reproducible
//   node scripts/generate-color-pool.mjs --dreamcaller "Kell Tarn"
import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import {
  buildPoolData,
  generatePoolFromData,
  poolToLines,
} from "../src/draft/pool/index.ts";
import { CARDS_V2_POOL_METADATA } from "../src/data/cards-v2-metadata.ts";
import { DREAMCALLER_ARCHETYPES } from "../src/data/dreamcallers-v2-database.ts";

export { buildPoolData };

const CARD_TOML = new URL("../data/tabula/cards_v2.toml", import.meta.url)
  .pathname;
const DREAMCALLER_TOML = new URL(
  "../data/tabula/dreamcallers_v2.toml",
  import.meta.url,
).pathname;

/**
 * Load and normalize the card records the generator needs. The card list (names)
 * comes from cards_v2.toml; the draft-pool metadata is merged in by name from
 * {@link CARDS_V2_POOL_METADATA}.
 */
export function loadCards(tomlPath = CARD_TOML) {
  const parsed = parse(readFileSync(tomlPath, "utf8"));
  return parsed.cards
    .filter((card) => card.rarity !== "Starter")
    .map((card) => {
      const meta = CARDS_V2_POOL_METADATA[card.name] ?? {};
      return {
        name: card.name,
        tides: meta.tides ?? [],
        core: meta.core === true,
        colors: meta.colors ?? [],
        draftArchetypes: meta.draftArchetypes ?? [],
      };
    });
}

/**
 * Load the v2 Dreamcaller identities. The id, name, and title come from
 * dreamcallers_v2.toml; the optional `draftArchetypes` list that seeds pool
 * construction is merged in by name from {@link DREAMCALLER_ARCHETYPES}. A
 * Dreamcaller without that list rolls the unconstrained random pool.
 */
export function loadDreamcallers(tomlPath = DREAMCALLER_TOML) {
  const parsed = parse(readFileSync(tomlPath, "utf8"));
  return (parsed.dreamcaller ?? []).map((dreamcaller) => ({
    id: dreamcaller.id,
    name: dreamcaller.name,
    title: dreamcaller.title ?? "",
    draftArchetypes: DREAMCALLER_ARCHETYPES[dreamcaller.name],
  }));
}

/** Find a Dreamcaller by exact id or case-insensitive name. */
export function findDreamcaller(dreamcallers, query) {
  const lowered = query.toLowerCase();
  return (
    dreamcallers.find((d) => d.id === query) ??
    dreamcallers.find((d) => d.name.toLowerCase() === lowered) ??
    null
  );
}

/**
 * Run one generation for `seed` against prebuilt `poolData`, returning the
 * newline-delimited card lines (2-ofs duplicated, sorted by name), the color
 * identity, the selected theme labels, and the pool size. Pass `seedArchetypes`
 * (a Dreamcaller's `draftArchetypes`) to seed construction from that list.
 */
export function runSeed(seed, poolData, seedArchetypes, variant) {
  const pool = generatePoolFromData(poolData, seed >>> 0, seedArchetypes, variant);
  return {
    lines: poolToLines(pool.counts),
    identity: pool.identity,
    themes: pool.themes,
    size: pool.size,
  };
}

// --- run -----------------------------------------------------------------------
function parseSeed(argv) {
  const i = argv.indexOf("--seed");
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]) >>> 0;
  const eq = argv.find((a) => a.startsWith("--seed="));
  if (eq) return Number(eq.slice("--seed=".length)) >>> 0;
  return (Math.random() * 2 ** 32) >>> 0;
}

function parseDreamcaller(argv) {
  const i = argv.indexOf("--dreamcaller");
  if (i !== -1 && argv[i + 1] != null) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith("--dreamcaller="));
  if (eq) return eq.slice("--dreamcaller=".length);
  return null;
}

function parseVariant(argv) {
  const i = argv.indexOf("--variant");
  const value =
    i !== -1 && argv[i + 1] != null
      ? argv[i + 1]
      : argv.find((a) => a.startsWith("--variant="))?.slice("--variant=".length);
  return value === "diverse" ? "diverse" : "default";
}

function main() {
  const argv = process.argv.slice(2);
  const seed = parseSeed(argv);
  const variant = parseVariant(argv);
  const poolData = buildPoolData(loadCards());

  const dreamcallerQuery = parseDreamcaller(argv);
  let seedArchetypes;
  let dreamcallerLabel = "none";
  if (dreamcallerQuery !== null) {
    const dreamcaller = findDreamcaller(loadDreamcallers(), dreamcallerQuery);
    if (!dreamcaller) {
      process.stderr.write(`# unknown dreamcaller: ${dreamcallerQuery}\n`);
      process.exit(1);
    }
    seedArchetypes = dreamcaller.draftArchetypes;
    dreamcallerLabel = `${dreamcaller.name}${
      seedArchetypes ? "" : " (open pool)"
    }`;
  }

  const { lines, identity, themes } = runSeed(
    seed,
    poolData,
    seedArchetypes,
    variant,
  );
  process.stdout.write(`${lines.join("\n")}\n`);
  process.stderr.write(
    `# variant=${variant} dreamcaller=${dreamcallerLabel} identity=${identity} seed=${seed} size=${lines.length} themes=${themes.join(", ")}\n`,
  );
}

// Avoid `import.meta.url` path comparison pitfalls: run only when invoked as the
// entry script, not when imported by tests.
if (process.argv[1] && process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}
