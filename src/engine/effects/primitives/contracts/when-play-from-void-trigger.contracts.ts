/**
 * "When you play a card from your void" (`whenPlayFromVoid`; rules § Ability
 * Types → When you play a card from your void; RD-hv-umm2.93-1): a play
 * from the void by Reclaim or a play permission, matched as `cardPlayed`
 * announces it, by the stack item's record of the move. An ability that
 * works from the void ("return this character to play") does not see its
 * own card played from there. "Return this character to play with awakened"
 * (RD-hv-umm2.93-2) awakens it only when that effect returned it.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { energy, event, everyIn, keyword, reclaim, self, thisCardIn } from "../../../dsl/builders";
import { sourceIn, triggered, untilEndOfTurn, whenPlayFromVoid } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { deserializeState, stateHash } from "../../../state/hash";
import type { AbilitySource, InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { awaken } from "../awaken";
import { draw } from "../draw";
import { gainEnergy } from "../gain-energy";
import { gainAdditionalSpark } from "../gain-spark";
import { gainPoints } from "../gain-points";
import { ifThen } from "../if-then";
import { materialize } from "../materialize";
import { optional } from "../optional";
import { playFromZone } from "../play-from-zone";
import { returnFromVoid } from "../return-from-void";
import { sequence } from "../sequence";

function card(
  index: number,
  cardType: "character" | "event",
  cost: number,
  abilities: EngineCardDefinition["abilities"],
  speed: EngineCardDefinition["speed"] = "standard",
): EngineCardDefinition {
  return {
    id: syntheticId(0x9300 + index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? 2 : null,
    subtype: cardType === "character" ? "Survivor" : "",
    speed,
    status: "authored",
    abilities,
  };
}

const returnSelf = materialize(thisCardIn("void"));
const D = {
  /** "Vengeful. When you play a card from your void, return this character to play." */
  graywatch: card(0, "character", 3, () => [keyword("vengeful"), triggered(whenPlayFromVoid(), returnSelf, { zone: "void" })]),
  /** "… return this character to play with awakened." */
  awakeGraywatch: card(1, "character", 3, () => [
    triggered(whenPlayFromVoid(), ifThen(sourceIn("void"), sequence(returnSelf, awaken(self()))), { zone: "void" }),
  ]),
  /** "When you play a card from your void, return this character to play. Reclaim 0●" */
  selfReclaimer: card(2, "character", 3, () => [triggered(whenPlayFromVoid(), returnSelf, { zone: "void" }), reclaim(energy(0))]),
  /** "When you play a card from your void, gain 1●." */
  watch: card(3, "character", 5, () => [triggered(whenPlayFromVoid(), gainEnergy(1))]),
  /** "When the opponent plays an event from their void, gain 1●." */
  opponentEventWatch: card(4, "character", 5, () => [triggered(whenPlayFromVoid("opponent", { cardType: "event" }), gainEnergy(1))]),
  /** "When you play a card from your void, return each card in your void to your hand." */
  recaller: card(5, "character", 5, () => [triggered(whenPlayFromVoid(), returnFromVoid(everyIn("void")))]),
  /** "When you play a card from your void, materialize each character in your void." */
  raiser: card(6, "character", 5, () => [triggered(whenPlayFromVoid(), materialize(everyIn("void", { cardType: "character" })))]),
  /** "When you play a card from your void, you may draw a card." */
  mayDraw: card(7, "character", 5, () => [triggered(whenPlayFromVoid(), optional(draw(1)))]),
  /** "When you play a card from your void, gain 1●, then <a definition error>." */
  thrower: card(8, "character", 5, () => [triggered(whenPlayFromVoid(), sequence(gainEnergy(1), gainAdditionalSpark(self(), 1)))]),
} as const;
const S = {
  /** "Gain 1⍟. Reclaim 0●" */
  reclaimEvent: card(20, "event", 0, () => [event(gainPoints(1)), reclaim(energy(0))]),
  /** A character with "Reclaim 0●". */
  reclaimCharacter: card(21, "character", 3, () => [reclaim(energy(0))]),
  /** "This turn, you may play cards from your void." */
  permitVoid: card(22, "event", 0, () => [event(playFromZone("void", {}, { duration: untilEndOfTurn() }))]),
  /** "Interrupt. Gain 1⍟. Reclaim 0●" */
  interruptReclaimEvent: card(23, "event", 0, () => [event(gainPoints(1)), reclaim(energy(0))], "interrupt"),
} as const;

