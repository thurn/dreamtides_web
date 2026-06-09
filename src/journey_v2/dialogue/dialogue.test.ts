import { describe, expect, it } from "vitest";
import { buildMerchantContext } from "../context/buildMerchantContext";
import { generateMerchantEncounter } from "../encounter/generateMerchantEncounter";
import { readMerchantDeck } from "../read/deckRead";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { CardData } from "../../types/cards";
import type { MerchantContext, MerchantNeed } from "../types";
import {
  ACCEPT_REACTION_TEMPLATES,
  DECLINE_REACTION_TEMPLATES,
  GREETING_TEMPLATES,
  OBSERVATION_TEMPLATES,
  OFFER_FRAMING_TEMPLATES,
  PRICE_FRAMING_TEMPLATES,
  renderMerchantDialogue,
} from "./dialogue";

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
  recursionA: "71000000-0000-4000-8000-000000000201",
  recursionB: "71000000-0000-4000-8000-000000000202",
  interactionA: "71000000-0000-4000-8000-000000000301",
  interactionB: "71000000-0000-4000-8000-000000000302",
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
    name: `Dialogue Fixture ${cardNumber}`,
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
      name: "Lantern Pact",
      cardType: "Event",
      energyCost: 5,
      spark: null,
      renderedText: "Fast.",
    }),
    card(UUIDS.deckHighCharacter, 2, {
      name: "Vault Listener",
      energyCost: 5,
      spark: 4,
    }),
    card(UUIDS.deckFillerA, 3, { energyCost: 4 }),
    card(UUIDS.deckFillerB, 4, { energyCost: 4 }),
    card(UUIDS.deckFillerC, 5, { energyCost: 3 }),
    card(UUIDS.deckFillerD, 6, { energyCost: 3 }),
    card(UUIDS.drawA, 101, { renderedText: "Draw a card." }),
    card(UUIDS.drawB, 102, { renderedText: "Draw two cards." }),
    card(UUIDS.drawC, 103, {
      rarity: "Legendary",
      renderedText: "When this enters, draw a card.",
    }),
    card(UUIDS.recursionA, 201, { renderedText: "Reclaim 1." }),
    card(UUIDS.recursionB, 202, {
      renderedText: "Return a card from your void to your hand.",
    }),
    card(UUIDS.interactionA, 301, { renderedText: "Banish an enemy." }),
    card(UUIDS.interactionB, 302, { renderedText: "Prevent the next damage." }),
    card(UUIDS.earlyA, 401, { energyCost: 1 }),
    card(UUIDS.earlyB, 402, { energyCost: 1 }),
    card(UUIDS.earlyC, 403, { energyCost: 0 }),
  ];
}

function contextFor(seed = "dialogue-seed"): MerchantContext {
  return buildMerchantContext({
    questState: makeMerchantTestQuestState({
      seed,
      essence: 180,
      essenceCap: 360,
      deck: [1, 2, 3, 4, 5, 6].map((cardNumber, index) =>
        makeMerchantTestDeckEntry({
          entryId: `dialogue-entry-${String(index + 1).padStart(2, "0")}`,
          cardNumber,
        }),
      ),
    }),
    questContent: makeMerchantTestContent({
      cards: fixtureCards(),
    }),
    site: makeMerchantTestSite({ id: "dialogue-site" }),
  });
}

function dialogueFor(context: MerchantContext) {
  const needs = readMerchantDeck(context);
  const encounter = generateMerchantEncounter(context);
  return {
    needs,
    encounter,
    dialogue: renderMerchantDialogue({
      context,
      needs,
      offers: encounter.offers,
    }),
  };
}

function needSlotCandidates(need: MerchantNeed): string[] {
  const candidates = [
    need.observation.summary,
    need.observation.subject,
    need.observation.roleLabel,
    need.observation.theme,
    need.label,
  ];
  if (need.needType === "card") {
    candidates.push(...need.references.map((reference) => reference.displayName));
  }
  if ("role" in need && need.role !== undefined) candidates.push(need.role);
  if ("themeId" in need) candidates.push(need.themeId);
  return candidates.filter(
    (candidate): candidate is string =>
      candidate !== undefined && candidate.length > 2,
  );
}

