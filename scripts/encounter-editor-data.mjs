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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const TEMPLATE_PAIR_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ACTION_FIELDS = new Set(["label", "effect_text", "resolution"]);

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
  if (!Number.isInteger(action.template_id) || action.template_id < 0) {
    throw new Error(`${label}.template_id must be a non-negative integer.`);
  }
  requiredString(action.label, `${label}.label`);
  requiredString(action.effect_text, `${label}.effect_text`);
  requiredString(action.resolution, `${label}.resolution`);
  return action;
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
  if (Object.hasOwn(candidate, "selected") && candidate.selected !== true) {
    throw new Error(`${label}.selected may only be present with the value true.`);
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
    let selectedCount = 0;
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
      if (candidate.selected === true) selectedCount += 1;
    });
    if (selectedCount !== 1) {
      throw new Error(
        `${cardId} must have exactly one selected encounter; found ${String(selectedCount)}.`,
      );
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

function readCardIndex(rootDir, cardTomlPath, fileSystem) {
  const source = fileSystem.readFileSync(join(rootDir, cardTomlPath), "utf8");
  const parsed = parseToml(source);
  if (!Array.isArray(parsed.cards)) {
    throw new Error(`${cardTomlPath} must contain a [[cards]] array.`);
  }
  const index = new Map();
  for (const cardRaw of parsed.cards) {
    const card = objectRecord(cardRaw, "card");
    if (typeof card.id !== "string") continue;
    const name = requiredString(card.name, `card ${card.id} name`);
    const imageNumber = card["image-number"];
    if (!Number.isInteger(imageNumber) || imageNumber < 0) {
      continue;
    }
    index.set(card.id, { name, imageNumber });
  }
  return index;
}

export function readEncounterEditorGroups({
  rootDir = ROOT,
  candidatesPath = DEFAULT_ENCOUNTER_CANDIDATES_PATH,
  cardTomlPath = DEFAULT_ENCOUNTER_CARD_PATH,
  fileSystem = defaultFileSystem,
} = {}) {
  const source = fileSystem.readFileSync(join(rootDir, candidatesPath), "utf8");
  const groups = parseEncounterCandidates(source);
  const cards = readCardIndex(rootDir, cardTomlPath, fileSystem);
  return Object.entries(groups).map(([cardId, encounters]) => {
    const card = cards.get(cardId);
    if (card === undefined) {
      throw new Error(`Encounter candidate references unknown card UUID ${cardId}.`);
    }
    return {
      cardId,
      cardName: card.name,
      imageNumber: card.imageNumber,
      encounters,
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

export function selectEncounterCandidate(document, { cardId, templatePairId }) {
  canonicalUuid(cardId, "cardId");
  requiredString(templatePairId, "templatePairId");
  const next = cloneDocument(document);
  const encounters = groupFor(next, cardId);
  const selected = candidateFor(encounters, templatePairId);
  for (const candidate of encounters) {
    if (candidate === selected) {
      candidate.selected = true;
    } else {
      delete candidate.selected;
    }
  }
  validateEncounterCandidates(next);
  return {
    document: next,
    confirmation: {
      cardId,
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
      throw new Error("Only prose, label, effect_text, and resolution are editable.");
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
