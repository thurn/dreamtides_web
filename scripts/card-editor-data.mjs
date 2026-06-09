import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import {
  DEFAULT_DRAFT_RECORDS_DIR,
  readCardPopularity,
} from "./lib/card-popularity.mjs";
import { BANE_NAMES, transformCard } from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_CARD_TOML_PATH = join("data", "tabula", "rendered-cards.toml");
const CARD_JSON_PATH = join("public", "card-data.json");

export const EDITABLE_CARD_FIELDS = new Set([
  "energy-cost",
  "subtype",
  "name",
  "spark",
  "rendered-text",
  "tags",
  "tides",
  "art",
  "image-number",
]);

/**
 * A "facet" is a card-level taxonomy stored as an inline string array on each
 * card and backed by a registry sidecar that pairs each name with a display
 * color. Tags and tides are the two facets; they share every code path, differing
 * only in the card field they live on, the registry sidecar suffix, and labels.
 * The registry sidecar reuses the card field name as its `[[field]]` array key.
 */
export const TAG_FACET = {
  field: "tags",
  registrySuffix: ".tags.toml",
  noun: "tag",
  Noun: "Tag",
};
export const TIDE_FACET = {
  field: "tides",
  registrySuffix: ".tides.toml",
  noun: "tide",
  Noun: "Tide",
};

/**
 * Default art crop applied to cards that have no authored `art` table. Mirrors
 * `DEFAULT_ART_CROP` in `src/components/CardView.tsx`; the art-edit mode seeds
 * its controls from here when a card has not been cropped yet.
 */
export const DEFAULT_ART_CROP = { x: 0, y: 0, scale: 1.17 };

// Art crop bounds. `x`/`y` are normalized pan positions in -1..1 (0 = centered,
// ±1 = panned to the image edge); `scale` is the cover zoom (1 keeps the image
// at cover size, never smaller, so the frame stays fully covered). The pan is
// resolved against the source image's aspect ratio at render time, so the
// stored value is independent of image dimensions.
const ART_OFFSET_MIN = -1;
const ART_OFFSET_MAX = 1;
const ART_SCALE_MIN = 1;
const ART_SCALE_MAX = 5;

// Distinct, readable swatch colors handed out to tags that do not yet have an
// explicit color in the registry sidecar. A tag's default is chosen
// deterministically from its name so the same tag always seeds to the same
// color across loads and across the client and server.
export const DEFAULT_TAG_COLORS = [
  "#c2410c",
  "#15803d",
  "#1d4ed8",
  "#7c3aed",
  "#b91c1c",
  "#0f766e",
  "#a16207",
  "#be185d",
  "#4338ca",
  "#3f6212",
  "#0e7490",
  "#9333ea",
];

const TAG_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/u;

function tagNameHash(name) {
  // FNV-1a over the tag name keeps default-color assignment stable and
  // platform-independent.
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function defaultTagColor(name) {
  const index = tagNameHash(name) % DEFAULT_TAG_COLORS.length;
  return DEFAULT_TAG_COLORS[index];
}

// A facet registry lives in a sidecar TOML next to the card file it annotates:
// `data/tabula/cards_v2.toml` -> `data/tabula/cards_v2.tags.toml` (tags) or
// `data/tabula/cards_v2.tides.toml` (tides).
function facetRegistryPathFor(cardTomlPath, facet) {
  return cardTomlPath.replace(/\.toml$/iu, facet.registrySuffix);
}

export function tagRegistryPathFor(cardTomlPath) {
  return facetRegistryPathFor(cardTomlPath, TAG_FACET);
}

export function tideRegistryPathFor(cardTomlPath) {
  return facetRegistryPathFor(cardTomlPath, TIDE_FACET);
}

function readSourceCards(rootDir, cardTomlPath = DEFAULT_CARD_TOML_PATH) {
  const absoluteTomlPath = join(rootDir, cardTomlPath);
  const parsed = parse(readFileSync(absoluteTomlPath, "utf8"));
  const cards = parsed.cards;

  if (!Array.isArray(cards)) {
    throw new Error(`Expected [[cards]] array in ${cardTomlPath}`);
  }

  return cards;
}

function editorRecordFromCard(card, popularityCounts) {
  return {
    id: card.id,
    cardNumber: card["card-number"],
    cardType: card["card-type"],
    rarity: card.rarity,
    "energy-cost": card["energy-cost"],
    subtype: card.subtype ?? "",
    name: card.name,
    spark: card.spark ?? "",
    "rendered-text": card["rendered-text"] ?? "",
    tags: normalizeTagList(card.tags),
    tides: normalizeTagList(card.tides),
    mtgName: typeof card["mtg-name"] === "string" ? card["mtg-name"] : "",
    // Mainboard appearances of this card's UUID across the adapted draft record
    // corpus; 0 for a card no drafted deck has ever run.
    popularity: popularityCounts.get(card.id) ?? 0,
    source: card,
    preview: transformCard(card),
  };
}

function normalizeTagList(rawTags) {
  if (!Array.isArray(rawTags)) {
    return [];
  }

  const tags = [];
  for (const entry of rawTags) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed !== "" && !tags.includes(trimmed)) {
      tags.push(trimmed);
    }
  }
  return tags;
}

