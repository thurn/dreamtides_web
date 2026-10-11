/**
 * The card-lab setup solver and the card-lab battle.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import { DSL, DSL_CARDS } from "./dsl-cards";
import { createFoldAdapter } from "../fold/slice";
import { labBoard } from "./lab-solver";
import { cardLabBattle, cardLabEnemyAction, cardLabStageFromUnknown, type CardLabStage } from "./card-lab";
import { aiDecision } from "../policy/decide";
import { FRONT_RANK_SIZE } from "../state/ids";
import { supportersOf } from "../continuous/support";
import { applyDebugOp, withHistory } from "../debug/debug-actions";
import { SYNTHETIC, syntheticId, testCatalog } from "./synthetic-cards";
import {
  additionalCost,
  banishFromVoidCost,
  banishXCost,
  choiceCost,
  countCards,
  enemyCharacter,
  energy,
  energyX,
  event,
  fromVoid,
  optionalCost,
  pointsCost,
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

describe("card-lab battle", () => {
  it("deals the card's variant to the side playing it, and opens with the enemy's play as the enemy", () => {
    const entry = { cardId: DSL.dissolveEnemy.id, amplified: true };
    const asPlayer = cardLabBattle(engine, { entry, variant: "amplified", side: "player" }, []);
    const [card] = asPlayer.slice.committed.sides.player.hand;
    expect(card === undefined ? undefined : asPlayer.slice.committed.instances[card]?.variant.amplified).toBe(true);
    expect(asPlayer.init.decks.player).toContainEqual(entry);
    expect(engine.decision(asPlayer.slice.committed)).toEqual({ kind: "main", side: "player" });

    const asEnemy = cardLabBattle(engine, { entry: { cardId: DSL.drawTwo.id }, variant: "base", side: "enemy" }, []);
    const played = Object.values(asEnemy.slice.committed.instances).find(
      (instance) => instance.printing.kind === "card" && instance.printing.cardId === DSL.drawTwo.id,
    );
    expect(played?.zone).toBe("stack");
    expect(engine.decision(asEnemy.slice.committed)).toEqual({ kind: "respond", side: "player" });
  });

  const declared = (enemyScript: CardLabStage["enemyScript"] = []) => cardLabBattle(engine, {
    entry: { cardId: DSL.drawTwo.id }, variant: "base", side: "enemy",
    stage: {
      player: { front: [null, SYNTHETIC.vanilla3.id], back: [null, SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id], hand: [SYNTHETIC.interruptEvent.id], energy: 7 },
      enemy: { back: [SYNTHETIC.vanilla3.id, SYNTHETIC.vanilla3.id], hand: [DSL.chooseDrawOrPoints.id, DSL.chooseDrawOrPoints.id, SYNTHETIC.interruptEvent.id], void: [SYNTHETIC.event0.id], energy: 6 },
      enemyScript,
    },
  }, []);

  it("declares exact ranks, both energies and duplicate physical cards without the legacy enemy opening play", () => {
    const lab = declared();
    const state = lab.slice.committed;
    expect(state.sides.player.currentEnergy).toBe(7);
    expect(state.sides.enemy.currentEnergy).toBe(6);
    const front = state.sides.player.frontRank[1];
    if (front === null) throw new Error("no supported front character");
    expect(supportersOf(state, front)).toEqual(state.sides.player.backRank.slice(1, 3));
    expect(state.sides.player.backRank.slice(0, 3)).toEqual([null, expect.any(String), expect.any(String)]);
    expect(state.sides.enemy.hand).toHaveLength(3);
    expect(new Set(state.sides.enemy.hand).size).toBe(3);
    expect(state.stack).toEqual([]);
    expect(declared()).toEqual(lab);
  });

  it("rejects malformed declarations and impossible physical references atomically", () => {
    const before = declared();
    for (const stage of [
      { player: { energy: -1 } }, { player: { front: Array(FRONT_RANK_SIZE + 1).fill(null) } },
      { enemy: { hand: [null] } }, { enemy: { hand: ["bad-id"] } }, { typo: [] },
      { enemyScript: [{ kind: "play", ref: { zone: "hand", index: 0, side: "player" } }] },
      { enemyScript: [{ kind: "advance", ref: { zone: "back", index: 0 }, lane: FRONT_RANK_SIZE }] },
    ]) expect(() => cardLabStageFromUnknown(stage)).toThrow();
    expect(() => declared([{ kind: "play", ref: { zone: "hand", index: 3 } }])).toThrow(/physical card/);
    expect(() => cardLabBattle(engine, { entry: { cardId: DSL.drawTwo.id }, variant: "base", side: "player", stage: { player: { front: [DSL.drawTwo.id] } } }, [])).toThrow(/characters/);
    expect(declared()).toEqual(before);
  });

  it("replays live physical plays, cancellation, answers, response passes, advance and Challenge through validated intents", () => {
    const lab = declared([
      { kind: "play", ref: { zone: "hand", index: 1 } },
      { kind: "advance", ref: { zone: "back", index: 1 }, lane: 2 }, { kind: "challenge" },
    ]);
    const adapter = createFoldAdapter(engine);
    let slice = withHistory(lab.slice);
    const selected = slice.committed.sides.enemy.hand[1];
    const advanced = slice.committed.sides.enemy.backRank[1];
    if (advanced === null) throw new Error("no advanced character");
    const next = () => aiDecision({ engine, init: lab.init, slice, pending: adapter.pending(slice), side: "enemy", policy: "greedy" });
    const apply = (intent: Parameters<typeof adapter.reduce>[1]) => {
      const outcome = adapter.reduce(slice, intent);
      if (outcome.kind === "bounced" || outcome.error !== null) throw new Error("declared intent failed");
      slice = outcome.slice;
      return outcome.published;
    };
    const play = { kind: "play", card: selected, from: "hand" } as const;
    expect(next()?.forced).toEqual({ kind: "action", action: play });
    expect(next()).toEqual(next());
    apply({ kind: "battleAction", side: "enemy", action: play });
    const prompt = adapter.pending(slice)?.prompt;
    if (prompt === undefined) throw new Error("no mode prompt");
    expect(next()?.kind).toBe("prompt");
    expect(adapter.reduce(slice, { kind: "answer", side: "player", promptId: prompt.id, value: 1 })).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
    apply({ kind: "cancel", side: "enemy", promptId: prompt.id });
    expect(next()?.forced).toEqual({ kind: "action", action: play });
    apply({ kind: "battleAction", side: "enemy", action: play });
    expect(adapter.reduce(slice, { kind: "answer", side: "enemy", promptId: prompt.id, value: 1 })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    apply({ kind: "answer", side: "enemy", promptId: adapter.pending(slice)!.prompt.id, value: 1 });
    expect(engine.decision(slice.committed)).toEqual({ kind: "respond", side: "player" });
    apply({ kind: "battleAction", side: "player", action: { kind: "play", card: slice.committed.sides.player.hand[0], from: "hand" } });
    expect(engine.decision(slice.committed)).toEqual({ kind: "respond", side: "enemy" });
    expect(next()?.forced).toBeNull();
    for (let responses = 0; responses < 4; responses += 1) {
      const response = engine.decision(slice.committed);
      if (response?.kind !== "respond") break;
      apply({ kind: "battleAction", side: response.side, action: { kind: "pass" } });
    }
    // The next Day action keeps its initial physical id after the response.
    expect(next()?.forced).toEqual({ kind: "action", action: { kind: "reposition", card: advanced, to: { rank: "front", index: 2 } } });
    apply({ kind: "battleAction", side: "enemy", action: { kind: "reposition", card: advanced, to: { rank: "front", index: 2 } } });
    expect(next()?.forced).toEqual({ kind: "action", action: { kind: "pass" } });
    const challenged = apply({ kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    expect(challenged).toContainEqual(expect.objectContaining({ kind: "challengersDesignated", challengers: [advanced] }));
    expect(cardLabEnemyAction(engine, lab.init, slice)).toBeNull();
    const undone = applyDebugOp(engine, slice, { kind: "undo", keep: 0 });
    if (undone.kind !== "applied") throw new Error("undo failed");
    slice = undone.slice;
    expect(next()?.forced).toEqual({ kind: "action", action: play });
  });

  it("fails loudly for invalid save metadata or a stale illegal script and leaves normal policy untouched", () => {
    const lab = declared([{ kind: "play", ref: { zone: "void", index: 0 } }]);
    const slice = withHistory(lab.slice);
    expect(() => aiDecision({ engine, init: lab.init, slice, pending: null, side: "enemy", policy: "greedy" })).toThrow(/illegal or stale/);
    const invalid = { ...lab.init, cardLabStage: { kind: "declared-card-lab", stage: { enemyScript: [{ kind: "evil" }] } } };
    const wrongKind = { ...lab.init, cardLabStage: { kind: "other" } };
    expect(() => cardLabEnemyAction(engine, invalid, slice)).toThrow();
    expect(() => cardLabEnemyAction(engine, wrongKind, slice)).toThrow();
    const ordinary = { seed: lab.init.seed, scoreToWin: lab.init.scoreToWin, decks: lab.init.decks, dreamwell: lab.init.dreamwell };
    expect(cardLabEnemyAction(engine, ordinary, slice)).toBeNull();
  });

  it("keeps a faulted resolving play suspended from script progress until history recovery", () => {
    const fault: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(916), synthetic: {
      resolve: (ctx, item) => {
        ctx.choose({ kind: "confirm", side: item.controller, purpose: { source: item.instance, cardId: null, ability: null, role: "youMay" } });
        throw new Error("synthetic declared resolution fault");
      },
    } };
    const faulty = createEngine(testCatalog([fault]));
    const lab = cardLabBattle(faulty, { entry: { cardId: fault.id }, variant: "base", side: "enemy", stage: {
      player: { hand: [] }, enemy: { hand: [fault.id], back: [SYNTHETIC.vanilla2.id] },
      enemyScript: [{ kind: "play", ref: { zone: "hand", index: 0 } }, { kind: "advance", ref: { zone: "back", index: 0 }, lane: 1 }],
    } }, []);
    const adapter = createFoldAdapter(faulty);
    const base = withHistory(lab.slice);
    const action = cardLabEnemyAction(faulty, lab.init, base);
    if (action === null) throw new Error("no scripted play");
    const playing = adapter.reduce(base, { kind: "battleAction", side: "enemy", action });
    if (playing.kind !== "applied") throw new Error("play bounced");
    const prompt = adapter.pending(playing.slice)?.prompt;
    if (prompt === undefined) throw new Error("no resolving prompt");
    const failed = adapter.reduce(playing.slice, { kind: "answer", side: "enemy", promptId: prompt.id, value: true });
    if (failed.kind !== "applied") throw new Error("answer bounced");
    expect(failed.error?.message).toContain("synthetic declared resolution fault");
    expect(cardLabEnemyAction(faulty, lab.init, failed.slice)).toBeNull();
    const recovered = applyDebugOp(faulty, failed.slice, { kind: "undo", keep: 0 });
    if (recovered.kind !== "applied") throw new Error("fault recovery failed");
    expect(cardLabEnemyAction(faulty, lab.init, recovered.slice)).toEqual(action);
  });
});
