import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
 * Editorial state authored from the image viewer lives in the repository so it
 * can be reviewed and shared with every checkout.
 */
export const DEFAULT_IMAGE_VIEWER_STATE_PATH = join(
  "data",
  "image-viewer-state.json",
);

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

/** The tag marking a card whose art is approved as final. */
export const ART_OK_TAG = "Art OK";

/** Default card data file used to decide which images are already in use. */
export const DEFAULT_CARDS_TOML = join("data", "tabula", "cards_v2.toml");

/** Default figment catalog scanned for image numbers claimed by a figment. */
export const DEFAULT_FIGMENTS_TOML = join("data", "tabula", "figments.toml");

/**
 * Card data files scanned for the names an image number has ever been given.
 * `cards_v2.toml` is the live card set; it records every name a given
 * Shutterstock image has been published under.
 */
export const DEFAULT_NAME_HISTORY_TOMLS = [
  join("data", "tabula", "cards_v2.toml"),
];

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
 * Read the set of image numbers whose art is approved as final.
 *
 * A card marks its `image-number` as approved when it carries the `Art OK` tag.
 * Approved images are finished art rather than candidates, so the viewer drops
 * them entirely — this takes precedence over `Art Rework`, so a card that
 * carries both tags still has its image excluded. Returns a `Set<string>` of
 * image numbers (as strings, matching `imageNumberFromFilename`).
 */
export function readApprovedImageNumbers(cardsTomlPath) {
  const parsed = parse(readFileSync(cardsTomlPath, "utf8"));
  const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
  const approved = new Set();

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
    if (tags.includes(ART_OK_TAG)) {
      approved.add(String(imageNumber));
    }
  }

  return approved;
}

/**
 * Read the set of image numbers claimed by a figment in the figment catalog.
 *
 * A figment "uses" its `image-number` exactly when that number is a positive
 * id; the catalog stores `0` for figment types that have no art yet. Returns a
 * `Set<string>` of image numbers (as strings, matching
 * `imageNumberFromFilename`).
 */
export function readFigmentImageNumbers(figmentsTomlPath) {
  const parsed = parse(readFileSync(figmentsTomlPath, "utf8"));
  const figments = Array.isArray(parsed.figments) ? parsed.figments : [];
  const used = new Set();

  for (const figment of figments) {
    const imageNumber = figment["image-number"];
    if (
      imageNumber === undefined ||
      imageNumber === null ||
      imageNumber === "" ||
      Number(imageNumber) <= 0
    ) {
      continue;
    }

    used.add(String(imageNumber));
  }

  return used;
}

/**
 * Read every card-data TOML in `tomlPaths` into a map from image number to the
 * distinct card names that image has been published under. Names keep their
 * first-seen order across the files, and a name repeated for the same image
 * (for example the same card appearing in both the live and legacy sets) is
 * recorded once. Missing files are skipped. Returns `Map<string, string[]>`
 * keyed by image number as a string, matching `imageNumberFromFilename`.
 */
export function readNameHistory(tomlPaths) {
  const byImageNumber = new Map();

  for (const tomlPath of tomlPaths) {
    if (!existsSync(tomlPath)) {
      continue;
    }

    const parsed = parse(readFileSync(tomlPath, "utf8"));
    const cards = Array.isArray(parsed.cards) ? parsed.cards : [];

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
      const name = typeof card.name === "string" ? card.name.trim() : "";
      if (name === "") {
        continue;
      }

      const key = String(imageNumber);
      const names = byImageNumber.get(key);
      if (names === undefined) {
        byImageNumber.set(key, [name]);
      } else if (!names.includes(name)) {
        names.push(name);
      }
    }
  }

  return byImageNumber;
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

/**
 * Normalize an image-number list from persisted JSON. Invalid entries are
 * ignored and duplicates collapse into one set member.
 */
function normalizeImageNumbers(value) {
  return new Set(
    (Array.isArray(value) ? value : [])
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ""),
  );
}

/**
 * Read the tracked image-viewer state. Missing or malformed JSON yields empty
 * sets so a fresh checkout still renders the editor.
 */
