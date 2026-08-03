import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const DEFAULT_ENCOUNTER_CANDIDATES_PATH = join(
  "data",
  "encounter_candidates.json",
);
export const DEFAULT_ENCOUNTER_CARD_PATH = join(
  "data",
  "tabula",
  "cards.toml",
);
export const DEFAULT_ENCOUNTER_TEMPLATES_PATH = join("data", "templates.json");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const TEMPLATE_PAIR_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ACTION_FIELDS = new Set(["label", "resolution"]);
const LEGACY_ACTION_FIELDS = new Set(["effect_text", "template"]);
const SELECTION_KINDS = ["prose", "actions"];
const PLACEHOLDER_PATTERN = /\{([a-z][a-z0-9_]*)\}/gu;
const SPECIAL_PATTERN = /\$[A-Z][A-Z0-9_]*/gu;

const defaultFileSystem = {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
};

let saveCounter = 0;

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

function canonicalUuid(value, label) {
  const uuid = requiredString(value, label);
  if (!UUID_PATTERN.test(uuid)) {
    throw new Error(`${label} must be a canonical lowercase UUID.`);
  }
  return uuid;
}

function validateAction(raw, label) {
  const action = objectRecord(raw, label);
  for (const legacyField of LEGACY_ACTION_FIELDS) {
    if (Object.hasOwn(action, legacyField)) {
      throw new Error(`${label}.${legacyField} is forbidden; template text lives only in data/templates.json.`);
    }
  }
  if (!Number.isInteger(action.template_id) || action.template_id < 0) {
    throw new Error(`${label}.template_id must be a non-negative integer.`);
  }
  requiredString(action.label, `${label}.label`);
  requiredString(action.resolution, `${label}.resolution`);
  objectRecord(action.variables, `${label}.variables`);
  return action;
}

function parseEncounterTemplates(source) {
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
      throw new Error(`templates[${String(index)}].template_id must be a non-negative integer.`);
    }
    const template = requiredString(entry.template, `templates[${String(index)}].template`);
    if (byId.has(entry.template_id)) {
      throw new Error(`templates.json has duplicate template_id ${String(entry.template_id)}.`);
    }
    byId.set(entry.template_id, template);
  });
  return { document: raw, byId };
}

function displayVariable(value, label) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return requiredString(value.display_name, `${label}.display_name`);
  }
  throw new Error(`${label} must be a JSON primitive or an entity reference with display_name.`);
}

export function renderEncounterTemplate(template, variables) {
  const values = objectRecord(variables, "variables");
  return template.replace(PLACEHOLDER_PATTERN, (_match, placeholder) => {
    if (!Object.hasOwn(values, placeholder)) {
      throw new Error(`variables is missing {${placeholder}}.`);
    }
    return displayVariable(values[placeholder], `variables.${placeholder}`);
  });
}

function validateTemplateUsage(document, templatesById) {
  for (const [cardId, encounters] of Object.entries(document)) {
    encounters.forEach((candidate, candidateIndex) => {
      candidate.actions.forEach((action, actionIndex) => {
        const path = `encounter candidates.${cardId}[${String(candidateIndex)}].actions[${String(actionIndex)}]`;
        const template = templatesById.get(action.template_id);
        if (template === undefined) {
          throw new Error(`${path}.template_id does not identify a canonical template.`);
        }
        const placeholders = new Set(Array.from(template.matchAll(PLACEHOLDER_PATTERN), (match) => match[1]));
        const variableKeys = Object.keys(action.variables);
        const missing = [...placeholders].filter((placeholder) => !Object.hasOwn(action.variables, placeholder));
        const extra = variableKeys.filter((key) => !placeholders.has(key));
        if (missing.length > 0) {
          throw new Error(`${path}.variables is missing ${missing.map((name) => `{${name}}`).join(", ")}.`);
        }
        if (extra.length > 0) {
          throw new Error(`${path}.variables contains values absent from template ${String(action.template_id)}: ${extra.join(", ")}.`);
        }
        const specials = new Set(template.match(SPECIAL_PATTERN) ?? []);
        if (action.selection !== undefined) {
          const selection = objectRecord(action.selection, `${path}.selection`);
          for (const [special, ruleRaw] of Object.entries(selection)) {
            if (!specials.has(special)) {
              throw new Error(`${path}.selection.${special} is absent from template ${String(action.template_id)}.`);
            }
            const rule = objectRecord(ruleRaw, `${path}.selection.${special}`);
            requiredString(rule.predicate, `${path}.selection.${special}.predicate`);
          }
        }
        renderEncounterTemplate(template, action.variables);
      });
    });
  }
}

