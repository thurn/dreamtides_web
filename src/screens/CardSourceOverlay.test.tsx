import { describe, expect, it } from "vitest";
import { resolveSource } from "../runtime/localization/runtime";

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
    displayName: "Signature A",
    displayDescription: "Signature description",
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
    if (view === null) throw new Error("Expected card source view.");
    expect(view?.construction?.lines.map((line) => resolveSource(line.text))).toContain("Signature A");
    expect(resolveSource(view.cards.lines[0].text)).toContain("signature tide Signature A");
  });

  it("falls back to pool-copy provenance while tides are loading", () => {
    const view = buildCardSourceView(DEBUG, null, new Map());
    if (view === null) throw new Error("Expected card source view.");
    expect(resolveSource(view.cards.lines[0].text)).toContain("2 copies in the pool");
  });
});
