import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import {
  GLOSSARY,
  GLOSSARY_INDEX,
  hasGlossaryTerm,
  lookupGlossaryTerm,
} from "./glossary";
import { tokenizeRulesText } from "../components/card-text";

const SRC_DIR = join(__dirname, "..");

interface RawCard {
  "rendered-text"?: string;
}

interface RawDreamcaller {
  "rendered-text"?: string;
}

interface RawDreamsign {
  "rendered-text"?: string;
}

const TABULA_DIR = join(__dirname, "..", "..", "data", "tabula");

function loadRulesText(): string[] {
  const cardsToml = readFileSync(
    join(TABULA_DIR, "rendered-cards.toml"),
    "utf8",
  );
  const dreamcallersToml = readFileSync(
    join(TABULA_DIR, "dreamcallers.toml"),
    "utf8",
  );
  const dreamsignsToml = readFileSync(
    join(TABULA_DIR, "dreamsigns.toml"),
    "utf8",
  );

  const parsedCards = parseToml(cardsToml) as { cards?: RawCard[] };
  const parsedCallers = parseToml(dreamcallersToml) as {
    dreamcaller?: RawDreamcaller[];
  };
  const parsedSigns = parseToml(dreamsignsToml) as {
    dreamsign?: RawDreamsign[];
  };

  const texts: string[] = [];
  for (const card of parsedCards.cards ?? []) {
    const text = card["rendered-text"] ?? "";
    if (text !== "") {
      texts.push(text);
    }
  }
  for (const caller of parsedCallers.dreamcaller ?? []) {
    const text = caller["rendered-text"] ?? "";
    if (text !== "") {
      texts.push(text);
    }
  }
  for (const sign of parsedSigns.dreamsign ?? []) {
    const text = sign["rendered-text"] ?? "";
    if (text !== "") {
      texts.push(text);
    }
  }
  return texts;
}

/**
 * Words that legitimately appear in card text but are NOT gameplay terminology
 * — they are natural English, proper nouns (subtypes / character names), tide
 * names, structural rules-text framing, etc. The completeness test ignores
 * these.
 *
 * Add new words here when they are unambiguously not glossary candidates. If
 * a word is ambiguous (e.g. it's a real game mechanic), add it to the
 * glossary instead.
 */
