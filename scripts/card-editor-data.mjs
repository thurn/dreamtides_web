import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
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
]);

function readSourceCards(rootDir, cardTomlPath = DEFAULT_CARD_TOML_PATH) {
  const absoluteTomlPath = join(rootDir, cardTomlPath);
  const parsed = parse(readFileSync(absoluteTomlPath, "utf8"));
  const cards = parsed.cards;

  if (!Array.isArray(cards)) {
    throw new Error(`Expected [[cards]] array in ${cardTomlPath}`);
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

export function readEditorCards({ rootDir = ROOT, cardTomlPath = DEFAULT_CARD_TOML_PATH } = {}) {
  // The editor does not display Special-rarity records: the only two are the
  // "Void Indicator Card" placeholder and the "Nightmare" bane, neither of
  // which is meaningful to edit through the card editor.
  return readSourceCards(rootDir, cardTomlPath)
    .filter((card) => card.rarity !== "Special")
    .map(editorRecordFromCard);
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
  if (typeof rawValue !== "number" && typeof rawValue !== "string") {
    return validationFailure(field, "Enter a non-negative whole number or X.", rawValue);
  }

  const value = typeof rawValue === "number" ? rawValue : rawValue.trim();

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

    return validationSuccess(field, rawValue);
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

function tomlValue(value) {
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

  const range = fieldRangeInBlock(block, field);
  const existing = source.slice(range.start, range.end);
  const lineEnding = existing.endsWith("\n") ? "\n" : "";
  const replacement = `${field} = ${tomlValue(validation.value)}${lineEnding}`;
  const patchedSource = source.slice(0, range.start) + replacement + source.slice(range.end);

  parse(patchedSource);

  return {
    source: patchedSource,
  };
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
