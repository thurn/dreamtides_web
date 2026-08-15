// Structural-contract tests for the `tides4` artifact validator. These pin the
// schema invariants (every tide has an id, role, and cards; every DreamAvatar
// pool has a non-empty facet list, an array neutral list, and a starter that is
// null or an existing tide; every referenced id names an existing tide) against
// synthetic fixtures — never against the manually curated production catalog.

import { describe, expect, it } from "vitest";

import type { Tides4DecksJson } from "./tides4-io.ts";
import { validateTides4Decks } from "./tides4-io.ts";
import {
  testCardId,
  testDreamAvatarId,
  testTideId,
} from "../../types/test-identities";

const SIGNATURE_TIDE_ID = testTideId("10000000-0000-4000-8000-000000000001");
const FACET_TIDE_ID = testTideId("10000000-0000-4000-8000-000000000002");
const NEUTRAL_TIDE_ID = testTideId("10000000-0000-4000-8000-000000000003");
const MISSING_TIDE_ID = testTideId("10000000-0000-4000-8000-000000000004");
const SIGNATURED_AVATAR_ID = testDreamAvatarId(
  "20000000-0000-4000-8000-000000000001",
);
const SIGNATURELESS_AVATAR_ID = testDreamAvatarId(
  "20000000-0000-4000-8000-000000000002",
);

function makeArtifact(): Tides4DecksJson {
  return {
    version: 2,
    selection: { bandFraction: 0.25, bandMinimum: 5 },
    tides: [
      {
        id: SIGNATURE_TIDE_ID,
        displayName: "Rael signature",
        displayDescription: "Signature description",
        role: "signature",
        resonance: "shadow",
        cards: [
          { id: testCardId("11111111-1111-1111-1111-111111111111"), copies: 2 },
          { id: testCardId("22222222-2222-2222-2222-222222222222"), copies: 1 },
        ],
      },
      {
        id: FACET_TIDE_ID,
        displayName: "Lean: Card A",
        displayDescription: "Facet description",
        role: "facet",
        resonance: "wild",
        cards: [
          { id: testCardId("11111111-1111-1111-1111-111111111111"), copies: 2 },
          { id: testCardId("44444444-4444-4444-4444-444444444444"), copies: 1 },
        ],
      },
      {
        id: NEUTRAL_TIDE_ID,
        displayName: "Broad: Card C / Card D",
        displayDescription: "Neutral description",
        role: "neutral",
        resonance: "vision",
        cards: [
          { id: testCardId("33333333-3333-3333-3333-333333333333"), copies: 1 },
        ],
      },
    ],
    tidePoolByDreamAvatar: {
      // A signatured DreamAvatar: a starter, on-identity facets, a broad tail.
      [SIGNATURED_AVATAR_ID]: {
        starter: SIGNATURE_TIDE_ID,
        facets: [FACET_TIDE_ID],
        neutral: [NEUTRAL_TIDE_ID],
      },
      // A signatureless DreamAvatar: no starter, draws from the facet library.
      [SIGNATURELESS_AVATAR_ID]: {
        starter: null,
        facets: [FACET_TIDE_ID],
        neutral: [NEUTRAL_TIDE_ID],
      },
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
    (data.tides[0].cards[0] as { id: unknown }).id = "";
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
    expect(
      validateTides4Decks(clone(data)).tidePoolByDreamAvatar[
        SIGNATURELESS_AVATAR_ID
      ].starter,
    ).toBe(null);
  });

  it("rejects a starter that names no tide", () => {
    const data = makeArtifact();
    data.tidePoolByDreamAvatar[SIGNATURED_AVATAR_ID].starter = MISSING_TIDE_ID;
    expect(() => validateTides4Decks(clone(data))).toThrow(/unknown `starter`/);
  });

  it("rejects an empty facet list", () => {
    const data = makeArtifact();
    data.tidePoolByDreamAvatar[SIGNATURED_AVATAR_ID].facets = [];
    expect(() => validateTides4Decks(clone(data))).toThrow(/no `facets`/);
  });

  it("accepts an empty neutral list", () => {
    const data = makeArtifact();
    data.tidePoolByDreamAvatar[SIGNATURED_AVATAR_ID].neutral = [];
    expect(() => validateTides4Decks(clone(data))).not.toThrow();
  });

  it("rejects a tide-pool id that names no tide (a stale combination)", () => {
    const data = makeArtifact();
    data.tidePoolByDreamAvatar[SIGNATURED_AVATAR_ID].facets = [
      FACET_TIDE_ID,
      MISSING_TIDE_ID,
    ];
    expect(() => validateTides4Decks(clone(data))).toThrow(/names no tide/);
  });
});
