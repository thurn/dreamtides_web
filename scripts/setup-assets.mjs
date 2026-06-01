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
 * Convert a TOML card record to its JSON representation with camelCase keys.
 * Spark normalization: "" or missing becomes null; "*" (variable spark)
 * becomes null; integer values are preserved. Energy cost is parsed by
 * `parseEnergyCost`: multi-cost cards (e.g. `"2,X"`) additionally emit an
 * `energyCosts` array of orb labels.
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
      result[camelKey] = value === "" || value === "*" ? null : value;
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
  dreamcallerTomlPath = join(DATA_DIR, "tabula", "dreamcallers.toml"),
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
  const dreamcallerJsonPath = join(publicDir, "dreamcaller-data.json");
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

  recreateDir(dreamcallersDir);
  let linkedDreamcallerArt = 0;
  let missingDreamcallerArt = 0;

  for (const dreamcaller of jsonDreamcallers) {
    const filename = `${dreamcaller.imageNumber}.png`;
    const sourcePath = join(dreamcallerArtDir, filename);
    const symlinkPath = join(dreamcallersDir, filename);

    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, symlinkPath);
      linkedDreamcallerArt++;
    } else {
      console.warn(
        `  Warning: missing dreamcaller art for ${dreamcaller.name} (${dreamcaller.imageNumber})`,
      );
      missingDreamcallerArt++;
    }
  }

  console.log(
    `Linked ${linkedDreamcallerArt} of ${jsonDreamcallers.length} dreamcaller portraits (${missingDreamcallerArt} missing)`,
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
