import { describe, it, expect, vi, afterEach } from "vitest";
import type { CardData } from "../types/cards";
import type { TransfigurationType } from "../types/quest";
import { asCardId, asCardName } from "../types/card-identity";
import {
  isEmpoweredEligible,
  isAmplifiedEligible,
  isKindledEligible,
  isInspiredEligible,
  isEnduringEligible,
  isHastenedEligible,
  isResonantEligible,
  isAttunedEligible,
  eligibleTransfigurations,
  applyTransfigurationToCard,
  assignTransfiguration,
  buildTransfigurationDisplay,
  describeTransfiguration,
  transfigurationEffectDetails,
  TRANSFIGURATION_COLORS,
  TRANSFIGURATION_TINT_COLORS,
  TRANSFIGURE_MARK_END,
  TRANSFIGURE_MARK_START,
} from "./transfiguration-logic";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: asCardName("Test Card"),
    id: asCardId("test-card"),
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TRANSFIGURATION_COLORS", () => {
  it("maps all five types to hex color strings", () => {
    const types: TransfigurationType[] = [
      "Empowered",
      "Amplified",
      "Kindled",
      "Inspired",
      "Enduring",
    ];
    for (const t of types) {
      expect(TRANSFIGURATION_COLORS[t]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("isEmpoweredEligible", () => {
  it("returns true for a card with positive energy cost", () => {
    expect(isEmpoweredEligible(makeCard({ energyCost: 4 }))).toBe(true);
  });

  it("returns false for a zero-cost card", () => {
    expect(isEmpoweredEligible(makeCard({ energyCost: 0 }))).toBe(false);
  });

  it("returns false for a null energy cost card", () => {
    expect(isEmpoweredEligible(makeCard({ energyCost: null }))).toBe(false);
  });
});

describe("isAmplifiedEligible", () => {
  it("returns true if renderedText contains a digit", () => {
    expect(isAmplifiedEligible(makeCard({ renderedText: "Deal 3 damage." }))).toBe(
      true,
    );
  });

  it("returns false if renderedText has no digits", () => {
    expect(
      isAmplifiedEligible(makeCard({ renderedText: "Draw a card." })),
    ).toBe(false);
  });
});

describe("isKindledEligible", () => {
  it("returns true for Characters", () => {
    expect(isKindledEligible(makeCard({ cardType: "Character" }))).toBe(true);
  });

  it("returns false for Events", () => {
    expect(isKindledEligible(makeCard({ cardType: "Event" }))).toBe(false);
  });
});

describe("isInspiredEligible", () => {
  it("returns true for Events", () => {
    expect(isInspiredEligible(makeCard({ cardType: "Event" }))).toBe(true);
  });

  it("returns false for Characters", () => {
    expect(isInspiredEligible(makeCard({ cardType: "Character" }))).toBe(false);
  });
});

describe("isEnduringEligible", () => {
  it("returns true for Events", () => {
    expect(isEnduringEligible(makeCard({ cardType: "Event" }))).toBe(true);
  });

  it("returns false for Characters", () => {
    expect(isEnduringEligible(makeCard({ cardType: "Character" }))).toBe(false);
  });
});

describe("eligibleTransfigurations", () => {
  it("returns Empowered, Amplified, Kindled for a Character with cost and number in text", () => {
    const card = makeCard({
      cardType: "Character",
      energyCost: 4,
      renderedText: "Deal 3 damage.",
    });
    const eligible = eligibleTransfigurations(card);
    expect(eligible).toContain("Empowered");
    expect(eligible).toContain("Amplified");
    expect(eligible).toContain("Kindled");
    expect(eligible).not.toContain("Inspired");
    expect(eligible).not.toContain("Enduring");
  });

  it("returns Inspired, Enduring, Amplified for an Event with cost and number in text", () => {
    const card = makeCard({
      cardType: "Event",
      energyCost: 3,
      renderedText: "Deal 5 damage.",
    });
    const eligible = eligibleTransfigurations(card);
    expect(eligible).toContain("Empowered");
    expect(eligible).toContain("Amplified");
    expect(eligible).toContain("Inspired");
    expect(eligible).toContain("Enduring");
    expect(eligible).not.toContain("Kindled");
  });

  it("returns empty array for a zero-cost Character with no numbers in text and no spark concern", () => {
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      renderedText: "Draw a card.",
    });
    // Kindled is still eligible since it's a Character
    const eligible = eligibleTransfigurations(card);
    expect(eligible).toContain("Kindled");
    expect(eligible).not.toContain("Empowered");
    expect(eligible).not.toContain("Amplified");
  });
});

describe("Hastened", () => {
  it("is eligible only for an Event that is not already fast", () => {
    expect(
      isHastenedEligible(makeCard({ cardType: "Event", isFast: false })),
    ).toBe(true);
    expect(
      isHastenedEligible(makeCard({ cardType: "Event", isFast: true })),
    ).toBe(false);
    expect(
      isHastenedEligible(makeCard({ cardType: "Character", isFast: false })),
    ).toBe(false);
  });

  it("grants Fast and the display matches applyTransfigurationToCard", () => {
    const card = makeCard({
      cardType: "Event",
      energyCost: 2,
      isFast: false,
      renderedText: "Deal damage.",
    });
    const applied = applyTransfigurationToCard(card, "Hastened");
    expect(applied.isFast).toBe(true);
    const built = buildTransfigurationDisplay(card, "Hastened");
    expect(built.card).toEqual(applied);
    expect(built.display.fastChanged).toBe(true);
    expect(built.display.energyChanged).toBe(false);
  });
});

describe("assignTransfiguration", () => {
  it("returns null if existing transfiguration is not null", () => {
    const card = makeCard();
    const result = assignTransfiguration(card, "Empowered");
    expect(result).toBeNull();
  });

  it("returns a valid offer for an Event with 0 cost and no numbers", () => {
    const card = makeCard({
      cardType: "Event",
      energyCost: 0,
      renderedText: "",
    });
    const result = assignTransfiguration(card, null);
    expect(result).not.toBeNull();
    // The offer is always one of the card's eligible transfigurations.
    expect(eligibleTransfigurations(card)).toContain(result!.type);
  });

  it("returns a valid offer with type, description, and previewCard", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // pick first eligible
    const card = makeCard({ energyCost: 6 });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBeDefined();
    expect(offer!.description).toBeDefined();
    expect(typeof offer!.description).toBe("string");
    expect(offer!.previewCard).toBeDefined();
  });

  it("returns a Empowered offer that halves energy cost", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // first eligible = Empowered
    const card = makeCard({ energyCost: 6 });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Empowered");
    expect(offer!.previewCard.energyCost).toBe(3);
    expect(offer!.description).toContain("6");
    expect(offer!.description).toContain("3");
  });

  it("returns a Kindled offer that doubles spark", () => {
    // For a Character with no cost and no numbers, only Kindled is eligible
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      renderedText: "",
      spark: 3,
    });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Kindled");
    expect(offer!.previewCard.spark).toBe(6);
    expect(offer!.description).toContain("3");
    expect(offer!.description).toContain("6");
  });

  it("Kindled sets spark to 1 when spark is 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      renderedText: "",
      spark: 0,
    });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Kindled");
    expect(offer!.previewCard.spark).toBe(1);
  });

  it("returns an Inspired offer that appends Draw a card", () => {
    // Event with 0 cost and no numbers: Inspired and Enduring eligible
    vi.spyOn(Math, "random").mockReturnValue(0); // first = Inspired
    const card = makeCard({
      cardType: "Event",
      energyCost: 0,
      renderedText: "Foresee.",
    });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Inspired");
    expect(offer!.previewCard.renderedText).toContain("Draw a card.");
  });

  it("returns a Enduring offer that appends Reclaim", () => {
    // A fast Event with 0 cost and no numbers (Hastened ineligible since already
    // fast): eligible = [Inspired, Enduring, Perfected]; 0.5 * 3 = 1.5 ->
    // floor 1 -> Enduring.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const card = makeCard({
      cardType: "Event",
      energyCost: 0,
      isFast: true,
      renderedText: "Foresee.",
    });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Enduring");
    expect(offer!.previewCard.renderedText).toContain("Reclaim.");
  });

  it("returns a Amplified offer that modifies a number in text", () => {
    // A card where Amplified is the eligible type we'll hit
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.3) // picks Amplified (index 1 of eligible)
      .mockReturnValueOnce(0.8); // Amplified delta: >= 0.5 means +1
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      renderedText: "Deal 5 damage.",
    });
    // Eligible: Amplified, Kindled. random=0.3 => floor(0.3*2) = 0 => Amplified
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Amplified");
    expect(offer!.previewCard.renderedText).toMatch(/Deal [46] damage\./);
  });

  it("Empowered halves the energy cost rounding down for odd numbers", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard({ energyCost: 5 });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Empowered");
    // Math.floor(5 / 2) = 2
    expect(offer!.previewCard.energyCost).toBe(2);
  });

  it("Empowered makes a 1-energy card free", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard({ energyCost: 1 });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Empowered");
    // Math.floor(1 / 2) = 0
    expect(offer!.previewCard.energyCost).toBe(0);
  });
});

