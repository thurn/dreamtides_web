import { describe, expect, it } from "vitest";
import { buildMerchantContext } from "../context/buildMerchantContext";
import { readMerchantDeck } from "../read/deckRead";
import { generateMerchantEncounter } from "./generateMerchantEncounter";
import type { CardData } from "../../types/cards";
import type { SiteState } from "../../types/quest";
import type { MerchantContext, MerchantNeed } from "../types";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../testing/fixtures";

const UUIDS = {
  deckHighEvent: "70000000-0000-4000-8000-000000000001",
  deckHighCharacter: "70000000-0000-4000-8000-000000000002",
  deckFillerA: "70000000-0000-4000-8000-000000000003",
  deckFillerB: "70000000-0000-4000-8000-000000000004",
  deckFillerC: "70000000-0000-4000-8000-000000000005",
  deckFillerD: "70000000-0000-4000-8000-000000000006",
  drawA: "70000000-0000-4000-8000-000000000101",
  drawB: "70000000-0000-4000-8000-000000000102",
  drawC: "70000000-0000-4000-8000-000000000103",
  drawD: "70000000-0000-4000-8000-000000000104",
  recursionA: "70000000-0000-4000-8000-000000000201",
  recursionB: "70000000-0000-4000-8000-000000000202",
  recursionC: "70000000-0000-4000-8000-000000000203",
  interactionA: "70000000-0000-4000-8000-000000000301",
  interactionB: "70000000-0000-4000-8000-000000000302",
  interactionC: "70000000-0000-4000-8000-000000000303",
  earlyA: "70000000-0000-4000-8000-000000000401",
  earlyB: "70000000-0000-4000-8000-000000000402",
  earlyC: "70000000-0000-4000-8000-000000000403",
  deckAlternate: "70000000-0000-4000-8000-000000000901",
} as const;

