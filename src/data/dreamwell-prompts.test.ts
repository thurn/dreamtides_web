import { describe, expect, it } from "vitest";
import { testDreamwellCardName } from "../types/test-identities";
import { parseDreamwellCards, type DreamwellCard } from "./dreamwell-database";
import {
  dreamwellPromptRef,
  resolveDreamwellPromptRef,
  type DreamwellPromptDefinitions,
} from "./dreamwell-prompts";
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
  },
];

const PROMPTS: DreamwellPromptDefinitions = {
  [CARD_ID]: [
    {
      key: "choose-value",
      title: () => "Fixture title",
      subtitle: () => "Fixture subtitle",
      instructions: () => "Fixture instructions",
      choices: [
        {
          key: "confirm",
          label: () => "Fixture choice",
        },
      ],
      arguments: [{ name: "count", kind: "Count" }],
    },
  ],
};

describe("Dreamwell prompt references", () => {
  it("resolves semantic prompt parts through an injected catalog", () => {
    const arguments_ = { count: 2 };
    expect(
      resolveDreamwellPromptRef(
        dreamwellPromptRef(
          testDreamwellCardId(CARD_ID),
          testDreamwellPromptKey("choose-value"),
          "title",
          arguments_,
        ),
        CATALOG,
        PROMPTS,
      ),
    ).toEqual(expect.any(String));
    expect(
      resolveDreamwellPromptRef(
        dreamwellPromptRef(
          testDreamwellCardId(CARD_ID),
          testDreamwellPromptKey("choose-value"),
          "choice",
          arguments_,
          testDreamwellChoiceKey("confirm"),
        ),
        CATALOG,
        PROMPTS,
      ),
    ).toEqual(expect.any(String));
  });

  it("rejects missing prompts and invalid semantic argument types", () => {
    expect(() =>
      resolveDreamwellPromptRef(
        dreamwellPromptRef(
          testDreamwellCardId(CARD_ID),
          testDreamwellPromptKey("missing"),
        ),
        CATALOG,
        PROMPTS,
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
          },
        ),
        CATALOG,
        PROMPTS,
      ),
    ).toThrow(/Invalid Dreamwell prompt argument count/u);
  });

  it("keeps generated Dreamwell card data free of prompt definitions", () => {
    const [parsed] = parseDreamwellCards([{ ...CATALOG[0], automation: [] }]);
    expect(parsed).not.toHaveProperty("automation");
  });
});
