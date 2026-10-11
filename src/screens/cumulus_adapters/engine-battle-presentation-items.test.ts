// The presentation items each published batch becomes for the human: the
// board snapshot each item shows, the order cards travel in, and the
// authoritative outcome the observation leaves unchanged.
import { describe, expect, it, vi } from "vitest";
import {
  presentationItems,
  presentedAsItem,
  type PresentationItem,
} from "../../battle/components/presentation-items";
import { createEngine, type BattleState, type EngineEvent } from "../../engine";
import { createCatalog } from "../../engine/catalog";
import { createFoldAdapter, type BattleIntent, type BattleSlice } from "../../engine/fold/slice";
import { boardState } from "../../engine/testing/board";
import { DSL } from "../../engine/testing/dsl-cards";
import { enemyCharacter, event as eventAbility, target } from "../../engine/dsl/builders";
import { atStartOfTurn, triggered } from "../../engine/dsl/triggers";
import { banishUntil, discard, draw } from "../../engine/effects/primitives";
import { SYNTHETIC, syntheticId } from "../../engine/testing/synthetic-cards";
import { LOOP } from "../../engine/testing/loop-cards";
import { STACK } from "../../engine/testing/stack-cards";
import { ZONE } from "../../engine/testing/zone-cards";
import { batchStates } from "../../rules/battle/engine-battle";
import { LAB, PROMPT_LAB_DEFINITIONS, promptLabFixture } from "../../engine/testing/prompt-lab";
import { parsePresentationId as pid } from "../../types/identifiers";
import { expectForward } from "./__test-helpers__/presentation-checks";
import { discovery, foresight, labEngine, observedBoard } from "./engine-battle-presentation.fixtures";

