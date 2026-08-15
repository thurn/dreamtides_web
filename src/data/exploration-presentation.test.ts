import { LocalizedString, tx } from "@trox/runtime";
import { describe, expect, it } from "vitest";
import type { ExplorationActionContent } from "./exploration";
import {
  derivedExplorationEffectArgumentNames,
  derivedExplorationEffectText,
  serializeExplorationPresentationMechanic,
} from "./exploration-presentation";

function action(
  fields: Partial<ExplorationActionContent>,
): ExplorationActionContent {
  return {
    id: "00000000-0000-4000-8000-000000000001" as ExplorationActionContent["id"],
    label: "Synthetic action",
    effectKind: "make-fast-all",
    ...fields,
  };
}

describe("code-owned Exploration presentation", () => {
  it("derives static mechanical copy without an authored override", () => {
    expect(derivedExplorationEffectText(action({}), {})).toBeInstanceOf(
      LocalizedString,
    );
  });

  it("declares and binds entity arguments for dynamic mechanical copy", () => {
    const dynamic = action({
      effectKind: "gain-card",
      cardId:
        "00000000-0000-4000-8000-000000000002" as ExplorationActionContent["cardId"],
    });
    expect(derivedExplorationEffectArgumentNames(dynamic)).toEqual([
      "fixed_card",
    ]);
    expect(
      derivedExplorationEffectText(dynamic, {
        fixed_card: tx(
          "Synthetic card",
          "[test] Synthetic entity used to verify derived Exploration presentation binding.",
        ),
      }),
    ).toBeInstanceOf(LocalizedString);
  });

  it("canonicalizes compatibility defaults before selecting presentation", () => {
    const implicit = action({
      effectKind: "replace-selected",
      predicate: "character",
    });
    expect(
      serializeExplorationPresentationMechanic({ ...implicit, count: 1 }),
    ).not.toBe(serializeExplorationPresentationMechanic(implicit));
    expect(
      derivedExplorationEffectText({ ...implicit, count: 1 }, {}),
    ).toBeInstanceOf(LocalizedString);
  });

  it("binds authored random essence ranges into derived presentation", () => {
    const presentation = derivedExplorationEffectText(
      action({
        effectKind: "gain-random-essence",
        minimumEssence: 25,
        maximumEssence: 75,
      }),
      {},
    );
    expect(presentation.arguments).toMatchObject({
      minimum_essence: { kind: "number", value: 25 },
      maximum_essence: { kind: "number", value: 75 },
    });
  });
});
