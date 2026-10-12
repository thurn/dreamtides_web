import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, anyCharacter, energy, event, target } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import { aiDecision, runPolicy } from "../../../policy/decide";
import { boardInit, entries, ITERATIONS_ONLY } from "../../../policy/policy.fixtures";
import type { ChooseCardsPrompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { type CardId, type InstanceId } from "../../../state/ids";
import type { BattleState, CardInstance } from "../../../state/types";
import { IllegalAnswer } from "../../../steps/errors";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, cardIdOf, type BoardSetup } from "../../../testing/board";
import { DSL, DSL_CARDS } from "../../../testing/dsl-cards";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { discover } from "../discover";
import { dissolve } from "../dissolve";
import { loseAllAbilities } from "../lose-all-abilities";
import { engine, v, deck, knowing, PickingSource } from "./cards-support";

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

describe("discover", () => {
  // Four characters and three events.
  const mixed = [v.event0.id, v.vanilla1.id, v.event1.id, v.vanilla2.id, v.vanilla3.id, v.event0.id, v.vanilla5.id];
  const board = (card: CardId, playerDeck: readonly CardId[]): BoardSetup => ({
    active: "player",
    phase: "day",
    player: { hand: [card], deck: playerDeck },
    enemy: { deck },
  });
  const play = (setup: BoardSetup, source: AnswerSource) => {
    const { state, ids } = boardState(engine.catalog, setup);
    return { start: state, ids, result: engine.apply(state, "player", playFromHand(ids, "player").action, source) };
  };
  const cardType = (state: BattleState, id: InstanceId) => engine.catalog.card(cardIdOf(state, id)).cardType;

  it("privately offers up to three matching cards of its controller's deck, puts the chosen one into hand, and shuffles the deck", () => {
    const source = new PickingSource((candidates) => [candidates[1]]);
    const { start, ids, result } = play(board(DSL.discoverCharacter.id, mixed), source);
    const [prompt] = source.prompts as ChooseCardsPrompt[];
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", privateTo: "player", min: 1, max: 1 });
    expect(prompt.purpose.role).toBe("discover");
    expect(new Set(prompt.candidates).size).toBe(3);
    for (const card of prompt.candidates) {
      expect(ids.player.deck).toContain(card);
      expect(cardType(start, card)).toBe("character");
    }
    const chosen = prompt.candidates[1];
    const { state } = result;
    expect(state.sides.player.hand).toEqual([chosen]);
    expect(state.instances[chosen]?.zone).toBe("hand");
    expect([...state.sides.player.deck].sort()).toEqual(ids.player.deck.filter((card) => card !== chosen).sort());
    expect(state.rng["random:discover"]).toBe(3);
    expect(state.rng["shuffle:player"] ?? 0).toBeGreaterThan(start.rng["shuffle:player"] ?? 0);
    // Nobody can place a card of the shuffled deck, the offered ones included.
    for (const side of ["player", "enemy"] as const) {
      expect(state.knownTo[side].filter((card) => state.sides.player.deck.includes(card))).toEqual([]);
    }
    expect(result.events.some((event) => event.kind === "cardDrawn")).toBe(false);
    // Both sides see the discovery; only the discoverer sees which card it was.
    const discovered = result.events.filter((event) => event.kind === "cardDiscovered");
    expect(discovered).toEqual([{ kind: "cardDiscovered", side: "player", instance: chosen }]);
    expect(eventSeenBy(discovered[0], "player", state)).toEqual(discovered[0]);
    expect(eventSeenBy(discovered[0], "enemy", state)).toEqual({ kind: "cardDiscovered", side: "player", instance: null });
  });

  it("offers every matching card when fewer match, answers a lone match itself, and does nothing with none", () => {
    const events = new PickingSource((candidates) => [candidates[0]]);
    const twoEvents = play(board(DSL.discoverEvent.id, [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.event1.id]), events);
    expect([...(events.prompts[0] as ChooseCardsPrompt).candidates].sort()).toEqual([twoEvents.ids.player.deck[1], twoEvents.ids.player.deck[3]].sort());

    const lone = play(board(DSL.discoverCharacter.id, [v.event0.id, v.vanilla1.id, v.event1.id]), new ScriptedSource([]));
    expect(lone.result.state.sides.player.hand).toEqual([lone.ids.player.deck[1]]);
    expect(lone.result.answers).toEqual([expect.objectContaining({ auto: true })]);

    const none = play(board(DSL.discoverCharacter.id, [v.event0.id, v.event1.id]), new ScriptedSource([]));
    expect(none.result.answers).toEqual([]);
    expect(none.result.events.some((event) => event.kind === "cardDiscovered")).toBe(false);
    expect(none.result.state.sides.player.hand).toEqual([]);
    expect(none.result.state.sides.player.deck).toEqual(none.ids.player.deck);
    expect(none.result.state.rng["random:discover"]).toBeUndefined();
    expect(none.result.state.rng["shuffle:player"]).toEqual(none.start.rng["shuffle:player"]);
  });

  it("hides the offer from the opponent and rejects an answer it did not offer without touching the state", () => {
    const { state: start, ids } = boardState(engine.catalog, board(DSL.discoverCharacter.id, mixed));
    const action = playFromHand(ids, "player").action;
    const before = stateHash(start);
    const offered = new PickingSource((candidates) => [candidates[0]]);
    engine.apply(start, "player", action, offered);
    const prompt = offered.prompts[0] as ChooseCardsPrompt;
    const characters = ids.player.deck.filter((card) => cardType(start, card) === "character");
    const unoffered = characters.find((card) => !prompt.candidates.includes(card))!;
    for (const answer of [[unoffered], [], prompt.candidates.slice(0, 2), [ids.player.deck[0]]]) {
      expect(() => engine.apply(start, "player", action, new ScriptedSource([answer]))).toThrow(IllegalAnswer);
    }
    expect(stateHash(start)).toBe(before);
  });

  it("offers as many cards as the saved battle's config says", () => {
    for (const discoverOptions of [2, 4]) {
      const { state, ids } = boardState(engine.catalog, board(DSL.discoverCharacter.id, mixed));
      const saved = JSON.parse(JSON.stringify({ ...state, config: { ...state.config, discoverOptions } })) as BattleState;
      const source = new PickingSource((candidates) => [candidates[0]]);
      engine.apply(saved, "player", playFromHand(ids, "player").action, source);
      expect((source.prompts[0] as ChooseCardsPrompt).candidates).toHaveLength(discoverOptions);
    }
  });
});

