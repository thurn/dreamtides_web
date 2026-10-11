import { describe, expect, it } from "vitest";
import type { EngineAvatarDefinition, EngineCardDefinition, EngineDreamsignDefinition, EngineFigmentDefinition } from "../../../catalog";
import { enemyCharacter, event, fromVoid, stackItem, target } from "../../../dsl/builders";
import { CONTINUOUS_CARDS, CONTINUOUS_EMBLEMS } from "../../../testing/continuous-cards";
import { DSL_CARDS } from "../../../testing/dsl-cards";
import { CYCLE_CARDS, LOOP_CARDS } from "../../../testing/loop-cards";
import { STACK_CARDS, SYNTHETIC_EMBLEMS } from "../../../testing/stack-cards";
import { SYNTHETIC_CARDS } from "../../../testing/synthetic-cards";
import { PROMPTING_CARDS } from "../../../testing/synthetic-effects";
import { undeclaredAbilityTargets, undeclaredTargets } from "../../../testing/target-audit";
import { TRIGGER_CARDS, TRIGGER_EMBLEMS } from "../../../testing/trigger-cards";
import { ZONE_CARDS, ZONE_FIGMENTS } from "../../../testing/zone-cards";
import { banish } from "../banish";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { prevent } from "../prevent";
import { sequence } from "../sequence";

describe("primitive play-time targets", () => {
  const fixtures: readonly (EngineCardDefinition | EngineFigmentDefinition | EngineAvatarDefinition | EngineDreamsignDefinition)[] = [
    ...SYNTHETIC_CARDS,
    ...PROMPTING_CARDS,
    ...DSL_CARDS,
    ...STACK_CARDS,
    ...TRIGGER_CARDS,
    ...CONTINUOUS_CARDS,
    ...ZONE_CARDS,
    ...LOOP_CARDS,
    ...CYCLE_CARDS,
    ...ZONE_FIGMENTS,
    ...[SYNTHETIC_EMBLEMS, TRIGGER_EMBLEMS, CONTINUOUS_EMBLEMS].flatMap((emblems) => [...(emblems.avatars ?? []), ...(emblems.dreamsigns ?? [])]),
  ];

  it("declares every target spec each synthetic fixture's primitives hold", () => {
    for (const fixture of fixtures) {
      for (const amplified of [false, true]) {
        expect(undeclaredAbilityTargets(fixture.abilities({ amplified })), fixture.id).toEqual([]);
      }
    }
  });

  it("reports a target spec a node holds outside its primitive's targets hook", () => {
    const stray = target(enemyCharacter());
    const node = { ...gainPoints(1), stray };
    expect(undeclaredTargets(node)).toEqual([stray]);
    const stackStray = { kind: "stackTarget" as const, selector: stackItem({}) };
    const listed = { ...dissolve(target(enemyCharacter())), extra: [stackStray] };
    expect(undeclaredTargets(listed)).toEqual([stackStray]);
    const voidStray = fromVoid({ subtype: "Warrior" });
    const voidNode = { ...gainPoints(1), extra: [voidStray] };
    expect(undeclaredTargets(voidNode)).toEqual([voidStray]);
  });

  it("checks declared specs and nested effect nodes as nodes of their own", () => {
    expect(undeclaredTargets(dissolve(target(enemyCharacter())))).toEqual([]);
    expect(undeclaredTargets(prevent(stackItem({})))).toEqual([]);
    expect(undeclaredTargets(sequence(dissolve(target(enemyCharacter())), banish(target(enemyCharacter()))))).toEqual([]);
    const stray = target(enemyCharacter());
    const node = { ...gainPoints(2), stray };
    expect(undeclaredAbilityTargets([event(sequence(gainPoints(1), node))])).toEqual([{ op: "gainPoints", spec: stray }]);
  });
});
