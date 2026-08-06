import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import {
  buildSimulatedPlayerDeck,
  parseEncounterTemplates,
  renderRuntimeTemplate,
} from "./exploration-candidates-editor-data.mjs";
import {
  EXPLORATION_EFFECT_DEFINITION_BY_KIND,
  EXPLORATION_EFFECT_DEFINITIONS,
  EXPLORATION_PREDICATES,
  EXPLORATION_TRANSFIGURATIONS,
  predicateDisplayName,
} from "./exploration-editor-schema.mjs";
import {
  transformCard,
  transformDreamsign,
  transformExplorationData,
} from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_EXPLORATION_TOML_PATH = join("data", "tabula", "exploration.toml");
export const DEFAULT_EXPLORATION_TEMPLATES_PATH = join("data", "templates.json");
export const DEFAULT_EXPLORATION_CARDS_PATH = join("data", "tabula", "cards.toml");
export const DEFAULT_EXPLORATION_DREAMSIGNS_PATH = join("data", "tabula", "dreamsigns.toml");
export const DEFAULT_EXPLORATION_JSON_PATH = join("public", "exploration-data.json");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const PLACEHOLDER_PATTERN = /\{([a-z][a-z0-9_]*)\}/gu;
const SPECIAL_PATTERN = /\$[A-Z][A-Z0-9_]*/gu;
const ACTION_HEADER = "[[encounter.action]]";
const ACTION_FIELD_ORDER = [
  "id",
  "label",
  "effect-text",
  "template-id",
  "template-variables",
  "selection",
  "effect-kind",
  "canonical-mechanic-id",
  "selection-policy-id",
  "predicate",
  "count",
  "card-id",
  "dreamsign-id",
  "pack-count",
  "pack-size",
  "offer-count",
  "essence-per-spark",
  "essence-per-card",
  "spark-bonus",
  "essence",
  "energy-cost-reduction",
  "subtype",
  "subtype-options",
  "nightmare-count",
  "transfiguration",
];
const CONFIG_KEY_TO_TOML = {
  canonicalMechanicId: "canonical-mechanic-id",
  selectionPolicyId: "selection-policy-id",
  predicate: "predicate",
  count: "count",
  cardId: "card-id",
  dreamsignId: "dreamsign-id",
  packCount: "pack-count",
  packSize: "pack-size",
  offerCount: "offer-count",
  essencePerSpark: "essence-per-spark",
  essencePerCard: "essence-per-card",
  sparkBonus: "spark-bonus",
  essence: "essence",
  energyCostReduction: "energy-cost-reduction",
  subtype: "subtype",
  subtypeOptions: "subtype-options",
  nightmareCount: "nightmare-count",
  transfiguration: "transfiguration",
};
const TOML_TO_CONFIG_KEY = Object.fromEntries(
  Object.entries(CONFIG_KEY_TO_TOML).map(([key, value]) => [value, key]),
);

const defaultFileSystem = {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
};

let saveCounter = 0;

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
  if (!UUID_PATTERN.test(uuid)) {
    throw editorError("INVALID_REFERENCE", `${label} must be a UUID.`);
  }
  return uuid;
}

function objectRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw editorError("INVALID_EXPLORATION", `${label} must be an object.`);
  }
  return value;
}

