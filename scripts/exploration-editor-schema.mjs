import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import {
  buildExplorationEffectDefinitions,
  EXPLORATION_PREDICATES,
  EXPLORATION_TRANSFIGURATIONS,
} from "./exploration-effect-definitions.mjs";

export {
  buildExplorationEffectDefinitions,
  EXPLORATION_PREDICATES,
  EXPLORATION_TRANSFIGURATIONS,
} from "./exploration-effect-definitions.mjs";

const authoredSource = parse(readFileSync(
  resolve(import.meta.dirname, "../data/exploration.toml"),
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
