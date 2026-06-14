import { describe, it, expect } from "vitest";

import { extractGlossaryTerms } from "./glossary-terms";
import { GLOSSARY } from "./glossary";

// Derive representative entries from the live glossary so these tests track the
// data rather than hardcoding term names that churn as entries are added,
// removed, or renamed.
const bareTerms = GLOSSARY.filter((e) => !e.term.startsWith("▸"));
const pluralEntry = GLOSSARY.find((e) =>
  (e.variants ?? []).some((v) => !v.startsWith("▸")),
);
const pluralVariant = (pluralEntry?.variants ?? []).find(
  (v) => !v.startsWith("▸"),
);
const arrowTermEntry = GLOSSARY.find((e) => e.term.startsWith("▸"));
const arrowGatedEntry = GLOSSARY.find(
  (e) =>
    e.term.startsWith("▸") && (e.variants ?? []).every((v) => v.startsWith("▸")),
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
    expect(terms.map((entry) => entry.term)).toEqual([
      t0.term,
      t1.term,
      t2.term,
    ]);
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
    const terms = extractGlossaryTerms(`(${t0.term}) — ${t1.term}: ${t2.term}.`);
    expect(terms.map((entry) => entry.term)).toEqual([
      t0.term,
      t1.term,
      t2.term,
    ]);
  });

  it("surfaces an arrow-gated term only when the arrow is present", () => {
    if (arrowGatedEntry === undefined) {
      return;
    }
    // The arrow form (e.g. `▸Materialized`, no space) shows the tile.
    const trigger = extractGlossaryTerms(`${arrowGatedEntry.term}: draw a card.`);
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
    const terms = extractGlossaryTerms(`${arrowTermEntry.term}: gain 1 energy.`);
    expect(terms.map((entry) => entry.term)).toEqual([arrowTermEntry.term]);
  });

  it("preserves order across heterogeneous mentions", () => {
    const [t0, t1, t2, t3] = bareTerms;
    const terms = extractGlossaryTerms(
      `After ${t0.term}, ${t1.term} a ${t2.term}, then ${t3.term}.`,
    );
    expect(terms.map((entry) => entry.term)).toEqual([
      t0.term,
      t1.term,
      t2.term,
      t3.term,
    ]);
  });
});
