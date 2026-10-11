/**
 * The card-lab setup solver and battle, the engine debug actions (D4), the
 * prompt lab, pending-entity semantics (D36), and the Phase 5
 * scenario-module runner.
 */
import { describe, expect, it, vi } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import { NO_PROMPTS } from "../steps/sources";
import { DSL, DSL_CARDS } from "./dsl-cards";
import { createCatalog } from "../catalog";
import { createFoldAdapter } from "../fold/slice";
import { labBoard } from "./lab-solver";
import { boardState } from "./board";
import { cardLabBattle, cardLabEnemyAction, cardLabStageFromUnknown, type CardLabStage } from "./card-lab";
import { aiDecision } from "../policy/decide";
import { FRONT_RANK_SIZE } from "../state/ids";
import { supportersOf } from "../continuous/support";
import { applyDebugOp, debugOpFromUnknown, withHistory, type DebugOp } from "../debug/debug-actions";
import type { BattleSlice } from "../fold/slice";
import { EVENT_DEFINITIONS } from "../events";
import { PROMPT_LAB_DEFINITIONS, PROMPT_LAB_FIXTURES, promptLabBattle, promptLabFixture, promptLabPresentation } from "./prompt-lab";
import { runNamedScenario, scenarioRegistryProblems } from "../../content/specs/runner";
import { playFromHand, runScenario, type NamedScenario, type ScenarioSpec } from "./scenario";
import { SYNTHETIC, syntheticId, testCatalog } from "./synthetic-cards";
import { unannouncedChanges } from "./announced-changes";
import { moveInstance } from "../rules/zones";
import { additionalCost, banishFromVoidCost, banishXCost, choiceCost, event, fromVoid, optionalCost, pointsCost } from "../dsl/builders";
import { createCopyInHand } from "../effects/primitives/create-copy-in-hand";
import { gainPoints } from "../effects/primitives/gain-points";
import { cardMatchesFilter } from "../continuous/characteristics";
import type { AdditionalCost, CardFilter } from "../dsl/types";

/** A pending 1● event and a pending 2● 2✦ character. */
const pendingEvent: EngineCardDefinition = { ...SYNTHETIC.event1, id: syntheticId(904), status: "pending" };
const pendingCharacter: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(905), status: "pending" };
/** "Put the top card of your deck into your void", moving it with no event: a primitive with a presentation gap. */
const silentMill: EngineCardDefinition = {
  ...SYNTHETIC.event1,
  id: syntheticId(906),
  synthetic: {
    resolve: (ctx, item) => {
      const [top] = ctx.state.sides[item.controller].deck;
      if (top !== undefined) moveInstance(ctx, top, "void");
    },
  },
};
const engine = createEngine(testCatalog([...DSL_CARDS, pendingEvent, pendingCharacter, silentMill]));

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

