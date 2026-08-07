import { describe, expect, it } from "vitest";

import type { Tides4ProvenanceSummary } from "../types/content";
import type { CardSourceDebugState } from "../types/journey";
import { buildCardSourceView } from "./cumulus_adapters/card-source-view-model";

const DEBUG: CardSourceDebugState = {
  screenLabel: "Draft",
  surface: "Draft",
  entries: [{ cardNumber: 1, cardName: "Alpha", draftPoolCopies: 2 }],
};

const PROVENANCE: Tides4ProvenanceSummary = {
  dreamAvatarId: "avatar-a",
  signatureless: false,
  borrowedArchetypeName: null,
  dealSize: 150,
  cap: 2,
  maxFacets: 3,
  facetDrawnCount: 1,
  facetAvailableCount: 2,
  tides: [{
    id: "tide-a",
    name: "Signature A",
    displayName: "Signature A",
    role: "signature",
    selection: "starter",
    joined: true,
    cardNumbers: [1],
    contributedCardCount: 1,
  }],
  cardProvenanceByNumber: {
    "1": { copies: 2, tideIds: ["tide-a"], primaryTideId: "tide-a" },
  },
};

describe("card source view", () => {
  it("explains cards using tides4 provenance", () => {
    const view = buildCardSourceView(DEBUG, PROVENANCE, new Map());
    expect(view?.construction?.lines.map((line) => line.text)).toContain("Signature A");
    expect(view?.cards.lines[0]?.text).toContain("signature tide Signature A");
  });

  it("falls back to pool-copy provenance while tides are loading", () => {
    const view = buildCardSourceView(DEBUG, null, new Map());
    expect(view?.cards.lines[0]?.text).toContain("2 copies in the pool");
  });
});