describe("discover across suspension", () => {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
    if (outcome.error !== null) throw new Error(outcome.error.message);
    return outcome.slice;
  };

  it("commits nothing while suspended, reloads to the same offer, bounces foreign and illegal answers, and resolves once answered", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.discoverCharacter.id], deck: [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id] },
      enemy: { deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const pending = fold.pending(suspended)!;
    expect(pending.prompt.purpose.role).toBe("discover");
    // Only the answer commits the step: the deck, hand, and random streams are untouched until then.
    expect(suspended.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(suspended.committed.sides.player.hand).toEqual([]);
    expect(suspended.committed.rng["random:discover"]).toBeUndefined();
    expect(suspended.committed.knownTo.player).toEqual([]);
    // The opponent learns that a choice is pending, never which cards it offers.
    expect((promptView(pending.prompt, "enemy", pending.display) as ChooseCardsPrompt).candidates).toEqual([]);

    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const again = fresh.pending(reloaded)!;
    expect(again.prompt.id).toBe(pending.prompt.id);
    const offered = (pending.prompt as ChooseCardsPrompt).candidates;
    expect((again.prompt as ChooseCardsPrompt).candidates).toEqual(offered);

    const unoffered = [ids.player.deck[0], ids.player.deck[2], ids.player.deck[3], ids.player.deck[4]].find((card) => !offered.includes(card))!;
    const answer = (side: "player" | "enemy", value: readonly InstanceId[]) =>
      fresh.reduce(reloaded, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("enemy", [offered[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", [unoffered])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", [])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", offered.slice(0, 2))).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });

    const done = applied(answer("player", [offered[2]]));
    expect(done.inFlight).toBeNull();
    expect(done.committed.sides.player.hand).toEqual([offered[2]]);
    expect(fresh.reduce(done, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [offered[2]] })).toMatchObject({ kind: "bounced" });
  });

  it("keeps only the offer's private knowledge and publishes nothing when the step fails after the answer is accepted", () => {
    const failingEngine = createEngine(testCatalog([...DSL_CARDS, discoverThenFail]));
    const records: EngineLogRecord[] = [];
    const failing = createFoldAdapter(failingEngine, { checkEventPrefix: true, log: (record) => records.push(record) });
    const { state, ids } = boardState(failingEngine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [discoverThenFail.id], deck: [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id] },
      enemy: { deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = applied(failing.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const pending = failing.pending(suspended)!;
    expect(pending.prompt.purpose.role).toBe("discover");
    const offered = (pending.prompt as ChooseCardsPrompt).candidates;
    const [chosen] = offered;
    const committed = JSON.parse(JSON.stringify(suspended.committed)) as BattleState;
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    records.length = 0;

    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [chosen] } as const;
    const outcome = failing.reduce(suspended, answer);
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/after its discovery/);
    // The chooser keeps knowing the offered cards where they still sit, in the unshuffled deck; nothing else the
    // accepted answer did (the card into hand, cardDiscovered, the shuffle, the knowledge reset) commits or publishes.
    expect(outcome.published).toEqual([]);
    expect(outcome.slice).toEqual({ committed: knowing(committed, "player", offered), inFlight: null, publishedEvents: 0, attempt: suspended.attempt });
    const after = outcome.slice.committed;
    expect(after.sides.player.hand).not.toContain(chosen);
    expect(after.sides.player.deck).toEqual(ids.player.deck);
    expect(after.rng).toEqual(committed.rng);
    expect(after.rng["random:discover"]).toBeUndefined();
    expect(view(after, "player", failingEngine.catalog).sides.player.deck.known.map((card) => card.id).sort()).toEqual([...offered].sort());
    expect(view(after, "enemy", failingEngine.catalog).sides.player.deck.known).toEqual([]);
    expect(records.map((record) => record.event)).toEqual(["engine.promptAnswered", "engine.error"]);
    expect(failing.pending(outcome.slice)).toBeNull();
    // A reload's replay of the same intents recovers the same state, which serializes like any other.
    const replayed = createFoldAdapter(failingEngine, { checkEventPrefix: true }).reduce(reloaded, answer);
    if (replayed.kind !== "applied") throw new Error("expected the replayed answer to apply");
    expect(stateHash(replayed.slice.committed)).toBe(stateHash(after));
    expect(deserializeState(serializeState(after))).toEqual(after);
  });
});

