import { describe, it, expect, vi, afterEach } from "vitest";
import type { CardData } from "../types/cards";
import type { TransfigurationType } from "../types/quest";
import {
  isViridianEligible,
  isGoldenEligible,
  isScarletEligible,
  isAzureEligible,
  isBronzeEligible,
  eligibleTransfigurations,
  assignTransfiguration,
  describeTransfiguration,
  transfigurationEffectDetails,
  TRANSFIGURATION_COLORS,
} from "./transfiguration-logic";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: "Test Card",
    id: "test-card",
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
      "Viridian",
      "Golden",
      "Scarlet",
      "Azure",
      "Bronze",
    ];
    for (const t of types) {
      expect(TRANSFIGURATION_COLORS[t]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("isViridianEligible", () => {
  it("returns true for a card with positive energy cost", () => {
    expect(isViridianEligible(makeCard({ energyCost: 4 }))).toBe(true);
  });

  it("returns false for a zero-cost card", () => {
    expect(isViridianEligible(makeCard({ energyCost: 0 }))).toBe(false);
  });

  it("returns false for a null energy cost card", () => {
    expect(isViridianEligible(makeCard({ energyCost: null }))).toBe(false);
  });
});

describe("isGoldenEligible", () => {
  it("returns true if renderedText contains a digit", () => {
    expect(isGoldenEligible(makeCard({ renderedText: "Deal 3 damage." }))).toBe(
      true,
    );
  });

  it("returns false if renderedText has no digits", () => {
    expect(
      isGoldenEligible(makeCard({ renderedText: "Draw a card." })),
    ).toBe(false);
  });
});

describe("isScarletEligible", () => {
  it("returns true for Characters", () => {
    expect(isScarletEligible(makeCard({ cardType: "Character" }))).toBe(true);
  });

  it("returns false for Events", () => {
    expect(isScarletEligible(makeCard({ cardType: "Event" }))).toBe(false);
  });
});

describe("isAzureEligible", () => {
  it("returns true for Events", () => {
    expect(isAzureEligible(makeCard({ cardType: "Event" }))).toBe(true);
  });

  it("returns false for Characters", () => {
    expect(isAzureEligible(makeCard({ cardType: "Character" }))).toBe(false);
  });
});

describe("isBronzeEligible", () => {
  it("returns true for Events", () => {
    expect(isBronzeEligible(makeCard({ cardType: "Event" }))).toBe(true);
  });

  it("returns false for Characters", () => {
    expect(isBronzeEligible(makeCard({ cardType: "Character" }))).toBe(false);
  });
});

describe("eligibleTransfigurations", () => {
  it("returns Viridian, Golden, Scarlet for a Character with cost and number in text", () => {
    const card = makeCard({
      cardType: "Character",
      energyCost: 4,
      renderedText: "Deal 3 damage.",
    });
    const eligible = eligibleTransfigurations(card);
    expect(eligible).toContain("Viridian");
    expect(eligible).toContain("Golden");
    expect(eligible).toContain("Scarlet");
    expect(eligible).not.toContain("Azure");
    expect(eligible).not.toContain("Bronze");
  });

  it("returns Azure, Bronze, Golden for an Event with cost and number in text", () => {
    const card = makeCard({
      cardType: "Event",
      energyCost: 3,
      renderedText: "Deal 5 damage.",
    });
    const eligible = eligibleTransfigurations(card);
    expect(eligible).toContain("Viridian");
    expect(eligible).toContain("Golden");
    expect(eligible).toContain("Azure");
    expect(eligible).toContain("Bronze");
    expect(eligible).not.toContain("Scarlet");
  });

  it("returns empty array for a zero-cost Character with no numbers in text and no spark concern", () => {
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      renderedText: "Draw a card.",
    });
    // Scarlet is still eligible since it's a Character
    const eligible = eligibleTransfigurations(card);
    expect(eligible).toContain("Scarlet");
    expect(eligible).not.toContain("Viridian");
    expect(eligible).not.toContain("Golden");
  });
});

