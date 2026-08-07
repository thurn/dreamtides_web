import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";

export const EXPLORATION_PREDICATES = [
  { value: "", label: "Any card" },
  { value: "character", label: "Character" },
  { value: "event", label: "Event" },
  { value: "cheap-character", label: "≤2● cost Character" },
  { value: "spirit-animal", label: "Spirit Animal" },
  { value: "survivor", label: "Survivor" },
  { value: "warrior", label: "Warrior" },
];

export const EXPLORATION_TRANSFIGURATIONS = [
  "Empowered", "Amplified", "Kindled", "Inspired", "Enduring",
  "Hastened", "Resonant", "Attuned", "Perfected",
];

const record = (value, path) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`exploration.toml: ${path} must be a table`);
  }
  return value;
};

const string = (value, path, { allowEmpty = false } = {}) => {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new Error(`exploration.toml: ${path} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
  return value;
};

const stringArray = (value, path) => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(`exploration.toml: ${path} must be an array of non-empty strings`);
  }
  return value;
};

const integerArray = (value, path) => {
  if (!Array.isArray(value) || value.some((entry) => !Number.isInteger(entry) || entry <= 0)) {
    throw new Error(`exploration.toml: ${path} must be an array of positive integers`);
  }
  return value;
};

const COPY_SLOTS = new Set([
  "action-label", "count", "subtype", "transfiguration", "essence-per-spark",
]);

const copyTemplate = (value, path) => {
  const result = string(value, path, { allowEmpty: true });
  for (const match of result.matchAll(/\{([^{}]+)\}/gu)) {
    if (!COPY_SLOTS.has(match[1])) {
      throw new Error(`exploration.toml: ${path} has unknown copy slot {${match[1]}}`);
    }
  }
  return result;
};

/** Compile designer/editor effect definitions from the authored TOML document. */
export function buildExplorationEffectDefinitions(source) {
  if (source["schema-version"] !== 1) {
    throw new Error("exploration.toml: schema-version must be 1");
  }
  const rawDefinitions = source["effect-kind"];
  if (!Array.isArray(rawDefinitions) || rawDefinitions.length === 0) {
    throw new Error("exploration.toml: requires [[effect-kind]] entries");
  }
  const seen = new Set();
  return rawDefinitions.map((raw, index) => {
    const path = `effect-kind[${String(index)}]`;
    const entry = record(raw, path);
    const kind = string(entry.kind, `${path}.kind`);
    if (seen.has(kind)) throw new Error(`exploration.toml: duplicate effect-kind ${kind}`);
    seen.add(kind);
    const copy = record(entry.copy, `${path}.copy`);
    const fields = (entry.field ?? []).map((rawField, fieldIndex) => {
      const fieldPath = `${path}.field[${String(fieldIndex)}]`;
      const item = record(rawField, fieldPath);
      return {
        key: string(item.key, `${fieldPath}.key`),
        label: string(item.label, `${fieldPath}.label`),
        control: string(item.control, `${fieldPath}.control`),
        ...(item.optional === undefined ? {} : { optional: item.optional }),
        ...(item["default-value"] === undefined ? {} : { defaultValue: item["default-value"] }),
        ...(item.min === undefined ? {} : { min: item.min }),
        ...(item.step === undefined ? {} : { step: item.step }),
        ...(item.resource === undefined ? {} : { resource: item.resource }),
        ...(item["template-ids"] === undefined ? {} : { templateIds: integerArray(item["template-ids"], `${fieldPath}.template-ids`) }),
      };
    });
    const defaultSelectionPolicyId = entry["default-selection-policy-id"];
    const allowedSelectionPolicyIds = entry["allowed-selection-policy-ids"];
    if ((defaultSelectionPolicyId === undefined) !== (allowedSelectionPolicyIds === undefined)) {
      throw new Error(`exploration.toml: ${path} must define both selection-policy keys`);
    }
    return {
      kind,
      label: string(entry.label, `${path}.label`),
      templateIds: integerArray(entry["template-ids"], `${path}.template-ids`),
      canonicalMechanicId: string(entry["canonical-mechanic-id"], `${path}.canonical-mechanic-id`),
      ...(defaultSelectionPolicyId === undefined ? {} : {
        defaultSelectionPolicyId: string(defaultSelectionPolicyId, `${path}.default-selection-policy-id`),
        allowedSelectionPolicyIds: stringArray(allowedSelectionPolicyIds, `${path}.allowed-selection-policy-ids`),
      }),
      copy: {
        followupTitle: copyTemplate(copy["followup-title"], `${path}.copy.followup-title`),
        followupSubtitle: copyTemplate(copy["followup-subtitle"], `${path}.copy.followup-subtitle`),
      },
      fields,
    };
  });
}

const authoredSource = parse(readFileSync(
  resolve(import.meta.dirname, "../data/tabula/exploration.toml"),
  "utf8",
));

export const EXPLORATION_EFFECT_DEFINITIONS = buildExplorationEffectDefinitions(authoredSource);
export const EXPLORATION_EFFECT_DEFINITION_BY_KIND = new Map(
  EXPLORATION_EFFECT_DEFINITIONS.map((definition) => [definition.kind, definition]),
);
export const EXPLORATION_EFFECT_FIELD_KEYS = new Set(
  EXPLORATION_EFFECT_DEFINITIONS.flatMap((definition) => definition.fields.map((entry) => entry.key)),
);

export function predicateDisplayName(predicate) {
  return EXPLORATION_PREDICATES.find((entry) => entry.value === predicate)?.label ?? predicate;
}
