/** Flow primitives: sequence, chooseOne, optional, ifThen, repeat; X. */
import { describe, expect, it } from "vitest";
import type { EngineAvatarDefinition, EngineCardDefinition, EngineDreamsignDefinition, EngineFigmentDefinition } from "../../catalog";
import { enemyCharacter, energyX, event, stackItem, target } from "../../dsl/builders";
import { createEngine } from "../../engine";
import { createFoldAdapter } from "../../fold/slice";
import { boardState } from "../../testing/board";
import { CONTINUOUS_CARDS, CONTINUOUS_EMBLEMS } from "../../testing/continuous-cards";
import { DSL, DSL_CARDS } from "../../testing/dsl-cards";
import { CYCLE_CARDS, LOOP_CARDS } from "../../testing/loop-cards";
import { playFromHand, runScenario } from "../../testing/scenario";
import { STACK_CARDS, SYNTHETIC_EMBLEMS } from "../../testing/stack-cards";
import { SYNTHETIC, SYNTHETIC_CARDS, syntheticId, testCatalog } from "../../testing/synthetic-cards";
import { PROMPTING_CARDS } from "../../testing/synthetic-effects";
import { undeclaredAbilityTargets, undeclaredTargets } from "../../testing/target-audit";
import { TRIGGER_CARDS, TRIGGER_EMBLEMS } from "../../testing/trigger-cards";
import { ZONE_CARDS, ZONE_FIGMENTS } from "../../testing/zone-cards";
import { chosenModes, collectTargets, everyNode, everyTarget } from "../interpreter";
import { primitiveDefinition, primitiveOps } from "../registry";
import { banish } from "./banish";
import { chooseOne } from "./choose-one";
import { dissolve } from "./dissolve";
import { gainPoints } from "./gain-points";
import { prevent } from "./prevent";
import { sequence } from "./sequence";

/** "X●, X from 0: Gain X⍟." */
const pointsFromZeroX: EngineCardDefinition = { ...DSL.pointsTimesX, id: syntheticId(291), costs: [energyX(0)] };
/** "Choose one: Dissolve an enemy; or banish an enemy." Both modes need a target. */
const dissolveOrBanish: EngineCardDefinition = {
  ...DSL.chooseDissolveOrPoints,
  id: syntheticId(292),
  abilities: () => [event(chooseOne(dissolve(target(enemyCharacter())), banish(target(enemyCharacter()))))],
};
const engine = createEngine(testCatalog([...DSL_CARDS, pointsFromZeroX, dissolveOrBanish]));
const v = SYNTHETIC;
const deck = Array.from({ length: 5 }, () => v.vanilla1.id);

