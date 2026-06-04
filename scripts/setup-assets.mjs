import { readFileSync, mkdirSync, rmSync, symlinkSync, existsSync, readdirSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { parse } from "smol-toml";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const IMAGE_CACHE_DIR = join(homedir(), "Library", "Caches", "io.github.dreamtides.tv", "image_cache");
const DREAMCALLER_ART_DIR_CANDIDATES = [
  join(homedir(), "Documents", "synty", "dreamcallers"),
  join(homedir(), "Documents", "sytny", "dreamcallers"),
];
const DREAMSIGN_ART_DIR = join(homedir(), "Documents", "dreamsigns", "filtered");
const JOURNEY_ART_DIR = join(homedir(), "Documents", "shutterstock", "images_journeys");
const CARD_FRAME_ART_DIR = join(
  homedir(),
  "dreamtides",
  "client",
  "Assets",
  "ThirdParty",
  "GameAssets",
);

/**
 * Card chrome art shared by every `CardView` surface: the energy / spark stat
 * orbs and the parchment frame overlays (one for characters, one for events).
 * Sourced from the Dreamtides Unity client asset tree and symlinked into
 * `public/card-frame/` so Vite serves them at `/card-frame/<file>`. The files
 * are intentionally kept out of version control (see `.gitignore`).
 */
const CARD_FRAME_FILES = [
  "energy_cost_background.png",
  "spark_background.png",
  "card_frame.png",
  "card_frame_event.png",
];

const PUBLIC_DIR = join(ROOT, "public");

/**
 * Extract the trailing numeric image id from a shutterstock journey filename.
 * The convention is `<arbitrary-prefix>-<digits>.<ext>`. Returns null if the
 * filename does not match.
 */
export function journeyImageIdFromFilename(filename) {
  const match = /-(\d+)\.([A-Za-z0-9]+)$/u.exec(filename);
  if (!match) return null;
  return { imageId: match[1], extension: match[2] };
}

/**
 * Convert a kebab-case string to camelCase.
 */
function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Display label for one energy-cost segment. Variable markers (`X`, `x`, `*`)
 * all normalize to `"X"`; a numeric segment keeps its digits.
 */
function energyCostSegmentLabel(segment) {
  const trimmed = segment.trim();
  if (trimmed === "X" || trimmed === "x" || trimmed === "*") {
    return "X";
  }
  return trimmed;
}

function numericEnergySegment(segment) {
  const trimmed = segment.trim();
  return /^\d+$/u.test(trimmed) ? Number(trimmed) : null;
}

/**
 * Parse a TOML `energy-cost` value into the runtime numeric cost plus the
 * ordered orb labels for cards that carry more than one cost.
 *
 * A single value (number, `"X"`/`"*"`, or blank) yields `{ energyCost,
 * energyCosts: null }`: blanks and variable markers become `null` (rendered as
 * a single `X` orb) and numbers are preserved. A comma- or newline-separated
 * value such as `"2,X"` is a multi-cost card: `energyCosts` holds the ordered
 * orb labels (`["2", "X"]`) and `energyCost` takes the first numeric segment as
 * the base cost (`2`), or `null` when no segment is numeric.
 */
export function parseEnergyCost(value) {
  if (typeof value === "number") {
    return { energyCost: value, energyCosts: null };
  }
  if (typeof value !== "string") {
    return { energyCost: null, energyCosts: null };
  }

  const segments = value
    .split(/[,\n]/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

  if (segments.length === 0) {
    return { energyCost: null, energyCosts: null };
  }

  if (segments.length === 1) {
    return { energyCost: numericEnergySegment(segments[0]), energyCosts: null };
  }

  let base = null;
  for (const segment of segments) {
    const numeric = numericEnergySegment(segment);
    if (numeric !== null) {
      base = numeric;
      break;
    }
  }

  return { energyCost: base, energyCosts: segments.map(energyCostSegmentLabel) };
}

/**
 * Parse a TOML `spark` value into the runtime numeric spark plus a flag for
 * variable spark.
 *
 * Numbers are preserved. The variable markers `X`, `x`, and `*` yield
 * `{ spark: null, variable: true }`, which `CardView` renders as a single `X`
 * spark orb. Blank, missing, or otherwise unparseable spark yields
 * `{ spark: null, variable: false }` — no spark orb, the common case for
 * Events.
 */
export function parseSpark(value) {
  if (typeof value === "number") {
    return { spark: value, variable: false };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "X" || trimmed === "x" || trimmed === "*") {
      return { spark: null, variable: true };
    }
    if (/^\d+$/u.test(trimmed)) {
      return { spark: Number(trimmed), variable: false };
    }
  }
  return { spark: null, variable: false };
}

/**
 * Convert a TOML card record to its JSON representation with camelCase keys.
 * Spark is parsed by `parseSpark`: numbers are preserved, variable markers
 * (`X`/`x`/`*`) become `null` plus a `sparkVariable: true` flag (rendered as a
 * single `X` orb), and blank or missing spark becomes `null`. Energy cost is
 * parsed by `parseEnergyCost`: multi-cost cards (e.g. `"2,X"`) additionally
 * emit an `energyCosts` array of orb labels.
 */
export function transformCard(card) {
  const result = {};
  for (const [key, value] of Object.entries(card)) {
    const camelKey = kebabToCamel(key);
    if (camelKey === "energyCost") {
      const parsed = parseEnergyCost(value);
      result.energyCost = parsed.energyCost;
      if (parsed.energyCosts !== null) {
        result.energyCosts = parsed.energyCosts;
      }
    } else if (camelKey === "spark") {
      const parsed = parseSpark(value);
      result.spark = parsed.spark;
      if (parsed.variable) {
        result.sparkVariable = true;
      }
    } else {
      result[camelKey] = value;
    }
  }
  result.isStarter = card.rarity === "Starter";
  if (!("spark" in result)) {
    result.spark = null;
  }
  if (!("subtype" in result) || result.subtype == null) {
    result.subtype = "";
  }
  return result;
}

// --- merged archetype lists (the `merged` draft-test pool variant) -----------
// The `merged` pool algorithm draws from one card list per drafted archetype,
// each holding the cards that recur across that archetype's real decks. That
// collapse is done once, here, offline: the run-time browser cannot read the
// `docs/drafts_dt` filenames, and the `decklists-data.json` bundle keeps only
// card names (the archetype label is dropped), so the merged lists are baked
// into their own JSON. The algorithm and these knobs are described in
// `docs/cards2/draft_pool_algorithms.md`; `scripts/merged-archetype-pool-experiment.mjs`
// mirrors this build to evaluate the variant against `decklists`.
const MERGED_LIST_FILE_RE =
  /^\d{4}-\d{2}-\d{2}-(.+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const MERGED_MIN_DECK = 16; // distinct cards: drop partial/near-empty files
const MERGED_MAX_DECK = 34; // distinct cards: drop oversized aggregate files
const MERGED_MIN_DECKS_PER_LABEL = 3; // labels with fewer real decks are too thin to merge
const MERGED_CARD_THRESHOLD = 2; // a card joins when it recurs in >= this many of the label's decks
const MERGED_MAX_LIST = 100; // a merged list holds at most this many cards

/** Leading run of w/u/b/r/g color letters in a label ('' if it has none). */
function mergedColorPrefix(name) {
  const head = name.split("-")[0];
  const isColors = head.length > 0 && [...head].every((c) => "wubrg".includes(c));
  return isColors ? head : "";
}

/**
 * Collapse the real decklist files (`docs/drafts_dt/*.txt`) into merged
 * archetype lists: a map from each drafted archetype label (e.g.
 * `br-aristocrats`) to the cards that recur across that archetype's decks.
 *
 * The archetype label is recovered from each filename
 * (`<YYYY-MM-DD>-<label>-<uuid>.txt`); files whose label is a bare color (`ur`)
 * or carries no color prefix are skipped because they name no archetype. A deck
 * is used only if it has 16-34 distinct known cards. Decks are grouped by label,
 * labels with fewer than three decks are dropped, and within a surviving label a
 * card is kept when it appears in at least `MERGED_CARD_THRESHOLD` of the label's
 * decks. Survivors are ordered most-frequent first and capped at
 * `MERGED_MAX_LIST`. Returns a plain object (label -> card-name array) ready to
 * serialize.
 */
export function buildMergedArchetypeLists(draftsDtDir, knownCardNames) {
  const byLabel = new Map(); // label -> array of Set<name>
  for (const filename of readdirSync(draftsDtDir).sort()) {
    if (!filename.endsWith(".txt")) continue;
    const match = MERGED_LIST_FILE_RE.exec(filename.replace(/\.txt$/u, ""));
    if (!match) continue;
    const label = match[1];
    // Need both a color prefix and an archetype name after it.
    if (mergedColorPrefix(label) === "" || label === mergedColorPrefix(label)) {
      continue;
    }
    const names = readFileSync(join(draftsDtDir, filename), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && knownCardNames.has(line));
    const set = new Set(names);
    if (set.size < MERGED_MIN_DECK || set.size > MERGED_MAX_DECK) continue;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(set);
  }

  const lists = {};
  for (const [label, decks] of byLabel) {
    if (decks.length < MERGED_MIN_DECKS_PER_LABEL) continue;
    const freq = new Map();
    for (const deck of decks) {
      for (const card of deck) freq.set(card, (freq.get(card) ?? 0) + 1);
    }
    let kept = [...freq.entries()].filter(([, n]) => n >= MERGED_CARD_THRESHOLD);
    kept.sort((a, b) => b[1] - a[1]);
    if (kept.length > MERGED_MAX_LIST) kept = kept.slice(0, MERGED_MAX_LIST);
    if (kept.length > 0) lists[label] = kept.map(([card]) => card);
  }
  return lists;
}

/**
 * Default starting essence used when a Dreamcaller TOML record omits a
 * `starting-essence` value. Mirrors `DEFAULT_STARTING_ESSENCE` in
 * `src/types/content.ts`.
 */
export const DEFAULT_STARTING_ESSENCE = 250;

/**
 * Bane card names that must be retained in the runtime card catalog despite
 * their `Special` rarity. Dream-journey effects (`gain_random_banes`,
 * `gain_named_banes`, `gain_named_banes_for_X_battles`) resolve a bane name
 * to a content card and add it to the player's deck; without these names in
 * `card-data.json` the apply step finds no card and silently no-ops the deck
 * mutation. The catalog currently ships `Nightmare`; other entries
 * (Despair, Oblivion, ...) are documented in `docs/quests/banes.md` and will
 * land as content cards in a future content drop.
 *
 * Mirrors `BANE_NAMES` in `src/journeys/journey/effects.ts`. Keep the two in
 * sync; the runtime filter in `availableBaneNames` already gates rolling on
 * "this name has a card in the bundle", so adding a new bane card to the
 * TOML and to this set automatically lights it up in dream-journey rolls.
 */
export const BANE_NAMES = new Set([
  "Nightmare",
  "Despair",
  "Oblivion",
  "Betrayal",
  "Envy",
  "Doubt",
  "Silence",
  "Paranoia",
  "Burden",
  "Paralysis",
  "Lethargy",
]);

/**
 * Convert a TOML Dreamcaller record to its JSON representation with camelCase keys.
 * Records without a `starting-essence` value are filled in with
 * `DEFAULT_STARTING_ESSENCE` so the runtime always sees a number.
 */
export function transformDreamcaller(dreamcaller) {
  const result = {};
  for (const [key, value] of Object.entries(dreamcaller)) {
    result[kebabToCamel(key)] = value;
  }
  if (typeof result.startingEssence !== "number") {
    result.startingEssence = DEFAULT_STARTING_ESSENCE;
  }
  return result;
}

/**
 * Convert a TOML Dreamsign record to its JSON representation with runtime-facing keys.
 */
export function transformDreamsign(dreamsign, altTextByImageName = new Map()) {
  return {
    id: dreamsign.id,
    name: dreamsign.name,
    imageName: dreamsign.image_name,
    imageAlt:
      altTextByImageName.get(dreamsign.image_name)
      ?? `${dreamsign.name} Dreamsign artwork`,
    effectDescription: dreamsign["rendered-text"] ?? "",
    packageTides: Array.isArray(dreamsign.tides) ? [...dreamsign.tides] : [],
  };
}

/**
 * Compute the SHA-256 hash of the Shutterstock URL for a given image number.
 */
export function imageHash(imageNumber) {
  const url = `https://www.shutterstock.com/image-illustration/-260nw-${imageNumber}.jpg`;
  return createHash("sha256").update(url).digest("hex");
}

/**
 * Clean and recreate a directory for idempotent runs.
 */
function recreateDir(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function defaultDreamcallerArtDir() {
  for (const candidate of DREAMCALLER_ART_DIR_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return DREAMCALLER_ART_DIR_CANDIDATES[0];
}

function readDreamsignAltText(dreamsignArtDir) {
  const altTextPath = join(dreamsignArtDir, "alt_text.txt");
  if (!existsSync(altTextPath)) {
    return new Map();
  }

  const altTextByImageName = new Map();
  for (const line of readFileSync(altTextPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const [imageName, altText] = trimmed.split("\t");
    if (imageName !== undefined && altText !== undefined) {
      altTextByImageName.set(imageName, altText);
    }
  }

  return altTextByImageName;
}

export function setupAssets({
  cardTomlPath = join(DATA_DIR, "tabula", "rendered-cards.toml"),
  cardV2TomlPath = join(DATA_DIR, "tabula", "cards_v2.toml"),
  dreamcallerTomlPath = join(DATA_DIR, "tabula", "dreamcallers.toml"),
  dreamcallerV2TomlPath = join(DATA_DIR, "tabula", "dreamcallers_v2.toml"),
  dreamsignTomlPath = join(DATA_DIR, "tabula", "dreamsigns.toml"),
  publicDir = PUBLIC_DIR,
  imageCacheDir = IMAGE_CACHE_DIR,
  dreamcallerArtDir = defaultDreamcallerArtDir(),
  dreamsignArtDir = DREAMSIGN_ART_DIR,
  journeyArtDir = JOURNEY_ART_DIR,
  cardFrameArtDir = CARD_FRAME_ART_DIR,
} = {}) {
  const cardsDir = join(publicDir, "cards");
  const cardFrameDir = join(publicDir, "card-frame");
  const dreamcallersDir = join(publicDir, "dreamcallers");
  const dreamsignsDir = join(publicDir, "dreamsigns");
  const journeysDir = join(publicDir, "journeys");
  const cardJsonPath = join(publicDir, "card-data.json");
  const cardV2JsonPath = join(publicDir, "cards_v2-data.json");
  const decklistsJsonPath = join(publicDir, "decklists-data.json");
  const mergedListsJsonPath = join(publicDir, "merged-archetype-lists-data.json");
  const draftsDtDir = join(ROOT, "docs", "drafts_dt");
  const dreamcallerJsonPath = join(publicDir, "dreamcaller-data.json");
  const dreamcallerV2JsonPath = join(publicDir, "dreamcallers-v2-data.json");
  const dreamsignJsonPath = join(publicDir, "dreamsign-data.json");
  const journeyExtensionJsonPath = join(journeysDir, "imageId-extension.json");

  console.log("Parsing rendered-cards.toml...");
  const cardTomlContent = readFileSync(cardTomlPath, "utf8");
  const parsedCards = parse(cardTomlContent);
  const allCards = parsedCards.cards;

  if (!Array.isArray(allCards)) {
    throw new Error("Expected [[cards]] array in TOML file");
  }

  console.log(`Found ${allCards.length} total cards`);

  // Filter out Special-rarity cards from the runtime pool, except for bane
  // cards: bane content (Nightmare and any future entries) is required by
  // dream-journey effects that add bane cards to the deck. Non-bane Special
  // cards (e.g. the Void Indicator placeholder) stay excluded.
  const cards = allCards.filter(
    (c) => c.rarity !== "Special" || BANE_NAMES.has(c.name),
  );
  console.log(`Filtered to ${cards.length} runtime cards`);

  // Transform to camelCase JSON
  const jsonCards = cards.map(transformCard);

  // Write card-data.json
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(cardJsonPath, JSON.stringify(jsonCards, null, 2) + "\n");
  console.log(`Wrote ${jsonCards.length} cards to card-data.json`);

  // Experimental v2 card pool used by the standalone `/draft_test` page. It is
  // transformed with the same kebab->camel rules as the runtime pool and
  // written to its own JSON so the draft test harness can fetch it without
  // disturbing card-data.json (which the dev drift guard pins to
  // rendered-cards.toml). Special-rarity filtering is intentionally skipped:
  // cards_v2 carries no rarities and the harness shows the whole pool.
  console.log("Parsing cards_v2.toml...");
  const cardV2TomlContent = readFileSync(cardV2TomlPath, "utf8");
  const parsedCardsV2 = parse(cardV2TomlContent);
  const allCardsV2 = parsedCardsV2.cards;

  if (!Array.isArray(allCardsV2)) {
    throw new Error("Expected [[cards]] array in cards_v2.toml");
  }

  const jsonCardsV2 = allCardsV2.map(transformCard);
  writeFileSync(cardV2JsonPath, JSON.stringify(jsonCardsV2, null, 2) + "\n");
  console.log(`Wrote ${jsonCardsV2.length} cards to cards_v2-data.json`);

  // Real per-deck card lists (`docs/drafts_dt/*.txt`) bundled for the draft
  // test's `decklists` pool variant, which builds a pool by snowballing
  // similar real decklists rather than synthesizing one from archetype themes.
  // Each file is one deck: a newline-separated list of card names. We keep only
  // names that exist in cards_v2 (so the bundle never references unknown cards)
  // and drop empty files; all size filtering happens in the algorithm so it
  // stays tunable. Output shape is `string[][]` (one inner array per deck).
  console.log("Bundling real decklists from docs/drafts_dt...");
  const knownCardNames = new Set(jsonCardsV2.map((card) => card.name));
  const decklists = [];
  for (const filename of readdirSync(draftsDtDir).sort()) {
    if (!filename.endsWith(".txt")) continue;
    const lines = readFileSync(join(draftsDtDir, filename), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && knownCardNames.has(line));
    if (lines.length > 0) decklists.push(lines);
  }
  writeFileSync(decklistsJsonPath, JSON.stringify(decklists) + "\n");
  console.log(`Wrote ${decklists.length} decklists to decklists-data.json`);

  // Merged archetype lists for the draft test's `merged` pool variant. The
  // archetype label is dropped from decklists-data.json, so we collapse the
  // labeled `docs/drafts_dt` files here (offline) into one list per archetype
  // and bundle them for the browser. See `buildMergedArchetypeLists`.
  console.log("Building merged archetype lists from docs/drafts_dt...");
  const mergedLists = buildMergedArchetypeLists(draftsDtDir, knownCardNames);
  writeFileSync(mergedListsJsonPath, JSON.stringify(mergedLists) + "\n");
  console.log(
    `Wrote ${Object.keys(mergedLists).length} merged archetype lists to merged-archetype-lists-data.json`,
  );

  console.log("Parsing dreamcallers.toml...");
  const dreamcallerTomlContent = readFileSync(dreamcallerTomlPath, "utf8");
  const parsedDreamcallers = parse(dreamcallerTomlContent);
  const allDreamcallers = parsedDreamcallers.dreamcaller;

  if (!Array.isArray(allDreamcallers)) {
    throw new Error("Expected [[dreamcaller]] array in dreamcallers.toml");
  }

  const jsonDreamcallers = allDreamcallers.map(transformDreamcaller);
  writeFileSync(
    dreamcallerJsonPath,
    JSON.stringify(jsonDreamcallers, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonDreamcallers.length} dreamcallers to dreamcaller-data.json`,
  );

  // The v2 Dreamcaller identities (`dreamcallers_v2.toml`) drive the standalone
  // draft test harness. They reuse the same portrait art pool and the same
  // kebab->camel normalization, and may carry a `draft-archetypes` list that
  // seeds draft-pool construction for that Dreamcaller.
  console.log("Parsing dreamcallers_v2.toml...");
  const dreamcallerV2TomlContent = readFileSync(dreamcallerV2TomlPath, "utf8");
  const parsedDreamcallersV2 = parse(dreamcallerV2TomlContent);
  const allDreamcallersV2 = parsedDreamcallersV2.dreamcaller;

  if (!Array.isArray(allDreamcallersV2)) {
    throw new Error("Expected [[dreamcaller]] array in dreamcallers_v2.toml");
  }

  const jsonDreamcallersV2 = allDreamcallersV2.map(transformDreamcaller);
  writeFileSync(
    dreamcallerV2JsonPath,
    JSON.stringify(jsonDreamcallersV2, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonDreamcallersV2.length} dreamcallers to dreamcallers-v2-data.json`,
  );

  console.log("Parsing dreamsigns.toml...");
  const dreamsignTomlContent = readFileSync(dreamsignTomlPath, "utf8");
  const parsedDreamsigns = parse(dreamsignTomlContent);
  const allDreamsigns = parsedDreamsigns.dreamsign;

  if (!Array.isArray(allDreamsigns)) {
    throw new Error("Expected [[dreamsign]] array in dreamsigns.toml");
  }

  const altTextByImageName = readDreamsignAltText(dreamsignArtDir);
  const jsonDreamsigns = allDreamsigns.map((dreamsign) =>
    transformDreamsign(dreamsign, altTextByImageName),
  );
  writeFileSync(
    dreamsignJsonPath,
    JSON.stringify(jsonDreamsigns, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonDreamsigns.length} dreamsigns to dreamsign-data.json`,
  );

  // Create card image symlinks
  recreateDir(cardsDir);
  let linked = 0;
  let missing = 0;

  for (const card of jsonCards) {
    if (
      card.imageNumber === "" ||
      card.imageNumber === null ||
      card.imageNumber === undefined
    ) {
      continue;
    }

    const hash = imageHash(card.imageNumber);
    const cachePath = join(imageCacheDir, hash);
    const symlinkPath = join(cardsDir, `${card.imageNumber}.webp`);

    // Several cards can share one image number, so the symlink for an image is
    // created once and reused by every card that references it.
    if (existsSync(symlinkPath)) {
      linked++;
      continue;
    }

    if (existsSync(cachePath)) {
      symlinkSync(cachePath, symlinkPath);
      linked++;
    } else {
      console.warn(
        `  Warning: missing cache file for image ${card.imageNumber} (${card.name}): ${hash}`,
      );
      missing++;
    }
  }

  console.log(`Linked ${linked} of ${jsonCards.length} card images (${missing} missing)`);

  // Link art for the experimental v2 pool into the same cards directory, keyed
  // by image number. Many v2 image numbers are absent from the local cache, in
  // which case the `/draft_test` page falls back to a generated identicon, so
  // misses are counted quietly rather than warned per card.
  let linkedV2 = 0;
  let missingV2 = 0;
  for (const card of jsonCardsV2) {
    const imageNumber = card.imageNumber;
    if (
      imageNumber === "" ||
      imageNumber === null ||
      imageNumber === undefined ||
      Number(imageNumber) <= 0
    ) {
      continue;
    }

    const hash = imageHash(imageNumber);
    const cachePath = join(imageCacheDir, hash);
    const symlinkPath = join(cardsDir, `${imageNumber}.webp`);

    if (existsSync(symlinkPath)) {
      linkedV2++;
      continue;
    }

    if (existsSync(cachePath)) {
      symlinkSync(cachePath, symlinkPath);
      linkedV2++;
    } else {
      missingV2++;
    }
  }

  console.log(
    `Linked ${linkedV2} of ${jsonCardsV2.length} cards_v2 images (${missingV2} missing)`,
  );

  recreateDir(dreamcallersDir);
  let linkedDreamcallerArt = 0;
  let missingDreamcallerArt = 0;

  // Link portraits for both the runtime and v2 draft-test Dreamcallers, keyed by
  // image number so a portrait shared between the two pools is linked once.
  const dreamcallerArtByImageNumber = new Map();
  for (const dreamcaller of [...jsonDreamcallers, ...jsonDreamcallersV2]) {
    if (!dreamcallerArtByImageNumber.has(dreamcaller.imageNumber)) {
      dreamcallerArtByImageNumber.set(dreamcaller.imageNumber, dreamcaller.name);
    }
  }

  for (const [imageNumber, name] of dreamcallerArtByImageNumber) {
    const filename = `${imageNumber}.png`;
    const sourcePath = join(dreamcallerArtDir, filename);
    const symlinkPath = join(dreamcallersDir, filename);

    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, symlinkPath);
      linkedDreamcallerArt++;
    } else {
      console.warn(
        `  Warning: missing dreamcaller art for ${name} (${imageNumber})`,
      );
      missingDreamcallerArt++;
    }
  }

  console.log(
    `Linked ${linkedDreamcallerArt} of ${dreamcallerArtByImageNumber.size} dreamcaller portraits (${missingDreamcallerArt} missing)`,
  );

  recreateDir(dreamsignsDir);
  let linkedDreamsignArt = 0;
  let missingDreamsignArt = 0;

  for (const dreamsign of jsonDreamsigns) {
    const sourcePath = join(dreamsignArtDir, dreamsign.imageName);
    const symlinkPath = join(dreamsignsDir, dreamsign.imageName);

    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, symlinkPath);
      linkedDreamsignArt++;
    } else {
      console.warn(
        `  Warning: missing dreamsign art for ${dreamsign.name} (${dreamsign.imageName})`,
      );
      missingDreamsignArt++;
    }
  }

  console.log(
    `Linked ${linkedDreamsignArt} of ${jsonDreamsigns.length} dreamsign images (${missingDreamsignArt} missing)`,
  );

  // Journey dream art. Source files live at
  // `~/Documents/shutterstock/images_journeys/<arbitrary-prefix>-<imageId>.<ext>`;
  // they get symlinked into `public/journeys/<imageId>.<ext>` so the matcher's
  // `imageUrl` convention (`/journeys/<imageId>.<ext>`) resolves at runtime.
  // A sibling `imageId-extension.json` records each id's extension so the
  // browser-side matcher can build URLs without filesystem access. The TOML
  // ledger (`src/journeys/data/reward-art-matches.toml`) is the catalog of
  // which image_ids back which reward types.
  recreateDir(journeysDir);
  let linkedJourneyArt = 0;
  let skippedJourneyArt = 0;
  const journeyExtensionsByImageId = {};

  if (existsSync(journeyArtDir)) {
    for (const filename of readdirSync(journeyArtDir)) {
      const parsed = journeyImageIdFromFilename(filename);
      if (!parsed) {
        skippedJourneyArt++;
        continue;
      }
      const { imageId, extension } = parsed;
      // If two files share an imageId (rare but possible), the first wins;
      // record the warning so the catalog can be cleaned up.
      if (journeyExtensionsByImageId[imageId] !== undefined) {
        console.warn(
          `  Warning: duplicate journey image id ${imageId} (keeping first); skipping ${filename}`,
        );
        skippedJourneyArt++;
        continue;
      }
      const sourcePath = join(journeyArtDir, filename);
      const symlinkPath = join(journeysDir, `${imageId}.${extension}`);
      symlinkSync(sourcePath, symlinkPath);
      journeyExtensionsByImageId[imageId] = extension;
      linkedJourneyArt++;
    }

    writeFileSync(
      journeyExtensionJsonPath,
      JSON.stringify(journeyExtensionsByImageId, null, 2) + "\n",
    );
    console.log(
      `Linked ${linkedJourneyArt} journey images (${skippedJourneyArt} skipped)`,
    );
  } else {
    // Graceful degradation when the developer's machine has no shutterstock
    // cache: the dream-art matcher still runs (the bundled TOML ledger is
    // independent of the on-disk image files), it just produces URLs that
    // 404. Mirrors the existing dreamcaller/dreamsign warn-and-continue
    // behaviour. Write an empty extension map so the runtime fetch succeeds.
    writeFileSync(journeyExtensionJsonPath, "{}\n");
    console.warn(
      `  Warning: journey art directory not found at ${journeyArtDir} — image URLs will 404`,
    );
  }

  // Card chrome art (stat orbs + parchment frames). Symlinked from the
  // Dreamtides client asset tree into `public/card-frame/`. Missing source
  // files warn-and-continue like the other art directories so a fresh
  // checkout without the Unity client still builds (the card chrome just
  // renders without its background images).
  recreateDir(cardFrameDir);
  let linkedCardFrameArt = 0;
  let missingCardFrameArt = 0;
  for (const filename of CARD_FRAME_FILES) {
    const sourcePath = join(cardFrameArtDir, filename);
    const symlinkPath = join(cardFrameDir, filename);
    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, symlinkPath);
      linkedCardFrameArt++;
    } else {
      console.warn(
        `  Warning: missing card frame art ${filename} at ${sourcePath}`,
      );
      missingCardFrameArt++;
    }
  }
  console.log(
    `Linked ${linkedCardFrameArt} of ${CARD_FRAME_FILES.length} card frame images (${missingCardFrameArt} missing)`,
  );

  console.log("Asset setup complete.");
}

if (process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href) {
  setupAssets();
}
