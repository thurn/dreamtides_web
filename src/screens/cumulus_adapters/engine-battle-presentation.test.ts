// The battle screen's presentation of engine events: the items each
// published batch becomes for the human, the queue that plays them, the
// visuals and statuses the screen model shows while they play, and the
// battle log built from what the human saw.
import { describe, expect, it, vi } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { PRESENTATION_OBSERVATION, PresentationQueue } from "../../battle/components/battle-presentation";
import { enqueuePresentation, EVENT_PRESENTATION, presentationItems, presentedAsItem, type PresentationItem } from "../../battle/components/presentation-items";
import { BATTLE } from "../../content/battle";
import { createEngine, type BattleState, type BattleView, type Engine, type EngineEvent, type EngineEventKind, type InstanceView } from "../../engine";
import type { Keyword } from "../../engine/dsl/types";
import { EVENT_DEFINITIONS, eventSeenBy } from "../../engine/events";
import { createCatalog } from "../../engine/catalog";
import { createFoldAdapter, type BattleIntent, type BattleSlice } from "../../engine/fold/slice";
import { boardState, type BoardSetup } from "../../engine/testing/board";
import { DSL } from "../../engine/testing/dsl-cards";
import { enemyCharacter, event as eventAbility, target } from "../../engine/dsl/builders";
import { atStartOfTurn, triggered } from "../../engine/dsl/triggers";
import { banishUntil, discard, draw } from "../../engine/effects/primitives";
import { SYNTHETIC, syntheticId } from "../../engine/testing/synthetic-cards";
import { LOOP } from "../../engine/testing/loop-cards";
import { STACK } from "../../engine/testing/stack-cards";
import { ZONE } from "../../engine/testing/zone-cards";
import { batchStates, foldAdapterFor } from "../../rules/battle/engine-battle";
import { fuzzEngineCatalog, fuzzInit, SYNTHETIC_FUZZ_POOL } from "../../engine/testing/fuzz";
import { LAB, PROMPT_LAB_DEFINITIONS, PROMPT_LAB_FIXTURES, promptLabFixture, promptLabPresentation } from "../../engine/testing/prompt-lab";
import { battleSeed, SIDES, type InstanceId } from "../../engine/state/ids";
import type { CommittedEvent } from "../../eventlog/local-log";
import type { GameEvent } from "../../eventlog/types";
import type { JourneyBattleFoldState } from "../../rules/battle/fold";
import { engineBattleLogText } from "../../runtime/battle-prompt-messages";
import { testEventActor } from "../../types/test-identities";
import {
  parseBattleId,
  parseDreamwellCardId,
  parsePresentationId as pid,
  parseSiteId,
} from "../../types/identifiers";
import {
  boardRewinds,
  expectForward,
  hiddenInformationLeaks,
  observationViolations,
  presentObserved,
  recordFuzzGame,
  replayObservedBatches,
  type ObservedBatch,
} from "./__test-helpers__/presentation-checks";
import { battleLogEntries, battleLogTurns, engineBattleLog } from "./engine-battle-log-view-model";
import {
  buildEngineBattleScreenModel,
  enginePrintedKeywords,
  engineStatuses,
  type EngineBattleScreenModel,
} from "./engine-battle-view-model";

