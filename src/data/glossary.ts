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
    term: "Character",
    definition: "A creature card that stays in play once materialized.",
    variants: ["character", "characters"],
  },
  {
    term: "Event",
    definition: "A one-shot card that resolves and goes to the void.",
    variants: ["event", "events"],
  },
  {
    term: "Figment",
    definition: "A temporary token character created by an effect.",
    variants: ["figment", "figments"],
  },
  {
    term: "Ally",
    definition: "A character you control on the battlefield.",
    variants: ["ally", "allies", "allied"],
  },

  // --- Zones & resources ---------------------------------------------
  {
    term: "Void",
    definition: "Your discard pile. Played and discarded cards go here.",
    variants: ["void"],
  },
  {
    term: "Deck",
    definition: "The face-down library you draw from.",
    variants: ["deck"],
  },
  {
    term: "Hand",
    definition: "Cards in your hand, available to play.",
    variants: ["hand"],
  },
  {
    term: "Spark",
    definition: "A character's power. Higher spark wins combat.",
    variants: ["spark"],
  },
  {
    term: "Essence",
    definition: "Run currency spent at shops between battles.",
    variants: ["essence"],
  },

  // --- Triggers & timing ---------------------------------------------
  {
    term: "Materialized",
    definition: "Triggers when this character enters the battlefield.",
    variants: ["materialized"],
  },
  {
    term: "Materialize",
    definition: "Put a character onto the battlefield from anywhere.",
    variants: ["materialize", "materializes"],
  },
  {
    term: "Judgment",
    definition: "Triggers at the start of your judgment phase each turn.",
    variants: ["judgment"],
  },
  {
    term: "Dissolved",
    definition: "Triggers when this character is dissolved.",
    variants: ["dissolved"],
  },
  {
    term: "Dissolve",
    definition: "Destroy a character. It goes to its owner's void.",
    variants: ["dissolve", "dissolves"],
  },
  {
    term: "Banished",
    definition: "Triggers when this card is banished.",
    variants: ["banished"],
  },
  {
    term: "Banish",
    definition: "Remove a card from the game entirely.",
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
    definition: "Look at the top N cards of your deck and reorder them.",
    variants: ["foresee"],
  },
  {
    term: "Discover",
    definition: "Reveal three matching cards. Add the chosen one to your hand.",
    variants: ["discover"],
  },
  {
    term: "Fast",
    definition: "Can be played during the opponent's turn.",
    variants: ["fast"],
  },
  {
    term: "Unstoppable",
    definition: "This character cannot be blocked.",
    variants: ["unstoppable"],
  },
  {
    term: "Unbound",
    definition: "Cannot be dissolved by enemy abilities.",
    variants: ["unbound"],
  },
  {
    term: "Echo",
    definition: "Triggered abilities of this card trigger an extra time.",
    variants: ["echo"],
  },
  {
    term: "Preeminence",
    definition: "This character must be blocked when it attacks.",
    variants: ["preeminence"],
  },
  {
    term: "Dread",
    definition: "When attacking, an enemy with the lowest spark must block.",
    variants: ["dread"],
  },
  {
    term: "Supported",
    definition: "An ally is supported while another ally is in play.",
    variants: ["supported", "supporting"],
  },
  {
    term: "Deployed",
    definition: "An ally that is currently on the battlefield.",
    variants: ["deployed"],
  },
  {
    term: "Focused",
    definition: "An ally that did not attack or block this turn.",
    variants: ["focused"],
  },

  // --- Verbs ----------------------------------------------------------
  {
    term: "Abandon",
    definition: "Send one of your own allies to your void.",
    variants: ["abandon", "abandoned", "abandons"],
  },
  {
    term: "Kindle",
    definition: "Give your allies a temporary spark boost this turn.",
    variants: ["kindle"],
  },
  {
    term: "Transfigure",
    definition: "Permanently upgrade a card in your deck with a sigil.",
    variants: ["transfigure", "transfigured", "transfigures"],
  },
  {
    term: "Purge",
    definition: "Permanently remove a card from your deck for the run.",
    variants: ["purge", "purged"],
  },

  // --- Quest terms ----------------------------------------------------
  {
    term: "Dreamcaller",
    definition: "Your hero. Provides a starting deck and a passive ability.",
    variants: ["dreamcaller", "dreamcallers"],
  },
  {
    term: "Dreamsign",
    definition: "A run-long modifier earned at dreamsign sites.",
    variants: ["dreamsign", "dreamsigns"],
  },
  {
    term: "Dreamscape",
    definition: "A region containing several sites and a battle.",
    variants: ["dreamscape", "dreamscapes"],
  },
  {
    term: "Bane",
    definition: "A penalty card forced into your deck by a dreamsign.",
    variants: ["bane"],
  },
  {
    term: "Nightmare",
    definition: "A bane card that disrupts your deck when drawn.",
    variants: ["nightmare"],
  },

  // --- Sigil colors (Transfigurations) -------------------------------
  {
    term: "Golden",
    definition: "A transfiguration sigil that boosts essence rewards.",
    variants: ["golden"],
  },
  {
    term: "Prismatic",
    definition: "A transfiguration sigil applying every color's bonus.",
    variants: ["prismatic"],
  },
  {
    term: "Radiant",
    definition: "A transfiguration sigil that buffs the card's spark.",
    variants: ["radiant"],
  },
  {
    term: "Transfiguration",
    definition: "A permanent sigil applied to a card at a transfiguration site.",
    variants: ["transfiguration", "transfigurations"],
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
