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
import { resolveToken } from "./lib/card-refs.mjs";
import {
  readTutorialConfiguration,
  validateTutorialCatalogReferences,
} from "./tutorial-data.mjs";
import { collectAtlasAssetSources, compileAtlasData } from "./atlas-data.mjs";
import { compileEconomyData } from "./economy-data.mjs";
import { compileDraftData } from "./draft-data.mjs";
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
import { formatRon } from "./ron-format.mjs";

// Re-exported for `setup-assets.test.mjs`, which exercises the JSONC comment
// stripper alongside the asset-build helpers defined here.

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
// Keep generated RON byte-stable with the repository's .ronfmt.json. The game
// data staging validator copies scripts but intentionally not repository-root
// configuration files, so this generated-artifact contract is explicit here.
const RON_FORMAT_CONFIG = { indentWidth: 2, printWidth: 100 };

/** Preserve file identity when regenerated text is byte-for-byte unchanged. */
export function writeTextFileIfChanged(filePath, contents) {
  if (existsSync(filePath) && readFileSync(filePath, "utf8") === contents) {
    return false;
  }
  writeFileSync(filePath, contents);
  return true;
}

const LOCAL_ASSET_HOME = resolve(
  process.env.DREAMTIDES_LOCAL_ASSET_HOME ?? homedir(),
);
export const IMAGE_CACHE_DIR = join(
  LOCAL_ASSET_HOME,
  "Library",
  "Caches",
  "io.github.dreamtides.tv",
  "image_cache",
);
const AVATAR_ART_DIR_CANDIDATES = [
  join(LOCAL_ASSET_HOME, "Documents", "synty", "avatars"),
  join(LOCAL_ASSET_HOME, "Documents", "sytny", "avatars"),
  join(LOCAL_ASSET_HOME, "Documents", "synty", "dream" + "callers"),
  join(LOCAL_ASSET_HOME, "Documents", "sytny", "dream" + "callers"),
];
// Dreamsign art is sourced exclusively from the `outlined` variants — every
// sign carries its own glyph outline for on-scene legibility. The shared
// `alt_text.txt` metadata lives one level up in `filtered`, so the alt-text
// reader falls back to the parent directory.
const DREAMSIGN_ART_DIR = join(
  LOCAL_ASSET_HOME,
  "Documents",
  "dreamsigns",
  "filtered",
  "outlined",
);
const DREAMSIGN_ALT_TEXT_PATH = join(DATA_DIR, "dreamsign-image-alts.tsv");
const JOURNEY_ART_DIR = join(
  LOCAL_ASSET_HOME,
  "Documents",
  "shutterstock",
  "images_journeys",
);
const MAIN_MENU_BACKGROUND_ART_PATH = join(
  LOCAL_ASSET_HOME,
  "Documents",
  "shutterstock",
  "quest_prototype_assets",
  "main-menu-background.jpg",
);
const EXPLORATION_HIGH_RES_ART_DIR = join(
  LOCAL_ASSET_HOME,
  "Documents",
  "shutterstock",
  "quest_prototype_assets",
  "exploration",
);
const EXPLORATION_SOURCE_ART_DIR = join(
  LOCAL_ASSET_HOME,
  "Documents",
  "shutterstock",
  "images",
);
const EXPLORATION_TAGGED_ART_DIR = join(
  LOCAL_ASSET_HOME,
  "Documents",
  "shutterstock",
  "tagged",
);
const TUTORIAL_DIALOGUE_FRAME_ART_PATH = join(
  LOCAL_ASSET_HOME,
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
  LOCAL_ASSET_HOME,
  "Documents",
  "synty",
  "dreamscape_images",
);
export const DREAMSCAPE_ICON_ART_DIR = join(
  LOCAL_ASSET_HOME,
  "Documents",
  "synty",
  "dreamscape_icons",
);
export const DREAM_GUIDE_ART_DIR = join(
  LOCAL_ASSET_HOME,
  "Documents",
  "synty",
  "dream_guides",
);