const labEngine = createEngine(
  createCatalog(PROMPT_LAB_DEFINITIONS.cards, [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments),
);
const cards = createEngineCardModels({ definitions: [], cards: new Map(), figment: () => undefined });

/** Each presentation step of a lab fixture, with its items for `human` and the view of the board after it. */
function steps(name: string, human: "player" | "enemy" = "player") {
  const fixture = promptLabFixture(name);
  if (fixture === null) throw new Error(`no fixture ${name}`);
  return promptLabPresentation(labEngine, fixture).map((step, index) => {
    const batch = { key: pid(`${name}:${String(index)}`), state: step.after };
    return { ...step, batch, items: presentationItems(step.published, human, batch, step.before, () => null) };
  });
}

/** The human's screen of `state` while `visual` is presented (`null`: everything presented). */
function labModel(
  state: BattleState,
  visual: PresentationItem["visual"],
  extra: Partial<Parameters<typeof buildEngineBattleScreenModel>[0]> = {},
): EngineBattleScreenModel {
  return buildEngineBattleScreenModel({
    battleId: parseBattleId("battle-presentation-fixture"),
    human: "player",
    view: labEngine.view(state, "player"),
    legal: [],
    prompt: null,
    playing: null,
    decision: null,
    presented: visual === null,
    notice: null,
    cards,
    printedKeywords: enginePrintedKeywords(labEngine.catalog),
    avatars: { player: { avatar: null }, enemy: { avatar: null } },
    opponentName: "Fixture Opponent",
    essenceReward: 100,
    resultDismissed: false,
    visual: visual === null ? null : { key: pid("visual-key"), visual },
    ...extra,
  });
}

const boardIds = (model: EngineBattleScreenModel) =>
  [model.view.far, model.view.near].flatMap((side) => [
    ...side.backRank.flatMap((slot) => (slot.card === null ? [] : [slot.card.id])),
    ...side.frontRank.flatMap((slot) => (slot.card === null ? [] : [slot.card.id])),
    ...side.voidCards.map((card) => card.id),
  ]);

let queueState: BattleState | null = null;
/** A bare queue item; every item shares one batch state, which the queue never reads. */
function queueItem(
  key: string,
  presentation: PresentationItem["presentation"],
  notice: PresentationItem["notice"] = null,
  dwellMs: number = BATTLE.presentation.eventDwellMs,
): PresentationItem {
  queueState ??= steps("present-zones")[0]?.after ?? null;
  if (queueState === null) throw new Error("no step");
  return { key: pid(key), presentation, dwellMs, visual: null, notice, batch: { key: pid(key), state: queueState } };
}


/** A live presentation feed over a synthetic board, using the same shared adapter and observation as the screen. */
function observedBoard(setup: BoardSetup, engine: Engine = labEngine) {
  const { state, ids } = boardState(engine.catalog, setup);
  const adapter = foldAdapterFor(engine);
  let slice: BattleSlice = { committed: state, inFlight: null, attempt: 0, publishedEvents: 0 };
  const apply = (intent: BattleIntent) => {
    const before = slice;
    const outcome = adapter.reduce(slice, intent, PRESENTATION_OBSERVATION);
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("fixture intent failed");
    slice = outcome.slice;
    const states = batchStates(adapter, before, slice, outcome.published);
    const batch = { key: pid(`observed:${String(slice.attempt)}`), state: states.state };
    return {
      ...states,
      events: outcome.published,
      items: presentationItems(outcome.published, "player", batch, states.before, () => null, states.eventStates),
      batch,
    };
  };
  /** Passes for whichever side decides until a batch publishes `kind`; that batch. */
  const passUntil = (kind: EngineEvent["kind"]) => {
    for (let passes = 0; passes < 40; passes += 1) {
      const side = engine.decision(slice.committed)?.side;
      if (side === undefined) break;
      const applied = apply({ kind: "battleAction", side, action: { kind: "pass" } });
      if (applied.events.some((event) => event.kind === kind)) return applied;
    }
    throw new Error(`no batch publishes ${kind}`);
  };
  return { ids, adapter, apply, passUntil, slice: () => slice };
}

/** The step of the discover lab fixture that publishes its `cardDiscovered`, and the event's index in it. */
function discovery(human: "player" | "enemy") {
  for (const step of steps("discover", human)) {
    const index = step.published.findIndex((event) => event.kind === "cardDiscovered");
    const event = step.published[index];
    if (event?.kind === "cardDiscovered" && event.instance !== null) return { step, index, instance: event.instance };
  }
  throw new Error("no discovery");
}

/** The step of the foresee lab fixture that publishes its `foresaw`, the event's index in it, and the cards it kept and voided. */
function foresight(human: "player" | "enemy") {
  for (const step of steps("foresee", human)) {
    const index = step.published.findIndex((event) => event.kind === "foresaw");
    const event = step.published[index];
    if (event?.kind === "foresaw") return { step, index, kept: event.kept, voided: event.voided };
  }
  throw new Error("no foresee");
}

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

  it("reveals the opponent's play over the board before it, then holds the card off the board after it until it travels", () => {
    const [registered] = steps("present-opponent");
    const reveal = registered?.items[0];
    if (registered === undefined || reveal?.visual?.kind !== "reveal") throw new Error("no reveal");
    const played = registered.published.find((event) => event.kind === "cardPlayed");

    expect(reveal.presentation).toBe("reveal");
    expect(reveal.visual.instance).toBe(played?.kind === "cardPlayed" ? played.instance : null);
    expect(reveal.batch.state).toBe(registered.before);
    expect(reveal.batch.key).not.toBe(registered.batch.key);
    const revealedCard: InstanceView | null = labEngine.view(reveal.visual.after, "player").instances[reveal.visual.instance] ?? null;
    const during = labModel(registered.after, reveal.visual, { revealedCard });
    expect(during.view.playReveal?.card.id).toBe(reveal.visual.instance);
    expect(boardIds(during)).not.toContain(reveal.visual.instance);
    expect(boardIds(labModel(registered.after, null))).toContain(reveal.visual.instance);
  });

  it("travels the human's own play and never presents an event hidden from the human", () => {
    const [play, answer] = steps("present-zones");
    const dissolve = [...(play?.items ?? []), ...(answer?.items ?? [])];
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const draws = challenge.published.filter((event) => event.kind === "cardDrawn" && event.side === "enemy");
    const enemyBatch = { key: pid("draws"), state: challenge.after };

    expect(dissolve.some((item) => item.presentation === "reveal")).toBe(false);
    expect(dissolve[0]?.presentation).toBe("travel");
    expect(draws.length).toBeGreaterThan(0);
    expect(presentationItems(draws, "player", enemyBatch, challenge.before, () => null)).toEqual([]);
    expect(presentationItems(draws, "enemy", enemyBatch, challenge.before, () => null).length).toBe(draws.length);
  });

  it("scores a challenger in the turn it happens, then announces the new turn", () => {
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const scoreAt = challenge.items.findIndex((item) => item.presentation === "score");
    const turnAt = challenge.items.findIndex((item) => item.presentation === "turn");
    const score = challenge.items[scoreAt];
    const turn = challenge.items[turnAt];
    if (score?.visual?.kind !== "score" || turn === undefined) throw new Error("no score or turn");
    const during = labModel(score.batch.state, score.visual);

    expect(scoreAt).toBeLessThan(turnAt);
    expect(challenge.before.turn.active).toBe("player");
    expect(challenge.after.turn.active).toBe("enemy");
    expect(score.batch.key).not.toBe(challenge.batch.key);
    expect(during.view.activeSide).toBe("player");
    expect(during.cardOverlay).toMatchObject({ kind: "points-scored", battleCardId: score.visual.instance, points: score.visual.points });
    expect(turn.batch).toBe(challenge.batch);
    expect(labModel(turn.batch.state, null).view.activeSide).toBe("enemy");
  });

  it("notices the human's automatic answers and a trigger with no legal target, and never the opponent's", () => {
    const notices = (human: "player" | "enemy") =>
      steps("auto-target", human).flatMap((step) => step.items.flatMap((item) => (item.notice === null ? [] : [item.notice])));
    const noTarget = steps("present-zones")[1]?.items.find((item) => item.notice?.kind === "noLegalTarget");

    expect(notices("player")).toEqual([expect.objectContaining({ kind: "autoAnswered", prompt: "chooseTargets" })]);
    expect(notices("enemy")).toEqual([]);
    expect(noTarget?.presentation).toBe("notice");
  });

  it("shows a Dreamwell card beside its side while its reveal is presented", () => {
    const [first] = steps("present-zones");
    if (first === undefined) throw new Error("no step");
    const card = parseDreamwellCardId("00000000-0000-4000-8000-00000000d001");
    const dreamwell = {
      cardId: card,
      displaySnapshot: { id: card, name: "Fixture Dreamwell", renderedText: "", energyAdded: 1, imageNumber: 1 },
    };
    const model = labModel(first.after, { kind: "dreamwell", side: "enemy", card }, {
      dreamwellCard: (requested) => (requested === card ? dreamwell : null),
    });

    expect(model.view.dreamwell).toEqual({ side: "enemy", model: dreamwell });
  });

  it("marks durations, keywords, disabled triggers, payable effects, and side statuses, and clears them as they end", () => {
    const status = steps("present-status");
    const played = status[status.length - 2];
    const ended = status[status.length - 1];
    const exiled = steps("present-zones")[5];
    const reclaim = steps("reclaim")[0];
    if (played === undefined || ended === undefined || exiled === undefined || reclaim === undefined) throw new Error("no steps");
    const kinds = (state: BattleState) => {
      const marks = engineStatuses(labEngine.view(state, "player"), "player", enginePrintedKeywords(labEngine.catalog));
      return {
        cards: [...new Set([...marks.cards.values()].flat().map((badge) => badge.kind))].sort(),
        player: marks.sides.player.map((badge) => badge.kind),
        enemy: marks.sides.enemy.map((badge) => badge.kind),
        labels: [...marks.cards.values(), marks.sides.player, marks.sides.enemy].flat().every((badge) => badge.label.length > 0),
      };
    };

    expect(kinds(played.after)).toMatchObject({
      cards: ["duration", "keyword", "payable", "triggersDisabled"],
      player: ["delayedTrigger"],
      labels: true,
    });
    expect(kinds(ended.after)).toMatchObject({ cards: ["duration", "payable"], player: [] });
    expect(kinds(exiled.after).enemy).toEqual(["returns"]);
    expect(kinds(reclaim.after).player).toEqual(["exhausted"]);
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

describe("presentation over seeded synthetic fuzz games", () => {
  it("moves every item's board forward, observes within the limit and only at presented events, and shows each viewer only what it may see", () => {
    const engine = createEngine(fuzzEngineCatalog(SYNTHETIC_FUZZ_POOL));
    const { maxObservedEventStates } = BATTLE.presentation;
    const problems: string[] = [];
    const check = (batch: ObservedBatch, key: string) => {
      problems.push(...observationViolations(batch, maxObservedEventStates).map((problem) => `${key}: ${problem}`));
      for (const viewer of SIDES) {
        const presented = presentObserved(batch, viewer, `${key}:${viewer}`);
        problems.push(...boardRewinds(presented), ...hiddenInformationLeaks(engine, viewer, batch, presented.items));
      }
    };
    let batches = 0;
    for (let index = 0; index < 12; index += 1) {
      const game = recordFuzzGame(engine, battleSeed(`presentation-forward-${String(index)}`), SYNTHETIC_FUZZ_POOL);
      expect(game.ended).toBe(true);
      replayObservedBatches(engine, game, (batch) => {
        batches += 1;
        check(batch, `game${String(index)}:${String(batches)}`);
      });
    }
    // The games' intents present a dozen events at most; a long loop's repetitions run past the per-intent limit.
    const fixture = observedBoard({ active: "player", phase: "day", player: { hand: [LOOP.bouncer.id], deck: [SYNTHETIC.vanilla1.id] } }, engine);
    fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand", slot: { rank: "back", index: 0 } } });
    const loop = fixture.slice().committed.loops.candidate;
    if (loop === null) throw new Error("no loop offer");
    const repeated = fixture.apply({ kind: "battleAction", side: "player", action: { kind: "repeatLoop", loop: loop.id, count: 40 } });
    check(repeated, "loop");

    expect(batches).toBeGreaterThan(12);
    expect(repeated.events.filter(presentedAsItem).length).toBeGreaterThan(maxObservedEventStates);
    expect(problems).toEqual([]);
  });
});

describe("presentation completeness", () => {
  /**
   * The event kinds the battle log never writes a line for, and why each is
   * shown another way or is bookkeeping. Every other kind must log a line.
   */
  const UNLOGGED: Readonly<Partial<Record<EngineEventKind, string>>> = {
    abilityResolved: "bookkeeping: the activation is logged",
    effectEnded: "its status badge clears",
    energyChanged: "the energy display changes",
    exhaustionChanged: "the card's exhausted pose changes",
    feasibilityBounded: "bookkeeping of the AI's search",
    leftPlay: "the move it pairs with is logged",
    leftVoid: "the move it pairs with is logged",
    pendingAbility: "bookkeeping of a text-less card",
    phaseChanged: "the phase indicator changes",
    promptAutoAnswered: "a notice shows it",
    resolved: "the card travels; its effects are logged",
    triggerQueued: "its resolution is logged",
  };
  /**
   * The kinds of event the human sees that log a line and that present an
   * item, across the prompt lab's presentation steps for both humans, and a
   * Dreamwell draw the lab cannot publish.
   */
  const seen = () => {
    const logged = new Set<EngineEventKind>();
    const presented = new Set<EngineEventKind>();
    const see = (events: readonly EngineEvent[], human: "player" | "enemy", state: BattleState, items: readonly PresentationItem[], key: string) => {
      events.forEach((event, index) => {
        const shown = eventSeenBy(event, human, state);
        if (shown === null) return;
        if (engineBattleLogText(shown, { human, card: () => null, dreamwell: () => null })) logged.add(event.kind);
        if (items.some((item) => item.key === `${key}:${String(index)}`)) presented.add(event.kind);
      });
    };
    for (const fixture of PROMPT_LAB_FIXTURES) {
      for (const human of SIDES) {
        for (const step of steps(fixture.name, human)) see(step.published, human, step.after, step.items, step.batch.key);
      }
    }
    const state = steps("present-zones")[0]?.after;
    if (state === undefined) throw new Error("no step");
    const dreamwell: EngineEvent = { kind: "dreamwellDrawn", side: "enemy", card: parseDreamwellCardId("00000000-0000-4000-8000-00000000d001"), energyAdded: 1 };
    const batch = { key: pid("dreamwell"), state };
    see([dreamwell], "player", state, presentationItems([dreamwell], "player", batch, state, () => null), batch.key);
    return { logged, presented };
  };
  const kinds = Object.keys(EVENT_DEFINITIONS) as EngineEventKind[];

  it("logs a line for every event kind but the reasoned unlogged ones", () => {
    const { logged } = seen();
    expect(kinds.filter((kind) => !logged.has(kind)).sort()).toEqual(Object.keys(UNLOGGED).sort());
  });

  it("presents an item for every event kind its presentation names one for", () => {
    const itemized = kinds.filter((kind) => EVENT_PRESENTATION[kind] !== "status" && EVENT_PRESENTATION[kind] !== "none");
    const { presented } = seen();
    expect(kinds.filter((kind) => presented.has(kind)).sort()).toEqual(itemized.sort());
  });

  /** A view of a lab board with its first player character changed by `change`, and that character. */
  const changedCharacter = (change: (instance: InstanceView) => InstanceView) => {
    const state = steps("present-status")[0]?.before;
    const id = state?.sides.player.backRank.find((entry) => entry !== null);
    if (state === undefined || id == null) throw new Error("no character");
    const view = labEngine.view(state, "player");
    const instance = view.instances[id];
    if (instance === undefined) throw new Error("no instance");
    const changed: BattleView = { ...view, instances: { ...view.instances, [id]: change(instance) } };
    return { view: changed, id };
  };
  const badgesOf = (view: BattleView, id: InstanceId) => engineStatuses(view, "player", () => []).cards.get(id) ?? [];

  it("badges every keyword a card has beyond its printed ones", () => {
    const keywords = Object.keys({
      vengeful: true,
      awakened: true,
      cannotBePrevented: true,
      cannotBeTargeted: true,
      veil: true,
      reclaim: true,
      offering: true,
    } satisfies Record<Keyword, true>) as Keyword[];
    const labels = keywords.map((keyword) => {
      const { view, id } = changedCharacter((instance) => ({ ...instance, characteristics: { ...instance.characteristics, keywords: [keyword] } }));
      const badges = badgesOf(view, id);
      expect({ keyword, kinds: badges.map((badge) => badge.kind) }).toEqual({ keyword, kinds: ["keyword"] });
      return badges[0]?.label ?? "";
    });
    expect(new Set(labels).size).toBe(keywords.length);
    expect(labels.every((label) => label.length > 0)).toBe(true);
  });

  it("badges every card status flag but exhaustion, which the card's own pose shows", () => {
    const { view: plain, id } = changedCharacter((instance) => instance);
    const flags = (Object.keys(plain.instances[id]?.status ?? {}) as (keyof InstanceView["status"])[]).filter(
      (flag) => typeof plain.instances[id]?.status[flag] === "boolean",
    );
    const badged = flags.filter((flag) => {
      const { view } = changedCharacter((instance) => ({ ...instance, status: { ...instance.status, [flag]: true } }));
      const badges = badgesOf(view, id);
      return badges.length > 0 && badges.every((badge) => badge.label.length > 0);
    });
    expect(badgesOf(plain, id)).toEqual([]);
    expect(flags.filter((flag) => !badged.includes(flag))).toEqual(["exhausted"]);
  });
});

describe("presentation queue", () => {
  it("keeps the head, every turn, Dreamwell card, and score, the newest notice of each kind and newest reveals, and drops the oldest travels past the backlog cap", () => {
    const { maxQueuedReveals, maxBacklogMs, eventDwellMs } = BATTLE.presentation;
    const keptTravels = Math.floor(maxBacklogMs / eventDwellMs);
    const reveals = Array.from({ length: maxQueuedReveals + 2 }, (_unused, index) => queueItem(`reveal${String(index)}`, "reveal"));
    const travels = Array.from({ length: keptTravels + 2 }, (_unused, index) => queueItem(`travel${String(index)}`, "travel"));
    const queue = enqueuePresentation(
      [
        queueItem("head", "travel"),
        queueItem("turn", "turn"),
        queueItem("dreamwell", "dreamwell"),
        queueItem("score", "score"),
        queueItem("older-notice", "notice", { kind: "capacityReached", missing: 1 }),
      ],
      [...reveals, ...travels, queueItem("newer-notice", "notice", { kind: "capacityReached", missing: 2 })],
    );
    const keys: string[] = queue.map((entry) => entry.key);
    const keysOf = (items: readonly PresentationItem[]): string[] => items.map((entry) => entry.key);

    expect(keys[0]).toBe("head");
    expect(keys).toEqual(expect.arrayContaining(["turn", "dreamwell", "score", "newer-notice"]));
    expect(keys).not.toContain("older-notice");
    expect(keys.filter((key) => key.startsWith("reveal"))).toEqual(keysOf(reveals.slice(-maxQueuedReveals)));
    expect(keys.filter((key) => key.startsWith("travel"))).toEqual(keysOf(travels.slice(-keptTravels)));
  });

  it("plays queued items in order, each for its dwell, raising each notice as it is presented", () => {
    vi.useFakeTimers();
    try {
      const queue = new PresentationQueue();
      const heads: (string | null)[] = [];
      queue.subscribe(() => heads.push(queue.snapshot().queue[0]?.key ?? null));
      queue.enqueue([queueItem("a", "travel", null, 100), queueItem("b", "notice", { kind: "capacityReached", missing: 1 }, 100)]);
      vi.advanceTimersByTime(50);
      queue.enqueue([queueItem("c", "travel", null, 100)]);
      vi.advanceTimersByTime(100);
      expect(queue.snapshot().notice?.key).toBe("b");
      vi.advanceTimersByTime(200);

      expect(heads.filter((key, index) => heads[index - 1] !== key)).toEqual(["a", "b", "c", null]);
      expect(queue.snapshot().queue).toEqual([]);
      queue.dismissNotice();
      expect(queue.snapshot().notice).toBeNull();
      queue.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("battle log", () => {
  it("groups a challenge and score in the ending turn, and the turn start and later events in the arriving turn", () => {
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const entries = battleLogEntries(
      challenge.published,
      "player",
      challenge.after,
      labEngine.view(challenge.after, "player"),
      labEngine.view(challenge.before, "player"),
      "turn-boundary",
    );
    const boundary = entries.findIndex((entry) => entry.event.kind === "turnStarted");
    expect(boundary).toBeGreaterThan(0);
    const ending = entries.slice(0, boundary);
    const arriving = entries.slice(boundary);
    expect(ending.some((entry) => entry.event.kind === "laneResolved")).toBe(true);
    expect(ending.some((entry) => entry.event.kind === "pointsScored")).toBe(true);
    expect(arriving.some((entry) => entry.event.kind === "turnStarted")).toBe(true);
    expect(arriving.some((entry) => entry.event.kind === "phaseChanged")).toBe(true);
    expect(ending.map(({ turnNumber, active }) => ({ turnNumber, active }))).toEqual(
      ending.map(() => ({ turnNumber: challenge.before.turn.turnNumber, active: challenge.before.turn.active })),
    );
    expect(arriving.map(({ turnNumber, active }) => ({ turnNumber, active }))).toEqual(
      arriving.map(() => ({ turnNumber: challenge.after.turn.turnNumber, active: challenge.after.turn.active })),
    );
    expect(battleLogTurns(entries, "player", cards, () => null).map((turn) => turn.turnNumber)).toEqual([
      challenge.before.turn.turnNumber,
      challenge.after.turn.turnNumber,
    ]);
  });

  it("writes a battle log line for what the human saw and none for what it could not see", () => {
    const entriesOf = (step: ReturnType<typeof steps>[number], key: string) =>
      battleLogEntries(
        step.published,
        "player",
        step.after,
        labEngine.view(step.after, "player"),
        labEngine.view(step.before, "player"),
        key,
      );
    const entries = steps("present-zones").flatMap((step, index) => entriesOf(step, `zones:${String(index)}`));
    const turns = battleLogTurns(entries, "player", cards, () => null);
    const lines = turns.flatMap((turn) => turn.lines);
    const logged = entries.filter(
      (entry) => engineBattleLogText(entry.event, { human: "player", card: () => null, dreamwell: () => null }) !== null,
    );
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const seenByPlayer = entriesOf(challenge, "c");

    expect(lines).toHaveLength(logged.length);
    expect(new Set(logged.map((entry) => entry.event.kind))).toEqual(
      new Set(["cardPlayed", "cardDrawn", "dissolved", "noLegalTarget", "banished", "effectStarted", "returnedToHand", "eroded", "cardCreated", "materialized", "controlChanged", "triggerResolved"]),
    );
    expect(lines.every((line) => line.text.length > 0)).toBe(true);
    expect(turns).toHaveLength(1);
    expect(seenByPlayer.some((entry) => entry.event.kind === "cardDrawn" && entry.event.side === "enemy")).toBe(false);
    expect(seenByPlayer.some((entry) => entry.event.kind === "laneResolved")).toBe(true);
  });

  it("names a discovered card in the discoverer's log entry and hides it from the opponent's", () => {
    const { step, instance } = discovery("player");
    const discovered = (human: "player" | "enemy") =>
      battleLogEntries(
        step.published,
        human,
        step.after,
        labEngine.view(step.after, human),
        labEngine.view(step.before, human),
        `discover:${human}`,
      ).filter((entry) => entry.event.kind === "cardDiscovered");
    const [mine] = discovered("player");
    const [theirs] = discovered("enemy");

    expect(mine?.event).toEqual({ kind: "cardDiscovered", side: "player", instance });
    expect(mine?.cards[instance]?.id).toBe(instance);
    expect(theirs?.event).toEqual({ kind: "cardDiscovered", side: "player", instance: null });
    expect(theirs?.cards).toEqual({});
  });

  it("logs a foresee for both sides, naming the kept card only in the foreseer's entry", () => {
    const { step, kept, voided } = foresight("player");
    const [keptCard] = kept;
    const [voidedCard] = voided;
    if (keptCard == null || voidedCard == null) throw new Error("expected one kept and one voided card");
    const foreseen = (human: "player" | "enemy") =>
      battleLogEntries(
        step.published,
        human,
        step.after,
        labEngine.view(step.after, human),
        labEngine.view(step.before, human),
        `foresee:${human}`,
      ).filter((entry) => entry.event.kind === "foresaw");
    const [mine] = foreseen("player");
    const [theirs] = foreseen("enemy");
    const line = (human: "player" | "enemy", event: EngineEvent | undefined) =>
      event === undefined ? null : engineBattleLogText(event, { human, card: (id) => id, dreamwell: () => null });

    expect(mine?.event).toEqual({ kind: "foresaw", side: "player", kept: [keptCard], voided: [voidedCard] });
    expect(Object.keys(mine?.cards ?? {}).sort()).toEqual([keptCard, voidedCard].sort());
    expect(theirs?.event).toEqual({ kind: "foresaw", side: "player", kept: [null], voided: [voidedCard] });
    expect(Object.keys(theirs?.cards ?? {})).toEqual([voidedCard]);
    expect(line("player", mine?.event)).not.toBeNull();
    expect(line("enemy", theirs?.event)).not.toBeNull();
  });

  describe("from the event log", () => {
    const siteId = parseSiteId("site-battle-log");
    const logEngine = () => createEngine(fuzzEngineCatalog(SYNTHETIC_FUZZ_POOL));

    /** A journey battle whose sides pass `passes` times, with the events that started and played it. */
    function passedBattle(engine: ReturnType<typeof logEngine>, passes: number) {
      const fold = createFoldAdapter(engine);
      const init = fuzzInit(battleSeed("battle-log"), SYNTHETIC_FUZZ_POOL);
      const events: CommittedEvent[] = [];
      const commit = (type: string, payload: Record<string, unknown>) => {
        const seq = events.length + 1;
        const event: GameEvent = {
          type: type as GameEvent["type"],
          payload,
          actor: testEventActor("p1"),
          clientTimestamp: "1970-01-01T00:00:00.000Z",
          basedOnSeq: seq - 1,
        };
        events.push({ seq, event });
      };
      commit("BEGIN_BATTLE", { siteId });
      const started = fold.start(init);
      if (started.kind !== "applied") throw new Error("not started");
      let slice = started.slice;
      for (let index = 0; index < passes; index++) {
        const side = engine.decision(slice.committed)?.side;
        if (side === undefined) break;
        commit("BATTLE_ACTION", { side, action: { kind: "pass" } });
        const outcome = fold.reduce(slice, { kind: "battleAction", side, action: { kind: "pass" } });
        if (outcome.kind === "applied") slice = outcome.slice;
      }
      const battle = {
        mode: { kind: "journey" },
        init: { siteId, battleId: parseBattleId("battle-log-fixture") },
        engine: { init, slice },
      } as unknown as JourneyBattleFoldState;
      return { battle, events };
    }

    it("shows the same entries after a reload, and never what the human could not see", () => {
      const engine = logEngine();
      const { battle, events } = passedBattle(engine, 12);
      const entries = engineBattleLog(engine, battle, events, "player")?.entries ?? [];
      const reloaded = engineBattleLog(
        logEngine(),
        JSON.parse(JSON.stringify(battle)) as JourneyBattleFoldState,
        JSON.parse(JSON.stringify(events)) as CommittedEvent[],
        "player",
      );
      const drawn = (side: "player" | "enemy") =>
        entries.some((entry) => entry.event.kind === "cardDrawn" && entry.event.side === side);

      expect(new Set(entries.map((entry) => entry.turnNumber)).size).toBeGreaterThan(2);
      expect(reloaded?.entries).toEqual(entries);
      expect(drawn("player")).toBe(true);
      expect(drawn("enemy")).toBe(false);
    });

    it("follows the fold as the event list grows, and is null for a list that does not reproduce it", () => {
      const engine = logEngine();
      const { battle, events } = passedBattle(engine, 12);
      const growing = events.slice(0, 6);
      const early = engineBattleLog(engine, battle, growing, "player");
      growing.push(...events.slice(6));

      expect(early).toBeNull();
      expect(engineBattleLog(engine, battle, growing, "player")?.entries).toEqual(
        engineBattleLog(engine, battle, events, "player")?.entries,
      );
    });
  });
});
