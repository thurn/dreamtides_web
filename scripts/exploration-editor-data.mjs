import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import {
  buildSimulatedPlayerDeck,
  renderActionPresentation,
} from "./exploration-presentation-runtime.mjs";
import {
  EXPLORATION_EFFECT_SCHEMA_BY_KIND,
  EXPLORATION_EFFECT_SCHEMAS,
  EXPLORATION_PREDICATES,
  EXPLORATION_TRANSFIGURATIONS,
} from "./exploration-editor-schema.mjs";
import { transformCard, transformDreamsign, transformExplorationData } from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_EXPLORATION_TOML_PATH = join("data", "exploration.toml");
export const DEFAULT_EXPLORATION_CARDS_PATH = join("data", "cards.toml");
export const DEFAULT_EXPLORATION_DREAMSIGNS_PATH = join("data", "dreamsigns.toml");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CONFIG_KEYS = [
  ["canonical-mechanic-id", "canonicalMechanicId"],
  ["selection-policy-id", "selectionPolicyId"],
  ["deck-target", "deckTarget"],
  ["predicate", "predicate"],
  ["count", "count"],
  ["card-id", "cardId"],
  ["dreamsign-id", "dreamsignId"],
  ["pack-count", "packCount"],
  ["pack-size", "packSize"],
  ["offer-count", "offerCount"],
  ["essence-per-spark", "essencePerSpark"],
  ["essence-per-card", "essencePerCard"],
  ["spark-bonus", "sparkBonus"],
  ["essence", "essence"],
  ["energy-cost-reduction", "energyCostReduction"],
  ["subtype", "subtype"],
  ["subtype-options", "subtypeOptions"],
  ["nightmare-count", "nightmareCount"],
  ["transfiguration", "transfiguration"],
];

function editorError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw editorError("INVALID_EXPLORATION", `${label} must be nonblank text.`);
  }
  return value;
}

function canonicalUuid(value, label) {
  const uuid = requiredString(value, label);
  if (!UUID_PATTERN.test(uuid)) throw editorError("INVALID_REFERENCE", `${label} must be a UUID.`);
  return uuid;
}

function validateReference(value, label, knownIds) {
  const id = canonicalUuid(value, label);
  if (knownIds !== undefined && !knownIds.has(id.toLowerCase())) {
    throw editorError("INVALID_REFERENCE", `Unknown ${label} ${id}.`);
  }
  return id;
}

function camelAction(raw) {
  const action = {
    id: raw.id,
    label: raw.label,
    effectText: raw["effect-text"],
    ...(raw["followup-title"] === undefined ? {} : { followupTitle: raw["followup-title"] }),
    ...(raw["followup-subtitle"] === undefined ? {} : { followupSubtitle: raw["followup-subtitle"] }),
    effectKind: raw["effect-kind"],
  };
  for (const [tomlKey, camelKey] of CONFIG_KEYS) {
    if (Object.hasOwn(raw, tomlKey)) action[camelKey] = raw[tomlKey];
  }
  return action;
}

function readCatalogs(rootDir, paths) {
  const cardsDocument = parse(readFileSync(join(rootDir, paths.cards), "utf8"));
  const dreamsignDocument = parse(readFileSync(join(rootDir, paths.dreamsigns), "utf8"));
  const cards = new Map();
  for (const raw of cardsDocument.cards ?? []) {
    const id = canonicalUuid(raw.id, "card id");
    cards.set(id.toLowerCase(), {
      id,
      name: requiredString(raw.name, "card name"),
      renderedText: typeof raw["rendered-text"] === "string" ? raw["rendered-text"] : "",
      imageNumber: Number.isInteger(raw["image-number"]) ? raw["image-number"] : null,
      cardType: typeof raw["card-type"] === "string" ? raw["card-type"] : "",
      subtype: typeof raw.subtype === "string" ? raw.subtype : "",
      energyCost: Number.isInteger(raw["energy-cost"]) ? raw["energy-cost"] : null,
      isStarter: raw.rarity === "Starter",
      isOfferable: raw.rarity !== "Starter" && raw.rarity !== "Special",
    });
  }
  const subtypes = [...new Set([...cards.values()]
    .filter((card) => card.cardType === "Character" && card.subtype !== "")
    .map((card) => card.subtype))].sort((left, right) => left.localeCompare(right));
  return {
    cards,
    dreamsignIds: new Set((dreamsignDocument.dreamsign ?? []).map((dreamsign) =>
      canonicalUuid(dreamsign.id, "Dreamsign id").toLowerCase())),
    subtypes,
    runtimeCards: (cardsDocument.cards ?? []).map(transformCard),
    runtimeDreamsigns: (dreamsignDocument.dreamsign ?? []).map((dreamsign) =>
      transformDreamsign(dreamsign, new Map())),
  };
}

