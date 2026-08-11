import {
  readFileSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { parse } from "smol-toml";
import { compileCardRoleData } from "./card-role-data.mjs";
import {
  CARD_ID_RE,
  readAdaptedRecordDecklistIds,
  resolveToken,
  stripJsonComments,
} from "./lib/card-refs.mjs";
import {
  readTutorialConfiguration,
  validateTutorialCatalogReferences,
} from "./tutorial-data.mjs";
import { collectAtlasAssetSources, compileAtlasData } from "./atlas-data.mjs";
import { compileEconomyData } from "./economy-data.mjs";
import { compileDraftData } from "./draft-data.mjs";
import { compileRewardSelectionData } from "./reward-selection-data.mjs";
import { compileAuguryData } from "./augury-data.mjs";
import {
  isRewardCardPredicate,
  REWARD_CARD_PREDICATES,
} from "./reward-selection-contracts.mjs";
import { compileOpponentsData } from "./opponents-data.mjs";
import {
  collectGuidePortraitSources,
  compileDreamGuidesData,
  compileSitesData,
  deriveDreamscapesData,
} from "./guide-sites-data.mjs";
import {
  EXPLORATION_EFFECT_SCHEMAS,
  EXPLORATION_FIXED_SITE_TYPES,
  EXPLORATION_TRANSFIGURATIONS,
} from "./exploration-effect-editor-schema.mjs";
import { EXPLORATION_EFFECT_KINDS } from "./exploration-effect-kinds.mjs";
import {
  SHARED_EXPLORATION_EFFECT_VALIDATION_KINDS,
  validateExplorationEffectAction,
  validateExplorationEffectAuthoredFields,
} from "./exploration-effect-validation.mjs";
import { amplifiedStructuralErrors } from "./lib/amplified-validation.mjs";
import {
  compileGambleData,
  compileResonanceData,
  compileTransfigurationData,
} from "./data-driven-catalogs.mjs";
import { compileTidesData } from "./tides-data.mjs";

// Re-exported for `setup-assets.test.mjs`, which exercises the JSONC comment
// stripper alongside the asset-build helpers defined here.
export { stripJsonComments };

/** Compile the authored opponent catalog and write its browser artifact. */
export function generateOpponentsData({
  opponentsTomlPath,
  opponentsJsonPath,
  cardIds,
}) {
  const compiled = compileOpponentsData(
    parse(readFileSync(opponentsTomlPath, "utf8")),
    { cardIds },
  );
  writeFileSync(opponentsJsonPath, `${JSON.stringify(compiled, null, 2)}\n`);
  return compiled;
}

const ROOT = resolve(
  process.env.DREAMTIDES_DATA_ROOT ?? resolve(import.meta.dirname, ".."),
);
const DATA_DIR = join(ROOT, "data");
export const IMAGE_CACHE_DIR = join(
  homedir(),
  "Library",
  "Caches",
  "io.github.dreamtides.tv",
  "image_cache",
);
const DREAM_AVATAR_ART_DIR_CANDIDATES = [
  join(homedir(), "Documents", "synty", "dream-avatars"),
  join(homedir(), "Documents", "sytny", "dream-avatars"),
  join(homedir(), "Documents", "synty", "dream" + "callers"),
  join(homedir(), "Documents", "sytny", "dream" + "callers"),
];
// Dreamsign art is sourced exclusively from the `outlined` variants — every
// sign carries its own glyph outline for on-scene legibility. The shared
// `alt_text.txt` metadata lives one level up in `filtered`, so the alt-text
// reader falls back to the parent directory.
const DREAMSIGN_ART_DIR = join(
  homedir(),
  "Documents",
  "dreamsigns",
  "filtered",
  "outlined",
);
const JOURNEY_ART_DIR = join(
  homedir(),
  "Documents",
  "shutterstock",
  "images_journeys",
);
const MAIN_MENU_BACKGROUND_ART_PATH = join(
  homedir(),
  "Documents",
  "shutterstock",
  "quest_prototype_assets",
  "main-menu-background.jpg",
);
const EXPLORATION_HIGH_RES_ART_DIR = join(
  homedir(),
  "Documents",
  "shutterstock",
  "quest_prototype_assets",
  "exploration",
);
const EXPLORATION_SOURCE_ART_DIR = join(
  homedir(),
  "Documents",
  "shutterstock",
  "images",
);
const TUTORIAL_DIALOGUE_FRAME_ART_PATH = join(
  homedir(),
  "Documents",
  "UI",
  "ClassicFantasyRPG_UI",
  "ARTWORKS",
  "UIelements",
  "Round_frame.png",
);

// Dream Atlas art. Each dreamscape ships a rectangular scene image
// (`<id>.png`, the hover-card art) and a circular node icon (`<id>_icon.png`).
// Dream-guide character renders (one per guide, plus the boss `apollyon.png`)
// and the ornate round frame used for unrevealed nodes round out the set.
export const DREAMSCAPE_SCENE_ART_DIR = join(
  homedir(),
  "Documents",
  "synty",
  "dreamscape_images",
);
export const DREAMSCAPE_ICON_ART_DIR = join(
  homedir(),
  "Documents",
  "synty",
  "dreamscape_icons",
);
export const DREAM_GUIDE_ART_DIR = join(
  homedir(),
  "Documents",
  "synty",
  "dream_guides",
);

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

  return {
    energyCost: base,
    energyCosts: segments.map(energyCostSegmentLabel),
  };
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
  if (card["amplified-text"] !== undefined) {
    const structuralErrors = amplifiedStructuralErrors(
      card["rendered-text"] ?? "",
      card["amplified-text"],
      card["card-type"],
    );
    if (structuralErrors.length > 0) {
      throw new Error(
        `Card ${String(card.id)} has invalid amplified-text: ${structuralErrors.join(", ")}`,
      );
    }
  }
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
    } else if (camelKey === "tides") {
      // Tides are not part of runtime card data; drop any authored value.
    } else {
      result[camelKey] = value;
    }
  }
  result.isStarter = card.roles?.includes("starter-deck") === true;
  if (!("spark" in result)) {
    result.spark = null;
  }
  if (!("subtype" in result) || result.subtype == null) {
    result.subtype = "";
  }
  return result;
}

/**
 * Bundle adapted draft records from `docs/draft_records_adapted` into a flat
 * array of per-human-seat corpus entries.
 *
 * Each file is JSONC (`docs/draft_records_adapted/*.jsonc` carry inline `//`
 * card-name comments written by `add-uuids-to-draft-records.mjs`); the comments
 * are stripped before parsing. Each file must have a `seats` array; files without
 * it (e.g. a name dictionary) are silently skipped. Within each file, a seat is
 * included when:
 *   1. Its `mainboard` array is non-empty.
 *   2. After trimming to the first three packs (each cut to `pickInPack <= 10`),
 *      the seat has exactly 30 trimmed picks (10 per pack). Anything else — an
 *      incomplete record, or a non-standard pack layout — drops the seat.
 *
 * The corpus stores each card as its stable cards_v2 UUID. A token that is not a
 * UUID for a known card is dropped from whichever mainboard/pack/pick array it
 * appears in; the total is logged. Storing the id is what makes the corpus
 * rename-proof: a renamed card keeps its id, so its picks survive and the bundle
 * just refreshes the display name from `idToName`.
 *
 * Returns one entry per surviving seat:
 *   `{ id, draftId, sourceFile, mainboard, mainboardIds, packs, picks, packIds,
 *   pickIds }`. `mainboard` is the seat's kept cards as CURRENT display names and
 *   `mainboardIds` is the matching stable UUIDs, index-for-index (so a consumer
 *   can key on ids and stay correct when two cards share a name). `packs[i]`/
 *   `picks[i]` are the i-th trimmed pick's cards as current display names, and
 *   `packIds[i]`/`pickIds[i]` are the matching stable UUIDs, index-for-index.
 *   With the default options all four pick arrays have length 30.
 *
 */
export function buildDraftRecords(dir, cardMaps) {
  const { idToName } = cardMaps;
  let droppedNames = 0;
  let skippedIncomplete = 0;

  const records = [];

  for (const filename of readdirSync(dir)
    .filter((f) => f.endsWith(".jsonc"))
    .sort()) {
    const raw = JSON.parse(
      stripJsonComments(readFileSync(join(dir, filename), "utf8")),
    );
    if (!Array.isArray(raw.seats)) continue;

    const { draftId } = raw;

    /**
     * Resolve an array of card tokens (stable cards_v2 UUIDs) to current names +
     * ids. A token that is not a UUID for a known card is dropped (incrementing
     * the global counter), so the returned `names` and `ids` stay index-aligned.
     */
    function resolve(tokens) {
      const outNames = [];
      const outIds = [];
      for (const token of tokens) {
        if (CARD_ID_RE.test(token) && idToName.has(token)) {
          outNames.push(idToName.get(token));
          outIds.push(token);
        } else {
          droppedNames++;
        }
      }
      return { names: outNames, ids: outIds };
    }

    for (const seatData of raw.seats) {
      const { seat, mainboard: rawMainboard, picks: rawPicks } = seatData;

      // Skip seats without a non-empty mainboard or a picks array.
      if (!Array.isArray(rawMainboard) || rawMainboard.length === 0) continue;
      if (!Array.isArray(rawPicks)) continue;

      // Trim to the first three packs, each cut to its first ten picks, sorted
      // by pickNumber ascending. This drops the smallest late-pack offers
      // (pickInPack 11+) and any packs beyond the third, so a standard 3x15
      // draft and the first three packs of a 4+ pack draft both yield 30 picks.
      const trimmed = rawPicks
        .filter((p) => p.pack >= 1 && p.pack <= 3 && p.pickInPack <= 10)
        .sort((a, b) => a.pickNumber - b.pickNumber);

      if (trimmed.length !== 30) {
        skippedIncomplete++;
        continue;
      }

      const resolvedMainboard = resolve(rawMainboard);
      const resolvedPacks = trimmed.map((p) => resolve(p.packCards));
      const resolvedPicks = trimmed.map((p) => resolve(p.pick));

      records.push({
        id: `${draftId}#${seat}`,
        draftId,
        sourceFile: filename,
        mainboard: resolvedMainboard.names,
        mainboardIds: resolvedMainboard.ids,
        packs: resolvedPacks.map((r) => r.names),
        picks: resolvedPicks.map((r) => r.names),
        packIds: resolvedPacks.map((r) => r.ids),
        pickIds: resolvedPicks.map((r) => r.ids),
      });
    }
  }

  if (skippedIncomplete > 0) {
    console.log(
      `Skipped ${skippedIncomplete} draft seats that did not yield exactly 30 trimmed picks`,
    );
  }
  if (droppedNames > 0) {
    console.log(
      `Dropped ${droppedNames} unresolved card names from draft records`,
    );
  }

  return records;
}

