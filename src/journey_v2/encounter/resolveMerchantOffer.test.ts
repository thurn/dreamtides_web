import { describe, expect, it } from "vitest";
import type { QuestContent } from "../../data/quest-content";
import type { CardData } from "../../types/cards";
import type { QuestState, SiteState } from "../../types/quest";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type {
  MerchantAcceptRequest,
  MerchantApplyPayload,
  MerchantOffer,
} from "../types";
import { generateMerchantEncounter } from "./generateMerchantEncounter";
import {
  applyMerchantPayloadToState,
  resolveMerchantDecline,
  resolveMerchantOffer,
} from "./resolveMerchantOffer";

const UUIDS = {
  deckHighEvent: "71000000-0000-4000-8000-000000000001",
  deckHighCharacter: "71000000-0000-4000-8000-000000000002",
  deckFillerA: "71000000-0000-4000-8000-000000000003",
  deckFillerB: "71000000-0000-4000-8000-000000000004",
  deckFillerC: "71000000-0000-4000-8000-000000000005",
  deckFillerD: "71000000-0000-4000-8000-000000000006",
  drawA: "71000000-0000-4000-8000-000000000101",
  drawB: "71000000-0000-4000-8000-000000000102",
  drawC: "71000000-0000-4000-8000-000000000103",
  drawD: "71000000-0000-4000-8000-000000000104",
  recursionA: "71000000-0000-4000-8000-000000000201",
  recursionB: "71000000-0000-4000-8000-000000000202",
  recursionC: "71000000-0000-4000-8000-000000000203",
  interactionA: "71000000-0000-4000-8000-000000000301",
  interactionB: "71000000-0000-4000-8000-000000000302",
  interactionC: "71000000-0000-4000-8000-000000000303",
  earlyA: "71000000-0000-4000-8000-000000000401",
  earlyB: "71000000-0000-4000-8000-000000000402",
  earlyC: "71000000-0000-4000-8000-000000000403",
} as const;

function card(
  id: string,
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return makeMerchantTestCard({
    id,
    cardNumber,
    name: `Resolve Fixture ${cardNumber}`,
    cardType: "Character",
    energyCost: 2,
    spark: 1,
    renderedText: "",
    ...overrides,
  });
}

function fixtureCards(): CardData[] {
  return [
    card(UUIDS.deckHighEvent, 1, {
      cardType: "Event",
      energyCost: 5,
      spark: null,
      renderedText: "Fast.",
    }),
    card(UUIDS.deckHighCharacter, 2, {
      energyCost: 5,
      spark: 4,
    }),
    card(UUIDS.deckFillerA, 3, { energyCost: 4 }),
    card(UUIDS.deckFillerB, 4, { energyCost: 4 }),
    card(UUIDS.deckFillerC, 5, { energyCost: 3 }),
    card(UUIDS.deckFillerD, 6, { energyCost: 3 }),
    card(UUIDS.drawA, 101, { renderedText: "Draw a card." }),
    card(UUIDS.drawB, 102, { renderedText: "Draw two cards." }),
    card(UUIDS.drawC, 103, { renderedText: "When this enters, draw a card." }),
    card(UUIDS.drawD, 104, {
      rarity: "Legendary",
      renderedText: "Draw a card, then gain 1 spark.",
    }),
    card(UUIDS.recursionA, 201, { renderedText: "Reclaim 1." }),
    card(UUIDS.recursionB, 202, {
      renderedText: "Return a card from your void to your hand.",
    }),
    card(UUIDS.recursionC, 203, { renderedText: "Reclaim 2." }),
    card(UUIDS.interactionA, 301, { renderedText: "Banish an enemy." }),
    card(UUIDS.interactionB, 302, { renderedText: "Prevent the next damage." }),
    card(UUIDS.interactionC, 303, {
      renderedText: "Return an enemy to its owner's hand.",
    }),
    card(UUIDS.earlyA, 401, { energyCost: 1 }),
    card(UUIDS.earlyB, 402, { energyCost: 1 }),
    card(UUIDS.earlyC, 403, { energyCost: 0 }),
  ];
}

