// Generate a random Dreamtides card pool of 180-220 cards using the
// color-identity algorithm documented in docs/cards2/draft_pool_algorithms.md.
//
// The pool-construction algorithm itself lives in `src/draft/pool/index.ts`
// and is the single source of truth shared with the in-app draft test harness:
// this script only loads the source data (cards_v2.toml, dream_avatars_v2.toml)
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
// A DreamAvatar's `draftArchetypes` (from {@link DREAM_AVATAR_ARCHETYPES_BY_ID} in
// `src/data/dream-avatars-v2-database.ts`) seed construction; passing
// `--dream-avatar <name|id>` seeds from that list, the same way picking the
// DreamAvatar does in the app.
//
// Card names are written newline-delimited to stdout; a 2-of is printed twice,
// so the line count equals the pool size. A one-line summary (color identity,
// size, themes) is written to stderr so stdout stays pipeable.
//
// Usage:
//   node scripts/generate-color-pool.mjs                         # random pool
//   node scripts/generate-color-pool.mjs --seed 42               # reproducible
//   node scripts/generate-color-pool.mjs --dream-avatar "Kell Tarn"
import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import {
  buildPoolData,
  generatePoolFromData,
  poolToLines,
} from "../src/draft/pool/index.ts";
import { CARDS_V2_POOL_METADATA } from "../src/data/cards-v2-metadata.ts";
import { DREAM_AVATAR_ARCHETYPES_BY_ID } from "../src/data/dream-avatars-v2-database.ts";

export { buildPoolData };

const CARD_TOML = new URL("../data/tabula/cards_v2.toml", import.meta.url)
  .pathname;
const DREAM_AVATAR_TOML = new URL(
  "../data/tabula/dream_avatars_v2.toml",
  import.meta.url,
).pathname;

/**
 * Load and normalize the card records the generator needs. The card list (names)
 * comes from cards_v2.toml; the draft-pool metadata is merged in by each card's
 * stable id from {@link CARDS_V2_POOL_METADATA}.
 */
export function loadCards(tomlPath = CARD_TOML) {
  const parsed = parse(readFileSync(tomlPath, "utf8"));
  return parsed.cards
    .filter((card) => card.rarity !== "Starter")
    .map((card) => {
      const meta = CARDS_V2_POOL_METADATA[card.id] ?? {};
      return {
        name: card.name,
        // The stable cards_v2 UUID, the `seed` variant's rename-proof identity.
        id: card.id,
        tides: meta.tides ?? [],
        core: meta.core === true,
        colors: meta.colors ?? [],
        draftArchetypes: meta.draftArchetypes ?? [],
      };
    });
}

/**
 * Load the v2 DreamAvatar identities. The id, name, and title come from
 * dream_avatars_v2.toml; the optional `draftArchetypes` list that seeds pool
 * construction is merged in by UUID from {@link DREAM_AVATAR_ARCHETYPES_BY_ID}. A
 * DreamAvatar without that list rolls the unconstrained random pool.
 */
export function loadDreamAvatars(tomlPath = DREAM_AVATAR_TOML) {
  const parsed = parse(readFileSync(tomlPath, "utf8"));
  return (parsed.dreamAvatar ?? []).map((dreamAvatar) => ({
    id: dreamAvatar.id,
    name: dreamAvatar.name,
    title: dreamAvatar.title ?? "",
    draftArchetypes: DREAM_AVATAR_ARCHETYPES_BY_ID[dreamAvatar.id],
  }));
}

/** Find a DreamAvatar by exact id or case-insensitive name. */
export function findDreamAvatar(dreamAvatars, query) {
  const lowered = query.toLowerCase();
  return (
    dreamAvatars.find((d) => d.id === query) ??
    dreamAvatars.find((d) => d.name.toLowerCase() === lowered) ??
    null
  );
}

/**
 * Run one generation for `seed` against prebuilt `poolData`, returning the
 * newline-delimited card lines (2-ofs duplicated, sorted by name), the color
 * identity, the selected theme labels, and the pool size. Pass `seedArchetypes`
 * (a DreamAvatar's `draftArchetypes`) to seed construction from that list.
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

function parseDreamAvatar(argv) {
  const i = argv.indexOf("--dream-avatar");
  if (i !== -1 && argv[i + 1] != null) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith("--dream-avatar="));
  if (eq) return eq.slice("--dream-avatar=".length);
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

  const dreamAvatarQuery = parseDreamAvatar(argv);
  let seedArchetypes;
  let dreamAvatarLabel = "none";
  if (dreamAvatarQuery !== null) {
    const dreamAvatar = findDreamAvatar(loadDreamAvatars(), dreamAvatarQuery);
    if (!dreamAvatar) {
      process.stderr.write(`# unknown dreamAvatar: ${dreamAvatarQuery}\n`);
      process.exit(1);
    }
    seedArchetypes = dreamAvatar.draftArchetypes;
    dreamAvatarLabel = `${dreamAvatar.name}${
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
    `# variant=${variant} dreamAvatar=${dreamAvatarLabel} identity=${identity} seed=${seed} size=${lines.length} themes=${themes.join(", ")}\n`,
  );
}

// Avoid `import.meta.url` path comparison pitfalls: run only when invoked as the
// entry script, not when imported by tests.
if (process.argv[1] && process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}
