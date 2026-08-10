// Structural-contract tests for the `tides4` artifact validator. These pin the
// schema invariants (every tide has an id, role, and cards; every DreamAvatar
// pool has a non-empty facet list, an array neutral list, and a starter that is
// null or an existing tide; every referenced id names an existing tide) against
// synthetic fixtures — never against the manually curated production catalog.

import { describe, expect, it } from "vitest";

import type { Tides4DecksJson } from "./tides4-io.ts";
import { validateTides4Decks } from "./tides4-io.ts";

function makeArtifact(): Tides4DecksJson {
  return {
    version: 1,
    tides: [
      {
        id: "tide-sig-01",
        displayName: "Rael signature",
        displayDescription: "Signature description",
        role: "signature",
        resonance: "shadow",
        cards: [
          { id: "11111111-1111-1111-1111-111111111111", copies: 2 },
          { id: "22222222-2222-2222-2222-222222222222", copies: 1 },
        ],
      },
      {
        id: "tide-fac-01",
        displayName: "Lean: Card A",
        displayDescription: "Facet description",
        role: "facet",
        resonance: "wild",
        cards: [
          { id: "11111111-1111-1111-1111-111111111111", copies: 2 },
          { id: "44444444-4444-4444-4444-444444444444", copies: 1 },
        ],
      },
      {
        id: "tide-neu-01",
        displayName: "Broad: Card C / Card D",
        displayDescription: "Neutral description",
        role: "neutral",
        resonance: "vision",
        cards: [
          { id: "33333333-3333-3333-3333-333333333333", copies: 1 },
        ],
      },
    ],
    tidePoolByDreamAvatar: {
      // A signatured DreamAvatar: a starter, on-identity facets, a broad tail.
      "dc-a": { starter: "tide-sig-01", facets: ["tide-fac-01"], neutral: ["tide-neu-01"] },
      // A signatureless DreamAvatar: no starter, draws from the facet library.
      "dc-b": { starter: null, facets: ["tide-fac-01"], neutral: ["tide-neu-01"] },
    },
  };
}

const clone = (data: Tides4DecksJson): unknown =>
  JSON.parse(JSON.stringify(data));

describe("validateTides4Decks", () => {
  it("accepts a well-formed artifact and returns it typed", () => {
    const data = makeArtifact();
    expect(validateTides4Decks(clone(data))).toEqual(data);
  });

  it("rejects a non-object payload", () => {
    expect(() => validateTides4Decks(null)).toThrow(/not an object/);
  });

  it("rejects a missing version", () => {
    const data = clone(makeArtifact()) as Record<string, unknown>;
    delete data.version;
    expect(() => validateTides4Decks(data)).toThrow(/version/);
  });

  it("rejects an empty tides array", () => {
    const data = clone(makeArtifact()) as { tides: unknown[] };
    data.tides = [];
    expect(() => validateTides4Decks(data)).toThrow(/non-empty `tides`/);
  });

  it("rejects a duplicate tide id", () => {
    const data = makeArtifact();
    data.tides[1].id = data.tides[0].id;
    expect(() => validateTides4Decks(clone(data))).toThrow(/duplicate tide id/);
  });

  it("rejects an unknown role", () => {
    const data = clone(makeArtifact()) as Tides4DecksJson;
    (data.tides[0] as { role: string }).role = "broad";
    expect(() => validateTides4Decks(data)).toThrow(/unknown role/);
  });

  it("rejects an unknown resonance", () => {
    const data = clone(makeArtifact()) as Tides4DecksJson;
    (data.tides[0] as { resonance: string }).resonance = "harmony";
    expect(() => validateTides4Decks(data)).toThrow(/unknown resonance/);
  });

  it("rejects a tide with a missing resonance", () => {
    const data = clone(makeArtifact()) as Tides4DecksJson;
    delete (data.tides[0] as { resonance?: string }).resonance;
    expect(() => validateTides4Decks(data)).toThrow(/unknown resonance/);
  });

  it("rejects a tide with no cards", () => {
    const data = makeArtifact();
    data.tides[0].cards = [];
    expect(() => validateTides4Decks(clone(data))).toThrow(/without cards/);
  });

  it("rejects a card without a UUID", () => {
    const data = clone(makeArtifact()) as Tides4DecksJson;
    (data.tides[0].cards[0] as { id: string }).id = "";
    expect(() => validateTides4Decks(data)).toThrow(/without a UUID/);
  });

  it("rejects invalid copies", () => {
    const data = makeArtifact();
    data.tides[0].cards[0].copies = 0;
    expect(() => validateTides4Decks(clone(data))).toThrow(/invalid copies/);
  });

  it("rejects a missing tidePoolByDreamAvatar", () => {
    const data = clone(makeArtifact()) as Record<string, unknown>;
    delete data.tidePoolByDreamAvatar;
    expect(() => validateTides4Decks(data)).toThrow(/tidePoolByDreamAvatar/);
  });

  it("accepts a null starter (a signatureless DreamAvatar)", () => {
    const data = makeArtifact();
    expect(validateTides4Decks(clone(data)).tidePoolByDreamAvatar["dc-b"].starter).toBe(
      null,
    );
  });

  it("rejects a starter that names no tide", () => {
    const data = makeArtifact();
    data.tidePoolByDreamAvatar["dc-a"].starter = "tide-missing";
    expect(() => validateTides4Decks(clone(data))).toThrow(/unknown `starter`/);
  });

  it("rejects an empty facet list", () => {
    const data = makeArtifact();
    data.tidePoolByDreamAvatar["dc-a"].facets = [];
    expect(() => validateTides4Decks(clone(data))).toThrow(/no `facets`/);
  });

  it("accepts an empty neutral list", () => {
    const data = makeArtifact();
    data.tidePoolByDreamAvatar["dc-a"].neutral = [];
    expect(() => validateTides4Decks(clone(data))).not.toThrow();
  });

  it("rejects a tide-pool id that names no tide (a stale combination)", () => {
    const data = makeArtifact();
    data.tidePoolByDreamAvatar["dc-a"].facets = ["tide-fac-01", "tide-missing"];
    expect(() => validateTides4Decks(clone(data))).toThrow(/names no tide/);
  });
});
