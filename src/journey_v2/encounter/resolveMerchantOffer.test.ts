import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { JourneyContent } from "../../data/journey-content";
import type { CardData } from "../../types/cards";
import type { MerchantCorpusCard } from "../../data/merchant-corpus";
import type { DreamsignProfile } from "../../data/dreamsign-profiles";
import type { JourneyState, SiteState } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignProfile,
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

function poolCards(count: number): {
  cards: CardData[];
  corpus: Record<string, Partial<MerchantCorpusCard> & { quality: number }>;
} {
  const cards: CardData[] = [];
  const corpus: Record<string, Partial<MerchantCorpusCard> & { quality: number }> = {};
  for (let i = 0; i < count; i += 1) {
    const cardNumber = 1000 + i;
    const id = `aaaa0000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`;
    cards.push(
      makeMerchantTestCard({
        id: asCardId(id),
        cardNumber,
        name: asCardName(`Pool ${String(cardNumber)}`),
      }),
    );
    corpus[id] = { quality: (i % 20) / 20 + 0.01 * i };
  }
  return { cards, corpus };
}

function dreamsignFixture(count: number) {
  const templates = [];
  const profiles: Record<string, DreamsignProfile> = {};
  for (let i = 0; i < count; i += 1) {
    const id = `dsign-${String(i)}`;
    templates.push(makeMerchantTestDreamsignTemplate({ id, name: `Sign ${String(i)}` }));
    profiles[id] = makeMerchantTestDreamsignProfile({ id });
  }
  return { templates, profiles };
}

function makeFixture(overrides: { seed?: string } = {}): {
  state: JourneyState;
  journeyContent: JourneyContent;
  site: SiteState;
} {
  const site = makeMerchantTestSite({
    id: "site-merchant-resolve",
    type: "Augury",
  });
  const { cards, corpus } = poolCards(30);
  const { templates, profiles } = dreamsignFixture(10);
  const journeyContent = makeMerchantTestContent({
    cards,
    dreamsignTemplates: templates,
    merchantCorpus: makeMerchantTestCorpus({ cards: corpus }),
    dreamsignProfiles: new Map(Object.entries(profiles)),
  });
  const state = makeMerchantTestJourneyState({
    seed: overrides.seed ?? "merchant-resolve-seed",
    currentDreamscape: "dreamscape-a",
    screen: { type: "site", siteId: site.id },
    activeSiteId: site.id,
    deck: [1000, 1001, 1002, 1003, 1004, 1005].map((cardNumber, index) =>
      makeMerchantTestDeckEntry({
        entryId: `deck-${String(index + 1)}`,
        cardNumber,
      }),
    ),
    atlas: {
      nodes: {
        "dreamscape-a": {
          id: "dreamscape-a",
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: "test_dreamscape",
          biomeName: "Fixture",
          biomeColor: "#123456",
          sites: [site],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
      startingNodeId: "dreamscape-a",
      bossNodeId: "dreamscape-a",
      currentNodeId: "dreamscape-a",
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
      request: { ...requestFor(offer), encounterSignature: "stale" },
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
    const beforeDeckSize = fixture.state.deck.length;
    const beforeDreamsigns = fixture.state.dreamsigns.length;
    const beforeDeckJson = JSON.stringify(fixture.state.deck);
    const result = resolveMerchantOffer({
      state: fixture.state,
      journeyContent: fixture.journeyContent,
      site: fixture.site,
      request: requestFor(directOffer),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.screen).toEqual({ type: "dreamscape" });
    expect(result.state.atlas.nodes["dreamscape-a"]?.sites[0]?.isVisited).toBe(true);
    const kind = directOffer.applyPayload?.kind;
    if (kind === "add_dreamsign") {
      expect(result.state.dreamsigns.length).toBe(beforeDreamsigns + 1);
    } else if (kind === "add_catalog_card") {
      expect(result.state.deck.length).toBeGreaterThan(beforeDeckSize);
    } else {
      // In-place deck modifications (transfigure/keyword/type) keep the deck
      // size but mutate an entry; assert the deck content changed.
      expect(JSON.stringify(result.state.deck)).not.toBe(beforeDeckJson);
    }
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
    expect(result.state.atlas.nodes["dreamscape-a"]?.sites[0]?.isVisited).toBe(true);
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
      fixture.state.atlas.nodes["dreamscape-a"]?.sites.length ?? 0;
    const afterCount = next?.atlas.nodes["dreamscape-a"]?.sites.length ?? 0;
    expect(afterCount).toBe(beforeCount + 1);
    const sites = next?.atlas.nodes["dreamscape-a"]?.sites ?? [];
    const addedSite = sites[sites.length - 1];
    expect(addedSite?.type).toBe("Shop");
    expect(addedSite?.isVisited).toBe(false);
  });
});