describe("describeTransfiguration", () => {
  it("returns a description string for Empowered", () => {
    const card = makeCard({ energyCost: 6 });
    const desc = describeTransfiguration(card, "Empowered");
    expect(desc).toContain("6");
    expect(desc).toContain("3");
  });

  it("returns a description string for Kindled", () => {
    const card = makeCard({ cardType: "Character", spark: 3 });
    const desc = describeTransfiguration(card, "Kindled");
    expect(desc).toContain("3");
    expect(desc).toContain("6");
  });

  it("returns a description string for Inspired", () => {
    const card = makeCard({ cardType: "Event", renderedText: "Foresee." });
    const desc = describeTransfiguration(card, "Inspired");
    expect(desc).toContain("Draw a card.");
  });
});

describe("transfigurationEffectDetails", () => {
  it("returns energy cost change for Empowered", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard({ energyCost: 6 });
    const offer = assignTransfiguration(card, null)!;
    const details = transfigurationEffectDetails(offer, card);
    expect(details.energyCost).toEqual({ from: 6, to: 3 });
  });

  it("returns spark change for Kindled", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      renderedText: "",
      spark: 2,
    });
    const offer = assignTransfiguration(card, null)!;
    const details = transfigurationEffectDetails(offer, card);
    expect(details.spark).toEqual({ from: 2, to: 4 });
  });

  it("returns renderedText change for Inspired", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard({
      cardType: "Event",
      energyCost: 0,
      renderedText: "Foresee.",
    });
    const offer = assignTransfiguration(card, null)!;
    const details = transfigurationEffectDetails(offer, card);
    expect(details.renderedText).toBeDefined();
    expect(
      (details.renderedText as { to: string }).to,
    ).toContain("Draw a card.");
  });
});

