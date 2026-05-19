/**
 * Single source of truth for in-prototype gameplay terminology.
 *
 * Each entry is a short, plain-language definition of a term that may appear
 * in card, Dreamcaller, or Dreamsign rules text. The card-text tokenizer
 * (`src/components/card-text.ts`) consults this list to wrap matching words
 * in interactive `term` segments, and the rules-text renderer
 * (`src/components/RulesText.tsx`) shows the definition in a hover popover.
 *
 * Style rules for definitions:
 *   * One sentence each.
 *   * Aim for under 15 words.
 *   * Plain language. Avoid forward-references to other glossary terms when
 *     possible; when a definition mentions another term, that term should
 *     itself be in the glossary.
 *   * Match the lowercase form. The tokenizer compares case-insensitively
 *     and accepts simple plural / past-tense suffixes via the variants list.
 *
 * When new card content adds new terminology, add a new entry here. The
 * `glossary-completeness` test scans the live card / Dreamcaller / Dreamsign
 * pools for capitalized rules-text words plus the known lowercase keywords
 * and asserts that each appears in the glossary's word index.
 */

/** A single glossary entry. */
export interface GlossaryEntry {
  /** Canonical term shown as the popover heading. */
  readonly term: string;
  /** Short, plain-language definition. */
  readonly definition: string;
  /**
   * Word forms (lowercase) that should match this entry in rules text.
   * Always includes `term.toLowerCase()`; add plurals and past-tense forms
   * when the rules text uses them.
   */
  readonly variants: readonly string[];
}

/**
 * The glossary, in roughly the order a new player encounters terms.
 */
