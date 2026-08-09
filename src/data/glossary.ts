import glossarySource from "../../data/glossary.toml?raw";
import { parseGlossarySource } from "../../scripts/glossary-source.mjs";

/** A RON-authored explanatory Info Card entry. */
export interface GlossaryEntry {
  /** Canonical heading displayed on the Info Card. */
  readonly term: string;
  /** Player-facing explanatory copy displayed on the Info Card. */
  readonly definition: string;
  /** Additional word or symbol forms recognized in rules text. */
  readonly variants?: readonly string[];
  /** Optional treatment for the entry's label in definition surfaces. */
  readonly termPresentation?: "symbolOnly" | "definitionOnly";
}

/** A RON-authored projection of one canonical entry. */
export interface GlossaryProjection {
  /** Limit this projection to rules text owned by this entity type. */
  readonly owner?: "card" | "dreamAvatar";
  /** Case-insensitive regular expression which the source sentence must match. */
  readonly pattern?: string;
  /** Display-term template; `{term}` and numbered captures such as `{1}` expand. */
  readonly term?: string;
  /** Definition template; `{term}` and numbered captures such as `{1}` expand. */
  readonly definition?: string;
}

/** Fully identified record compiled to glossary.toml and shown in the editor. */
export interface GlossaryCatalogEntry extends GlossaryEntry {
  /** Stable key used by semantic Info Card callsites. */
  readonly id: string;
  /** Editor grouping label. */
  readonly category: string;
  /** Higher values place the entry earlier in a multi-term rules-text reveal. */
  readonly priority: number;
  /** Whether rules text recognizes the canonical term itself. */
  readonly matchesTermInRulesText: boolean;
  readonly variants: readonly string[];
  /** Optional symbol shown beside this entry in a combined definition card. */
  readonly definitionSymbol?: "fast" | "interrupt" | "exhaust" | "trigger";
  /** Optional term treatment in a combined definition card. */
  /** Ordered sentence/owner-specific projections. */
  readonly projections?: readonly GlossaryProjection[];
  readonly rulesSymbol?: {
    readonly token:
      "essence" | "points" | "lunar" | "store" | "energy" | "spark";
    readonly glyph:
      "essence" | "points" | "exhaust" | "memory" | "energy" | "sparkInline";
    readonly accessibleLabel: string;
    readonly semanticColorRole?: "essence" | "energy" | "spark";
  };
}

/** Every editable Info Card definition, in canonical RON source order. */
export const INFO_CARD_GLOSSARY: readonly GlossaryCatalogEntry[] =
  parseGlossarySource(glossarySource);

/** Rules-text entries used by the card keyword tokenizer. */
export const GLOSSARY: readonly GlossaryCatalogEntry[] =
  INFO_CARD_GLOSSARY.filter(
    (entry) => entry.matchesTermInRulesText || entry.variants.length > 0,
  );

export const RULES_SYMBOL_GLOSSARY: readonly GlossaryCatalogEntry[] =
  INFO_CARD_GLOSSARY.filter((entry) => entry.rulesSymbol !== undefined);

export function rulesSymbolGlossaryEntry(
  token: NonNullable<GlossaryCatalogEntry["rulesSymbol"]>["token"],
): GlossaryCatalogEntry {
  const entry = RULES_SYMBOL_GLOSSARY.find(
    (candidate) => candidate.rulesSymbol?.token === token,
  );
  if (entry === undefined)
    throw new Error(`Missing glossary rules symbol ${token}`);
  return entry;
}

const ENTRY_BY_ID = new Map(
  INFO_CARD_GLOSSARY.map((entry) => [entry.id, entry]),
);