function readCatalogs(rootDir, paths, fileSystem) {
  const cardsDocument = parse(fileSystem.readFileSync(join(rootDir, paths.cards), "utf8"));
  const dreamsignDocument = parse(
    fileSystem.readFileSync(join(rootDir, paths.dreamsigns), "utf8"),
  );
  const cards = new Map();
  for (const [index, raw] of (cardsDocument.cards ?? []).entries()) {
    const card = objectRecord(raw, `cards[${String(index)}]`);
    const id = canonicalUuid(card.id, `cards[${String(index)}].id`);
    cards.set(id.toLowerCase(), {
      id,
      name: requiredString(card.name, `cards[${String(index)}].name`),
      renderedText: typeof card["rendered-text"] === "string" ? card["rendered-text"] : "",
      imageNumber: Number.isInteger(card["image-number"]) ? card["image-number"] : null,
      cardType: typeof card["card-type"] === "string" ? card["card-type"] : "",
      subtype: typeof card.subtype === "string" ? card.subtype : "",
      energyCost: Number.isInteger(card["energy-cost"]) ? card["energy-cost"] : null,
      isStarter: card.rarity === "Starter",
      isOfferable: card.rarity !== "Starter" && card.rarity !== "Special",
    });
  }
  const dreamsigns = new Map();
  for (const [index, raw] of (dreamsignDocument.dreamsign ?? []).entries()) {
    const dreamsign = objectRecord(raw, `dreamsigns[${String(index)}]`);
    const id = canonicalUuid(dreamsign.id, `dreamsigns[${String(index)}].id`);
    dreamsigns.set(id.toLowerCase(), {
      id,
      name: requiredString(dreamsign.name, `dreamsigns[${String(index)}].name`),
    });
  }
  const subtypes = [...new Set(
    [...cards.values()]
      .filter((card) => card.cardType === "Character" && card.subtype.trim() !== "")
      .map((card) => card.subtype),
  )].sort((left, right) => left.localeCompare(right));
  return {
    cards,
    dreamsigns,
    runtimeCards: (cardsDocument.cards ?? []).map(transformCard),
    runtimeDreamsigns: (dreamsignDocument.dreamsign ?? []).map((dreamsign) => ({
      ...transformDreamsign(dreamsign),
      isNegative: false,
    })),
    subtypes,
  };
}

function camelAction(raw) {
  const result = {
    id: raw.id,
    label: raw.label,
    effectText: raw["effect-text"],
    templateId: raw["template-id"],
    templateVariables: raw["template-variables"] ?? {},
    selection: raw.selection,
    effectKind: raw["effect-kind"],
  };
  for (const [tomlKey, camelKey] of Object.entries(TOML_TO_CONFIG_KEY)) {
    if (Object.hasOwn(raw, tomlKey)) result[camelKey] = raw[tomlKey];
  }
  return result;
}

function templateMap(source) {
  return parseEncounterTemplates(source).byId;
}

function templateEntryList(source) {
  const parsed = parseEncounterTemplates(source);
  return parsed.document.map((entry) => ({ id: entry.template_id, text: entry.template }));
}

function predicateValue(value) {
  if (value === "" || value === undefined || value === null) return undefined;
  if (!EXPLORATION_PREDICATES.some((entry) => entry.value === value)) {
    throw editorError("INVALID_EFFECT_FIELD", `Unknown Exploration predicate ${String(value)}.`);
  }
  return value;
}

function positiveInteger(value, fallback, label) {
  const candidate = Number.isInteger(value) ? value : fallback;
  if (!Number.isInteger(candidate) || candidate < 1) {
    throw editorError("INVALID_EFFECT_FIELD", `${label} must be a positive whole number.`);
  }
  return candidate;
}

function fieldDefault(field, context) {
  if (field.key === "cardId") return context.encounterCardId;
  if (field.key === "dreamsignId") {
    return [...context.catalogs.dreamsigns.values()]
      .sort((left, right) => left.id.localeCompare(right.id))[0]?.id;
  }
  if (field.key === "subtype") return context.catalogs.subtypes[0];
  if (field.key === "subtypeOptions") return [...context.catalogs.subtypes];
  return field.defaultValue;
}