export function readEditorCards({
  rootDir = ROOT,
  cardTomlPath = DEFAULT_CARD_TOML_PATH,
  draftRecordsDir = DEFAULT_DRAFT_RECORDS_DIR,
} = {}) {
  // Popularity is keyed by the card's stable UUID, which is shared across every
  // source TOML, so the same corpus tally applies regardless of cardTomlPath.
  const popularityCounts = readCardPopularity(join(rootDir, draftRecordsDir));
  // The editor does not display Special-rarity records: the only two are the
  // "Void Indicator Card" placeholder and the "Nightmare" bane, neither of
  // which is meaningful to edit through the card editor.
  return readSourceCards(rootDir, cardTomlPath)
    .filter((card) => card.rarity !== "Special")
    .map((card) => editorRecordFromCard(card, popularityCounts));
}

function validationFailure(field, message, value) {
  return {
    ok: false,
    field,
    value,
    message,
  };
}

function validationSuccess(field, value) {
  return {
    ok: true,
    field,
    value,
  };
}

function validateNonNegativeIntegerOrVariable(
  field,
  rawValue,
  { allowBlank, allowMultiple = false },
) {
  if (typeof rawValue !== "number" && typeof rawValue !== "string") {
    return validationFailure(field, "Enter a non-negative whole number or X.", rawValue);
  }

  const value = typeof rawValue === "number" ? rawValue : rawValue.trim();

  if (allowBlank && value === "") {
    return validationSuccess(field, "");
  }

  // Multi-cost: comma-separated segments such as "2,X". Each segment is a
  // non-negative integer or the variable marker X, canonicalized to "2,X".
  if (allowMultiple && typeof value === "string" && value.includes(",")) {
    const segments = value.split(",").map((segment) => segment.trim());
    if (segments.length < 2 || segments.some((segment) => segment === "")) {
      return validationFailure(field, "Enter costs separated by commas, e.g. 2,X.", rawValue);
    }
    const canonical = [];
    for (const segment of segments) {
      if (segment === "X" || segment === "x" || segment === "*") {
        canonical.push("X");
      } else if (/^\d+$/u.test(segment)) {
        canonical.push(segment);
      } else {
        return validationFailure(
          field,
          "Each cost must be a non-negative whole number or X.",
          rawValue,
        );
      }
    }
    return validationSuccess(field, canonical.join(","));
  }

  if (typeof value === "string" && (value === "X" || value === "*")) {
    return validationSuccess(field, "*");
  }

  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 0) {
      return validationSuccess(field, value);
    }
    return validationFailure(field, "Enter a non-negative whole number.", rawValue);
  }

  if (/^\d+$/u.test(value)) {
    return validationSuccess(field, Number(value));
  }

  return validationFailure(field, "Enter a non-negative whole number or X.", rawValue);
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function validateArtCrop(field, rawValue) {
  if (rawValue === null || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return validationFailure(field, "Art must be an object with x, y, and scale.", rawValue);
  }

  const { x, y, scale } = rawValue;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof scale !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(scale)
  ) {
    return validationFailure(field, "Art x, y, and scale must be numbers.", rawValue);
  }

  return validationSuccess(field, {
    x: roundTo(clampNumber(x, ART_OFFSET_MIN, ART_OFFSET_MAX), 3),
    y: roundTo(clampNumber(y, ART_OFFSET_MIN, ART_OFFSET_MAX), 3),
    scale: roundTo(clampNumber(scale, ART_SCALE_MIN, ART_SCALE_MAX), 2),
  });
}