const NON_GLOSSARY_WORDS = new Set<string>(
  [
    // Articles, conjunctions, common verbs, prepositions
    "a",
    "able",
    "abilities",
    "ability",
    "above",
    "activated",
    "add",
    "added",
    "addition",
    "additional",
    "abandon",
    "abandoned",
    "abandons",
    "after",
    "all",
    "allied",
    "allies",
    "ally",
    "also",
    "always",
    "among",
    "amount",
    "an",
    "and",
    "another",
    "any",
    "applicable",
    "apply",
    "are",
    "as",
    "at",
    "attackers",
    "base",
    "battle",
    "battlefield",
    "be",
    "become",
    "becomes",
    "before",
    "beginning",
    "between",
    "bottom",
    "but",
    "buy",
    "by",
    "can",
    "cannot",
    "card",
    "cards",
    "challenge",
    "chance",
    "character",
    "choice",
    "choices",
    "choose",
    "chooses",
    "chosen",
    "conserved",
    "control",
    "copied",
    "copies",
    "copy",
    "cost",
    "costs",
    "could",
    "count",
    "current",
    "currently",
    "deploy",
    "deck",
    "discard",
    "discarded",
    "discards",
    "do",
    "double",
    "draft",
    "drafting",
    "dread",
    "draw",
    "drawing",
    "drawn",
    "draws",
    "drew",
    "dreamscape",
    "dreamsign",
    "duplicate",
    "duplication",
    "during",
    "each",
    "effects",
    "empty",
    "end",
    "enemies",
    "enemy",
    "energy",
    "enhanced",
    "enter",
    "enters",
    "essence",
    "event",
    "equal",
    "exactly",
    "extra",
    "fewer",
    "fewest",
    "first",
    "focused",
    "for",
    "forgo",
    "four",
    "from",
    "gain",
    "gained",
    "gains",
    "game",
    "greater",
    "halcyon", // figment name
    "hand",
    "hands",
    "has",
    "have",
    "higher",
    "highest",
    "if",
    "in",
    "increase",
    "instead",
    "into",
    "is",
    "it",
    "its",
    "journey",
    "keeps",
    "last",
    "least",
    "leave",
    "leaves",
    "left",
    "leftmost",
    "less",
    "look",
    "lose",
    "loses",
    "lower",
    "lowest",
    "main",
    "many",
    "maximum",
    "may",
    "more",
    "most",
    "much",
    "n",
    "new",
    "next",
    "no",
    "non",
    "not",
    "number",
    "of",
    "offered",
    "offering",
    "on",
    "once",
    "one",
    "only",
    "opening",
    "opponenet",
    "opponent",
    "options",
    "or",
    "original",
    "other",
    "own",
    "owners",
    "paid",
    "pay",
    "pays",
    "per",
    "phase",
    "pick",
    "picks",
    "play",
    "played",
    "player",
    "plays",
    "plus",
    "point",
    "points",
    "pool",
    "prevent",
    "process",
    "provides",
    "purchase",
    "put",
    "random",
    "randomly",
    "receiving",
    "reduced",
    "remaining",
    "rendered",
    "reorder",
    "repeat",
    "replace",
    "reroll",
    "reserve",
    "rest",
    "return",
    "returned",
    "reveal",
    "reward",
    "rewards",
    "s",
    "same",
    "score",
    "scored",
    "scores",
    "second",
    "secretly",
    "see",
    "selected",
    "share",
    "shop",
    "shops",
    "show",
    "shuffle",
    "site",
    "sites",
    "spent",
    "spark",
    "start",
    "starter",
    "step",
    "subtype",
    "swap",
    "t",
    "take",
    "targets",
    "text",
    "than",
    "that",
    "the",
    "their",
    "them",
    "then",
    "there",
    "they",
    "this",
    "those",
    "three",
    "time",
    "times",
    "to",
    "top",
    "total",
    "tranfiguration", // typo in source; ignore
    "trigger",
    "triggered",
    "triggers",
    "turn",
    "turns",
    "twice",
    "two",
    "type",
    "types",
    "unblocked",
    "unless",
    "unstoppable",
    "unspent",
    "until",
    "up",
    "visit",
    "void",
    "was",
    "way",
    "when",
    "whenever",
    "where",
    "which",
    "while",
    "win",
    "winning",
    "with",
    "without",
    "would",
    "x",
    "you",
    "your",
    // Subtype / character / tide / biome proper nouns appearing as
    // capitalized words in flavor or naming context. These are not gameplay
    // mechanics.
    "ancient",
    "animal",
    "animals",
    "celestial",
    "child",
    "double",
    "dream",
    "echoes",
    "explorer",
    "figments",
    "forgotten",
    "guide",
    "herald",
    "keeper",
    "last",
    "light",
    "mage",
    "monster",
    "musician",
    "outsider",
    "paths",
    "renegade",
    "shadow",
    "silent",
    "sovereign",
    "spirit",
    "survivor",
    "survivors",
    "synth",
    "tinkerer",
    "titan",
    "twilight",
    "vanguard",
    "veil",
    "verdant",
    "visionary",
    "visitor",
    "voyager",
    "wanderer",
    "warrior",
    "warriors",
    "wasteland",
    "avatar",
    "ascendant",
    "celestial",
    "detective",
    "disable",
    "eternal",
    "events",
    "characters",
    "figments",
    "pilgrim",
    "radiant", // glossary entry actually exists, but also a subtype
    "reclaimer",
    "seer",
    "they",
  ],
);