function normalizeField(field, rawValue, context) {
  const fallback = fieldDefault(field, context);
  if (field.control === "number") {
    return positiveInteger(rawValue, fallback, field.label);
  }
  if (field.control === "predicate") {
    const value = predicateValue(rawValue ?? fallback);
    if (!field.optional && value === undefined) {
      return "character";
    }
    return value;
  }
  if (field.control === "card") {
    const value = canonicalUuid(rawValue ?? fallback, field.label);
    if (!context.catalogs.cards.has(value.toLowerCase())) {
      throw editorError("INVALID_REFERENCE", `${field.label} references an unknown card UUID.`);
    }
    return value;
  }
  if (field.control === "dreamsign") {
    const value = canonicalUuid(rawValue ?? fallback, field.label);
    if (!context.catalogs.dreamsigns.has(value.toLowerCase())) {
      throw editorError("INVALID_REFERENCE", `${field.label} references an unknown Dreamsign UUID.`);
    }
    return value;
  }
  if (field.control === "subtype") {
    const value = requiredString(rawValue ?? fallback, field.label);
    if (!context.catalogs.subtypes.includes(value)) {
      throw editorError("INVALID_EFFECT_FIELD", `${field.label} is not a catalog subtype.`);
    }
    return value;
  }
  if (field.control === "subtype-options") {
    const values = Array.isArray(rawValue) && rawValue.length > 0 ? rawValue : fallback;
    if (!Array.isArray(values) || values.length === 0) {
      throw editorError("INVALID_EFFECT_FIELD", "Subtype options require at least one subtype.");
    }
    const unique = [...new Set(values.map((value) => requiredString(value, field.label)))];
    if (unique.some((value) => !context.catalogs.subtypes.includes(value))) {
      throw editorError("INVALID_EFFECT_FIELD", "Subtype options contain an unknown subtype.");
    }
    return unique;
  }
  if (field.control === "transfiguration") {
    const value = rawValue ?? fallback;
    if (!EXPLORATION_TRANSFIGURATIONS.includes(value)) {
      throw editorError("INVALID_EFFECT_FIELD", "Unknown transfiguration.");
    }
    return value;
  }
  throw editorError("INVALID_EFFECT_FIELD", `Unsupported field control ${field.control}.`);
}

function applyTemplateConstraints(action) {
  if (action.effectKind === "purge-selected") {
    if (action.templateId === 3) {
      delete action.predicate;
      action.count = 1;
    } else if (action.templateId === 4) {
      action.predicate ??= "character";
      action.count = 1;
    } else if (action.templateId === 5) {
      delete action.predicate;
    } else {
      action.predicate ??= "character";
    }
  }
  if (action.effectKind === "draft-card" && action.templateId === 14) action.count = 1;
  if (action.effectKind === "gain-random-cards" && action.templateId === 9) action.count = 1;
}

function placeholderValue(name, action, catalogs) {
  const card = typeof action.cardId === "string"
    ? catalogs.cards.get(action.cardId.toLowerCase())
    : undefined;
  const dreamsign = typeof action.dreamsignId === "string"
    ? catalogs.dreamsigns.get(action.dreamsignId.toLowerCase())
    : undefined;
  const values = {
    predicate: predicateDisplayName(action.predicate ?? "character"),
    count: action.count ?? action.nightmareCount,
    offer_count: action.offerCount,
    pack_count: action.packCount,
    pack_size: action.packSize,
    essence_per_spark: action.essencePerSpark,
    essence_per_energy: action.essencePerSpark,
    essence_per_card: action.essencePerCard,
    spark_bonus: action.sparkBonus,
    essence: action.essence,
    energy_cost_reduction: action.energyCostReduction,
    nightmare_count: action.nightmareCount,
    card_type: action.subtype,
    subtype: action.subtype,
    transfiguration: action.transfiguration,
    card_id: card === undefined ? undefined : { id: card.id, display_name: card.name },
    card_name: card?.name,
    dreamsign_name: dreamsign === undefined
      ? undefined
      : { id: dreamsign.id, display_name: dreamsign.name },
  };
  return values[name];
}

function displayVariable(value, label) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return requiredString(value.display_name, `${label}.display_name`);
  }
  throw editorError("INVALID_TEMPLATE", `${label} has no value for this effect.`);
}

function attachTemplateMetadata(action, templates, catalogs) {
  const template = templates.get(action.templateId);
  if (template === undefined) {
    throw editorError("INVALID_TEMPLATE", `Unknown template id ${String(action.templateId)}.`);
  }
  const variables = {};
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];
    const value = placeholderValue(name, action, catalogs);
    if (value === undefined) {
      throw editorError("INVALID_TEMPLATE", `Template ${String(action.templateId)} requires {${name}}.`);
    }
    variables[name] = value;
  }
  const selection = {};
  for (const special of new Set(template.match(SPECIAL_PATTERN) ?? [])) {
    if (special === "$OFFERED_CARD" || special === "$DECK_CARD") {
      selection[special] = {
        predicate: predicateDisplayName(action.predicate ?? "character"),
      };
    }
  }
  action.effectText = template.replace(PLACEHOLDER_PATTERN, (_match, name) =>
    displayVariable(variables[name], `template variable ${name}`));
  action.templateVariables = variables;
  if (Object.keys(selection).length === 0) delete action.selection;
  else action.selection = selection;
  action.template = template;
  return action;
}

