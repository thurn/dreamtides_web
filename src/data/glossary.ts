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
 *   * The term is matched directly and case-insensitively, so it need not be
 *     repeated in `variants`; list there only the extra forms (plurals,
 *     past-tenses) the rules text uses.
 *   * A term or variant may carry a leading trigger arrow (e.g.
 *     `▸Materialized`). That form matches only the arrow-prefixed keyword in
 *     rules text, never the bare word. See `TRIGGER_ARROW` and
 *     `lookupGlossaryTerm`.
 *
 * When new card content adds new terminology, add a new entry here. The
 * `glossary-completeness` test scans the live card / Dreamcaller / Dreamsign
 * pools for capitalized rules-text words plus the known lowercase keywords
 * and asserts that each appears in the glossary's word index.
 */

/** A single glossary entry. */
export interface GlossaryEntry {
  /**
   * Canonical term shown as the popover heading. The term itself is matched
   * directly (case-insensitively), so it does not need to be repeated in
   * `variants`.
   */
  readonly term: string;
  /** Short, plain-language definition. */
  readonly definition: string;
  /**
   * Extra word forms that should match this entry beyond the term itself, such
   * as plurals and past-tense forms (e.g. `banes`, `transfigured`). Omit when
   * the term is the only form. Matching is case-insensitive.
   */
  readonly variants?: readonly string[];
}

/**
 * The glossary, in roughly the order a new player encounters terms.
 */
export const GLOSSARY: readonly GlossaryEntry[] = [
  // --- Card types -----------------------------------------------------
  {
    term: "Figment",
    definition: "A token representation of character created by an effect.",
    variants: ["figments"],
  },

  // --- Triggers & timing ---------------------------------------------
  // The trigger arrow is part of the term, so it matches only the
  // `▸Materialized` trigger keyword and not the past-tense verb "materialized"
  // (the latter belongs to the `Materialize` entry). See `TRIGGER_ARROW` below.
  {
    term: "▸Materialized",
    definition: "Triggers when this character enters play.",
  },
  {
    term: "▸Dawn",
    definition: "Triggers at the start of your turn.",
    // Bare variant retained for backward-compatible matching; drop it to gate
    // this trigger to the arrow form like `▸Materialized`.
    variants: ["dawn"],
  },
  {
    term: "Day",
    definition: "The turn phase when the active player plays standard cards.",
  },
  {
    term: "Materialize",
    definition: "Put a character into play",
    variants: ["materializes"],
  },
  {
    term: "Rematerialize",
    definition: "Trigger an in-play character's materialization again.",
  },
  {
    term: "▸Dissolved",
    definition: "Triggers when this character is dissolved.",
    // Bare variant retained for backward-compatible matching; drop it to gate
    // this trigger to the arrow form like `▸Materialized`.
    variants: ["dissolved"],
  },
  {
    term: "Dissolve",
    definition: "Destroy a character, sending it to the void.",
    variants: ["dissolves"],
  },
  {
    term: "Banish",
    definition: "Remove a card from the game.",
  },

  // --- Keywords -------------------------------------------------------
  {
    term: "Reclaim",
    definition:
      "You may play this card from your void, then banish it when it leaves play.",
    variants: ["reclaimed"],
  },
  {
    term: "Foresee",
    definition:
      "Look at the top N cards of your deck, put any number into your void, and put the rest back on top in any order.",
  },
  {
    term: "Discover",
    definition: "Reveal three matching cards and choose one to draw.",
  },
  {
    term: "Erode",
    definition: "Put cards from the top of a player's deck into their void.",
    variants: ["eroded", "erodes"],
  },
  {
    term: "Fast",
    definition:
      "Can be played during your Night phase or the opponent's Dusk phase.",
  },
  {
    term: "Awakened",
    definition:
      "Can challenge and activate ☪ abilities on the same turn in which it is materialized.",
  },
  {
    term: "Unstoppable",
    definition:
      "Scores points equal to its ✦ when dissolving a defender during a challenge.",
  },
  {
    term: "Preeminence",
    definition: "Wins ✦ ties during challenges.",
  },
  {
    term: "Supported",
    definition: "Characters directly in front of this character.",
    variants: ["supporting"],
  },
  {
    term: "Challenger",
    definition: "A front-rank ally during your Night phase.",
    variants: ["challengers"],
  },
  {
    term: "Unpaired",
    definition: "A challenger with no defender opposite it.",
  },
  {
    term: "Prevent",
    definition: "Counter a card on the stack and send it to the void.",
    variants: ["prevented"],
  },
  {
    term: "Offering",
    definition:
      "You may play this card for 0● by banishing a card from your hand. If you do, banish this card at end of turn.",
  },
  {
    term: "Phasing",
    definition:
      "To play this character, return an ally to hand. Materialize this character in that ally's position.",
  },
  {
    term: "Ephemeral",
    definition:
      "If an ephemeral card is in your hand at end of turn, banish it.",
  },

  // --- Verbs ----------------------------------------------------------
  {
    term: "Transfigure",
    definition: "Permanently upgrade a card in your deck.",
    variants: ["transfigured", "transfigures"],
  },
  {
    term: "Purge",
    definition: "Permanently remove a card from your deck for the run.",
    variants: ["purged"],
  },

  // --- Quest terms ----------------------------------------------------
  {
    term: "Bane",
    definition: "A penalty card forced into your deck.",
    variants: ["banes"],
  },

  // --- Transfigurations ---------------------------------------------
  // Each transfiguration carries an emblem icon and a tint color; the card's
  // name and any modified rules text display in that tint to mark the
  // transfiguration. Definitions track docs/quests/quests.md
  // (Transfiguration site).
  {
    term: "Transfiguration",
    definition: "A permanent modification to a card.",
    variants: ["transfigurations"],
  },
  {
    term: "Empowered",
    definition:
      "Transfiguration: reduces this card's energy cost by 50%, rounded to the nearest whole number.",
  },
  {
    term: "Amplified",
    definition:
      "Transfiguration: increases or decreases a number in this card's rules text by 1.",
  },
  {
    term: "Kindled",
    definition:
      "Transfiguration: doubles a character's base spark, or sets it to 1 if zero.",
  },
  {
    term: "Resonant",
    definition:
      "Transfiguration: increases the frequency of named triggers on this card.",
  },
  {
    term: "Inspired",
    definition:
      'Transfiguration: appends "draw a card" to this event card\'s text.',
  },
  {
    term: "Enduring",
    definition: 'Transfiguration: adds "reclaim" to this event card\'s text.',
  },
  {
    term: "Attuned",
    definition:
      "Transfiguration: reduces an activated ability's energy cost by 1.",
  },
  {
    term: "Perfected",
    definition:
      "Transfiguration: applies every other eligible transfiguration to a card.",
  },
];