const CARD_FRAME_ART_DIR = join(
  LOCAL_ASSET_HOME,
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
    } else if (camelKey === "amplifiedReplacement") {
      // Compact Amplified authoring is editor/localization-build metadata. The
      // runtime receives only the expanded `amplifiedText` rules text.
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

function ronTx(text) {
  const escapedBraces = String(text)
    .replaceAll("{", "{{")
    .replaceAll("}", "}}");
  return `Tx(${JSON.stringify(escapedBraces)})`;
}

const ATTUNED_LOCALIZATION_COST_PATTERN = /([1-9]\d*)●(?=[^:.\n]*:)/;

function appendTransfigurationClause(text, clause) {
  return text + (text.length > 0 ? " " : "") + clause;
}

function resonantLocalizationText(text) {
  if (/once per turn/i.test(text)) {
    return text.replace(/once per turn/i, "any number of times per turn");
  }
  if (text.includes("▸Dawn")) {
    return text.replace("▸Dawn", "▸Materialized, Dawn");
  }
  if (text.includes("▸Materialized:")) {
    return text.replace("▸Materialized:", "▸Materialized, Dissolved:");
  }
  return null;
}

function attunedLocalizationText(text) {
  const match = ATTUNED_LOCALIZATION_COST_PATTERN.exec(text);
  if (match === null) return null;
  const token = `${match[1]}●`;
  const reduced = String(Math.max(0, Number.parseInt(match[1], 10) - 1));
  return text.replace(token, `${reduced}●`);
}

/**
 * Return every complete rules-text variant produced by a text-changing
 * transfiguration. Perfected is evaluated in canonical form order so its
 * combined output receives its own Trox entry as one translation unit.
 */
export function cardTransfigurationTextVariants(card) {
  const baseText = String(card["rendered-text"] ?? "");
  const amplifiedText = card["amplified-text"];
  const hasAmplified =
    amplifiedText !== undefined &&
    String(amplifiedText).trim() !== "" &&
    String(amplifiedText) !== baseText;
  const isEvent = card["card-type"] === "Event";
  const isCharacter = card["card-type"] === "Character";
  const parsedEnergyCost = parseEnergyCost(card["energy-cost"]);
  const hasPositiveEnergyCost =
    parsedEnergyCost.energyCost !== null && parsedEnergyCost.energyCost > 0;
  const resonantText = resonantLocalizationText(baseText);
  const attunedText = attunedLocalizationText(baseText);
  const eligibleFormCount = [
    hasPositiveEnergyCost,
    hasAmplified,
    isCharacter,
    isEvent,
    isEvent && card["is-fast"] !== true,
    resonantText !== null,
    attunedText !== null,
  ].filter(Boolean).length;

  const variants = new Set();
  if (hasAmplified) variants.add(String(amplifiedText));
  if (isEvent) {
    variants.add(appendTransfigurationClause(baseText, "Draw a card."));
    variants.add(appendTransfigurationClause(baseText, "Reclaim."));
  }
  if (resonantText !== null) variants.add(resonantText);
  if (attunedText !== null) variants.add(attunedText);

  if (eligibleFormCount >= 2) {
    let perfectedText = hasAmplified ? String(amplifiedText) : baseText;
    if (isEvent) {
      perfectedText = appendTransfigurationClause(perfectedText, "Draw a card.");
      perfectedText = appendTransfigurationClause(perfectedText, "Reclaim.");
    }
    if (resonantText !== null) {
      perfectedText = resonantLocalizationText(perfectedText) ?? perfectedText;
    }
    if (attunedText !== null) {
      perfectedText = attunedLocalizationText(perfectedText) ?? perfectedText;
    }
    variants.add(perfectedText);
  }

  variants.delete(baseText);
  return [...variants];
}

/**
 * Generate the complete card messages Trox extracts. Canonical cards.ron keeps
 * Amplified authoring compact, but translators need complete messages rather
 * than language-dependent replacement fragments. The generated projection
 * retains CardDefinition field paths so existing message identities and
 * translator history stay stable.
 */
export function generateCardLocalizationProjection(cards) {
  const records = cards.map((card) => {
    const abilityText = String(card["rendered-text"] ?? "")
      .split("\n\n")
      .map(ronTx)
      .join(", ");
    const amplifiedText = card["amplified-text"];
    const amplifiedField =
      amplifiedText === undefined
        ? ""
        : `\n    amplified_text: [${String(amplifiedText)
            .split("\n\n")
            .map(ronTx)
            .join(", ")}],`;
    return `  CardDefinition(\n    name: ${ronTx(card.name)},\n    ability_text: [${abilityText}],${amplifiedField}\n  ),`;
  });
  return `// GENERATED FILE — DO NOT EDIT. Complete localization messages projected from data/cards.ron.\n[\n${records.join("\n\n")}\n]\n`;
}

/**
 * Generate complete, globally deduplicated rules paragraphs for derived
 * transfiguration forms. This projection lives under `.generated` because it
 * is disposable workspace input to Trox rather than canonical game data.
 */
export function generateCardTransfigurationLocalizationProjection(cards) {
  const variants = [
    ...new Set(cards.flatMap((card) => cardTransfigurationTextVariants(card))),
  ].sort((left, right) => left.localeCompare(right, "en-US"));
  return `// GENERATED FILE — DO NOT EDIT. Complete transfiguration localization messages projected from data/cards.ron.\n[\n${variants.map((text) => `  ${ronTx(text)},`).join("\n")}\n]\n`;
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
 * Enforce the dreamscape <-> Avatar mapping invariant at build time:
 * non-starter dreamscapes partition `avatars.toml` into resident groups.
 * `dreamscapes` are the transformed dreamscape records and `avatarIds` the
 * set of every real Avatar id. Fatal violations depend only on
 * `dreamscapes.toml` itself, so a routine edit elsewhere can never trip them:
 * the same Avatar listed under two dreamscapes, the starter carrying
 * residents, or a non-starter region outside the 3-4 band. Referential checks
 * against the Avatar set are non-fatal warnings instead, because the build
 * may run against a reduced Avatar fixture (the asset tests swap one in): a
 * `avatar-id` that resolves to no Avatar, and an Avatar assigned
 * to no dreamscape, are each reported as a warning. In a full production build
 * both files are real, so a stray id surfaces as paired warnings (the bad id is
 * unknown and the orphaned Avatar is unassigned). Ids are compared
 * case-insensitively. Returns a `{ id -> count }` summary for logging.
 */
export function validateAvatarMapping(dreamscapes, avatarIds) {
  const known = new Map([...avatarIds].map((id) => [id.toLowerCase(), id]));
  const assignedTo = new Map(); // lowercased avatar id -> dreamscape id
  const unknown = [];
  const counts = {};

  for (const scape of dreamscapes) {
    const ids = scape.avatarIds ?? [];
    counts[scape.id] = ids.length;

    if (scape.isStarter) {
      if (ids.length > 0) {
        throw new Error(
          `dreamscapes.toml: starter dreamscape "${scape.id}" must not list ` +
            `avatar-ids (found ${String(ids.length)})`,
        );
      }
      continue;
    }

    if (ids.length < 3 || ids.length > 4) {
      throw new Error(
        `dreamscapes.toml: dreamscape "${scape.id}" has ${String(ids.length)} ` +
          `avatar-ids; each non-starter region must have 3-4`,
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
          `dreamscapes.toml: avatar ${rawId} is assigned to both ` +
            `"${prior}" and "${scape.id}"; each Avatar belongs to exactly ` +
            `one dreamscape`,
        );
      }
      assignedTo.set(key, scape.id);
    }
  }

  if (unknown.length > 0) {
    console.warn(
      `WARNING: dreamscapes.toml references ${String(unknown.length)} ` +
        `avatar id(s) that resolve to no Avatar: ` +
        `${unknown.slice(0, 5).join(", ")}` +
        (unknown.length > 5 ? ", ..." : ""),
    );
  }

  const unassigned = [...known.entries()]
    .filter(([key]) => !assignedTo.has(key))
    .map(([, id]) => id);
  if (unassigned.length > 0) {
    console.warn(
      `WARNING: ${String(unassigned.length)} avatar(s) are not assigned ` +
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
 * Convert a TOML Avatar record to its JSON representation with camelCase keys.
 * Omitted `starting-essence` values remain omitted until both this catalog and
 * economy data have loaded, when the runtime applies the authored default.
 */
export function transformAvatar(avatar) {
  const result = {};
  for (const [key, value] of Object.entries(avatar)) {
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
    rarity: dreamsign.rarity,
    tideIds: dreamsign["tide-ids"],
    tags: dreamsign.tags ?? [],
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

function isSourceMessageRef(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.format === "trox-source-message-ref" &&
    typeof value.entry_id === "string" &&
    typeof value.source_signature === "string" &&
    typeof value.contract_signature === "string"
  );
}

/** Convert and validate the authored Exploration encounter catalog. */
export function transformExplorationData(source) {
  if (source["schema-version"] !== 2) {
    throw new Error("exploration_site.toml: schema-version must be 2");
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
      "exploration_site.toml: compiler, runtime, and editor effect kinds must match",
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
          ...(effectText === undefined ? {} : { effectText }),
          ...(followupTitle === undefined ? {} : { followupTitle }),
          ...(followupSubtitle === undefined ? {} : { followupSubtitle }),
          effectKind,
          ...effectFields,
        };
        validateExplorationEffectAuthoredFields(action, {
          fail(message) {
            if (action.effectKind === "add-fixed-site") {
              throw new Error(
                `exploration_site.toml: action ${action.id} effect-kind add-fixed-site requires a supported site-type`,
              );
            }
            if (action.effectKind === "choose-site-type") {
              throw new Error(
                `exploration_site.toml: action ${action.id} effect-kind choose-site-type requires explicit offer-count 3`,
              );
            }
            throw new Error(
              `exploration_site.toml: action ${action.id} effect-kind ${message}`,
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
    throw new Error("exploration_site.toml: requires at least one encounter");
  }
  const encounterIds = new Set();
  const actionIds = new Set();
  for (const encounter of encounters) {
    if (typeof encounter.cardId !== "string" || encounter.cardId.length === 0) {
      throw new Error(
        "exploration_site.toml: every encounter requires card-id",
      );
    }
    if (encounterIds.has(encounter.cardId.toLowerCase())) {
      throw new Error(
        `exploration_site.toml: duplicate encounter card-id ${encounter.cardId}`,
      );
    }
    encounterIds.add(encounter.cardId.toLowerCase());
    if (
      !Array.isArray(encounter.action) ||
      encounter.action.length < 1 ||
      encounter.action.length > 4
    ) {
      throw new Error(
        `exploration_site.toml: encounter ${encounter.cardId} must have between one and four actions`,
      );
    }
    for (const action of encounter.action) {
      if (typeof action.id !== "string" || actionIds.has(action.id)) {
        throw new Error(
          `exploration_site.toml: missing or duplicate action id ${String(action.id)}`,
        );
      }
      actionIds.add(action.id);
      if (!effectKindSet.has(action.effectKind)) {
        throw new Error(
          `exploration_site.toml: action ${action.id} has unknown effect-kind ${String(action.effectKind)}`,
        );
      }
      const definition = effectSchemaByKind.get(action.effectKind);
      if (
        definition?.allowedSelectionPolicyIds !== undefined &&
        !definition.allowedSelectionPolicyIds.includes(action.selectionPolicyId)
      ) {
        throw new Error(
          `exploration_site.toml: action ${action.id} has unsupported selection-policy-id ${String(action.selectionPolicyId)}`,
        );
      }
      for (const key of ["label"]) {
        if (
          !isSourceMessageRef(action[key]) &&
          (typeof action[key] !== "string" || action[key].trim() === "")
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} requires ${key}`,
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
                `exploration_site.toml: action ${action.id} effect-kind ${action.effectKind} must compile without a selection policy`,
              );
            }
            if (
              [
                "purge-random-starter-and-gain-card",
                "replace-all-starter-cards",
              ].includes(action.effectKind)
            ) {
              throw new Error(
                `exploration_site.toml: action ${action.id} effect-kind ${action.effectKind} does not support a top-level selection-policy-id`,
              );
            }
          }
          throw new Error(
            `exploration_site.toml: action ${action.id} ${message}`,
          );
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
            `exploration_site.toml: action ${action.id} requires predicate`,
          );
        }
        if (
          action.predicate !== undefined &&
          action.predicate !== "" &&
          !isRewardCardPredicate(action.predicate)
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} has unsupported predicate ${String(action.predicate)}`,
          );
        }
        if (action.cardType !== undefined) {
          throw new Error(
            `exploration_site.toml: action ${action.id} field cardType does not apply to effect-kind ${action.effectKind}`,
          );
        }
        if (action.siteType !== undefined) {
          throw new Error(
            `exploration_site.toml: action ${action.id} field siteType does not apply to effect-kind ${action.effectKind}`,
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
            `exploration_site.toml: action ${action.id} requires a positive whole-number count`,
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
            `exploration_site.toml: action ${action.id} requires a positive whole-number offer-count`,
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
            `exploration_site.toml: action ${action.id} requires card-id`,
          );
        }
        if (
          action.effectKind === "gain-nightmare-and-dreamsign" &&
          (typeof action.dreamsignId !== "string" ||
            action.dreamsignId.trim().length === 0)
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} requires dreamsign-id`,
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
            `exploration_site.toml: action ${action.id} requires positive whole-number essence, predicate, and transfiguration`,
          );
        }
        if (
          action.effectKind === "gain-essence-per-card" &&
          (typeof action.essencePerCard !== "number" ||
            action.essencePerCard <= 0)
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} requires positive essence-per-card`,
          );
        }
        if (
          action.effectKind === "increase-spark-all" &&
          (typeof action.sparkBonus !== "number" || action.sparkBonus <= 0)
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} requires positive spark-bonus`,
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
            `exploration_site.toml: action ${action.id} requires subtype and positive spark-bonus`,
          );
        }
        if (
          action.effectKind === "purge-dreamsign-for-essence" &&
          (typeof action.essence !== "number" || action.essence <= 0)
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} requires positive essence`,
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
            `exploration_site.toml: action ${action.id} requires a positive whole-number nightmare-count`,
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
              "choose-avatar",
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
              `exploration_site.toml: action ${action.id} field ${field} does not apply to effect-kind ${action.effectKind}`,
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
            `exploration_site.toml: action ${action.id} requires a positive whole-number count`,
          );
        }
        if (
          action.effectKind === "purge-for-essence" &&
          (typeof action.essencePerSpark !== "number" ||
            !Number.isFinite(action.essencePerSpark) ||
            action.essencePerSpark <= 0)
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} requires positive essence-per-spark`,
          );
        }
        if (
          ["copy-offered-deck-card", "choose-avatar"].includes(
            action.effectKind,
          ) &&
          (typeof action.offerCount !== "number" ||
            !Number.isInteger(action.offerCount) ||
            action.offerCount <= 0)
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} requires a positive whole-number offer-count`,
          );
        }
        if (
          action.effectKind === "change-subtype-selected" &&
          (typeof action.subtype !== "string" || action.subtype.trim() === "")
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} requires a non-empty subtype`,
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
              `exploration_site.toml: action ${action.id} requires deck-target`,
            );
          }
        } else if (action.deckTarget !== undefined) {
          throw new Error(
            `exploration_site.toml: action ${action.id} has unsupported deck-target`,
          );
        }
        if (
          typeof action.effectText === "string" &&
          /\$[A-Z][A-Z0-9_]*/u.test(action.effectText)
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} uses an untyped presentation token`,
          );
        }
        const presentationSlots =
          typeof action.effectText === "string"
            ? [
                ...new Set(
                  action.effectText.match(/\{([a-z][a-z0-9_]*)\}/gu) ?? [],
                ),
              ]
            : null;
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
        for (const slot of presentationSlots ?? []) {
          if (!allowedSlots.has(slot)) {
            throw new Error(
              `exploration_site.toml: action ${action.id} has unsupported presentation slot ${slot}`,
            );
          }
        }
        if (
          action.effectKind === "gain-offered-card" &&
          presentationSlots !== null &&
          !presentationSlots.includes("{offered_card}")
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} must present {offered_card}`,
          );
        }
        if (
          action.deckTarget === "offered" &&
          presentationSlots !== null &&
          !presentationSlots.includes("{deck_card}")
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} must present {deck_card}`,
          );
        }
        if (
          action.cardId !== undefined &&
          presentationSlots !== null &&
          !presentationSlots.includes("{fixed_card}")
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} must present {fixed_card}`,
          );
        }
        if (
          [
            "gain-nightmare-and-dreamsign",
            "gain-nightmare-and-offered-dreamsign",
            "gain-nightmare-and-card",
            "reduce-cost-all-and-gain-nightmares",
          ].includes(action.effectKind) &&
          presentationSlots !== null &&
          !presentationSlots.includes("{nightmare_card}")
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} must present {nightmare_card}`,
          );
        }
      }
      const followupText =
        typeof action.followupTitle === "string" &&
        typeof action.followupSubtitle === "string"
          ? `${action.followupTitle}\n${action.followupSubtitle}`
          : "";
      const followupSlots = [
        ...new Set(followupText.match(/\{([a-z][a-z0-9_]*)\}/gu) ?? []),
      ];
      const allowedFollowupSlots = new Set([
        "{action_label}",
        "{count}",
        "{subtype}",
        "{transfiguration}",
        "{essence_per_spark}",
      ]);
      for (const slot of followupSlots) {
        if (!allowedFollowupSlots.has(slot)) {
          throw new Error(
            `exploration_site.toml: action ${action.id} has unsupported followup slot ${slot}`,
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
  taggedArtDir,
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

  const collectJpegPaths = (dir, recursive) => {
    if (dir === undefined || !existsSync(dir)) return [];
    const paths = [];
    const visit = (currentDir) => {
      for (const entry of readdirSync(currentDir, { withFileTypes: true }).sort(
        (left, right) => left.name.localeCompare(right.name),
      )) {
        const entryPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (recursive) visit(entryPath);
          continue;
        }
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".jpg")) {
          paths.push(entryPath);
        }
      }
    };
    visit(dir);
    return paths;
  };

  const sourceFiles = collectJpegPaths(sourceArtDir, false);
  const taggedFiles = collectJpegPaths(taggedArtDir, true);
  for (const imageNumber of wanted) {
    if (linked.has(imageNumber)) continue;
    const pattern = new RegExp(`(?<!\\d)${imageNumber}\\.jpg$`, "iu");
    const sourceMatches = sourceFiles.filter((path) => pattern.test(path));
    const matches =
      sourceMatches.length > 0
        ? sourceMatches
        : taggedFiles.filter((path) => pattern.test(path));
    if (matches.length !== 1) {
      console.warn(
        `  Warning: expected one Exploration source image for ${imageNumber}, found ${String(matches.length)}`,
      );
      continue;
    }
    symlinkSync(matches[0], join(destinationDir, `${imageNumber}.jpg`));
    linked.add(imageNumber);
    sourceCount++;
  }

  return {
    highResolutionCount,
    sourceCount,
    missingCount: wanted.size - linked.size,
  };
}