describe("engine debug actions", () => {
  /** A lab whose card prompts for its mode when played. */
  const lab = (): BattleSlice => withHistory(cardLabBattle(engine, { entry: { cardId: DSL.chooseDrawOrPoints.id }, variant: "base", side: "player" }, []).slice);
  const apply = (slice: BattleSlice, op: DebugOp): BattleSlice => {
    const outcome = applyDebugOp(engine, slice, op);
    if (outcome.kind === "rejected") throw new Error(`${op.kind} rejected: ${outcome.reason}`);
    return outcome.slice;
  };
  const rejection = (slice: BattleSlice, op: unknown) => {
    const parsed = debugOpFromUnknown(op);
    if (parsed === null) return "malformed";
    const outcome = applyDebugOp(engine, slice, parsed);
    return outcome.kind === "rejected" ? outcome.reason : null;
  };

  it("sets energy and score, adds cards, and forces the next draw, each a new committed version", () => {
    let slice = apply(lab(), { kind: "setEnergy", side: "enemy", energy: 4 });
    slice = apply(slice, { kind: "addCard", side: "enemy", card: SYNTHETIC.vanilla2.id, zone: "play" });
    slice = apply(slice, { kind: "addCard", side: "player", card: DSL.drawTwo.id, zone: "deck" });
    slice = apply(slice, { kind: "forceDraw", side: "player", card: SYNTHETIC.vanilla1.id });
    const { sides, instances, version } = slice.committed;
    expect(sides.enemy.currentEnergy).toBe(4);
    expect(sides.enemy.backRank.filter((id) => id !== null)).toHaveLength(1);
    const top = sides.player.deck[0];
    expect(top === undefined ? undefined : instances[top]?.printing).toEqual({ kind: "card", cardId: SYNTHETIC.vanilla1.id });
    expect(version).toBe(lab().committed.version + 4);
    expect(slice.history?.entries).toHaveLength(4);
  });

  it("ends the battle when a score reaches the score to win", () => {
    const slice = apply(lab(), { kind: "setScore", side: "enemy", score: lab().committed.config.scoreToWin });
    expect(slice.committed.result).toEqual({ kind: "victory", winner: "enemy", reason: "score" });
    expect(rejection(slice, { kind: "setEnergy", side: "player", energy: 1 })).toBe("battleOver");
  });

  it("rejects malformed, impossible, and mid-step actions, changing nothing", () => {
    const slice = lab();
    expect(rejection(slice, { kind: "setEnergy", side: "player", energy: -1 })).toBe("malformed");
    expect(rejection(slice, { kind: "addCard", side: "player", card: syntheticId(999), zone: "hand" })).toBe("unknownCard");
    expect(rejection(slice, { kind: "addCard", side: "player", card: DSL.drawTwo.id, zone: "play" })).toBe("notACharacter");
    expect(rejection(slice, { kind: "forceDraw", side: "enemy", card: DSL.drawTwo.id })).toBe("notInDeck");
    expect(rejection(apply(slice, { kind: "addCard", side: "enemy", card: SYNTHETIC.vanilla2.id, zone: "play" }), { kind: "undo", keep: 9 })).toBe("noHistory");
    expect(rejection(lab(), { kind: "undo", keep: 0 })).toBe("noHistory");
    const [card] = slice.committed.sides.player.hand;
    if (card === undefined) throw new Error("no lab card");
    const playing = createFoldAdapter(engine).reduce(slice, { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    if (playing.kind !== "applied" || playing.slice.inFlight === null) throw new Error("the play did not suspend at its mode");
    expect(rejection(playing.slice, { kind: "setScore", side: "player", score: 1 })).toBe("stepInFlight");
  });

  it("undoes to an earlier intent by replaying the history, and continues above every attempt used", () => {
    const adapter = createFoldAdapter(engine);
    const start = lab();
    const [card] = start.committed.sides.player.hand;
    if (card === undefined) throw new Error("no lab card");
    const played = adapter.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    const mode = played.kind === "applied" ? adapter.pending(played.slice) : null;
    if (played.kind !== "applied" || mode === null) throw new Error("the play did not suspend at its mode");
    const answered = adapter.reduce(played.slice, { kind: "answer", side: "player", promptId: mode.prompt.id, value: 0 });
    if (answered.kind !== "applied") throw new Error("the mode answer bounced");
    const energized = apply(answered.slice, { kind: "mark" });
    expect(energized.history?.entries.map((entry) => Object.keys(entry)[0])).toEqual(["intent", "intent", "debug"]);

    const undone = apply(energized, { kind: "undo", keep: 0 });
    expect(undone.committed).toEqual(start.committed);
    expect(undone.inFlight).toBeNull();
    expect(undone.attempt).toBeGreaterThan(energized.attempt);
    // The undone play applies again, with prompt ids no earlier attempt used.
    const again = adapter.reduce(undone, { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    if (again.kind !== "applied") throw new Error("the replayed play bounced");
    expect(adapter.pending(again.slice)?.prompt.id).not.toBe(adapter.pending(played.slice)?.prompt.id);
    // A second undo replays through the first.
    expect(apply(again.slice, { kind: "undo", keep: 1 })).toMatchObject({ committed: start.committed, inFlight: null });
    // The same actions over the same slice fold identically, as a reload replays them.
    expect(apply(apply(start, { kind: "setEnergy", side: "player", energy: 2 }), { kind: "undo", keep: 0 })).toEqual(
      apply(apply(start, { kind: "setEnergy", side: "player", energy: 2 }), { kind: "undo", keep: 0 }),
    );
  });
});

describe("prompt lab", () => {
  const labEngine = createEngine(
    createCatalog(PROMPT_LAB_DEFINITIONS.cards, [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments),
  );
  const adapter = createFoldAdapter(labEngine);
  const stop = (name: string) => {
    const fixture = promptLabFixture(name);
    if (fixture === null) throw new Error(`no fixture ${name}`);
    const { slice } = promptLabBattle(labEngine, fixture);
    const pending = adapter.pending(slice);
    return {
      prompt: pending === null ? null : { kind: pending.prompt.kind, side: pending.prompt.side, privateTo: pending.prompt.privateTo },
      decision: slice.inFlight === null ? labEngine.decision(slice.committed) : null,
      legal: slice.inFlight === null ? labEngine.legalActions(slice.committed, "player").map((action) => action.kind) : [],
    };
  };

  it("keeps each lab card definition's UUID unique", () => {
    const ids = PROMPT_LAB_DEFINITIONS.cards.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds every fixture deterministically", () => {
    for (const fixture of PROMPT_LAB_FIXTURES) {
      expect(promptLabBattle(labEngine, fixture), fixture.name).toEqual(promptLabBattle(labEngine, fixture));
    }
  });

  it("stops each scripted fixture where its scene starts", () => {
    expect(stop("ai-discard").prompt).toEqual({ kind: "chooseCards", side: "enemy", privateTo: undefined });
    expect(stop("ai-foresee").prompt).toEqual({ kind: "arrange", side: "enemy", privateTo: "enemy" });
    expect(stop("prevent").prompt).toMatchObject({ kind: "payOrDecline", side: "player" });
    expect(stop("respond").decision).toEqual({ kind: "respond", side: "player" });
    expect(stop("loop").legal).toContain("repeatLoop");
    expect(stop("reclaim").legal).toEqual(expect.arrayContaining(["play", "activate"]));
  });

  it("publishes every event kind through the presentation steps but the Dreamwell draw and a bounded search", () => {
    const published = new Set(
      PROMPT_LAB_FIXTURES.flatMap((fixture) =>
        promptLabPresentation(labEngine, fixture).flatMap((step) => step.published.map((event) => event.kind)),
      ),
    );
    const missing = Object.keys(EVENT_DEFINITIONS).filter((kind) => !published.has(kind as keyof typeof EVENT_DEFINITIONS));
    expect(missing.sort()).toEqual(["dreamwellDrawn", "feasibilityBounded"]);
  });

  it("names every card each presentation step moves or changes in an event its engine step publishes", () => {
    for (const fixture of PROMPT_LAB_FIXTURES) {
      for (const step of promptLabPresentation(labEngine, fixture)) {
        expect(unannouncedChanges([...step.earlier, ...step.published], step.before, step.after), fixture.name).toEqual([]);
      }
    }
  });
});

describe("announced changes", () => {
  it("reports a card an effect moves with no event naming it", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [silentMill.id], energy: 1, deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id] },
      enemy: { deck: [SYNTHETIC.vanilla1.id] },
    });
    const card = ids.player.hand[0];
    const milled = ids.player.deck[0];
    if (card === undefined || milled === undefined) throw new Error("no lab cards");
    // The opponent cannot respond, so the play resolves in its own step.
    const played = engine.apply(state, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS);
    expect(played.state.instances[milled]?.zone).toBe("void");
    const problems = unannouncedChanges(played.events, state, played.state);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(milled);
  });
});