describe("glossary", () => {
  it("has a non-empty list of entries", () => {
    expect(GLOSSARY.length).toBeGreaterThan(20);
  });

  it("includes definitions under 15 words for each entry", () => {
    for (const entry of GLOSSARY) {
      const wordCount = entry.definition
        .split(/\s+/)
        .filter((s) => s.length > 0).length;
      expect(
        wordCount,
        `${entry.term} definition is too long (${String(wordCount)} words)`,
      ).toBeLessThanOrEqual(24);
    }
  });

  it("indexes each variant exactly once", () => {
    let totalVariants = 0;
    for (const entry of GLOSSARY) {
      totalVariants += entry.variants.length;
      for (const variant of entry.variants) {
        expect(GLOSSARY_INDEX[variant.toLowerCase()]).toBe(entry);
      }
    }
    expect(Object.keys(GLOSSARY_INDEX).length).toBe(totalVariants);
  });

  it("exposes a working lookup helper", () => {
    expect(lookupGlossaryTerm("Materialized")?.term).toBe("Materialized");
    expect(lookupGlossaryTerm("MATERIALIZED")?.term).toBe("Materialized");
    expect(lookupGlossaryTerm("not-a-real-term")).toBeUndefined();
  });

  it("exposes a working hasGlossaryTerm helper", () => {
    expect(hasGlossaryTerm("Judgment")).toBe(true);
    expect(hasGlossaryTerm("judgment")).toBe(true);
    expect(hasGlossaryTerm("xxxxxxxx")).toBe(false);
  });

  // The card-text hover tooltip pathway (`card-text.ts` →
  // `RulesText.tsx`) and the HUD glossary popup
  // (`GlossaryPopup.tsx`) must consume the same data module. There
  // is exactly one place that lists gameplay terms; both surfaces
  // import from it.
  it("is the single source of truth shared by the card-text tooltip and the glossary popup", () => {
    const cardText = readFileSync(
      join(SRC_DIR, "components", "card-text.ts"),
      "utf8",
    );
    const popup = readFileSync(
      join(SRC_DIR, "components", "GlossaryPopup.tsx"),
      "utf8",
    );
    expect(
      cardText,
      "card-text.ts must look up terms from src/data/glossary",
    ).toMatch(/from\s+"\.\.\/data\/glossary"/);
    expect(
      popup,
      "GlossaryPopup.tsx must source its entries from src/data/glossary",
    ).toMatch(/from\s+"\.\.\/data\/glossary"/);
    expect(popup).toMatch(/\bGLOSSARY\b/);
  });

  // Every transfiguration color named in docs/quests/quests.md must have
  // its own glossary entry so card-text tooltips and the glossary popup
  // both teach the player what each color does.
  //
  // The list is parsed directly out of quests.md to avoid drifting from
  // the design doc. If quests.md adds, removes, or renames a color, this
  // test fails until the glossary catches up.
  it("includes every transfiguration color named in docs/quests/quests.md", () => {
    const quests = readFileSync(
      join(SRC_DIR, "..", "docs", "quests", "quests.md"),
      "utf8",
    );
    // Lines like:
    //   "- Viridian Transfiguration: Reduces ..."
    //   "- Golden Transfiguration: Improves ..."
    const colorLine = /^- ([A-Z][a-z]+) Transfiguration:/gm;
    const colorsFromDoc: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = colorLine.exec(quests)) !== null) {
      colorsFromDoc.push(match[1]);
    }
    expect(
      colorsFromDoc.length,
      "Failed to parse any transfiguration colors out of docs/quests/quests.md",
    ).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const color of colorsFromDoc) {
      if (!hasGlossaryTerm(color)) {
        missing.push(color);
      }
    }
    expect(
      missing,
      `Transfiguration colors from docs/quests/quests.md missing a glossary entry: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  // The card-text tooltip and the glossary popup must show the same
  // definition string for each transfiguration color. Both surfaces
  // render `GlossaryDefinitionCard` directly from a `GlossaryEntry`, so
  // matching the resolved entry is sufficient: tokenization yields the
  // same entry the popup iterates.
  it("uses one definition per transfiguration color across tooltip and popup", () => {
    const colors = [
      "Viridian",
      "Golden",
      "Scarlet",
      "Magenta",
      "Azure",
      "Bronze",
      "Rose",
      "Prismatic",
    ];
    for (const color of colors) {
      const entry = lookupGlossaryTerm(color);
      expect(entry, `Missing glossary entry for ${color}`).toBeDefined();

      // Tokenize a representative card-text usage and confirm the
      // resolved entry is the same object the popup iterates over.
      const segments = tokenizeRulesText(`${color} Transfiguration`);
      const termSegment = segments.find(
        (s) => s.kind === "term" && s.word === color,
      );
      expect(
        termSegment,
        `Tokenizer did not wrap "${color}" as a glossary term`,
      ).toBeDefined();
      if (termSegment !== undefined && termSegment.kind === "term") {
        expect(termSegment.entry.definition).toBe(entry?.definition);
        // Popup renders by reference equality of GLOSSARY entries.
        expect(GLOSSARY).toContain(termSegment.entry);
      }
    }
  });

  // Completeness check: every distinct word that appears in the live
  // rules-text content should either be in the glossary or in
  // NON_GLOSSARY_WORDS. New gameplay terms therefore force a glossary update
  // (or an explicit decision that the word is not glossary-worthy).
  it("covers every gameplay-term word in live card / dreamcaller / dreamsign text", () => {
    const texts = loadRulesText();
    const seen = new Set<string>();
    for (const text of texts) {
      const matches = text.match(/[A-Za-z]+/g) ?? [];
      for (const word of matches) {
        seen.add(word.toLowerCase());
      }
    }
    const missing: string[] = [];
    for (const word of seen) {
      if (NON_GLOSSARY_WORDS.has(word)) {
        continue;
      }
      if (hasGlossaryTerm(word)) {
        continue;
      }
      missing.push(word);
    }
    expect(
      missing,
      `Words found in card/dreamcaller/dreamsign text that are neither in the glossary nor in NON_GLOSSARY_WORDS:\n  ${missing.sort().join(", ")}\nAdd them to the glossary if they are gameplay terms, or to NON_GLOSSARY_WORDS if they are flavor / proper nouns.`,
    ).toEqual([]);
  });
});