function validateCandidate(raw, label) {
  const candidate = objectRecord(raw, label);
  const pairId = requiredString(candidate.template_pair_id, `${label}.template_pair_id`);
  if (!TEMPLATE_PAIR_PATTERN.test(pairId)) {
    throw new Error(`${label}.template_pair_id must be a canonical slug.`);
  }
  requiredString(candidate.prose, `${label}.prose`);
  if (!Number.isInteger(candidate.rank) || candidate.rank < 1) {
    throw new Error(`${label}.rank must be a positive integer.`);
  }
  if (Object.hasOwn(candidate, "selected")) {
    const selected = objectRecord(candidate.selected, `${label}.selected`);
    const selectedKeys = Object.keys(selected);
    if (selectedKeys.length === 0) {
      throw new Error(`${label}.selected must mark prose, actions, or both.`);
    }
    for (const selectionKind of selectedKeys) {
      if (!SELECTION_KINDS.includes(selectionKind) || selected[selectionKind] !== true) {
        throw new Error(`${label}.selected may only mark prose or actions with the value true.`);
      }
    }
  }
  if (!Array.isArray(candidate.actions) || candidate.actions.length !== 2) {
    throw new Error(`${label}.actions must contain exactly two actions.`);
  }
  const actionIds = new Set();
  candidate.actions.forEach((action, actionIndex) => {
    const validated = validateAction(action, `${label}.actions[${String(actionIndex)}]`);
    if (actionIds.has(validated.template_id)) {
      throw new Error(`${label} has duplicate action template_id ${String(validated.template_id)}.`);
    }
    actionIds.add(validated.template_id);
  });
  return candidate;
}

export function validateEncounterCandidates(raw) {
  const document = objectRecord(raw, "Encounter candidates");
  const groups = Object.entries(document);
  if (groups.length === 0) {
    throw new Error("Encounter candidates must be a non-empty object.");
  }
  for (const [cardIdRaw, encounters] of groups) {
    const cardId = canonicalUuid(cardIdRaw, "Encounter card UUID");
    const label = `encounter candidates.${cardId}`;
    if (!Array.isArray(encounters) || encounters.length === 0) {
      throw new Error(`${label} must be a non-empty array.`);
    }
    const pairIds = new Set();
    const ranks = new Set();
    const selectedCounts = { prose: 0, actions: 0 };
    encounters.forEach((candidateRaw, candidateIndex) => {
      const candidate = validateCandidate(
        candidateRaw,
        `${label}[${String(candidateIndex)}]`,
      );
      if (pairIds.has(candidate.template_pair_id)) {
        throw new Error(`${cardId} has duplicate template_pair_id ${candidate.template_pair_id}.`);
      }
      if (ranks.has(candidate.rank)) {
        throw new Error(`${cardId} has duplicate rank ${String(candidate.rank)}.`);
      }
      pairIds.add(candidate.template_pair_id);
      ranks.add(candidate.rank);
      for (const selectionKind of SELECTION_KINDS) {
        if (candidate.selected?.[selectionKind] === true) selectedCounts[selectionKind] += 1;
      }
    });
    for (const selectionKind of SELECTION_KINDS) {
      if (selectedCounts[selectionKind] !== 1) {
        throw new Error(
          `${cardId} must have exactly one selected ${selectionKind} candidate; found ${String(selectedCounts[selectionKind])}.`,
        );
      }
    }
  }
  return document;
}

export function parseEncounterCandidates(source) {
  let raw;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error("encounter_candidates.json must contain valid JSON.");
  }
  return validateEncounterCandidates(raw);
}

function readCardIndex(rootDir, cardTomlPath, fileSystem, encounterCardIds) {
  const source = fileSystem.readFileSync(join(rootDir, cardTomlPath), "utf8");
  const parsed = parseToml(source);
  if (!Array.isArray(parsed.cards)) {
    throw new Error(`${cardTomlPath} must contain a [[cards]] array.`);
  }
  const index = new Map();
  for (const cardRaw of parsed.cards) {
    const card = objectRecord(cardRaw, "card");
    if (typeof card.id !== "string") continue;
    if (!encounterCardIds.has(card.id)) continue;
    const name = requiredString(card.name, `card ${card.id} name`);
    const abilityText = requiredString(
      card["rendered-text"],
      `card ${card.id} rendered-text`,
    );
    const imageNumber = card["image-number"];
    if (!Number.isInteger(imageNumber) || imageNumber < 0) {
      continue;
    }
    index.set(card.id, { name, abilityText, imageNumber });
  }
  return index;
}

