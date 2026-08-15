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

/** FNV-1a 32-bit hash of `text`, as 8-char lowercase hex. Deterministic and
 *  dependency-free — used only to detect drift in registered card rules text,
 *  not for security. */
export function fnv1aHex(text: string): RulesTextHash {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return parseRulesTextHash((hash >>> 0).toString(16).padStart(8, "0"));
}
