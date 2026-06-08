import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";

/**
 * Candidate card art lives outside the repository in the local Shutterstock
 * working set. Each category is a direct subdirectory of this root, and every
 * filename ends in `-<imageNumber>.jpg`. `untagged-categorized.json` sits at
 * the root and carries the authored card name / narrative for each image.
 */
export const DEFAULT_TAGGED_ROOT = join(
  homedir(),
  "Documents",
  "shutterstock",
  "tagged",
);

export const METADATA_FILENAME = "untagged-categorized.json";

/**
 * The "Generic" pool combines every non-specialized character subdirectory
 * into one browsing view. The list intentionally omits the bespoke pools
 * (ancient, events, landscape_abstract, spirit_animal, survivor, warrior).
 */
export const GENERIC_SUBDIRS = [
  "child",
  "explorer",
  "mage",
  "monster",
  "musician",
  "outsider",
  "synth",
  "tinkerer",
  "visitor",
];

/** The tag marking a card whose art is being replaced. */
export const ART_REWORK_TAG = "Art Rework";

/** Default card data file used to decide which images are already in use. */
export const DEFAULT_CARDS_TOML = join("data", "tabula", "cards_v2.toml");

/**
 * Extract the trailing numeric Shutterstock id from a candidate filename. The
 * convention is `<arbitrary-prefix>-<digits>.<ext>`. Returns null when the
 * filename does not match (e.g. the metadata JSON or a stray file).
 */
export function imageNumberFromFilename(filename) {
  const match = /-(\d+)\.[A-Za-z0-9]+$/u.exec(filename);
  return match === null ? match : match[1];
}

/**
 * Read the set of image numbers that are already claimed by a finished card.
 *
 * A card "uses" its `image-number` unless it carries the `Art Rework` tag:
 * those cards are precisely the ones whose art we are trying to replace, so
 * their images must still surface as candidates. Returns a `Set<string>` of
 * image numbers (as strings, matching `imageNumberFromFilename`).
 */
export function readUsedImageNumbers(cardsTomlPath) {
  const parsed = parse(readFileSync(cardsTomlPath, "utf8"));
  const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
  const used = new Set();

  for (const card of cards) {
    const imageNumber = card["image-number"];
    if (
      imageNumber === undefined ||
      imageNumber === null ||
      imageNumber === "" ||
      Number(imageNumber) <= 0
    ) {
      continue;
    }

    const tags = Array.isArray(card.tags) ? card.tags : [];
    if (tags.includes(ART_REWORK_TAG)) {
      continue;
    }

    used.add(String(imageNumber));
  }

  return used;
}

/**
 * Read `untagged-categorized.json` into a map keyed by image number. The JSON
 * records the original `untagged/<file>` path, but the categorized files have
 * since been sorted into subdirectories; matching on the trailing image number
 * reunites a file with its authored name and narrative regardless of which
 * folder it now lives in.
 */
export function readImageMetadata(metadataPath) {
  const byImageNumber = new Map();
  if (!existsSync(metadataPath)) {
    return byImageNumber;
  }

  const entries = JSON.parse(readFileSync(metadataPath, "utf8"));
  if (!Array.isArray(entries)) {
    return byImageNumber;
  }

  for (const entry of entries) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    const imagePath = typeof entry.image === "string" ? entry.image : "";
    const filename = imagePath.split("/").pop() ?? "";
    const imageNumber = imageNumberFromFilename(filename);
    if (imageNumber === null) {
      continue;
    }

    byImageNumber.set(imageNumber, {
      cardName: typeof entry.card_name === "string" ? entry.card_name : null,
      narrative: typeof entry.narrative === "string" ? entry.narrative : null,
      category: typeof entry.category === "string" ? entry.category : null,
      subtype: typeof entry.subtype === "string" ? entry.subtype : null,
    });
  }

  return byImageNumber;
}

/** List the direct subdirectories of the tagged root, sorted alphabetically. */
export function listCategories(root) {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root)
    .filter((name) => {
      if (name.startsWith(".")) {
        return false;
      }
      return statSync(join(root, name)).isDirectory();
    })
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Build the full candidate-image manifest from the local working set.
 *
 * Each image entry records its category (subdirectory), filename, trailing
 * image number, the authored card name / narrative (when present in the
 * metadata JSON), and whether a non-rework card already uses the image. The
 * frontend filters this manifest by category and by the used flag.
 */
export function buildImageManifest({
  root = DEFAULT_TAGGED_ROOT,
  cardsTomlPath = DEFAULT_CARDS_TOML,
} = {}) {
  const categories = listCategories(root);
  const usedImageNumbers = existsSync(cardsTomlPath)
    ? readUsedImageNumbers(cardsTomlPath)
    : new Set();
  const metadata = readImageMetadata(join(root, METADATA_FILENAME));

  const images = [];
  for (const category of categories) {
    const dir = join(root, category);
    for (const filename of readdirSync(dir).sort((a, b) =>
      a.localeCompare(b),
    )) {
      if (filename.startsWith(".")) {
        continue;
      }
      const imageNumber = imageNumberFromFilename(filename);
      if (imageNumber === null) {
        continue;
      }

      const meta = metadata.get(imageNumber) ?? null;
      images.push({
        category,
        filename,
        imageNumber,
        used: usedImageNumbers.has(imageNumber),
        cardName: meta?.cardName ?? null,
        narrative: meta?.narrative ?? null,
        subtype: meta?.subtype ?? null,
      });
    }
  }

  return {
    categories,
    genericSubdirs: GENERIC_SUBDIRS.filter((name) =>
      categories.includes(name),
    ),
    images,
  };
}