describe("pending entities play text-less", () => {
  it("resolves a pending event with no effect and reports pendingAbility when played and drawn", () => {
    const { state, events, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [pendingEvent.id], energy: 1, deck: [pendingEvent.id] }, enemy: { deck: [SYNTHETIC.vanilla1.id] } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player.void).toEqual([ids.player.hand[0]]);
    expect(events).toContainEqual(expect.objectContaining({ kind: "pendingAbility", reason: "played", cardId: pendingEvent.id }));
    // Pass until the player's next turn, whose Draw phase draws the pending card.
    let current = state;
    const later = [];
    while (!(current.turn.active === "player" && current.turn.phase === "day" && current.turn.turnNumber > state.turn.turnNumber)) {
      const decision = engine.decision(current);
      if (decision === null) throw new Error("no decision");
      const result = engine.apply(current, decision.side, { kind: "pass" }, NO_PROMPTS);
      later.push(...result.events);
      current = result.state;
    }
    expect(later).toContainEqual(expect.objectContaining({ kind: "pendingAbility", reason: "drawn", cardId: pendingEvent.id }));
  });

  it("plays a pending character with its printed cost and spark and no abilities", () => {
    const { state, ids, events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [pendingCharacter.id], energy: 2, deck: [SYNTHETIC.vanilla1.id] }, enemy: { deck: [SYNTHETIC.vanilla1.id] } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player.backRank[0]).toBe(ids.player.hand[0]);
    expect(state.sides.player.currentEnergy).toBe(0);
    expect(events.filter((event) => event.kind === "pendingAbility")).toHaveLength(1);
  });
});