export function readEncounterEditorGroups({
  rootDir = ROOT,
  candidatesPath = DEFAULT_ENCOUNTER_CANDIDATES_PATH,
  cardTomlPath = DEFAULT_ENCOUNTER_CARD_PATH,
  templatesPath = DEFAULT_ENCOUNTER_TEMPLATES_PATH,
  fileSystem = defaultFileSystem,
} = {}) {
  const source = fileSystem.readFileSync(join(rootDir, candidatesPath), "utf8");
  const groups = parseEncounterCandidates(source);
  const templates = parseEncounterTemplates(
    fileSystem.readFileSync(join(rootDir, templatesPath), "utf8"),
  );
  validateTemplateUsage(groups, templates.byId);
  const cards = readCardIndex(
    rootDir,
    cardTomlPath,
    fileSystem,
    new Set(Object.keys(groups)),
  );
  return Object.entries(groups).map(([cardId, encounters]) => {
    const card = cards.get(cardId);
    if (card === undefined) {
      throw new Error(`Encounter candidate references unknown card UUID ${cardId}.`);
    }
    return {
      cardId,
      cardName: card.name,
      cardAbilityText: card.abilityText,
      imageNumber: card.imageNumber,
      encounters: encounters.map((candidate) => ({
        ...candidate,
        actions: candidate.actions.map((action) => {
          const template = templates.byId.get(action.template_id);
          return {
            ...action,
            template,
            rendered_template: renderEncounterTemplate(template, action.variables),
          };
        }),
      })),
    };
  });
}

function groupFor(document, cardId) {
  if (!Object.hasOwn(document, cardId)) {
    const error = new Error(`Encounter card UUID ${cardId} was not found.`);
    error.code = "ENCOUNTER_NOT_FOUND";
    throw error;
  }
  return document[cardId];
}

function candidateFor(encounters, templatePairId) {
  const candidate = encounters.find(
    (encounter) => encounter.template_pair_id === templatePairId,
  );
  if (candidate === undefined) {
    const error = new Error(`Encounter candidate ${templatePairId} was not found.`);
    error.code = "CANDIDATE_NOT_FOUND";
    throw error;
  }
  return candidate;
}

function cloneDocument(document) {
  return structuredClone(document);
}

export function selectEncounterCandidate(document, { cardId, templatePairId, selectionKind }) {
  canonicalUuid(cardId, "cardId");
  requiredString(templatePairId, "templatePairId");
  if (!SELECTION_KINDS.includes(selectionKind)) {
    throw new Error("selectionKind must be prose or actions.");
  }
  const next = cloneDocument(document);
  const encounters = groupFor(next, cardId);
  const selected = candidateFor(encounters, templatePairId);
  for (const candidate of encounters) {
    const markers = { ...(candidate.selected ?? {}) };
    if (candidate === selected) {
      markers[selectionKind] = true;
    } else {
      delete markers[selectionKind];
    }
    const orderedMarkers = Object.fromEntries(
      SELECTION_KINDS
        .filter((kind) => markers[kind] === true)
        .map((kind) => [kind, true]),
    );
    if (Object.keys(orderedMarkers).length === 0) {
      delete candidate.selected;
    } else {
      candidate.selected = orderedMarkers;
    }
  }
  validateEncounterCandidates(next);
  return {
    document: next,
    confirmation: {
      cardId,
      selectionKind,
      selectedTemplatePairId: templatePairId,
      selectedRank: selected.rank,
    },
  };
}

export function editEncounterCandidateText(
  document,
  { cardId, templatePairId, field, actionTemplateId, value },
) {
  canonicalUuid(cardId, "cardId");
  requiredString(templatePairId, "templatePairId");
  const confirmedValue = requiredString(value, "value");
  const next = cloneDocument(document);
  const encounters = groupFor(next, cardId);
  const candidate = candidateFor(encounters, templatePairId);
  if (field === "prose") {
    if (actionTemplateId !== undefined) {
      throw new Error("prose edits must not include actionTemplateId.");
    }
    candidate.prose = confirmedValue;
  } else {
    if (!ACTION_FIELDS.has(field)) {
      throw new Error("Only prose, label, and resolution are encounter-candidate text fields.");
    }
    if (!Number.isInteger(actionTemplateId) || actionTemplateId < 0) {
      throw new Error("Action text edits require a non-negative actionTemplateId.");
    }
    const action = candidate.actions.find(
      (entry) => entry.template_id === actionTemplateId,
    );
    if (action === undefined) {
      const error = new Error(`Action template ${String(actionTemplateId)} was not found.`);
      error.code = "ACTION_NOT_FOUND";
      throw error;
    }
    action[field] = confirmedValue;
  }
  validateEncounterCandidates(next);
  return {
    document: next,
    confirmation: {
      cardId,
      templatePairId,
      field,
      ...(actionTemplateId === undefined ? {} : { actionTemplateId }),
      value: confirmedValue,
    },
  };
}

