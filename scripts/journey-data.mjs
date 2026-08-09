import { createHash } from "node:crypto";

function fail(path, message) {
  throw new Error(`journey.toml ${path}: ${message}`);
}
function table(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(path, "expected a table");
  return value;
}
function keys(value, path, expected) {
  const source = table(value, path);
  for (const key of expected)
    if (!(key in source)) fail(path, `missing key ${key}`);
  for (const key of Object.keys(source))
    if (!expected.includes(key)) fail(`${path}.${key}`, "unknown key");
  return source;
}
function string(value, path) {
  if (typeof value !== "string" || value.trim() === "")
    fail(path, "expected a non-empty string");
  return value;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}
function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

export function compileJourneyData(sourceValue) {
  const root = keys(sourceValue, "root", ["schema-version", "presentation"]);
  if (root["schema-version"] !== 1)
    fail("schema-version", "only schema version 1 is supported");
  const presentation = keys(root.presentation, "presentation", [
    "start",
    "starting_deck",
    "dreamsign_replacement",
  ]);
  const start = keys(presentation.start, "presentation.start", [
    "title",
    "choose_action",
    "reroll_action",
  ]);
  const deck = keys(presentation.starting_deck, "presentation.starting_deck", [
    "title",
    "subtitle",
    "empty_state",
    "begin_action",
  ]);
  const replacement = keys(
    presentation.dreamsign_replacement,
    "presentation.dreamsign_replacement",
    ["title", "new_dreamsign_label", "replace_action", "keep_current_action"],
  );
  const payload = {
    schemaVersion: 1,
    presentation: {
      start: {
        title: string(start.title, "presentation.start.title"),
        chooseAction: string(
          start.choose_action,
          "presentation.start.choose_action",
        ),
        rerollAction: string(
          start.reroll_action,
          "presentation.start.reroll_action",
        ),
      },
      startingDeck: {
        title: string(deck.title, "presentation.starting_deck.title"),
        subtitle: string(deck.subtitle, "presentation.starting_deck.subtitle"),
        emptyState: string(
          deck.empty_state,
          "presentation.starting_deck.empty_state",
        ),
        beginAction: string(
          deck.begin_action,
          "presentation.starting_deck.begin_action",
        ),
      },
      dreamsignReplacement: {
        title: string(
          replacement.title,
          "presentation.dreamsign_replacement.title",
        ),
        newDreamsignLabel: string(
          replacement.new_dreamsign_label,
          "presentation.dreamsign_replacement.new_dreamsign_label",
        ),
        replaceAction: string(
          replacement.replace_action,
          "presentation.dreamsign_replacement.replace_action",
        ),
        keepCurrentAction: string(
          replacement.keep_current_action,
          "presentation.dreamsign_replacement.keep_current_action",
        ),
      },
    },
  };
  return { ...payload, contentHash: hash(payload) };
}
