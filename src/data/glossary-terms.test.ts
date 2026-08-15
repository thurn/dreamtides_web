import { describe, it, expect } from "vitest";

import { projectGlossaryEntry, extractGlossaryTerms } from "./glossary-terms";
import { GLOSSARY, glossaryRulesTextForms } from "./glossary";
import type { GlossaryCatalogEntry } from "./glossary";
import { testGlossaryEntryId } from "../types/test-identities";

// Derive representative entries from the live glossary so these tests track the
// data rather than hardcoding term names that churn as entries are added,
// removed, or renamed.
const bareTerms = GLOSSARY.filter((entry) =>
  glossaryRulesTextForms(entry).includes(entry.term),
).filter((entry) => !entry.term.startsWith("▸"));
const pluralEntry = GLOSSARY.find((e) =>
  (e.variants ?? []).some((v) => !v.startsWith("▸")),
);
const pluralVariant = (pluralEntry?.variants ?? []).find(
  (v) => !v.startsWith("▸"),
);
const arrowTermEntry = GLOSSARY.find((e) => e.term.startsWith("▸"));
const arrowGatedEntry = GLOSSARY.find(
  (e) =>
    e.term.startsWith("▸") &&
    (e.variants ?? []).every((v) => v.startsWith("▸")),
);

describe("extractGlossaryTerms", () => {
  it("returns an empty array for empty input", () => {
    expect(extractGlossaryTerms("")).toEqual([]);
  });

  it("returns an empty array when no glossary term is present", () => {
    expect(extractGlossaryTerms("zzz qqq wxyz plugh.")).toEqual([]);
  });

  it("matches a single term in plain prose", () => {
    const term = bareTerms[0].term;
    const terms = extractGlossaryTerms(`Gain a ${term}.`);
    expect(terms.map((entry) => entry.term)).toEqual([term]);
  });

  it("matches terms case-insensitively", () => {
    const term = bareTerms[0].term;
    const terms = extractGlossaryTerms(`gain a ${term.toUpperCase()}`);
    expect(terms.map((entry) => entry.term)).toEqual([term]);
  });

  it("matches plural / past-tense forms via the glossary variants list", () => {
    if (pluralEntry === undefined || pluralVariant === undefined) {
      return;
    }
    const terms = extractGlossaryTerms(`Discard your ${pluralVariant} now.`);
    expect(terms.map((entry) => entry.term)).toEqual([pluralEntry.term]);
  });

  it("matches multiple distinct terms in first-occurrence order", () => {
    const [t0, t1, t2] = bareTerms;
    const terms = extractGlossaryTerms(
      `${t0.term} a ${t1.term}, then ${t2.term} two cards.`,
    );
    expect(terms.map((entry) => entry.term)).toEqual(
      [t0, t1, t2].map((entry) => entry.term),
    );
  });

  it("deduplicates repeated mentions of the same term", () => {
    const term = bareTerms[0].term;
    const terms = extractGlossaryTerms(
      `${term} after ${term} after ${term.toUpperCase()}`,
    );
    expect(terms.map((entry) => entry.term)).toEqual([term]);
  });

  it("deduplicates singular and plural mentions to a single entry", () => {
    if (pluralEntry === undefined || pluralVariant === undefined) {
      return;
    }
    const terms = extractGlossaryTerms(
      `Gain a ${pluralEntry.term}. Discard all ${pluralVariant}.`,
    );
    expect(terms.map((entry) => entry.term)).toEqual([pluralEntry.term]);
  });

  it("tolerates punctuation around terms", () => {
    const [t0, t1, t2] = bareTerms;
    const terms = extractGlossaryTerms(
      `(${t0.term}) — ${t1.term}: ${t2.term}.`,
    );
    expect(terms.map((entry) => entry.term)).toEqual(
      [t0, t1, t2].map((entry) => entry.term),
    );
  });

  it("surfaces an arrow-gated term only when the arrow is present", () => {
    if (arrowGatedEntry === undefined) {
      return;
    }
    // The arrow form (e.g. `▸Materialized`, no space) shows the tile.
    const trigger = extractGlossaryTerms(
      `${arrowGatedEntry.term}: draw a card.`,
    );
    expect(trigger.map((entry) => entry.term)).toEqual([arrowGatedEntry.term]);

    // The bare word does not, so it never duplicates the trigger.
    const bare = arrowGatedEntry.term.slice(1).toLowerCase();
    const prose = extractGlossaryTerms(`you have ${bare} this turn`);
    expect(prose.map((entry) => entry.term)).toEqual([]);
  });

  it("surfaces an arrow term by its arrow form", () => {
    if (arrowTermEntry === undefined) {
      return;
    }
    const terms = extractGlossaryTerms(
      `${arrowTermEntry.term}: gain 1 energy.`,
    );
    expect(terms.map((entry) => entry.term)).toEqual([arrowTermEntry.term]);
  });

  it("orders heterogeneous mentions by their rules-text occurrence", () => {
    const [t0, t1, t2, t3] = bareTerms;
    const terms = extractGlossaryTerms(
      `After ${t0.term}, ${t1.term} a ${t2.term}, then ${t3.term}.`,
    );
    expect(terms.map((entry) => entry.term)).toEqual(
      [t0, t1, t2, t3].map((entry) => entry.term),
    );
  });
});