/**
 * Build the known-good decklists corpus artifact from the manifest at
 * `docs/known_good_decklists.json`. Each entry in the manifest identifies a
 * specific (draftId, seat) pair that has been curated as a high-quality
 * example deck; this function resolves those seats from the adapted draft
 * records and projects them to the slim `{ id, draftId, seat, name,
 * mainboardIds }` shape consumed by the corpus opponent-deck algorithm.
 *
 * `requireFullPicks: false` is intentional — many curated decklists come from
 * drafts that did not use a standard 3×15 pack layout, so the standard 30-pick
 * trim would drop them. The corpus only needs the mainboard, not the pack
 * sequence, so relaxed trimming is correct here.
 *
 * @param {string} manifestPath - path to `docs/known_good_decklists.json`
 * @param {string} draftRecordsAdaptedDir - path to `docs/draft_records_adapted/`
 * @param {{ idToName: Map<string,string> }} cardMaps
 * @returns {Array<{ id: string, draftId: string, seat: number, name: string, mainboardIds: string[] }>}
 */
export function buildKnownGoodDecklists(
  manifestPath,
  draftRecordsAdaptedDir,
  cardMaps,
) {
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  const decklists = parsed.decklists;

  const seatFilter = new Set(decklists.map((d) => `${d.draftId}#${d.seat}`));
  const nameByKey = new Map(
    decklists.map((d) => [`${d.draftId}#${d.seat}`, d.name]),
  );

  const records = buildDraftRecords(draftRecordsAdaptedDir, cardMaps, {
    seatFilter,
    requireFullPicks: false,
  });

  return records.map((record) => {
    const { id } = record;
    const seat = Number(id.split("#")[1]);
    return {
      id,
      draftId: record.draftId,
      seat,
      name: nameByKey.get(id) ?? "",
      mainboardIds: record.mainboardIds.map((x) => x.toLowerCase()),
    };
  });
}

/**
 * Build the `idToName` lookup map from the parsed cards_v2 records. The `id`
 * UUID is the stable key every card-reference system uses; the map resolves a
 * reference UUID back to the current display name for the render boundary.
 */
export function buildCardMaps(cardsV2) {
  const idToName = new Map();
  for (const card of cardsV2) {
    if (typeof card.id !== "string") {
      throw new Error(`cards_v2 card "${String(card.name)}" is missing an id`);
    }
    idToName.set(card.id, card.name);
  }
  return { idToName };
}

/**
 * Fail the build if any UUID in `keys` is not a real cards_v2 card. `label`
 * names the source file for the error message.
 */
export function validateCardIds(keys, idToName, label) {
  const unknown = [];
  for (const key of keys) {
    if (!CARD_ID_RE.test(key) || !idToName.has(key)) unknown.push(key);
  }
  if (unknown.length > 0) {
    throw new Error(
      `${label} references ${String(unknown.length)} unknown card id(s): ` +
        unknown.slice(0, 5).join(", "),
    );
  }
}

/**
 * Enforce the dreamscape <-> DreamAvatar mapping invariant at build time:
 * non-starter dreamscapes partition `dream_avatars.toml` into resident groups.
 * `dreamscapes` are the transformed dreamscape records and `dreamAvatarIds` the
 * set of every real DreamAvatar id. Fatal violations depend only on
 * `dreamscapes.toml` itself, so a routine edit elsewhere can never trip them:
 * the same DreamAvatar listed under two dreamscapes, the starter carrying
 * residents, or a non-starter region outside the 3-4 band. Referential checks
 * against the DreamAvatar set are non-fatal warnings instead, because the build
 * may run against a reduced DreamAvatar fixture (the asset tests swap one in): a
 * `dream-avatar-id` that resolves to no DreamAvatar, and a DreamAvatar assigned
 * to no dreamscape, are each reported as a warning. In a full production build
 * both files are real, so a stray id surfaces as paired warnings (the bad id is
 * unknown and the orphaned DreamAvatar is unassigned). Ids are compared
 * case-insensitively. Returns a `{ id -> count }` summary for logging.
 */
export function validateDreamAvatarMapping(dreamscapes, dreamAvatarIds) {
  const known = new Map(
    [...dreamAvatarIds].map((id) => [id.toLowerCase(), id]),
  );
  const assignedTo = new Map(); // lowercased dreamAvatar id -> dreamscape id
  const unknown = [];
  const counts = {};

  for (const scape of dreamscapes) {
    const ids = scape.dreamAvatarIds ?? [];
    counts[scape.id] = ids.length;

    if (scape.isStarter) {
      if (ids.length > 0) {
        throw new Error(
          `dreamscapes.toml: starter dreamscape "${scape.id}" must not list ` +
            `dream-avatar-ids (found ${String(ids.length)})`,
        );
      }
      continue;
    }

    if (ids.length < 3 || ids.length > 4) {
      throw new Error(
        `dreamscapes.toml: dreamscape "${scape.id}" has ${String(ids.length)} ` +
          `dream-avatar-ids; each non-starter region must have 3-4`,
      );
    }

    for (const rawId of ids) {
      const key = rawId.toLowerCase();
      if (!known.has(key)) {
        unknown.push(`${rawId} (${scape.id})`);
        continue;
      }
      const prior = assignedTo.get(key);
      if (prior !== undefined) {
        throw new Error(
          `dreamscapes.toml: dreamAvatar ${rawId} is assigned to both ` +
            `"${prior}" and "${scape.id}"; each DreamAvatar belongs to exactly ` +
            `one dreamscape`,
        );
      }
      assignedTo.set(key, scape.id);
    }
  }

  if (unknown.length > 0) {
    console.warn(
      `WARNING: dreamscapes.toml references ${String(unknown.length)} ` +
        `dreamAvatar id(s) that resolve to no DreamAvatar: ` +
        `${unknown.slice(0, 5).join(", ")}` +
        (unknown.length > 5 ? ", ..." : ""),
    );
  }

  const unassigned = [...known.entries()]
    .filter(([key]) => !assignedTo.has(key))
    .map(([, id]) => id);
  if (unassigned.length > 0) {
    console.warn(
      `WARNING: ${String(unassigned.length)} dreamAvatar(s) are not assigned ` +
        `to any dreamscape: ${unassigned.slice(0, 5).join(", ")}` +
        (unassigned.length > 5 ? ", ..." : ""),
    );
  }

  return counts;
}

/**
 * Convert a TOML Dreamwell record to its JSON representation with camelCase keys.
 * Dreamwell cards are the shared cards drawn one per turn during the Dreamwell
 * phase (see docs/battle_rules/battle_rules.md). The transform is a plain
 * kebab->camel rename: every field (`name`, `id`, `rendered-text`, `order`,
 * `energy-added`, `card-type`, `image-number`, `art-owned`, `card-number`) is
 * preserved verbatim. A record without `image-number` keeps no `imageNumber`
 * key, which the runtime renders as a generated identicon, matching cards.
 */
export function transformDreamwell(dreamwell) {
  const result = {};
  for (const [key, value] of Object.entries(dreamwell)) {
    result[kebabToCamel(key)] = value;
  }
  return result;
}

/**
 * Convert a TOML DreamAvatar record to its JSON representation with camelCase keys.
 * Omitted `starting-essence` values remain omitted until both this catalog and
 * economy data have loaded, when the runtime applies the authored default.
 */
export function transformDreamAvatar(dreamAvatar) {
  const result = {};
  for (const [key, value] of Object.entries(dreamAvatar)) {
    result[kebabToCamel(key)] = value;
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
      altTextByImageName.get(dreamsign.image_name) ??
      `${dreamsign.name} Dreamsign artwork`,
    effectDescription: dreamsign["rendered-text"] ?? "",
  };
}

function transformTomlRecord(record) {
  const result = {};
  for (const [key, value] of Object.entries(record)) {
    const transformed = Array.isArray(value)
      ? value.map((entry) =>
          typeof entry === "object" && entry !== null
            ? transformTomlRecord(entry)
            : entry,
        )
      : typeof value === "object" && value !== null
        ? transformTomlRecord(value)
        : value;
    result[kebabToCamel(key)] = transformed;
  }
  return result;
}

