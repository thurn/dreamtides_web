export {
  EXPLORATION_EFFECT_SCHEMAS,
  EXPLORATION_PREDICATES,
  EXPLORATION_TRANSFIGURATIONS,
} from "./exploration-effect-editor-schema.mjs";

import { EXPLORATION_EFFECT_SCHEMAS } from "./exploration-effect-editor-schema.mjs";

export const EXPLORATION_EFFECT_SCHEMA_BY_KIND = new Map(
  EXPLORATION_EFFECT_SCHEMAS.map((schema) => [schema.kind, schema]),
);

export function predicateDisplayName(value) {
  return value
    .split("-")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
