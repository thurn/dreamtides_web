import { readFileSync, mkdirSync, rmSync, symlinkSync, existsSync, readdirSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { parse } from "smol-toml";
import { CARDS_V2_POOL_METADATA } from "../src/data/cards-v2-metadata.ts";
import { DREAMCALLER_ARCHETYPES } from "../src/data/dreamcallers-v2-database.ts";
import {
  CARD_ID_RE,
  readAdaptedRecordDecklists,
  readAdaptedRecordDecklistIds,
  resolveToken,
  stripJsonComments,
} from "./lib/card-refs.mjs";

// Re-exported for `setup-assets.test.mjs`, which exercises the JSONC comment
// stripper alongside the asset-build helpers defined here.
export { stripJsonComments };

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
export const IMAGE_CACHE_DIR = join(homedir(), "Library", "Caches", "io.github.dreamtides.tv", "image_cache");
const DREAMCALLER_ART_DIR_CANDIDATES = [
  join(homedir(), "Documents", "synty", "dreamcallers"),
  join(homedir(), "Documents", "sytny", "dreamcallers"),
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
const JOURNEY_ART_DIR = join(homedir(), "Documents", "shutterstock", "images_journeys");

// Dream Atlas art. Each dreamscape ships a rectangular scene image
// (`<id>.png`, the hover-card art) and a circular node icon (`<id>_icon.png`).
// Dream-guide character renders (one per guide, plus the boss `apollyon.png`)
// and the ornate round frame used for unrevealed nodes round out the set.
const DREAMSCAPE_SCENE_ART_DIR = join(homedir(), "Documents", "synty", "dreamscape_images");
const DREAMSCAPE_ICON_ART_DIR = join(homedir(), "Documents", "synty", "dreamscape_icons");
const DREAM_GUIDE_ART_DIR = join(homedir(), "Documents", "synty", "dream_guides");

/**
 * Maps each Dream Guide id to the basename of its character render in
 * {@link DREAM_GUIDE_ART_DIR}. The source files use short forms, so this table
 * lets the pipeline emit `public/dream-guides/<guideId>.png`, letting the atlas
 * resolve a guide's portrait directly from its id.
 */
const GUIDE_PORTRAIT_SOURCE_BY_ID = {
  tobias_tanglefur: "tobias.png",
  amunet_the_tomb_keeper: "amunet.png",
  sigrun: "sigrun.png",
  durgan_forgehammer: "durgan.png",
  deacon_holt: "holt.png",
  master_takeshi: "takeshi.png",
  aldric_the_seer: "aldric.png",
  maddox: "maddox.png",
  gravok: "gravok.png",
  layaway: "layaway.png",
};

/**
 * The Layer-VII final dream. Visually the atlas always presents the boss node
 * as Limbo guarded by Apollyon, independent of whichever dreamscape the
 * generator assigns the boss node for its battle. The scene/icon reuse the
 * Limbo dreamscape art and the figure is Apollyon's character render.
 */
const BOSS_SCENE_SOURCE = "limbo.png";
const BOSS_ICON_SOURCE = "limbo_icon.png";
const BOSS_FIGURE_SOURCE = "apollyon.png";
const ROUND_FRAME_SOURCE = "Round_frame_main.png";
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
    } else if (camelKey === "tides") {
      // Tides are not part of runtime card data; drop any authored value.
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
 * Bundle adapted draft records from `docs/draft_records_adapted` into a flat
 * array of per-human-seat entries for the record-replay draft mode.
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
 * Options (all optional, defaults preserve the canonical behaviour):
 *   * `seatFilter` — a `Set` of `"<draftId>#<seat>"` keys; when given, only seats
 *     whose key is in the set are kept (every other seat is skipped before any
 *     work). Used by the `tides5` bake to restrict the corpus to the known-good
 *     decklists in `docs/known_good_decklists.json`.
 *   * `requireFullPicks` (default true) — when true, a seat is dropped unless it
 *     trims to exactly 30 picks (the standard 3×15 / first-three-packs layout).
 *     When false, a seat is kept with whatever pack-1-3 / pickInPack≤10 picks it
 *     has (≥1), so non-standard layouts — 5 packs of 9, a single big pack — still
 *     contribute their high-signal early picks. The corpus the pick-data variants
 *     build weights every pick equally regardless of its in-pack position, so a
 *     short seat's observations stay valid.
 */
export function buildDraftRecords(dir, cardMaps, opts = {}) {
  const { idToName } = cardMaps;
  const { seatFilter = null, requireFullPicks = true } = opts;
  let droppedNames = 0;
  let skippedIncomplete = 0;

  const records = [];

  for (const filename of readdirSync(dir).filter((f) => f.endsWith(".jsonc")).sort()) {
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

      // When a seat filter is supplied, keep only the requested (draftId, seat)
      // seats — the rest are skipped before any resolution work.
      if (seatFilter !== null && !seatFilter.has(`${draftId}#${seat}`)) continue;

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

      // The standard bundle demands exactly 30 trimmed picks (a uniform record
      // for the replay draft mode); a relaxed caller keeps any seat with at least
      // one trimmed pick, so non-standard pack layouts still contribute.
      if (requireFullPicks ? trimmed.length !== 30 : trimmed.length === 0) {
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
    console.log(`Skipped ${skippedIncomplete} draft seats that did not yield exactly 30 trimmed picks`);
  }
  if (droppedNames > 0) {
    console.log(`Dropped ${droppedNames} unresolved card names from draft records`);
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
export function buildKnownGoodDecklists(manifestPath, draftRecordsAdaptedDir, cardMaps) {
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  const decklists = parsed.decklists;

  const seatFilter = new Set(decklists.map((d) => `${d.draftId}#${d.seat}`));
  const nameByKey = new Map(decklists.map((d) => [`${d.draftId}#${d.seat}`, d.name]));

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
 * Enforce the dreamscape <-> Dreamcaller mapping invariant at build time:
 * non-starter dreamscapes partition `dreamcallers_v2.toml` into resident groups.
 * `dreamscapes` are the transformed dreamscape records and `dreamcallerIds` the
 * set of every real Dreamcaller id. Fatal violations depend only on
 * `dreamscapes.toml` itself, so a routine edit elsewhere can never trip them:
 * the same Dreamcaller listed under two dreamscapes, the starter carrying
 * residents, or a non-starter region outside the 3-4 band. Referential checks
 * against the Dreamcaller set are non-fatal warnings instead, because the build
 * may run against a reduced Dreamcaller fixture (the asset tests swap one in): a
 * `dreamcaller-id` that resolves to no Dreamcaller, and a Dreamcaller assigned
 * to no dreamscape, are each reported as a warning. In a full production build
 * both files are real, so a stray id surfaces as paired warnings (the bad id is
 * unknown and the orphaned Dreamcaller is unassigned). Ids are compared
 * case-insensitively. Returns a `{ id -> count }` summary for logging.
 */
export function validateDreamcallerMapping(dreamscapes, dreamcallerIds) {
  const known = new Map(
    [...dreamcallerIds].map((id) => [id.toLowerCase(), id]),
  );
  const assignedTo = new Map(); // lowercased dreamcaller id -> dreamscape id
  const unknown = [];
  const counts = {};

  for (const scape of dreamscapes) {
    const ids = scape.dreamcallerIds ?? [];
    counts[scape.id] = ids.length;

    if (scape.isStarter) {
      if (ids.length > 0) {
        throw new Error(
          `dreamscapes.toml: starter dreamscape "${scape.id}" must not list ` +
            `dreamcaller-ids (found ${String(ids.length)})`,
        );
      }
      continue;
    }

    if (ids.length < 3 || ids.length > 4) {
      throw new Error(
        `dreamscapes.toml: dreamscape "${scape.id}" has ${String(ids.length)} ` +
          `dreamcaller-ids; each non-starter region must have 3-4`,
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
          `dreamscapes.toml: dreamcaller ${rawId} is assigned to both ` +
            `"${prior}" and "${scape.id}"; each Dreamcaller belongs to exactly ` +
            `one dreamscape`,
        );
      }
      assignedTo.set(key, scape.id);
    }
  }

  if (unknown.length > 0) {
    console.warn(
      `WARNING: dreamscapes.toml references ${String(unknown.length)} ` +
        `dreamcaller id(s) that resolve to no Dreamcaller: ` +
        `${unknown.slice(0, 5).join(", ")}` +
        (unknown.length > 5 ? ", ..." : ""),
    );
  }

  const unassigned = [...known.entries()]
    .filter(([key]) => !assignedTo.has(key))
    .map(([, id]) => id);
  if (unassigned.length > 0) {
    console.warn(
      `WARNING: ${String(unassigned.length)} dreamcaller(s) are not assigned ` +
        `to any dreamscape: ${unassigned.slice(0, 5).join(", ")}` +
        (unassigned.length > 5 ? ", ..." : ""),
    );
  }

  return counts;
}

/**
 * Default starting essence used when a Dreamcaller TOML record omits a
 * `starting-essence` value. Mirrors `DEFAULT_STARTING_ESSENCE` in
 * `src/types/content.ts`.
 */
export const DEFAULT_STARTING_ESSENCE = 200;

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
  return createHash("sha256").update(shutterstockImageUrl(imageNumber)).digest("hex");
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
 * dreamscape without `dreamcaller-ids` (the starter) normalizes to an empty
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
  if (!Array.isArray(result.dreamcallerIds)) result.dreamcallerIds = [];
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
 * Convert the parsed atlas_config TOML object to its runtime JSON
 * representation. Top-level keys are renamed kebab->camel; nested objects
 * (tables) have their inner keys renamed kebab->camel as well; arrays pass
 * through unchanged.
 */
export function transformAtlasConfig(config) {
  const result = {};
  for (const [key, value] of Object.entries(config)) {
    const camelKey = kebabToCamel(key);
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = {};
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        nested[kebabToCamel(nestedKey)] = nestedValue;
      }
      result[camelKey] = nested;
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

/**
 * Parse `cards_v2.toml` and write both runtime card JSON catalogs — the
 * Special-filtered `card-data.json` the quest/battle runtime fetches, and the
 * unfiltered `cards_v2-data.json` that `cards-v2-database.ts` fetches with the
 * draft-pool metadata merged in. This is the TOML->JSON card transform shared by
 * the full `setupAssets` build and the dev hot-reload plugin
 * (`cardDataHotReloadPlugin` in vite.config.ts): the plugin calls it on every
 * `cards_v2.toml` save so the running browser can refetch fresh card data
 * without a full asset rebuild. It writes only the two card JSON files (and
 * refreshes the build-around name index); image symlinks and the other catalogs
 * are left to `setupAssets`.
 *
 * Returns the transformed `jsonCards` / `jsonCardsV2` arrays and the id<->name
 * `cardMaps`, which `setupAssets` reuses for image symlinking and the remaining
 * catalogs so the transform runs once.
 */
export function regenerateCardData({
  cardTomlPath = join(DATA_DIR, "tabula", "cards_v2.toml"),
  cardV2TomlPath = join(DATA_DIR, "tabula", "cards_v2.toml"),
  publicDir = PUBLIC_DIR,
  cardJsonPath = join(publicDir, "card-data.json"),
  cardV2JsonPath = join(publicDir, "cards_v2-data.json"),
} = {}) {
  console.log("Parsing cards_v2.toml for the runtime card catalog...");
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

  // Experimental v2 card pool loaded at run time via `cards-v2-database.ts`. It
  // is transformed with the same kebab->camel rules as the runtime pool and
  // written to its own JSON so it can be fetched with the draft-pool metadata
  // merged in, separate from card-data.json (which the dev drift guard pins to
  // cards_v2.toml). Special-rarity filtering is intentionally skipped here: the
  // pool draws on the whole catalog.
  console.log("Parsing cards_v2.toml...");
  const cardV2TomlContent = readFileSync(cardV2TomlPath, "utf8");
  const parsedCardsV2 = parse(cardV2TomlContent);
  const allCardsV2 = parsedCardsV2.cards;

  if (!Array.isArray(allCardsV2)) {
    throw new Error("Expected [[cards]] array in cards_v2.toml");
  }

  // id<->name maps for resolving the UUID-keyed reference systems (signatures,
  // pool metadata, build-around metadata, and the decklist corpora) back to the
  // current display names. Validate the two TypeScript/JSON reference files up
  // front so a dangling UUID fails the build loudly.
  const cardMaps = buildCardMaps(allCardsV2);
  validateCardIds(
    Object.keys(CARDS_V2_POOL_METADATA),
    cardMaps.idToName,
    "cards-v2-metadata.ts",
  );
  const buildaroundPath = join(DATA_DIR, "buildaround_support.json");
  const buildaroundOriginal = readFileSync(buildaroundPath, "utf8");
  const buildaroundSupport = JSON.parse(buildaroundOriginal);
  validateCardIds(
    Object.keys(buildaroundSupport.cards ?? {}),
    cardMaps.idToName,
    "buildaround_support.json",
  );
  // The build-around metadata is keyed by card id but looked up by current card
  // name (idf4 / the experiment harness index it on `entry.name`), so refresh the
  // name field from the current card name. Renaming a card needs no edit here.
  for (const [id, entry] of Object.entries(buildaroundSupport.cards ?? {})) {
    entry.name = cardMaps.idToName.get(id);
  }
  const buildaroundNext = `${JSON.stringify(buildaroundSupport, null, 2)}\n`;
  if (buildaroundNext !== buildaroundOriginal) {
    writeFileSync(buildaroundPath, buildaroundNext);
  }

  // The draft-pool metadata (core/colors/draft-archetypes) the non-`idf3`
  // pool variants consume lives in TypeScript (`cards-v2-metadata.ts`), not in
  // cards_v2.toml. It is keyed by the stable card id; merge it back into each
  // record before serializing so the generated JSON the pool experiments read is
  // complete. The standard `idf3` variant ignores all of it. Per-card `tides`
  // are deliberately not injected: the runtime card data carries no tide values.
  const jsonCardsV2 = allCardsV2.map((card) => {
    const meta = CARDS_V2_POOL_METADATA[card.id];
    if (meta) {
      if (meta.core !== undefined) card.core = meta.core;
      if (meta.colors) card.colors = meta.colors;
      if (meta.draftArchetypes) card["draft-archetypes"] = meta.draftArchetypes;
    }
    return transformCard(card);
  });
  writeFileSync(cardV2JsonPath, JSON.stringify(jsonCardsV2, null, 2) + "\n");
  console.log(`Wrote ${jsonCardsV2.length} cards to cards_v2-data.json`);

  return { jsonCards, jsonCardsV2, cardMaps };
}

export function setupAssets({
  cardTomlPath = join(DATA_DIR, "tabula", "cards_v2.toml"),
  cardV2TomlPath = join(DATA_DIR, "tabula", "cards_v2.toml"),
  dreamcallerV2TomlPath = join(DATA_DIR, "tabula", "dreamcallers_v2.toml"),
  dreamwellTomlPath = join(DATA_DIR, "tabula", "dreamwell.toml"),
  dreamsignTomlPath = join(DATA_DIR, "tabula", "dreamsigns.toml"),
  dreamsignProfilesTomlPath = join(DATA_DIR, "tabula", "dreamsign_profiles.toml"),
  dreamsignSignaturesTomlPath = join(DATA_DIR, "tabula", "dreamsign_signatures.toml"),
  dreamscapesTomlPath = join(DATA_DIR, "tabula", "dreamscapes.toml"),
  dreamGuidesTomlPath = join(DATA_DIR, "tabula", "dream_guides.toml"),
  affiliationsTomlPath = join(DATA_DIR, "tabula", "affiliations.toml"),
  atlasConfigTomlPath = join(DATA_DIR, "tabula", "atlas_config.toml"),
  apollyonIncarnationsTomlPath = join(
    DATA_DIR,
    "tabula",
    "apollyon_incarnations.toml",
  ),
  figmentTomlPath = join(DATA_DIR, "tabula", "figments.toml"),
  merchantCorpusJsonPath = join(DATA_DIR, "merchant_corpus.json"),
  publicDir = PUBLIC_DIR,
  imageCacheDir = IMAGE_CACHE_DIR,
  dreamcallerArtDir = defaultDreamcallerArtDir(),
  dreamsignArtDir = DREAMSIGN_ART_DIR,
  journeyArtDir = JOURNEY_ART_DIR,
  cardFrameArtDir = CARD_FRAME_ART_DIR,
  dreamscapeSceneArtDir = DREAMSCAPE_SCENE_ART_DIR,
  dreamscapeIconArtDir = DREAMSCAPE_ICON_ART_DIR,
  dreamGuideArtDir = DREAM_GUIDE_ART_DIR,
} = {}) {
  const cardsDir = join(publicDir, "cards");
  const cardFrameDir = join(publicDir, "card-frame");
  const dreamcallersDir = join(publicDir, "dreamcallers");
  const dreamsignsDir = join(publicDir, "dreamsigns");
  const journeysDir = join(publicDir, "journeys");
  const dreamscapesArtDir = join(publicDir, "dreamscapes");
  const dreamscapeIconsDir = join(publicDir, "dreamscape-icons");
  const dreamGuidesDir = join(publicDir, "dream-guides");
  const atlasArtDir = join(publicDir, "atlas");
  const cardJsonPath = join(publicDir, "card-data.json");
  const cardV2JsonPath = join(publicDir, "cards_v2-data.json");
  const decklistsJsonPath = join(publicDir, "decklists-data.json");
  const decklistIdsJsonPath = join(publicDir, "decklist-ids-data.json");
  const draftRecordsAdaptedDir = join(ROOT, "docs", "draft_records_adapted");
  const draftRecordsJsonPath = join(publicDir, "draft-records-data.json");
  const dreamcallerV2JsonPath = join(publicDir, "dreamcallers-v2-data.json");
  const dreamwellJsonPath = join(publicDir, "dreamwell-data.json");
  const dreamsignJsonPath = join(publicDir, "dreamsign-data.json");
  const dreamsignProfilesJsonPath = join(publicDir, "dreamsign-profiles-data.json");
  const dreamsignSignaturesJsonPath = join(publicDir, "dreamsign-signatures-data.json");
  const dreamscapesJsonPath = join(publicDir, "dreamscapes-data.json");
  const dreamGuidesJsonPath = join(publicDir, "dream-guides-data.json");
  const affiliationsJsonPath = join(publicDir, "affiliations-data.json");
  const atlasConfigJsonPath = join(publicDir, "atlas-config-data.json");
  const apollyonIncarnationsJsonPath = join(
    publicDir,
    "apollyon-incarnations-data.json",
  );
  const figmentJsonPath = join(publicDir, "figments-data.json");
  const merchantCorpusPublicPath = join(publicDir, "merchant-corpus-data.json");
  const journeyExtensionJsonPath = join(journeysDir, "imageId-extension.json");

  const { jsonCards, jsonCardsV2, cardMaps } = regenerateCardData({
    cardTomlPath,
    cardV2TomlPath,
    cardJsonPath,
    cardV2JsonPath,
    publicDir,
  });

  // Real per-deck card lists bundled for the draft test's `decklists` pool
  // variant (and the `idf`/`idf2`/`idf3` variants), which build a pool by
  // snowballing similar real decklists rather than synthesizing one from
  // archetype themes. Each seat in the adapted draft records
  // (`docs/draft_records_adapted`) contributes its `mainboard` as one deck, with
  // every card resolved from its stable cards_v2 UUID to the current name, so
  // renaming a card needs no edit here. Empty decks are dropped; all size
  // filtering happens in the algorithm so it stays tunable. The runtime bundle is
  // keyed by current card name (`string[][]`, one inner array per deck), matching
  // the name-based pool engine and oracle tests.
  console.log("Bundling real decklists from the adapted draft records...");
  const decklists = readAdaptedRecordDecklists(draftRecordsAdaptedDir, cardMaps);
  writeFileSync(decklistsJsonPath, JSON.stringify(decklists) + "\n");
  console.log(`Wrote ${decklists.length} decklists to decklists-data.json`);

  // The same per-seat decklists, but keyed on each card's stable cards_v2 UUID
  // (lowercased) instead of its current display name. The IDF-cosine pool engine
  // (`idf`/`idf2`/`idf3`/`idf4`) and the affiliation reweighting score on this
  // id-keyed corpus so two distinct cards that share a display name stay distinct
  // (24 cards_v2 cards share a name with another). Bundled alongside the name
  // corpus, which the `decklists` variant and the human-readable tooling still
  // read. Built from the SAME seats (every non-empty mainboard), so the two
  // corpora line up index-for-index.
  const decklistIds = readAdaptedRecordDecklistIds(draftRecordsAdaptedDir, cardMaps);
  writeFileSync(decklistIdsJsonPath, JSON.stringify(decklistIds) + "\n");
  console.log(`Wrote ${decklistIds.length} id-keyed decklists to decklist-ids-data.json`);

  // Adapted draft records bundled for the record-replay draft mode and the
  // pick-data pool variants. Each JSON file in `docs/draft_records_adapted` is
  // one draft event; we extract one entry per seat (trimmed to the first 10 picks
  // per pack) and write the flat array to the browser bundle.
  console.log("Bundling adapted draft records from the corpus...");
  const draftRecords = buildDraftRecords(draftRecordsAdaptedDir, cardMaps);
  writeFileSync(draftRecordsJsonPath, JSON.stringify(draftRecords) + "\n");
  console.log(`Wrote ${draftRecords.length} draft-record seats to draft-records-data.json`);

  console.log("Bundling known-good decklists corpus...");
  const knownGoodDecklists = buildKnownGoodDecklists(
    join(ROOT, "docs", "known_good_decklists.json"),
    draftRecordsAdaptedDir,
    cardMaps,
  );
  writeFileSync(join(publicDir, "known-good-decklists-data.json"), JSON.stringify(knownGoodDecklists) + "\n");
  console.log(`Wrote ${knownGoodDecklists.length} known-good decklists to known-good-decklists-data.json`);

  // The committed affinity corpus the `embedded` pool variant grows from. It is an
  // authored/baked artifact (run `npm run bake-affinity-corpus` to regenerate it
  // from the records and the affinity overlay) committed as JSONC with a
  // provenance header. The browser fetches the served copy and parses it with
  // `JSON.parse`, so the comments are stripped on the way to the served path; the
  // committed source stays authoritative like a lockfile. Absent only in a
  // checkout that has not baked it yet.
  const affinityCorpusSourcePath = join(DATA_DIR, "affinity_corpus.jsonc");
  const affinityCorpusJsonPath = join(publicDir, "affinity-corpus-data.json");
  if (existsSync(affinityCorpusSourcePath)) {
    const corpusJsonc = readFileSync(affinityCorpusSourcePath, "utf8");
    // Strip comments and re-serialize so the served asset is valid JSON.
    const served = JSON.stringify(JSON.parse(stripJsonComments(corpusJsonc)));
    writeFileSync(affinityCorpusJsonPath, served + "\n");
    console.log("Copied affinity_corpus.jsonc to affinity-corpus-data.json (comments stripped)");
  } else {
    console.log(
      "No data/affinity_corpus.jsonc found; the `embedded` pool variant will " +
        "be unavailable until `npm run bake-affinity-corpus` is run.",
    );
  }

  // The committed tide decks the `tides` pool variant combines into pools. A
  // baked artifact like the affinity corpus above (run `npm run bake-tides` to
  // regenerate it from the bundled decklists), committed as JSONC with a
  // provenance header and served as plain JSON.
  const tidesSourcePath = join(DATA_DIR, "tides.jsonc");
  const tidesJsonPath = join(publicDir, "tides-data.json");
  if (existsSync(tidesSourcePath)) {
    const tidesJsonc = readFileSync(tidesSourcePath, "utf8");
    const served = JSON.stringify(JSON.parse(stripJsonComments(tidesJsonc)));
    writeFileSync(tidesJsonPath, served + "\n");
    console.log("Copied tides.jsonc to tides-data.json (comments stripped)");
  } else {
    console.log(
      "No data/tides.jsonc found; the `tides` pool variant will be " +
        "unavailable until `npm run bake-tides` is run.",
    );
  }

  // The committed `tides2` tide decks and their curated relationships. The decks
  // are baked by `npm run bake-tides2`; the relationships are seeded once by
  // `npm run seed-tide-relationships`, then hand-curated. Both are committed as
  // JSONC with a provenance header and served as plain JSON.
  const tides2SourcePath = join(DATA_DIR, "tides2.jsonc");
  const tides2JsonPath = join(publicDir, "tides2-data.json");
  if (existsSync(tides2SourcePath)) {
    const tides2Jsonc = readFileSync(tides2SourcePath, "utf8");
    const served = JSON.stringify(JSON.parse(stripJsonComments(tides2Jsonc)));
    writeFileSync(tides2JsonPath, served + "\n");
    console.log("Copied tides2.jsonc to tides2-data.json (comments stripped)");
  } else {
    console.log(
      "No data/tides2.jsonc found; the `tides2` pool variant will be " +
        "unavailable until `npm run bake-tides2` is run.",
    );
  }
  // The committed `tides3` artifact (decks + per-Dreamcaller tide pools in one
  // file) the `tides3` pool variant combines into pools. Baked by
  // `npm run bake-tides3`, committed as JSONC with a provenance header.
  const tides3SourcePath = join(DATA_DIR, "tides3.jsonc");
  const tides3JsonPath = join(publicDir, "tides3-data.json");
  if (existsSync(tides3SourcePath)) {
    const tides3Jsonc = readFileSync(tides3SourcePath, "utf8");
    const served = JSON.stringify(JSON.parse(stripJsonComments(tides3Jsonc)));
    writeFileSync(tides3JsonPath, served + "\n");
    console.log("Copied tides3.jsonc to tides3-data.json (comments stripped)");
  } else {
    console.log(
      "No data/tides3.jsonc found; the `tides3` pool variant will be " +
        "unavailable until `npm run bake-tides3` is run.",
    );
  }

  // The committed `tides4` artifact (signature/facet/neutral tides + the
  // per-Dreamcaller tide pools in one file) the `tides4` pool variant combines
  // into pools. Baked by `npm run bake-tides4`, committed as JSONC with a
  // provenance header.
  const tides4SourcePath = join(DATA_DIR, "tides4.jsonc");
  const tides4JsonPath = join(publicDir, "tides4-data.json");
  if (existsSync(tides4SourcePath)) {
    const tides4Jsonc = readFileSync(tides4SourcePath, "utf8");
    const served = JSON.stringify(JSON.parse(stripJsonComments(tides4Jsonc)));
    writeFileSync(tides4JsonPath, served + "\n");
    console.log("Copied tides4.jsonc to tides4-data.json (comments stripped)");
  } else {
    console.log(
      "No data/tides4.jsonc found; the `tides4` pool variant will be " +
        "unavailable until `npm run bake-tides4` is run.",
    );
  }

  // The committed `tides5` artifact — the same kind of signature/facet/neutral
  // tides + per-Dreamcaller tide pools as `tides4`, but baked only from the
  // known-good decklists. Baked by `npm run bake-tides5`, committed as JSONC with
  // a provenance header.
  const tides5SourcePath = join(DATA_DIR, "tides5.jsonc");
  const tides5JsonPath = join(publicDir, "tides5-data.json");
  if (existsSync(tides5SourcePath)) {
    const tides5Jsonc = readFileSync(tides5SourcePath, "utf8");
    const served = JSON.stringify(JSON.parse(stripJsonComments(tides5Jsonc)));
    writeFileSync(tides5JsonPath, served + "\n");
    console.log("Copied tides5.jsonc to tides5-data.json (comments stripped)");
  } else {
    console.log(
      "No data/tides5.jsonc found; the `tides5` pool variant will be " +
        "unavailable until `npm run bake-tides5` is run.",
    );
  }

  const tides2RelSourcePath = join(DATA_DIR, "tides2_relationships.jsonc");
  const tides2RelJsonPath = join(publicDir, "tides2-relationships-data.json");
  if (existsSync(tides2RelSourcePath)) {
    const tides2RelJsonc = readFileSync(tides2RelSourcePath, "utf8");
    const served = JSON.stringify(JSON.parse(stripJsonComments(tides2RelJsonc)));
    writeFileSync(tides2RelJsonPath, served + "\n");
    console.log(
      "Copied tides2_relationships.jsonc to tides2-relationships-data.json (comments stripped)",
    );
  } else {
    console.log(
      "No data/tides2_relationships.jsonc found; the `tides2` pool variant will " +
        "be unavailable until `npm run seed-tide-relationships` is run.",
    );
  }

  // The v2 Dreamcaller identities (`dreamcallers_v2.toml`) drive the standalone
  // draft test harness. They carry a kebab->camel normalization and a
  // `signature-cards` list that steers the standard `idf3` pool variant. The
  // `draft-archetypes` the non-`idf3` variants seed from live in TypeScript
  // ({@link DREAMCALLER_ARCHETYPES}) and are merged in below.
  console.log("Parsing dreamcallers_v2.toml...");
  const dreamcallerV2TomlContent = readFileSync(dreamcallerV2TomlPath, "utf8");
  const parsedDreamcallersV2 = parse(dreamcallerV2TomlContent);
  const allDreamcallersV2 = parsedDreamcallersV2.dreamcaller;

  if (!Array.isArray(allDreamcallersV2)) {
    throw new Error("Expected [[dreamcaller]] array in dreamcallers_v2.toml");
  }

  // Signatures are authored as stable card-id UUIDs (`docs/cards2/
  // idf3_signature_design.md`). Resolve them to the current card names here so
  // the runtime bundle and the name-based pool engine see names, and so a
  // dangling signature UUID fails the build. Renaming a card in cards_v2.toml
  // therefore needs no edit to dreamcallers_v2.toml. The resolved UUIDs are also
  // emitted as `signatureCardIds` (index-aligned with `signatureCards`) so
  // consumers that must distinguish two cards sharing a name can key on the id.
  const jsonDreamcallersV2 = allDreamcallersV2.map((dreamcaller) => {
    const archetypes = DREAMCALLER_ARCHETYPES[dreamcaller.name];
    if (archetypes) dreamcaller["draft-archetypes"] = archetypes;
    const transformed = transformDreamcaller(dreamcaller);
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
    dreamcallerV2JsonPath,
    JSON.stringify(jsonDreamcallersV2, null, 2) + "\n",
  );
  console.log(
    `Wrote ${jsonDreamcallersV2.length} dreamcallers to dreamcallers-v2-data.json`,
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
  writeFileSync(dreamwellJsonPath, JSON.stringify(jsonDreamwell, null, 2) + "\n");
  console.log(`Wrote ${jsonDreamwell.length} dreamwell cards to dreamwell-data.json`);
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

  // Dreamsign profiles: parse the curated TOML and write the kebab->camel JSON
  // the runtime loader fetches.
  console.log("Parsing dreamsign_profiles.toml...");
  const dreamsignProfilesTomlContent = readFileSync(dreamsignProfilesTomlPath, "utf8");
  const parsedDreamsignProfiles = parse(dreamsignProfilesTomlContent);
  const allDreamsignProfiles = parsedDreamsignProfiles.dreamsigns;

  if (!Array.isArray(allDreamsignProfiles)) {
    throw new Error("Expected [[dreamsigns]] array in dreamsign_profiles.toml");
  }

  const jsonDreamsignProfiles = allDreamsignProfiles.map(transformDreamsignProfile);
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
  const dreamsignSignaturesTomlContent = readFileSync(dreamsignSignaturesTomlPath, "utf8");
  const parsedDreamsignSignatures = parse(dreamsignSignaturesTomlContent);
  const allDreamsignSignatures = parsedDreamsignSignatures.dreamsigns;

  if (!Array.isArray(allDreamsignSignatures)) {
    throw new Error("Expected [[dreamsigns]] array in dreamsign_signatures.toml");
  }

  const jsonDreamsignSignatures = allDreamsignSignatures.map(transformDreamsignProfile);
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

  // Dreamscapes: the themed Dream Atlas regions. Parse the TOML and write the
  // kebab->camel JSON the runtime loader fetches at /dreamscapes-data.json.
  console.log("Parsing dreamscapes.toml...");
  const dreamscapesTomlContent = readFileSync(dreamscapesTomlPath, "utf8");
  const parsedDreamscapes = parse(dreamscapesTomlContent);
  const allDreamscapes = parsedDreamscapes.dreamscapes;

  if (!Array.isArray(allDreamscapes)) {
    throw new Error("Expected [[dreamscapes]] array in dreamscapes.toml");
  }

  const jsonDreamscapes = allDreamscapes.map(transformDreamscape);
  // Enforce the resident-Dreamcaller invariant: non-starter dreamscapes
  // partition dreamcallers_v2.toml into 3-4 per region with no Dreamcaller in
  // two regions. `jsonDreamcallersV2` was parsed above, so its ids are the
  // authoritative set checked against.
  const dreamcallerCounts = validateDreamcallerMapping(
    jsonDreamscapes,
    jsonDreamcallersV2.map((dreamcaller) => dreamcaller.id),
  );
  for (const scape of jsonDreamscapes) {
    if (scape.isStarter) continue;
    console.log(
      `  ${scape.id}: ${String(dreamcallerCounts[scape.id])} dreamcallers` +
        ` -> ${scape.dreamcallerIds.join(", ")}`,
    );
  }
  writeFileSync(
    dreamscapesJsonPath,
    JSON.stringify(jsonDreamscapes, null, 2) + "\n",
  );
  console.log(`Wrote ${jsonDreamscapes.length} dreamscapes to dreamscapes-data.json`);

  // Dream Guides: the resident character of each non-starter dreamscape. Parse
  // the TOML and write the kebab->camel JSON fetched at /dream-guides-data.json.
  console.log("Parsing dream_guides.toml...");
  const dreamGuidesTomlContent = readFileSync(dreamGuidesTomlPath, "utf8");
  const parsedDreamGuides = parse(dreamGuidesTomlContent);
  const allDreamGuides = parsedDreamGuides.guides;

  if (!Array.isArray(allDreamGuides)) {
    throw new Error("Expected [[guides]] array in dream_guides.toml");
  }

  const jsonDreamGuides = allDreamGuides.map(transformGuide);
  writeFileSync(
    dreamGuidesJsonPath,
    JSON.stringify(jsonDreamGuides, null, 2) + "\n",
  );
  console.log(`Wrote ${jsonDreamGuides.length} dream guides to dream-guides-data.json`);

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
  console.log(`Wrote ${jsonAffiliations.length} affiliations to affiliations-data.json`);

  // Atlas generation tuning: a single TOML table written as the kebab->camel
  // JSON the runtime loader fetches at /atlas-config-data.json.
  console.log("Parsing atlas_config.toml...");
  const atlasConfigTomlContent = readFileSync(atlasConfigTomlPath, "utf8");
  const parsedAtlasConfig = parse(atlasConfigTomlContent);
  const jsonAtlasConfig = transformAtlasConfig(parsedAtlasConfig);
  writeFileSync(
    atlasConfigJsonPath,
    JSON.stringify(jsonAtlasConfig, null, 2) + "\n",
  );
  console.log("Wrote atlas config to atlas-config-data.json");

  // Apollyon incarnations: the final Dreamcaller's ten guises. Parse the TOML
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

  console.log(`Linked ${linked} of ${jsonCards.length} card images (${missing} missing)`);

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

  recreateDir(dreamcallersDir);
  let linkedDreamcallerArt = 0;
  let missingDreamcallerArt = 0;

  // Link portraits for the v2 draft-test Dreamcallers, keyed by image number so
  // a portrait shared between several Dreamcallers is linked once.
  const dreamcallerArtByImageNumber = new Map();
  for (const dreamcaller of jsonDreamcallersV2) {
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

  // Link the transparent full-body cutouts (`cutout/<imageNumber>.png` in the
  // art source dir) to `public/dreamcallers/cutout/`. These are the character
  // renders with the scene background removed, used wherever the Dreamcaller
  // stands directly on UI chrome (Dreamcaller selection, portraits). Same
  // warn-and-continue policy as the scene portraits above.
  const dreamcallerCutoutSourceDir = join(dreamcallerArtDir, "cutout");
  const dreamcallerCutoutsDir = join(dreamcallersDir, "cutout");
  mkdirSync(dreamcallerCutoutsDir, { recursive: true });
  let linkedDreamcallerCutouts = 0;
  let missingDreamcallerCutouts = 0;
  for (const [imageNumber, name] of dreamcallerArtByImageNumber) {
    const filename = `${imageNumber}.png`;
    const sourcePath = join(dreamcallerCutoutSourceDir, filename);
    const symlinkPath = join(dreamcallerCutoutsDir, filename);

    if (existsSync(sourcePath)) {
      symlinkSync(sourcePath, symlinkPath);
      linkedDreamcallerCutouts++;
    } else {
      console.warn(
        `  Warning: missing dreamcaller cutout for ${name} (${imageNumber})`,
      );
      missingDreamcallerCutouts++;
    }
  }
  console.log(
    `Linked ${linkedDreamcallerCutouts} of ${dreamcallerArtByImageNumber.size} dreamcaller cutouts (${missingDreamcallerCutouts} missing)`,
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

  // Dream Atlas art. Each dreamscape's rectangular scene
  // (`<id>.png`, the hover-card art) and circular node icon (`<id>_icon.png`)
  // are symlinked into `public/dreamscapes/<id>.png` and
  // `public/dreamscape-icons/<id>.png` so the atlas resolves both directly from
  // a node's dreamscape id. The Layer-VII final dream (Limbo / Apollyon) is
  // linked under the fixed `limbo` / `apollyon` keys the atlas reads. Missing
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
  // The final-dream (Limbo) scene + node icon, keyed `limbo` for the atlas.
  linkDreamscapeImage(dreamscapeSceneArtDir, BOSS_SCENE_SOURCE, dreamscapesArtDir, "limbo.png");
  linkDreamscapeImage(dreamscapeIconArtDir, BOSS_ICON_SOURCE, dreamscapeIconsDir, "limbo.png");
  console.log(
    `Linked ${linkedDreamscapeArt} dreamscape scene/icon images (${missingDreamscapeArt} missing)`,
  );

  // Dream Guide character renders, one per guide keyed by guide id, plus the
  // boss figure Apollyon under the fixed `apollyon` key.
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
  for (const [guideId, sourceFile] of Object.entries(GUIDE_PORTRAIT_SOURCE_BY_ID)) {
    linkGuidePortrait(sourceFile, `${guideId}.png`);
  }
  linkGuidePortrait(BOSS_FIGURE_SOURCE, "apollyon.png");
  console.log(
    `Linked ${linkedGuideArt} dream guide portraits (${missingGuideArt} missing)`,
  );

  // The ornate round frame used for unrevealed atlas nodes.
  recreateDir(atlasArtDir);
  const roundFrameSource = join(dreamscapeIconArtDir, ROUND_FRAME_SOURCE);
  if (existsSync(roundFrameSource)) {
    symlinkSync(roundFrameSource, join(atlasArtDir, ROUND_FRAME_SOURCE));
    console.log("Linked atlas round frame image");
  } else {
    console.warn(`  Warning: missing atlas round frame ${roundFrameSource}`);
  }

  console.log("Asset setup complete.");
}

if (process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href) {
  setupAssets();
}