/** Convert and validate the authored Exploration encounter catalog. */
export function transformExplorationData(source) {
  if (source["schema-version"] !== 2) {
    throw new Error("exploration.toml: schema-version must be 2");
  }
  const effectSchemas = EXPLORATION_EFFECT_SCHEMAS;
  const effectSchemaByKind = new Map(
    effectSchemas.map((schema) => [schema.kind, schema]),
  );
  const compilerEffectKinds = source["effect-kinds"];
  const editorEffectKinds = effectSchemas.map((schema) => schema.kind);
  if (
    !Array.isArray(compilerEffectKinds) ||
    compilerEffectKinds.length !== EXPLORATION_EFFECT_KINDS.length ||
    compilerEffectKinds.some(
      (kind, index) => kind !== EXPLORATION_EFFECT_KINDS[index],
    ) ||
    editorEffectKinds.length !== EXPLORATION_EFFECT_KINDS.length ||
    editorEffectKinds.some(
      (kind, index) => kind !== EXPLORATION_EFFECT_KINDS[index],
    )
  ) {
    throw new Error(
      "exploration.toml: compiler, runtime, and editor effect kinds must match",
    );
  }
  const effectKindSet = new Set(EXPLORATION_EFFECT_KINDS);
  const fixedSiteTypeSet = new Set(
    EXPLORATION_FIXED_SITE_TYPES.map(({ value }) => value),
  );
  const customCards = (source["custom-card"] ?? []).map((raw) => {
    const card = transformTomlRecord(raw);
    return {
      ...card,
      spark: typeof card.spark === "number" ? card.spark : null,
      isFast: false,
      isStarter: false,
    };
  });
  const customDreamsigns = (source["custom-dreamsign"] ?? []).map((raw) => {
    const dreamsign = transformTomlRecord(raw);
    return {
      id: dreamsign.id,
      name: dreamsign.name,
      effectDescription: dreamsign.renderedText ?? "",
    };
  });
  const encounters = (source.encounter ?? []).map((rawEncounter) => {
    const encounter = transformTomlRecord(rawEncounter);
    return {
      ...encounter,
      action: (encounter.action ?? []).map((rawAction) => {
        // The RON compatibility serializer may render nested maps as child
        // tables. Reconstruct the established action contract explicitly so
        // generated JSON field order is independent of TOML table layout.
        const {
          id,
          label,
          effectText,
          followupTitle,
          followupSubtitle,
          effectKind,
          ...effectFields
        } = rawAction;
        const action = {
          id,
          label,
          effectText,
          ...(followupTitle === undefined ? {} : { followupTitle }),
          ...(followupSubtitle === undefined ? {} : { followupSubtitle }),
          effectKind,
          ...effectFields,
        };
        validateExplorationEffectAuthoredFields(action, {
          fail(message) {
            if (action.effectKind === "add-fixed-site") {
              throw new Error(
                `exploration.toml: action ${action.id} effect-kind add-fixed-site requires a supported site-type`,
              );
            }
            if (action.effectKind === "choose-site-type") {
              throw new Error(
                `exploration.toml: action ${action.id} effect-kind choose-site-type requires explicit offer-count 3`,
              );
            }
            throw new Error(
              `exploration.toml: action ${action.id} effect-kind ${message}`,
            );
          },
        });
        const definition = effectSchemaByKind.get(action.effectKind);
        const defaults = Object.fromEntries(
          (definition?.fields ?? []).flatMap((entry) =>
            entry.defaultValue === undefined || action[entry.key] !== undefined
              ? []
              : [[entry.key, entry.defaultValue]],
          ),
        );
        return {
          ...defaults,
          ...action,
          ...(definition?.canonicalMechanicId === undefined
            ? {}
            : { canonicalMechanicId: definition.canonicalMechanicId }),
          ...(definition?.defaultSelectionPolicyId === undefined
            ? {}
            : {
                selectionPolicyId:
                  action.selectionPolicyId ??
                  definition.defaultSelectionPolicyId,
              }),
        };
      }),
    };
  });

  if (encounters.length === 0) {
    throw new Error("exploration.toml: requires at least one encounter");
  }
  const encounterIds = new Set();
  const actionIds = new Set();
  for (const encounter of encounters) {
    if (typeof encounter.cardId !== "string" || encounter.cardId.length === 0) {
      throw new Error("exploration.toml: every encounter requires card-id");
    }
    if (encounterIds.has(encounter.cardId.toLowerCase())) {
      throw new Error(
        `exploration.toml: duplicate encounter card-id ${encounter.cardId}`,
      );
    }
    encounterIds.add(encounter.cardId.toLowerCase());
    if (
      !Array.isArray(encounter.action) ||
      encounter.action.length < 1 ||
      encounter.action.length > 4
    ) {
      throw new Error(
        `exploration.toml: encounter ${encounter.cardId} must have between one and four actions`,
      );
    }
    for (const action of encounter.action) {
      if (typeof action.id !== "string" || actionIds.has(action.id)) {
        throw new Error(
          `exploration.toml: missing or duplicate action id ${String(action.id)}`,
        );
      }
      actionIds.add(action.id);
      if (!effectKindSet.has(action.effectKind)) {
        throw new Error(
          `exploration.toml: action ${action.id} has unknown effect-kind ${String(action.effectKind)}`,
        );
      }
      const definition = effectSchemaByKind.get(action.effectKind);
      if (
        definition?.allowedSelectionPolicyIds !== undefined &&
        !definition.allowedSelectionPolicyIds.includes(action.selectionPolicyId)
      ) {
        throw new Error(
          `exploration.toml: action ${action.id} has unsupported selection-policy-id ${String(action.selectionPolicyId)}`,
        );
      }
      for (const key of ["label", "effectText"]) {
        if (typeof action[key] !== "string" || action[key].trim() === "") {
          throw new Error(
            `exploration.toml: action ${action.id} requires ${key}`,
          );
        }
      }
      validateExplorationEffectAction(action, {
        predicates: new Set(
          REWARD_CARD_PREDICATES.filter((predicate) => predicate !== "any"),
        ),
        transfigurations: new Set(EXPLORATION_TRANSFIGURATIONS),
        fixedSiteTypes: fixedSiteTypeSet,
        fail(message) {
          if (message.includes("incompatible mechanic or selection policy")) {
            if (
              [
                "free-next-shop",
                "lose-half-essence-and-free-purchases",
              ].includes(action.effectKind)
            ) {
              throw new Error(
                `exploration.toml: action ${action.id} effect-kind ${action.effectKind} must compile without a selection policy`,
              );
            }
            if (
              [
                "purge-random-starter-and-gain-card",
                "replace-all-starter-cards",
              ].includes(action.effectKind)
            ) {
              throw new Error(
                `exploration.toml: action ${action.id} effect-kind ${action.effectKind} does not support a top-level selection-policy-id`,
              );
            }
          }
          throw new Error(`exploration.toml: action ${action.id} ${message}`);
        },
        terminology: {
          effectKind: "effect-kind",
          offerCount: "explicit offer-count",
          positiveInteger: "positive whole-number",
          predicateRequirement:
            "requires predicate and requires a non-Any predicate",
          siteType: "site-type",
        },
      });
      if (!SHARED_EXPLORATION_EFFECT_VALIDATION_KINDS.has(action.effectKind)) {
        if (
          [
            "gain-offered-card",
            "draft-card",
            "take-cards",
            "transfigured-card-draft",
          ].includes(action.effectKind) &&
          (typeof action.predicate !== "string" ||
            action.predicate.length === 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires predicate`,
          );
        }
        if (
          action.predicate !== undefined &&
          action.predicate !== "" &&
          !isRewardCardPredicate(action.predicate)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} has unsupported predicate ${String(action.predicate)}`,
          );
        }
        if (action.cardType !== undefined) {
          throw new Error(
            `exploration.toml: action ${action.id} field cardType does not apply to effect-kind ${action.effectKind}`,
          );
        }
        if (action.siteType !== undefined) {
          throw new Error(
            `exploration.toml: action ${action.id} field siteType does not apply to effect-kind ${action.effectKind}`,
          );
        }
        const invalidCount =
          typeof action.count !== "number" ||
          !Number.isInteger(action.count) ||
          action.count <= 0;
        if (
          (action.effectKind === "draft-card" && invalidCount) ||
          (action.effectKind === "gain-offered-card" &&
            action.count !== undefined &&
            invalidCount)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires a positive whole-number count`,
          );
        }
        if (
          [
            "draft-card",
            "take-cards",
            "transfigured-card-draft",
            "gain-nightmare-and-offered-dreamsign",
            "gain-offered-dreamsign",
            "replace-selected-dreamsign-with-offered",
          ].includes(action.effectKind) &&
          (typeof action.offerCount !== "number" ||
            !Number.isInteger(action.offerCount) ||
            action.offerCount <= 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires a positive whole-number offer-count`,
          );
        }
        if (
          [
            "gain-card",
            "replace-selected-with-card",
            "gain-nightmare-and-card",
          ].includes(action.effectKind) &&
          (typeof action.cardId !== "string" || action.cardId.length === 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires card-id`,
          );
        }
        if (
          action.effectKind === "gain-nightmare-and-dreamsign" &&
          (typeof action.dreamsignId !== "string" ||
            action.dreamsignId.trim().length === 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires dreamsign-id`,
          );
        }
        if (
          action.effectKind === "transfigure-all-for-essence" &&
          (typeof action.essence !== "number" ||
            !Number.isInteger(action.essence) ||
            action.essence <= 0 ||
            typeof action.predicate !== "string" ||
            action.predicate.length === 0 ||
            typeof action.transfiguration !== "string" ||
            action.transfiguration.length === 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires positive whole-number essence, predicate, and transfiguration`,
          );
        }
        if (
          action.effectKind === "gain-essence-per-card" &&
          (typeof action.essencePerCard !== "number" ||
            action.essencePerCard <= 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires positive essence-per-card`,
          );
        }
        if (
          action.effectKind === "increase-spark-all" &&
          (typeof action.sparkBonus !== "number" || action.sparkBonus <= 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires positive spark-bonus`,
          );
        }
        if (
          action.effectKind === "purge-random-subtype-and-increase-spark" &&
          (typeof action.subtype !== "string" ||
            action.subtype.trim().length === 0 ||
            typeof action.sparkBonus !== "number" ||
            action.sparkBonus <= 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires subtype and positive spark-bonus`,
          );
        }
        if (
          action.effectKind === "purge-dreamsign-for-essence" &&
          (typeof action.essence !== "number" || action.essence <= 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires positive essence`,
          );
        }
        if (
          [
            "gain-nightmare-and-dreamsign",
            "gain-nightmare-and-offered-dreamsign",
            "gain-nightmare-and-card",
            "reduce-cost-all-and-gain-nightmares",
          ].includes(action.effectKind) &&
          ((action.effectKind === "reduce-cost-all-and-gain-nightmares" &&
            (typeof action.energyCostReduction !== "number" ||
              action.energyCostReduction <= 0)) ||
            typeof action.nightmareCount !== "number" ||
            !Number.isInteger(action.nightmareCount) ||
            action.nightmareCount <= 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires a positive whole-number nightmare-count`,
          );
        }
        const nightmareDreamsignFields = [
          ["dreamsignId", ["gain-dreamsign", "gain-nightmare-and-dreamsign"]],
          [
            "offerCount",
            [
              "draft-card",
              "take-cards",
              "transfigured-card-draft",
              "gain-nightmare-and-offered-dreamsign",
              "gain-offered-dreamsign",
              "replace-selected-dreamsign-with-offered",
              "copy-offered-deck-card",
              "choose-dream-avatar",
            ],
          ],
          [
            "nightmareCount",
            [
              "gain-nightmare-and-dreamsign",
              "gain-nightmare-and-offered-dreamsign",
              "gain-nightmare-and-card",
              "reduce-cost-all-and-gain-nightmares",
            ],
          ],
        ];
        for (const [field, applicableKinds] of nightmareDreamsignFields) {
          if (
            action[field] !== undefined &&
            !applicableKinds.includes(action.effectKind)
          ) {
            throw new Error(
              `exploration.toml: action ${action.id} field ${field} does not apply to effect-kind ${action.effectKind}`,
            );
          }
        }
        if (
          [
            "copy-selected-card",
            "copy-selected-cards",
            "next-battle-opening-hand",
            "next-battle-starting-energy",
            "purge-selected-dreamsign-and-gain-random",
          ].includes(action.effectKind) &&
          (typeof action.count !== "number" ||
            !Number.isInteger(action.count) ||
            action.count <= 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires a positive whole-number count`,
          );
        }
        if (
          action.effectKind === "purge-for-essence" &&
          (typeof action.essencePerSpark !== "number" ||
            !Number.isFinite(action.essencePerSpark) ||
            action.essencePerSpark <= 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires positive essence-per-spark`,
          );
        }
        if (
          ["copy-offered-deck-card", "choose-dream-avatar"].includes(
            action.effectKind,
          ) &&
          (typeof action.offerCount !== "number" ||
            !Number.isInteger(action.offerCount) ||
            action.offerCount <= 0)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires a positive whole-number offer-count`,
          );
        }
        if (
          action.effectKind === "change-subtype-selected" &&
          (typeof action.subtype !== "string" || action.subtype.trim() === "")
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires a non-empty subtype`,
          );
        }
        const targetedKinds = new Set([
          "change-subtype-selected",
          "copy-selected-card",
        ]);
        if (targetedKinds.has(action.effectKind)) {
          if (
            action.deckTarget !== "chosen" &&
            action.deckTarget !== "offered"
          ) {
            throw new Error(
              `exploration.toml: action ${action.id} requires deck-target`,
            );
          }
        } else if (action.deckTarget !== undefined) {
          throw new Error(
            `exploration.toml: action ${action.id} has unsupported deck-target`,
          );
        }
        if (
          (action.followupTitle === undefined) !==
          (action.followupSubtitle === undefined)
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} requires both followup fields`,
          );
        }
        if (/\$[A-Z][A-Z0-9_]*/u.test(action.effectText)) {
          throw new Error(
            `exploration.toml: action ${action.id} uses an untyped presentation token`,
          );
        }
        const presentationSlots = [
          ...new Set(action.effectText.match(/\{([a-z][a-z0-9_]*)\}/gu) ?? []),
        ];
        const allowedSlots = new Set([
          ...(action.effectKind === "gain-offered-card"
            ? ["{offered_card}"]
            : []),
          ...(action.deckTarget === "offered" ? ["{deck_card}"] : []),
          ...(action.cardId === undefined ? [] : ["{fixed_card}"]),
          ...([
            "gain-nightmare-and-dreamsign",
            "gain-nightmare-and-offered-dreamsign",
            "gain-nightmare-and-card",
            "reduce-cost-all-and-gain-nightmares",
          ].includes(action.effectKind)
            ? ["{nightmare_card}"]
            : []),
        ]);
        for (const slot of presentationSlots) {
          if (!allowedSlots.has(slot)) {
            throw new Error(
              `exploration.toml: action ${action.id} has unsupported presentation slot ${slot}`,
            );
          }
        }
        if (
          action.effectKind === "gain-offered-card" &&
          !presentationSlots.includes("{offered_card}")
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} must present {offered_card}`,
          );
        }
        if (
          action.deckTarget === "offered" &&
          !presentationSlots.includes("{deck_card}")
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} must present {deck_card}`,
          );
        }
        if (
          action.cardId !== undefined &&
          !presentationSlots.includes("{fixed_card}")
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} must present {fixed_card}`,
          );
        }
        if (
          [
            "gain-nightmare-and-dreamsign",
            "gain-nightmare-and-offered-dreamsign",
            "gain-nightmare-and-card",
            "reduce-cost-all-and-gain-nightmares",
          ].includes(action.effectKind) &&
          !presentationSlots.includes("{nightmare_card}")
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} must present {nightmare_card}`,
          );
        }
      }
      const followupSlots = [
        ...new Set(
          `${action.followupTitle ?? ""}\n${action.followupSubtitle ?? ""}`.match(
            /\{([a-z][a-z0-9-]*)\}/gu,
          ) ?? [],
        ),
      ];
      const allowedFollowupSlots = new Set([
        "{action-label}",
        "{count}",
        "{subtype}",
        "{transfiguration}",
        "{essence-per-spark}",
      ]);
      for (const slot of followupSlots) {
        if (!allowedFollowupSlots.has(slot)) {
          throw new Error(
            `exploration.toml: action ${action.id} has unsupported followup slot ${slot}`,
          );
        }
      }
    }
  }

  const hashPayload = {
    schemaVersion: 2,
    customCards,
    customDreamsigns,
    encounters,
  };
  const contentHash = createHash("sha256")
    .update(JSON.stringify(hashPayload))
    .digest("hex");
  return {
    ...hashPayload,
    contentHash,
    foldHash: contentHash,
  };
}

/**
 * Convert a TOML figment record to its JSON representation with camelCase keys.
 * Figment spark is a plain non-negative integer (a Legion's stored value is the
 * per-warrior rate; its live spark is computed from the board), so it is parsed
 * with `parseSpark` and any missing value defaults to 0. A missing `image-number`
 * defaults to 0 (no assigned art), matching the card transform.
 */
export function transformFigment(figment) {
  const result = {};
  for (const [key, value] of Object.entries(figment)) {
    const camelKey = kebabToCamel(key);
    if (camelKey === "spark") {
      result.spark = parseSpark(value).spark;
    } else {
      result[camelKey] = value;
    }
  }
  if (result.spark == null) {
    result.spark = 0;
  }
  if (result.imageNumber == null) {
    result.imageNumber = 0;
  }
  return result;
}

/**
 * Build the Shutterstock preview URL for a given image number. This is the
 * canonical source for card art: every cache filename is keyed off this URL,
 * so the same helper is reused anywhere art is fetched or located by number.
 */
export function shutterstockImageUrl(imageNumber) {
  return `https://www.shutterstock.com/image-illustration/-260nw-${imageNumber}.jpg`;
}

