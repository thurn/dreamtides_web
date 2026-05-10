import { readFileSync, mkdirSync, rmSync, symlinkSync, existsSync } from "node:fs";
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

const PUBLIC_DIR = join(ROOT, "public");

/**
 * Convert a kebab-case string to camelCase.
 */
function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Convert a TOML card record to its JSON representation with camelCase keys.
 * Spark normalization: "" or missing becomes null; "*" (variable spark)
 * becomes null; integer values are preserved.
 */
export function transformCard(card) {
  const result = {};
  for (const [key, value] of Object.entries(card)) {
    const camelKey = kebabToCamel(key);
    if (camelKey === "spark" || camelKey === "energyCost") {
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
} = {}) {
  const cardsDir = join(publicDir, "cards");
  const dreamcallersDir = join(publicDir, "dreamcallers");
  const dreamsignsDir = join(publicDir, "dreamsigns");
  const cardJsonPath = join(publicDir, "card-data.json");
  const dreamcallerJsonPath = join(publicDir, "dreamcaller-data.json");
  const dreamsignJsonPath = join(publicDir, "dreamsign-data.json");

  console.log("Parsing rendered-cards.toml...");
  const cardTomlContent = readFileSync(cardTomlPath, "utf8");
  const parsedCards = parse(cardTomlContent);
  const allCards = parsedCards.cards;

  if (!Array.isArray(allCards)) {
    throw new Error("Expected [[cards]] array in TOML file");
  }

  console.log(`Found ${allCards.length} total cards`);

  // Filter out Special cards from the runtime pool.
  const cards = allCards.filter((c) => c.rarity !== "Special");
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
    const hash = imageHash(card.imageNumber);
    const cachePath = join(imageCacheDir, hash);
    const symlinkPath = join(cardsDir, `${card.cardNumber}.webp`);

    if (existsSync(cachePath)) {
      symlinkSync(cachePath, symlinkPath);
      linked++;
    } else {
      console.warn(`  Warning: missing cache file for card ${card.cardNumber} (${card.name}): ${hash}`);
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

  console.log("Asset setup complete.");
}

if (process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href) {
  setupAssets();
}