const E = createEngine(testCatalog([...Object.values(D), ...Object.values(S)]));
const filler = Array.from({ length: 6 }, () => v.vanilla3.id);

function setup(board: Omit<BoardSetup, "phase" | "active">) {
  return boardState(E.catalog, { active: "player", phase: "day", ...board });
}
function act(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const result = E.apply(state, side, action, answers.length === 0 ? NO_PROMPTS : source);
  if (answers.length > 0) source.assertExhausted();
  expect(invariantViolations(result.state, E.catalog)).toEqual([]);
  return result;
}
function play(state: BattleState, side: Side, card: InstanceId | null | undefined, from: "hand" | "void", answers: readonly Answer[] = []) {
  if (card === undefined || card === null) throw new Error("no card");
  return act(state, side, { kind: "play", card, from }, answers);
}
/** Passes priority until the stack is empty. */
function resolved(state: BattleState): BattleState {
  let current = state;
  while (current.stack.length > 0) {
    const decision = E.decision(current);
    if (decision?.kind !== "respond") throw new Error("expected a response window");
    current = act(current, decision.side, { kind: "pass" }).state;
  }
  return current;
}
function queued(events: readonly EngineEvent[]): (AbilitySource | null)[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
}
function subjects(events: readonly EngineEvent[]): (InstanceId | null)[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.subject] : []));
}
const zone = (state: BattleState, id: InstanceId | null | undefined) => (id === null || id === undefined ? undefined : state.instances[id]?.zone);