/**
 * Lookup index from a lowercase word form to its glossary entry. Each entry is
 * keyed by its term plus any extra `variants`. Built once at module load.
 */
export const GLOSSARY_INDEX: Readonly<Record<string, GlossaryEntry>> = (() => {
  const index: Record<string, GlossaryEntry> = {};
  for (const entry of GLOSSARY) {
    for (const form of [entry.term, ...(entry.variants ?? [])]) {
      const key = form.toLowerCase();
      if (index[key] !== undefined && index[key] !== entry) {
        // Two glossary entries claim the same word form; keep the first and
        // surface the conflict. This catches glossary editing mistakes.
        console.warn(
          `glossary: duplicate term "${key}" used by both "${index[key].term}" and "${entry.term}"`,
        );
        continue;
      }
      index[key] = entry;
    }
  }
  return index;
})();

/**
 * The trigger arrow that can prefix a keyword in rules text (e.g.
 * `▸Materialized`). A glossary variant may include it to match only the
 * arrow-prefixed form of a word.
 */
export const TRIGGER_ARROW = "▸";

/**
 * Returns the glossary entry matching the given word (case-insensitive), by
 * its term or one of its variants, or `undefined` if none matches.
 *
 * The word may carry a leading trigger arrow (e.g. `▸Dawn`). An entry whose
 * term or variant carries the arrow (`▸Materialized`) matches only that
 * arrow-prefixed form; when no arrow-specific entry exists, the bare keyword
 * resolves the lookup as a fallback.
 */
export function lookupGlossaryTerm(word: string): GlossaryEntry | undefined {
  const key = word.toLowerCase();
  const direct = GLOSSARY_INDEX[key];
  if (direct !== undefined) {
    return direct;
  }
  if (key.startsWith(TRIGGER_ARROW)) {
    return GLOSSARY_INDEX[key.slice(TRIGGER_ARROW.length)];
  }
  return undefined;
}

/**
 * Returns true if the given lowercase word is in the glossary.
 * Exposed for tests; runtime callers should use `lookupGlossaryTerm`.
 */
export function hasGlossaryTerm(word: string): boolean {
  return GLOSSARY_INDEX[word.toLowerCase()] !== undefined;
}
