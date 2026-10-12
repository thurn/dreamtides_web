import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { anyCharacter, event, everyIn, target } from "../../../dsl/builders";
import { onMaterialized, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { eventLogRecords, type EngineLogRecord } from "../../../log";
import type { Answer, Prompt } from "../../../prompts/types";
import { banish, ceaseToExist, instanceOf, moveToHand } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, DeckEntry } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, type BoardSetup } from "../../../testing/board";
import { CHOSEN_HAND_BANISH_CARDS, HAND_BANISH as H } from "../../../testing/chosen-hand-banish-cards";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations, promptRedactionViolations, strings } from "../../../testing/redaction";
import { SYNTHETIC as V, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { promptView } from "../../../view/view";
import { banishChosen } from "../banish-cards";
import { banishUntil } from "../banish-until";
import { createCard } from "../create-card";
import { opponentHand, takeFromAmong } from "../take-from-among";
import { shuffleInto } from "../shuffle-into";

const eventCard = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  ...V.event0, id: syntheticId(0x47380 + index), status: "authored", abilities: () => [event(effect)],
});
const permanent = eventCard(0, banishChosen({ cardType: "character" }));
const fromPlay = eventCard(1, banishUntil(target(anyCharacter()), "untilEndOfTurn"));
const creator = eventCard(2, createCard(V.event0.id, 1, "opponent"));
const thief = eventCard(3, takeFromAmong(opponentHand()));
const handShuffle = eventCard(4, shuffleInto([everyIn("hand")]));
const timed = [H.timedCard, ...(["untilYourNextTurn", "untilNextDay"] as const).map((duration, index) =>
  ({ ...H.freeCard, id: syntheticId(0x47390 + index),
    abilities: () => [triggered(onMaterialized(), banishChosen({}, duration))] }))];
const relocate = (index: number, how: "hand" | "rebanish" | "cease"): EngineCardDefinition => ({
  ...V.event0, id: syntheticId(0x473a0 + index), status: "authored", abilities: () => [],
  synthetic: { resolve(ctx, item) {
    const id = ctx.state.sides[opponent(item.controller)].banished[0];
    if (id === undefined) throw new Error("no banished fixture card");
    if (how === "cease") ceaseToExist(ctx, id);
    else {
      const owner = instanceOf(ctx.state, id).owner;
      if (moveToHand(ctx, id, owner) === "hand") ctx.emit({ kind: "returnedToHand", instance: id, side: owner });
      if (how === "rebanish") banish(ctx, id);
    }
  } },
});
const movers = [relocate(0, "hand"), relocate(1, "rebanish"), relocate(2, "cease")];
const E = createEngine(testCatalog([...CHOSEN_HAND_BANISH_CARDS, permanent, fromPlay, creator, thief, handShuffle, ...timed.slice(1), ...movers]));
const deck = Array.from({ length: 5 }, () => V.vanilla1.id);

class Picking implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (prompt: Prompt, state: BattleState) => Answer = (prompt) => {
    if (prompt.kind !== "chooseCards" && prompt.kind !== "chooseTargets") throw new Error(`unexpected ${prompt.kind}`);
    return [prompt.candidates[0]];
  }) {}
  answer(prompt: Prompt, state: BattleState): Answer { this.prompts.push(prompt); return this.pick(prompt, state); }
}

function clean(before: BattleState, after: BattleState, events: readonly EngineEvent[]): void {
  expect(invariantViolations(after, E.catalog)).toEqual([]);
  expect(unannouncedChanges(events, before, after)).toEqual([]);
  expect(eventRedactionViolations(events, before, after)).toEqual([]);
}
function play(state: BattleState, side: Side, card: InstanceId, answers: AnswerSource = new Picking()) {
  const start = E.apply(state, side, { kind: "play", card, from: "hand" }, answers);
  const resolved = passUntil(E, start.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, answers);
  const result = { state: resolved.state, events: [...start.events, ...resolved.events] };
  clean(state, result.state, result.events);
  return result;
}
function board(side: Side, source: EngineCardDefinition = H.freeCard, candidate: EngineCardDefinition = V.event0): ReturnType<typeof boardState> {
  const setup: BoardSetup = { active: side, phase: "day",
    [side]: { hand: [source.id, H.bounce.id, source.id, H.bounce.id], energy: 3, deck },
    [opponent(side)]: { hand: [candidate.id, candidate.id, candidate.cardType === "character" ? V.event0.id : V.vanilla2.id], deck } };
  return boardState(E.catalog, setup);
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function decklistsOf(state: BattleState): Record<Side, DeckEntry[]> {
  const entries = (side: Side): DeckEntry[] => Object.values(state.instances).filter((card) => card.owner === side).map((card) => {
    if (card.printing.kind !== "card") throw new Error("unexpected figment");
    return { cardId: card.printing.cardId, ...card.variant };
  });
  return { player: entries("player"), enemy: entries("enemy") };
}
const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`unexpected fold outcome ${JSON.stringify(outcome)}`);
  return outcome.slice;
};