export function readImageViewerState(
  statePath = DEFAULT_IMAGE_VIEWER_STATE_PATH,
) {
  if (!existsSync(statePath)) {
    return {
      favoriteImageNumbers: new Set(),
      manuallyUsedImageNumbers: new Set(),
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    return {
      favoriteImageNumbers: normalizeImageNumbers(parsed?.favoriteImageNumbers),
      manuallyUsedImageNumbers: normalizeImageNumbers(
        parsed?.manuallyUsedImageNumbers,
      ),
    };
  } catch {
    return {
      favoriteImageNumbers: new Set(),
      manuallyUsedImageNumbers: new Set(),
    };
  }
}

/** Persist both editorial sets in stable order for reviewable diffs. */
export function writeImageViewerState(statePath, state) {
  const stableState = {
    favoriteImageNumbers: [...state.favoriteImageNumbers].sort((a, b) =>
      a.localeCompare(b),
    ),
    manuallyUsedImageNumbers: [...state.manuallyUsedImageNumbers].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
  writeFileSync(statePath, `${JSON.stringify(stableState, null, 2)}\n`);
}

/** Toggle one member of a tracked image-number set. */
function setTrackedImageNumber(statePath, field, imageNumber, enabled) {
  const key = String(imageNumber).trim();
  if (key === "") {
    throw new Error("imageNumber is required.");
  }
  const state = readImageViewerState(statePath);
  if (enabled) {
    state[field].add(key);
  } else {
    state[field].delete(key);
  }
  writeImageViewerState(statePath, state);
  return state;
}

/** Mark or unmark one image number as a favorite. */
export function setFavorite(statePath, imageNumber, favorite) {
  return setTrackedImageNumber(
    statePath,
    "favoriteImageNumbers",
    imageNumber,
    favorite,
  );
}

/** Mark or unmark one image number as manually used. */
export function setManualUsed(statePath, imageNumber, used) {
  return setTrackedImageNumber(
    statePath,
    "manuallyUsedImageNumbers",
    imageNumber,
    used,
  );
}

/**
 * Resolve `<root>/<category>` to an absolute path that is guaranteed to be a
 * direct subdirectory of the tagged root, blocking `..` traversal and absolute
 * escapes. Throws when the category is missing or not an existing directory.
 */
function resolveCategoryDir(root, category) {
  if (typeof category !== "string" || category.trim() === "") {
    throw new Error("category is required.");
  }
  const rootResolved = resolve(root);
  const candidate = resolve(rootResolved, category);
  // The category must be a direct subdirectory of the tagged root: this rejects
  // the root itself, nested paths, and any `..` escape, since each of those
  // gives a parent directory other than the root.
  if (dirname(candidate) !== rootResolved) {
    throw new Error(`Invalid category: ${category}`);
  }
  if (!existsSync(candidate) || !statSync(candidate).isDirectory()) {
    throw new Error(`Category directory not found: ${category}`);
  }
  return candidate;
}

/**
 * Move a candidate image file from one category subdirectory to another,
 * changing which pool it belongs to. The filename is preserved; only the parent
 * directory changes. Both categories must be existing direct subdirectories of
 * the tagged root, the source file must exist, and a file of the same name must
 * not already occupy the destination. Returns the new `{ category, filename }`.
 */
export function moveImageCategory(root, category, filename, targetCategory) {
  if (typeof filename !== "string" || filename.trim() === "") {
    throw new Error("filename is required.");
  }
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error(`Invalid filename: ${filename}`);
  }
  if (category === targetCategory) {
    return { category, filename };
  }

  const sourceDir = resolveCategoryDir(root, category);
  const targetDir = resolveCategoryDir(root, targetCategory);
  const sourcePath = join(sourceDir, filename);
  const targetPath = join(targetDir, filename);

  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    throw new Error(`Image not found: ${category}/${filename}`);
  }
  if (existsSync(targetPath)) {
    throw new Error(
      `An image named ${filename} already exists in ${targetCategory}.`,
    );
  }

  renameSync(sourcePath, targetPath);
  return { category: targetCategory, filename };
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
 * metadata JSON), the names the image has ever been published under in the
 * card-data TOMLs, whether a non-rework card or a figment already uses the
 * image, and the curator's tracked favorite and manual-used marks. Images whose
 * card carries the `Art OK` tag are approved final art and are dropped from the
 * manifest entirely. The frontend filters the remainder by category and state.
 */
export function buildImageManifest({
  root = DEFAULT_TAGGED_ROOT,
  cardsTomlPath = DEFAULT_CARDS_TOML,
  figmentsTomlPath = DEFAULT_FIGMENTS_TOML,
  nameHistoryTomlPaths = DEFAULT_NAME_HISTORY_TOMLS,
  statePath = DEFAULT_IMAGE_VIEWER_STATE_PATH,
} = {}) {
  const categories = listCategories(root);
  const usedImageNumbers = existsSync(cardsTomlPath)
    ? readUsedImageNumbers(cardsTomlPath)
    : new Set();
  const figmentImageNumbers = existsSync(figmentsTomlPath)
    ? readFigmentImageNumbers(figmentsTomlPath)
    : new Set();
  const approvedImageNumbers = existsSync(cardsTomlPath)
    ? readApprovedImageNumbers(cardsTomlPath)
    : new Set();
  const nameHistory = readNameHistory(nameHistoryTomlPaths);
  const metadata = readImageMetadata(join(root, METADATA_FILENAME));
  const { favoriteImageNumbers, manuallyUsedImageNumbers } =
    readImageViewerState(statePath);

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
      if (approvedImageNumbers.has(imageNumber)) {
        continue;
      }

      const meta = metadata.get(imageNumber) ?? null;
      images.push({
        category,
        filename,
        imageNumber,
        used:
          usedImageNumbers.has(imageNumber) ||
          figmentImageNumbers.has(imageNumber),
        favorite: favoriteImageNumbers.has(imageNumber),
        manuallyUsed: manuallyUsedImageNumbers.has(imageNumber),
        cardName: meta?.cardName ?? null,
        narrative: meta?.narrative ?? null,
        subtype: meta?.subtype ?? null,
        cardNames: nameHistory.get(imageNumber) ?? [],
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