/**
 * Compute the SHA-256 hash of the Shutterstock URL for a given image number.
 */
export function imageHash(imageNumber) {
  return createHash("sha256")
    .update(shutterstockImageUrl(imageNumber))
    .digest("hex");
}

/**
 * Clean and recreate a directory for idempotent runs.
 */
function recreateDir(dir) {
  // macOS watchers can briefly retain generated children while Vite is live.
  // Node's retry support makes regeneration robust to those transient handles.
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  mkdirSync(dir, { recursive: true });
}

/**
 * Link the full-screen Exploration art for the authored encounter catalog.
 * Curated full-resolution files win; encounters without one use the same
 * matching source-art file.
 */
export function linkExplorationArt({
  destinationDir,
  highResArtDir,
  sourceArtDir,
  imageNumbers,
}) {
  recreateDir(destinationDir);
  const wanted = new Set(imageNumbers.map(String));
  const linked = new Set();
  let highResolutionCount = 0;
  let sourceCount = 0;

  if (existsSync(highResArtDir)) {
    for (const filename of readdirSync(highResArtDir)) {
      const match = /^(\d+)\.jpg$/u.exec(filename);
      if (match === null || !wanted.has(match[1])) continue;
      symlinkSync(
        join(highResArtDir, filename),
        join(destinationDir, filename),
      );
      linked.add(match[1]);
      highResolutionCount++;
    }
  }

  const sourceFiles = existsSync(sourceArtDir)
    ? readdirSync(sourceArtDir).filter((filename) =>
        filename.toLowerCase().endsWith(".jpg"),
      )
    : [];
  for (const imageNumber of wanted) {
    if (linked.has(imageNumber)) continue;
    const pattern = new RegExp(`(?<!\\d)${imageNumber}\\.jpg$`, "iu");
    const matches = sourceFiles.filter((filename) => pattern.test(filename));
    if (matches.length !== 1) {
      console.warn(
        `  Warning: expected one Exploration source image for ${imageNumber}, found ${String(matches.length)}`,
      );
      continue;
    }
    symlinkSync(
      join(sourceArtDir, matches[0]),
      join(destinationDir, `${imageNumber}.jpg`),
    );
    linked.add(imageNumber);
    sourceCount++;
  }

  return {
    highResolutionCount,
    sourceCount,
    missingCount: wanted.size - linked.size,
  };
}