describe("TRANSFIGURATION_TINT_COLORS", () => {
  it("maps every transfiguration type to a hex color", () => {
    const types: TransfigurationType[] = [
      "Empowered",
      "Amplified",
      "Kindled",
      "Inspired",
      "Enduring",
      "Resonant",
      "Attuned",
      "Perfected",
    ];
    for (const type of types) {
      expect(TRANSFIGURATION_TINT_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("buildTransfigurationDisplay", () => {
  function stripMarkers(text: string): string {
    return text
      .split(TRANSFIGURE_MARK_START)
      .join("")
      .split(TRANSFIGURE_MARK_END)
      .join("");
  }

  it("produces a card identical to applyTransfigurationToCard", () => {
    // A card eligible for several transfigurations so Perfected also chains.
    const card = makeCard({
      cardType: "Character",
      energyCost: 4,
      spark: 2,
      renderedText: "▸Materialized: Deal 3 damage. Once per turn, draw.",
    });
    const types = eligibleTransfigurations(card);
    expect(types.length).toBeGreaterThan(1);
    for (const type of types) {
      const built = buildTransfigurationDisplay(card, type);
      expect(built.card).toEqual(applyTransfigurationToCard(card, type));
    }
  });

  it("keeps the marked text equal to the transfigured text once markers are stripped", () => {
    const card = makeCard({
      cardType: "Event",
      energyCost: 2,
      spark: null,
      renderedText: "Foresee.",
    });
    const built = buildTransfigurationDisplay(card, "Inspired");
    expect(stripMarkers(built.display.markedText)).toBe(
      built.card.renderedText,
    );
  });

  it("wraps an appended Inspired clause in transfigure markers", () => {
    const card = makeCard({
      cardType: "Event",
      energyCost: 2,
      spark: null,
      renderedText: "Foresee.",
    });
    const built = buildTransfigurationDisplay(card, "Inspired");
    expect(built.display.markedText).toContain(
      `${TRANSFIGURE_MARK_START}Draw a card.${TRANSFIGURE_MARK_END}`,
    );
    // The printed text stays outside the markers.
    expect(built.display.markedText.startsWith("Foresee.")).toBe(true);
  });

  it("flags spark changes for Kindled and marks no text", () => {
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      spark: 3,
      renderedText: "A wall of thorns.",
    });
    const built = buildTransfigurationDisplay(card, "Kindled");
    expect(built.display.sparkChanged).toBe(true);
    expect(built.display.energyChanged).toBe(false);
    expect(built.card.spark).toBe(6);
    expect(built.display.markedText).toBe(card.renderedText);
  });

  it("flags energy changes for Empowered", () => {
    const card = makeCard({
      cardType: "Event",
      energyCost: 4,
      spark: null,
      renderedText: "Deal damage.",
    });
    const built = buildTransfigurationDisplay(card, "Empowered");
    expect(built.display.energyChanged).toBe(true);
    expect(built.card.energyCost).toBe(2);
  });

  it("wraps only the bumped Amplified number, leaving a leading resource glyph untinted", () => {
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      spark: 1,
      renderedText: "Gain ✦2 this turn.",
    });
    const built = buildTransfigurationDisplay(card, "Amplified");
    expect(built.card.renderedText).toContain("✦3");
    // The number is wrapped; the ✦ glyph stays outside the markers.
    expect(built.display.markedText).toContain(
      `✦${TRANSFIGURE_MARK_START}3${TRANSFIGURE_MARK_END}`,
    );
  });

  it("widens a Resonant Dawn trigger to also fire on materialize, tinting the added keyword", () => {
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      spark: 1,
      renderedText: "▸Dawn: Gain 1●.",
    });
    expect(isResonantEligible(card)).toBe(true);
    const built = buildTransfigurationDisplay(card, "Resonant");
    expect(built.card.renderedText).toBe("▸Materialized, Dawn: Gain 1●.");
    expect(built.display.markedText).toContain(
      `▸${TRANSFIGURE_MARK_START}Materialized, ${TRANSFIGURE_MARK_END}Dawn`,
    );
  });

  it("widens a Resonant Materialized trigger to also fire on dissolve", () => {
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      spark: 1,
      renderedText: "▸Materialized: Draw a card.",
    });
    const built = buildTransfigurationDisplay(card, "Resonant");
    expect(built.card.renderedText).toBe(
      "▸Materialized, Dissolved: Draw a card.",
    );
    expect(built.display.markedText).toContain(
      `Materialized${TRANSFIGURE_MARK_START}, Dissolved${TRANSFIGURE_MARK_END}:`,
    );
  });

  it("reduces a Attuned activated-ability cost by 1, tinting only the number", () => {
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      spark: 1,
      renderedText: "2●, Abandon 2 warriors: Draw a card.",
    });
    expect(isAttunedEligible(card)).toBe(true);
    const built = buildTransfigurationDisplay(card, "Attuned");
    expect(built.card.renderedText).toBe(
      "1●, Abandon 2 warriors: Draw a card.",
    );
    // Only the number is wrapped; the ● glyph stays outside the markers.
    expect(built.display.markedText).toContain(
      `${TRANSFIGURE_MARK_START}1${TRANSFIGURE_MARK_END}●`,
    );
  });

  it("does not treat an energy amount inside an effect as a Attuned cost", () => {
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      spark: 1,
      renderedText: "Abandon this character: Gain 1●.",
    });
    expect(isAttunedEligible(card)).toBe(false);
  });
});
