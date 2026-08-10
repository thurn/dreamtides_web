import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import { transfigurationFixture } from "../testing/transfiguration-fixture";
import {
  applyTransfigurationToCard,
  assignTransfiguration,
  buildTransfigurationDisplay,
  eligibleTransfigurations,
  offeredTransfigurationForms,
  transfigurationEffectDetails,
  TRANSFIGURE_MARK_END,
  TRANSFIGURE_MARK_START,
} from "./transfiguration-logic";

const data = transfigurationFixture();

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: asCardName("Fixture card"),
    id: asCardId("00000000-0000-4000-8000-000000000101"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 4,
    spark: 2,
    isFast: false,
    renderedText: "Deal 3 damage.",
    imageNumber: 1,
    artOwned: false,
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Transfiguration eligibility", () => {
  it("evaluates every closed form mechanic selected by stable form ID", () => {
    const character = makeCard({
      amplifiedText: "Deal 5 damage.",
      renderedText: "▸Dawn: Deal 3 damage. 2●: Gain 1 spark.",
    });
    const event = makeCard({ cardType: "Event", spark: null });

    expect(eligibleTransfigurations(data, character)).toEqual([
      "Empowered",
      "Amplified",
      "Kindled",
      "Resonant",
      "Attuned",
      "Perfected",
    ]);
    expect(eligibleTransfigurations(data, event)).toEqual([
      "Empowered",
      "Inspired",
      "Enduring",
      "Hastened",
      "Perfected",
    ]);
  });

  it("derives eligible order solely from the injected catalog", () => {
    const reversed = {
      ...data,
      forms: [...data.forms].reverse(),
    };
    const card = makeCard({ amplifiedText: "Deal 5 damage." });
    expect(eligibleTransfigurations(reversed, card)).toEqual(
      [...eligibleTransfigurations(data, card)].reverse(),
    );
  });
});

describe("Transfiguration mechanics", () => {
  it("interprets stat, authored-text, clause, fast, trigger, and ability operations", () => {
    expect(
      applyTransfigurationToCard(data, makeCard({ energyCost: 5 }), "Empowered")
        .energyCost,
    ).toBe(2);
    expect(
      applyTransfigurationToCard(data, makeCard({ spark: 0 }), "Kindled").spark,
    ).toBe(1);
    expect(
      applyTransfigurationToCard(
        data,
        makeCard({ amplifiedText: "Replacement" }),
        "Amplified",
      ).renderedText,
    ).toBe("Replacement");
    expect(
      applyTransfigurationToCard(
        data,
        makeCard({ cardType: "Event" }),
        "Inspired",
      ).renderedText,
    ).toMatch(/Draw a card\.$/);
    expect(
      applyTransfigurationToCard(
        data,
        makeCard({ cardType: "Event" }),
        "Enduring",
      ).renderedText,
    ).toMatch(/Reclaim\.$/);
    expect(
      applyTransfigurationToCard(
        data,
        makeCard({ cardType: "Event" }),
        "Hastened",
      ).isFast,
    ).toBe(true);
    expect(
      applyTransfigurationToCard(
        data,
        makeCard({ renderedText: "▸Dawn: Act." }),
        "Resonant",
      ).renderedText,
    ).toContain("Materialized");
    expect(
      applyTransfigurationToCard(
        data,
        makeCard({ renderedText: "2●: Act." }),
        "Attuned",
      ).renderedText,
    ).toContain("1●");
  });

  it("applies only eligible configured forms for Perfected", () => {
    const card = makeCard({
      cardType: "Event",
      energyCost: 4,
      renderedText: "2●: Act.",
    });
    const result = applyTransfigurationToCard(data, card, "Perfected");
    expect(result.energyCost).toBe(2);
    expect(result.isFast).toBe(true);
    expect(result.renderedText).toContain("1●");
    expect(result.spark).toBe(card.spark);
  });

  it("honors a configured form subset when applying Perfected", () => {
    const subset = {
      ...data,
      forms: data.forms.filter(({ id }) =>
        ["Empowered", "Inspired", "Perfected"].includes(id),
      ),
    };
    const card = makeCard({ cardType: "Event", energyCost: 4 });
    const result = applyTransfigurationToCard(subset, card, "Perfected");
    expect(result.energyCost).toBe(2);
    expect(result.renderedText).toMatch(/Draw a card\.$/u);
    expect(result.renderedText).not.toMatch(/Reclaim/u);
    expect(result.isFast).toBe(false);
  });

  it("uses catalog order when composing Perfected text changes", () => {
    const card = makeCard({
      cardType: "Event",
      amplifiedText: "Authored replacement.",
    });
    const forms = (["Inspired", "Amplified", "Perfected"] as const).map(
      (id) => {
        const form = data.forms.find((candidate) => candidate.id === id);
        if (form === undefined) throw new Error(`Missing fixture form ${id}`);
        return form;
      },
    );
    const inspiredFirst = applyTransfigurationToCard(
      { ...data, forms },
      card,
      "Perfected",
    );
    const amplifiedFirst = applyTransfigurationToCard(
      { ...data, forms: [forms[1], forms[0], forms[2]] },
      card,
      "Perfected",
    );
    expect(inspiredFirst.renderedText).toBe("Authored replacement.");
    expect(amplifiedFirst.renderedText).toBe(
      "Authored replacement. Draw a card.",
    );
  });

  it("keeps mechanical and marked display results equivalent", () => {
    const card = makeCard({ cardType: "Event", renderedText: "2●: Act." });
    const built = buildTransfigurationDisplay(data, card, "Perfected");
    expect(built.card).toEqual(
      applyTransfigurationToCard(data, card, "Perfected"),
    );
    expect(built.display.form).toBe(data.forms[8]);
    expect(built.display.energyChangeName).toBe(data.forms[0]?.name);
    expect(built.display.sparkChangeName).toBeNull();
    expect(built.display.markedText).toContain(TRANSFIGURE_MARK_START);
    expect(built.display.markedText).toContain(TRANSFIGURE_MARK_END);
  });
});

describe("Transfiguration offers", () => {
  it("returns catalog-backed non-composite offers and semantic details", () => {
    const card = makeCard({ amplifiedText: "Deal 5 damage." });
    const offers = offeredTransfigurationForms(data, card, null);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((offer) => offer.form.id === offer.type)).toBe(true);
    expect(offers.some((offer) => offer.type === "Perfected")).toBe(false);
    expect(transfigurationEffectDetails(offers[0], card).cardId).toBe(card.id);
    expect(offeredTransfigurationForms(data, card, "Kindled")).toEqual([]);
  });

  it("assigns deterministically under a controlled random sample", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard();
    expect(assignTransfiguration(data, card, null)?.type).toBe(
      eligibleTransfigurations(data, card)[0],
    );
    expect(assignTransfiguration(data, card, "Kindled")).toBeNull();
  });
});