function defaultDreamAvatarArtDir() {
  for (const candidate of DREAM_AVATAR_ART_DIR_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return DREAM_AVATAR_ART_DIR_CANDIDATES[0];
}

function readDreamsignAltText(dreamsignArtDir) {
  // Prefer alt text sitting alongside the images; the outlined variant folder
  // shares the `alt_text.txt` catalog kept one level up in `filtered`, so fall
  // back to the parent directory when the file is not local.
  let altTextPath = join(dreamsignArtDir, "alt_text.txt");
  if (!existsSync(altTextPath)) {
    altTextPath = join(dreamsignArtDir, "..", "alt_text.txt");
  }
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

/**
 * Convert a TOML dreamsign-profiles record to its runtime JSON representation,
 * converting kebab-case keys to camelCase.
 */
export function transformDreamsignProfile(profile) {
  const result = {};
  for (const [key, value] of Object.entries(profile)) {
    result[kebabToCamel(key)] = value;
  }
  return result;
}

/**
 * Convert a TOML dreamscape record to its runtime JSON representation. Keys are
 * renamed kebab->camel. The starter dreamscape omits `guide-id`/`affiliation-id`
 * in the TOML; those normalize to `null` so the runtime always sees an explicit
 * value, and `is-starter` defaults to `false` for the non-starter regions. A
 * dreamscape without `dream-avatar-ids` (the starter) normalizes to an empty
 * list so the runtime always sees an array.
 */
export function transformDreamscape(dreamscape) {
  const result = {};
  for (const [key, value] of Object.entries(dreamscape)) {
    result[kebabToCamel(key)] = value;
  }
  if (result.guideId == null) result.guideId = null;
  if (result.affiliationId == null) result.affiliationId = null;
  if (typeof result.isStarter !== "boolean") result.isStarter = false;
  if (!Array.isArray(result.dreamAvatarIds)) result.dreamAvatarIds = [];
  return result;
}

/**
 * Convert a TOML Apollyon incarnation record to its runtime JSON
 * representation, renaming keys kebab->camel (so `deck-type` becomes
 * `deckType`). The `deckType` is design-reference metadata only and is never
 * surfaced in the UI.
 */
export function transformIncarnation(incarnation) {
  const result = {};
  for (const [key, value] of Object.entries(incarnation)) {
    result[kebabToCamel(key)] = value;
  }
  return result;
}

/**
 * Convert a TOML Dream Guide record to its runtime JSON representation, renaming
 * keys kebab->camel.
 */
export function transformGuide(guide) {
  const result = {};
  for (const [key, value] of Object.entries(guide)) {
    result[kebabToCamel(key)] = value;
  }
  return result;
}

/**
 * Convert a TOML affiliation record to its runtime JSON representation, renaming
 * keys kebab->camel. `signature-cards` are authored as stable cards_v2 UUIDs and
 * pass through unchanged; the build validates them against the card database.
 */
export function transformAffiliation(affiliation) {
  const result = {};
  for (const [key, value] of Object.entries(affiliation)) {
    result[kebabToCamel(key)] = value;
  }
  return result;
}

/**
 * Parse `cards.toml` and write both runtime card JSON catalogs — the
 * Special-filtered `card-data.json` the journey/battle runtime fetches, and the
 * unfiltered `cards_v2-data.json` that `cards-v2-database.ts` fetches with the
 * draft-pool metadata merged in. This is the TOML->JSON card transform shared by
 * the full `setupAssets` build and the dev hot-reload plugin
 * (`cardDataHotReloadPlugin` in vite.config.ts): the plugin calls it on every
 * `cards.toml` save so the running browser can refetch fresh card data
 * without a full asset rebuild. It writes only the two card JSON files (and
 * refreshes the build-around name index); image symlinks and the other catalogs
 * are left to `setupAssets`.
 *
 * Returns the transformed `jsonCards` / `jsonCardsV2` arrays and the id<->name
 * `cardMaps`, which `setupAssets` reuses for image symlinking and the remaining
 * catalogs so the transform runs once.
 */
export function regenerateCardData({
  cardTomlPath = join(DATA_DIR, "cards.toml"),
  cardV2TomlPath = join(DATA_DIR, "cards.toml"),
  publicDir = PUBLIC_DIR,
  cardJsonPath = join(publicDir, "card-data.json"),
  cardV2JsonPath = join(publicDir, "cards_v2-data.json"),
  cardRoleJsonPath = join(
    ROOT,
    "src",
    "generated",
    "config",
    "card-role-data.json",
  ),
} = {}) {
  console.log("Parsing cards.toml for the runtime card catalog...");
  const cardTomlContent = readFileSync(cardTomlPath, "utf8");
  const parsedCards = parse(cardTomlContent);
  const allCards = parsedCards.cards;

  if (!Array.isArray(allCards)) {
    throw new Error("Expected [[cards]] array in TOML file");
  }

  console.log(`Found ${allCards.length} total cards`);

  const cardRoleData = compileCardRoleData(allCards);
  mkdirSync(dirname(cardRoleJsonPath), { recursive: true });
  writeFileSync(cardRoleJsonPath, `${JSON.stringify(cardRoleData, null, 2)}\n`);

  // Filter out Special-rarity cards from the runtime pool, except the
  // RON-role card required by Nightmare journey effects.
  const cards = allCards.filter(
    (card) =>
      card.rarity !== "Special" || card.id === cardRoleData.nightmare.cardId,
  );
  console.log(`Filtered to ${cards.length} runtime cards`);

  // Transform to camelCase JSON
  const jsonCards = cards.map(transformCard);

  // Write card-data.json
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(cardJsonPath, JSON.stringify(jsonCards, null, 2) + "\n");
  console.log(`Wrote ${jsonCards.length} cards to card-data.json`);

  // Experimental v2 card pool loaded at run time via `cards-v2-database.ts`. It
  // is transformed with the same kebab->camel rules as the runtime pool and
  // written to its own JSON so it can be fetched with the draft-pool metadata
  // merged in, separate from card-data.json (which the dev drift guard pins to
  // cards.toml). Special-rarity filtering is intentionally skipped here: the
  // pool draws on the whole catalog.
  console.log("Parsing cards.toml...");
  const cardV2TomlContent = readFileSync(cardV2TomlPath, "utf8");
  const parsedCardsV2 = parse(cardV2TomlContent);
  const allCardsV2 = parsedCardsV2.cards;

  if (!Array.isArray(allCardsV2)) {
    throw new Error("Expected [[cards]] array in cards.toml");
  }

  // id<->name maps for resolving UUID-keyed signatures and decklist corpora
  // back to the current display names.
  const cardMaps = buildCardMaps(allCardsV2);
  const jsonCardsV2 = allCardsV2.map(transformCard);
  writeFileSync(cardV2JsonPath, JSON.stringify(jsonCardsV2, null, 2) + "\n");
  console.log(`Wrote ${jsonCardsV2.length} cards to cards_v2-data.json`);

  return { jsonCards, jsonCardsV2, cardMaps };
}

function setupCatalogFixture({
  cardTomlPath,
  dreamAvatarV2TomlPath,
  dreamsignTomlPath,
  publicDir,
  imageCacheDir,
  dreamAvatarArtDir,
  dreamsignArtDir,
  mainMenuBackgroundArtPath,
  tutorialDialogueFrameArtPath,
}) {
  const parsedCards = parse(readFileSync(cardTomlPath, "utf8"));
  const jsonCards = (parsedCards.cards ?? []).map(transformCard);
  const parsedDreamAvatars = parse(readFileSync(dreamAvatarV2TomlPath, "utf8"));
  const jsonDreamAvatars = (parsedDreamAvatars.dreamAvatar ?? []).map(
    transformDreamAvatar,
  );
  const parsedDreamsigns = parse(readFileSync(dreamsignTomlPath, "utf8"));
  const altTextByImageName = readDreamsignAltText(dreamsignArtDir);
  const jsonDreamsigns = (parsedDreamsigns.dreamsign ?? []).map((dreamsign) =>
    transformDreamsign(dreamsign, altTextByImageName),
  );

  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    join(publicDir, "card-data.json"),
    `${JSON.stringify(jsonCards, null, 2)}\n`,
  );
  writeFileSync(
    join(publicDir, "dream-avatars-v2-data.json"),
    `${JSON.stringify(jsonDreamAvatars, null, 2)}\n`,
  );
  writeFileSync(
    join(publicDir, "dreamsign-data.json"),
    `${JSON.stringify(jsonDreamsigns, null, 2)}\n`,
  );

  const linkCatalogArt = (sourcePath, destinationPath) => {
    if (!existsSync(sourcePath)) return;
    mkdirSync(dirname(destinationPath), { recursive: true });
    symlinkSync(sourcePath, destinationPath);
  };
  for (const card of jsonCards) {
    if (card.imageNumber === null || card.imageNumber === undefined) continue;
    linkCatalogArt(
      join(imageCacheDir, imageHash(card.imageNumber)),
      join(publicDir, "cards", `${card.imageNumber}.webp`),
    );
  }
  for (const dreamAvatar of jsonDreamAvatars) {
    if (typeof dreamAvatar.imageNumber !== "string") continue;
    linkCatalogArt(
      join(dreamAvatarArtDir, `${dreamAvatar.imageNumber}.png`),
      join(publicDir, "dream-avatars", `${dreamAvatar.imageNumber}.png`),
    );
  }
  for (const dreamsign of jsonDreamsigns) {
    linkCatalogArt(
      join(dreamsignArtDir, dreamsign.imageName),
      join(publicDir, "dreamsigns", dreamsign.imageName),
    );
  }
  linkCatalogArt(
    mainMenuBackgroundArtPath,
    join(publicDir, "main-menu", "background.jpg"),
  );
  linkCatalogArt(
    tutorialDialogueFrameArtPath,
    join(publicDir, "atlas", "Round_frame.png"),
  );
}

export function setupAssets({
  cardTomlPath = join(DATA_DIR, "cards.toml"),
  cardV2TomlPath = join(DATA_DIR, "cards.toml"),
  dreamAvatarV2TomlPath = join(DATA_DIR, "dream_avatars.toml"),
  dreamwellTomlPath = join(DATA_DIR, "dreamwell.toml"),
  dreamsignTomlPath = join(DATA_DIR, "dreamsigns.toml"),
  dreamsignProfilesTomlPath = join(DATA_DIR, "dreamsign_profiles.toml"),
  dreamsignSignaturesTomlPath = join(DATA_DIR, "dreamsign_signatures.toml"),
  dreamscapesTomlPath = join(DATA_DIR, "dreamscapes.toml"),
  dreamGuidesTomlPath = join(DATA_DIR, "dream_guides.toml"),
  sitesTomlPath = join(DATA_DIR, "sites.toml"),
  explorationTomlPath = join(DATA_DIR, "exploration.toml"),
  rewardSelectionTomlPath = join(DATA_DIR, "reward_selection.toml"),
  auguryTomlPath = join(DATA_DIR, "augury.toml"),
  affiliationsTomlPath = join(DATA_DIR, "affiliations.toml"),
  atlasTomlPath = join(DATA_DIR, "atlas.toml"),
  economyTomlPath = join(DATA_DIR, "economy.toml"),
  draftTomlPath = join(DATA_DIR, "draft.toml"),
  opponentsTomlPath = join(DATA_DIR, "opponents.toml"),
  glossaryTomlPath = join(DATA_DIR, "glossary.toml"),
  gambleTomlPath = join(DATA_DIR, "gamble.toml"),
  transfigurationTomlPath = join(DATA_DIR, "transfiguration.toml"),
  resonanceTomlPath = join(DATA_DIR, "resonance.toml"),
  apollyonIncarnationsTomlPath = join(DATA_DIR, "apollyon_incarnations.toml"),
  figmentTomlPath = join(DATA_DIR, "figments.toml"),
  tutorialTomlPath = join(DATA_DIR, "tutorial.toml"),
  merchantCorpusJsonPath = join(DATA_DIR, "merchant_corpus.json"),
  publicDir = PUBLIC_DIR,
  generatedConfigDir = join(ROOT, "src", "generated", "config"),
  imageCacheDir = IMAGE_CACHE_DIR,
  dreamAvatarArtDir = defaultDreamAvatarArtDir(),
  dreamsignArtDir = DREAMSIGN_ART_DIR,
  journeyArtDir = JOURNEY_ART_DIR,
  mainMenuBackgroundArtPath = MAIN_MENU_BACKGROUND_ART_PATH,
  explorationHighResArtDir = EXPLORATION_HIGH_RES_ART_DIR,
  explorationSourceArtDir = EXPLORATION_SOURCE_ART_DIR,
  cardFrameArtDir = CARD_FRAME_ART_DIR,
  dreamscapeSceneArtDir = DREAMSCAPE_SCENE_ART_DIR,
  dreamscapeIconArtDir = DREAMSCAPE_ICON_ART_DIR,
  dreamGuideArtDir = DREAM_GUIDE_ART_DIR,
  tutorialDialogueFrameArtPath = TUTORIAL_DIALOGUE_FRAME_ART_PATH,
  catalogFixtureOnly = false,
} = {}) {
  if (catalogFixtureOnly) {
    setupCatalogFixture({
      cardTomlPath,
      dreamAvatarV2TomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      dreamAvatarArtDir,
      dreamsignArtDir,
      mainMenuBackgroundArtPath,
      tutorialDialogueFrameArtPath,
    });
    return;
  }
  const cardsDir = join(publicDir, "cards");
  const cardFrameDir = join(publicDir, "card-frame");
  const dreamAvatarsDir = join(publicDir, "dream-avatars");
  const dreamsignsDir = join(publicDir, "dreamsigns");
  const journeysDir = join(publicDir, "journeys");
  const mainMenuDir = join(publicDir, "main-menu");
  const explorationDir = join(publicDir, "exploration");
  const dreamscapesArtDir = join(publicDir, "dreamscapes");
  const dreamscapeIconsDir = join(publicDir, "dreamscape-icons");
  const dreamGuidesDir = join(publicDir, "dream-guides");
  const atlasArtDir = join(publicDir, "atlas");
  const cardJsonPath = join(publicDir, "card-data.json");
  const cardV2JsonPath = join(publicDir, "cards_v2-data.json");
  const decklistIdsJsonPath = join(publicDir, "decklist-ids-data.json");
  const draftRecordsAdaptedDir = join(ROOT, "docs", "draft_records_adapted");
  const draftRecordsJsonPath = join(publicDir, "draft-records-data.json");
  const dreamAvatarV2JsonPath = join(publicDir, "dream-avatars-v2-data.json");
  const dreamwellJsonPath = join(publicDir, "dreamwell-data.json");
  const dreamsignJsonPath = join(publicDir, "dreamsign-data.json");
  const dreamsignProfilesJsonPath = join(
    publicDir,
    "dreamsign-profiles-data.json",
  );
  const dreamsignSignaturesJsonPath = join(
    publicDir,
    "dreamsign-signatures-data.json",
  );
  const dreamscapesJsonPath = join(publicDir, "dreamscapes-data.json");
  const dreamGuidesJsonPath = join(publicDir, "dream-guides-data.json");
  const sitesJsonPath = join(publicDir, "sites-data.json");
  const explorationJsonPath = join(publicDir, "exploration-data.json");
  const rewardSelectionJsonPath = join(publicDir, "reward-selection-data.json");
  const auguryJsonPath = join(publicDir, "augury-data.json");
  const generatedRewardSelectionJsonPath = join(
    generatedConfigDir,
    "reward-selection-data.json",
  );
  const generatedAuguryJsonPath = join(generatedConfigDir, "augury-data.json");
  const generatedDraftJsonPath = join(generatedConfigDir, "draft-data.json");
  const affiliationsJsonPath = join(publicDir, "affiliations-data.json");
  const atlasJsonPath = join(publicDir, "atlas-data.json");
  const economyJsonPath = join(publicDir, "economy-data.json");
  const gambleJsonPath = join(publicDir, "gamble-data.json");
  const transfigurationJsonPath = join(publicDir, "transfiguration-data.json");
  const resonanceJsonPath = join(publicDir, "resonance-data.json");
  const generatedGambleJsonPath = join(generatedConfigDir, "gamble-data.json");
  const generatedTransfigurationJsonPath = join(
    generatedConfigDir,
    "transfiguration-data.json",
  );
  const generatedResonanceJsonPath = join(
    generatedConfigDir,
    "resonance-data.json",
  );
  const draftJsonPath = join(publicDir, "draft-data.json");
  const opponentsJsonPath = join(publicDir, "opponents-data.json");
  const apollyonIncarnationsJsonPath = join(
    publicDir,
    "apollyon-incarnations-data.json",
  );
  const figmentJsonPath = join(publicDir, "figments-data.json");
  const tutorialJsonPath = join(publicDir, "tutorial-data.json");
  const merchantCorpusPublicPath = join(publicDir, "merchant-corpus-data.json");
  const journeyExtensionJsonPath = join(journeysDir, "imageId-extension.json");

  const { jsonCards, jsonCardsV2, cardMaps } = regenerateCardData({
    cardTomlPath,
    cardV2TomlPath,
    cardJsonPath,
    cardV2JsonPath,
    publicDir,
  });

  const tutorialConfiguration = readTutorialConfiguration({
    rootDir: ROOT,
    tutorialTomlPath,
  });
  const tutorialDreamAvatars = parse(
    readFileSync(dreamAvatarV2TomlPath, "utf8"),
  ).dreamAvatar;
  const tutorialDreamwellCards = parse(
    readFileSync(dreamwellTomlPath, "utf8"),
  ).dreamwell;
  if (!Array.isArray(tutorialDreamAvatars)) {
    throw new Error("Expected [[dreamAvatar]] array in dream_avatars.toml");
  }
  if (!Array.isArray(tutorialDreamwellCards)) {
    throw new Error("Expected [[dreamwell]] array in dreamwell.toml");
  }
  validateTutorialCatalogReferences(tutorialConfiguration, {
    cardIds: jsonCards.map((card) => card.id),
    dreamAvatarIds: tutorialDreamAvatars.map((avatar) => avatar.id),
    dreamwellCardIds: tutorialDreamwellCards.map((card) => card.id),
  });
  writeFileSync(
    tutorialJsonPath,
    `${JSON.stringify(tutorialConfiguration, null, 2)}\n`,
  );
  console.log(
    `Wrote ${tutorialConfiguration.actions.length} tutorial actions and ${tutorialConfiguration.triggers.length} triggers to tutorial-data.json`,
  );

  // Stable-UUID decklists back affiliation scoring. Each non-empty mainboard in
  // the adapted draft records contributes one deck.
  const decklistIds = readAdaptedRecordDecklistIds(
    draftRecordsAdaptedDir,
    cardMaps,
  );
  writeFileSync(decklistIdsJsonPath, JSON.stringify(decklistIds) + "\n");
  console.log(
    `Wrote ${decklistIds.length} id-keyed decklists to decklist-ids-data.json`,
  );

  // Adapted draft records bundled for corpus-backed scoring. Each JSON file
  // in `docs/draft_records_adapted` is
  // one draft event; we extract one entry per seat (trimmed to the first 10 picks
  // per pack) and write the flat array to the browser bundle.
  console.log("Bundling adapted draft records from the corpus...");
  const draftRecords = buildDraftRecords(draftRecordsAdaptedDir, cardMaps);
  writeFileSync(draftRecordsJsonPath, JSON.stringify(draftRecords) + "\n");
  console.log(
    `Wrote ${draftRecords.length} draft-record seats to draft-records-data.json`,
  );

  console.log("Bundling known-good decklists corpus...");
  const knownGoodDecklists = buildKnownGoodDecklists(
    join(ROOT, "docs", "known_good_decklists.json"),
    draftRecordsAdaptedDir,
    cardMaps,
  );
  writeFileSync(
    join(publicDir, "known-good-decklists-data.json"),
    JSON.stringify(knownGoodDecklists) + "\n",
  );
  console.log(
    `Wrote ${knownGoodDecklists.length} known-good decklists to known-good-decklists-data.json`,
  );

  // The compiled projection of the manually curated tide decks and per-avatar
  // pool composition consumed by the tides4 pool variant.
  const tidesSourcePath = join(DATA_DIR, "tides.toml");
  const tidePoolsSourcePath = join(DATA_DIR, "dream_avatar_tide_pools.toml");
  const tides4JsonPath = join(publicDir, "tides4-data.json");
  if (existsSync(tidesSourcePath) && existsSync(tidePoolsSourcePath)) {
    const served = compileTidesData(
      parse(readFileSync(tidesSourcePath, "utf8")),
      parse(readFileSync(tidePoolsSourcePath, "utf8")),
    );
    writeFileSync(tides4JsonPath, `${JSON.stringify(served)}\n`);
    console.log("Compiled tide catalogs to tides4-data.json");
  } else {
    console.log(
      "No compiled tides or Dream Avatar tide pools found; run `npm run game-data:compile`.",
    );
  }

  // The v2 DreamAvatar identities (`dream_avatars.toml`) drive the standalone
  // draft test harness. They carry a kebab->camel normalization and a
  // `signature-cards` list used by tides4 baking and display surfaces.
  console.log("Parsing dream_avatars.toml...");
  const dreamAvatarV2TomlContent = readFileSync(dreamAvatarV2TomlPath, "utf8");
  const parsedDreamAvatarsV2 = parse(dreamAvatarV2TomlContent);
  const allDreamAvatarsV2 = parsedDreamAvatarsV2.dreamAvatar;

  if (!Array.isArray(allDreamAvatarsV2)) {
    throw new Error("Expected [[dreamAvatar]] array in dream_avatars.toml");
  }

  // Signatures are authored as stable card UUIDs. Resolve them to current card
  // names for display and fail the build for a dangling reference. The UUIDs are
  // emitted as `signatureCardIds` (index-aligned with `signatureCards`) so
  // consumers that must distinguish two cards sharing a name can key on the id.
  const jsonDreamAvatarsV2 = allDreamAvatarsV2.map((dreamAvatar) => {
    const transformed = transformDreamAvatar(dreamAvatar);
    if (Array.isArray(transformed.signatureCards)) {
      const resolved = transformed.signatureCards.map((ref) =>
        resolveToken(ref, cardMaps),
      );
      transformed.signatureCards = resolved.map((r) => r.name);
      transformed.signatureCardIds = resolved.map((r) => r.id);
    }
    return transformed;
  });
  writeFileSync(
    dreamAvatarV2JsonPath,
    JSON.stringify(jsonDreamAvatarsV2, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonDreamAvatarsV2.length} dreamAvatars to dream-avatars-v2-data.json`,
  );

  // Dreamwell cards: the shared deck both players draw from one per turn during
  // the Dreamwell phase (docs/battle_rules/battle_rules.md). Parsed with the
  // same kebab->camel rename as the other catalogs and written to its own JSON
  // the runtime fetches at /dreamwell-data.json.
  console.log("Parsing dreamwell.toml...");
  const dreamwellTomlContent = readFileSync(dreamwellTomlPath, "utf8");
  const parsedDreamwell = parse(dreamwellTomlContent);
  const allDreamwell = parsedDreamwell.dreamwell;

  if (!Array.isArray(allDreamwell)) {
    throw new Error("Expected [[dreamwell]] array in dreamwell.toml");
  }

  const jsonDreamwell = allDreamwell.map(transformDreamwell);
  writeFileSync(
    dreamwellJsonPath,
    JSON.stringify(jsonDreamwell, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonDreamwell.length} dreamwell cards to dreamwell-data.json`,
  );
  // Dreamwell card art is symlinked into `public/cards` alongside the other
  // catalogs further below, after `recreateDir(cardsDir)` has created the
  // directory.

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

  console.log("Parsing exploration.toml...");
  const explorationSource = parse(readFileSync(explorationTomlPath, "utf8"));
  const explorationData = transformExplorationData(explorationSource);
  const explorationCardById = new Map(
    [...jsonCardsV2, ...explorationData.customCards].map((card) => [
      String(card.id).toLowerCase(),
      card,
    ]),
  );
  const explorationImageNumbers = explorationData.encounters.map(
    (encounter) =>
      explorationCardById.get(encounter.cardId.toLowerCase())?.imageNumber,
  );
  if (
    explorationImageNumbers.some(
      (imageNumber) => typeof imageNumber !== "number",
    )
  ) {
    throw new Error(
      "exploration.toml: every encounter card requires an image-number",
    );
  }
  const knownCardIds = new Set(
    [...jsonCardsV2, ...explorationData.customCards].map((card) =>
      String(card.id).toLowerCase(),
    ),
  );
  const knownDreamsignIds = new Set(
    [...jsonDreamsigns, ...explorationData.customDreamsigns].map((dreamsign) =>
      String(dreamsign.id).toLowerCase(),
    ),
  );
  for (const encounter of explorationData.encounters) {
    if (!knownCardIds.has(encounter.cardId.toLowerCase())) {
      throw new Error(
        `exploration.toml: encounter references unknown card UUID ${encounter.cardId}`,
      );
    }
    for (const action of encounter.action) {
      for (const field of ["cardId"]) {
        if (
          typeof action[field] === "string" &&
          !knownCardIds.has(action[field].toLowerCase())
        ) {
          throw new Error(
            `exploration.toml: action ${action.id} references unknown card UUID ${action[field]}`,
          );
        }
      }
      if (
        typeof action.dreamsignId === "string" &&
        !knownDreamsignIds.has(action.dreamsignId.toLowerCase())
      ) {
        throw new Error(
          `exploration.toml: action ${action.id} references unknown Dreamsign UUID ${action.dreamsignId}`,
        );
      }
    }
  }
  writeFileSync(
    explorationJsonPath,
    JSON.stringify(explorationData, null, 2) + "\n",
  );
  console.log(
    `Wrote ${explorationData.encounters.length} Exploration encounters to exploration-data.json`,
  );

  // Dreamsign profiles: parse the curated TOML and write the kebab->camel JSON
  // the runtime loader fetches.
  console.log("Parsing dreamsign_profiles.toml...");
  const dreamsignProfilesTomlContent = readFileSync(
    dreamsignProfilesTomlPath,
    "utf8",
  );
  const parsedDreamsignProfiles = parse(dreamsignProfilesTomlContent);
  const allDreamsignProfiles = parsedDreamsignProfiles.dreamsigns;

  if (!Array.isArray(allDreamsignProfiles)) {
    throw new Error("Expected [[dreamsigns]] array in dreamsign_profiles.toml");
  }

  const jsonDreamsignProfiles = allDreamsignProfiles.map(
    transformDreamsignProfile,
  );
  writeFileSync(
    dreamsignProfilesJsonPath,
    JSON.stringify(jsonDreamsignProfiles, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonDreamsignProfiles.length} dreamsign profiles to dreamsign-profiles-data.json`,
  );

  // Dreamsign signatures: the neutral/tailored classification artifact. Each
  // dreamsign is either neutral (works in any deck) or tailored (has a curated
  // set of signature card ids). Validate all signature-card-ids against the card
  // database so a dangling UUID fails the build loudly.
  console.log("Parsing dreamsign_signatures.toml...");
  const dreamsignSignaturesTomlContent = readFileSync(
    dreamsignSignaturesTomlPath,
    "utf8",
  );
  const parsedDreamsignSignatures = parse(dreamsignSignaturesTomlContent);
  const allDreamsignSignatures = parsedDreamsignSignatures.dreamsigns;

  if (!Array.isArray(allDreamsignSignatures)) {
    throw new Error(
      "Expected [[dreamsigns]] array in dreamsign_signatures.toml",
    );
  }

  const jsonDreamsignSignatures = allDreamsignSignatures.map(
    transformDreamsignProfile,
  );
  for (const entry of jsonDreamsignSignatures) {
    validateCardIds(
      entry.signatureCardIds ?? [],
      cardMaps.idToName,
      `dreamsign_signatures.toml (${entry.id})`,
    );
  }
  writeFileSync(
    dreamsignSignaturesJsonPath,
    JSON.stringify(jsonDreamsignSignatures, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonDreamsignSignatures.length} dreamsign signatures to dreamsign-signatures-data.json`,
  );

  console.log("Parsing dream_guides.toml...");
  const parsedDreamGuides = parse(readFileSync(dreamGuidesTomlPath, "utf8"));
  const parsedDreamscapes = parse(readFileSync(dreamscapesTomlPath, "utf8"));
  const allDreamscapes = parsedDreamscapes.dreamscapes;
  if (!Array.isArray(allDreamscapes)) {
    throw new Error("Expected [[dreamscapes]] array in dreamscapes.toml");
  }
  const jsonDreamGuides = compileDreamGuidesData(parsedDreamGuides, {
    dreamscapes: allDreamscapes,
    portraitSources: collectGuidePortraitSources(dreamGuideArtDir),
  });
  writeFileSync(
    dreamGuidesJsonPath,
    JSON.stringify(jsonDreamGuides, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonDreamGuides.guides.length} dream guides to dream-guides-data.json`,
  );

  // Dreamscapes derive their resident guide and signature site from the
  // canonical guide catalog before the runtime JSON is emitted.
  console.log("Parsing dreamscapes.toml...");
  const jsonDreamscapes = deriveDreamscapesData(
    allDreamscapes,
    jsonDreamGuides,
  );
  // Enforce the resident-DreamAvatar invariant: non-starter dreamscapes
  // partition dream_avatars.toml into 3-4 per region with no DreamAvatar in
  // two regions. `jsonDreamAvatarsV2` was parsed above, so its ids are the
  // authoritative set checked against.
  const dreamAvatarCounts = validateDreamAvatarMapping(
    jsonDreamscapes,
    jsonDreamAvatarsV2.map((dreamAvatar) => dreamAvatar.id),
  );
  for (const scape of jsonDreamscapes) {
    if (scape.isStarter) continue;
    console.log(
      `  ${scape.id}: ${String(dreamAvatarCounts[scape.id])} dreamAvatars` +
        ` -> ${scape.dreamAvatarIds.join(", ")}`,
    );
  }
  writeFileSync(
    dreamscapesJsonPath,
    JSON.stringify(jsonDreamscapes, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonDreamscapes.length} dreamscapes to dreamscapes-data.json`,
  );

  // Affiliations: the thematic factions backing each dreamscape. Signature
  // cards are authored as stable cards_v2 UUIDs; validate them against the card
  // database up front so a dangling UUID fails the build loudly.
  console.log("Parsing affiliations.toml...");
  const affiliationsTomlContent = readFileSync(affiliationsTomlPath, "utf8");
  const parsedAffiliations = parse(affiliationsTomlContent);
  const allAffiliations = parsedAffiliations.affiliations;

  if (!Array.isArray(allAffiliations)) {
    throw new Error("Expected [[affiliations]] array in affiliations.toml");
  }

  const jsonAffiliations = allAffiliations.map(transformAffiliation);
  for (const affiliation of jsonAffiliations) {
    validateCardIds(
      affiliation.signatureCards ?? [],
      cardMaps.idToName,
      `affiliations.toml (${affiliation.id})`,
    );
  }
  writeFileSync(
    affiliationsJsonPath,
    JSON.stringify(jsonAffiliations, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonAffiliations.length} affiliations to affiliations-data.json`,
  );

  // Dream Atlas rules, content, and presentation data. Compile the TOML through
  // the same strict normalizer used by targeted dev hot reload.
  console.log("Parsing atlas.toml...");
  const atlasTomlContent = readFileSync(atlasTomlPath, "utf8");
  const parsedAtlas = parse(atlasTomlContent);
  const parsedGlossary = parse(readFileSync(glossaryTomlPath, "utf8"));
  const atlasAssetSources = collectAtlasAssetSources({
    bossSceneDir: dreamscapeSceneArtDir,
    bossIconDir: dreamscapeIconArtDir,
    bossFigureDir: dreamGuideArtDir,
  });
  const jsonAtlasData = compileAtlasData(parsedAtlas, {
    dreamscapes: jsonDreamscapes,
    affiliations: allAffiliations,
    ...(atlasAssetSources === undefined
      ? {}
      : { assetSources: atlasAssetSources }),
  });
  writeFileSync(atlasJsonPath, JSON.stringify(jsonAtlasData, null, 2) + "\n");
  console.log("Wrote Atlas data to atlas-data.json");

  console.log("Parsing economy.toml...");
  const jsonEconomyData = compileEconomyData(
    parse(readFileSync(economyTomlPath, "utf8")),
  );
  writeFileSync(
    economyJsonPath,
    JSON.stringify(jsonEconomyData, null, 2) + "\n",
  );
  console.log("Wrote Economy data to economy-data.json");

  const generatedCatalogs = [
    [
      "Gamble",
      gambleTomlPath,
      gambleJsonPath,
      generatedGambleJsonPath,
      compileGambleData,
    ],
    [
      "Transfiguration",
      transfigurationTomlPath,
      transfigurationJsonPath,
      generatedTransfigurationJsonPath,
      compileTransfigurationData,
    ],
    [
      "Resonance",
      resonanceTomlPath,
      resonanceJsonPath,
      generatedResonanceJsonPath,
      compileResonanceData,
    ],
  ];
  mkdirSync(generatedConfigDir, { recursive: true });
  for (const [
    label,
    tomlPath,
    publicPath,
    generatedPath,
    compileCatalog,
  ] of generatedCatalogs) {
    console.log(`Parsing ${tomlPath.slice(tomlPath.lastIndexOf("/") + 1)}...`);
    const serialized = `${JSON.stringify(compileCatalog(parse(readFileSync(tomlPath, "utf8"))), null, 2)}\n`;
    writeFileSync(publicPath, serialized);
    writeFileSync(generatedPath, serialized);
    console.log(`Wrote ${label} data`);
  }

  console.log("Parsing sites.toml...");
  const jsonSitesData = compileSitesData(
    parse(readFileSync(sitesTomlPath, "utf8")),
    {
      guides: jsonDreamGuides,
      dreamscapes: jsonDreamscapes,
      glossaryIds: Array.isArray(parsedGlossary.entries)
        ? parsedGlossary.entries.map((entry) => entry.id)
        : [],
      economy: jsonEconomyData,
    },
  );
  writeFileSync(sitesJsonPath, JSON.stringify(jsonSitesData, null, 2) + "\n");
  console.log("Wrote Sites data to sites-data.json");

  console.log("Parsing draft.toml...");
  const jsonDraftData = compileDraftData(
    parse(readFileSync(draftTomlPath, "utf8")),
  );
  const serializedDraftData = JSON.stringify(jsonDraftData, null, 2) + "\n";
  mkdirSync(generatedConfigDir, { recursive: true });
  writeFileSync(draftJsonPath, serializedDraftData);
  writeFileSync(generatedDraftJsonPath, serializedDraftData);
  console.log("Wrote Draft data to draft-data.json");

  console.log("Parsing reward_selection.toml...");
  const jsonRewardSelectionData = compileRewardSelectionData(
    parse(readFileSync(rewardSelectionTomlPath, "utf8")),
  );
  const serializedRewardSelectionData =
    JSON.stringify(jsonRewardSelectionData, null, 2) + "\n";
  mkdirSync(generatedConfigDir, { recursive: true });
  writeFileSync(rewardSelectionJsonPath, serializedRewardSelectionData);
  writeFileSync(
    generatedRewardSelectionJsonPath,
    serializedRewardSelectionData,
  );
  console.log("Wrote reward selection data to reward-selection-data.json");

  console.log("Parsing augury.toml...");
  const jsonAuguryData = compileAuguryData(
    parse(readFileSync(auguryTomlPath, "utf8")),
  );
  const serializedAuguryData = JSON.stringify(jsonAuguryData, null, 2) + "\n";
  writeFileSync(auguryJsonPath, serializedAuguryData);
  writeFileSync(generatedAuguryJsonPath, serializedAuguryData);
  console.log("Wrote Augury data to augury-data.json");

  console.log("Parsing opponents.toml...");
  generateOpponentsData({
    opponentsTomlPath,
    opponentsJsonPath,
    cardIds: cardMaps.idToName.keys(),
  });
  console.log("Wrote Opponent data to opponents-data.json");

  // Apollyon incarnations: the final DreamAvatar's ten guises. Parse the TOML
  // and write the kebab->camel JSON the runtime loader fetches at
  // /apollyon-incarnations-data.json; Atlas generation picks one to present the
  // boss node.
  console.log("Parsing apollyon_incarnations.toml...");
  const apollyonIncarnationsTomlContent = readFileSync(
    apollyonIncarnationsTomlPath,
    "utf8",
  );
  const parsedIncarnations = parse(apollyonIncarnationsTomlContent);
  const allIncarnations = parsedIncarnations.incarnations;

  if (!Array.isArray(allIncarnations)) {
    throw new Error(
      "Expected [[incarnations]] array in apollyon_incarnations.toml",
    );
  }

  const jsonIncarnations = allIncarnations.map(transformIncarnation);
  writeFileSync(
    apollyonIncarnationsJsonPath,
    JSON.stringify(jsonIncarnations, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonIncarnations.length} Apollyon incarnations to apollyon-incarnations-data.json`,
  );

  // Figments: parse the figment catalog TOML and write the kebab->camel JSON
  // the battle UI fetches to source each figment type's name, character type,
  // spark, rules text, and art (rules §Figments).
  console.log("Parsing figments.toml...");
  const figmentTomlContent = readFileSync(figmentTomlPath, "utf8");
  const parsedFigments = parse(figmentTomlContent);
  const allFigments = parsedFigments.figments;

  if (!Array.isArray(allFigments)) {
    throw new Error("Expected [[figments]] array in figments.toml");
  }

  const jsonFigments = allFigments.map(transformFigment);
  writeFileSync(figmentJsonPath, JSON.stringify(jsonFigments, null, 2) + "\n");
  console.log(`Wrote ${jsonFigments.length} figments to figments-data.json`);

  // Merchant corpus: copy the baked artifact as-is to the public directory so
  // the runtime loader can fetch it as /merchant-corpus-data.json.  If the
  // file has not been baked yet (`npm run bake-merchant-corpus`), warn and
  // continue — the merchant will fall back to an empty corpus at runtime.
  if (existsSync(merchantCorpusJsonPath)) {
    const corpusJson = readFileSync(merchantCorpusJsonPath, "utf8");
    writeFileSync(merchantCorpusPublicPath, corpusJson);
    console.log("Copied merchant_corpus.json to merchant-corpus-data.json");
  } else {
    console.warn(
      "  Warning: no data/merchant_corpus.json found; the dream merchant will " +
        "have no corpus signals until `npm run bake-merchant-corpus` is run.",
    );
  }

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

  console.log(
    `Linked ${linked} of ${jsonCards.length} card images (${missing} missing)`,
  );

  // Link figment art into the same cards directory, keyed by image number. A
  // figment with no assigned art keeps image-number 0 and is skipped; the battle
  // UI falls back to a generated gradient for those.
  for (const figment of jsonFigments) {
    const imageNumber = figment.imageNumber;
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
      continue;
    }
    if (existsSync(cachePath)) {
      symlinkSync(cachePath, symlinkPath);
    }
  }

  // Link art for the experimental v2 pool into the same cards directory, keyed
  // by image number. Many v2 image numbers are absent from the local cache, in
  // which case the card view falls back to a generated identicon, so
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

  // Symbolic offer-tile art is authored in Augury presentation data. Keep the
  // referenced images in the generated card-art directory so local review and
  // production uploads resolve the same assets.
  let linkedOfferTileBackgrounds = 0;
  let missingOfferTileBackgrounds = 0;
  const offerTileBackgroundImageNumbers = jsonAuguryData.archetypes.flatMap(
    (archetype) =>
      archetype.presentation.backgroundArt === undefined
        ? []
        : [archetype.presentation.backgroundArt.imageNumber],
  );
  for (const imageNumber of offerTileBackgroundImageNumbers) {
    const hash = imageHash(imageNumber);
    const cachePath = join(imageCacheDir, hash);
    const symlinkPath = join(cardsDir, `${imageNumber}.webp`);

    if (existsSync(symlinkPath)) {
      linkedOfferTileBackgrounds++;
      continue;
    }
    if (existsSync(cachePath)) {
      symlinkSync(cachePath, symlinkPath);
      linkedOfferTileBackgrounds++;
    } else {
      console.warn(
        `  Warning: missing cache file for offer tile background ${imageNumber}: ${hash}`,
      );
      missingOfferTileBackgrounds++;
    }
  }
  console.log(
    `Linked ${linkedOfferTileBackgrounds} offer tile backgrounds (${missingOfferTileBackgrounds} missing)`,
  );

  // Dreamwell card art, keyed by image number exactly like the card catalogs
  // above and linked into the same `public/cards` directory. A Dreamwell card
  // without an image number (or whose cache file is absent) falls back to a
  // generated identicon at runtime, so misses are counted quietly.
  let linkedDreamwell = 0;
  let missingDreamwell = 0;
  for (const card of jsonDreamwell) {
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
      linkedDreamwell++;
      continue;
    }
    if (existsSync(cachePath)) {
      symlinkSync(cachePath, symlinkPath);
      linkedDreamwell++;
    } else {
      missingDreamwell++;
    }
  }
  console.log(
    `Linked ${linkedDreamwell} of ${jsonDreamwell.length} dreamwell images (${missingDreamwell} missing)`,
  );

  recreateDir(dreamAvatarsDir);
  let linkedDreamAvatarArt = 0;
  let missingDreamAvatarArt = 0;

  // Link portraits for the v2 draft-test DreamAvatars, keyed by image number so
  // a portrait shared between several DreamAvatars is linked once.
  const dreamAvatarArtByImageNumber = new Map();
  for (const dreamAvatar of jsonDreamAvatarsV2) {
    if (!dreamAvatarArtByImageNumber.has(dreamAvatar.imageNumber)) {
      dreamAvatarArtByImageNumber.set(
        dreamAvatar.imageNumber,
        dreamAvatar.name,
      );
    }
  }

  for (const [imageNumber, name] of dreamAvatarArtByImageNumber) {
    const filename = `${imageNumber}.png`;
    const sourcePath = join(dreamAvatarArtDir, filename);
    const symlinkPath = join(dreamAvatarsDir, filename);

    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, symlinkPath);
      linkedDreamAvatarArt++;
    } else {
      console.warn(
        `  Warning: missing dreamAvatar art for ${name} (${imageNumber})`,
      );
      missingDreamAvatarArt++;
    }
  }

  console.log(
    `Linked ${linkedDreamAvatarArt} of ${dreamAvatarArtByImageNumber.size} dreamAvatar portraits (${missingDreamAvatarArt} missing)`,
  );

  // Link the transparent full-body cutouts (`cutout/<imageNumber>.png` in the
  // art source dir) to `public/dream-avatars/cutout/`. These are the character
  // renders with the scene background removed, used wherever the DreamAvatar
  // stands directly on UI chrome (DreamAvatar selection, portraits). Same
  // warn-and-continue policy as the scene portraits above.
  const dreamAvatarCutoutSourceDir = join(dreamAvatarArtDir, "cutout");
  const dreamAvatarCutoutsDir = join(dreamAvatarsDir, "cutout");
  mkdirSync(dreamAvatarCutoutsDir, { recursive: true });
  let linkedDreamAvatarCutouts = 0;
  let missingDreamAvatarCutouts = 0;
  for (const [imageNumber, name] of dreamAvatarArtByImageNumber) {
    const filename = `${imageNumber}.png`;
    const sourcePath = join(dreamAvatarCutoutSourceDir, filename);
    const symlinkPath = join(dreamAvatarCutoutsDir, filename);

    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, symlinkPath);
      linkedDreamAvatarCutouts++;
    } else {
      console.warn(
        `  Warning: missing dreamAvatar cutout for ${name} (${imageNumber})`,
      );
      missingDreamAvatarCutouts++;
    }
  }
  console.log(
    `Linked ${linkedDreamAvatarCutouts} of ${dreamAvatarArtByImageNumber.size} dreamAvatar cutouts (${missingDreamAvatarCutouts} missing)`,
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
    // 404. Mirrors the existing dream-avatar/dreamsign warn-and-continue
    // behaviour. Write an empty extension map so the runtime fetch succeeds.
    writeFileSync(journeyExtensionJsonPath, "{}\n");
    console.warn(
      `  Warning: journey art directory not found at ${journeyArtDir} — image URLs will 404`,
    );
  }

  // The licensed main-menu background is stored with the other local art and
  // linked into the ignored public asset tree for local serving and upload.
  recreateDir(mainMenuDir);
  if (existsSync(mainMenuBackgroundArtPath)) {
    symlinkSync(mainMenuBackgroundArtPath, join(mainMenuDir, "background.jpg"));
    console.log("Linked main-menu background image");
  } else {
    console.warn(
      `  Warning: missing main-menu background at ${mainMenuBackgroundArtPath}`,
    );
  }

  // Exploration expands source-card art to the viewport. Prefer the curated
  // full-resolution library and fall back to the matching source file when an
  // encounter is still awaiting curated art.
  const explorationArt = linkExplorationArt({
    destinationDir: explorationDir,
    highResArtDir: explorationHighResArtDir,
    sourceArtDir: explorationSourceArtDir,
    imageNumbers: explorationImageNumbers,
  });
  console.log(
    `Linked ${String(explorationArt.highResolutionCount)} Exploration high-resolution images and ${String(explorationArt.sourceCount)} source images`,
  );
  if (explorationArt.missingCount > 0) {
    console.warn(
      `  Warning: ${String(explorationArt.missingCount)} Exploration images are unavailable`,
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

  // Dream Atlas art. Each dreamscape's rectangular scene
  // (`<id>.png`, the hover-card art) and circular node icon (`<id>_icon.png`)
  // are symlinked into `public/dreamscapes/<id>.png` and
  // `public/dreamscape-icons/<id>.png` so the atlas resolves both directly from
  // a node's dreamscape id. The Layer-VII final dream (Limbo / Apollyon) is
  // linked under the authored boss keys the atlas reads. Missing
  // source files warn-and-continue like the other art directories so a fresh
  // checkout without the synty art still builds.
  recreateDir(dreamscapesArtDir);
  recreateDir(dreamscapeIconsDir);
  let linkedDreamscapeArt = 0;
  let missingDreamscapeArt = 0;
  const linkDreamscapeImage = (sourceDir, sourceFile, destDir, destFile) => {
    const sourcePath = join(sourceDir, sourceFile);
    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, join(destDir, destFile));
      linkedDreamscapeArt++;
    } else {
      console.warn(`  Warning: missing dreamscape art ${sourcePath}`);
      missingDreamscapeArt++;
    }
  };
  for (const dreamscape of jsonDreamscapes) {
    linkDreamscapeImage(
      dreamscapeSceneArtDir,
      `${dreamscape.id}.png`,
      dreamscapesArtDir,
      `${dreamscape.id}.png`,
    );
    linkDreamscapeImage(
      dreamscapeIconArtDir,
      `${dreamscape.id}_icon.png`,
      dreamscapeIconsDir,
      `${dreamscape.id}.png`,
    );
  }
  // The final-dream scene + node icon, keyed by the Atlas boss art ids.
  linkDreamscapeImage(
    dreamscapeSceneArtDir,
    jsonAtlasData.assets.bossSceneSource,
    dreamscapesArtDir,
    `${jsonAtlasData.boss.sceneArtId}.png`,
  );
  linkDreamscapeImage(
    dreamscapeIconArtDir,
    jsonAtlasData.assets.bossIconSource,
    dreamscapeIconsDir,
    `${jsonAtlasData.boss.iconArtId}.png`,
  );
  console.log(
    `Linked ${linkedDreamscapeArt} dreamscape scene/icon images (${missingDreamscapeArt} missing)`,
  );

  // Dream Guide character renders, one per guide keyed by guide id, plus the
  // boss figure under the authored figure-art key.
  recreateDir(dreamGuidesDir);
  let linkedGuideArt = 0;
  let missingGuideArt = 0;
  const linkGuidePortrait = (sourceFile, destFile) => {
    const sourcePath = join(dreamGuideArtDir, sourceFile);
    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, join(dreamGuidesDir, destFile));
      linkedGuideArt++;
    } else {
      console.warn(`  Warning: missing dream guide art ${sourcePath}`);
      missingGuideArt++;
    }
  };
  for (const guide of jsonDreamGuides.guides) {
    linkGuidePortrait(guide.portraitSource, `${guide.id}.png`);
  }
  linkGuidePortrait(
    jsonAtlasData.assets.bossFigureSource,
    `${jsonAtlasData.boss.figureArtId}.png`,
  );
  console.log(
    `Linked ${linkedGuideArt} dream guide portraits (${missingGuideArt} missing)`,
  );

  // The ornate round frame used for unrevealed atlas nodes.
  recreateDir(atlasArtDir);
  const roundFrameSource = join(
    dreamscapeIconArtDir,
    jsonAtlasData.assets.unrevealedFrameSource,
  );
  if (existsSync(roundFrameSource)) {
    symlinkSync(
      roundFrameSource,
      join(atlasArtDir, jsonAtlasData.assets.unrevealedFrameKey),
    );
    console.log("Linked atlas round frame image");
  } else {
    console.warn(`  Warning: missing atlas round frame ${roundFrameSource}`);
  }

  if (existsSync(tutorialDialogueFrameArtPath)) {
    symlinkSync(
      tutorialDialogueFrameArtPath,
      join(atlasArtDir, "Round_frame.png"),
    );
    console.log("Linked tutorial dialogue frame image");
  } else {
    console.warn(
      `  Warning: missing tutorial dialogue frame ${tutorialDialogueFrameArtPath}`,
    );
  }

  console.log("Asset setup complete.");
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.env.GAME_DATA_SKIP_GENERATION !== "1") {
    const { ensureGameData } = await import("./game-data-pipeline.mjs");
    await ensureGameData({ rootDir: ROOT });
  }
  setupAssets();
}
