import { blake3 } from "@noble/hashes/blake3.js";
import {
  canonicalJson,
  type Bundle,
  type LocalizedString,
  type Pattern,
  type SelectorRecord,
} from "@trox/runtime";

export interface SyntheticTranslation {
  readonly message: LocalizedString;
  readonly translation: string;
}

/**
 * Adds deterministic translated rows to a generated allow-missing QA bundle.
 * Tests opt into the exact runtime values they need and retain the real locale
 * profile, plural rules, number format, direction, and isolation policy.
 */
export function withSyntheticTranslations(
  template: Bundle,
  translations: readonly SyntheticTranslation[],
): Bundle {
  const entries = structuredClone(template.entries) as Record<string, Bundle["entries"][string]>;
  for (const { message, translation } of translations) {
    const path = expansionPath(template, message.identity.pattern, message.selectors);
    const expansion = { entry_signature: message.sourceSignature, path };
    const rowId = "row1_" + base32(blake3(new TextEncoder().encode(canonicalJson(expansion))).slice(0, 16));
    const prior = entries[message.entryId];
    if (prior === undefined) throw new Error("Synthetic message is absent from the configured source catalog.");
    entries[message.entryId] = {
      source_signature: message.sourceSignature,
      rows: {
        ...prior.rows,
        [rowId]: {
          expansion,
          origin_locale: template.locale,
          translation,
        },
      },
    };
  }
  return { ...template, entries };
}

function expansionPath(
  bundle: Bundle,
  root: Pattern,
  selectorRecords: readonly SelectorRecord[],
): readonly unknown[] {
  const records = new Map(selectorRecords.map((record) => [record.path.join(","), record]));
  const path: unknown[] = [];
  function walk(pattern: Pattern, structural: number[]): void {
    if (pattern.kind === "text") return;
    const record = records.get(structural.join(","));
    if (pattern.kind === "select") {
      if (record?.kind !== "select") throw new Error("Synthetic select record mismatch.");
      const match = record.branch_keys.findIndex((key) => key === record.value);
      const branch = match < 0 ? pattern.branches.length - 1 : match;
      path.push({ branch, kind: "select" });
      walk(pattern.branches[branch].pattern, [...structural, branch]);
      return;
    }
    if (record?.kind !== pattern.kind) throw new Error("Synthetic numeric selector record mismatch.");
    const exact = pattern.branches.findIndex((branch) => "exact" in branch.key && branch.key.exact === record.value);
    const category = new Intl.PluralRules(bundle.locale, {
      type: pattern.kind === "ordinal" ? "ordinal" : "cardinal",
    }).select(record.value);
    let branch = exact;
    if (branch < 0) {
      branch = pattern.branches.findIndex((candidate) => {
        const key = candidate.key;
        return ("plural" in key ? key.plural : "ordinal" in key ? key.ordinal : undefined) === category;
      });
    }
    if (branch < 0) {
      branch = pattern.branches.findIndex((candidate) => {
        const key = candidate.key;
        return ("plural" in key ? key.plural : "ordinal" in key ? key.ordinal : undefined) === "other";
      });
    }
    if (branch < 0) throw new Error("Synthetic numeric selector has no fallback.");
    path.push({
      branch,
      kind: pattern.kind,
      match: exact >= 0 ? { exact: record.value } : { category },
    });
    walk(pattern.branches[branch].pattern, [...structural, branch]);
  }
  walk(root, []);
  return path;
}

function base32(bytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let accumulator = 0;
  let output = "";
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(accumulator >>> bits) & 31];
    }
  }
  if (bits > 0) output += alphabet[(accumulator << (5 - bits)) & 31];
  return output;
}
