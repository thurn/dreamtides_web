import { describe, expect, it } from "vitest";
import { parseDreamwellCards, type DreamwellCard } from "./dreamwell-database";
import {
  dreamwellPromptRef,
  resolveDreamwellPromptRef,
} from "./dreamwell-prompts";
import { resolveSource } from "../runtime/localization/runtime";

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const CATALOG: readonly DreamwellCard[] = [
  {
    id: CARD_ID,
    name: "Fixture",
    renderedText: "Fixture rules.",
    order: 1,
    energyAdded: 0,
    cardNumber: 1,
    automation: [
      {
        key: "choose-value",
        title: "Choose {count}",
        subtitle: "Up to {maximum_cost}",
        instructions: "Choose {count} value.",
        choices: [{ key: "confirm", label: "Confirm {count}" }],
        arguments: [
          { name: "count", kind: "Count" },
          { name: "maximum_cost", kind: "MaximumCost" },
        ],
      },
    ],
  },
];

describe("Dreamwell prompt references", () => {
  it("resolves semantic prompt parts through an injected catalog", () => {
    const arguments_ = { count: 2, maximum_cost: 3 };
    expect(
      resolveSource(resolveDreamwellPromptRef(
        dreamwellPromptRef(CARD_ID, "choose-value", "title", arguments_),
        CATALOG,
      )),
    ).toBe("Choose 2");
    expect(
      resolveSource(resolveDreamwellPromptRef(
        dreamwellPromptRef(
          CARD_ID,
          "choose-value",
          "choice",
          arguments_,
          "confirm",
        ),
        CATALOG,
      )),
    ).toBe("Confirm 2");
  });

  it("rejects missing prompts and invalid semantic argument types", () => {
    expect(() =>
      resolveDreamwellPromptRef(
        dreamwellPromptRef(CARD_ID, "missing"),
        CATALOG,
      ),
    ).toThrow(/Unknown Dreamwell prompt/u);
    expect(() =>
      resolveDreamwellPromptRef(
        dreamwellPromptRef(CARD_ID, "choose-value", "title", {
          count: "two",
          maximum_cost: 3,
        }),
        CATALOG,
      ),
    ).toThrow(/Invalid Dreamwell prompt argument count/u);
  });

  it("fails closed on malformed generated prompt metadata", () => {
    const malformed = CATALOG.map((card) => ({
      ...card,
      automation: card.automation?.map((prompt) => ({
        ...prompt,
        arguments: [{ name: "count", kind: "Unknown" }],
      })),
    }));
    expect(() => parseDreamwellCards(malformed)).toThrow(/invalid argument/u);
  });
});
