// Structural-contract tests for the `tides3` artifact validator. These pin the
// schema invariants (every tide has an id, role, and cards; every DreamAvatar
// pool is non-empty and references existing tides) against synthetic fixtures —
// never against the committed `data/tides3.jsonc`, whose content is baked design
// data and subject to change at any time.

import { describe, expect, it } from "vitest";

import type { Tides3DecksJson } from "./tides3-io.ts";
import { validateTides3Decks } from "./tides3-io.ts";

function makeArtifact(): Tides3DecksJson {
  return {
    version: 1,
    tides: [
      {
        id: "tide-sig-01",
        name: "Rael signature",
        role: "signature",
        cards: [
          { id: "11111111-1111-1111-1111-111111111111", name: "Card A", copies: 2 },
          { id: "22222222-2222-2222-2222-222222222222", name: "Card B", copies: 1 },
        ],
      },
      {
        id: "tide-neu-01",
        name: "Broad: Card C / Card D",
        role: "neutral",
        cards: [
          { id: "33333333-3333-3333-3333-333333333333", name: "Card C", copies: 1 },
        ],
      },
    ],
    tidePoolByDreamAvatar: {
      "dc-a": { leads: ["tide-sig-01"], fill: ["tide-neu-01"] },
      "dc-b": { leads: ["tide-sig-01"], fill: ["tide-neu-01"] },
    },
  };
}

const clone = (data: Tides3DecksJson): unknown =>
  JSON.parse(JSON.stringify(data));

describe("validateTides3Decks", () => {
  it("accepts a well-formed artifact and returns it typed", () => {
    const data = makeArtifact();
    expect(validateTides3Decks(clone(data))).toEqual(data);
  });

  it("rejects a non-object payload", () => {
    expect(() => validateTides3Decks(null)).toThrow(/not an object/);
  });

  it("rejects a missing version", () => {
    const data = clone(makeArtifact()) as Record<string, unknown>;
    delete data.version;
    expect(() => validateTides3Decks(data)).toThrow(/version/);
  });

  it("rejects an empty tides array", () => {
    const data = clone(makeArtifact()) as { tides: unknown[] };
    data.tides = [];
    expect(() => validateTides3Decks(data)).toThrow(/non-empty `tides`/);
  });

  it("rejects a duplicate tide id", () => {
    const data = makeArtifact();
    data.tides[1].id = data.tides[0].id;
    expect(() => validateTides3Decks(clone(data))).toThrow(/duplicate tide id/);
  });

  it("rejects an unknown role", () => {
    const data = clone(makeArtifact()) as Tides3DecksJson;
    (data.tides[0] as { role: string }).role = "broad";
    expect(() => validateTides3Decks(data)).toThrow(/unknown role/);
  });

  it("rejects a tide with no cards", () => {
    const data = makeArtifact();
    data.tides[0].cards = [];
    expect(() => validateTides3Decks(clone(data))).toThrow(/without cards/);
  });

  it("rejects a card without a UUID", () => {
    const data = clone(makeArtifact()) as Tides3DecksJson;
    (data.tides[0].cards[0] as { id: string }).id = "";
    expect(() => validateTides3Decks(data)).toThrow(/without a UUID/);
  });

  it("rejects invalid copies", () => {
    const data = makeArtifact();
    data.tides[0].cards[0].copies = 0;
    expect(() => validateTides3Decks(clone(data))).toThrow(/invalid copies/);
  });

  it("rejects a missing tidePoolByDreamAvatar", () => {
    const data = clone(makeArtifact()) as Record<string, unknown>;
    delete data.tidePoolByDreamAvatar;
    expect(() => validateTides3Decks(data)).toThrow(/tidePoolByDreamAvatar/);
  });

  it("rejects an empty leads list", () => {
    const data = makeArtifact();
    data.tidePoolByDreamAvatar["dc-a"].leads = [];
    expect(() => validateTides3Decks(clone(data))).toThrow(/no `leads`/);
  });

  it("rejects an empty fill list", () => {
    const data = makeArtifact();
    data.tidePoolByDreamAvatar["dc-a"].fill = [];
    expect(() => validateTides3Decks(clone(data))).toThrow(/no `fill`/);
  });

  it("rejects a tide-pool id that names no tide (a stale combination)", () => {
    const data = makeArtifact();
    data.tidePoolByDreamAvatar["dc-a"].leads = ["tide-sig-01", "tide-missing"];
    expect(() => validateTides3Decks(clone(data))).toThrow(/names no tide/);
  });
});
