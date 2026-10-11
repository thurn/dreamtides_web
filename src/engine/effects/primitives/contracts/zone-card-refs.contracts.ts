import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { Answer, ChooseCardsPrompt, ChooseTargetsPrompt, Prompt } from "../../../prompts/types";
import { additionalCost, banishFromVoidCost, event, everyIn, fromVoid, thisCardIn, topOfDeck } from "../../../dsl/builders";
import { onDissolved, triggered } from "../../../dsl/triggers";
import { parseFigmentId } from "../../../state/ids";
import { materializeFigments } from "../materialize-figments";
import { instanceOrigin } from "../../../rules/activation";
import { banish as banishCard, instanceOf, moveInstance, moveToHand } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent as opponentOf, type CardId, type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, cardIdOf, type SideSetup } from "../../../testing/board";
import { DSL, DSL_CARDS } from "../../../testing/dsl-cards";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { createCopyInHand } from "../create-copy-in-hand";
import { discover } from "../discover";
import { sequence } from "../sequence";
import { v, deck } from "./cards-support";

/** Discovers a character, then throws: a step that fails after its Discover's answer was accepted. */
const discoverThenFail: EngineCardDefinition = {
  id: syntheticId(920),
  cardType: "event",
  costs: [],
  spark: null,
  subtype: "",
  speed: "standard",
  status: "authored",
  abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, discover({ cardType: "character" }), {
        source: item.instance,
        origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0,
        controller: item.controller,
        x: null,
        optionalPaid: [],
        choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its discovery");
    },
  },
};

/** Answers target and card prompts with `pick` over their candidates, recording every prompt. */
class ChoosingSource implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (candidates: readonly InstanceId[]) => readonly InstanceId[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind !== "chooseTargets" && prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    return this.pick(prompt.candidates);
  }
}

/** ❖❖ A synthetic response: banishes every card in the opponent's void. */
const sweepOpponentVoid: EngineCardDefinition = {
  ...v.interruptEvent,
  id: syntheticId(960),
  synthetic: {
    resolve(ctx, item) {
      for (const id of [...ctx.state.sides[opponentOf(item.controller)].void]) banishCard(ctx, id);
    },
  },
};

/** ❖❖ A synthetic response: each card in the opponent's void goes to its owner's hand and back into the void. */
const cycleOpponentVoid: EngineCardDefinition = {
  ...v.interruptEvent,
  id: syntheticId(961),
  synthetic: {
    resolve(ctx, item) {
      for (const id of [...ctx.state.sides[opponentOf(item.controller)].void]) {
        moveToHand(ctx, id, instanceOf(ctx.state, id).owner);
        moveInstance(ctx, id, "void");
      }
    },
  },
};

/** "To play this card, banish a card from your void. Add a copy of a card in your void to your hand." */
const banishToCopyVoidCard: EngineCardDefinition = {
  ...DSL.copyVoidCharacter,
  id: syntheticId(962),
  abilities: () => [additionalCost(banishFromVoidCost(1)), event(createCopyInHand(fromVoid()))],
};

/** "Add a copy of each card in the opponent's hand and of the top card of the opponent's deck to your hand." */
const copyOpponentHiddenCards: EngineCardDefinition = {
  ...DSL.copyVoidCharacter,
  id: syntheticId(963),
  abilities: () => [event(sequence(createCopyInHand(everyIn("hand", {}, { player: "opponent" })), createCopyInHand(topOfDeck(1, {}, "opponent"))))],
};

/** An event: "Add a copy of this card from your void to your hand", which names nothing while the event is on the stack. */
const copySelfFromVoid: EngineCardDefinition = {
  ...DSL.copyVoidCharacter,
  id: syntheticId(965),
  abilities: () => [event(createCopyInHand(thisCardIn("void")))],
};

/** Copies each card in its controller's void, then throws: a step that fails after its references resolved. */
const copyVoidThenFail: EngineCardDefinition = {
  ...discoverThenFail,
  id: syntheticId(964),
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, createCopyInHand(everyIn("void")), {
        source: item.instance,
        origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0,
        controller: item.controller,
        x: null,
        optionalPaid: [],
        choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its zone references resolved");
    },
  },
};

