/**
 * Contracts of the Expert AST features: each classified effect yields its
 * feature, amount, player and qualifiers; unclassified effects are listed,
 * never counted; amplified text is reported only when it changes them.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { chooseOne } from "../effects/primitives/choose-one";
import { dissolve } from "../effects/primitives/dissolve";
import { draw } from "../effects/primitives/draw";
import { eachPlayer } from "../effects/primitives/each-player";
import { delayed } from "../effects/primitives/floating-trigger";
import { foresee } from "../effects/primitives/foresee";
import { gainEnergy } from "../effects/primitives/gain-energy";
import { gainPoints } from "../effects/primitives/gain-points";
import { ifThen } from "../effects/primitives/if-then";
import { optional } from "../effects/primitives/optional";
import { sequence } from "../effects/primitives/sequence";
import type { ResolvingEffect } from "../effects/registry";
import { syntheticId } from "../testing/synthetic-cards";
import { abilityFeatures, cardFeatures, type FeatureContribution } from "./ai-features";
import { all, anyCharacter, characterYouControl, enemyCharacter, energy, event, target, turnOf, x } from "./builders";
import { triggered, whenDraw } from "./triggers";
import type { Ability } from "./types";

function card(abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return { id: syntheticId(0x7a01), cardType: "event", costs: [energy(1)], spark: null, subtype: "", speed: "standard", status: "authored", abilities };
}

function contributions(ability: Ability): readonly FeatureContribution[] {
  return abilityFeatures(ability, 0)?.contributions ?? [];
}

function only(effect: ResolvingEffect): FeatureContribution {
  const found = contributions(event(effect));
  expect(found).toHaveLength(1);
  return found[0];
}

describe("AST features", () => {
  it("reads an immediate exact contribution with its player", () => {
    expect(only(draw(2))).toMatchObject({ feature: "draw", amount: { kind: "exact", value: 2 }, player: "you", qualifiers: [] });
    expect(only(gainEnergy(3, "opponent"))).toMatchObject({ feature: "energy", amount: { kind: "exact", value: 3 }, player: "opponent", qualifiers: [] });
    expect(only(gainPoints(4))).toMatchObject({ feature: "points", amount: { kind: "exact", value: 4 }, player: "you" });
  });

  it("tells removal of an enemy from removal of its own character and counts a sweep per match", () => {
    expect(only(dissolve(target(enemyCharacter())))).toMatchObject({ feature: "removal", amount: { kind: "exact", value: 1 }, player: "opponent" });
    expect(only(dissolve(target(characterYouControl())))).toMatchObject({ feature: "removal", player: "you" });
    expect(only(dissolve(all(anyCharacter())))).toMatchObject({ feature: "removal", amount: { kind: "perMatch" }, player: "any" });
  });

  it("qualifies optional, conditional, modal and dynamic contributions", () => {
    expect(only(optional(draw(1))).qualifiers).toEqual(["optional"]);
    expect(only(ifThen(turnOf("you"), draw(1))).qualifiers).toEqual(["conditional"]);
    expect(only(optional(ifThen(turnOf("you"), draw(1)))).qualifiers).toEqual(["optional", "conditional"]);
    const modes = contributions(event(chooseOne(draw(1), gainPoints(2))));
    expect(modes.map((found) => [found.feature, found.qualifiers])).toEqual([["draw", ["modal"]], ["points", ["modal"]]]);
    expect(only(draw(x()))).toMatchObject({ amount: { kind: "dynamic", expr: x(), sign: 1 }, qualifiers: ["dynamic"] });
  });

  it("defers a triggered ability's effects behind its own trigger value", () => {
    const found = contributions(triggered(whenDraw(), gainPoints(1)));
    expect(found.map((entry) => [entry.feature, entry.op, entry.qualifiers])).toEqual([
      ["trigger", "ability", ["deferred"]],
      ["points", "gainPoints", ["deferred"]],
    ]);
    expect(contributions(event(delayed(whenDraw(), draw(1)))).every((entry) => entry.qualifiers.includes("deferred"))).toBe(true);
  });

  it("applies an each-player effect to each player", () => {
    expect(only(eachPlayer(draw(1))).player).toBe("each");
  });

  it("lists unclassified effects with their qualifiers instead of counting them", () => {
    const features = abilityFeatures(event(sequence(foresee(2), optional(foresee(1)), draw(1))), 0);
    expect(features?.contributions.map((entry) => entry.feature)).toEqual(["draw"]);
    expect(features?.unclassified).toEqual([{ op: "foresee", qualifiers: [] }, { op: "foresee", qualifiers: ["optional"] }]);
  });

  it("reports amplified features only when amplified text changes them", () => {
    const plain = cardFeatures(card(() => [event(draw(1))]));
    expect(plain.amplified).toBeUndefined();
    expect(plain.base.map((ability) => ability.contributions.map((entry) => entry.feature))).toEqual([["draw"]]);
    const amplified = cardFeatures(card((variant) => [event(draw(variant.amplified ? 3 : 1))]));
    expect(amplified.base[0]?.contributions[0]?.amount).toEqual({ kind: "exact", value: 1 });
    expect(amplified.amplified?.[0]?.contributions[0]?.amount).toEqual({ kind: "exact", value: 3 });
  });

  it("has no features for an ability without an effect", () => {
    expect(cardFeatures(card(() => [{ kind: "keyword", keyword: "reclaim" }])).base).toEqual([]);
  });
});
