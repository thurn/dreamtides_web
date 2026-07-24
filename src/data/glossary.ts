import glossarySource from "../../data/tabula/glossary.toml?raw";
import { parseGlossarySource } from "../../scripts/glossary-source.mjs";

/** A TOML-authored explanatory Info Card entry. */
export interface GlossaryEntry {
  /** Canonical heading displayed on the Info Card. */
  readonly term: string;
  /** Player-facing explanatory copy displayed on the Info Card. */
  readonly definition: string;
  /** Extra rules-text word forms beyond the canonical term. */
  readonly variants?: readonly string[];
}

/** Fully identified record loaded from glossary.toml and shown in the editor. */
export interface GlossaryCatalogEntry extends GlossaryEntry {
  /** Stable key used by semantic Info Card callsites. */
  readonly id: string;
  /** Editor grouping label. */
  readonly category: string;
  /** Higher values place the entry earlier in a multi-term rules-text reveal. */
  readonly priority: number;
  /** Whether card rules text recognizes this entry as an inline term. */
  readonly matchesRulesText: boolean;
  readonly variants: readonly string[];
}

/** Every editable Info Card definition, in TOML source order. */
export const INFO_CARD_GLOSSARY: readonly GlossaryCatalogEntry[] =
  parseGlossarySource(glossarySource);

/** Rules-text entries used by the card keyword tokenizer. */
export const GLOSSARY: readonly GlossaryCatalogEntry[] =
  INFO_CARD_GLOSSARY.filter((entry) => entry.matchesRulesText);

const ENTRY_BY_ID = new Map(
  INFO_CARD_GLOSSARY.map((entry) => [entry.id, entry]),
);

/** Stable ids used by reusable explanatory Info Card sources. */
export const GLOSSARY_IDS = {
  energyCost: "energy-cost",
  spark: "spark",
  exhausted: "exhausted",
  fast: "fast",
  interrupt: "interrupt",
  exhaustCost: "exhaust-cost",
  foresee: "foresee",
  reclaim: "reclaim",
  nightTrigger: "night-trigger",
  essence: "essence",
  startingEssence: "starting-essence",
  tides: "tides",
  dreamsignRestock: "dreamsign-restock",
  sites: {
    Battle: "site-battle",
    Draft: "site-draft",
    Shop: "site-shop",
    Purge: "site-purge",
    Essence: "site-essence",
    Transfiguration: "site-transfiguration",
    Duplication: "site-duplication",
    Reward: "site-reward",
    DreamAugury: "site-dream-augury",
    DreamsignMarket: "site-dreamsign-market",
    DreamsignRevelation: "site-dreamsign-revelation",
    TemptingOffer: "site-tempting-offer",
    Gamble: "site-gamble",
    TemporalFork: "site-temporal-fork",
  },
} as const;

/** Resolve one explanatory entry by stable id. */
export function glossaryEntry(id: string): GlossaryCatalogEntry | undefined {
  return ENTRY_BY_ID.get(id);
}

/** Resolve one required explanatory entry, failing loudly on source drift. */
export function requireGlossaryEntry(id: string): GlossaryCatalogEntry {
  const entry = glossaryEntry(id);
  if (entry === undefined) {
    throw new Error(
      `Missing glossary entry "${id}" in data/tabula/glossary.toml.`,
    );
  }
  return entry;
}

/**
 * Lookup index from a lowercase rules-text form to its glossary entry. Each
 * entry is keyed by its term plus any extra variants.
 */
export const GLOSSARY_INDEX: Readonly<Record<string, GlossaryCatalogEntry>> =
  (() => {
    const index: Record<string, GlossaryCatalogEntry> = {};
    for (const entry of GLOSSARY) {
      for (const form of [entry.term, ...entry.variants]) {
        index[form.toLocaleLowerCase()] = entry;
      }
    }
    return index;
  })();

/** Trigger arrow that can prefix a rules keyword. */
export const TRIGGER_ARROW = "▸";

/** Resolve a rules-text word by canonical term or variant. */
export function lookupGlossaryTerm(
  word: string,
): GlossaryCatalogEntry | undefined {
  const key = word.toLocaleLowerCase();
  const direct = GLOSSARY_INDEX[key];
  if (direct !== undefined) return direct;
  if (key.startsWith(TRIGGER_ARROW)) {
    return GLOSSARY_INDEX[key.slice(TRIGGER_ARROW.length)];
  }
  return undefined;
}

/** Returns whether a lowercase word is recognized by the rules glossary. */
export function hasGlossaryTerm(word: string): boolean {
  return GLOSSARY_INDEX[word.toLocaleLowerCase()] !== undefined;
}

/**
 * Whether a glossary definition uses rules-aware inline rendering.
 *
 * Rules-text entries use it by default; semantic Info Cards can opt in when
 * their explanatory prose includes a rules glyph.
 */
export function glossaryDefinitionUsesRulesText(
  entry: Pick<GlossaryCatalogEntry, "id" | "matchesRulesText">,
): boolean {
  return (
    entry.matchesRulesText === true || entry.id === GLOSSARY_IDS.exhaustCost
  );
}