describe("assignTransfiguration", () => {
  it("returns null if existing transfiguration is not null", () => {
    const card = makeCard();
    const result = assignTransfiguration(card, "Viridian");
    expect(result).toBeNull();
  });

  it("returns a valid offer for an Event with 0 cost and no numbers", () => {
    // Events are always eligible for Azure and Bronze, which makes them
    // eligible for Prismatic too.
    const card = makeCard({
      cardType: "Event",
      energyCost: 0,
      renderedText: "",
    });
    const result = assignTransfiguration(card, null);
    expect(result).not.toBeNull();
    expect(["Azure", "Bronze", "Prismatic"]).toContain(result!.type);
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

  it("returns a Viridian offer that halves energy cost", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // first eligible = Viridian
    const card = makeCard({ energyCost: 6 });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Viridian");
    expect(offer!.previewCard.energyCost).toBe(3);
    expect(offer!.description).toContain("6");
    expect(offer!.description).toContain("3");
  });

  it("returns a Scarlet offer that doubles spark", () => {
    // For a Character with no cost and no numbers, only Scarlet is eligible
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      renderedText: "",
      spark: 3,
    });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Scarlet");
    expect(offer!.previewCard.spark).toBe(6);
    expect(offer!.description).toContain("3");
    expect(offer!.description).toContain("6");
  });

  it("Scarlet sets spark to 1 when spark is 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      renderedText: "",
      spark: 0,
    });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Scarlet");
    expect(offer!.previewCard.spark).toBe(1);
  });

  it("returns an Azure offer that appends Draw a card", () => {
    // Event with 0 cost and no numbers: Azure and Bronze eligible
    vi.spyOn(Math, "random").mockReturnValue(0); // first = Azure
    const card = makeCard({
      cardType: "Event",
      energyCost: 0,
      renderedText: "Foresee.",
    });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Azure");
    expect(offer!.previewCard.renderedText).toContain("Draw a card.");
  });

  it("returns a Bronze offer that appends Reclaim", () => {
    // Event with 0 cost and no numbers: eligible = [Azure, Bronze, Prismatic];
    // 0.5 * 3 = 1.5 -> floor 1 -> Bronze.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const card = makeCard({
      cardType: "Event",
      energyCost: 0,
      renderedText: "Foresee.",
    });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Bronze");
    expect(offer!.previewCard.renderedText).toContain("Reclaim.");
  });

  it("returns a Golden offer that modifies a number in text", () => {
    // A card where Golden is the eligible type we'll hit
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.3) // picks Golden (index 1 of eligible)
      .mockReturnValueOnce(0.8); // Golden delta: >= 0.5 means +1
    const card = makeCard({
      cardType: "Character",
      energyCost: 0,
      renderedText: "Deal 5 damage.",
    });
    // Eligible: Golden, Scarlet. random=0.3 => floor(0.3*2) = 0 => Golden
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Golden");
    expect(offer!.previewCard.renderedText).toMatch(/Deal [46] damage\./);
  });

  it("Viridian rounds energy cost correctly for odd numbers", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard({ energyCost: 5 });
    const offer = assignTransfiguration(card, null);
    expect(offer).not.toBeNull();
    expect(offer!.type).toBe("Viridian");
    // Math.round(5/2) = Math.round(2.5) = 3
    expect(offer!.previewCard.energyCost).toBe(3);
  });
});

describe("describeTransfiguration", () => {
  it("returns a description string for Viridian", () => {
    const card = makeCard({ energyCost: 6 });
    const desc = describeTransfiguration(card, "Viridian");
    expect(desc).toContain("6");
    expect(desc).toContain("3");
  });

  it("returns a description string for Scarlet", () => {
    const card = makeCard({ cardType: "Character", spark: 3 });
    const desc = describeTransfiguration(card, "Scarlet");
    expect(desc).toContain("3");
    expect(desc).toContain("6");
  });

  it("returns a description string for Azure", () => {
    const card = makeCard({ cardType: "Event", renderedText: "Foresee." });
    const desc = describeTransfiguration(card, "Azure");
    expect(desc).toContain("Draw a card.");
  });
});

describe("transfigurationEffectDetails", () => {
  it("returns energy cost change for Viridian", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const card = makeCard({ energyCost: 6 });
    const offer = assignTransfiguration(card, null)!;
    const details = transfigurationEffectDetails(offer, card);
    expect(details.energyCost).toEqual({ from: 6, to: 3 });
  });

  it("returns spark change for Scarlet", () => {
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

  it("returns renderedText change for Azure", () => {
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