export function serializeEncounterCandidates(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function editEncounterTemplate(templatesDocument, candidatesDocument, { templateId, value }) {
  if (!Number.isInteger(templateId) || templateId < 0) {
    throw new Error("templateId must be a non-negative integer.");
  }
  const confirmedValue = requiredString(value, "value");
  const next = structuredClone(templatesDocument);
  const entry = next.find((candidate) => candidate.template_id === templateId);
  if (entry === undefined) {
    const error = new Error(`Template ${String(templateId)} was not found.`);
    error.code = "TEMPLATE_NOT_FOUND";
    throw error;
  }
  entry.template = confirmedValue;
  const parsed = parseEncounterTemplates(JSON.stringify(next));
  validateTemplateUsage(candidatesDocument, parsed.byId);
  return {
    document: parsed.document,
    confirmation: { templateId, template: confirmedValue },
  };
}

export function serializeEncounterTemplates(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function tempPathFor(destination, suffix) {
  saveCounter += 1;
  return `${destination}.${process.pid}.${Date.now()}.${saveCounter}.${suffix}`;
}

export function commitEncounterCandidates(
  document,
  {
    rootDir = ROOT,
    candidatesPath = DEFAULT_ENCOUNTER_CANDIDATES_PATH,
    fileSystem = defaultFileSystem,
  } = {},
) {
  validateEncounterCandidates(document);
  const destination = join(rootDir, candidatesPath);
  const temp = tempPathFor(destination, "tmp");
  const backup = tempPathFor(destination, "bak");
  const hadDestination = fileSystem.existsSync(destination);
  try {
    fileSystem.writeFileSync(temp, serializeEncounterCandidates(document));
    if (hadDestination) fileSystem.renameSync(destination, backup);
    fileSystem.renameSync(temp, destination);
  } catch (error) {
    fileSystem.rmSync(temp, { force: true });
    if (hadDestination && fileSystem.existsSync(backup)) {
      fileSystem.rmSync(destination, { force: true });
      fileSystem.renameSync(backup, destination);
    }
    throw error;
  }
  if (hadDestination) {
    try {
      fileSystem.rmSync(backup, { force: true });
    } catch {
      // The committed destination is authoritative; stale backup cleanup is best-effort.
    }
  }
}

export function commitEncounterTemplates(
  document,
  {
    rootDir = ROOT,
    templatesPath = DEFAULT_ENCOUNTER_TEMPLATES_PATH,
    fileSystem = defaultFileSystem,
  } = {},
) {
  const parsed = parseEncounterTemplates(JSON.stringify(document));
  const destination = join(rootDir, templatesPath);
  const temp = tempPathFor(destination, "tmp");
  const backup = tempPathFor(destination, "bak");
  const hadDestination = fileSystem.existsSync(destination);
  try {
    fileSystem.writeFileSync(temp, serializeEncounterTemplates(parsed.document));
    if (hadDestination) fileSystem.renameSync(destination, backup);
    fileSystem.renameSync(temp, destination);
  } catch (error) {
    fileSystem.rmSync(temp, { force: true });
    if (hadDestination && fileSystem.existsSync(backup)) {
      fileSystem.rmSync(destination, { force: true });
      fileSystem.renameSync(backup, destination);
    }
    throw error;
  }
  if (hadDestination) {
    try {
      fileSystem.rmSync(backup, { force: true });
    } catch {
      // The committed destination is authoritative; stale backup cleanup is best-effort.
    }
  }
}

export function updateEncounterCandidates(
  edit,
  {
    rootDir = ROOT,
    candidatesPath = DEFAULT_ENCOUNTER_CANDIDATES_PATH,
    fileSystem = defaultFileSystem,
  } = {},
) {
  const source = fileSystem.readFileSync(join(rootDir, candidatesPath), "utf8");
  const document = parseEncounterCandidates(source);
  const result = edit(document);
  commitEncounterCandidates(result.document, {
    rootDir,
    candidatesPath,
    fileSystem,
  });
  return result.confirmation;
}

export function updateEncounterTemplate(
  edit,
  {
    rootDir = ROOT,
    candidatesPath = DEFAULT_ENCOUNTER_CANDIDATES_PATH,
    templatesPath = DEFAULT_ENCOUNTER_TEMPLATES_PATH,
    fileSystem = defaultFileSystem,
  } = {},
) {
  const candidates = parseEncounterCandidates(
    fileSystem.readFileSync(join(rootDir, candidatesPath), "utf8"),
  );
  const templates = parseEncounterTemplates(
    fileSystem.readFileSync(join(rootDir, templatesPath), "utf8"),
  );
  const result = edit(templates.document, candidates);
  commitEncounterTemplates(result.document, { rootDir, templatesPath, fileSystem });
  return result.confirmation;
}
