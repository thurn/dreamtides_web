#!/usr/bin/env node

// Deliberately not part of CI: this audits the mutable production card catalog
// after an authored Amplified design pass. Stable behavior remains covered by
// synthetic tests.

import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import { amplifiedStructuralErrors } from "./lib/amplified-validation.mjs";

const cards = parse(readFileSync("data/cards.toml", "utf8")).cards;
const automationSource = readFileSync(
  "src/rules/battle/battle-card-effects-table.ts",
  "utf8",
);
const automatedIds = new Set(
  [...automationSource.matchAll(/^[ ]{2}"([0-9a-f-]{36})":/gmu)].map(
    (match) => match[1],
  ),
);

const errors = [];
const authored = [];
for (const card of cards) {
  const base = card["rendered-text"] ?? "";
  const amplified = card["amplified-text"];
  if (card.rarity === "Special" && amplified !== undefined) {
    errors.push(`${card.id}: Special-rarity card has amplified-text`);
  }
  if (amplified === undefined) continue;
  authored.push(card);
  if (amplified.trim() === "" || amplified === base) {
    errors.push(`${card.id}: amplified-text must be nonempty and changed`);
  }
  for (const error of amplifiedStructuralErrors(base, amplified)) {
    errors.push(`${card.id}: Amplified ${error}`);
  }
}

if (cards.filter((card) => card.rarity !== "Special").length !== 520) {
  errors.push("Expected exactly 520 non-Special runtime cards");
}

const automatedAuthored = authored.filter((card) => automatedIds.has(card.id));
console.log(
  JSON.stringify(
    {
      evaluated: 520,
      authored: authored.length,
      omitted: 520 - authored.length,
      automationIntersections: automatedAuthored.map((card) => card.id),
      errors,
    },
    null,
    2,
  ),
);
if (errors.length > 0) process.exitCode = 1;
