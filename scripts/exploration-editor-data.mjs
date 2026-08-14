import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { SourceCatalog } from "../vendor/trox-runtime/dist/runtime.js";
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
import { EXPLORATION_FIXED_SITE_TYPES } from "./exploration-effect-editor-schema.mjs";
import { validateExplorationEffectAction } from "./exploration-effect-validation.mjs";
import {
  transformCard,
  transformDreamsign,
  transformExplorationData,
} from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_EXPLORATION_TOML_PATH = join("data", "exploration.toml");
export const DEFAULT_EXPLORATION_CARDS_PATH = join("data", "cards.toml");
export const DEFAULT_EXPLORATION_DREAMSIGNS_PATH = join(
  "data",
  "dreamsigns.toml",
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CONFIG_KEYS = [
  ["canonical-mechanic-id", "canonicalMechanicId"],
  ["selection-policy-id", "selectionPolicyId"],
  ["deck-target", "deckTarget"],
  ["predicate", "predicate"],
  ["count", "count"],
  ["card-type", "cardType"],
  ["site-type", "siteType"],
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
const NIGHTMARE_DREAMSIGN_FIELDS = [
  "dreamsignId",
  "offerCount",
  "nightmareCount",
];
const SUPPORTED_NON_ANY_PREDICATES = new Set(
  EXPLORATION_PREDICATES.map(({ value }) => value).filter(
    (value) => value !== "",
  ),
);
const EXPLORATION_FIXED_SITE_TYPE_VALUES = new Set(
  EXPLORATION_FIXED_SITE_TYPES.map(({ value }) => value),
);
const WAVE8_STRICT_METADATA_EFFECT_KINDS = new Set([
  "transfigure-all-cards",
  "purge-disclosed-and-transfigure-same-type",
  "make-predicate-fast-and-gain-nightmares",
  "take-transfigured-cards-and-gain-nightmares",
  "purge-one-transfigure-and-copy-others",
]);

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

const sourceCatalogs = new Map();

function sourceCatalogFor(rootDir, options = {}) {
  const bundlePath = join(
    rootDir,
    "src",
    "generated",
    "localization",
    "en-US.trox.json",
  );
  const stat = (options.stat ?? statSync)(bundlePath);
  const version = [stat.dev, stat.ino, stat.size, stat.mtimeMs].join(":");
  let cached = sourceCatalogs.get(rootDir);
  if (cached?.version !== version) {
    const bundle = JSON.parse((options.read ?? readFileSync)(bundlePath, "utf8"));
    cached = {
      version,
      bundle,
      catalog: (options.create ?? ((value) => new SourceCatalog(value)))(bundle),
    };
    sourceCatalogs.set(rootDir, cached);
  }
  return cached;
}

function sourceAuthoringText(value, label, sourceCatalog) {
  if (typeof value === "string") return requiredString(value, label);
  const cached = sourceCatalog();
  try {
    cached.catalog.sourceMessageFromValue(value);
  } catch (error) {
    throw editorError(
      "INVALID_EXPLORATION",
      `${label} has an invalid Trox source reference: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const pattern = cached.bundle.entries[value.entry_id]?.identity?.pattern;
  if (pattern?.kind !== "text" || typeof pattern.text !== "string") {
    throw editorError(
      "INVALID_EXPLORATION",
      `${label} must reference a Trox text message.`,
    );
  }
  return requiredString(pattern.text, label);
}

function authoringAction(raw, sourceCatalog) {
  return {
    ...raw,
    label: sourceAuthoringText(raw.label, "action label", sourceCatalog),
    "effect-text": sourceAuthoringText(
      raw["effect-text"],
      "action effect text",
      sourceCatalog,
    ),
    ...(raw["followup-title"] === undefined
      ? {}
      : {
          "followup-title": sourceAuthoringText(
            raw["followup-title"],
            "action followup title",
            sourceCatalog,
          ),
        }),
    ...(raw["followup-subtitle"] === undefined
      ? {}
      : {
          "followup-subtitle": sourceAuthoringText(
            raw["followup-subtitle"],
            "action followup subtitle",
            sourceCatalog,
          ),
        }),
  };
}

function canonicalUuid(value, label) {
  const uuid = requiredString(value, label);
  if (!UUID_PATTERN.test(uuid))
    throw editorError("INVALID_REFERENCE", `${label} must be a UUID.`);
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
    ...(raw["followup-title"] === undefined
      ? {}
      : { followupTitle: raw["followup-title"] }),
    ...(raw["followup-subtitle"] === undefined
      ? {}
      : { followupSubtitle: raw["followup-subtitle"] }),
    effectKind: raw["effect-kind"],
  };
  for (const [tomlKey, camelKey] of CONFIG_KEYS) {
    if (Object.hasOwn(raw, tomlKey)) action[camelKey] = raw[tomlKey];
  }
  return action;
}

function readCatalogs(rootDir, paths) {
  const cardsDocument = parse(readFileSync(join(rootDir, paths.cards), "utf8"));
  const dreamsignDocument = parse(
    readFileSync(join(rootDir, paths.dreamsigns), "utf8"),
  );
  const cards = new Map();
  for (const raw of cardsDocument.cards ?? []) {
    const id = canonicalUuid(raw.id, "card id");
    cards.set(id.toLowerCase(), {
      id,
      name: requiredString(raw.name, "card name"),
      renderedText:
        typeof raw["rendered-text"] === "string" ? raw["rendered-text"] : "",
      imageNumber: Number.isInteger(raw["image-number"])
        ? raw["image-number"]
        : null,
      cardType: typeof raw["card-type"] === "string" ? raw["card-type"] : "",
      subtype: typeof raw.subtype === "string" ? raw.subtype : "",
      energyCost: Number.isInteger(raw["energy-cost"])
        ? raw["energy-cost"]
        : null,
      isStarter: raw.rarity === "Starter",
      isOfferable: raw.rarity !== "Starter" && raw.rarity !== "Special",
    });
  }
  const subtypes = [
    ...new Set(
      [...cards.values()]
        .filter((card) => card.cardType === "Character" && card.subtype !== "")
        .map((card) => card.subtype),
    ),
  ].sort((left, right) => left.localeCompare(right));
  return {
    cards,
    dreamsignIds: new Set(
      (dreamsignDocument.dreamsign ?? []).map((dreamsign) =>
        canonicalUuid(dreamsign.id, "Dreamsign id").toLowerCase(),
      ),
    ),
    subtypes,
    runtimeCards: (cardsDocument.cards ?? []).map(transformCard),
    runtimeDreamsigns: (dreamsignDocument.dreamsign ?? []).map((dreamsign) =>
      transformDreamsign(dreamsign, new Map()),
    ),
  };
}

function pathsFor(options) {
  return {
    exploration: options.explorationTomlPath ?? DEFAULT_EXPLORATION_TOML_PATH,
    cards: options.cardsTomlPath ?? DEFAULT_EXPLORATION_CARDS_PATH,
    dreamsigns:
      options.dreamsignsTomlPath ?? DEFAULT_EXPLORATION_DREAMSIGNS_PATH,
  };
}

export function normalizeExplorationAction(rawAction, references = undefined) {
  const effectKind = requiredString(rawAction.effectKind, "effect kind");
  const definition = EXPLORATION_EFFECT_SCHEMA_BY_KIND.get(effectKind);
  if (definition === undefined) {
    throw editorError(
      "INVALID_EFFECT_KIND",
      `Unknown Exploration effect kind ${effectKind}.`,
    );
  }
  if (WAVE8_STRICT_METADATA_EFFECT_KINDS.has(effectKind)) {
    if (
      rawAction.canonicalMechanicId !== undefined &&
      rawAction.canonicalMechanicId !== definition.canonicalMechanicId
    ) {
      throw editorError(
        "INVALID_EFFECT_FIELD",
        `${effectKind} has an incompatible canonicalMechanicId.`,
      );
    }
    if (
      rawAction.selectionPolicyId !== undefined &&
      rawAction.selectionPolicyId !== definition.defaultSelectionPolicyId
    ) {
      throw editorError(
        "INVALID_EFFECT_FIELD",
        `${effectKind} has an incompatible selectionPolicyId.`,
      );
    }
  }
  const action = {
    ...rawAction,
    id: requiredString(rawAction.id, "action id"),
    label: requiredString(rawAction.label, "action label").trim(),
    effectText: requiredString(rawAction.effectText, "effect text"),
    effectKind,
    canonicalMechanicId: definition.canonicalMechanicId,
  };
  if (definition.defaultSelectionPolicyId === undefined)
    delete action.selectionPolicyId;
  else if (
    !definition.allowedSelectionPolicyIds.includes(action.selectionPolicyId)
  ) {
    action.selectionPolicyId = definition.defaultSelectionPolicyId;
  }
  if (
    (action.followupTitle === undefined) !==
    (action.followupSubtitle === undefined)
  ) {
    throw editorError(
      "INVALID_EFFECT_FIELD",
      "Followup title and subtitle must be authored together.",
    );
  }
  const applicableFields = new Set(definition.fields.map((field) => field.key));
  validateExplorationEffectAction(action, {
    predicates: SUPPORTED_NON_ANY_PREDICATES,
    transfigurations: new Set(EXPLORATION_TRANSFIGURATIONS),
    fixedSiteTypes: EXPLORATION_FIXED_SITE_TYPE_VALUES,
    fail(message) {
      throw editorError("INVALID_EFFECT_FIELD", `${message}.`);
    },
  });
  if (
    action.cardType !== undefined &&
    effectKind !== "change-random-card-type" &&
    effectKind !== "change-card-type-selected"
  ) {
    throw editorError(
      "INVALID_EFFECT_FIELD",
      `cardType does not apply to Exploration effect kind ${effectKind}.`,
    );
  }
  if (action.siteType !== undefined && effectKind !== "add-fixed-site") {
    throw editorError(
      "INVALID_EFFECT_FIELD",
      `siteType does not apply to Exploration effect kind ${effectKind}.`,
    );
  }
  for (const field of NIGHTMARE_DREAMSIGN_FIELDS) {
    if (action[field] !== undefined && !applicableFields.has(field)) {
      throw editorError(
        "INVALID_EFFECT_FIELD",
        `${field} does not apply to Exploration effect kind ${effectKind}.`,
      );
    }
  }
  if (effectKind === "gain-nightmare-and-dreamsign") {
    if (action.dreamsignId === undefined) {
      throw editorError(
        "INVALID_EFFECT_FIELD",
        "gain-nightmare-and-dreamsign requires dreamsignId.",
      );
    }
    if (
      !Number.isInteger(action.nightmareCount) ||
      action.nightmareCount <= 0
    ) {
      throw editorError(
        "INVALID_EFFECT_FIELD",
        "gain-nightmare-and-dreamsign requires a positive integer nightmareCount.",
      );
    }
  }
  if (effectKind === "gain-nightmare-and-offered-dreamsign") {
    if (!Number.isInteger(action.offerCount) || action.offerCount <= 0) {
      throw editorError(
        "INVALID_EFFECT_FIELD",
        "gain-nightmare-and-offered-dreamsign requires a positive integer offerCount.",
      );
    }
    if (
      !Number.isInteger(action.nightmareCount) ||
      action.nightmareCount <= 0
    ) {
      throw editorError(
        "INVALID_EFFECT_FIELD",
        "gain-nightmare-and-offered-dreamsign requires a positive integer nightmareCount.",
      );
    }
  }
  if (action.cardId !== undefined) {
    action.cardId = validateReference(
      action.cardId,
      "card reference",
      references?.cardIds,
    );
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
  const document = parse(
    readFileSync(join(rootDir, paths.exploration), "utf8"),
  );
  transformExplorationData(document);
  const catalogs = readCatalogs(rootDir, paths);
  const references = {
    cardIds: new Set(catalogs.cards.keys()),
    dreamsignIds: catalogs.dreamsignIds,
  };
  const random = options.random ?? Math.random;
  let currentSourceCatalog;
  const sourceCatalog = () =>
    (currentSourceCatalog ??= sourceCatalogFor(rootDir));
  const catalog = [...catalogs.cards.values()];
  const playerDeck = buildSimulatedPlayerDeck(catalog, random);
  const encounters = (document.encounter ?? []).map((encounter) => {
    const cardId = canonicalUuid(encounter["card-id"], "encounter card-id");
    const card = catalogs.cards.get(cardId.toLowerCase());
    if (card === undefined)
      throw editorError(
        "INVALID_REFERENCE",
        `Unknown encounter card ${cardId}.`,
      );
    return {
      cardId,
      prose: sourceAuthoringText(
        encounter.prose,
        "encounter prose",
        sourceCatalog,
      ),
      cardName: card.name,
      cardAbilityText: card.renderedText,
      imageNumber: card.imageNumber,
      actions: (encounter.action ?? []).map((rawAction) => {
        const action = normalizeExplorationAction(
          camelAction(authoringAction(rawAction, sourceCatalog)),
          references,
        );
        return {
          ...action,
          ...renderActionPresentation(action, catalog, playerDeck, random),
        };
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

export const explorationEditorInternals = { camelAction, sourceCatalogFor };