export function normalizeExplorationAction(rawAction, context) {
  const raw = objectRecord(rawAction, "action");
  const effectKind = requiredString(raw.effectKind, "effect kind");
  const definition = EXPLORATION_EFFECT_DEFINITION_BY_KIND.get(effectKind);
  if (definition === undefined) {
    throw editorError("INVALID_EFFECT_KIND", `Unknown Exploration effect kind ${effectKind}.`);
  }
  const requestedTemplateId = Number.isInteger(raw.templateId) ? raw.templateId : undefined;
  let templateId = definition.templateIds.includes(requestedTemplateId)
    ? requestedTemplateId
    : definition.templateIds[0];
  if (effectKind === "purge-selected" && raw.predicate === "") {
    if (templateId === 4) templateId = 3;
    if (templateId === 6) templateId = 5;
  }
  const action = {
    id: requiredString(raw.id, "action id"),
    label: requiredString(raw.label, "action label").trim(),
    effectKind,
    templateId,
    ...(definition.canonicalMechanicId === undefined
      ? {}
      : { canonicalMechanicId: definition.canonicalMechanicId }),
    ...(definition.defaultSelectionPolicyId === undefined
      ? {}
      : {
          selectionPolicyId:
            raw.canonicalMechanicId === definition.canonicalMechanicId &&
            typeof raw.selectionPolicyId === "string"
              ? raw.selectionPolicyId
              : definition.defaultSelectionPolicyId,
        }),
  };
  if (
    action.selectionPolicyId !== undefined &&
    !definition.allowedSelectionPolicyIds.includes(action.selectionPolicyId)
  ) {
    throw editorError(
      "INVALID_EFFECT_FIELD",
      `Selection policy ${action.selectionPolicyId} is not supported by ${effectKind}.`,
    );
  }
  for (const field of definition.fields) {
    const value = normalizeField(field, raw[field.key], context);
    if (value !== undefined) action[field.key] = value;
  }
  applyTemplateConstraints(action);
  return attachTemplateMetadata(action, context.templates, context.catalogs);
}

function validateExplorationDocument(document, templates, catalogs) {
  if (!Array.isArray(document.encounter) || document.encounter.length === 0) {
    throw editorError("INVALID_EXPLORATION", "Exploration requires at least one encounter.");
  }
  const encounterIds = new Set();
  const actionIds = new Set();
  for (const [encounterIndex, encounterRaw] of document.encounter.entries()) {
    const encounter = objectRecord(encounterRaw, `encounter[${String(encounterIndex)}]`);
    const cardId = canonicalUuid(encounter["card-id"], "encounter card-id");
    const normalizedCardId = cardId.toLowerCase();
    if (encounterIds.has(normalizedCardId)) {
      throw editorError("INVALID_EXPLORATION", `Duplicate encounter card UUID ${cardId}.`);
    }
    if (!catalogs.cards.has(normalizedCardId)) {
      throw editorError("INVALID_REFERENCE", `Encounter references unknown card UUID ${cardId}.`);
    }
    encounterIds.add(normalizedCardId);
    requiredString(encounter.prose, `encounter ${cardId} prose`);
    if (!Array.isArray(encounter.action) || encounter.action.length !== 2) {
      throw editorError("INVALID_EXPLORATION", `Encounter ${cardId} must have two actions.`);
    }
    for (const actionRaw of encounter.action) {
      const action = camelAction(actionRaw);
      if (actionIds.has(action.id)) {
        throw editorError("INVALID_EXPLORATION", `Duplicate action id ${String(action.id)}.`);
      }
      actionIds.add(action.id);
      normalizeExplorationAction(action, { encounterCardId: cardId, templates, catalogs });
    }
  }
  transformExplorationData(document);
}

function recordBlocks(source, header) {
  const pattern = new RegExp(`^${header.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*$`, "gmu");
  const matches = [...source.matchAll(pattern)];
  return matches.map((match, index) => ({
    start: match.index,
    end: matches[index + 1]?.index ?? source.length,
  }));
}

