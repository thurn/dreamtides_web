import { describe, expect, it } from "vitest";
import type { QuestContent } from "../../data/quest-content";
import type { CardData } from "../../types/cards";
import type { MerchantCorpusCard } from "../../data/merchant-corpus";
import type { DreamsignProfile } from "../../data/dreamsign-profiles";
import type { QuestState, SiteState } from "../../types/quest";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignProfile,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestQuestState,
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
      makeMerchantTestCard({ id, cardNumber, name: `Pool ${String(cardNumber)}` }),
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
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
} {
  const site = makeMerchantTestSite({
    id: "site-merchant-resolve",
    type: "DreamJourney",
  });
  const { cards, corpus } = poolCards(30);
  const { templates, profiles } = dreamsignFixture(10);
  const questContent = makeMerchantTestContent({
    cards,
    dreamsignTemplates: templates,
    merchantCorpus: makeMerchantTestCorpus({ cards: corpus }),
    dreamsignProfiles: new Map(Object.entries(profiles)),
  });
  const state = makeMerchantTestQuestState({
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
          biomeName: "Fixture",
          biomeColor: "#123456",
          sites: [site],
          position: { x: 0, y: 0 },
          status: "available",
          enhancedSiteType: null,
        },
      },
      edges: [],
      startingNodeId: "dreamscape-a",
    },
  });
  return { state, questContent, site };
}

function encounterFor(fixture: {
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
}) {
  return generateMerchantEncounter(
    buildMerchantContext({
      questState: fixture.state,
      questContent: fixture.questContent,
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
      questContent: fixture.questContent,
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
      questContent: fixture.questContent,
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
    const grantOffer =
      encounter.offers.find((offer) => offer.archetypeId === "strong_card") ??
      encounter.offers[0];
    const beforeDeckSize = fixture.state.deck.length;
    const result = resolveMerchantOffer({
      state: fixture.state,
      questContent: fixture.questContent,
      site: fixture.site,
      request: requestFor(grantOffer),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.screen).toEqual({ type: "dreamscape" });
    expect(result.state.atlas.nodes["dreamscape-a"]?.sites[0]?.isVisited).toBe(true);
    if (grantOffer.archetypeId === "strong_card") {
      expect(result.state.deck.length).toBe(beforeDeckSize + 1);
    } else {
      expect(result.state.dreamsigns.length).toBe(
        fixture.state.dreamsigns.length + 1,
      );
    }
  });

  it("declines without mutating deck or dreamsigns and completes the site", () => {
    const fixture = makeFixture();
    const encounter = encounterFor(fixture);
    const result = resolveMerchantDecline({
      state: fixture.state,
      questContent: fixture.questContent,
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
    const card = fixture.questContent.cardDatabase.get(1000);
    expect(card).toBeDefined();
    if (card === undefined) return;
    const next = applyMerchantPayloadToState({
      state: fixture.state,
      questContent: fixture.questContent,
      payload: {
        kind: "add_catalog_card",
        cardUuid: card.id,
        cardNumber: card.cardNumber,
      },
    });
    expect(next).not.toBeNull();
    expect(next?.deck.length).toBe(fixture.state.deck.length + 1);
  });

  it("treats add_site as a safe no-op for now", () => {
    const fixture = makeFixture();
    const next = applyMerchantPayloadToState({
      state: fixture.state,
      questContent: fixture.questContent,
      payload: { kind: "add_site", siteType: "Shop" },
    });
    expect(next).toBe(fixture.state);
  });
});