function fixture(
  idSeed: string,
  term: string,
  definition: string,
  priority = 0,
  projections: GlossaryCatalogEntry["projections"] = [],
): GlossaryCatalogEntry {
  return {
    id: testGlossaryEntryId(idSeed),
    category: "Keywords",
    term,
    definition,
    priority,
    matchesTermInRulesText: true,
    variants: [],
    projections,
  };
}

describe("projected glossary definitions", () => {
  it("explains foresee 1 with its singular card flow", () => {
    const foresee = fixture("foresee", "Foresee", "Generic definition.", 0, [
      {
        pattern: String.raw`\bforesee\s+(1)\b`,
        term: "{term} {1}",
        definition:
          "Look at the top card of your deck. You may put it into your void.",
      },
    ]);

    expect(
      projectGlossaryEntry(foresee, "When you play an event, foresee 1."),
    ).toMatchObject({
      term: "Foresee 1",
      definition:
        "Look at the top card of your deck. You may put it into your void.",
    });
  });

  it("incorporates larger foresee counts into the term and definition", () => {
    const foresee = fixture("foresee", "Foresee", "Generic definition.", 0, [
      {
        pattern: String.raw`\bforesee\s+(\d+)\b`,
        term: "{term} {1}",
        definition:
          "Look at the top {1} cards of your deck, then put any number of them into your void and the rest on top in any order.",
      },
    ]);

    expect(
      projectGlossaryEntry(foresee, "Foresee 3, then draw a card."),
    ).toMatchObject({
      term: "Foresee 3",
      definition:
        "Look at the top 3 cards of your deck, then put any number of them into your void and the rest on top in any order.",
    });
  });

  it("binds captured projection arguments into localized values", () => {
    const projection = {
      pattern: String.raw`\bforesee\s+(\d+)\b`,
      term: "{term} {1}",
      definition: "Look at the top {1} cards.",
    };
    const foresee = fixture("foresee", "Foresee", "Generic definition.", 0, [
      projection,
    ]);

    const projected = projectGlossaryEntry(foresee, "Foresee 3.");

    expect(projected.term).toBe("Foresee 3");
    expect(projected.definition).toBe("Look at the top 3 cards.");
  });

  it("refers to a granted reclaim target as that card", () => {
    const reclaim = fixture(
      "reclaim",
      "Reclaim",
      "You may play this card from your void, then banish it when it leaves play.",
      0,
      [
        {
          pattern: String.raw`\b(?:gain|gains|gained)\s+reclaim\b`,
          definition:
            "You may play that card from your void, then banish it when it leaves play.",
        },
      ],
    );

    expect(
      projectGlossaryEntry(reclaim, "An event in your void gains reclaim.")
        .definition,
    ).toBe(
      "You may play that card from your void, then banish it when it leaves play.",
    );
  });

  it("uses avatar-specific exhaust instructions", () => {
    const exhaust = fixture(
      "exhaust-cost",
      "Exhaust Cost",
      "Generic exhaust definition.",
      0,
      [
        {
          owner: "avatar",
          definition:
            "You may exhaust (☾) this avatar to activate this ability once per turn.",
        },
      ],
    );

    expect(
      projectGlossaryEntry(exhaust, "2●, ☾: Draw a card.", "avatar")
        .definition,
    ).toBe(
      "You may exhaust (☾) this avatar to activate this ability once per turn.",
    );
  });
});