describe("a free Discover cost chosen after its source changed", () => {
  /** A character: "1●: Discover a character with the cost you choose." */
  const seeker: EngineCardDefinition = {
    ...v.vanilla1, id: syntheticId(0x5380), status: "authored",
    abilities: () => [activated([energy(1)], discover({ cardType: "character" }, { chooseCost: true }))],
  };
  /** A 0● Interrupt: "A character loses all abilities." */
  const hush: EngineCardDefinition = {
    ...v.event0, id: syntheticId(0x5381), speed: "interrupt", status: "authored",
    abilities: () => [event(loseAllAbilities(target(anyCharacter())))],
  };
  /** A 0● Interrupt: "Dissolve a character." */
  const snuff: EngineCardDefinition = {
    ...v.event0, id: syntheticId(0x5382), speed: "interrupt", status: "authored",
    abilities: () => [event(dissolve(target(anyCharacter())))],
  };
  /** A 5● event: the deck's costliest card, which a character Discover cannot find. */
  const costlyEvent: EngineCardDefinition = { ...v.event1, id: syntheticId(0x5383), costs: [energy(5)] };
  const changing = createEngine(testCatalog([seeker, hush, snuff, costlyEvent]));
  const changingFold = createFoldAdapter(changing, { checkEventPrefix: true });
  const enemyDeck = [v.vanilla2.id, v.vanilla3.id, costlyEvent.id];

  it.each([
    ["loses all its abilities", hush, (instance: CardInstance) => instance.status.lostAbilities !== undefined],
    ["leaves play", snuff, (instance: CardInstance) => instance.zone === "void"],
  ] as const)("is answered by Greedy with a cost that finds a card when the source %s before the choice", (_, response, changed) => {
    const { state, ids } = boardState(changing.catalog, {
      active: "enemy", phase: "day",
      enemy: { back: [seeker.id], energy: 1, deck: enemyDeck },
      player: { hand: [response.id], deck },
    });
    const source = ids.enemy.back[0]!;
    const activatedState = changing.apply(state, "enemy", { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
    let slice: BattleSlice = { committed: activatedState, inFlight: null, publishedEvents: 0, attempt: 0 };
    // The player responds: its target is the only character, so the engine answers it.
    let intent: Parameters<typeof changingFold.reduce>[1] = { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action };
    for (let guard = 0; ; guard++) {
      const outcome = changingFold.reduce(slice, intent);
      if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("the response or a pass failed");
      slice = outcome.slice;
      if (changingFold.pending(slice) !== null) break;
      const decision = changing.decision(slice.committed);
      if (decision === null || guard > 10) throw new Error("the Discover never asked for its cost");
      intent = { kind: "battleAction", side: decision.side, action: { kind: "pass" } };
    }
    const pending = changingFold.pending(slice)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseNumber", side: "enemy", purpose: { source, role: "discoverCost" } });
    expect(changed(pending.display.instances[source])).toBe(true);
    const init = { ...boardInit, decks: { player: entries([response.id, ...deck]), enemy: entries([seeker.id, ...enemyDeck]) } };
    const decision = aiDecision({ engine: changing, init, slice, pending, side: "enemy", policy: "greedy", budgets: ITERATIONS_ONLY });
    if (decision?.kind !== "prompt") throw new Error("expected the enemy's cost choice");
    const { choice } = runPolicy(changing, decision.request);
    // The vanilla 3● character is the costliest card the Discover can find.
    expect(choice).toEqual({ kind: "answer", value: 3 });
    const answered = changingFold.reduce(slice, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: 3 });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    expect(answered.slice.committed.sides.enemy.hand).toEqual([ids.enemy.deck[1]]);
  });
});