function validateImageNumber(field, rawValue) {
  // The image number selects the art file rendered for the card (resolved to
  // `/cards/<number>.webp`), so it must be a non-negative whole number. A
  // numeric string is accepted so a value typed into the editor's text input
  // round-trips without the client having to coerce it first.
  if (typeof rawValue === "number") {
    if (Number.isInteger(rawValue) && rawValue >= 0) {
      return validationSuccess(field, rawValue);
    }
    return validationFailure(field, "Image number must be a non-negative whole number.", rawValue);
  }

  if (typeof rawValue === "string" && /^\d+$/u.test(rawValue.trim())) {
    return validationSuccess(field, Number(rawValue.trim()));
  }

  return validationFailure(field, "Image number must be a non-negative whole number.", rawValue);
}

export function validateCardEdit(field, rawValue) {
  if (!EDITABLE_CARD_FIELDS.has(field)) {
    return validationFailure(field, "This field is not editable.", rawValue);
  }

  if (field === "art") {
    return validateArtCrop(field, rawValue);
  }

  if (field === "image-number") {
    return validateImageNumber(field, rawValue);
  }

  if (field === "energy-cost") {
    return validateNonNegativeIntegerOrVariable(field, rawValue, {
      allowBlank: false,
      allowMultiple: true,
    });
  }

  if (field === "spark") {
    return validateNonNegativeIntegerOrVariable(field, rawValue, { allowBlank: true });
  }

  if (field === "name") {
    if (typeof rawValue !== "string") {
      return validationFailure(field, "Name must be text.", rawValue);
    }

    const value = rawValue.trim();
    if (value.length === 0) {
      return validationFailure(field, "Name cannot be blank.", rawValue);
    }
    return validationSuccess(field, value);
  }

  if (field === "subtype") {
    if (typeof rawValue !== "string") {
      return validationFailure(field, "Subtype must be text.", rawValue);
    }

    return validationSuccess(field, rawValue);
  }

  if (field === "rendered-text") {
    if (typeof rawValue !== "string") {
      return validationFailure(field, "Rules text must be text.", rawValue);
    }

    return validationSuccess(field, rawValue);
  }

  if (field === "tags" || field === "tides") {
    const noun = field === "tides" ? "tide" : "tag";
    const Noun = field === "tides" ? "Tides" : "Tags";
    if (!Array.isArray(rawValue)) {
      return validationFailure(field, `${Noun} must be a list.`, rawValue);
    }

    const values = [];
    for (const entry of rawValue) {
      if (typeof entry !== "string") {
        return validationFailure(field, `Each ${noun} must be text.`, rawValue);
      }
      const trimmed = entry.trim();
      if (trimmed === "") {
        return validationFailure(field, `${Noun} cannot be blank.`, rawValue);
      }
      if (!values.includes(trimmed)) {
        values.push(trimmed);
      }
    }

    return validationSuccess(field, values);
  }

  return validationFailure(field, "This field is not editable.", rawValue);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function lineEndIndex(text, start) {
  const newlineIndex = text.indexOf("\n", start);
  return newlineIndex === -1 ? text.length : newlineIndex + 1;
}

function isEscapedByBackslash(text, index) {
  let backslashCount = 0;
  let cursor = index - 1;

  while (cursor >= 0 && text[cursor] === "\\") {
    backslashCount += 1;
    cursor -= 1;
  }

  return backslashCount % 2 === 1;
}

function multilineDelimiterCloseIndex(text, delimiter, start) {
  if (delimiter === "'''") {
    return text.indexOf(delimiter, start);
  }

  let index = start;
  while (index < text.length) {
    const closeIndex = text.indexOf(delimiter, index);
    if (closeIndex === -1) {
      return -1;
    }

    if (!isEscapedByBackslash(text, closeIndex)) {
      return closeIndex;
    }

    index = closeIndex + 1;
  }

  return -1;
}

function toggledMultilineDelimiter(text, activeDelimiter) {
  let index = 0;

  while (index < text.length) {
    if (activeDelimiter !== null) {
      const closeIndex = multilineDelimiterCloseIndex(text, activeDelimiter, index);
      if (closeIndex === -1) {
        return activeDelimiter;
      }

      activeDelimiter = null;
      index = closeIndex + 3;
      continue;
    }

    if (text.startsWith('"""', index)) {
      activeDelimiter = '"""';
      index += 3;
      continue;
    }

    if (text.startsWith("'''", index)) {
      activeDelimiter = "'''";
      index += 3;
      continue;
    }

    if (text[index] === "#") {
      return activeDelimiter;
    }

    if (text[index] === '"') {
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
        } else if (text[index] === '"') {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }
      continue;
    }

    if (text[index] === "'") {
      index += 1;
      while (index < text.length && text[index] !== "'") {
        index += 1;
      }
      if (index < text.length) {
        index += 1;
      }
      continue;
    }

    index += 1;
  }

  return activeDelimiter;
}

