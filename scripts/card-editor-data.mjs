import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { BANE_NAMES, transformCard } from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CARD_TOML_PATH = join("data", "tabula", "rendered-cards.toml");
const CARD_JSON_PATH = join("public", "card-data.json");

export const EDITABLE_CARD_FIELDS = new Set([
  "energy-cost",
  "subtype",
  "name",
  "spark",
  "rendered-text",
]);

function readSourceCards(rootDir) {
  const cardTomlPath = join(rootDir, CARD_TOML_PATH);
  const parsed = parse(readFileSync(cardTomlPath, "utf8"));
  const cards = parsed.cards;

  if (!Array.isArray(cards)) {
    throw new Error("Expected [[cards]] array in rendered-cards.toml");
  }

  return cards;
}

function editorRecordFromCard(card) {
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
    source: card,
    preview: transformCard(card),
  };
}

export function readEditorCards({ rootDir = ROOT } = {}) {
  return readSourceCards(rootDir).map(editorRecordFromCard);
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

function validateNonNegativeIntegerOrVariable(field, rawValue, { allowBlank }) {
  const value = typeof rawValue === "number" ? rawValue : String(rawValue).trim();

  if (allowBlank && value === "") {
    return validationSuccess(field, "");
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

export function validateCardEdit(field, rawValue) {
  if (!EDITABLE_CARD_FIELDS.has(field)) {
    return validationFailure(field, "This field is not editable.", rawValue);
  }

  if (field === "energy-cost") {
    return validateNonNegativeIntegerOrVariable(field, rawValue, { allowBlank: false });
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

    if (rawValue.includes('"""')) {
      return validationFailure(field, 'Rules text cannot contain """.', rawValue);
    }

    if (rawValue.includes("'''")) {
      return validationFailure(field, "Rules text cannot contain '''.", rawValue);
    }

    return validationSuccess(field, rawValue);
  }

  return validationFailure(field, "This field is not editable.", rawValue);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function cardBlocks(source) {
  const starts = [...source.matchAll(/^\[\[cards\]\]\s*$/gmu)].map((match) => match.index);

  return starts.map((start, index) => ({
    start,
    end: starts[index + 1] ?? source.length,
    text: source.slice(start, starts[index + 1] ?? source.length),
  }));
}

function lineEndIndex(text, start) {
  const newlineIndex = text.indexOf("\n", start);
  return newlineIndex === -1 ? text.length : newlineIndex + 1;
}

function tripleQuoteCount(text) {
  let count = 0;
  let nextSearchStart = 0;

  while (nextSearchStart < text.length) {
    const index = text.indexOf('"""', nextSearchStart);
    if (index === -1) {
      break;
    }

    count += 1;
    nextSearchStart = index + 3;
  }

  return count;
}

function topLevelFieldOffset(blockText, field) {
  const fieldPattern = new RegExp(`^\\s*${escapeRegExp(field)}\\s*=`, "u");
  let offset = 0;
  let inMultilineString = false;

  while (offset < blockText.length) {
    const end = lineEndIndex(blockText, offset);
    const line = blockText.slice(offset, end);

    if (!inMultilineString && fieldPattern.test(line)) {
      return offset;
    }

    const delimiterCount = tripleQuoteCount(line);
    if (delimiterCount % 2 === 1) {
      inMultilineString = !inMultilineString;
    }

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
  const idPattern = new RegExp(`^\\s*id\\s*=\\s*"${escapeRegExp(cardId)}"\\s*$`, "u");

  return cardBlocks(source).find((block) => {
    const idLine = topLevelFieldLine(block.text, "id");
    return idLine !== null && idPattern.test(idLine.trimEnd());
  });
}

function fieldRangeInBlock(block, field) {
  const start = topLevelFieldOffset(block.text, field);

  if (start === -1) {
    throw new Error(`Field ${field} was not found in target card block`);
  }

  const firstLineEnd = lineEndIndex(block.text, start);
  const firstLine = block.text.slice(start, firstLineEnd);
  const firstTripleQuote = firstLine.indexOf('"""');

  if (firstTripleQuote === -1) {
    return {
      start: block.start + start,
      end: block.start + firstLineEnd,
    };
  }

  const valueStart = start + firstTripleQuote + 3;
  const valueEnd = block.text.indexOf('"""', valueStart);

  if (valueEnd === -1) {
    throw new Error(`Field ${field} has an unterminated multiline string`);
  }

  return {
    start: block.start + start,
    end: block.start + lineEndIndex(block.text, valueEnd + 3),
  };
}

function tomlString(value) {
  return JSON.stringify(value);
}

function tomlMultilineString(value) {
  if (value.includes("'''")) {
    throw new Error("Multiline TOML strings cannot contain '''");
  }

  return `'''\n${value}'''`;
}

function tomlValue(value) {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const stringValue = String(value);
  if (stringValue.includes("\n")) {
    return tomlMultilineString(stringValue);
  }

  return tomlString(stringValue);
}

export function patchRenderedCardsToml(source, { cardId, field, value }) {
  if (!EDITABLE_CARD_FIELDS.has(field)) {
    throw new Error(`Field ${field} is not editable`);
  }

  const block = findCardBlock(source, cardId);
  if (block === undefined) {
    throw new Error(`Card ${cardId} was not found`);
  }

  const range = fieldRangeInBlock(block, field);
  const existing = source.slice(range.start, range.end);
  const lineEnding = existing.endsWith("\n") ? "\n" : "";
  const replacement = `${field} = ${tomlValue(value)}${lineEnding}`;
  const patchedSource = source.slice(0, range.start) + replacement + source.slice(range.end);

  parse(patchedSource);

  return {
    source: patchedSource,
  };
}

export function refreshCardDataJson({ rootDir = ROOT } = {}) {
  const cards = readSourceCards(rootDir)
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