function encounterBlock(source, cardId) {
  const blocks = recordBlocks(source, "[[encounter]]");
  for (const block of blocks) {
    const body = source.slice(block.start, block.end);
    const match = /^card-id\s*=\s*"([^"]+)"\s*$/mu.exec(body);
    if (match?.[1].toLowerCase() === cardId.toLowerCase()) return block;
  }
  throw editorError("ENCOUNTER_NOT_FOUND", `Encounter card UUID ${cardId} was not found.`);
}

function actionBlock(source, cardId, slot) {
  const encounter = encounterBlock(source, cardId);
  const body = source.slice(encounter.start, encounter.end);
  const actions = recordBlocks(body, ACTION_HEADER).map((block) => ({
    start: encounter.start + block.start,
    end: encounter.start + block.end,
  }));
  const selected = actions[slot];
  if (selected === undefined || (slot !== 0 && slot !== 1)) {
    throw editorError("ACTION_NOT_FOUND", `Action slot ${String(slot)} was not found.`);
  }
  let contentEnd = selected.end;
  const trailing = source.slice(selected.start, selected.end);
  const beforeComment = /\n(?=\n# selected )/u.exec(trailing);
  const beforeTrailingBlankLines = /\n(?=(?:[ \t]*\n)+$)/u.exec(trailing);
  const boundary = beforeComment ?? beforeTrailingBlankLines;
  if (boundary !== null) contentEnd = selected.start + boundary.index + 1;
  return { start: selected.start, end: contentEnd };
}

function tomlKey(key) {
  return /^[A-Za-z0-9_-]+$/u.test(key) ? key : JSON.stringify(key);
}

function tomlValue(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{ ${entries.map(([key, entry]) =>
      `${tomlKey(key)} = ${tomlValue(entry)}`).join(", ")} }`;
  }
  throw editorError("INVALID_EXPLORATION", "Cannot serialize an empty TOML value.");
}

function actionTomlRecord(action) {
  const values = {
    id: action.id,
    label: action.label,
    "effect-text": action.effectText,
    "template-id": action.templateId,
    "template-variables": action.templateVariables,
    ...(action.selection === undefined ? {} : { selection: action.selection }),
    "effect-kind": action.effectKind,
  };
  for (const [camelKey, tomlKeyName] of Object.entries(CONFIG_KEY_TO_TOML)) {
    if (Object.hasOwn(action, camelKey)) values[tomlKeyName] = action[camelKey];
  }
  const lines = [ACTION_HEADER];
  for (const key of ACTION_FIELD_ORDER) {
    if (Object.hasOwn(values, key)) lines.push(`${key} = ${tomlValue(values[key])}`);
  }
  return `${lines.join("\n")}\n`;
}

function patchRange(source, range, replacement) {
  return source.slice(0, range.start) + replacement + source.slice(range.end);
}

export function patchExplorationProse(source, { cardId, value }) {
  const prose = requiredString(value, "prose").trim();
  const block = encounterBlock(source, cardId);
  const body = source.slice(block.start, block.end);
  const firstAction = body.indexOf(ACTION_HEADER);
  const header = firstAction === -1 ? body : body.slice(0, firstAction);
  const match = /^prose\s*=.*$/mu.exec(header);
  if (match === null) throw editorError("INVALID_EXPLORATION", "Encounter prose field is missing.");
  const range = {
    start: block.start + match.index,
    end: block.start + match.index + match[0].length,
  };
  return patchRange(source, range, `prose = ${tomlValue(prose)}`);
}

export function patchExplorationAction(source, { cardId, slot, action }, context) {
  const normalized = normalizeExplorationAction(action, {
    ...context,
    encounterCardId: cardId,
  });
  const range = actionBlock(source, cardId, slot);
  return {
    source: patchRange(source, range, actionTomlRecord(normalized)),
    action: normalized,
  };
}

function resyncTemplateActions(source, templates, catalogs, templateId) {
  const document = parse(source);
  const replacements = [];
  for (const encounter of document.encounter ?? []) {
    const cardId = encounter["card-id"];
    for (const [slot, actionRaw] of (encounter.action ?? []).entries()) {
      if (actionRaw["template-id"] !== templateId) continue;
      const action = normalizeExplorationAction(camelAction(actionRaw), {
        encounterCardId: cardId,
        templates,
        catalogs,
      });
      replacements.push({ range: actionBlock(source, cardId, slot), replacement: actionTomlRecord(action) });
    }
  }
  return replacements
    .sort((left, right) => right.range.start - left.range.start)
    .reduce((current, entry) => patchRange(current, entry.range, entry.replacement), source);
}

function placeholderNames(template) {
  return [...template.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]).sort();
}

export function editExplorationTemplateSource(templateSource, explorationSource, {
  templateId,
  value,
}, catalogs) {
  const templateText = requiredString(value, "template");
  const parsed = parseEncounterTemplates(templateSource);
  const entry = parsed.document.find((candidate) => candidate.template_id === templateId);
  if (entry === undefined) throw editorError("TEMPLATE_NOT_FOUND", `Template ${String(templateId)} was not found.`);
  if (placeholderNames(entry.template).join("\0") !== placeholderNames(templateText).join("\0")) {
    throw editorError("INVALID_TEMPLATE", "Template edits must preserve the existing placeholder set.");
  }
  const nextDocument = structuredClone(parsed.document);
  nextDocument.find((candidate) => candidate.template_id === templateId).template = templateText;
  const nextTemplateSource = `${JSON.stringify(nextDocument, null, 2)}\n`;
  const templates = templateMap(nextTemplateSource);
  return {
    templateSource: nextTemplateSource,
    explorationSource: resyncTemplateActions(
      explorationSource,
      templates,
      catalogs,
      templateId,
    ),
  };
}

function validateAndBuildJson(source, templates, catalogs) {
  const document = parse(source);
  validateExplorationDocument(document, templates, catalogs);
  return `${JSON.stringify(transformExplorationData(document), null, 2)}\n`;
}

function preparedWrite(destination, content, fileSystem) {
  fileSystem.mkdirSync(dirname(destination), { recursive: true });
  const suffix = `${String(process.pid)}-${String(saveCounter++)}`;
  const temporary = `${destination}.tmp-${suffix}`;
  const backup = `${destination}.bak-${suffix}`;
  fileSystem.writeFileSync(temporary, content);
  return { destination, temporary, backup, hadOriginal: fileSystem.existsSync(destination) };
}

function commitWrites(writes, fileSystem) {
  const committed = [];
  try {
    for (const write of writes) {
      if (write.hadOriginal) fileSystem.renameSync(write.destination, write.backup);
      fileSystem.renameSync(write.temporary, write.destination);
      committed.push(write);
    }
  } catch (error) {
    for (const write of [...committed].reverse()) {
      if (fileSystem.existsSync(write.destination)) fileSystem.rmSync(write.destination);
      if (write.hadOriginal && fileSystem.existsSync(write.backup)) {
        fileSystem.renameSync(write.backup, write.destination);
      }
    }
    for (const write of writes) {
      if (fileSystem.existsSync(write.temporary)) fileSystem.rmSync(write.temporary);
      if (write.hadOriginal && fileSystem.existsSync(write.backup) && !fileSystem.existsSync(write.destination)) {
        fileSystem.renameSync(write.backup, write.destination);
      }
    }
    throw error;
  }
  for (const write of writes) {
    if (write.hadOriginal && fileSystem.existsSync(write.backup)) {
      try {
        fileSystem.rmSync(write.backup);
      } catch {
        // A stale backup is harmless; the complete transaction is already live.
      }
    }
  }
}

function pathsFor(rootDir, options) {
  return {
    exploration: options.explorationTomlPath ?? DEFAULT_EXPLORATION_TOML_PATH,
    templates: options.templatesPath ?? DEFAULT_EXPLORATION_TEMPLATES_PATH,
    cards: options.cardsTomlPath ?? DEFAULT_EXPLORATION_CARDS_PATH,
    dreamsigns: options.dreamsignsTomlPath ?? DEFAULT_EXPLORATION_DREAMSIGNS_PATH,
    json: options.explorationJsonPath ?? DEFAULT_EXPLORATION_JSON_PATH,
  };
}

function readContext(options = {}) {
  const rootDir = options.rootDir ?? ROOT;
  const fileSystem = options.fileSystem ?? defaultFileSystem;
  const paths = pathsFor(rootDir, options);
  const templateSource = fileSystem.readFileSync(join(rootDir, paths.templates), "utf8");
  const catalogs = readCatalogs(rootDir, paths, fileSystem);
  return {
    rootDir,
    fileSystem,
    paths,
    templateSource,
    templates: templateMap(templateSource),
    catalogs,
  };
}

export function readExplorationEditorData(options = {}) {
  const context = readContext(options);
  const random = options.random ?? Math.random;
  const source = context.fileSystem.readFileSync(
    join(context.rootDir, context.paths.exploration),
    "utf8",
  );
  const document = parse(source);
  validateExplorationDocument(document, context.templates, context.catalogs);
  const catalog = [...context.catalogs.cards.values()];
  const playerDeck = buildSimulatedPlayerDeck(catalog, random);
  const encounters = document.encounter.map((encounter) => {
    const cardId = encounter["card-id"];
    const card = context.catalogs.cards.get(cardId.toLowerCase());
    return {
      cardId,
      prose: encounter.prose,
      cardName: card.name,
      cardAbilityText: card.renderedText,
      imageNumber: card.imageNumber,
      actions: encounter.action.map((action) => {
        const authoredAction = camelAction(action);
        const template = context.templates.get(action["template-id"]);
        const rendered = renderRuntimeTemplate(
          template,
          authoredAction.templateVariables,
          authoredAction.selection,
          catalog,
          playerDeck,
          random,
        );
        return {
          ...authoredAction,
          template,
          renderedEffectText: rendered.renderedTemplate,
          renderedEffectParts: rendered.renderedTemplateParts,
          runtimeCardSelections: rendered.runtimeCardSelections,
        };
      }),
    };
  });
  return {
    encounters,
    templates: templateEntryList(context.templateSource),
    effectDefinitions: EXPLORATION_EFFECT_DEFINITIONS,
    predicates: EXPLORATION_PREDICATES,
    transfigurations: EXPLORATION_TRANSFIGURATIONS,
    subtypes: context.catalogs.subtypes,
    cards: context.catalogs.runtimeCards,
    dreamsigns: context.catalogs.runtimeDreamsigns,
  };
}

function writeExploration(nextSource, context, extraWrites = []) {
  const json = validateAndBuildJson(nextSource, context.templates, context.catalogs);
  const writes = [
    preparedWrite(join(context.rootDir, context.paths.exploration), nextSource, context.fileSystem),
    preparedWrite(join(context.rootDir, context.paths.json), json, context.fileSystem),
    ...extraWrites,
  ];
  commitWrites(writes, context.fileSystem);
}

export function updateExplorationProse(edit, options = {}) {
  const context = readContext(options);
  const source = context.fileSystem.readFileSync(join(context.rootDir, context.paths.exploration), "utf8");
  const nextSource = patchExplorationProse(source, edit);
  writeExploration(nextSource, context);
  return readExplorationEditorData(options);
}

export function updateExplorationAction(edit, options = {}) {
  const context = readContext(options);
  const source = context.fileSystem.readFileSync(join(context.rootDir, context.paths.exploration), "utf8");
  const result = patchExplorationAction(source, edit, context);
  writeExploration(result.source, context);
  return readExplorationEditorData(options);
}

export function updateExplorationTemplate(edit, options = {}) {
  const context = readContext(options);
  const source = context.fileSystem.readFileSync(join(context.rootDir, context.paths.exploration), "utf8");
  const result = editExplorationTemplateSource(
    context.templateSource,
    source,
    edit,
    context.catalogs,
  );
  context.templates = templateMap(result.templateSource);
  const json = validateAndBuildJson(result.explorationSource, context.templates, context.catalogs);
  const writes = [
    preparedWrite(join(context.rootDir, context.paths.templates), result.templateSource, context.fileSystem),
    preparedWrite(join(context.rootDir, context.paths.exploration), result.explorationSource, context.fileSystem),
    preparedWrite(join(context.rootDir, context.paths.json), json, context.fileSystem),
  ];
  commitWrites(writes, context.fileSystem);
  return readExplorationEditorData(options);
}

export const explorationEditorInternals = {
  actionBlock,
  actionTomlRecord,
  camelAction,
  resyncTemplateActions,
  validateExplorationDocument,
};
