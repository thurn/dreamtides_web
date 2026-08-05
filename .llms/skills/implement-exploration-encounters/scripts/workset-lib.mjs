import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import {
  parseEncounterCandidates,
} from "../../../../scripts/exploration-candidates-editor-data.mjs";
import {
  generateSelectedEncountersToml,
} from "../../../../scripts/generate-selected-encounters-toml.mjs";

export const REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../../../..", import.meta.url)),
);
export const DEFAULT_CANDIDATES_PATH = resolve(
  REPOSITORY_ROOT,
  "data/exploration_candidates.json",
);
export const DEFAULT_EXPLORATION_PATH = resolve(
  REPOSITORY_ROOT,
  "data/tabula/exploration.toml",
);
export const DEFAULT_TEMPLATES_PATH = resolve(
  REPOSITORY_ROOT,
  "data/templates.json",
);

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function parseTomlDocument(source, label) {
  try {
    return parseToml(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} must contain valid TOML: ${message}`);
  }
}

export function encounterRecordsFromToml(source, label) {
  const parsed = parseTomlDocument(source, label);
  const encounters = parsed.encounter ?? [];
  if (!Array.isArray(encounters)) {
    throw new Error(`${label} must contain an [[encounter]] array.`);
  }
  const byNormalizedId = new Map();
  for (const [index, encounter] of encounters.entries()) {
    if (encounter === null || typeof encounter !== "object" || Array.isArray(encounter)) {
      throw new Error(`${label} encounter ${String(index)} must be a TOML table.`);
    }
    const cardId = nonEmptyString(
      encounter["card-id"],
      `${label} encounter ${String(index)} card-id`,
    );
    const normalizedId = cardId.toLowerCase();
    if (byNormalizedId.has(normalizedId)) {
      throw new Error(`${label} has duplicate encounter card-id ${cardId}.`);
    }
    byNormalizedId.set(normalizedId, encounter);
  }
  return byNormalizedId;
}

export function buildEncounterWorkset({
  candidatesSource,
  explorationSource,
  templatesSource,
  requestedCardIds = [],
}) {
  const candidates = parseEncounterCandidates(candidatesSource);
  const candidateEntries = Object.entries(candidates);
  const candidateByNormalizedId = new Map();
  for (const [cardId, encounters] of candidateEntries) {
    const normalizedId = cardId.toLowerCase();
    if (candidateByNormalizedId.has(normalizedId)) {
      throw new Error(`Candidate catalog has duplicate card UUID ${cardId}.`);
    }
    candidateByNormalizedId.set(normalizedId, { cardId, encounters });
  }
  const liveByNormalizedId = encounterRecordsFromToml(
    explorationSource,
    "exploration.toml",
  );
  const unimplementedEntries = candidateEntries.filter(
    ([cardId]) => !liveByNormalizedId.has(cardId.toLowerCase()),
  );
  let selectedEntries = unimplementedEntries;

  if (requestedCardIds.length > 0) {
    const seen = new Set();
    selectedEntries = requestedCardIds.map((requestedCardId) => {
      const normalizedId = nonEmptyString(
        requestedCardId,
        "Requested card UUID",
      ).toLowerCase();
      if (seen.has(normalizedId)) {
        throw new Error(`Requested card UUID ${requestedCardId} was repeated.`);
      }
      seen.add(normalizedId);
      const candidate = candidateByNormalizedId.get(normalizedId);
      if (candidate === undefined) {
        throw new Error(`Requested card UUID ${requestedCardId} is absent from the candidate catalog.`);
      }
      if (liveByNormalizedId.has(normalizedId)) {
        throw new Error(`Requested card UUID ${requestedCardId} already has a live encounter.`);
      }
      return [candidate.cardId, candidate.encounters];
    });
  }

  const selectedCandidates = Object.fromEntries(selectedEntries);
  const selectedToml = selectedEntries.length === 0
    ? null
    : generateSelectedEncountersToml(
        `${JSON.stringify(selectedCandidates, null, 2)}\n`,
        templatesSource,
      );
  const unimplementedCardIds = unimplementedEntries.map(([cardId]) => cardId);
  const selectedCardIds = selectedEntries.map(([cardId]) => cardId);

  return {
    report: {
      candidateCount: candidateEntries.length,
      liveEncounterCount: liveByNormalizedId.size,
      representedCandidateCount:
        candidateEntries.length - unimplementedEntries.length,
      unimplementedCount: unimplementedEntries.length,
      unimplementedCardIds,
      selectedCount: selectedCardIds.length,
      selectedCardIds,
    },
    selectedToml,
  };
}

export function verifyEncounterWorkset({ worksetSource, explorationSource }) {
  const worksetByNormalizedId = encounterRecordsFromToml(
    worksetSource,
    "encounter workset",
  );
  if (worksetByNormalizedId.size === 0) {
    throw new Error("Encounter workset must contain at least one encounter.");
  }
  const liveByNormalizedId = encounterRecordsFromToml(
    explorationSource,
    "exploration.toml",
  );
  const verifiedCardIds = [];
  const actionIds = new Set();

  for (const [normalizedId, worksetEncounter] of worksetByNormalizedId) {
    const liveEncounter = liveByNormalizedId.get(normalizedId);
    const cardId = nonEmptyString(
      worksetEncounter["card-id"],
      "Encounter workset card-id",
    );
    if (liveEncounter === undefined) {
      throw new Error(`Live exploration.toml is missing workset card UUID ${cardId}.`);
    }
    const actions = liveEncounter.action;
    if (!Array.isArray(actions) || actions.length !== 2) {
      throw new Error(`Live encounter ${cardId} must contain exactly two actions.`);
    }
    for (const [slot, action] of actions.entries()) {
      if (action === null || typeof action !== "object" || Array.isArray(action)) {
        throw new Error(`Live encounter ${cardId} action ${String(slot)} must be a TOML table.`);
      }
      const actionId = nonEmptyString(
        action.id,
        `Live encounter ${cardId} action ${String(slot)} id`,
      );
      if (actionIds.has(actionId)) {
        throw new Error(`Workset live encounters have duplicate action id ${actionId}.`);
      }
      actionIds.add(actionId);
      nonEmptyString(
        action.label,
        `Live encounter ${cardId} action ${String(slot)} label`,
      );
      nonEmptyString(
        action["effect-text"],
        `Live encounter ${cardId} action ${String(slot)} effect-text`,
      );
      nonEmptyString(
        action["effect-kind"],
        `Live encounter ${cardId} action ${String(slot)} effect-kind`,
      );
    }
    verifiedCardIds.push(cardId);
  }

  return {
    worksetEncounterCount: worksetByNormalizedId.size,
    verifiedEncounterCount: verifiedCardIds.length,
    verifiedCardIds,
  };
}

export function readSources({ candidatesPath, explorationPath, templatesPath }) {
  return {
    candidatesSource: readFileSync(candidatesPath, "utf8"),
    explorationSource: readFileSync(explorationPath, "utf8"),
    templatesSource: readFileSync(templatesPath, "utf8"),
  };
}
