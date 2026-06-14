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
 *   * A variant may carry a leading trigger arrow (e.g. `▸materialized`). Such
 *     a variant matches only the arrow-prefixed keyword in rules text, never
 *     the bare word. See `TRIGGER_ARROW` and `lookupGlossaryTerm`.
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
    definition: "A token representation of character created by an effect.",
    variants: ["figment", "figments"],
  },

  // --- Triggers & timing ---------------------------------------------
  // The trigger arrow is part of this entry's variant, so it matches only the
  // `▸Materialized` trigger keyword and not the past-tense verb "materialized"
  // (the latter belongs to the `Materialize` entry). See `TRIGGER_ARROW` below.
  {
    term: "▸Materialized",
    definition: "Triggers when this character enters play.",
    variants: ["▸materialized"],
  },
  {
    term: "Dawn",
    definition: "Triggers at the start of your turn.",
    variants: ["dawn"],
  },
  {
    term: "Day",
    definition: "The turn phase when the active player plays standard cards.",
    variants: ["day"],
  },
  {
    term: "Materialize",
    definition: "Put a character into play",
    variants: ["materialize", "materializes"],
  },
  {
    term: "Rematerialize",
    definition: "Trigger an in-play character's materialization again.",
    variants: ["rematerialize"],
  },
  {
    term: "Dissolved",
    definition: "Triggers when this character is dissolved.",
    variants: ["dissolved"],
  },
  {
    term: "Dissolve",
    definition: "Destroy a character, sending it to the void.",
    variants: ["dissolve", "dissolves"],
  },
  {
    term: "Banish",
    definition: "Remove a card from the game.",
    variants: ["banish"],
  },

  // --- Keywords -------------------------------------------------------
  {
    term: "Reclaim",
    definition:
      "You may play this card from your void, then banish it when it leaves play.",
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
    definition: "Reveal three matching cards and choose one to draw.",
    variants: ["discover"],
  },
  {
    term: "Erode",
    definition: "Put cards from the top of a player's deck into their void.",
    variants: ["erode", "eroded", "erodes"],
  },
  {
    term: "Fast",
    definition:
      "Can be played during your Night phase or the opponent's Dusk phase.",
    variants: ["fast"],
  },
  {
    term: "Awakened",
    definition:
      "Can challenge and activate ☪ abilities on the same turn in which it is materialized.",
    variants: ["awakened"],
  },
  {
    term: "Unstoppable",
    definition:
      "Scores points equal to its spark when dissolving a defender during a challenge.",
    variants: ["unstoppable"],
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
    term: "Challenger",
    definition: "A front-rank character during the Night phase.",
    variants: ["challenger", "challengers"],
  },
  {
    term: "Unpaired",
    definition: "A challenger with no defender opposite it.",
    variants: ["unpaired"],
  },
  {
    term: "Prevent",
    definition: "Counter a card on the stack and send it to the void.",
    variants: ["prevent", "prevented"],
  },

  // --- Verbs ----------------------------------------------------------
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

  // --- Transfigurations ---------------------------------------------
  // Each transfiguration carries an emblem icon and a tint color; the card's
  // name and any modified rules text display in that tint to mark the
  // transfiguration. Definitions track docs/quests/quests.md
  // (Transfiguration site).
  {
    term: "Transfiguration",
    definition: "A permanent modification to a card.",
    variants: ["transfiguration", "transfigurations"],
  },
  {
    term: "Empowered",
    definition:
      "Transfiguration: reduces this card's energy cost by 50%, rounded to the nearest whole number.",
    variants: ["empowered"],
  },
  {
    term: "Amplified",
    definition:
      "Transfiguration: increases or decreases a number in this card's rules text by 1.",
    variants: ["amplified"],
  },
  {
    term: "Kindled",
    definition:
      "Transfiguration: doubles a character's base spark, or sets it to 1 if zero.",
    variants: ["kindled"],
  },
  {
    term: "Resonant",
    definition:
      "Transfiguration: increases the frequency of named triggers on this card.",
    variants: ["resonant"],
  },
  {
    term: "Inspired",
    definition:
      'Transfiguration: appends "draw a card" to this event card\'s text.',
    variants: ["inspired"],
  },
  {
    term: "Enduring",
    definition: 'Transfiguration: adds "reclaim" to this event card\'s text.',
    variants: ["enduring"],
  },
  {
    term: "Attuned",
    definition:
      "Transfiguration: reduces an activated ability's energy cost by 1.",
    variants: ["attuned"],
  },
  {
    term: "Perfected",
    definition:
      "Transfiguration: applies every other eligible transfiguration to a card.",
    variants: ["perfected"],
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
 * The trigger arrow that can prefix a keyword in rules text (e.g.
 * `▸Materialized`). A glossary variant may include it to match only the
 * arrow-prefixed form of a word.
 */
export const TRIGGER_ARROW = "▸";

/**
 * Returns the glossary entry whose variants include the given word
 * (case-insensitive), or `undefined` if none matches.
 *
 * The word may carry a leading trigger arrow (e.g. `▸Dawn`). An entry whose
 * variant carries the arrow (`▸materialized`) matches only that arrow-prefixed
 * form; when no arrow-specific entry exists, the bare keyword resolves the
 * lookup, so plain triggers (`▸Dawn`, `▸Judgment`) still find their entries.
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
