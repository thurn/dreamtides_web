import { testJourneySeed } from "../../types/test-identities";
import { describe, expect, it } from "vitest";
import { stableDigest } from "../../reward-selection/stable";
import { parseCardName } from "../../types/card-identity";
import type { JourneyContent } from "../../data/journey-content";
import type { CardData } from "../../types/cards";
import type { JourneyState, SiteState } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestJourneyState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { MerchantAcceptRequest, MerchantOffer } from "../types";
import { generateMerchantEncounter } from "./generateMerchantEncounter";
import {
  applyMerchantPayloadToState,
  resolveMerchantDecline,
  resolveMerchantOffer,
} from "./resolveMerchantOffer";
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { testDreamscapeId, testCardId, testDreamsignId } from "../../types/test-identities";

function poolCards(count: number): CardData[] {
  const cards: CardData[] = [];
  for (let i = 0; i < count; i += 1) {
    const cardNumber = 1000 + i;
    const id = `aaaa0000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`;
    cards.push(
      makeMerchantTestCard({
        id: testCardId(id),
        cardNumber,
        name: parseCardName(`Pool ${String(cardNumber)}`),
      }),
    );
  }
  return cards;
}

function dreamsignFixture(count: number) {
  const templates = [];
  for (let i = 0; i < count; i += 1) {
    const id = `dsign-${String(i)}`;
    templates.push(
      makeMerchantTestDreamsignTemplate({
        id: testDreamsignId(id),
        name: `Sign ${String(i)}`,
      }),
    );
  }
  return templates;
}