describe("flow primitives", () => {
  it("sequence runs its effects in order", () => {
    const { events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawThenEnergy.id], energy: 1, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    const kinds = events.map((event) => event.kind);
    expect(kinds.indexOf("cardDrawn")).toBeLessThan(kinds.lastIndexOf("energyChanged"));
  });

  it("chooseOne chooses its mode at play time, before the commit point and before targets", () => {
    const { state } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.chooseDissolveOrPoints.id], deck },
      enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck },
    });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = fold.reduce(
      { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 },
      { kind: "battleAction", side: "player", action: { kind: "play", card: state.sides.player.hand[0], from: "hand" } },
    );
    if (opened.kind !== "applied") throw new Error("play bounced");
    expect(fold.pending(opened.slice)?.prompt).toMatchObject({
      kind: "chooseMode",
      cancellable: true,
      options: [{ mode: 0, legal: true }, { mode: 1, legal: true }],
    });
  });

  it("a targeted mode collects its target at play time and resolves against it", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.chooseDissolveOrPoints.id], deck }, enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [0, [ids.enemy.back[1]!]],
    });
    expect(state.instances[ids.enemy.back[1]!]?.zone).toBe("void");
    expect(state.instances[ids.enemy.back[0]!]?.zone).toBe("play");
    expect(state.sides.player.score).toBe(0);
  });

  it("a mode whose required target has no candidate is not legal", () => {
    const { state, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.chooseDissolveOrPoints.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    // The only legal mode is answered automatically.
    expect(answers[0]).toMatchObject({ value: 1, auto: true });
    expect(state.sides.player.score).toBe(1);
    const { state: noTargets } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [dissolveOrBanish.id], deck },
      enemy: { deck },
    });
    expect(engine.legalActions(noTargets, "player").some((action) => action.kind === "play")).toBe(false);
  });

  it("splits a card's modes and targets among its event abilities", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.modalThenBounce.id], back: [v.vanilla1.id], deck }, enemy: { back: [v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      // Mode 1 dissolves the only enemy (answered automatically); the bounce takes the player's character.
      answers: (ids) => [1, [ids.player.back[0]!]],
    });
    expect(state.instances[ids.enemy.back[0]!]?.zone).toBe("void");
    expect(state.instances[ids.player.back[0]!]?.zone).toBe("hand");
    expect(state.sides.player.score).toBe(0);
  });

  it("collects only the chosen mode's targets, while validation walks every mode", () => {
    const first = target(enemyCharacter());
    const second = target(enemyCharacter());
    const effect = chooseOne(dissolve(first), gainPoints(1), banish(second));
    expect(collectTargets(effect, chosenModes(effect, [2]))).toEqual([second]);
    expect(collectTargets(effect, chosenModes(effect, [1]))).toEqual([]);
    expect(everyTarget(effect)).toEqual([first, second]);
    expect(everyNode(effect)).toHaveLength(4);
    expect(() => chosenModes(effect, [3])).toThrow();
  });

  it("chooseOne resolves only the chosen mode", () => {
    const { state } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.chooseDrawOrPoints.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [1],
    });
    expect(state.sides.player).toMatchObject({ score: 1, hand: [] });
  });

  it("optional asks and does nothing when declined", () => {
    const declined = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.mayDrawTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [false],
    });
    expect(declined.state.sides.player.hand).toEqual([]);
    const accepted = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.mayDrawTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [true],
    });
    expect(accepted.state.sides.player.hand).toHaveLength(2);
  });

  it("ifThen checks its condition when it resolves", () => {
    const met = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawIfTwoWarriors.id], back: [v.vanilla1.id, v.vanilla2.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(met.state.sides.player.hand).toHaveLength(1);
    const unmet = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawIfTwoWarriors.id], back: [v.vanilla1.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(unmet.state.sides.player).toMatchObject({ hand: [], currentEnergy: 1 });
  });

  it("repeat and X: X is chosen at play time, paid, and read on resolution", () => {
    const { state, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.pointsTimesX.id], energy: 4, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [3],
    });
    expect(answers[0]).toMatchObject({ value: 3 });
    expect(state.sides.player).toMatchObject({ score: 3, currentEnergy: 1 });
  });

  it("a fixed cost plus X prompts for X up to the energy left after the fixed part, and pays both", () => {
    const { state, answers, events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.fixedPlusXPoints.id], energy: 4, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [3],
    });
    expect(answers[0]).toMatchObject({ value: 3 });
    expect(state.sides.player).toMatchObject({ score: 3, currentEnergy: 0 });
    // The fixed part is paid first, then X.
    const spent = events.flatMap((event) => (event.kind === "energyChanged" && event.side === "player" ? [event.current] : []));
    expect(spent.slice(0, 2)).toEqual([3, 0]);
    const tooMuch = () =>
      runScenario(engine, {
        board: { active: "player", phase: "day", player: { hand: [DSL.fixedPlusXPoints.id], energy: 4, deck }, enemy: { deck } },
        steps: (ids) => [playFromHand(ids, "player")],
        answers: () => [4],
      });
    expect(tooMuch).toThrow();
  });

  it("a fixed cost plus X needs the fixed part and X's minimum to be playable", () => {
    const playable = (energy: number) => {
      const { state } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [DSL.fixedPlusXPoints.id], energy, deck }, enemy: { deck } });
      return engine.legalActions(state, "player").some((action) => action.kind === "play");
    };
    expect(playable(1)).toBe(false);
    expect(playable(2)).toBe(true);
  });

  it("X is at least 1 unless the definition widens it to 0", () => {
    const playable = (cardId: typeof DSL.pointsTimesX.id) => {
      const { state } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [cardId], energy: 0, deck }, enemy: { deck } });
      return engine.legalActions(state, "player").some((action) => action.kind === "play");
    };
    expect(playable(DSL.pointsTimesX.id)).toBe(false);
    expect(playable(pointsFromZeroX.id)).toBe(true);
  });
});

describe("primitive registry", () => {
  it("finds every primitive export by its op", () => {
    const ops = primitiveOps();
    expect(new Set(ops).size).toBe(ops.length);
    for (const op of ops) expect(primitiveDefinition(op).op).toBe(op);
    expect(() => primitiveDefinition("noSuchPrimitive")).toThrow();
  });
});

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