/** A triggered copy that fails after its resolution-time void choice and copy. */
const triggeredCopyVoidThenFail: EngineCardDefinition = {
  ...DSL.dissolvedCopiesVoidWarrior,
  id: syntheticId(966),
  abilities: () => [triggered(onDissolved(), sequence(
    createCopyInHand(fromVoid({ subtype: "Warrior" }, { another: true })),
    materializeFigments(parseFigmentId("5e5e5e5e-0000-4000-8000-000000000fff")),
  ))],
};

describe("zone card references", () => {
  const zoneEngine = createEngine(
    testCatalog([...DSL_CARDS, sweepOpponentVoid, cycleOpponentVoid, banishToCopyVoidCard, copyOpponentHiddenCards, copyVoidThenFail, copySelfFromVoid, triggeredCopyVoidThenFail]),
  );
  const printed = (state: BattleState, ids: readonly InstanceId[]) => ids.map((id) => cardIdOf(state, id));
  const playable = (state: BattleState, card: InstanceId) =>
    zoneEngine.legalActions(state, "player").some((action) => action.kind === "play" && action.card === card);
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
    if (outcome.error !== null) throw new Error(outcome.error.message);
    return outcome.slice;
  };

  it("chooses a void target as the card is played, among the matching targetable cards of the named void, and names it as it resolves", () => {
    const { state, ids } = boardState(zoneEngine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.copyVoidCharacter.id], energy: 1, void: [v.vanilla1.id, v.event0.id, DSL.untargetableCharacter.id, v.vanilla2.id], deck },
      enemy: { void: [v.vanilla3.id], deck },
    });
    const source = new ChoosingSource((candidates) => [candidates[1]]);
    const result = zoneEngine.apply(state, "player", playFromHand(ids, "player").action, source);
    const [prompt] = source.prompts as ChooseTargetsPrompt[];
    expect(source.prompts).toHaveLength(1);
    expect(prompt).toMatchObject({ kind: "chooseTargets", side: "player", min: 1, max: 1 });
    expect(prompt.purpose.role).toBe("target");
    expect(prompt.candidates).toEqual([ids.player.void[0], ids.player.void[3]]);
    // The copy is of the chosen card; the void itself is untouched.
    const [copy] = result.state.sides.player.hand;
    expect(printed(result.state, [copy])).toEqual([v.vanilla2.id]);
    expect(result.state.sides.player.void).toEqual([ids.player.hand[0], ...ids.player.void]);
    expect(result.events.some((event) => event.kind === "noLegalTarget")).toBe(false);
  });

  it("makes a play with no legal void target illegal, while an up-to target allows none", () => {
    const board = (hand: CardId, playerVoid: readonly CardId[], enemyVoid: readonly CardId[]) =>
      boardState(zoneEngine.catalog, {
        active: "player",
        phase: "day",
        player: { hand: [hand], energy: 1, void: playerVoid, deck },
        enemy: { void: enemyVoid, deck },
      });
    for (const playerVoid of [[], [v.event0.id], [DSL.untargetableCharacter.id]]) {
      const { state, ids } = board(DSL.copyVoidCharacter.id, playerVoid, [v.vanilla1.id]);
      expect(playable(state, ids.player.hand[0]), JSON.stringify(playerVoid)).toBe(false);
    }
    const empty = board(DSL.copyOpponentVoidCards.id, [v.vanilla1.id], []);
    expect(playable(empty.state, empty.ids.player.hand[0])).toBe(true);
    const none = zoneEngine.apply(empty.state, "player", playFromHand(empty.ids, "player").action, new ScriptedSource([[]]));
    expect(none.state.sides.player.hand).toEqual([]);
    expect(none.events.some((event) => event.kind === "noLegalTarget" || event.kind === "cardCreated")).toBe(false);

    const two = board(DSL.copyOpponentVoidCards.id, [], [v.vanilla1.id, v.event0.id, v.vanilla2.id]);
    const source = new ChoosingSource((candidates) => [candidates[2], candidates[0]]);
    const result = zoneEngine.apply(two.state, "player", playFromHand(two.ids, "player").action, source);
    expect(source.prompts[0]).toMatchObject({ kind: "chooseTargets", min: 0, max: 2, candidates: two.ids.enemy.void });
    // Resolution names the chosen cards in the order they were chosen, as character targets.
    expect(printed(result.state, result.state.sides.player.hand)).toEqual([v.vanilla2.id, v.vanilla1.id]);
  });

  it("skips a chosen void card that left the void before resolution and reports noLegalTarget, but keeps one that came back", () => {
    const respond = (response: EngineCardDefinition) => {
      const { state, ids } = boardState(zoneEngine.catalog, {
        active: "player",
        phase: "day",
        player: { hand: [DSL.copyVoidCharacter.id], energy: 1, void: [v.vanilla1.id], deck },
        enemy: { hand: [response.id], energy: 1, deck },
      });
      const played = zoneEngine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([]));
      expect(played.state.stack).toHaveLength(1);
      const responded = zoneEngine.apply(played.state, "enemy", playFromHand(ids, "enemy").action, NO_PROMPTS);
      const rest = passUntil(zoneEngine, responded.state, (next) => next.stack.length === 0);
      return { ids, state: rest.state, events: [...responded.events, ...rest.events] };
    };
    const swept = respond(sweepOpponentVoid);
    expect(swept.state.sides.player.banished).toEqual([swept.ids.player.void[0]]);
    expect(swept.state.sides.player.hand).toEqual([]);
    expect(swept.events.filter((event) => event.kind === "noLegalTarget")).toEqual([{ kind: "noLegalTarget", source: swept.ids.player.hand[0] }]);

    // Targeting follows the card's identity across zones (rules § Zone Changes).
    const cycled = respond(cycleOpponentVoid);
    expect(printed(cycled.state, cycled.state.sides.player.hand)).toEqual([v.vanilla1.id]);
    expect(cycled.events.some((event) => event.kind === "noLegalTarget")).toBe(false);
  });

  it("chooses a triggered ability's void target as it resolves, for its own controller's void, and does nothing without one", () => {
    const dissolve = (enemyVoid: readonly CardId[], source: AnswerSource) => {
      const { state, ids } = boardState(zoneEngine.catalog, {
        active: "player",
        phase: "day",
        player: { hand: [DSL.dissolveEnemy.id], energy: 2, void: [v.vanilla1.id], deck },
        enemy: { back: [DSL.dissolvedCopiesVoidWarrior.id], void: enemyVoid, deck },
      });
      return { ids, result: zoneEngine.apply(state, "player", playFromHand(ids, "player").action, source) };
    };
    const source = new ChoosingSource((candidates) => [candidates[candidates.length - 1]]);
    const { ids, result } = dissolve([v.vanilla1.id, v.event0.id, v.vanilla2.id], source);
    // The dissolve's lone target is answered automatically; then the enemy chooses among the warriors in its own void, the dissolved source excluded.
    expect(source.prompts).toHaveLength(1);
    expect(source.prompts[0]).toMatchObject({ kind: "chooseTargets", side: "enemy", min: 1, max: 1, candidates: [ids.enemy.void[0], ids.enemy.void[2]] });
    expect(result.state.sides.enemy.void).toContain(ids.enemy.back[0]);
    expect(printed(result.state, result.state.sides.enemy.hand)).toEqual([v.vanilla2.id]);
    expect(result.state.sides.player.hand).toEqual([]);

    const alone = dissolve([v.event0.id], new ChoosingSource((candidates) => [candidates[0]]));
    expect(alone.result.state.sides.enemy.hand).toEqual([]);
    expect(alone.result.events.filter((event) => event.kind === "noLegalTarget")).toEqual([{ kind: "noLegalTarget", source: alone.ids.enemy.back[0] }]);
  });

  it("names every matching card of a zone in order, the matching top cards of a deck, and the source only while it is in the zone", () => {
    const run = (hand: CardId, setup: SideSetup) =>
      runScenario(zoneEngine, {
        board: { active: "player", phase: "day", player: { ...setup, hand: [hand], energy: 1 }, enemy: { deck } },
        steps: (ids) => [playFromHand(ids, "player")],
      });
    const every = run(DSL.copyVoidEvents.id, { void: [v.event0.id, v.vanilla1.id, v.event1.id], deck });
    expect(printed(every.state, every.state.sides.player.hand)).toEqual([v.event0.id, v.event1.id]);

    const topCharacter = run(DSL.copyTopCharacter.id, { deck: [v.vanilla2.id, v.vanilla3.id] });
    expect(printed(topCharacter.state, topCharacter.state.sides.player.hand)).toEqual([v.vanilla2.id]);
    expect(topCharacter.state.sides.player.deck).toEqual(topCharacter.ids.player.deck);
    const topEvent = run(DSL.copyTopCharacter.id, { deck: [v.event0.id, v.vanilla3.id] });
    expect(topEvent.state.sides.player.hand).toEqual([]);
    const emptyDeck = run(DSL.copyTopCharacter.id, {});
    expect(emptyDeck.state.sides.player.hand).toEqual([]);
    expect(emptyDeck.state.sides.player.fatigueCount).toBe(emptyDeck.start.sides.player.fatigueCount);

    const dissolveSelf = (enemyCard: CardId) =>
      runScenario(zoneEngine, {
        board: { active: "player", phase: "day", player: { hand: [DSL.dissolveEnemy.id], energy: 2, deck }, enemy: { back: [enemyCard], deck } },
        steps: (ids) => [playFromHand(ids, "player")],
      });
    const itself = dissolveSelf(DSL.dissolvedCopiesItself.id);
    expect(printed(itself.state, itself.state.sides.enemy.hand)).toEqual([DSL.dissolvedCopiesItself.id]);
    expect(itself.state.sides.enemy.void).toEqual(itself.ids.enemy.back);
    const onStack = run(copySelfFromVoid.id, { void: [v.event0.id], deck });
    expect(onStack.state.sides.player.hand).toEqual([]);
  });

  it("never offers the void card chosen as a target to pay the same play's cost", () => {
    const { state, ids } = boardState(zoneEngine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [banishToCopyVoidCard.id], energy: 1, void: [v.vanilla1.id, v.vanilla2.id, v.event0.id], deck },
      enemy: { deck },
    });
    const source = new ChoosingSource((candidates) => [candidates[candidates.length - 1]]);
    const result = zoneEngine.apply(state, "player", playFromHand(ids, "player").action, source);
    const [target, cost] = source.prompts as ChooseCardsPrompt[];
    expect(target?.candidates).toEqual(ids.player.void);
    expect(cost).toMatchObject({ kind: "chooseCards", candidates: ids.player.void.slice(0, 2) });
    expect(cost?.purpose.role).toBe("banishCost");
    expect(result.state.sides.player.banished).toEqual([ids.player.void[1]]);
    expect(printed(result.state, result.state.sides.player.hand)).toEqual([v.event0.id]);

    const lone = boardState(zoneEngine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [banishToCopyVoidCard.id], energy: 1, void: [v.vanilla1.id], deck },
      enemy: { deck },
    });
    expect(playable(lone.state, lone.ids.player.hand[0])).toBe(false);
  });

  it("reveals no card a reference into a hand or deck names: no event names it and neither side learns it", () => {
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(zoneEngine, { checkEventPrefix: true, log: (record) => records.push(record) });
    const { state, ids } = boardState(zoneEngine.catalog, {
      active: "player", phase: "day",
      player: { hand: [copyOpponentHiddenCards.id], energy: 1, deck },
      enemy: { hand: [v.vanilla1.id, v.event0.id], deck: [v.vanilla3.id, v.vanilla5.id] },
    });
    const outcome = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, {
      kind: "battleAction", side: "player", action: playFromHand(ids, "player").action,
    });
    const result = { state: applied(outcome).committed, ids, events: outcome.kind === "applied" ? outcome.published : [] };
    const named = [...result.ids.enemy.hand, ...result.ids.enemy.deck];
    expect(printed(result.state, result.state.sides.player.hand)).toEqual([v.vanilla1.id, v.event0.id, v.vanilla3.id]);
    for (const side of ["player", "enemy"] as const) {
      expect(result.state.knownTo[side].filter((id) => named.includes(id)), side).toEqual([]);
    }
    const seen = view(result.state, "player", zoneEngine.catalog);
    expect(seen.sides.enemy.hand.known).toEqual([]);
    expect(seen.sides.enemy.deck.known).toEqual([]);
    for (const id of named) expect(seen.instances[id]).toBeUndefined();
    expect(JSON.stringify(result.events.map((event) => eventSeenBy(event, "player", result.state)))).not.toMatch(new RegExp(named.join("|")));
    expect(records.some((record) => record.event === "engine.action")).toBe(true);
    for (const record of records) {
      for (const id of named) expect(JSON.stringify(record)).not.toMatch(new RegExp(`\\b${id}\\b`));
    }
    // The copies are private to the hand that holds them.
    for (const event of result.events.filter((item) => item.kind === "cardCreated")) expect(eventSeenBy(event, "enemy", result.state)).toBeNull();
  });

  it("commits nothing while suspended at a void target, reloads to the same prompt, bounces foreign, stale, and illegal answers, and resolves once answered", () => {
    const fold = createFoldAdapter(zoneEngine, { checkEventPrefix: true });
    const { state, ids } = boardState(zoneEngine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.copyVoidCharacter.id], energy: 1, void: [v.vanilla1.id, v.event0.id, v.vanilla2.id], deck },
      enemy: { void: [v.vanilla3.id], deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const pending = fold.pending(suspended)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseTargets", candidates: [ids.player.void[0], ids.player.void[2]] });
    expect(pending.prompt.cancellable).toBe(true);
    expect(suspended.committed).toEqual(state);

    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(zoneEngine, { checkEventPrefix: true });
    const again = fresh.pending(reloaded)!;
    expect(again.prompt).toEqual(pending.prompt);
    const answer = (side: "player" | "enemy", value: readonly InstanceId[]) =>
      fresh.reduce(reloaded, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("enemy", [ids.player.void[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const illegal of [[ids.player.void[1]], [ids.enemy.void[0]], [], [ids.player.void[0], ids.player.void[2]]]) {
      expect(answer("player", illegal)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    const laterAttempt = { ...reloaded, attempt: reloaded.attempt + 1 };
    expect(fresh.reduce(laterAttempt, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.void[2]] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "player", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const cancelled = applied(fresh.reduce(reloaded, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled).toEqual({ ...start, attempt: reloaded.attempt + 1 });
    expect(stateHash(cancelled.committed)).toBe(stateHash(state));
    const retried = applied(fresh.reduce(cancelled, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    expect(fresh.pending(retried)?.prompt.id).not.toBe(pending.prompt.id);
    expect(fresh.reduce(retried, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.void[2]] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const done = applied(answer("player", [ids.player.void[2]]));
    expect(done.inFlight).toBeNull();
    expect(printed(done.committed, done.committed.sides.player.hand)).toEqual([v.vanilla2.id]);
    expect(fresh.reduce(done, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.void[2]] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  const suspendTriggeredVoidChoice = (source = DSL.dissolvedCopiesVoidWarrior) => {
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(zoneEngine, { checkEventPrefix: true, log: (record) => records.push(record) });
    const { state, ids } = boardState(zoneEngine.catalog, {
      active: "player", phase: "day",
      player: { hand: [DSL.dissolveEnemy.id], energy: 2, deck },
      enemy: { back: [source.id], void: [v.vanilla1.id, v.event0.id, v.vanilla2.id], deck },
    });
    const slice = applied(fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, {
      kind: "battleAction", side: "player", action: playFromHand(ids, "player").action,
    }));
    return { state, ids, slice, records, fold };
  };

  it("reloads the non-cancellable triggered void choice with its dissolve and trigger queue committed, rejecting foreign, stale, cancel and concurrent inputs", () => {
    const { ids, slice, fold, records } = suspendTriggeredVoidChoice();
    const pending = fold.pending(slice)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseTargets", side: "enemy", cancellable: false, candidates: [ids.enemy.void[0], ids.enemy.void[2]] });
    expect(slice.committed.sides.enemy.void).toContain(ids.enemy.back[0]);
    expect(slice.committed.triggerQueue).toHaveLength(1);
    expect(slice.committed.sides.player.void).toContain(ids.player.hand[0]);
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(zoneEngine, { checkEventPrefix: true, log: (record) => records.push(record) });
    expect(fresh.pending(saved)).toEqual(pending);
    const answer = { kind: "answer" as const, side: "enemy" as const, promptId: pending.prompt.id, value: [ids.enemy.void[2]] };
    expect(fresh.reduce(saved, { ...answer, side: "player" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, { kind: "cancel", side: "enemy", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(fresh.reduce(saved, { kind: "battleAction", side: "player", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const outcome = fresh.reduce(saved, answer);
    const done = applied(outcome);
    expect(done.inFlight).toBeNull();
    expect(done.committed.triggerQueue).toEqual([]);
    expect(printed(done.committed, done.committed.sides.enemy.hand)).toEqual([v.vanilla2.id]);
    expect(done.committed.sides.enemy.void).toEqual(saved.committed.sides.enemy.void);
    expect(fresh.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(records.filter((record) => record.event === "engine.trigger" && record.detail.kind === "triggerResolved")).toHaveLength(1);
    expect(invariantViolations(done.committed, zoneEngine.catalog)).toEqual([]);
  });

  it("rolls back a failed triggered resolution after its void answer while retaining the committed dissolve and queued trigger", () => {
    const { ids, slice, fold, records } = suspendTriggeredVoidChoice(triggeredCopyVoidThenFail);
    const pending = fold.pending(slice)!;
    const before = stateHash(slice.committed);
    const resolvedBefore = records.filter((record) => record.event === "engine.trigger" && record.detail.kind === "triggerResolved");
    const outcome = fold.reduce(JSON.parse(JSON.stringify(slice)) as BattleSlice, {
      kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [ids.enemy.void[2]],
    });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected a triggered resolution error");
    expect(outcome.error.message).toContain("5e5e5e5e-0000-4000-8000-000000000fff");
    expect(outcome.published).toEqual([]);
    expect(outcome.slice).toEqual({ ...slice, inFlight: null, publishedEvents: 0 });
    expect(stateHash(outcome.slice.committed)).toBe(before);
    expect(outcome.slice.committed.triggerQueue).toHaveLength(1);
    expect(outcome.slice.committed.sides.enemy.void).toContain(ids.enemy.back[0]);
    expect(outcome.slice.committed.sides.enemy.hand).toEqual([]);
    expect(records.filter((record) => record.event === "engine.error")).toHaveLength(1);
    expect(records.filter((record) => record.event === "engine.trigger" && record.detail.kind === "triggerResolved")).toEqual(resolvedBefore);
    expect(invariantViolations(outcome.slice.committed, zoneEngine.catalog)).toEqual([]);
  });

  it("commits and publishes nothing when the step fails after its references resolved", () => {
    const fold = createFoldAdapter(zoneEngine, { checkEventPrefix: true });
    const { state, ids } = boardState(zoneEngine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [copyVoidThenFail.id], void: [v.vanilla1.id, v.event0.id], deck },
      enemy: { deck },
    });
    const hash = stateHash(state);
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/after its zone references resolved/);
    // The play committed before resolution began; nothing the resolution did commits or publishes.
    expect(outcome.published.map((event) => event.kind)).toEqual(["cardPlayed"]);
    const committed = outcome.slice.committed;
    expect(committed.stack).toHaveLength(1);
    expect(committed.sides.player.hand).toEqual([]);
    expect(committed.sides.player.void).toEqual(ids.player.void);
    expect(Object.keys(committed.instances).sort()).toEqual(Object.keys(state.instances).sort());
    expect(stateHash(state)).toBe(hash);
  });
});