function makeFixture(overrides: { seed?: string } = {}): {
  state: JourneyState;
  journeyContent: JourneyContent;
  site: SiteState;
} {
  const site = makeMerchantTestSite({
    id: parseSiteId("site-merchant-resolve"),
    type: "Augury",
  });
  const cards = poolCards(30);
  const templates = dreamsignFixture(10);
  const journeyContent = makeMerchantTestContent({
    cards,
    dreamsignTemplates: templates,
  });
  const state = makeMerchantTestJourneyState({
    seed: testJourneySeed(overrides.seed ?? "merchant-resolve-seed"),
    currentDreamscape: parseAtlasNodeId("dreamscape-a"),
    screen: { type: "site", siteId: site.id },
    activeSiteId: site.id,
    deck: [1000, 1001, 1002, 1003, 1004, 1005].map((cardNumber, index) =>
      makeMerchantTestDeckEntry({
        entryId: parseDeckEntryId(`deck-${String(index + 1)}`),
        cardNumber,
      }),
    ),
    atlas: {
      nodes: {
        [parseAtlasNodeId("dreamscape-a")]: {
          id: parseAtlasNodeId("dreamscape-a"),
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: testDreamscapeId("test_dreamscape"),
          sites: [site],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
      startingNodeId: parseAtlasNodeId("dreamscape-a"),
      bossNodeId: parseAtlasNodeId("dreamscape-a"),
      currentNodeId: parseAtlasNodeId("dreamscape-a"),
      layers: [],
      knownDreamsignCarrierIds: [],
    },
  });
  return { state, journeyContent, site };
}

function encounterFor(fixture: {
  state: JourneyState;
  journeyContent: JourneyContent;
  site: SiteState;
}) {
  return generateMerchantEncounter(
    buildMerchantContext({
      journeyState: fixture.state,
      journeyContent: fixture.journeyContent,
      site: fixture.site,
    }),
  );
}

function requestFor(offer: MerchantOffer): MerchantAcceptRequest {
  return {
    encounterSignature: offer.encounterSignature,
    offerId: offer.offerId,
    archetypeId: offer.archetypeId,
  };
}

describe("resolveMerchantOffer", () => {
  it("rejects a stale signature and leaves state untouched", () => {
    const fixture = makeFixture();
    const encounter = encounterFor(fixture);
    const offer = encounter.offers[0];
    const result = resolveMerchantOffer({
      state: fixture.state,
      journeyContent: fixture.journeyContent,
      site: fixture.site,
      request: { ...requestFor(offer), encounterSignature: stableDigest("stale") },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("stale_encounter");
    }
    expect(result.state).toBe(fixture.state);
  });

  it("rejects an archetype mismatch without mutation", () => {
    const fixture = makeFixture();
    const encounter = encounterFor(fixture);
    const offer = encounter.offers[0];
    const wrongArchetype =
      offer.archetypeId === "strong_card" ? "dreamsign" : "strong_card";
    const result = resolveMerchantOffer({
      state: fixture.state,
      journeyContent: fixture.journeyContent,
      site: fixture.site,
      request: { ...requestFor(offer), archetypeId: wrongArchetype },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("archetype_mismatch");
    }
    expect(result.state).toBe(fixture.state);
  });

  it("applies the payload and completes the site on a valid accept", () => {
    const fixture = makeFixture();
    const encounter = encounterFor(fixture);
    // Accept a direct-payload (non-chooser) offer; choosers are exercised by
    // the per-archetype builder tests. The accepted payload must apply and the
    // site must complete; the observable effect depends on the payload kind.
    const directOffer = encounter.offers.find(
      (offer) => offer.applyPayload !== undefined,
    );
    expect(directOffer).toBeDefined();
    if (directOffer === undefined) return;
    const directPayload = directOffer.applyPayload;
    expect(directPayload).toBeDefined();
    if (directPayload === undefined) return;
    const expectedRewardState = applyMerchantPayloadToState({
      state: fixture.state,
      journeyContent: fixture.journeyContent,
      payload: directPayload,
    });
    expect(expectedRewardState).not.toBeNull();
    if (expectedRewardState === null) return;
    const result = resolveMerchantOffer({
      state: fixture.state,
      journeyContent: fixture.journeyContent,
      site: fixture.site,
      request: requestFor(directOffer),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.screen).toEqual({ type: "dreamscape" });
    expect(
      result.state.atlas.nodes[parseAtlasNodeId("dreamscape-a")]?.sites[0]
        ?.isVisited,
    ).toBe(true);
    expect(result.appliedPayload).toEqual(directPayload);
    expect(result.state.deck).toEqual(expectedRewardState.deck);
    expect(result.state.dreamsigns).toEqual(expectedRewardState.dreamsigns);
    expect(result.state.essence).toBe(expectedRewardState.essence);
    expect(
      Object.values(result.state.atlas.nodes).map((node) =>
        node.sites.map(
          ({ isVisited: _isVisited, ...candidateSite }) => candidateSite,
        ),
      ),
    ).toEqual(
      Object.values(expectedRewardState.atlas.nodes).map((node) =>
        node.sites.map(
          ({ isVisited: _isVisited, ...candidateSite }) => candidateSite,
        ),
      ),
    );
  });

  it("declines without mutating deck or dreamsigns and completes the site", () => {
    const fixture = makeFixture();
    const encounter = encounterFor(fixture);
    const result = resolveMerchantDecline({
      state: fixture.state,
      journeyContent: fixture.journeyContent,
      site: fixture.site,
      request: {
        encounterSignature: encounter.encounterSignature,
        offerId: encounter.offers[0].offerId,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.deck).toEqual(fixture.state.deck);
    expect(result.state.dreamsigns).toEqual(fixture.state.dreamsigns);
    expect(result.state.screen).toEqual({ type: "dreamscape" });
    expect(
      result.state.atlas.nodes[parseAtlasNodeId("dreamscape-a")]?.sites[0]
        ?.isVisited,
    ).toBe(true);
  });
});

describe("applyMerchantPayloadToState", () => {
  it("appends a catalog card to the deck", () => {
    const fixture = makeFixture();
    const card = fixture.journeyContent.cardDatabase.get(1000);
    expect(card).toBeDefined();
    if (card === undefined) return;
    const next = applyMerchantPayloadToState({
      state: fixture.state,
      journeyContent: fixture.journeyContent,
      payload: {
        kind: "add_catalog_card",
        cardUuid: card.id,
        cardNumber: card.cardNumber,
      },
    });
    expect(next).not.toBeNull();
    expect(next?.deck.length).toBe(fixture.state.deck.length + 1);
  });

  it("adds a site to the current dreamscape", () => {
    const fixture = makeFixture();
    const next = applyMerchantPayloadToState({
      state: fixture.state,
      journeyContent: fixture.journeyContent,
      payload: { kind: "add_site", siteType: "Shop" },
    });
    expect(next).not.toBeNull();
    // The current dreamscape gains one new Site of the requested type.
    const beforeCount =
      fixture.state.atlas.nodes[parseAtlasNodeId("dreamscape-a")]?.sites.length ??
      0;
    const afterCount =
      next?.atlas.nodes[parseAtlasNodeId("dreamscape-a")]?.sites.length ?? 0;
    expect(afterCount).toBe(beforeCount + 1);
    const sites = next?.atlas.nodes[parseAtlasNodeId("dreamscape-a")]?.sites ?? [];
    const addedSite = sites[sites.length - 1];
    expect(addedSite?.type).toBe("Shop");
    expect(addedSite?.isVisited).toBe(false);
  });
});