function defaultAvatarArtDir() {
  for (const candidate of AVATAR_ART_DIR_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return AVATAR_ART_DIR_CANDIDATES[0];
}

function readDreamsignAltText(altTextPath) {
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
 * Convert a TOML dreamscape record to its runtime JSON representation. Keys are
 * renamed kebab->camel. The starter dreamscape omits `guide-id`/`affiliation-id`
 * in the TOML; those normalize to `null` so the runtime always sees an explicit
 * value, and `is-starter` defaults to `false` for the non-starter regions. A
 * dreamscape without `avatar-ids` (the starter) normalizes to an empty
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
  if (!Array.isArray(result.avatarIds)) result.avatarIds = [];
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
  cardLocalizationRonPath = join(
    dirname(cardTomlPath),
    "generated",
    "cards_localization.ron",
  ),
  cardTransfigurationLocalizationRonPath = join(
    ROOT,
    ".generated",
    "localization",
    "sources",
    "card_transfigurations.ron",
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
  mkdirSync(dirname(cardLocalizationRonPath), { recursive: true });
  writeTextFileIfChanged(
    cardLocalizationRonPath,
    formatRon(
      formatRon(
        generateCardLocalizationProjection(allCards),
        RON_FORMAT_CONFIG,
      ),
      RON_FORMAT_CONFIG,
    ),
  );
  mkdirSync(dirname(cardTransfigurationLocalizationRonPath), {
    recursive: true,
  });
  writeTextFileIfChanged(
    cardTransfigurationLocalizationRonPath,
    formatRon(
      generateCardTransfigurationLocalizationProjection(allCards),
      RON_FORMAT_CONFIG,
    ),
  );

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
  avatarV2TomlPath,
  dreamsignTomlPath,
  publicDir,
  imageCacheDir,
  avatarArtDir,
  dreamsignArtDir,
  dreamsignAltTextPath,
  mainMenuBackgroundArtPath,
  tutorialDialogueFrameArtPath,
}) {
  const parsedCards = parse(readFileSync(cardTomlPath, "utf8"));
  const jsonCards = (parsedCards.cards ?? []).map(transformCard);
  const parsedAvatars = parse(readFileSync(avatarV2TomlPath, "utf8"));
  const jsonAvatars = (parsedAvatars.avatar ?? []).map(transformAvatar);
  const parsedDreamsigns = parse(readFileSync(dreamsignTomlPath, "utf8"));
  const altTextByImageName = readDreamsignAltText(dreamsignAltTextPath);
  const jsonDreamsigns = (parsedDreamsigns.dreamsign ?? []).map((dreamsign) =>
    transformDreamsign(dreamsign, altTextByImageName),
  );

  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    join(publicDir, "card-data.json"),
    `${JSON.stringify(jsonCards, null, 2)}\n`,
  );
  writeFileSync(
    join(publicDir, "avatars-v2-data.json"),
    `${JSON.stringify(jsonAvatars, null, 2)}\n`,
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
  for (const avatar of jsonAvatars) {
    if (typeof avatar.imageNumber !== "string") continue;
    linkCatalogArt(
      join(avatarArtDir, `${avatar.imageNumber}.png`),
      join(publicDir, "avatars", `${avatar.imageNumber}.png`),
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
  avatarV2TomlPath = join(DATA_DIR, "avatars.toml"),
  dreamwellTomlPath = join(DATA_DIR, "dreamwell.toml"),
  dreamsignTomlPath = join(DATA_DIR, "dreamsigns.toml"),
  dreamscapesTomlPath = join(DATA_DIR, "dreamscapes.toml"),
  dreamGuidesTomlPath = join(DATA_DIR, "dream_guides.toml"),
  sitesTomlPath = join(DATA_DIR, "sites.toml"),
  explorationTomlPath = join(DATA_DIR, "exploration_site.toml"),
  auguryTomlPath = join(DATA_DIR, "augury_site.toml"),
  affiliationsTomlPath = join(DATA_DIR, "affiliations.toml"),
  atlasTomlPath = join(DATA_DIR, "atlas.toml"),
  journeyTomlPath = join(DATA_DIR, "journey.toml"),
  shopSiteTomlPath = join(DATA_DIR, "shop_site.toml"),
  battleTomlPath = join(DATA_DIR, "battle.toml"),
  draftTomlPath = join(DATA_DIR, "draft_site.toml"),
  opponentsTomlPath = join(DATA_DIR, "opponents.toml"),
  glossaryTomlPath = join(DATA_DIR, "glossary.toml"),
  gambleTomlPath = join(DATA_DIR, "gamble_site.toml"),
  transfigurationTomlPath = join(DATA_DIR, "transfiguration_site.toml"),
  resonanceTomlPath = join(DATA_DIR, "resonance.toml"),
  apollyonIncarnationsTomlPath = join(DATA_DIR, "apollyon_incarnations.toml"),
  figmentTomlPath = join(DATA_DIR, "figments.toml"),
  tutorialTomlPath = join(DATA_DIR, "tutorial.toml"),
  publicDir = PUBLIC_DIR,
  generatedConfigDir = join(ROOT, "src", "generated", "config"),
  imageCacheDir = IMAGE_CACHE_DIR,
  avatarArtDir = defaultAvatarArtDir(),
  dreamsignArtDir = DREAMSIGN_ART_DIR,
  dreamsignAltTextPath = DREAMSIGN_ALT_TEXT_PATH,
  journeyArtDir = JOURNEY_ART_DIR,
  mainMenuBackgroundArtPath = MAIN_MENU_BACKGROUND_ART_PATH,
  explorationHighResArtDir = EXPLORATION_HIGH_RES_ART_DIR,
  explorationSourceArtDir = EXPLORATION_SOURCE_ART_DIR,
  explorationTaggedArtDir = EXPLORATION_TAGGED_ART_DIR,
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
      avatarV2TomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      avatarArtDir,
      dreamsignArtDir,
      dreamsignAltTextPath,
      mainMenuBackgroundArtPath,
      tutorialDialogueFrameArtPath,
    });
    return;
  }
  const cardsDir = join(publicDir, "cards");
  const cardFrameDir = join(publicDir, "card-frame");
  const avatarsDir = join(publicDir, "avatars");
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
  const avatarV2JsonPath = join(publicDir, "avatars-v2-data.json");
  const dreamwellJsonPath = join(publicDir, "dreamwell-data.json");
  const dreamsignJsonPath = join(publicDir, "dreamsign-data.json");
  const dreamscapesJsonPath = join(publicDir, "dreamscapes-data.json");
  const dreamGuidesJsonPath = join(publicDir, "dream-guides-data.json");
  const sitesJsonPath = join(publicDir, "sites-data.json");
  const generatedSitesJsonPath = join(generatedConfigDir, "sites-data.json");
  const explorationJsonPath = join(publicDir, "exploration-data.json");
  const auguryJsonPath = join(publicDir, "augury-data.json");
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
  const journeyExtensionJsonPath = join(journeysDir, "imageId-extension.json");

  mkdirSync(generatedConfigDir, { recursive: true });

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
  const tutorialAvatars = parse(readFileSync(avatarV2TomlPath, "utf8")).avatar;
  const tutorialDreamwellCards = parse(
    readFileSync(dreamwellTomlPath, "utf8"),
  ).dreamwell;
  if (!Array.isArray(tutorialAvatars)) {
    throw new Error("Expected [[avatar]] array in avatars.toml");
  }
  if (!Array.isArray(tutorialDreamwellCards)) {
    throw new Error("Expected [[dreamwell]] array in dreamwell.toml");
  }
  validateTutorialCatalogReferences(tutorialConfiguration, {
    cardIds: jsonCards.map((card) => card.id),
    avatarIds: tutorialAvatars.map((avatar) => avatar.id),
    dreamwellCardIds: tutorialDreamwellCards.map((card) => card.id),
  });
  writeFileSync(
    tutorialJsonPath,
    `${JSON.stringify(tutorialConfiguration, null, 2)}\n`,
  );
  console.log(
    `Wrote ${tutorialConfiguration.actions.length} tutorial actions and ${tutorialConfiguration.triggers.length} triggers to tutorial-data.json`,
  );

  // The compiled projection of the manually curated tide decks and per-avatar
  // pool composition consumed by the tides4 pool variant.
  const tidesSourcePath = join(DATA_DIR, "tides.toml");
  const tides4JsonPath = join(publicDir, "tides4-data.json");
  const generatedTides4JsonPath = join(generatedConfigDir, "tides4-data.json");
  if (existsSync(tidesSourcePath) && existsSync(avatarV2TomlPath)) {
    const served = compileTidesData(
      parse(readFileSync(tidesSourcePath, "utf8")),
      parse(readFileSync(avatarV2TomlPath, "utf8")),
    );
    const serialized = `${JSON.stringify(served)}\n`;
    writeFileSync(tides4JsonPath, serialized);
    writeFileSync(generatedTides4JsonPath, serialized);
    console.log("Compiled tide catalogs to tides4-data.json");
  } else {
    console.log(
      "No compiled tides or Avatars found; run `npm run game-data:compile`.",
    );
  }

  // The v2 Avatar identities (`avatars.toml`) drive the standalone
  // draft test harness. They carry a kebab->camel normalization and a
  // `signature-cards` list used by tides4 baking and display surfaces.
  console.log("Parsing avatars.toml...");
  const avatarV2TomlContent = readFileSync(avatarV2TomlPath, "utf8");
  const parsedAvatarsV2 = parse(avatarV2TomlContent);
  const allAvatarsV2 = parsedAvatarsV2.avatar;

  if (!Array.isArray(allAvatarsV2)) {
    throw new Error("Expected [[avatar]] array in avatars.toml");
  }

  // Signatures are authored as stable card UUIDs. Resolve them to current card
  // names for display and fail the build for a dangling reference. The UUIDs are
  // emitted as `signatureCardIds` (index-aligned with `signatureCards`) so
  // consumers that must distinguish two cards sharing a name can key on the id.
  const jsonAvatarsV2 = allAvatarsV2.map((avatar) => {
    const transformed = transformAvatar(avatar);
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
    avatarV2JsonPath,
    JSON.stringify(jsonAvatarsV2, null, 2) + "\n",
  );
  console.log(`Wrote ${jsonAvatarsV2.length} avatars to avatars-v2-data.json`);

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

  const altTextByImageName = readDreamsignAltText(dreamsignAltTextPath);
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

  console.log("Parsing exploration_site.toml...");
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
      "exploration_site.toml: every encounter card requires an image-number",
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
        `exploration_site.toml: encounter references unknown card UUID ${encounter.cardId}`,
      );
    }
    for (const action of encounter.action) {
      for (const field of ["cardId"]) {
        if (
          typeof action[field] === "string" &&
          !knownCardIds.has(action[field].toLowerCase())
        ) {
          throw new Error(
            `exploration_site.toml: action ${action.id} references unknown card UUID ${action[field]}`,
          );
        }
      }
      if (
        typeof action.dreamsignId === "string" &&
        !knownDreamsignIds.has(action.dreamsignId.toLowerCase())
      ) {
        throw new Error(
          `exploration_site.toml: action ${action.id} references unknown Dreamsign UUID ${action.dreamsignId}`,
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
  // Enforce the resident-Avatar invariant: non-starter dreamscapes
  // partition avatars.toml into 3-4 per region with no Avatar in
  // two regions. `jsonAvatarsV2` was parsed above, so its ids are the
  // authoritative set checked against.
  const avatarCounts = validateAvatarMapping(
    jsonDreamscapes,
    jsonAvatarsV2.map((avatar) => avatar.id),
  );
  for (const scape of jsonDreamscapes) {
    if (scape.isStarter) continue;
    console.log(
      `  ${scape.id}: ${String(avatarCounts[scape.id])} avatars` +
        ` -> ${scape.avatarIds.join(", ")}`,
    );
  }
  writeFileSync(
    dreamscapesJsonPath,
    JSON.stringify(jsonDreamscapes, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonDreamscapes.length} dreamscapes to dreamscapes-data.json`,
  );

  // Affiliations: the thematic factions backing each dreamscape. Each one is
  // defined by exactly three canonical tide UUIDs.
  console.log("Parsing affiliations.toml...");
  const affiliationsTomlContent = readFileSync(affiliationsTomlPath, "utf8");
  const parsedAffiliations = parse(affiliationsTomlContent);
  const allAffiliations = parsedAffiliations.affiliations;

  if (!Array.isArray(allAffiliations)) {
    throw new Error("Expected [[affiliations]] array in affiliations.toml");
  }

  const jsonAffiliations = allAffiliations.map(transformAffiliation);
  const knownTideIds = new Set(
    (parse(readFileSync(tidesSourcePath, "utf8")).tide ?? []).map(
      (tide) => tide.id,
    ),
  );
  for (const affiliation of jsonAffiliations) {
    if (
      !Array.isArray(affiliation.tideIds) ||
      affiliation.tideIds.length !== 3
    ) {
      throw new Error(
        `affiliations.toml (${affiliation.id}) must declare exactly three tides`,
      );
    }
    for (const tideId of affiliation.tideIds) {
      if (!knownTideIds.has(tideId)) {
        throw new Error(
          `affiliations.toml (${affiliation.id}) references unknown tide ${tideId}`,
        );
      }
    }
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

  console.log(
    "Assembling economy data from journey, shop-site, sites, and battle catalogs...",
  );
  const parsedSites = parse(readFileSync(sitesTomlPath, "utf8"));
  const jsonEconomyData = compileEconomyData({
    journey: parse(readFileSync(journeyTomlPath, "utf8")),
    shop: parse(readFileSync(shopSiteTomlPath, "utf8")),
    sites: parsedSites,
    battle: parse(readFileSync(battleTomlPath, "utf8")),
  });
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
  const jsonSitesData = compileSitesData(parsedSites, {
    guides: jsonDreamGuides,
    dreamscapes: jsonDreamscapes,
    glossaryIds: Array.isArray(parsedGlossary.entries)
      ? parsedGlossary.entries.map((entry) => entry.id)
      : [],
  });
  const serializedSitesData = JSON.stringify(jsonSitesData, null, 2) + "\n";
  writeFileSync(sitesJsonPath, serializedSitesData);
  writeFileSync(generatedSitesJsonPath, serializedSitesData);
  console.log("Wrote Sites data to sites-data.json");

  console.log("Parsing draft_site.toml...");
  const jsonDraftData = compileDraftData(
    parse(readFileSync(draftTomlPath, "utf8")),
  );
  const serializedDraftData = JSON.stringify(jsonDraftData, null, 2) + "\n";
  mkdirSync(generatedConfigDir, { recursive: true });
  writeFileSync(draftJsonPath, serializedDraftData);
  writeFileSync(generatedDraftJsonPath, serializedDraftData);
  console.log("Wrote Draft data to draft-data.json");

  console.log("Parsing augury_site.toml...");
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

  // Apollyon incarnations: the final Avatar's ten guises. Parse the TOML
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

  recreateDir(avatarsDir);
  let linkedAvatarArt = 0;
  let missingAvatarArt = 0;

  // Link portraits for the v2 draft-test Avatars, keyed by image number so
  // a portrait shared between several Avatars is linked once.
  const avatarArtByImageNumber = new Map();
  for (const avatar of jsonAvatarsV2) {
    if (!avatarArtByImageNumber.has(avatar.imageNumber)) {
      avatarArtByImageNumber.set(avatar.imageNumber, avatar.name);
    }
  }

  for (const [imageNumber, name] of avatarArtByImageNumber) {
    const filename = `${imageNumber}.png`;
    const sourcePath = join(avatarArtDir, filename);
    const symlinkPath = join(avatarsDir, filename);

    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, symlinkPath);
      linkedAvatarArt++;
    } else {
      console.warn(
        `  Warning: missing avatar art for ${name} (${imageNumber})`,
      );
      missingAvatarArt++;
    }
  }

  console.log(
    `Linked ${linkedAvatarArt} of ${avatarArtByImageNumber.size} avatar portraits (${missingAvatarArt} missing)`,
  );

  // Link the transparent full-body cutouts (`cutout/<imageNumber>.png` in the
  // art source dir) to `public/avatars/cutout/`. These are the character
  // renders with the scene background removed, used wherever the Avatar
  // stands directly on UI chrome (Avatar selection, portraits). Same
  // warn-and-continue policy as the scene portraits above.
  const avatarCutoutSourceDir = join(avatarArtDir, "cutout");
  const avatarCutoutsDir = join(avatarsDir, "cutout");
  mkdirSync(avatarCutoutsDir, { recursive: true });
  let linkedAvatarCutouts = 0;
  let missingAvatarCutouts = 0;
  for (const [imageNumber, name] of avatarArtByImageNumber) {
    const filename = `${imageNumber}.png`;
    const sourcePath = join(avatarCutoutSourceDir, filename);
    const symlinkPath = join(avatarCutoutsDir, filename);

    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, symlinkPath);
      linkedAvatarCutouts++;
    } else {
      console.warn(
        `  Warning: missing avatar cutout for ${name} (${imageNumber})`,
      );
      missingAvatarCutouts++;
    }
  }
  console.log(
    `Linked ${linkedAvatarCutouts} of ${avatarArtByImageNumber.size} avatar cutouts (${missingAvatarCutouts} missing)`,
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
    // 404. Mirrors the existing avatar/dreamsign warn-and-continue
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
    taggedArtDir: explorationTaggedArtDir,
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
