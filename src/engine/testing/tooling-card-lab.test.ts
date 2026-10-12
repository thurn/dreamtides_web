/**
 * The card-lab setup solver and the card-lab battle.
 */
import { describe, expect, it } from "vitest";
import { instanceCard, type EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import { DSL, DSL_CARDS } from "./dsl-cards";
import { createFoldAdapter, type BattleIntent } from "../fold/slice";
import { labBoard } from "./lab-solver";
import { SYNTHETIC, syntheticId, testCatalog } from "./synthetic-cards";
import {
  additionalCost,
  banishFromVoidCost,
  banishXCost,
  choiceCost,
  countCards,
  enemyCharacter,
  characterYouControl,
  energy,
  energyX,
  event,
  fromVoid,
  optionalCost,
  pointsCost,
  keyword,
  revealCost,
  stackItem,
  target,
  x,
} from "../dsl/builders";
import { dissolve } from "../effects/primitives/dissolve";
import { passUntil } from "./trigger-harness";
import { invariantViolations } from "./invariants";
import { copiableCostOf } from "../continuous/characteristics";
import { effectiveSpark } from "../rules/spark";
import type { Engine } from "../engine";
import type { BattleState } from "../state/types";
import type { InstanceId, Side } from "../state/ids";
import { banishCards, banishChosen } from "../effects/primitives/banish-cards";
import { createCopyInHand } from "../effects/primitives/create-copy-in-hand";
import { onMaterialized, triggered } from "../dsl/triggers";
import { gainPoints } from "../effects/primitives/gain-points";
import { abandon } from "../effects/primitives/abandon";
import { eachPlayer } from "../effects/primitives/each-player";
import { cardMatchesFilter } from "../continuous/characteristics";
import type { AdditionalCost, CardFilter } from "../dsl/types";
import { engine } from "./tooling.fixtures";
import { cardLabBattle, cardLabFixture } from "./card-lab";
import { boardState } from "./board";
import { prevent } from "../effects/primitives/prevent";
import type { EngineEvent } from "../events";
import { NO_PROMPTS } from "../steps/sources";

/**
 * Plays `card` on its lab board as `side`, choosing the X equal to the staged
 * enemy's ✦ or cost when the card has an X, and resolves it: whether that
 * enemy was dissolved, with no invariant violated.
 */
function dissolvesStagedEnemy(labEngine: Engine, card: EngineCardDefinition, pool: readonly EngineCardDefinition[], side: Side): boolean {
  const { state } = labBoard(labEngine, card.id, pool, side);
  const enemies = state.sides[side === "player" ? "enemy" : "player"].backRank.filter((id): id is InstanceId => id !== null);
  expect(enemies).toHaveLength(1);
  const [enemy] = enemies as [InstanceId];
  const play = labEngine.legalActions(state, side).find((action) => action.kind === "play");
  if (play === undefined) throw new Error(`no play for ${card.id}`);
  const xFor = (prompt: { readonly min: number; readonly max: number }): number => {
    const value = [effectiveSpark(state, labEngine.catalog, enemy), copiableCostOf(state, labEngine.catalog, enemy)].find((candidate) => candidate >= prompt.min && candidate <= prompt.max);
    if (value === undefined) throw new Error("no X within the prompt's range matches the staged enemy");
    return value;
  };
  const played = labEngine.apply(state, side, play, {
    answer(prompt) {
      if (prompt.kind === "chooseNumber") return xFor(prompt);
      if (prompt.kind === "chooseTargets") return prompt.candidates.slice(0, 1);
      throw new Error(`Unexpected ${prompt.kind}`);
    },
  });
  const resolved: BattleState = passUntil(labEngine, played.state, (next) => next.stack.length === 0).state;
  expect(invariantViolations(resolved, labEngine.catalog)).toEqual([]);
  return resolved.instances[enemy]?.zone === "void";
}

describe("card-lab setup solver", () => {
  it.each(["player", "enemy"] as const)("stages one satisfiable alternative with common X and that branch’s counts as %s", (side) => {
    const decoy: EngineCardDefinition = { ...SYNTHETIC.vanilla5, id: syntheticId(0x55620), subtype: "Mage", costs: [energy(1)] };
    const valid: EngineCardDefinition = { ...SYNTHETIC.vanilla3, id: syntheticId(0x55621), subtype: "Mage", costs: [energy(5)] };
    const card: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(0x55622), status: "authored", costs: [energyX(0)],
      abilities: () => [event(dissolve(target(enemyCharacter({ subtype: "Mage", sparkAtLeast: 3, sparkAtMost: x(), costAtMost: countCards("hand"), anyOf: [
        { sparkAtMost: 0, costAtMost: countCards("void") }, { costAtLeast: x(), sparkAtMost: countCards("void") },
      ] }))))] };
    const labEngine = createEngine(testCatalog([decoy, valid, card]));
    const { state } = labBoard(labEngine, card.id, [decoy, valid], side);
    const other = side === "player" ? "enemy" : "player";
    const staged = state.sides[other].backRank.filter((id): id is InstanceId => id !== null);
    expect(staged).toHaveLength(1);
    expect(state.instances[staged[0]].printing).toEqual({ kind: "card", cardId: valid.id });
    expect(state.sides[side].void).toHaveLength(3);
    expect(state.sides[side].hand.length).toBeGreaterThanOrEqual(copiableCostOf(state, labEngine.catalog, staged[0]));
    const action = labEngine.legalActions(state, side).find(a => a.kind === "play");
    if (action === undefined) throw new Error("Missing staged play");
    const played = labEngine.apply(state, side, action, { answer(prompt) {
      if (prompt.kind === "chooseNumber") return 3;
      if (prompt.kind === "chooseTargets") return [staged[0]];
      throw new Error(`Unexpected ${prompt.kind}`);
    } });
    const resolved = passUntil(labEngine, played.state, next => next.stack.length === 0).state;
    expect(resolved.instances[staged[0]].zone).toBe("void");
    expect(invariantViolations(resolved, labEngine.catalog)).toEqual([]);
  });

  it.each(["player", "enemy"] as const)("normalizes a source-spark bound in a Materialized alternative as %s", (side) => {
    const highMage: EngineCardDefinition = { ...SYNTHETIC.vanilla5, id: syntheticId(0x55624), subtype: "Mage" };
    const lowMage: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(0x55625), subtype: "Mage" };
    const card: EngineCardDefinition = { ...SYNTHETIC.vanilla3, id: syntheticId(0x55623), status: "authored",
      abilities: () => [triggered(onMaterialized(), dissolve(target(characterYouControl({ subtype: "Mage", anyOf: [
        { sparkAtLeast: 4, sparkAtMost: { value: "sourceSpark" } }, { sparkAtLeast: 2, sparkAtMost: { value: "sourceSpark" } },
      ] }))))] };
    const labEngine = createEngine(testCatalog([card, highMage, lowMage]));
    const { state } = labBoard(labEngine, card.id, [highMage, lowMage], side);
    const other = side;
    const staged = state.sides[other].backRank.filter((id): id is InstanceId => id !== null);
    expect(staged).toHaveLength(1);
    expect(effectiveSpark(state, labEngine.catalog, staged[0])).toBeGreaterThanOrEqual(2);
    expect(effectiveSpark(state, labEngine.catalog, staged[0])).toBeLessThanOrEqual(3);
    const action = labEngine.legalActions(state, side).find(a => a.kind === "play");
    if (action === undefined) throw new Error("Missing staged play");
    const played = labEngine.apply(state, side, action, { answer(prompt) {
      if (prompt.kind === "chooseTargets") return [staged[0]];
      throw new Error(`Unexpected ${prompt.kind}`);
    } });
    const resolved = passUntil(labEngine, played.state, next => next.stack.length === 0, { answer(prompt) {
      if (prompt.kind === "chooseTargets") return [staged[0]];
      throw new Error(`Unexpected ${prompt.kind}`);
    } }).state;
    expect(resolved.instances[staged[0]].zone).toBe("void");
  });

  it.each(["player", "enemy"] as const)("returns a Materialized stack opener usable by the real card-lab caller as %s", (side) => {
    const other = side === "player" ? "enemy" : "player";
    for (const controller of ["any", "opponent"] as const) for (const cardType of [undefined, "character", "event"] as const) for (const route of [0, 1]) {
      const card: EngineCardDefinition = {
        ...SYNTHETIC.interruptCharacter, id: syntheticId(940), status: "authored",
        abilities: () => [
          keyword("offering"), additionalCost(optionalCost(revealCost())),
          triggered(onMaterialized(), prevent(stackItem({ controller, cardType }))),
        ],
      };
      const labEngine = createEngine(testCatalog([...DSL_CARDS, card]));
      const solved = labBoard(labEngine, card.id, [], side);
      expect(solved.opener).toBe(other);
      expect(solved.state.stack).toEqual([]);
      expect(solved.state.turn.active).toBe(other);
      const rebuilt = boardState(labEngine.catalog, solved.setup);
      expect(rebuilt.state).toEqual(solved.state);
      const stagedOpener = rebuilt.ids[other].hand[0];
      expect(stagedOpener).not.toBe(rebuilt.ids[side].hand[0]);
      expect(instanceCard(labEngine.catalog, rebuilt.state.instances[stagedOpener]).cardType).toBe(cardType ?? "event");
      const request = { entry: { cardId: card.id }, variant: "base" as const, side };
      const fixture = cardLabFixture(labEngine, request, []);
      const fixtureIds = boardState(labEngine.catalog, fixture.setup).ids;
      const opener = fixtureIds[other].hand[0];
      const source = fixtureIds[side].hand[0];
      expect(fixture.script.map((step) => "side" in step ? step.side : null)).toEqual(side === "enemy" ? [other, side] : [other]);
      const events: EngineEvent[] = [];
      let slice = cardLabBattle(labEngine, request, [], (published) => events.push(...published)).slice;
      expect(slice.committed.stack.some((item) => item.kind === "card" && item.instance === opener)).toBe(true);
      const adapter = createFoldAdapter(labEngine);
      const apply = (intent: BattleIntent): void => {
        const result = adapter.reduce(slice, intent);
        if (result.kind === "bounced") throw new Error(result.reason);
        expect(result.error).toBeNull();
        events.push(...result.published);
        slice = result.slice;
      };
      if (side === "player") apply({ kind: "battleAction", side, action: { kind: "play", card: source, from: "hand" } });
      for (let steps = 0; slice.inFlight !== null || slice.committed.stack.length > 0; steps++) {
        if (steps >= 20) throw new Error("lab workflow did not settle");
        const pending = adapter.pending(slice)?.prompt;
        if (pending !== undefined) {
          const value = (() => {
            if (pending.kind === "chooseMode" && pending.purpose.role === "playRoute") {
              expect(pending.options[route]?.legal).toBe(true);
              return route;
            }
            if (pending.kind === "confirm" && pending.purpose.role === "optionalCost") return false;
            if (pending.kind === "chooseCards") {
              expect(pending.candidates).not.toContain(source);
              return pending.candidates.slice(0, pending.min);
            }
            if (pending.kind === "chooseTargets") {
              expect(slice.committed.instances[source]?.zone).toBe("play");
              expect(pending.candidates).toEqual([opener]);
              return [opener];
            }
            throw new Error(`unexpected ${pending.kind} ${pending.purpose.role}`);
          })();
          apply({ kind: "answer", side: pending.side, promptId: pending.id, value });
        } else {
          const decision = labEngine.decision(slice.committed);
          if (decision === null) throw new Error("no lab decision");
          apply({ kind: "battleAction", side: decision.side, action: { kind: "pass" } });
        }
      }
      expect(events.filter((event) => event.kind === "prevented")).toEqual([expect.objectContaining({ instance: opener, side: other, to: "void" })]);
      const materializedAt = events.findIndex((event) => event.kind === "materialized" && event.instance === source);
      expect(materializedAt).toBeGreaterThanOrEqual(0);
      expect(events.findIndex((event) => event.kind === "prevented")).toBeGreaterThan(materializedAt);
      expect(events.some((event) => event.kind === "noLegalTarget")).toBe(false);
      expect(slice.committed.instances[opener]?.zone).toBe("void");
      expect(slice.committed.instances[source]?.status.offering).toBe(route === 1);
      expect(invariantViolations(slice.committed, labEngine.catalog)).toEqual([]);
    }
  });

  it("preserves own-controller Materialized selectors and explicit staged boards", () => {
    for (const side of ["player", "enemy"] as const) {
      const own: EngineCardDefinition = {
        ...SYNTHETIC.interruptCharacter, id: syntheticId(941), status: "authored",
        abilities: () => [triggered(onMaterialized(), prevent(stackItem({ controller: "you" })))],
      };
      const opposing: EngineCardDefinition = { ...own, id: syntheticId(942), abilities: () => [triggered(onMaterialized(), prevent(stackItem()))] };
      const labEngine = createEngine(testCatalog([...DSL_CARDS, own, opposing]));
      const solved = labBoard(labEngine, own.id, [], side);
      expect(solved.opener).toBeNull();
      expect(solved.state.turn.active).toBe(side);
      const source = solved.state.sides[side].hand[0];
      const played = labEngine.apply(solved.state, side, { kind: "play", card: source, from: "hand" }, NO_PROMPTS);
      const resolved = passUntil(labEngine, played.state, (state) => state.stack.length === 0);
      expect([...played.events, ...resolved.steps.flatMap((step) => step.events)].some((event) => event.kind === "noLegalTarget")).toBe(true);
      expect([...played.events, ...resolved.steps.flatMap((step) => step.events)].some((event) => event.kind === "prevented")).toBe(false);
      const stage = { [side]: { hand: [opposing.id, SYNTHETIC.vanilla2.id], void: [SYNTHETIC.vanilla3.id], energy: 3 } };
      const declared = labBoard(labEngine, opposing.id, [], side, stage);
      expect(declared.opener).toBeNull();
      expect(declared.state.turn.active).toBe(side);
      expect(declared.setup[side]).toMatchObject(stage[side]);
      expect(cardLabFixture(labEngine, { entry: { cardId: opposing.id }, variant: "base", side, stage }, []).script).toEqual([]);
    }
  });

  it("retains event stack-target staging and excludes the played source", () => {
    for (const side of ["player", "enemy"] as const) {
      const card: EngineCardDefinition = { ...SYNTHETIC.interruptEvent, id: syntheticId(943), status: "authored", abilities: () => [event(prevent(stackItem({ cardType: "event" })))] };
      const labEngine = createEngine(testCatalog([...DSL_CARDS, card]));
      const solved = labBoard(labEngine, card.id, [], side);
      const other = side === "player" ? "enemy" : "player";
      expect(solved.opener).toBe(other);
      const { state, ids } = boardState(labEngine.catalog, solved.setup);
      const opener = ids[other].hand[0];
      const source = ids[side].hand[0];
      const opening = labEngine.apply(state, other, { kind: "play", card: opener, from: "hand" }, NO_PROMPTS);
      const played = labEngine.apply(opening.state, side, { kind: "play", card: source, from: "hand" }, { answer(prompt) {
        if (prompt.kind !== "chooseTargets") throw new Error(`unexpected ${prompt.kind}`);
        expect(prompt.candidates).toEqual([opener]);
        return [opener];
      } });
      const resolved = passUntil(labEngine, played.state, (state) => state.stack.length === 0);
      expect([...played.events, ...resolved.steps.flatMap((step) => step.events)].filter((event) => event.kind === "prevented")).toEqual([expect.objectContaining({ instance: opener })]);
      expect(resolved.state.instances[source]?.zone).toBe("void");
    }
  });

  it("stages subtype-only and combined type/subtype void targets with canonical filter matching", () => {
    const mage: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(907), subtype: "Mage" };
    const eventCard: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(912), subtype: "Ember" };
    const filters: readonly CardFilter[] = [{ subtype: "Ember" }, { cardType: "event", subtype: "Ember" }, { cardType: "character", subtype: "Mage" }];
    for (const [index, filter] of filters.entries()) {
      const card: EngineCardDefinition = {
        ...SYNTHETIC.event0,
        id: syntheticId(908 + index),
        status: "authored",
        abilities: () => [event(createCopyInHand(fromVoid(filter, { player: "opponent", count: 2 })))],
      };
      const labEngine = createEngine(testCatalog([card, mage, eventCard]));
      const { state } = labBoard(labEngine, card.id, [mage, eventCard], "enemy");
      expect(state.sides.player.void).toHaveLength(2);
      expect(new Set(state.sides.player.void).size).toBe(2);
      for (const id of state.sides.player.void) {
        expect(cardMatchesFilter(state, labEngine.catalog, id, filter)).toBe(true);
        expect(state.instances[id]?.printing).toEqual({ kind: "card", cardId: filter.subtype === "Mage" ? mage.id : eventCard.id });
      }
      expect(state.sides.enemy.void).toEqual([]);
    }
  });

  it("skips authored void targets in favor of a neutral matching printing", () => {
    const neutral: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(913), subtype: "Mage" };
    const authored: EngineCardDefinition = { ...neutral, id: syntheticId(914), status: "authored", abilities: () => [] };
    const card: EngineCardDefinition = {
      ...SYNTHETIC.event0,
      id: syntheticId(915),
      status: "authored",
      abilities: () => [event(createCopyInHand(fromVoid({ cardType: "character", subtype: "Mage" })))],
    };
    const labEngine = createEngine(testCatalog([card, authored, neutral]));
    const { state } = labBoard(labEngine, card.id, [authored, neutral]);
    expect(state.sides.player.void).toHaveLength(1);
    const [target] = state.sides.player.void;
    expect(target === undefined ? undefined : state.instances[target]?.printing).toEqual({ kind: "card", cardId: neutral.id });
  });

  it("rejects a void filter whose type and subtype cannot match any setup printing", () => {
    const card: EngineCardDefinition = {
      ...SYNTHETIC.event0,
      id: syntheticId(911),
      status: "authored",
      abilities: () => [event(createCopyInHand(fromVoid({ cardType: "event", subtype: "Mage" })))],
    };
    const labEngine = createEngine(testCatalog([card]));
    expect(() => labBoard(labEngine, card.id, [])).toThrow(/no card for filter/);
  });

  it("fills the playing side's void for a void banish cost: its fixed count, or its least X", () => {
    const mage: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(916), subtype: "Mage" };
    const banishing = (index: number, cost: ReturnType<typeof banishXCost>): EngineCardDefinition => ({
      ...SYNTHETIC.event0, id: syntheticId(index), status: "authored", abilities: () => [additionalCost(cost), event(gainPoints(1))],
    });
    const fixed = banishing(917, banishFromVoidCost(2, { subtype: "Mage" }));
    const variable = banishing(918, banishXCost({ min: 2, filter: { subtype: "Mage" } }));
    const labEngine = createEngine(testCatalog([fixed, variable, mage]));
    for (const card of [fixed, variable]) for (const side of ["player", "enemy"] as const) {
      const { state } = labBoard(labEngine, card.id, [mage], side);
      expect(state.sides[side].void).toHaveLength(2);
      for (const id of state.sides[side].void) expect(cardMatchesFilter(state, labEngine.catalog, id, { subtype: "Mage" })).toBe(true);
      expect(state.sides[side === "player" ? "enemy" : "player"].void).toEqual([]);
    }
  });

  it("gives the playing side the ⍟ a points additional cost needs, and the other side none", () => {
    const priced: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(919), status: "authored", abilities: () => [additionalCost(pointsCost(4)), event(gainPoints(1))] };
    const labEngine = createEngine(testCatalog([priced]));
    for (const side of ["player", "enemy"] as const) {
      const { state } = labBoard(labEngine, priced.id, [], side);
      expect(state.sides[side].score).toBe(4);
      expect(state.sides[side === "player" ? "enemy" : "player"].score).toBe(0);
    }
  });

  it("stages the void cards and ⍟ of nested alternatives and optional costs, so every branch is payable", () => {
    const mage: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(921), subtype: "Mage" };
    const priced = (index: number, cost: AdditionalCost): EngineCardDefinition => ({
      ...SYNTHETIC.event0, id: syntheticId(index), status: "authored", abilities: () => [additionalCost(cost), event(gainPoints(1))],
    });
    const banishMages = banishXCost({ min: 2, filter: { subtype: "Mage" } });
    // Every alternative needs staging: an empty void and no ⍟ would leave the card unplayable.
    const alternatives = priced(922, choiceCost([banishMages], [pointsCost(3)], [pointsCost(5)]));
    const optional = priced(923, optionalCost(banishMages));
    const labEngine = createEngine(testCatalog([alternatives, optional, mage]));
    for (const side of ["player", "enemy"] as const) {
      for (const card of [alternatives, optional]) {
        const { state } = labBoard(labEngine, card.id, [mage], side);
        expect(state.sides[side].void).toHaveLength(2);
        for (const id of state.sides[side].void) expect(cardMatchesFilter(state, labEngine.catalog, id, { subtype: "Mage" })).toBe(true);
        const action = labEngine.legalActions(state, side).find((candidate) => candidate.kind === "play");
        if (action === undefined) throw new Error(`no play for ${card.id}`);
        const fold = createFoldAdapter(labEngine);
        const outcome = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side, action });
        if (outcome.kind !== "applied") throw new Error(outcome.reason);
        const prompt = fold.pending(outcome.slice)?.prompt;
        if (card === alternatives) {
          expect(prompt?.kind === "chooseMode" ? prompt.options.map((option) => option.legal) : prompt).toEqual([true, true, true]);
        } else {
          // The optional banish is offered rather than skipped as unaffordable.
          expect(prompt?.purpose.role).toBe("optionalCost");
        }
      }
    }
  });

  it("stages a ▸Materialized trigger's void targets and a matching card for each choice from the opponent's hand", () => {
    const mage: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(924), subtype: "Mage" };
    const banisher: EngineCardDefinition = {
      ...SYNTHETIC.vanilla1, id: syntheticId(925), status: "authored",
      abilities: () => [triggered(onMaterialized(), banishCards([fromVoid({ subtype: "Mage" }, { player: "opponent", count: 2, upTo: true })]))],
    };
    const chooser: EngineCardDefinition = {
      ...SYNTHETIC.event0, id: syntheticId(926), status: "authored", abilities: () => [event(banishChosen({ subtype: "Mage" }))],
    };
    const labEngine = createEngine(testCatalog([banisher, chooser, mage]));
    for (const side of ["player", "enemy"] as const) {
      const other = side === "player" ? "enemy" : "player";
      const trigger = labBoard(labEngine, banisher.id, [mage], side).state;
      expect(trigger.sides[other].void).toHaveLength(2);
      for (const id of trigger.sides[other].void) expect(cardMatchesFilter(trigger, labEngine.catalog, id, { subtype: "Mage" })).toBe(true);
      expect(trigger.sides[side].void).toEqual([]);
      const chosen = labBoard(labEngine, chooser.id, [mage], side).state;
      expect(chosen.sides[other].hand).toHaveLength(1);
      for (const id of chosen.sides[other].hand) expect(cardMatchesFilter(chosen, labEngine.catalog, id, { subtype: "Mage" })).toBe(true);
    }
  });

  it("stages a matching own character for each player who abandons as a ▸Materialized trigger resolves", () => {
    const mage: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(927), subtype: "Mage" };
    const each: EngineCardDefinition = {
      ...SYNTHETIC.vanilla1, id: syntheticId(928), status: "authored",
      abilities: () => [triggered(onMaterialized(), eachPlayer(abandon("you", { subtype: "Mage", figment: false })))],
    };
    const forced: EngineCardDefinition = { ...each, id: syntheticId(929), abilities: () => [triggered(onMaterialized(), abandon("opponent", { subtype: "Mage" }))] };
    const labEngine = createEngine(testCatalog([each, forced, mage]));
    for (const side of ["player", "enemy"] as const) {
      const other = side === "player" ? "enemy" : "player";
      const both = labBoard(labEngine, each.id, [mage], side).state;
      for (const chooser of [side, other] as const) {
        const staged = both.sides[chooser].backRank.filter((id): id is InstanceId => id !== null);
        expect(staged.map((id) => both.instances[id].printing)).toEqual([{ kind: "card", cardId: mage.id }]);
      }
      const opposing = labBoard(labEngine, forced.id, [mage], side).state;
      expect(opposing.sides[side].backRank.filter((id) => id !== null)).toEqual([]);
      expect(opposing.sides[other].backRank.filter((id) => id !== null)).toHaveLength(1);
    }
  });

  it("solves a playable board for every synthetic DSL card", () => {
    for (const card of DSL_CARDS) {
      expect(() => labBoard(engine, card.id, []), card.id).not.toThrow();
    }
  });

  it("places targets on the side each selector names", () => {
    const { state } = labBoard(engine, DSL.dissolveEnemy.id, []);
    expect(state.sides.enemy.backRank.filter((id) => id !== null)).toHaveLength(1);
    expect(state.sides.player.backRank.filter((id) => id !== null)).toHaveLength(0);
  });

  it("stages the hand and deck cards a count-bounded target needs, so the card resolves on it", () => {
    /** A 10● 10✦ character: only a deck staged past its 8 cards admits it. */
    const giant: EngineCardDefinition = { ...SYNTHETIC.vanilla5, id: syntheticId(927), spark: 10 };
    const dissolver = (index: number, selector: Parameters<typeof enemyCharacter>[0]): EngineCardDefinition => ({
      ...SYNTHETIC.event0, id: syntheticId(index), status: "authored", abilities: () => [event(dissolve(target(enemyCharacter(selector))))],
    });
    // The source has left the hand when its target is checked on resolution.
    const yourHand = dissolver(928, { sparkAtLeast: 1, sparkAtMost: countCards("hand") });
    const theirHand = dissolver(929, { costAtLeast: 1, sparkAtMost: countCards("hand", undefined, "opponent") });
    const yourDeck = dissolver(930, { sparkAtLeast: 9, sparkAtMost: countCards("deck") });
    const labEngine = createEngine(testCatalog([yourHand, theirHand, yourDeck, giant]));
    for (const card of [yourHand, theirHand, yourDeck]) for (const side of ["player", "enemy"] as const) {
      expect(dissolvesStagedEnemy(labEngine, card, [giant], side), `${card.id} as ${side}`).toBe(true);
    }
  });

  it("stages a target an exact X bound admits at an X the play can choose", () => {
    const exactly = (index: number, selector: Parameters<typeof enemyCharacter>[0]): EngineCardDefinition => ({
      ...SYNTHETIC.event0, id: syntheticId(index), status: "authored", costs: [energy(1), energyX()], abilities: () => [event(dissolve(target(enemyCharacter(selector))))],
    });
    const sparkX = exactly(931, { sparkAtLeast: x(), sparkAtMost: x() });
    const costX = exactly(932, { costAtLeast: x(), costAtMost: x() });
    const labEngine = createEngine(testCatalog([sparkX, costX]));
    for (const card of [sparkX, costX]) for (const side of ["player", "enemy"] as const) {
      expect(dissolvesStagedEnemy(labEngine, card, [], side), `${card.id} as ${side}`).toBe(true);
    }
  });

  it("stages an authored printing for a void count or void target whose subtype only authored cards carry", () => {
    const ancient: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(933), subtype: "Ancient", status: "authored", abilities: () => [] };
    const counting: EngineCardDefinition = {
      ...SYNTHETIC.event0, id: syntheticId(934), status: "authored",
      abilities: () => [event(dissolve(target(enemyCharacter({ sparkAtMost: countCards("void", { subtype: "Ancient" }) }))))],
    };
    const copying: EngineCardDefinition = {
      ...SYNTHETIC.event0, id: syntheticId(935), status: "authored", abilities: () => [event(createCopyInHand(fromVoid({ subtype: "Ancient" })))],
    };
    const labEngine = createEngine(testCatalog([counting, copying, ancient]));
    for (const side of ["player", "enemy"] as const) {
      for (const card of [counting, copying]) {
        const { state } = labBoard(labEngine, card.id, [ancient], side);
        expect(state.sides[side].void.length).toBeGreaterThan(0);
        for (const id of state.sides[side].void) expect(cardMatchesFilter(state, labEngine.catalog, id, { subtype: "Ancient" })).toBe(true);
      }
      expect(dissolvesStagedEnemy(labEngine, counting, [ancient], side)).toBe(true);
    }
  });
});