describe("chosen-hand bounded banishment", () => {
  for (const side of SIDES) {
    for (const source of [H.freeCard, H.paidCard, H.freeCharacter, H.paidCharacter]) {
      const characterOnly = source === H.freeCharacter || source === H.paidCharacter;
      it(`privately chooses a matching physical ${characterOnly ? "character" : "event"}, then publicly returns to hand as ${side} (${source.id})`, () => {
        const candidate = characterOnly ? H.candidate : V.event0;
        const { state, ids } = board(side, source, candidate);
        const other = opponent(side);
        const selected = ids[other].hand[1];
        const picking = new Picking((prompt, work) => {
          expect(prompt).toMatchObject({ kind: "chooseCards", side, privateTo: side, min: 1, max: 1, purpose: { role: "banishChosen" } });
          if (prompt.kind !== "chooseCards") throw new Error("not a chosen-card prompt");
          expect(prompt.candidates).toEqual(characterOnly ? ids[other].hand.slice(0, 2) : ids[other].hand);
          expect(promptView(prompt, side, work)).toEqual(prompt);
          expect(promptRedactionViolations(prompt, work, E.catalog)).toEqual([]);
          if (characterOnly) expect(E.view(work, side).instances[ids[other].hand[2]]).toBeUndefined();
          return [selected];
        });
        const banished = play(state, side, ids[side].hand[0], picking);
        expect(picking.prompts).toHaveLength(1);
        expect(banished.state.sides[other].banished).toEqual([selected]);
        expect(banished.state.sides[other].hand).toContain(ids[other].hand[0]);
        for (const viewer of SIDES) {
          expect(E.view(banished.state, viewer).instances[selected]?.printing).toEqual(state.instances[selected].printing);
          const publicEvent = banished.events.find((event) => event.kind === "banished" && event.instance === selected)!;
          expect(eventSeenBy(publicEvent, viewer, banished.state)).toEqual(publicEvent);
        }
        expect(banished.state.sides[side].currentEnergy).toBe(3 - (source === H.paidCard || source === H.paidCharacter ? 1 : 0));
        const returned = play(banished.state, side, ids[side].hand[1], new Picking(() => [ids[side].hand[0]]));
        expect(returned.state.instances[selected]).toMatchObject({ owner: other, controller: other, zone: "hand" });
        expect(returned.state.sides[other].hand).toContain(selected);
        expect(returned.state.floating).toEqual([]);
        expect(returned.events).toContainEqual({ kind: "returnedToHand", instance: selected, side: other });
        expect(returned.events.some((event) => event.kind === "materialized" && event.instance === selected)).toBe(false);
        expect(returned.state.sides[other].score).toBe(0);
        for (const viewer of SIDES) expect(E.view(returned.state, viewer).instances[selected]?.printing).toEqual(state.instances[selected].printing);
      });
    }

    it(`does nothing with no matching card or a source absent before the effect begins, as ${side}`, () => {
      for (const source of [H.freeCharacter, H.absent]) {
        const { state, ids } = board(side, source);
        const noMatch = source === H.freeCharacter;
        if (noMatch) {
          // Use the public board fixture to give the filtered form only events.
          const fresh = boardState(E.catalog, { active: side, phase: "day",
            [side]: { hand: [source.id], deck }, [opponent(side)]: { hand: [V.event0.id, V.event0.id], deck } });
          const result = play(fresh.state, side, fresh.ids[side].hand[0], NO_PROMPTS);
          expect(result.state.sides[opponent(side)].hand).toEqual(fresh.ids[opponent(side)].hand);
          expect(result.state.floating).toEqual([]);
        } else {
          const result = play(state, side, ids[side].hand[0], NO_PROMPTS);
          expect(result.state.instances[ids[side].hand[0]].zone).toBe("hand");
          expect(result.state.sides[opponent(side)].hand).toEqual(ids[opponent(side)].hand);
          expect(result.state.floating).toEqual([]);
        }
      }
    });
  }

  it("ends each physical source's registration independently and starts a fresh one after its return", () => {
    const { state, ids } = board("player");
    const [first, second] = ids.enemy.hand;
    const one = play(state, "player", ids.player.hand[0]);
    const two = play(one.state, "player", ids.player.hand[2]);
    expect(two.state.sides.enemy.banished).toEqual([second, first]);
    const returned = play(two.state, "player", ids.player.hand[1], new Picking(() => [ids.player.hand[0]]));
    expect(returned.state.instances[first].zone).toBe("hand");
    expect(returned.state.instances[second].zone).toBe("banished");
    const fresh = play(returned.state, "player", ids.player.hand[0], new Picking(() => [first]));
    expect(fresh.state.instances[first].zone).toBe("banished");
    const again = play(fresh.state, "player", ids.player.hand[3], new Picking(() => [ids.player.hand[0]]));
    expect(again.state.instances[first].zone).toBe("hand");
    expect(again.state.instances[second].zone).toBe("banished");
  });

  it.each(movers)("returns only the recorded Banished-zone entry after public relocation ($id)", (mover) => {
    const { state, ids } = boardState(E.catalog, { active: "player", phase: "day",
      player: { hand: [H.freeCard.id, mover.id, H.bounce.id], deck }, enemy: { hand: [V.event0.id, V.event0.id], deck } });
    const selected = ids.enemy.hand[0];
    const chosen = play(state, "player", ids.player.hand[0]);
    const moved = play(chosen.state, "player", ids.player.hand[1]);
    const returned = play(moved.state, "player", ids.player.hand[2], new Picking(() => [ids.player.hand[0]]));
    expect(returned.events.some((event) => event.kind === "returnedToHand" && event.instance === selected)).toBe(false);
    expect(returned.state.instances[selected]?.zone).toBe(mover === movers[0] ? "hand" : mover === movers[1] ? "banished" : undefined);
    expect(returned.state.floating).toEqual([]);
  });

  it("lets a created chosen event cease to exist without a public banishment or return", () => {
    const { state, ids } = boardState(E.catalog, { active: "player", phase: "day",
      player: { hand: [creator.id, H.freeCard.id, H.bounce.id], deck }, enemy: { hand: [V.event0.id], deck } });
    const created = play(state, "player", ids.player.hand[0]);
    const hand = created.state.sides.enemy.hand;
    const id = hand[hand.length - 1];
    expect(created.state.instances[id].status.created).toBe(true);
    const chosen = play(created.state, "player", ids.player.hand[1], new Picking(() => [id]));
    expect(chosen.state.instances[id]).toBeUndefined();
    expect(chosen.state.floating).toEqual([]);
    expect(chosen.events.some((event) => event.kind === "banished" && event.instance === id)).toBe(false);
    const returned = play(chosen.state, "player", ids.player.hand[2], new Picking(() => [ids.player.hand[1]]));
    expect(returned.state.sides.enemy.hand).toEqual(ids.enemy.hand);
  });

  it("returns to the owner rather than the prior holder through a real cross-owner hand transfer", () => {
    const { state, ids } = boardState(E.catalog, { active: "enemy", phase: "day",
      player: { hand: [H.freeCard.id, H.bounce.id, V.event0.id], deck },
      enemy: { hand: [thief.id, V.event0.id], deck } });
    const selected = ids.player.hand[2];
    const held = play(state, "enemy", ids.enemy.hand[0], new Picking(() => [selected]));
    expect(held.state.instances[selected]).toMatchObject({ owner: "player", controller: "enemy", zone: "hand" });
    const ready = passUntil(E, held.state, (next) => next.turn.active === "player" && next.turn.phase === "day").state;
    const chosen = play(ready, "player", ids.player.hand[0], new Picking(() => [selected]));
    expect(chosen.state.instances[selected].zone).toBe("banished");
    const returned = play(chosen.state, "player", ids.player.hand[1], new Picking(() => [ids.player.hand[0]]));
    expect(returned.state.instances[selected]).toMatchObject({ owner: "player", controller: "player", zone: "hand" });
    expect(returned.state.sides.player.hand).toContain(selected);
    expect(returned.state.sides.enemy.hand).not.toContain(selected);
  });

  it.each(timed)("returns hand cards at the bounded duration boundary ($id)", (source) => {
    const { state, ids } = board("player", source);
    const chosen = play(state, "player", ids.player.hand[0]);
    const returned = passUntil(E, chosen.state, (next) => next.floating.length === 0);
    expect(returned.state.instances[ids.enemy.hand[0]].zone).toBe("hand");
    expect(returned.events).toContainEqual({ kind: "returnedToHand", instance: ids.enemy.hand[0], side: "enemy" });
  });

  it("retains a public timed hand-return obligation when its physical source is shuffled into a hidden deck", () => {
    const { state, ids } = boardState(E.catalog, { active: "player", phase: "day",
      player: { hand: [timed[0].id, H.bounce.id, handShuffle.id], deck }, enemy: { hand: [V.event0.id, V.event0.id], deck } });
    const source = ids.player.hand[0];
    const selected = ids.enemy.hand[0];
    const chosen = play(state, "player", source);
    const bounced = play(chosen.state, "player", ids.player.hand[1], new Picking(() => [source]));
    const hidden = play(bounced.state, "player", ids.player.hand[2]);
    expect(hidden.state.instances[source].zone).toBe("deck");
    const effect = hidden.state.floating.find((effect) => effect.change.kind === "banishedToHandUntil")!;
    const decklists = decklistsOf(state);
    for (const viewer of SIDES) {
      const seen = E.view(hidden.state, viewer);
      expect(seen.instances[source]).toBeUndefined();
      expect(seen.floating.find((record) => record.id === effect.id)).toMatchObject({ source: null, expiry: effect.expiry, change: effect.change });
      expect(strings(seen.floating).has(source)).toBe(false);
      const sampled = E.determinize(seen, decklists, () => 0.5);
      expect(sampled.floating.find((record) => record.id === effect.id)?.change).toEqual(effect.change);
      const expiry = passUntil(E, sampled, (next) => next.floating.every((record) => record.id !== effect.id));
      expect(expiry.state.instances[selected]).toMatchObject({ owner: "enemy", controller: "enemy", zone: "hand" });
      expect(expiry.events).toContainEqual({ kind: "returnedToHand", instance: selected, side: "enemy" });
    }
    expect(determinizationDivergences(E, hidden.state, decklists, battleSeed("hidden-hand-return"), 0)).toEqual([]);
    const actual = passUntil(E, hidden.state, (next) => next.floating.every((record) => record.id !== effect.id));
    expect(actual.state.instances[selected].zone).toBe("hand");
    clean(hidden.state, actual.state, actual.events);
  });

  it("keeps permanent chosen banishment and the existing from-play materialization", () => {
    const { state, ids } = boardState(E.catalog, { active: "player", phase: "day",
      player: { hand: [permanent.id, fromPlay.id], deck }, enemy: { hand: [H.candidate.id], back: [H.candidate.id], deck } });
    const permanentResult = play(state, "player", ids.player.hand[0]);
    expect(permanentResult.state.floating).toEqual([]);
    const played = play(permanentResult.state, "player", ids.player.hand[1], new Picking(() => [ids.enemy.back[0]!]));
    const returned = passUntil(E, played.state, (next) => next.floating.length === 0);
    expect(returned.state.instances[ids.enemy.hand[0]].zone).toBe("banished");
    expect(returned.state.instances[ids.enemy.back[0]!].zone).toBe("play");
    expect(returned.events.some((event) => event.kind === "materialized" && event.instance === ids.enemy.back[0])).toBe(true);
  });

  it("roundtrips and replays private suspension, preserving physical knowledge and correlated logs through expiry", () => {
    const { state, ids } = board("player");
    const logs: EngineLogRecord[] = [];
    const fold = createFoldAdapter(E, { checkEventPrefix: true, log: (record) => logs.push(record) });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", privateTo: "player" });
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(E.catalog), { checkEventPrefix: true });
    expect(cold.pending(saved)).toEqual(pending);
    const intent = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[1]] } as const;
    const answered = applied(fold.reduce(opened, intent));
    const replayed = applied(cold.reduce(saved, intent));
    expect(stateHash(replayed.committed)).toBe(stateHash(answered.committed));
    const inline = play(state, "player", ids.player.hand[0], new Picking(() => [ids.enemy.hand[1]]));
    expect(stateHash(answered.committed)).toBe(stateHash(inline.state));
    const decklists = decklistsOf(state);
    expect(determinizationDivergences(E, answered.committed, decklists, battleSeed("hand-banish"), 0)).toEqual([]);
    const reloaded = JSON.parse(JSON.stringify(answered.committed)) as BattleState;
    const result = play(reloaded, "player", ids.player.hand[1], new Picking(() => [ids.player.hand[0]]));
    expect(stateHash(result.state)).toBe(stateHash(play(answered.committed, "player", ids.player.hand[1], new Picking(() => [ids.player.hand[0]])).state));
    expect(determinizationDivergences(E, result.state, decklists, battleSeed("hand-return"), 1)).toEqual([]);
    logs.push(...eventLogRecords(result.events, reloaded.version));
    const started = logs.find((record) => record.event === "engine.banishReturnStarted");
    expect(started).toMatchObject({ detail: { source: ids.player.hand[0], change: { kind: "banishedToHandUntil", instance: ids.enemy.hand[1] } } });
    if (started?.event !== "engine.banishReturnStarted") throw new Error("missing start log");
    const end = logs.findIndex((record) => record.event === "engine.effectEnded" && record.detail.effect === started.detail.effect);
    const returned = logs.findIndex((record) => record.event === "engine.returnedToHand" && record.detail.instance === ids.enemy.hand[1]);
    expect(end).toBeGreaterThan(logs.indexOf(started));
    expect(returned).toBeGreaterThan(end);
  });
});
