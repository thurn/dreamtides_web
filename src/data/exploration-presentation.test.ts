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
    expect(derivedExplorationEffectText(action({}), {})).toEqual(expect.any(String));
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
        fixed_card: "Synthetic card",
      }),
    ).toEqual(expect.any(String));
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
    ).toEqual(expect.any(String));
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
    expect(presentation).toContain("25");
    expect(presentation).toContain("75");
  });
});