function buildFixture(overrides: {
  essence?: number;
  essenceCap?: number;
  deckCardNumbers?: readonly number[];
  site?: Partial<SiteState>;
  contentCards?: readonly CardData[];
} = {}): {
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
} {
  const site = makeMerchantTestSite({
    id: "site-merchant-resolve",
    type: "DreamJourney",
    ...overrides.site,
  });
  const state = makeMerchantTestQuestState({
    seed: "merchant-resolve-seed",
    essence: overrides.essence ?? 240,
    essenceCap: overrides.essenceCap ?? 360,
    currentDreamscape: "dreamscape-a",
    screen: { type: "site", siteId: site.id },
    activeSiteId: site.id,
    deck: (overrides.deckCardNumbers ?? [1, 2, 3, 4, 5, 6]).map(
      (cardNumber, index) =>
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
  const questContent = makeMerchantTestContent({
    cards: overrides.contentCards ?? fixtureCards(),
    dreamsignTemplates: [
      makeMerchantTestDreamsignTemplate({ id: "sign-draw" }),
      makeMerchantTestDreamsignTemplate({ id: "sign-tempo" }),
      makeMerchantTestDreamsignTemplate({ id: "sign-void" }),
    ],
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
    expectedPrice: offer.price,
    rewardBuilderId: offer.rewardBuilderId,
    needId: offer.needId,
  };
}

function requireOffer(
  offers: readonly MerchantOffer[],
  predicate: (offer: MerchantOffer) => boolean,
): MerchantOffer {
  const offer = offers.find(predicate);
  if (offer === undefined) throw new Error("Expected generated offer");
  return offer;
}

function payloadChangedState(
  before: QuestState,
  after: QuestState,
  payload: MerchantApplyPayload,
): boolean {
  switch (payload.kind) {
    case "add_catalog_card":
      return after.deck.some((entry) => entry.cardNumber === payload.cardNumber);
    case "add_dreamsign":
      return after.dreamsigns.some((dreamsign) => dreamsign.id === payload.dreamsignId);
    case "transfigure_deck_entry":
      return after.deck.some(
        (entry) =>
          entry.entryId === payload.entryId &&
          entry.transfiguration === payload.transfiguration,
      );
    case "duplicate_deck_entry":
      return after.deck.length === before.deck.length + 1;
    case "remove_deck_entry":
      return after.deck.every((entry) => entry.entryId !== payload.entryId);
    case "change_deck_entry_keywords":
      return after.deck.some(
        (entry) =>
          entry.entryId === payload.entryId &&
          entry.keywordModification !== before.deck.find(
            (oldEntry) => oldEntry.entryId === payload.entryId,
          )?.keywordModification,
      );
    case "change_deck_entry_type":
      return after.deck.some(
        (entry) =>
          entry.entryId === payload.entryId && entry.typeChange === payload.typeChange,
      );
    case "change_essence":
    case "change_max_essence":
      return after.essence !== before.essence || after.essenceCap !== before.essenceCap;
    case "composite":
      return payload.children.some((child) => payloadChangedState(before, after, child));
  }
}

describe("resolveMerchantOffer", () => {
  it("accepts a direct offer, deducts essence, applies the reward, completes the site, and returns to dreamscape", () => {
    const fixture = buildFixture();
    const offer = requireOffer(
      encounterFor(fixture).offers,
      (candidate) => candidate.reward.applyPayload !== undefined && !candidate.locked,
    );

    const result = resolveMerchantOffer({
      ...fixture,
      request: requestFor(offer),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.essence).toBe(fixture.state.essence - offer.price);
    expect(payloadChangedState(
      fixture.state,
      result.state,
      result.appliedPayload,
    )).toBe(true);
    expect(result.state.visitedSites).toContain(fixture.site.id);
    expect(result.state.atlas.nodes["dreamscape-a"]?.sites[0]?.isVisited).toBe(true);
    expect(result.state.screen).toEqual({ type: "dreamscape" });
    expect(result.state.activeSiteId).toBeNull();
  });

  it("requires a valid choice id for chooser-backed offers and applies the selected choice", () => {
    const fixture = buildFixture();
    const offer = requireOffer(
      encounterFor(fixture).offers,
      (candidate) => candidate.reward.choiceRequest !== undefined && !candidate.locked,
    );
    const choice = offer.reward.choiceRequest?.candidates[0];
    if (choice === undefined) throw new Error("Expected chooser candidate");

    const missingChoice = resolveMerchantOffer({
      ...fixture,
      request: requestFor(offer),
    });
    expect(missingChoice).toEqual({
      ok: false,
      reason: "missing_choice",
      state: fixture.state,
    });

    const invalidChoice = resolveMerchantOffer({
      ...fixture,
      request: { ...requestFor(offer), choice: { choiceId: "missing-choice" } },
    });
    expect(invalidChoice).toEqual({
      ok: false,
      reason: "invalid_choice",
      state: fixture.state,
    });

    const result = resolveMerchantOffer({
      ...fixture,
      request: { ...requestFor(offer), choice: { choiceId: choice.choiceId } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appliedPayload).toEqual(choice.applyPayload);
    expect(payloadChangedState(
      fixture.state,
      result.state,
      choice.applyPayload,
    )).toBe(true);
  });

  it("fails stale encounter signatures without changing state", () => {
    const fixture = buildFixture();
    const offer = encounterFor(fixture).offers[0];
    if (offer === undefined) throw new Error("Expected offer");

    const result = resolveMerchantOffer({
      ...fixture,
      request: {
        ...requestFor(offer),
        encounterSignature: `${offer.encounterSignature}-stale`,
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: "stale_encounter",
      state: fixture.state,
    });
  });

  it("fails stale expected prices without changing state", () => {
    const fixture = buildFixture();
    const offer = encounterFor(fixture).offers[0];
    if (offer === undefined) throw new Error("Expected offer");

    const result = resolveMerchantOffer({
      ...fixture,
      request: {
        ...requestFor(offer),
        expectedPrice: offer.price + 1,
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: "price_changed",
      state: fixture.state,
    });
  });

  it("fails locked offers without changing state", () => {
    const fixture = buildFixture({ essence: 0 });
    const offer = requireOffer(encounterFor(fixture).offers, (candidate) => candidate.locked);

    const result = resolveMerchantOffer({
      ...fixture,
      request: requestFor(offer),
    });

    expect(result).toEqual({
      ok: false,
      reason: "offer_locked",
      state: fixture.state,
    });
  });

  it("fails missing deck targets without changing state", () => {
    const fixture = buildFixture();
    const payload: MerchantApplyPayload = {
      kind: "remove_deck_entry",
      entryId: "missing-entry",
      cardUuid: UUIDS.deckHighEvent,
      cardNumber: 1,
    };

    expect(applyMerchantPayloadToState({
      state: fixture.state,
      questContent: fixture.questContent,
      payload,
    })).toBeNull();
    expect(fixture.state.deck).toHaveLength(6);
  });

  it("applies composite payloads in order with deterministic new entry ids", () => {
    const fixture = buildFixture();
    const payload: MerchantApplyPayload = {
      kind: "composite",
      children: [
        {
          kind: "remove_deck_entry",
          entryId: "deck-6",
          cardUuid: UUIDS.deckFillerD,
          cardNumber: 6,
        },
        {
          kind: "add_catalog_card",
          cardUuid: UUIDS.drawA,
          cardNumber: 101,
        },
      ],
    };

    const result = applyMerchantPayloadToState({
      state: fixture.state,
      questContent: fixture.questContent,
      payload,
    });

    expect(result?.deck.map((entry) => entry.entryId)).toEqual([
      "deck-1",
      "deck-2",
      "deck-3",
      "deck-4",
      "deck-5",
      "deck-7",
    ]);
    if (result === null) throw new Error("Expected composite payload result");
    expect(result.deck[result.deck.length - 1]).toMatchObject({
      entryId: "deck-7",
      cardNumber: 101,
      transfiguration: null,
      isBane: false,
    });
  });
});

describe("resolveMerchantDecline", () => {
  it("marks the site visited and returns to dreamscape without changing deck or essence", () => {
    const fixture = buildFixture();
    const offer = encounterFor(fixture).offers[0];
    if (offer === undefined) throw new Error("Expected offer");

    const result = resolveMerchantDecline({
      ...fixture,
      request: {
        encounterSignature: offer.encounterSignature,
        offerId: offer.offerId,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.deck).toEqual(fixture.state.deck);
    expect(result.state.essence).toBe(fixture.state.essence);
    expect(result.state.visitedSites).toContain(fixture.site.id);
    expect(result.state.screen).toEqual({ type: "dreamscape" });
  });
});