describe("presentation items", () => {
  it("travels two draws one card at a time, without changing the authoritative outcome", () => {
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [DSL.drawTwo.id], energy: 2, deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id] } });
    const from = fixture.slice();
    const intent: BattleIntent = { kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand" } };
    const normal = createFoldAdapter(labEngine).reduce(from, intent);
    const shown = fixture.apply(intent);
    const drawn = fixture.ids.player.deck;
    const drawItems = shown.items.filter((item) => item.presentation === "travel" && item.batch.state.sides.player.hand.includes(drawn[0]));
    const first = drawItems[0];
    const second = drawItems[1];
    expect(first?.batch.state.sides.player.hand).toEqual([drawn[0]]);
    expect(second?.batch.state.sides.player.hand).toEqual(drawn);
    expect(first?.batch.state.instances[drawn[1]].zone).toBe("deck");
    expect(second?.batch.state.instances[drawn[1]].zone).toBe("hand");
    expect(first?.batch.key).not.toBe(second?.batch.key);
    expect(first?.batch.key).not.toBe(shown.batch.key);
    if (normal.kind !== "applied") throw new Error("normal fold failed");
    expect(fixture.slice()).toEqual(normal.slice);
    expect(shown.events).toEqual(normal.published);
    const hidden = presentationItems(shown.events, "enemy", shown.batch, shown.before, () => null, shown.eventStates);
    expect(hidden.every((item) => labEngine.view(item.batch.state, "enemy").sides.player.hand.known.length === 0)).toBe(true);
  });

  it("aligns snapshots with newly published events after a suspended draw/discard step is answered", () => {
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [LAB.drawTwoThenDiscard.id, SYNTHETIC.vanilla1.id], energy: 2, deck: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id] } });
    const first = fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand" } });
    expect(first.events.filter((event) => event.kind === "cardDrawn")).toHaveLength(2);
    const pending = fixture.adapter.pending(fixture.slice());
    if (pending === null) throw new Error("no discard prompt");
    const answered = fixture.apply({ kind: "answer", side: "player", promptId: pending.prompt.id, value: [fixture.ids.player.hand[1]] });
    expect(answered.events.some((event) => event.kind === "cardDrawn")).toBe(false);
    expect(answered.eventStates).toHaveLength(answered.events.length);
    const discardAt = answered.events.findIndex((event) => event.kind === "discarded");
    expect(discardAt).toBeGreaterThanOrEqual(0);
    expect(answered.eventStates[discardAt]?.sides.player.void).toContain(fixture.ids.player.hand[1]);
    expect(answered.eventStates[discardAt]?.sides.player.hand).not.toContain(fixture.ids.player.hand[1]);
    expect(first.eventStates[first.events.findIndex((event) => event.kind === "cardDrawn")]?.sides.player.hand).toEqual([fixture.ids.player.hand[1], fixture.ids.player.deck[0]]);
    // The card resolving through the prompt leaves the stack from the answer's first item.
    expect(first.state.instances[fixture.ids.player.hand[0]]?.zone).toBe("stack");
    expect(answered.items.length).toBeGreaterThan(0);
    expect(answered.items.map((item) => item.batch.state.instances[fixture.ids.player.hand[0]]?.zone)).toEqual(answered.items.map(() => "void"));
    expectForward(answered);
  });

  it("moves a card that resumes resolving off the stack from the answer's first item, though the bookkeeping of its void entry names it", () => {
    const discardOne = { ...LAB.drawTwoThenDiscard, id: syntheticId(0x5104), abilities: () => [eventAbility(discard(1))] };
    const engine = createEngine(createCatalog([...PROMPT_LAB_DEFINITIONS.cards, discardOne], [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments));
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [discardOne.id, SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id], energy: 2 } }, engine);
    const card = fixture.ids.player.hand[0];
    const first = fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    expect(first.state.instances[card]?.zone).toBe("stack");
    const pending = fixture.adapter.pending(fixture.slice());
    if (pending === null) throw new Error("no discard prompt");
    const answered = fixture.apply({ kind: "answer", side: "player", promptId: pending.prompt.id, value: [fixture.ids.player.hand[1]] });
    // The answer's events name the resolving card only in its void entry, which presents nothing.
    const naming = answered.events.filter((event) => Object.values(event).includes(card));
    expect(naming.map((event) => event.kind)).toEqual(["enteredVoid"]);
    expect(naming.every((event) => !presentedAsItem(event))).toBe(true);
    expect(answered.items.length).toBeGreaterThan(0);
    expect(answered.items.map((item) => item.batch.state.instances[card]?.zone)).toEqual(answered.items.map(() => "void"));
    expect(answered.items.every((item) => item.batch.state.stack.length === 0)).toBe(true);
    expectForward(answered);
  });

  it("travels multiple discards in their emitted order", () => {
    const doubleDiscard = { ...LAB.drawTwoThenDiscard, id: syntheticId(0x5101), abilities: () => [eventAbility(discard(2))] };
    const engine = createEngine(createCatalog([...PROMPT_LAB_DEFINITIONS.cards, doubleDiscard], [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments));
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [doubleDiscard.id, SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id], energy: 2 } }, engine);
    fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand" } });
    const pending = fixture.adapter.pending(fixture.slice());
    if (pending === null) throw new Error("no discard prompt");
    const discards = fixture.ids.player.hand.slice(1, 3);
    const answered = fixture.apply({ kind: "answer", side: "player", promptId: pending.prompt.id, value: discards });
    expect(answered.events.filter((event) => event.kind === "discarded")).toHaveLength(2);
    const items = answered.items.filter((item) => item.presentation === "travel");
    expect(items[0]?.batch.state.sides.player.hand).toEqual([discards[1], fixture.ids.player.hand[3]]);
    expect(items[0]?.batch.state.sides.player.void).toContain(discards[0]);
    expect(items[0]?.batch.state.sides.player.void).not.toContain(discards[1]);
    expect(items[1]?.batch.state.sides.player.hand).toEqual([fixture.ids.player.hand[3]]);
    expect(items[1]?.batch.state.sides.player.void).toEqual(expect.arrayContaining(discards));
  });

  it("retains event snapshots through adopted loop iterations", () => {
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [LOOP.bouncer.id], deck: [SYNTHETIC.vanilla1.id] } });
    fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand", slot: { rank: "back", index: 0 } } });
    const loop = fixture.slice().committed.loops.candidate;
    if (loop === null) throw new Error("no loop offer");
    const repeated = fixture.apply({ kind: "battleAction", side: "player", action: { kind: "repeatLoop", loop: loop.id, count: 2 } });
    const returned = repeated.events.flatMap((event, index) => event.kind === "returnedToHand" ? [repeated.eventStates[index]] : []);
    expect(returned.map((state) => state?.sides.player.score)).toEqual([2, 3]);
    expect(returned.every((state) => state?.sides.player.hand.includes(fixture.ids.player.hand[0]))).toBe(true);
  });

  it("travels a resolving event card off the stack as it resolves, before its draws", () => {
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [DSL.drawTwo.id], energy: 2, deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id] } });
    const card = fixture.ids.player.hand[0];
    const shown = fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    const resolvedAt = shown.events.findIndex((event) => event.kind === "resolved");
    const resolved = shown.items.find((item) => item.key === `${shown.batch.key}:${String(resolvedAt)}`);
    const later = shown.items.slice(shown.items.indexOf(resolved ?? shown.items[0]));

    expect(resolved?.presentation).toBe("travel");
    expect(later.length).toBeGreaterThan(2);
    expect(later.map((item) => item.batch.state.instances[card]?.zone)).toEqual(later.map(() => "void"));
    expect(later.every((item) => item.batch.state.stack.length === 0)).toBe(true);
    expect(resolved?.batch.state.sides.player.hand).toEqual([]);
    expectForward(shown);
  });

  it("shows a created hand copy in its hand from its own item", () => {
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [ZONE.handEcho.id], back: [SYNTHETIC.vanilla1.id], energy: 2, deck: [SYNTHETIC.vanilla2.id] }, enemy: { deck: [SYNTHETIC.vanilla1.id] } });
    const created = fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand" } });
    const at = created.events.findIndex((event) => event.kind === "cardCreated");
    const event = created.events[at];
    if (event?.kind !== "cardCreated") throw new Error("no created copy");
    const item = created.items.find((entry) => entry.key === `${created.batch.key}:${String(at)}`);

    // The rules announce the copy before listing it in the hand.
    expect(created.eventStates[at]?.sides.player.hand).not.toContain(event.instance);
    expect(item?.presentation).toBe("travel");
    expect(item?.batch.state.sides.player.hand).toEqual([event.instance]);
    expect(item?.batch.state.instances[event.instance]?.zone).toBe("hand");
    expectForward(created);
  });

  it("shows a created stack copy on the stack from its own item, and gone from the item that prevents it", () => {
    const fixture = observedBoard({
      active: "player",
      phase: "day",
      player: { hand: [DSL.drawTwo.id], back: [ZONE.echo.id], energy: 4, deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id] },
      enemy: { hand: [STACK.preventEvent.id], energy: 2, deck: [SYNTHETIC.vanilla1.id] },
    });
    const original = fixture.ids.player.hand[0];
    const copied = fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: original, from: "hand" } });
    const createdAt = copied.events.findIndex((event) => event.kind === "cardCreated");
    const created = copied.events[createdAt];
    if (created?.kind !== "cardCreated") throw new Error("no stack copy");
    const copy = created.instance;
    const createdItem = copied.items.find((entry) => entry.key === `${copied.batch.key}:${String(createdAt)}`);
    const stackCards = (state: BattleState | undefined) => state?.stack.flatMap((entry) => (entry.kind === "card" ? [entry.instance] : []));

    // The rules announce the copy before listing it on the stack.
    expect(stackCards(copied.eventStates[createdAt])).toEqual([original]);
    expect(stackCards(createdItem?.batch.state)).toEqual([original, copy]);
    expectForward(copied);

    fixture.apply({ kind: "battleAction", side: "enemy", action: { kind: "play", card: fixture.ids.enemy.hand[0], from: "hand" } });
    const pending = fixture.adapter.pending(fixture.slice());
    if (pending === null) throw new Error("no prevent target prompt");
    // The player has no response, so the prevent resolves in the answer's batch.
    const prevented = fixture.apply({ kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [copy] });
    const preventedAt = prevented.events.findIndex((event) => event.kind === "prevented");
    const preventedItem = prevented.items.find((entry) => entry.key === `${prevented.batch.key}:${String(preventedAt)}`);

    expect(prevented.events[preventedAt]).toMatchObject({ instance: copy, to: null });
    // The rules announce the prevented copy while it is still on the stack.
    expect(stackCards(prevented.eventStates[preventedAt])).toContain(copy);
    expect(preventedItem?.presentation).toBe("travel");
    expect(preventedItem?.batch.state.instances[copy]).toBeUndefined();
    expect(stackCards(preventedItem?.batch.state)).not.toContain(copy);
    expectForward(prevented);
  });

  it("shows an abandoned figment gone from the item that abandons it", () => {
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [ZONE.twoWarriors.id], back: [STACK.abandonToDraw.id], energy: 10, deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id] }, enemy: { deck: [SYNTHETIC.vanilla1.id] } });
    const materialized = fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand" } });
    const createdAt = materialized.events.findIndex((event) => event.kind === "cardCreated");
    const created = materialized.events[createdAt];
    if (created?.kind !== "cardCreated") throw new Error("no figment");
    const figment = created.instance;
    const createdItem = materialized.items.find((entry) => entry.key === `${materialized.batch.key}:${String(createdAt)}`);
    expect(createdItem?.batch.state.sides.player.backRank).toContain(figment);
    expectForward(materialized);

    const source = fixture.ids.player.back[0];
    if (source === null || source === undefined) throw new Error("no abandon source");
    fixture.apply({ kind: "battleAction", side: "player", action: { kind: "activate", source, ability: 0 } });
    const pending = fixture.adapter.pending(fixture.slice());
    if (pending === null) throw new Error("no abandon prompt");
    const abandoned = fixture.apply({ kind: "answer", side: "player", promptId: pending.prompt.id, value: [figment] });
    const abandonedAt = abandoned.events.findIndex((event) => event.kind === "abandoned");
    const item = abandoned.items.find((entry) => entry.key === `${abandoned.batch.key}:${String(abandonedAt)}`);

    expect(abandoned.events[abandonedAt]).toMatchObject({ instance: figment });
    // The rules announce the abandoned figment while it is still in play.
    expect(abandoned.eventStates[abandonedAt]?.sides.player.backRank).toContain(figment);
    expect(item?.presentation).toBe("travel");
    expect(item?.batch.state.sides.player.backRank).not.toContain(figment);
    expect(item?.batch.state.instances[figment]).toBeUndefined();
    expectForward(abandoned);
  });

  it("presents a scoring lane, then a dissolving tie, then the next turn's start-of-turn trigger and draw, never stepping back", () => {
    const turnDraw = { ...SYNTHETIC.vanilla1, id: syntheticId(0x5102), status: "authored" as const, abilities: () => [triggered(atStartOfTurn(), draw(1))] };
    const engine = createEngine(createCatalog([...PROMPT_LAB_DEFINITIONS.cards, turnDraw], [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments));
    const fixture = observedBoard({
      active: "player",
      phase: "day",
      player: { front: [SYNTHETIC.vanilla3.id, SYNTHETIC.vanilla1.id], deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla1.id] },
      enemy: { front: [null, SYNTHETIC.vanilla1.id], back: [turnDraw.id], deck: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id] },
    }, engine);
    const challenge = fixture.passUntil("laneResolved");
    const kinds = challenge.events.map((event) => event.kind);
    const lanes = challenge.events.flatMap((event) => (event.kind === "laneResolved" ? [event.scored] : []));
    const turnAt = kinds.indexOf("turnStarted");
    const ending = challenge.items.filter((item) => Number(item.key.split(":").pop()) < turnAt);

    expect(lanes).toEqual([3, 0]);
    expect(kinds.filter((kind) => kind === "dissolved")).toHaveLength(2);
    expect(turnAt).toBeGreaterThan(kinds.lastIndexOf("dissolved"));
    expect(kinds.filter((kind, index) => kind === "cardDrawn" && index > turnAt)).toHaveLength(2);
    expect(ending.length).toBeGreaterThan(2);
    expect(ending.map((item) => item.batch.state.turn.active)).toEqual(ending.map(() => challenge.before.turn.active));
    expectForward(challenge);
  });

  it("presents an automatic answer's notice before the play it answered travels", () => {
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [DSL.dissolveEnemy.id], energy: 4, deck: [SYNTHETIC.vanilla1.id] }, enemy: { back: [SYNTHETIC.vanilla2.id], deck: [SYNTHETIC.vanilla1.id] } });
    const shown = fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand" } });
    const presentations = shown.items.map((item) => item.presentation);

    expect(presentations[0]).toBe("notice");
    expect(presentations.slice(1).filter((presentation) => presentation === "travel").length).toBeGreaterThan(1);
    expect(shown.items[0]?.batch.state.instances[fixture.ids.player.hand[0]]?.zone).toBe("hand");
    expectForward(shown);
  });

  it("keeps a card returning as the next turn begins in the ending turn until the turn is announced", () => {
    const exileUntilNextTurn = { ...DSL.dissolveEnemy, id: syntheticId(0x5103), abilities: () => [eventAbility(banishUntil(target(enemyCharacter()), "untilYourNextTurn"))] };
    const engine = createEngine(createCatalog([...PROMPT_LAB_DEFINITIONS.cards, exileUntilNextTurn], [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments));
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [exileUntilNextTurn.id], energy: 4, deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla1.id] }, enemy: { back: [SYNTHETIC.vanilla2.id], deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla1.id] } }, engine);
    fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand" } });
    expect(fixture.slice().committed.instances[fixture.ids.enemy.back[0] ?? fixture.ids.player.hand[0]]?.zone).toBe("banished");
    fixture.passUntil("turnStarted");
    const returning = fixture.passUntil("turnStarted");
    const turnAt = returning.events.findIndex((event) => event.kind === "turnStarted");
    const materializedAt = returning.events.findIndex((event) => event.kind === "materialized");
    const materialized = returning.items.find((item) => item.key === `${returning.batch.key}:${String(materializedAt)}`);

    expect(materializedAt).toBeGreaterThanOrEqual(0);
    expect(materializedAt).toBeLessThan(turnAt);
    expect(returning.eventStates[materializedAt]?.turn.active).toBe("player");
    expect(materialized?.batch.state.turn).toMatchObject({ active: returning.before.turn.active, turnNumber: returning.before.turn.turnNumber });
    expectForward(returning);
  });

  it("falls back through the batch's turn boundary for events the presentation did not observe", () => {
    const fixture = promptLabFixture("present-challenge");
    if (fixture === null) throw new Error("no fixture");
    const { state, ids } = boardState(labEngine.catalog, fixture.setup);
    const adapter = createFoldAdapter(labEngine);
    let slice: BattleSlice = { committed: state, inFlight: null, attempt: 0, publishedEvents: 0 };
    const reposition: BattleIntent = { kind: "battleAction", side: "player", action: { kind: "reposition", card: ids.player.back[2] ?? ids.player.front[0] ?? ids.enemy.front[0] ?? ids.player.deck[0], to: { rank: "front", index: 2 } } };
    const intents: BattleIntent[] = [reposition];
    for (let passes = 0; passes < 40; passes += 1) {
      const intent = intents.shift() ?? { kind: "battleAction", side: labEngine.decision(slice.committed)?.side ?? "player", action: { kind: "pass" } };
      const from = slice;
      const outcome = adapter.reduce(slice, intent);
      if (outcome.kind !== "applied") throw new Error("fixture intent failed");
      slice = outcome.slice;
      const turnAt = outcome.published.findIndex((event) => event.kind === "turnStarted");
      if (turnAt < 0) continue;
      const states = batchStates(adapter, from, slice, outcome.published);
      const batch = { key: pid("unobserved"), state: states.state };
      const items = presentationItems(outcome.published, "player", batch, states.before, () => null, states.eventStates);
      const at = (item: PresentationItem) => Number(item.key.split(":").pop());

      expect(states.eventStates).toEqual(outcome.published.map(() => undefined));
      expect(items.some((item) => at(item) < turnAt)).toBe(true);
      expect(items.filter((item) => at(item) < turnAt).every((item) => item.batch.state.turn === states.before.turn)).toBe(true);
      expect(items.filter((item) => at(item) >= turnAt).every((item) => item.batch === batch)).toBe(true);
      return;
    }
    throw new Error("no new turn");
  });

  it("keeps observer errors and snapshot mutations outside the rules outcome", () => {
    const { state, ids } = boardState(labEngine.catalog, { active: "player", phase: "day", player: { hand: [DSL.drawTwo.id], energy: 2, deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id] } });
    const slice: BattleSlice = { committed: state, inFlight: null, attempt: 0, publishedEvents: 0 };
    const intent: BattleIntent = { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } };
    const presented = vi.fn((_event: EngineEvent): boolean => {
      throw new Error("synthetic observer failure");
    });
    const failing = createFoldAdapter(labEngine).reduce(slice, intent, { presented, limit: 64 });
    expect(presented).toHaveBeenCalled();
    const adapter = createFoldAdapter(labEngine);
    const observed = adapter.reduce(slice, intent, { presented: () => true, limit: 64 });
    if (observed.kind !== "applied") throw new Error("fixture intent failed");
    for (const event of observed.published) {
      const snapshot = adapter.observed(event);
      if (snapshot !== undefined) snapshot.sides.player.score = 999;
    }
    expect(failing).toEqual(createFoldAdapter(labEngine).reduce(slice, intent));
    expect(observed).toEqual(createFoldAdapter(labEngine).reduce(slice, intent));
  });

  it("travels a discovered card into its hand for both sides", () => {
    for (const human of ["player", "enemy"] as const) {
      const { step, index } = discovery(human);
      const item = step.items.find((entry) => entry.key === `${step.batch.key}:${String(index)}`);
      expect(item?.presentation).toBe("travel");
    }
  });

  it("travels a foresee's voided card for both sides", () => {
    for (const human of ["player", "enemy"] as const) {
      const { step, index } = foresight(human);
      const item = step.items.find((entry) => entry.key === `${step.batch.key}:${String(index)}`);
      expect(item?.presentation).toBe("travel");
    }
  });
});