/** Stable ids used by reusable explanatory Info Card sources. */
export const GLOSSARY_IDS = {
  energyCost: "4c7b92d2-31f5-4e74-aa00-88525e242afc",
  spark: "bf95777e-d1a3-4c08-b027-3407e380eb00",
  points: "f7e1f058-74fe-46db-bb12-f5f887e6a298",
  memory: "0dd0f69f-3879-40dd-82b8-6be0274f763d",
  exhausted: "10e82210-de89-4266-8f98-d9764ab3807e",
  figment: "7ece2571-4681-4be3-aad6-76503bd77523",
  fast: "63a9d425-f7f2-4acf-a7ff-57fd58ad34fc",
  interrupt: "c7ec2870-5c8b-43ad-bcb0-d603bba12dea",
  exhaustCost: "a5fe9cb8-1162-44f3-9634-99839eecbb1a",
  support: "59f426ac-b9cb-47af-a00a-8cbab941c6c4",
  erode: "23526f6e-f17e-4496-bf96-1875858d023d",
  foresee: "21e9a392-3983-49ba-8072-aa950c63ebad",
  reclaim: "374c29e9-deb1-4e3d-8410-b81bacc8588b",
  dissolvedTrigger: "abef45fb-8c3f-4d63-9408-0eed1b7283bb",
  nightTrigger: "12789839-a665-4195-925a-3229b857cf48",
  essence: "3d708c8b-2153-47b8-821e-284f36e1ec9e",
  startingEssence: "bdae3633-0f98-4cbf-829e-89d557c24e83",
  tides: "62bfc165-306b-4ebd-9aac-a1a51f9bc75c",
  dreamsignRestock: "a213b7b2-1e9d-4e6e-b599-19f858ba898d",
  sites: {
    Battle: "85ffab8d-f972-4340-9b45-99f6aff6ccec",
    Draft: "1ee13681-1ff5-431c-94a1-3390d45e1717",
    Shop: "25f28ed1-5729-4240-a352-80f92fce530c",
    Purge: "4873bddf-7bf5-41e8-979e-36eb193db5a6",
    Essence: "ba8ea132-f636-4fed-be27-e8eff0c9cb07",
    Transfiguration: "7ae25c1a-76c5-4aed-9e1c-a2d5ec160bd7",
    Duplication: "8222c5e2-a3ce-4caf-bd13-5c77ff15d7cf",
    Reward: "28925242-3799-4faa-b4bd-b8aac52ca442",
    Augury: "ffd3977a-a463-4326-bdf2-5b1b8c3d9160",
    DreamsignMarket: "5b5b47d6-c858-4b42-af96-a520c84666eb",
    DreamsignRevelation: "ac70fd6b-a91a-407f-b7b7-255668cd6bec",
    RandomSite: "1aeb05bc-53e1-4ea4-9e73-9239160799dc",
    Gamble: "f1ff2fb5-3d77-4eb8-b492-78cbe11fd265",
    Exploration: "46059d35-cb9e-4c4b-8635-087b6239f308",
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
    throw new Error(`Missing glossary entry "${id}" in data/glossary.toml.`);
  }
  return entry;
}

/** Visible Info Card title for an entry whose definition may stand alone. */
export function glossaryEntryDisplayTitle(
  entry: Pick<GlossaryEntry, "term" | "termPresentation">,
): string | undefined {
  return entry.termPresentation === "definitionOnly" ? undefined : entry.term;
}

/**
 * Lookup index from a lowercase rules-text form to its glossary entry. Each
 * entry is keyed by its term plus any extra variants.
 */
export const GLOSSARY_INDEX: Readonly<Record<string, GlossaryCatalogEntry>> =
  (() => {
    const index: Record<string, GlossaryCatalogEntry> = {};
    for (const entry of GLOSSARY) {
      for (const form of glossaryRulesTextForms(entry)) {
        index[form.toLocaleLowerCase()] = entry;
      }
    }
    return index;
  })();

/** Exact forms recognized for one entry by the rules-text tokenizer. */
export function glossaryRulesTextForms(
  entry: GlossaryCatalogEntry,
): readonly string[] {
  return [
    ...(entry.matchesTermInRulesText ? [entry.term] : []),
    ...entry.variants,
  ];
}

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
 * Every entry recognized in rules text uses the same renderer for its
 * explanatory definition, including entries recognized by exact symbol forms.
 */
export function glossaryDefinitionUsesRulesText(
  entry: Pick<GlossaryCatalogEntry, "matchesTermInRulesText" | "variants">,
): boolean {
  return entry.matchesTermInRulesText === true || entry.variants.length > 0;
}