describe("whenPlayFromVoid", () => {
  it("returns its card from the void when you play another card from your void by Reclaim, after the watchers in play", () => {
    const { state, ids } = setup({ player: { back: [D.watch.id], void: [D.graywatch.id, S.reclaimEvent.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [watch] = ids.player.back;
    const [graywatch, reclaimEvent] = ids.player.void;
    const played = play(state, "player", reclaimEvent, "void");
    expect(queued(played.events)).toEqual([watch, graywatch]);
    expect(subjects(played.events)).toEqual([reclaimEvent, reclaimEvent]);
    // Both resolve before the opponent receives priority; Graywatch enters exhausted, as a returned character does.
    expect(zone(played.state, graywatch)).toBe("play");
    expect(played.state.instances[graywatch]?.status.exhausted).toBe(true);
    expect(played.state.sides.player.currentEnergy).toBe(1);
    expect(played.events).toContainEqual(expect.objectContaining({ kind: "materialized", instance: graywatch }));
  });

  it("matches a play from the void by a play permission, and never a play from hand", () => {
    const { state, ids } = setup({
      player: { hand: [S.permitVoid.id, v.vanilla1.id], void: [D.graywatch.id, v.vanilla1.id], energy: 2, deck: filler },
      enemy: { deck: filler },
    });
    const [permit, vanilla] = ids.player.hand;
    const [graywatch, voidVanilla] = ids.player.void;
    const handPlays = resolved(play(resolved(play(state, "player", permit, "hand").state), "player", vanilla, "hand").state);
    expect(zone(handPlays, graywatch)).toBe("void");
    expect(handPlays.stack).toEqual([]);
    const permitted = play(handPlays, "player", voidVanilla, "void");
    expect(queued(permitted.events)).toEqual([graywatch]);
    expect(zone(permitted.state, graywatch)).toBe("play");
  });

  it("does not see its own card played from the void, which is then on the stack", () => {
    const { state, ids } = setup({ player: { void: [D.selfReclaimer.id, D.graywatch.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [reclaimer, graywatch] = ids.player.void;
    const played = play(state, "player", reclaimer, "void");
    expect(queued(played.events)).toEqual([graywatch]);
    expect(played.events.filter((entry) => entry.kind === "materialized").map((entry) => entry.instance)).toEqual([graywatch, reclaimer]);
  });

  it("matches only the named player's plays from their void, by the card's type as it was played", () => {
    const { state, ids } = setup({
      player: { back: [D.opponentEventWatch.id], void: [S.reclaimEvent.id, S.reclaimCharacter.id], energy: 0, deck: filler },
      enemy: { back: [D.opponentEventWatch.id], deck: filler },
    });
    const [enemyWatch] = ids.enemy.back;
    const [reclaimEvent, reclaimCharacter] = ids.player.void;
    const eventPlay = play(state, "player", reclaimEvent, "void");
    expect(queued(eventPlay.events)).toEqual([enemyWatch]);
    expect(eventPlay.state.sides.enemy.currentEnergy).toBe(1);
    const characterPlay = play(resolved(eventPlay.state), "player", reclaimCharacter, "void");
    expect(queued(characterPlay.events)).toEqual([]);
  });

  it("does not match a hand play while a card played from the void waits on the stack", () => {
    const { state, ids } = setup({
      player: { back: [D.watch.id], hand: [v.vanilla1.id, v.interruptEvent.id], void: [S.interruptReclaimEvent.id], energy: 2, deck: filler },
      enemy: { hand: [v.interruptEvent.id, v.interruptEvent.id], energy: 2, deck: filler },
    });
    const [watch] = ids.player.back;
    const [vanilla, interrupt] = ids.player.hand;
    const [reclaimed] = ids.player.void;
    const [enemyFirst, enemySecond] = ids.enemy.hand;
    const opened = play(play(state, "player", vanilla, "hand").state, "enemy", enemyFirst, "hand");
    const fromVoid = play(opened.state, "player", reclaimed, "void");
    expect(queued(fromVoid.events)).toEqual([watch]);
    const responded = play(fromVoid.state, "enemy", enemySecond, "hand");
    // The card played from the void is still on the stack, its record with it, as the hand play is announced.
    expect(responded.state.stack.filter((item) => item.kind === "card" && item.playedFromVoid === true).map((item) => item.kind === "card" && item.instance)).toEqual([reclaimed]);
    const fromHand = play(responded.state, "player", interrupt, "hand");
    expect(fromHand.events).toContainEqual(expect.objectContaining({ kind: "cardPlayed", instance: interrupt }));
    expect(queued(fromHand.events)).toEqual([]);
    expect(fromHand.state.sides.player.currentEnergy).toBe(1);
  });

  it("does nothing when its card left the void before it resolves, and stays in the void with the back rank full", () => {
    const left = setup({ player: { back: [D.recaller.id], void: [D.graywatch.id, S.reclaimEvent.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [recaller] = left.ids.player.back;
    const [graywatch, reclaimEvent] = left.ids.player.void;
    const played = play(left.state, "player", reclaimEvent, "void");
    expect(queued(played.events)).toEqual([recaller, graywatch]);
    expect(played.events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: graywatch }));
    expect(zone(played.state, graywatch)).toBe("hand");

    const full = setup({ player: { back: Array.from({ length: 10 }, () => v.vanilla1.id), void: [D.graywatch.id, S.reclaimEvent.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [stuck, event] = full.ids.player.void;
    const crowded = play(full.state, "player", event, "void");
    expect(queued(crowded.events)).toEqual([stuck]);
    expect(crowded.events).toContainEqual(expect.objectContaining({ kind: "capacityReached", instance: stuck }));
    expect(zone(crowded.state, stuck)).toBe("void");
  });

  it("with awakened, returns its card ready, and awakens nothing when an earlier trigger returned it", () => {
    const ready = setup({ player: { void: [D.awakeGraywatch.id, S.reclaimEvent.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [awake, reclaimEvent] = ready.ids.player.void;
    const returned = play(ready.state, "player", reclaimEvent, "void");
    expect(zone(returned.state, awake)).toBe("play");
    expect(returned.state.instances[awake]?.status.exhausted).toBe(false);

    const raised = setup({ player: { back: [D.raiser.id], void: [D.awakeGraywatch.id, S.reclaimEvent.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [raiser] = raised.ids.player.back;
    const [other, event] = raised.ids.player.void;
    const earlier = play(raised.state, "player", event, "void");
    expect(queued(earlier.events)).toEqual([raiser, other]);
    expect(zone(earlier.state, other)).toBe("play");
    expect(earlier.state.instances[other]?.status.exhausted).toBe(true);
    expect(earlier.events.some((entry) => entry.kind === "exhaustionChanged")).toBe(false);
  });

  it("shows the trigger and the returned character to both sides with nothing redacted", () => {
    const { state, ids } = setup({ player: { void: [D.graywatch.id, S.reclaimEvent.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [graywatch, reclaimEvent] = ids.player.void;
    const played = play(state, "player", reclaimEvent, "void");
    for (const viewer of ["player", "enemy"] as const) {
      const seen = played.events.flatMap((entry) => {
        const shown = eventSeenBy(entry, viewer, played.state);
        return shown === null ? [] : [shown];
      });
      expect(seen).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: graywatch, subject: reclaimEvent }));
      expect(seen).toContainEqual(expect.objectContaining({ kind: "materialized", instance: graywatch }));
    }
    expect(played.events.filter((entry) => entry.kind === "triggerQueued" && entry.subjectHiddenFrom !== undefined)).toEqual([]);
    expect(eventRedactionViolations(played.events, state, played.state)).toEqual([]);
  });

  it("keeps its queued trigger and the stack's record across a reload and resolves identically through the fold", () => {
    const { state, ids } = setup({ player: { back: [D.mayDraw.id], void: [D.graywatch.id, S.reclaimEvent.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [mayDraw] = ids.player.back;
    const [graywatch, reclaimEvent] = ids.player.void;
    const action = { kind: "play", card: reclaimEvent, from: "void" } as const;
    const inline = E.apply(state, "player", action, new ScriptedSource([true]));
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action });
    if (opened.kind !== "applied" || opened.error !== null) throw new Error("bounced");
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const reloaded: BattleSlice = { ...saved, committed: deserializeState(JSON.stringify(opened.slice.committed)) };
    expect(reloaded.committed.stack).toEqual([expect.objectContaining({ instance: reclaimEvent, playedFromVoid: true })]);
    const pending = createFoldAdapter(E, { checkEventPrefix: true }).pending(reloaded);
    if (pending === null) throw new Error("no trigger prompt after reload");
    expect(pending.prompt).toMatchObject({ side: "player", purpose: { role: "youMay", source: mayDraw } });
    expect(pending.display.triggerQueue.map((entry) => entry.source)).toEqual([graywatch]);
    const answered = createFoldAdapter(E, { checkEventPrefix: true }).reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    expect(stateHash(answered.slice.committed)).toBe(stateHash(inline.state));
    expect([...opened.published, ...answered.published]).toEqual(inline.events);
    expect(zone(answered.slice.committed, graywatch)).toBe("play");
  });

  it("keeps the play and its later triggers queued when an earlier trigger fails as it resolves", () => {
    const { state, ids } = setup({ player: { back: [D.thrower.id], void: [D.graywatch.id, S.reclaimEvent.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [thrower] = ids.player.back;
    const [graywatch, reclaimEvent] = ids.player.void;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: reclaimEvent, from: "void" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected the definition error");
    // The play step committed; the failing trigger step committed nothing, its gained 1● included.
    const committed = outcome.slice.committed;
    expect(outcome.slice.inFlight).toBeNull();
    expect(committed.stack).toEqual([expect.objectContaining({ instance: reclaimEvent, playedFromVoid: true })]);
    expect(committed.triggerQueue.map((entry) => entry.source)).toEqual([thrower, graywatch]);
    expect(committed.sides.player.currentEnergy).toBe(0);
    expect(zone(committed, graywatch)).toBe("void");
    expect(outcome.published.some((entry) => entry.kind === "materialized" || entry.kind === "triggerResolved")).toBe(false);
  });
});
