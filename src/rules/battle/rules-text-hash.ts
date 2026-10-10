// tutorial-only until Phase 6

declare const rulesTextHashBrand: unique symbol;

export type RulesTextHash = string & {
  readonly [rulesTextHashBrand]: "RulesTextHash";
};

const RULES_TEXT_HASH_PATTERN = /^[0-9a-f]{8}$/u;

export function isRulesTextHash(value: unknown): value is RulesTextHash {
  return typeof value === "string" && RULES_TEXT_HASH_PATTERN.test(value);
}

export function parseRulesTextHash(value: unknown): RulesTextHash {
  if (!isRulesTextHash(value)) {
    throw new Error("Rules text hash must be 8 lowercase hexadecimal digits.");
  }
  return value;
}