describe("numeric keyword glossary projections", () => {
  const foresee = fixture("foresee", "Foresee", "Generic foresee.", 0, [
    {
      pattern: String.raw`\bforesee\s+(1)\b`,
      term: "{term} {1}",
      definition: "Look at the top card.",
    },
    {
      pattern: String.raw`\bforesee\s+(\d+)\b`,
      term: "{term} {1}",
      definition: "Look at the top {1} cards.",
    },
  ]);
  const erode = fixture("erode", "Erode", "Generic erode.", 0, [
    {
      pattern: String.raw`\berode\s+(1)\b`,
      term: "{term} {1}",
      definition: "Put the top card into their void.",
    },
    {
      pattern: String.raw`\berode\s+(\d+)\b`,
      term: "{term} {1}",
      definition: "Put the top {1} cards into their void.",
    },
  ]);
  const reclaim = fixture("reclaim", "Reclaim", "Generic reclaim.", 0, [
    {
      pattern: String.raw`\b(?:gain|gains|gained)\s+reclaim\s+(\d+)\s*●`,
      term: "{term} {1}●",
      definition: "Play that card from your void for {1}●.",
    },
    {
      pattern: String.raw`\breclaim\s+(\d+)\s*●`,
      term: "{term} {1}●",
      definition: "Play this card from your void for {1}●.",
    },
    {
      pattern: String.raw`\b(?:gain|gains|gained)\s+reclaim\b`,
      definition: "Play that card from your void.",
    },
  ]);

  it.each([
    {
      text: "Foresee 1.",
      entry: foresee,
      term: "Foresee 1",
      definition: "Look at the top card.",
    },
    {
      text: "Foresee 3.",
      entry: foresee,
      term: "Foresee 3",
      definition: "Look at the top 3 cards.",
    },
    {
      text: "Erode 1.",
      entry: erode,
      term: "Erode 1",
      definition: "Put the top card into their void.",
    },
    {
      text: "Erode 2.",
      entry: erode,
      term: "Erode 2",
      definition: "Put the top 2 cards into their void.",
    },
    {
      text: "Reclaim 0●.",
      entry: reclaim,
      term: "Reclaim 0●",
      definition: "Play this card from your void for 0●.",
    },
    {
      text: "Reclaim 4●.",
      entry: reclaim,
      term: "Reclaim 4●",
      definition: "Play this card from your void for 4●.",
    },
    {
      text: "That card gains reclaim 0● until end of turn.",
      entry: reclaim,
      term: "Reclaim 0●",
      definition: "Play that card from your void for 0●.",
    },
    {
      text: "A character in your void gains reclaim 2● until end of turn.",
      entry: reclaim,
      term: "Reclaim 2●",
      definition: "Play that card from your void for 2●.",
    },
  ])("adapts $text", ({ text, entry, term, definition }) => {
    expect(projectGlossaryEntry(entry, text)).toMatchObject({
      id: entry.id,
      term,
      definition,
    });
  });

  it("keeps granted Reclaim without a cost contextual but non-numeric", () => {
    expect(
      projectGlossaryEntry(reclaim, "An event in your void gains reclaim."),
    ).toMatchObject({
      term: "Reclaim",
      definition: "Play that card from your void.",
    });
  });
});
