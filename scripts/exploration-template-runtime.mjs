const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const PLACEHOLDER_PATTERN = /\{([a-z][a-z0-9_]*)\}/gu;
const SPECIAL_PATTERN = /\$[A-Z][A-Z0-9_]*/gu;
const LOW_COST_CARD_PATTERN = /^≤(\d+)● cost (Character|Event)$/u;
const SIMULATED_PLAYER_DECK_SIZE = 30;
const RUNTIME_CARD_PLACEHOLDERS = new Set([
  "$DECK_CARD",
  "$OFFERED_CARD",
  "$STARTER_CARD",
]);

function objectRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be nonblank text.`);
  }
  return value;
}

/** Parse the canonical Exploration effect-template catalog. */
export function parseEncounterTemplates(source) {
  let raw;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error("templates.json must contain valid JSON.");
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("templates.json must contain a non-empty array.");
  }
  const byId = new Map();
  raw.forEach((entryRaw, index) => {
    const entry = objectRecord(entryRaw, `templates[${String(index)}]`);
    if (!Number.isInteger(entry.template_id) || entry.template_id < 0) {
      throw new Error(
        `templates[${String(index)}].template_id must be a non-negative integer.`,
      );
    }
    const template = requiredString(
      entry.template,
      `templates[${String(index)}].template`,
    );
    if (byId.has(entry.template_id)) {
      throw new Error(
        `templates.json has duplicate template_id ${String(entry.template_id)}.`,
      );
    }
    byId.set(entry.template_id, template);
  });
  return { document: raw, byId };
}

function displayVariable(value, label) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return requiredString(value.display_name, `${label}.display_name`);
  }
  throw new Error(`${label} must be a JSON primitive or an entity reference.`);
}

function renderVariableParts(template, variables) {
  const values = objectRecord(variables, "variables");
  const parts = [];
  let cursor = 0;
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    if (match.index > cursor) {
      parts.push({ kind: "text", text: template.slice(cursor, match.index) });
    }
    const variableName = match[1];
    if (!Object.hasOwn(values, variableName)) {
      throw new Error(`variables is missing {${variableName}}.`);
    }
    const value = values[variableName];
    const text = displayVariable(value, `variables.${variableName}`);
    const entityKind = variableName === "card_id"
      ? "card"
      : variableName === "dreamsign_name"
        ? "dreamsign"
        : null;
    if (
      entityKind === null ||
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      parts.push({
        kind: "variable",
        placeholder: `{${variableName}}`,
        variableName,
        value,
        text,
      });
    } else {
      const id = requiredString(value.id, `variables.${variableName}.id`);
      if (!UUID_PATTERN.test(id)) {
        throw new Error(`variables.${variableName}.id must be a UUID.`);
      }
      parts.push(
        entityKind === "card"
          ? {
              kind: "card",
              placeholder: `{${variableName}}`,
              cardId: id,
              cardName: text,
            }
          : {
              kind: "dreamsign",
              placeholder: `{${variableName}}`,
              dreamsignId: id,
              dreamsignName: text,
            },
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) {
    parts.push({ kind: "text", text: template.slice(cursor) });
  }
  return parts;
}

function randomIndex(length, random) {
  if (length < 1) throw new Error("Cannot select from an empty card list.");
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("Exploration editor randomness must return a number in [0, 1).");
  }
  return Math.floor(value * length);
}

function shuffle(cards, random) {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, random);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

/** Build a representative player deck for resolving editor template previews. */
export function buildSimulatedPlayerDeck(cards, random) {
  const starterCards = cards.filter((card) => card.isStarter);
  const selectedStarters = starterCards.length <= SIMULATED_PLAYER_DECK_SIZE
    ? starterCards
    : shuffle(starterCards, random).slice(0, SIMULATED_PLAYER_DECK_SIZE);
  const remainingSlots = SIMULATED_PLAYER_DECK_SIZE - selectedStarters.length;
  if (remainingSlots <= 0) return selectedStarters;
  const draftedCards = shuffle(
    cards.filter((card) => card.isOfferable),
    random,
  ).slice(0, remainingSlots);
  return [...selectedStarters, ...draftedCards];
}

function matchesSelectionPredicate(card, predicate) {
  if (predicate === null) return true;
  const lowCost = LOW_COST_CARD_PATTERN.exec(predicate);
  if (lowCost !== null) {
    const maximumCost = Number(lowCost[1]);
    return card.cardType === lowCost[2] &&
      card.energyCost !== null &&
      card.energyCost <= maximumCost;
  }
  if (predicate === "Character" || predicate === "Event") {
    return card.cardType === predicate;
  }
  return card.subtype === predicate;
}

function runtimeCardSelection(
  placeholder,
  selection,
  cards,
  playerDeck,
  random,
) {
  const rule = selection?.[placeholder];
  const predicate = rule === undefined ? null : rule.predicate;
  let candidates;
  let source;
  if (placeholder === "$DECK_CARD") {
    candidates = playerDeck.filter((card) =>
      matchesSelectionPredicate(card, predicate));
    source = "player_deck";
    if (candidates.length === 0) {
      candidates = cards.filter((card) =>
        matchesSelectionPredicate(card, predicate));
      source = "catalog_fallback";
    }
  } else if (placeholder === "$OFFERED_CARD") {
    candidates = cards.filter(
      (card) => card.isOfferable && matchesSelectionPredicate(card, predicate),
    );
    source = "offer_pool";
  } else {
    candidates = playerDeck.filter(
      (card) => card.isStarter && matchesSelectionPredicate(card, predicate),
    );
    source = "starter_deck";
  }
  if (candidates.length === 0) {
    throw new Error(
      `No card matches ${placeholder}${
        predicate === null ? "" : ` predicate ${predicate}`
      }.`,
    );
  }
  const card = candidates[randomIndex(candidates.length, random)];
  return {
    placeholder,
    predicate,
    cardId: card.id,
    cardName: card.name,
    source,
  };
}

/** Render an Exploration template preview with concrete referenced entities. */
export function renderRuntimeTemplate(
  template,
  variables,
  selection,
  cards,
  playerDeck,
  random,
) {
  const variableParts = renderVariableParts(template, variables);
  const withVariables = variableParts.map((part) =>
    part.kind === "card"
      ? part.cardName
      : part.kind === "dreamsign"
        ? part.dreamsignName
        : part.text).join("");
  const placeholders = [...new Set(withVariables.match(SPECIAL_PATTERN) ?? [])]
    .filter((placeholder) => RUNTIME_CARD_PLACEHOLDERS.has(placeholder));
  const runtimeSelections = placeholders.map((placeholder) =>
    runtimeCardSelection(
      placeholder,
      selection,
      cards,
      playerDeck,
      random,
    ));
  const selectionsByPlaceholder = new Map(
    runtimeSelections.map((entry) => [entry.placeholder, entry]),
  );
  const parts = [];
  for (const variablePart of variableParts) {
    if (variablePart.kind !== "text") {
      parts.push(variablePart);
      continue;
    }
    let cursor = 0;
    for (const match of variablePart.text.matchAll(SPECIAL_PATTERN)) {
      if (match.index > cursor) {
        parts.push({
          kind: "text",
          text: variablePart.text.slice(cursor, match.index),
        });
      }
      const runtimeSelection = selectionsByPlaceholder.get(match[0]);
      parts.push(
        runtimeSelection === undefined
          ? { kind: "text", text: match[0] }
          : {
              kind: "card",
              placeholder: runtimeSelection.placeholder,
              cardId: runtimeSelection.cardId,
              cardName: runtimeSelection.cardName,
            },
      );
      cursor = match.index + match[0].length;
    }
    if (cursor < variablePart.text.length) {
      parts.push({ kind: "text", text: variablePart.text.slice(cursor) });
    }
  }
  return {
    renderedTemplate: parts.map((part) =>
      part.kind === "card"
        ? part.cardName
        : part.kind === "dreamsign"
          ? part.dreamsignName
          : part.text).join(""),
    renderedTemplateParts: parts,
    runtimeCardSelections: runtimeSelections,
  };
}