function pathsFor(options) {
  return {
    exploration: options.explorationTomlPath ?? DEFAULT_EXPLORATION_TOML_PATH,
    cards: options.cardsTomlPath ?? DEFAULT_EXPLORATION_CARDS_PATH,
    dreamsigns: options.dreamsignsTomlPath ?? DEFAULT_EXPLORATION_DREAMSIGNS_PATH,
  };
}

export function normalizeExplorationAction(rawAction, references = undefined) {
  const effectKind = requiredString(rawAction.effectKind, "effect kind");
  const definition = EXPLORATION_EFFECT_SCHEMA_BY_KIND.get(effectKind);
  if (definition === undefined) {
    throw editorError("INVALID_EFFECT_KIND", `Unknown Exploration effect kind ${effectKind}.`);
  }
  const action = {
    ...rawAction,
    id: requiredString(rawAction.id, "action id"),
    label: requiredString(rawAction.label, "action label").trim(),
    effectText: requiredString(rawAction.effectText, "effect text"),
    effectKind,
    canonicalMechanicId: definition.canonicalMechanicId,
  };
  if (definition.defaultSelectionPolicyId === undefined) delete action.selectionPolicyId;
  else if (!definition.allowedSelectionPolicyIds.includes(action.selectionPolicyId)) {
    action.selectionPolicyId = definition.defaultSelectionPolicyId;
  }
  if ((action.followupTitle === undefined) !== (action.followupSubtitle === undefined)) {
    throw editorError("INVALID_EFFECT_FIELD", "Followup title and subtitle must be authored together.");
  }
  if (action.cardId !== undefined) {
    action.cardId = validateReference(action.cardId, "card reference", references?.cardIds);
  }
  if (action.dreamsignId !== undefined) {
    action.dreamsignId = validateReference(
      action.dreamsignId,
      "Dreamsign reference",
      references?.dreamsignIds,
    );
  }
  return action;
}

export function readExplorationEditorData(options = {}) {
  const rootDir = options.rootDir ?? ROOT;
  const paths = pathsFor(options);
  const document = parse(readFileSync(join(rootDir, paths.exploration), "utf8"));
  transformExplorationData(document);
  const catalogs = readCatalogs(rootDir, paths);
  const references = {
    cardIds: new Set(catalogs.cards.keys()),
    dreamsignIds: catalogs.dreamsignIds,
  };
  const random = options.random ?? Math.random;
  const catalog = [...catalogs.cards.values()];
  const playerDeck = buildSimulatedPlayerDeck(catalog, random);
  const encounters = (document.encounter ?? []).map((encounter) => {
    const cardId = canonicalUuid(encounter["card-id"], "encounter card-id");
    const card = catalogs.cards.get(cardId.toLowerCase());
    if (card === undefined) throw editorError("INVALID_REFERENCE", `Unknown encounter card ${cardId}.`);
    return {
      cardId,
      prose: requiredString(encounter.prose, "encounter prose"),
      cardName: card.name,
      cardAbilityText: card.renderedText,
      imageNumber: card.imageNumber,
      actions: (encounter.action ?? []).map((rawAction) => {
        const action = normalizeExplorationAction(camelAction(rawAction), references);
        return { ...action, ...renderActionPresentation(action, catalog, playerDeck, random) };
      }),
    };
  });
  return {
    encounters,
    effectSchemas: EXPLORATION_EFFECT_SCHEMAS,
    predicates: EXPLORATION_PREDICATES,
    transfigurations: EXPLORATION_TRANSFIGURATIONS,
    subtypes: catalogs.subtypes,
    cards: catalogs.runtimeCards,
    dreamsigns: catalogs.runtimeDreamsigns,
  };
}

export const explorationEditorInternals = { camelAction };