function isTopLevelTableHeaderLine(line) {
  return /^\s*(?:\[[^\[\]]+\]|\[\[[^\[\]]+\]\])\s*(?:#.*)?$/u.test(line.trimEnd());
}

function cardBlocks(source) {
  const blocks = [];
  let currentStart = null;
  let offset = 0;
  let activeMultilineDelimiter = null;

  while (offset < source.length) {
    const end = lineEndIndex(source, offset);
    const line = source.slice(offset, end);
    const isTopLevelHeader =
      activeMultilineDelimiter === null && isTopLevelTableHeaderLine(line);

    if (isTopLevelHeader) {
      if (currentStart !== null) {
        blocks.push({
          start: currentStart,
          end: offset,
          text: source.slice(currentStart, offset),
        });
        currentStart = null;
      }

      if (/^\s*\[\[cards\]\]\s*(?:#.*)?$/u.test(line.trimEnd())) {
        currentStart = offset;
      }
    }

    activeMultilineDelimiter = toggledMultilineDelimiter(line, activeMultilineDelimiter);
    offset = end;
  }

  if (currentStart !== null) {
    blocks.push({
      start: currentStart,
      end: source.length,
      text: source.slice(currentStart),
    });
  }

  return blocks;
}

function topLevelFieldOffset(blockText, field) {
  const fieldPattern = new RegExp(`^\\s*${escapeRegExp(field)}\\s*=`, "u");
  let offset = 0;
  let activeMultilineDelimiter = null;

  while (offset < blockText.length) {
    const end = lineEndIndex(blockText, offset);
    const line = blockText.slice(offset, end);

    if (activeMultilineDelimiter === null && fieldPattern.test(line)) {
      return offset;
    }

    activeMultilineDelimiter = toggledMultilineDelimiter(line, activeMultilineDelimiter);

    offset = end;
  }

  return -1;
}

function topLevelFieldLine(blockText, field) {
  const start = topLevelFieldOffset(blockText, field);
  if (start === -1) {
    return null;
  }

  return blockText.slice(start, lineEndIndex(blockText, start));
}

function findCardBlock(source, cardId) {
  const idPattern = new RegExp(`^\\s*id\\s*=\\s*"${escapeRegExp(cardId)}"\\s*(?:#.*)?$`, "u");

  return cardBlocks(source).find((block) => {
    const idLine = topLevelFieldLine(block.text, "id");
    return idLine !== null && idPattern.test(idLine.trimEnd());
  });
}

function firstMultilineDelimiter(text) {
  let index = 0;

  while (index < text.length) {
    if (text.startsWith('"""', index)) {
      return { delimiter: '"""', index };
    }

    if (text.startsWith("'''", index)) {
      return { delimiter: "'''", index };
    }

    if (text[index] === "#") {
      return null;
    }

    if (text[index] === '"') {
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
        } else if (text[index] === '"') {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }
      continue;
    }

    if (text[index] === "'") {
      index += 1;
      while (index < text.length && text[index] !== "'") {
        index += 1;
      }
      if (index < text.length) {
        index += 1;
      }
      continue;
    }

    index += 1;
  }

  return null;
}

function fieldRangeInBlock(block, field) {
  const start = topLevelFieldOffset(block.text, field);

  if (start === -1) {
    throw new Error(`Field ${field} was not found in target card block`);
  }

  const firstLineEnd = lineEndIndex(block.text, start);
  const firstLine = block.text.slice(start, firstLineEnd);
  const multilineStart = firstMultilineDelimiter(firstLine);

  if (multilineStart === null) {
    return {
      start: block.start + start,
      end: block.start + firstLineEnd,
    };
  }

  const valueStart = start + multilineStart.index + multilineStart.delimiter.length;
  const valueEnd = multilineDelimiterCloseIndex(block.text, multilineStart.delimiter, valueStart);

  if (valueEnd === -1) {
    throw new Error(`Field ${field} has an unterminated multiline string`);
  }

  return {
    start: block.start + start,
    end: block.start + lineEndIndex(block.text, valueEnd + 3),
  };
}

function tomlString(value) {
  return JSON.stringify(value).replace(/\u007f/gu, "\\u007F");
}

function tomlMultilineString(value) {
  return `'''\n${value}'''`;
}

function hasUnsafeLiteralStringControl(value) {
  return /[\u0000-\u0009\u000B-\u001F\u007F]/u.test(value);
}

function tomlInlineStringArray(values) {
  if (values.length === 0) {
    return "[]";
  }

  return `[${values.map((entry) => tomlString(String(entry))).join(", ")}]`;
}

function tomlInlineTable(value) {
  const parts = Object.entries(value).map(
    ([key, entry]) => `${key} = ${tomlValue(entry)}`,
  );
  return `{ ${parts.join(", ")} }`;
}

function tomlValue(value) {
  if (Array.isArray(value)) {
    return tomlInlineStringArray(value);
  }

  if (value !== null && typeof value === "object") {
    return tomlInlineTable(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const stringValue = String(value);
  if (stringValue.includes("\n")) {
    if (stringValue.includes("'''") || hasUnsafeLiteralStringControl(stringValue)) {
      return tomlString(stringValue);
    }

    return tomlMultilineString(stringValue);
  }

  return tomlString(stringValue);
}

export function patchRenderedCardsToml(source, { cardId, field, value }) {
  if (!EDITABLE_CARD_FIELDS.has(field)) {
    throw new Error(`Field ${field} is not editable`);
  }

  const validation = validateCardEdit(field, value);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const block = findCardBlock(source, cardId);
  if (block === undefined) {
    throw new Error(`Card ${cardId} was not found`);
  }

  let patchedSource;
  if (field === "art" && topLevelFieldOffset(block.text, field) === -1) {
    // The art crop is optional and absent on cards that have never been
    // cropped, so add it to the card block. Every other field already exists on
    // every card; a missing one signals a malformed record and still throws via
    // fieldRangeInBlock below.
    const insertAt = block.start + blockContentInsertOffset(block.text);
    const needsLeadingNewline = insertAt > 0 && source[insertAt - 1] !== "\n";
    const insertion = `${needsLeadingNewline ? "\n" : ""}${field} = ${tomlValue(validation.value)}\n`;
    patchedSource = source.slice(0, insertAt) + insertion + source.slice(insertAt);
  } else {
    const range = fieldRangeInBlock(block, field);
    const existing = source.slice(range.start, range.end);
    const lineEnding = existing.endsWith("\n") ? "\n" : "";
    const replacement = `${field} = ${tomlValue(validation.value)}${lineEnding}`;
    patchedSource = source.slice(0, range.start) + replacement + source.slice(range.end);
  }

  parse(patchedSource);

  return {
    source: patchedSource,
  };
}

/**
 * Offset within a card block at which to append a brand-new field: immediately
 * after the block's last non-blank line, so the field joins the card's existing
 * keys instead of landing in the blank gap before the next `[[cards]]` entry.
 */
function blockContentInsertOffset(blockText) {
  const contentEnd = blockText.replace(/\s+$/u, "").length;
  if (contentEnd === 0) {
    return blockText.length;
  }
  const newlineIndex = blockText.indexOf("\n", contentEnd);
  return newlineIndex === -1 ? blockText.length : newlineIndex + 1;
}

export function refreshCardDataJson({ rootDir = ROOT, cardTomlPath = DEFAULT_CARD_TOML_PATH } = {}) {
  const cards = readSourceCards(rootDir, cardTomlPath)
    .filter((card) => card.rarity !== "Special" || BANE_NAMES.has(card.name))
    .map(transformCard);
  const cardJsonPath = join(rootDir, CARD_JSON_PATH);

  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(cardJsonPath, JSON.stringify(cards, null, 2) + "\n");

  return {
    count: cards.length,
    path: cardJsonPath,
  };
}

function usedFacetNames(rootDir, cardTomlPath, facet) {
  const used = [];
  for (const card of readSourceCards(rootDir, cardTomlPath)) {
    for (const value of normalizeTagList(card[facet.field])) {
      if (!used.includes(value)) {
        used.push(value);
      }
    }
  }
  return used;
}

/**
 * Read a facet registry sidecar for a card file. Entries explicitly defined in
 * the sidecar keep their authored order and colors. Any value that is in use on a
 * card but missing from the sidecar is appended (sorted by name) with a
 * deterministic default color so the editor always has a color for every value it
 * might render.
 */
export function readFacetRegistry({
  rootDir = ROOT,
  cardTomlPath = DEFAULT_CARD_TOML_PATH,
  facet = TAG_FACET,
} = {}) {
  const registryPath = join(rootDir, facetRegistryPathFor(cardTomlPath, facet));
  const tags = [];
  const seen = new Set();

  if (existsSync(registryPath)) {
    const parsed = parse(readFileSync(registryPath, "utf8"));
    const entries = Array.isArray(parsed[facet.field]) ? parsed[facet.field] : [];
    for (const entry of entries) {
      if (entry === null || typeof entry !== "object") {
        continue;
      }
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      if (name === "" || seen.has(name)) {
        continue;
      }
      const color =
        typeof entry.color === "string" && TAG_COLOR_PATTERN.test(entry.color.trim())
          ? entry.color.trim().toLowerCase()
          : defaultTagColor(name);
      seen.add(name);
      tags.push({ name, color });
    }
  }

  const unregistered = usedFacetNames(rootDir, cardTomlPath, facet)
    .filter((name) => !seen.has(name))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

  for (const name of unregistered) {
    tags.push({ name, color: defaultTagColor(name) });
  }

  return tags;
}

export function readTagRegistry({ rootDir = ROOT, cardTomlPath = DEFAULT_CARD_TOML_PATH } = {}) {
  return readFacetRegistry({ rootDir, cardTomlPath, facet: TAG_FACET });
}

export function readTideRegistry({ rootDir = ROOT, cardTomlPath = DEFAULT_CARD_TOML_PATH } = {}) {
  return readFacetRegistry({ rootDir, cardTomlPath, facet: TIDE_FACET });
}

export function validateTagRegistry(rawTags) {
  if (!Array.isArray(rawTags)) {
    return { ok: false, message: "Tag registry must be a list." };
  }

  const tags = [];
  const seen = new Set();
  for (const entry of rawTags) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, message: "Each tag must be an object with a name and color." };
    }

    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (name === "") {
      return { ok: false, message: "Tag names cannot be blank." };
    }
    if (seen.has(name)) {
      return { ok: false, message: `Duplicate tag name: ${name}.` };
    }

    const rawColor = typeof entry.color === "string" ? entry.color.trim() : "";
    if (!TAG_COLOR_PATTERN.test(rawColor)) {
      return { ok: false, message: `Tag "${name}" needs a #RRGGBB color.` };
    }

    seen.add(name);
    tags.push({ name, color: rawColor.toLowerCase() });
  }

  return { ok: true, tags };
}