function card(
  id: string,
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return makeMerchantTestCard({
    id,
    cardNumber,
    name: `Encounter Fixture ${cardNumber}`,
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
      name: "High Event",
      cardType: "Event",
      energyCost: 5,
      spark: null,
      renderedText: "Fast.",
    }),
    card(UUIDS.deckHighCharacter, 2, {
      name: "High Character",
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
    card(UUIDS.deckAlternate, 901, { energyCost: 2, renderedText: "Draw a card." }),
  ];
}

function deckCardNumbers(): number[] {
  return [1, 2, 3, 4, 5, 6];
}

const CANDIDATE_CARD_NUMBERS = [
  101,
  102,
  103,
  104,
  201,
  202,
  203,
  301,
  302,
  303,
  401,
  402,
  403,
] as const;

function contextFor(
  overrides: {
    seed?: string;
    essence?: number;
    essenceCap?: number;
    site?: Partial<SiteState>;
    deckNumbers?: readonly number[];
    cardOverridesByNumber?: ReadonlyMap<number, Partial<CardData>>;
  } = {},
): MerchantContext {
  const cards = fixtureCards().map((testCard) => ({
    ...testCard,
    ...(overrides.cardOverridesByNumber?.get(testCard.cardNumber) ?? {}),
  }));
  return buildMerchantContext({
    questState: makeMerchantTestQuestState({
      seed: overrides.seed ?? "merchant-encounter-seed",
      essence: overrides.essence ?? 180,
      essenceCap: overrides.essenceCap ?? 360,
      deck: (overrides.deckNumbers ?? deckCardNumbers()).map((cardNumber, index) =>
        makeMerchantTestDeckEntry({
          entryId: `deck-entry-${String(index + 1).padStart(2, "0")}`,
          cardNumber,
        }),
      ),
    }),
    questContent: makeMerchantTestContent({
      cards,
    }),
    site: makeMerchantTestSite(overrides.site),
    });
}

function insufficientCandidateContext(): MerchantContext {
  const onlyCard = card(UUIDS.deckHighEvent, 1, {
    cardType: "Event",
    energyCost: 5,
    spark: null,
    renderedText: "Fast.",
  });
  return buildMerchantContext({
    questState: makeMerchantTestQuestState({
      seed: "merchant-insufficient-candidates",
      essence: 180,
      essenceCap: 360,
      deck: [
        makeMerchantTestDeckEntry({
          entryId: "only-entry",
          cardNumber: onlyCard.cardNumber,
        }),
      ],
    }),
    questContent: makeMerchantTestContent({
      cards: [onlyCard],
    }),
    site: makeMerchantTestSite(),
  });
}

function targetForNeed(need: MerchantNeed): string {
  if (need.needType === "card") return `${need.entryId}:${need.cardUuid}`;
  if (need.needKind === "missing_role" || need.needKind === "curve_problem") {
    return `${need.themeId}:${need.role}`;
  }
  if (need.needKind === "dreamsign_gap") return need.dreamsignId;
  return "need:unknown";
}

function expectHonestBrokerInvariants(context: MerchantContext): void {
  const needs = readMerchantDeck(context);
  const needIds = new Set(needs.map((need) => need.needId));
  const encounter = generateMerchantEncounter(context);

  expect(encounter.offers).toHaveLength(2);
  expect(encounter.offers.map((offer) => offer.offerId)).toEqual(["A", "B"]);
  for (const offer of encounter.offers) {
    expect(needIds.has(offer.needId)).toBe(true);
    expect(offer.rewards.length).toBeGreaterThan(0);
    expect(offer.reward.answersNeedIds).toContain(offer.needId);
    expect(offer.price).toBeGreaterThanOrEqual(0);
    expect(offer.priceDetail.price).toBe(offer.price);
    expect(offer.reward.applyPayload !== undefined ||
      (offer.reward.choiceRequest?.candidates.length ?? 0) > 0).toBe(true);
  }
}

describe("generateMerchantEncounter", () => {
  it("generates exactly two normal-context offers with ids A and B", () => {
    const encounter = generateMerchantEncounter(contextFor());

    expect(encounter.offers).toHaveLength(2);
    expect(encounter.offers.map((offer) => offer.offerId)).toEqual(["A", "B"]);
  });

  it("makes both offers answer existing detected need ids", () => {
    const context = contextFor();
    const needIds = new Set(readMerchantDeck(context).map((need) => need.needId));
    const encounter = generateMerchantEncounter(context);

    expect(encounter.offers.every((offer) => needIds.has(offer.needId))).toBe(true);
  });

  it("prefers offers that are meaningfully distinct by builder, need, or target", () => {
    const context = contextFor();
    const needsById = new Map(readMerchantDeck(context).map((need) => [need.needId, need]));
    const [first, second] = generateMerchantEncounter(context).offers;
    if (first === undefined || second === undefined) {
      throw new Error("expected two offers");
    }
    const firstNeed = needsById.get(first.needId);
    const secondNeed = needsById.get(second.needId);
    if (firstNeed === undefined || secondNeed === undefined) {
      throw new Error("expected offers to reference detected needs");
    }

    expect(
      first.rewardBuilderId !== second.rewardBuilderId ||
        first.needId !== second.needId ||
        targetForNeed(firstNeed) !== targetForNeed(secondNeed),
    ).toBe(true);
  });

  it("produces stable signatures for unchanged context", () => {
    const context = contextFor({ seed: "stable-encounter-seed" });

    expect(generateMerchantEncounter(context).encounterSignature).toBe(
      generateMerchantEncounter(context).encounterSignature,
    );
  });

  it("changes signatures when deck, resource, or site inputs change", () => {
    const base = generateMerchantEncounter(contextFor()).encounterSignature;
    const deckChanged = generateMerchantEncounter(
      contextFor({ deckNumbers: [901, 2, 3, 4, 5, 6] }),
    ).encounterSignature;
    const resourceChanged = generateMerchantEncounter(
      contextFor({ essence: 179 }),
    ).encounterSignature;
    const siteChanged = generateMerchantEncounter(
      contextFor({ site: { id: "site-merchant-fixture-b", isEnhanced: true } }),
    ).encounterSignature;

    expect(deckChanged).not.toBe(base);
    expect(resourceChanged).not.toBe(base);
    expect(siteChanged).not.toBe(base);
  });

  it("does not change signatures when offered candidate names change", () => {
    const base = generateMerchantEncounter(contextFor()).encounterSignature;
    const candidateNamesChanged = generateMerchantEncounter(
      contextFor({
        cardOverridesByNumber: new Map(
          CANDIDATE_CARD_NUMBERS.map((cardNumber) => [
            cardNumber,
            { name: `Altered Candidate ${cardNumber}` },
          ]),
        ),
      }),
    ).encounterSignature;

    expect(candidateNamesChanged).toBe(base);
  });

  it("changes signatures when offered choice identity changes", () => {
    const base = generateMerchantEncounter(contextFor()).encounterSignature;
    const candidateIdentityChanged = generateMerchantEncounter(
      contextFor({
        cardOverridesByNumber: new Map(
          CANDIDATE_CARD_NUMBERS.map((cardNumber) => [
            cardNumber,
            {
              id: `80000000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`,
            },
          ]),
        ),
      }),
    ).encounterSignature;

    expect(candidateIdentityChanged).not.toBe(base);
  });

  it("fails clearly instead of returning a partial encounter when two offers cannot be built", () => {
    expect(() => generateMerchantEncounter(insufficientCandidateContext())).toThrow(
      "Dream Merchant encounter requires exactly two buildable offers; selected 1",
    );
  });

  it("satisfies honest-broker invariants across 25 deterministic seeds", () => {
    for (let index = 0; index < 25; index += 1) {
      expectHonestBrokerInvariants(
        contextFor({ seed: `merchant-encounter-seed-${index}` }),
      );
    }
  });

  it("keeps locked offers present when essence is low", () => {
    const encounter = generateMerchantEncounter(
      contextFor({ essence: 0, essenceCap: 360 }),
    );

    expect(encounter.offers).toHaveLength(2);
    expect(encounter.offers.every((offer) => offer.locked)).toBe(true);
    expect(encounter.offers.every((offer) =>
      offer.lockedReason === "insufficient_essence",
    )).toBe(true);
  });
});