export const GLOSSARY: readonly GlossaryEntry[] = [
  // --- Card types -----------------------------------------------------
  {
    term: "Figment",
    definition:
      "A temporary token character with 1 spark created by an effect.",
    variants: ["figment", "figments"],
  },

  // --- Triggers & timing ---------------------------------------------
  {
    term: "Materialized",
    definition: "Triggers when this character enters play.",
    variants: ["materialized"],
  },
  {
    term: "Dawn",
    definition: "Triggers at the start of your turn.",
    variants: ["dawn"],
  },
  {
    term: "Materialize",
    definition: "Put a character into play",
    variants: ["materialize", "materializes"],
  },
  {
    term: "Judgment",
    definition: "Triggers at the start of your turn.",
    variants: ["judgment"],
  },
  {
    term: "Dissolved",
    definition: "Triggers when this character is dissolved.",
    variants: ["dissolved"],
  },
  {
    term: "Dissolve",
    definition: "Destroy a character. It goes to the void.",
    variants: ["dissolve", "dissolves"],
  },
  {
    term: "Banished",
    definition: "Triggers when this card is banished.",
    variants: ["banished"],
  },
  {
    term: "Banish",
    definition: "Remove a card from the game.",
    variants: ["banish"],
  },

  // --- Keywords -------------------------------------------------------
  {
    term: "Reclaim",
    definition: "You may play this card from your void, then banish it.",
    variants: ["reclaim", "reclaimed"],
  },
  {
    term: "Foresee",
    definition:
      "Look at the top N cards of your deck, put any number into your void, and put the rest back in any order.",
    variants: ["foresee"],
  },
  {
    term: "Discover",
    definition: "Reveal three matching cards. Draw the chosen one.",
    variants: ["discover"],
  },
  {
    term: "Fast",
    definition: "Can be played during the opponent's turn.",
    variants: ["fast"],
  },
  {
    term: "Unbound",
    definition: "Can be deployed on the same turn in which it is materialized.",
    variants: ["unbound"],
  },
  {
    term: "Echo",
    definition: "Triggers an additional time.",
    variants: ["echo"],
  },
  {
    term: "Preeminence",
    definition: "Wins spark ties during challenges.",
    variants: ["preeminence"],
  },
  {
    term: "Supported",
    definition: "Characters directly in front of this character.",
    variants: ["supported", "supporting"],
  },
  {
    term: "Deployed",
    definition: "In the front rank.",
    variants: ["deployed"],
  },

  // --- Verbs ----------------------------------------------------------
  {
    term: "Kindle",
    definition: "Increase the spark of the ally with the highest spark",
    variants: ["kindle"],
  },
  {
    term: "Transfigure",
    definition: "Permanently upgrade a card in your deck.",
    variants: ["transfigure", "transfigured", "transfigures"],
  },
  {
    term: "Purge",
    definition: "Permanently remove a card from your deck for the run.",
    variants: ["purge", "purged"],
  },

  // --- Quest terms ----------------------------------------------------
  {
    term: "Bane",
    definition: "A penalty card forced into your deck.",
    variants: ["bane", "banes"],
  },
  {
    term: "Nightmare",
    definition: "A bane card that disrupts your deck when drawn.",
    variants: ["nightmare", "nightmares"],
  },

  // --- Transfiguration colors ---------------------------------------
  // Each transfiguration is named after a color. The card's name and any
  // modified rules text display in that color to mark the transfiguration.
  // Definitions track docs/quests/quests.md (Transfiguration site).
  {
    term: "Transfiguration",
    definition: "A permanent modification to a card.",
    variants: ["transfiguration", "transfigurations"],
  },
  {
    term: "Viridian",
    definition:
      "Transfiguration: reduces this card's energy cost by 50%, rounded to the nearest whole number.",
    variants: ["viridian"],
  },
  {
    term: "Golden",
    definition:
      "Transfiguration: increases or decreases a number in this card's rules text by 1.",
    variants: ["golden"],
  },
  {
    term: "Scarlet",
    definition:
      "Transfiguration: doubles a character's base spark, or sets it to 1 if zero.",
    variants: ["scarlet"],
  },
  {
    term: "Magenta",
    definition:
      "Transfiguration: increases the frequency of named triggers on this card.",
    variants: ["magenta"],
  },
  {
    term: "Azure",
    definition: "Transfiguration: appends \"draw a card\" to this event card's text.",
    variants: ["azure"],
  },
  {
    term: "Bronze",
    definition: "Transfiguration: adds \"reclaim\" to this event card's text.",
    variants: ["bronze"],
  },
  {
    term: "Rose",
    definition: "Transfiguration: reduces an activated ability's energy cost by 1.",
    variants: ["rose"],
  },
  {
    term: "Prismatic",
    definition: "Transfiguration: applies every other eligible transfiguration to a card.",
    variants: ["prismatic"],
  },
];

/**
 * Lookup index from a lowercase variant to its glossary entry.
 * Built once at module load.
 */
export const GLOSSARY_INDEX: Readonly<Record<string, GlossaryEntry>> = (() => {
  const index: Record<string, GlossaryEntry> = {};
  for (const entry of GLOSSARY) {
    for (const variant of entry.variants) {
      const key = variant.toLowerCase();
      if (index[key] !== undefined && index[key] !== entry) {
        // Two glossary entries claim the same variant; keep the first and
        // surface the conflict. This catches glossary editing mistakes.
        console.warn(
          `glossary: duplicate variant "${key}" used by both "${index[key].term}" and "${entry.term}"`,
        );
        continue;
      }
      index[key] = entry;
    }
  }
  return index;
})();

/**
 * Returns the glossary entry whose variants include the given word
 * (case-insensitive), or `undefined` if none matches.
 */
export function lookupGlossaryTerm(word: string): GlossaryEntry | undefined {
  return GLOSSARY_INDEX[word.toLowerCase()];
}

/**
 * Returns true if the given lowercase word is in the glossary.
 * Exposed for tests; runtime callers should use `lookupGlossaryTerm`.
 */
export function hasGlossaryTerm(word: string): boolean {
  return GLOSSARY_INDEX[word.toLowerCase()] !== undefined;
}