export function serializeFacetRegistry(
  tags,
  { cardTomlBasename, facet = TAG_FACET } = {},
) {
  const headerTarget = cardTomlBasename ? ` for ${cardTomlBasename}` : "";
  const lines = [
    `# ${facet.Noun} registry${headerTarget}.`,
    `# Each [[${facet.field}]] entry defines an available card ${facet.noun} and its display color.`,
    `# Managed by the card editor's "Manage ${facet.noun}s" panel.`,
    "",
  ];

  for (const tag of tags) {
    lines.push(`[[${facet.field}]]`);
    lines.push(`name = ${tomlString(tag.name)}`);
    lines.push(`color = ${tomlString(tag.color)}`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function serializeTagRegistry(tags, { cardTomlBasename } = {}) {
  return serializeFacetRegistry(tags, { cardTomlBasename, facet: TAG_FACET });
}

export function serializeTideRegistry(tags, { cardTomlBasename } = {}) {
  return serializeFacetRegistry(tags, { cardTomlBasename, facet: TIDE_FACET });
}

/**
 * Remove the given names from the given facet field on every card that carries
 * them, returning the patched TOML source. Used when a value is deleted from the
 * registry so no card is left referencing a value the registry no longer defines.
 */
export function removeFacetValuesFromCards(source, removedNames, facet = TAG_FACET) {
  if (removedNames.length === 0) {
    return source;
  }

  const removed = new Set(removedNames);
  const parsed = parse(source);
  const cards = Array.isArray(parsed.cards) ? parsed.cards : [];

  let next = source;
  for (const card of cards) {
    const values = normalizeTagList(card[facet.field]);
    if (!values.some((value) => removed.has(value))) {
      continue;
    }
    const filtered = values.filter((value) => !removed.has(value));
    next = patchRenderedCardsToml(next, {
      cardId: card.id,
      field: facet.field,
      value: filtered,
    }).source;
  }

  return next;
}

export function removeTagsFromCards(source, removedNames) {
  return removeFacetValuesFromCards(source, removedNames, TAG_FACET);
}

export function removeTidesFromCards(source, removedNames) {
  return removeFacetValuesFromCards(source, removedNames, TIDE_FACET);
}
