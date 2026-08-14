import { describe, expect, it } from "vitest";
import { applyMerchantPayloadToState } from "../encounter/resolveMerchantOffer";
import { merchantRng } from "../signals/rng";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestJourneyState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { JourneyState } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import type { MerchantContext } from "../types";
import { asCardId } from "../../types/card-identity";
import { addSiteBuilder, MERCHANT_PLACEABLE_SITE_TYPES } from "./site";

function makeDreamscapeState(overrides: Partial<JourneyState> = {}): JourneyState {
  const base = makeMerchantTestJourneyState(overrides);
  // Set up a current dreamscape with some pre-existing sites
  return {
    ...base,
    currentDreamscape: "node-1",
    atlas: {
      nodes: {
        "node-1": {
          id: "node-1",
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: "test_dreamscape",
          sites: [
            {
              id: "site-1",
              type: "Battle",
              isEnhanced: false,
              isVisited: false,
            },
            {
              id: "site-2",
              type: "Draft",
              isEnhanced: false,
              isVisited: false,
            },
          ],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
        "node-2": {
          id: "node-2",
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: "test_dreamscape",
          sites: [
            {
              id: "site-10",
              type: "Shop",
              isEnhanced: false,
              isVisited: false,
            },
          ],
          position: { x: 1, y: 0 },
          state: "revealedLocked",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
      startingNodeId: "node-1",
      bossNodeId: "node-1",
      currentNodeId: "node-1",
      layers: [],
      knownDreamsignCarrierIds: [],
    },
  };
}

function makeContext(state: JourneyState): MerchantContext {
  const journeyContent = makeMerchantTestContent({
    cards: [makeMerchantTestCard({ id: asCardId("11111111-1111-4111-8111-111111111111"), cardNumber: 1 })],
  });
  return buildMerchantContext({ journeyState: state, journeyContent, site: makeMerchantTestSite() });
}

// ---------------------------------------------------------------------------
// Bug-class: add_site eligibility (always eligible)
// ---------------------------------------------------------------------------

describe("add_site — always eligible", () => {
  it("is eligible with an empty deck", () => {
    const state = makeDreamscapeState();
    const context = makeContext(state);
    expect(addSiteBuilder.eligible(context)).toBe(true);
  });

  it("is eligible with no current dreamscape", () => {
    const state = makeMerchantTestJourneyState();
    const context = makeContext(state);
    expect(addSiteBuilder.eligible(context)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bug-class: add_site apply adds site to CURRENT dreamscape only
// ---------------------------------------------------------------------------

describe("add_site apply — current dreamscape gains exactly one site", () => {
  it("adds exactly one site to the current dreamscape", () => {
    const state = makeDreamscapeState();
    const context = makeContext(state);
    const journeyContent = makeMerchantTestContent({
      cards: [makeMerchantTestCard({ id: asCardId("11111111-1111-4111-8111-111111111111"), cardNumber: 1 })],
    });

    const rng = merchantRng("add-site-apply-test", "0");
    const offer = addSiteBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;

    expect(offer.applyPayload).toBeDefined();
    if (offer.applyPayload === undefined) return;
    expect(offer.applyPayload.kind).toBe("add_site");

    const payload = offer.applyPayload;
    const resultState = applyMerchantPayloadToState({ state, journeyContent, payload });
    expect(resultState).not.toBeNull();
    if (resultState === null) return;

    // Current dreamscape (node-1) has one MORE site
    const currentNode = resultState.atlas.nodes["node-1"];
    const originalNode = state.atlas.nodes["node-1"];
    expect(currentNode).toBeDefined();
    expect(originalNode).toBeDefined();
    if (currentNode === undefined || originalNode === undefined) return;

    expect(currentNode.sites.length).toBe(originalNode.sites.length + 1);
    if (payload.kind === "add_site") {
      const addedSite = currentNode.sites[currentNode.sites.length - 1];
      expect(addedSite?.type).toBe(payload.siteType);
    }
  });

  it("does not modify other dreamscapes", () => {
    const state = makeDreamscapeState();
    const context = makeContext(state);
    const journeyContent = makeMerchantTestContent({
      cards: [makeMerchantTestCard({ id: asCardId("11111111-1111-4111-8111-111111111111"), cardNumber: 1 })],
    });

    const rng = merchantRng("add-site-other-dreamscape-test", "0");
    const offer = addSiteBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;
    if (offer.applyPayload === undefined) return;

    const resultState = applyMerchantPayloadToState({
      state,
      journeyContent,
      payload: offer.applyPayload,
    });
    expect(resultState).not.toBeNull();
    if (resultState === null) return;

    // node-2 (not current) must be unchanged
    expect(resultState.atlas.nodes["node-2"]?.sites.length).toBe(
      state.atlas.nodes["node-2"]?.sites.length,
    );
  });
});

// ---------------------------------------------------------------------------
// Bug-class: id collision on repeated rewards (distinct site ids)
// ---------------------------------------------------------------------------

describe("add_site apply — distinct site ids on repeated apply", () => {
  it("applying the same payload twice yields sites with distinct ids", () => {
    const state = makeDreamscapeState();
    const context = makeContext(state);
    const journeyContent = makeMerchantTestContent({
      cards: [makeMerchantTestCard({ id: asCardId("11111111-1111-4111-8111-111111111111"), cardNumber: 1 })],
    });

    const rng = merchantRng("add-site-distinct-ids-test", "0");
    const offer = addSiteBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null || offer.applyPayload === undefined) return;

    const payload = offer.applyPayload;

    // Apply once
    const state1 = applyMerchantPayloadToState({ state, journeyContent, payload });
    expect(state1).not.toBeNull();
    if (state1 === null) return;

    // Apply again to the already-modified state (simulate getting the same payload twice)
    const state2 = applyMerchantPayloadToState({ state: state1, journeyContent, payload });
    expect(state2).not.toBeNull();
    if (state2 === null) return;

    // Both added sites must have distinct ids
    const currentNode1 = state1.atlas.nodes["node-1"];
    const currentNode2 = state2.atlas.nodes["node-1"];
    expect(currentNode1).toBeDefined();
    expect(currentNode2).toBeDefined();
    if (currentNode1 === undefined || currentNode2 === undefined) return;

    // node-1 originally had 2 sites; after two applies it should have 4
    expect(currentNode2.sites.length).toBe(4);

    const addedFirst = currentNode1.sites[currentNode1.sites.length - 1];
    const addedSecond = currentNode2.sites[currentNode2.sites.length - 1];
    expect(addedFirst).toBeDefined();
    expect(addedSecond).toBeDefined();
    if (addedFirst === undefined || addedSecond === undefined) return;

    expect(addedFirst.id).not.toBe(addedSecond.id);
  });
});

// ---------------------------------------------------------------------------
// Bug-class: add_site builder samples from placeable list
// ---------------------------------------------------------------------------

describe("add_site — builder samples from placeable site types", () => {
  it("sampled site type comes from the MERCHANT_PLACEABLE_SITE_TYPES list", () => {
    const state = makeDreamscapeState();
    const context = makeContext(state);
    const placeableSet = new Set(MERCHANT_PLACEABLE_SITE_TYPES);

    for (let seed = 0; seed < 20; seed += 1) {
      const rng = merchantRng("add-site-placeable-test", String(seed));
      const offer = addSiteBuilder.build(context, rng);
      if (offer === null) continue;
      if (offer.applyPayload?.kind === "add_site") {
        expect(placeableSet.has(offer.applyPayload.siteType)).toBe(true);
      }
    }
  });

  it("targetKey matches the sampled siteType", () => {
    const state = makeDreamscapeState();
    const context = makeContext(state);

    for (let seed = 0; seed < 10; seed += 1) {
      const rng = merchantRng("add-site-targetkey-test", String(seed));
      const offer = addSiteBuilder.build(context, rng);
      if (offer === null) continue;
      if (offer.applyPayload?.kind === "add_site") {
        expect(offer.targetKey).toBe(offer.applyPayload.siteType);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bug-class: family is "site"
// ---------------------------------------------------------------------------

describe("add_site — family is site", () => {
  it("declares family === site and archetypeId === add_site", () => {
    expect(addSiteBuilder.family).toBe("site");
    expect(addSiteBuilder.archetypeId).toBe("add_site");
  });
});