describe("scenario-module runner", () => {
  const vanillas = [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id];
  /** Dissolving one of two enemy characters prompts for the target. */
  const dissolve = (answers?: ScenarioSpec["answers"]): ScenarioSpec => ({
    board: { active: "player", phase: "day", player: { hand: [DSL.dissolveEnemy.id], energy: 2, deck: vanillas }, enemy: { back: vanillas, deck: vanillas } },
    steps: (ids) => [playFromHand(ids, "player")],
    answers,
  });
  const scenario = (spec: ScenarioSpec, check: NamedScenario["check"] = () => undefined): NamedScenario => ({ name: "dissolve", spec, check });
  const second: ScenarioSpec["answers"] = (ids) => [[ids.enemy.back[1]!]];

  it("runs the spec, then the check on its result", () => {
    const check = vi.fn<NamedScenario["check"]>(({ state, ids }) => {
      expect(state.sides.enemy.backRank.filter((id) => id !== null)).toEqual([ids.enemy.back[0]]);
    });
    const result = runNamedScenario(engine, scenario(dissolve(second), check));
    expect(check).toHaveBeenCalledWith(result);
  });

  it("fails a scenario whose check fails", () => {
    const wrong = scenario(dissolve(second), ({ state }) => {
      expect(state.sides.enemy.backRank.filter((id) => id !== null)).toHaveLength(2);
    });
    expect(() => runNamedScenario(engine, wrong)).toThrow();
  });

  it("fails on a prompt with no scripted answer without running the check", () => {
    const check = vi.fn<NamedScenario["check"]>();
    expect(() => runNamedScenario(engine, scenario(dissolve(), check))).toThrow();
    expect(check).not.toHaveBeenCalled();
  });

  it("fails on scripted answers left over without running the check", () => {
    const check = vi.fn<NamedScenario["check"]>();
    const extra = dissolve((ids) => [[ids.enemy.back[1]!], [ids.enemy.back[0]!]]);
    expect(() => runNamedScenario(engine, scenario(extra, check))).toThrow();
    expect(check).not.toHaveBeenCalled();
  });

  it("reports duplicate slugs, empty modules, and duplicate scenario names", () => {
    const spec = dissolve(second);
    const problems = scenarioRegistryProblems([
      { slug: "a", scenarios: [scenario(spec)] },
      { slug: "a", scenarios: [scenario(spec), scenario(spec)] },
      { slug: "b", scenarios: [] },
    ]);
    expect(problems).toHaveLength(3);
    expect(scenarioRegistryProblems([{ slug: "a", scenarios: [scenario(spec)] }, { slug: "b", scenarios: [scenario(spec)] }])).toEqual([]);
  });
});
