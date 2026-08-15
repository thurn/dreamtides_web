import { describe, expect, it } from "vitest";
import { testDreamwellCardName } from "../types/test-identities";
import { parseDreamwellCards, type DreamwellCard } from "./dreamwell-database";
import {
  dreamwellPromptRef,
  resolveDreamwellPromptRef,
} from "./dreamwell-prompts";
import { resolveSource } from "../runtime/localization/runtime";
import {
  testDreamwellCardId,
  testDreamwellChoiceKey,
  testDreamwellPromptKey,
} from "../types/test-identities";

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const CATALOG: readonly DreamwellCard[] = [
  {
    id: testDreamwellCardId(CARD_ID),
    name: testDreamwellCardName("Fixture"),
    renderedText: "Fixture rules.",
    order: 1,
    energyAdded: 0,
    cardNumber: 1,
    automation: [
      {
        key: testDreamwellPromptKey("choose-value"),
        title: "Choose {count}",
        subtitle: "Up to {maximum_cost}",
        instructions: "Choose {count} value.",
        choices: [
          {
            key: testDreamwellChoiceKey("confirm"),
            label: "Confirm {count}",
          },
        ],
        arguments: [
          { name: testDreamwellCardName("count"), kind: "Count" },
          { name: testDreamwellCardName("maximum_cost"), kind: "MaximumCost" },
        ],
      },
    ],
  },
];

describe("Dreamwell prompt references", () => {
  it("resolves semantic prompt parts through an injected catalog", () => {
    const arguments_ = { count: 2, maximum_cost: 3 };
    expect(
      resolveSource(
        resolveDreamwellPromptRef(
          dreamwellPromptRef(
            testDreamwellCardId(CARD_ID),
            testDreamwellPromptKey("choose-value"),
            "title",
            arguments_,
          ),
          CATALOG,
        ),
      ),
    ).toBe("Choose 2");
    expect(
      resolveSource(
        resolveDreamwellPromptRef(
          dreamwellPromptRef(
            testDreamwellCardId(CARD_ID),
            testDreamwellPromptKey("choose-value"),
            "choice",
            arguments_,
            testDreamwellChoiceKey("confirm"),
          ),
          CATALOG,
        ),
      ),
    ).toBe("Confirm 2");
  });

  it("rejects missing prompts and invalid semantic argument types", () => {
    expect(() =>
      resolveDreamwellPromptRef(
        dreamwellPromptRef(
          testDreamwellCardId(CARD_ID),
          testDreamwellPromptKey("missing"),
        ),
        CATALOG,
      ),
    ).toThrow(/Unknown Dreamwell prompt/u);
    expect(() =>
      resolveDreamwellPromptRef(
        dreamwellPromptRef(
          testDreamwellCardId(CARD_ID),
          testDreamwellPromptKey("choose-value"),
          "title",
          {
            count: "two",
            maximum_cost: 3,
          },
        ),
        CATALOG,
      ),
    ).toThrow(/Invalid Dreamwell prompt argument count/u);
  });

  it("fails closed on malformed generated prompt metadata", () => {
    const malformed = CATALOG.map((card) => ({
      ...card,
      automation: card.automation?.map((prompt) => ({
        ...prompt,
        arguments: [{ name: testDreamwellCardName("count"), kind: "Unknown" }],
      })),
    }));
    expect(() => parseDreamwellCards(malformed)).toThrow(/invalid argument/u);
  });
});