describe("Dream Merchant dialogue template banks", () => {
  it("meets the required template volume", () => {
    expect(GREETING_TEMPLATES.length).toBeGreaterThanOrEqual(20);
    expect(GREETING_TEMPLATES.length).toBeLessThanOrEqual(30);

    for (const bank of Object.values(OBSERVATION_TEMPLATES)) {
      expect(bank.length).toBeGreaterThanOrEqual(12);
      expect(bank.length).toBeLessThanOrEqual(20);
    }

    for (const bank of Object.values(OFFER_FRAMING_TEMPLATES)) {
      expect(bank.length).toBeGreaterThanOrEqual(8);
      expect(bank.length).toBeLessThanOrEqual(12);
    }

    expect(PRICE_FRAMING_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    expect(PRICE_FRAMING_TEMPLATES.length).toBeLessThanOrEqual(16);
    expect(ACCEPT_REACTION_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    expect(ACCEPT_REACTION_TEMPLATES.length).toBeLessThanOrEqual(16);
    expect(DECLINE_REACTION_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    expect(DECLINE_REACTION_TEMPLATES.length).toBeLessThanOrEqual(16);
  });
});

describe("renderMerchantDialogue", () => {
  it("includes the required beat kinds for a two-offer encounter", () => {
    const { dialogue, encounter } = dialogueFor(contextFor());

    expect(dialogue.map((beat) => beat.kind)).toContain("greeting");
    expect(dialogue.filter((beat) => beat.kind === "observation")).toHaveLength(2);
    expect(dialogue.filter((beat) => beat.kind === "offer_framing")).toHaveLength(2);
    expect(dialogue.filter((beat) => beat.kind === "price_framing")).toHaveLength(2);
    expect(dialogue.map((beat) => beat.kind)).toContain("walk_away");
    expect(dialogue.map((beat) => beat.kind)).toContain("accept_reaction");
    expect(dialogue.map((beat) => beat.kind)).toContain("decline_reaction");
    expect(dialogue.filter((beat) => beat.offerId === "A").length).toBeGreaterThan(0);
    expect(dialogue.filter((beat) => beat.offerId === "B").length).toBeGreaterThan(0);
    expect(encounter.offers).toHaveLength(2);
  });

  it("binds observation, offer, and price beats to structured references", () => {
    const { dialogue, encounter, needs } = dialogueFor(contextFor());
    const needsById = new Map(needs.map((need) => [need.needId, need]));

    for (const offer of encounter.offers) {
      const need = needsById.get(offer.needId);
      if (need === undefined) throw new Error(`missing need ${offer.needId}`);

      const observation = dialogue.find(
        (beat) => beat.kind === "observation" && beat.offerId === offer.offerId,
      );
      expect(observation?.needId).toBe(offer.needId);
      expect(
        needSlotCandidates(need).some((candidate) =>
          observation?.text.includes(candidate),
        ),
      ).toBe(true);

      const framing = dialogue.find(
        (beat) => beat.kind === "offer_framing" && beat.offerId === offer.offerId,
      );
      expect(framing?.rewardBuilderId).toBe(offer.rewardBuilderId);
      expect(framing?.text).toContain(offer.reward.title);

      const price = dialogue.find(
        (beat) => beat.kind === "price_framing" && beat.offerId === offer.offerId,
      );
      expect(price?.price).toBe(offer.price);
      expect(price?.text).toContain(String(offer.price));
    }
  });

  it("does not repeat template ids within one encounter", () => {
    const { dialogue } = dialogueFor(contextFor());
    const templateIds = dialogue.map((beat) => beat.templateId);

    expect(new Set(templateIds).size).toBe(templateIds.length);
  });

  it("is deterministic for identical inputs", () => {
    const context = contextFor("stable-dialogue-seed");

    expect(dialogueFor(context).dialogue).toEqual(dialogueFor(context).dialogue);
  });

  it("can select different templates for different seeds", () => {
    const baseTemplateIds = dialogueFor(contextFor("dialogue-seed-0")).dialogue.map(
      (beat) => beat.templateId,
    );
    const changed = Array.from({ length: 20 }, (_, index) =>
      dialogueFor(contextFor(`dialogue-seed-${index + 1}`)).dialogue.map(
        (beat) => beat.templateId,
      ),
    ).some((templateIds) =>
      templateIds.some((templateId, index) => templateId !== baseTemplateIds[index]),
    );

    expect(changed).toBe(true);
  });

  it("attaches dialogue to generated encounters", () => {
    const encounter = generateMerchantEncounter(contextFor());

    expect(encounter.dialogue.length).toBeGreaterThan(0);
    expect(encounter.dialogue[0]?.kind).toBe("greeting");
  });
});
