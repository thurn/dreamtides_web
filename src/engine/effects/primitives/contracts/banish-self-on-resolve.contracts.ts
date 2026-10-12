/** "Banish this card": a resolving event ends in its owner's Banished zone, never its void (RD-hv-umm2.475-1). */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { energy, event, everyIn, reclaim, stackItem } from "../../../dsl/builders";
import { triggered, whenYouPlay } from "../../../dsl/triggers";
import { parseDreamsignId } from "../../../../types/identifiers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { STACK, STACK_CARDS } from "../../../testing/stack-cards";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { resolveEffect } from "../../interpreter";
import { banishSelfOnResolve } from "../banish-self-on-resolve";
import { copyCard } from "../copy-card";
import { draw } from "../draw";
import { eachPlayer } from "../each-player";
import { gainEnergy } from "../gain-energy";
import { gainPoints } from "../gain-points";
import { optional } from "../optional";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";

const base: EngineCardDefinition = {
  id: syntheticId(0x14750), cardType: "event", costs: [energy(1)], spark: null, subtype: "", speed: "standard", status: "authored",
  abilities: () => [event(sequence(eachPlayer(shuffleInto([everyIn("hand"), everyIn("void")])), eachPlayer(draw(2)), banishSelfOnResolve()))],
};
/** ❖❖ "Gain 1⍟. Banish this card." */
const quick: EngineCardDefinition = { ...base, id: syntheticId(0x14751), speed: "interrupt", abilities: () => [event(sequence(gainPoints(1), banishSelfOnResolve()))] };
/** "Gain 2⍟. Banish this card. Reclaim 1●" */
const reclaimable: EngineCardDefinition = { ...base, id: syntheticId(0x14752), abilities: () => [event(sequence(gainPoints(2), banishSelfOnResolve())), reclaim(energy(1))] };
/** ❖❖ "Copy an event on the stack." */
const copier: EngineCardDefinition = { ...base, id: syntheticId(0x14753), speed: "interrupt", abilities: () => [event(copyCard({ kind: "stackTarget", selector: stackItem({ cardType: "event" }) }))] };
/** "Banish this card. You may gain 1●." — banished before the prompt. */
const prompted: EngineCardDefinition = { ...base, id: syntheticId(0x14754), abilities: () => [event(sequence(banishSelfOnResolve(), optional(gainEnergy(1))))] };
const fault: EngineCardDefinition = {
  ...prompted, id: syntheticId(0x14755), abilities: () => [],
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, sequence(banishSelfOnResolve(), optional(gainEnergy(1))), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
      ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic failure after the banish");
  } },
};
const twice: EngineCardDefinition = { ...base, id: syntheticId(0x14756), abilities: () => [event(sequence(banishSelfOnResolve(), banishSelfOnResolve(), gainPoints(1)))] };
const invalidEmblem: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000014757"), status: "authored",
  abilities: () => [triggered(whenYouPlay({ cardType: "event" }), banishSelfOnResolve())],
};
const engine = createEngine(testCatalog([base, quick, reclaimable, copier, prompted, fault, twice, ...STACK_CARDS], { dreamsigns: [invalidEmblem] }));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla1.id];
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
const kinds = (events: readonly EngineEvent[], id: InstanceId) =>
  events.flatMap((entry) => ("instance" in entry && entry.instance === id ? [entry.kind] : []));
function expectBanishedPublicly(events: readonly EngineEvent[], state: BattleState, id: InstanceId, owner: Side) {
  const banished = events.filter((entry) => entry.kind === "banished" && entry.instance === id);
  expect(banished).toEqual([{ kind: "banished", instance: id, side: owner }]);
  for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(banished[0], viewer, state)).toEqual(banished[0]);
  expect(state.instances[id]?.zone).toBe("banished");
  expect(state.sides[owner].banished).toContain(id);
  expect(state.sides[owner].void).not.toContain(id);
  expect(state.stack.some((item) => item.kind === "card" && item.instance === id)).toBe(false);
}

describe("banishSelfOnResolve", () => {
  it("invokes the primitive twice but moves an off-stack source only once", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [twice.id], energy: 1, deck }, enemy: { deck } });
    const card = ids.player.hand[0];
    const result = engine.apply(state, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS);
    expectBanishedPublicly(result.events, result.state, card, "player");
    expect(kinds(result.events, card)).toEqual(["cardPlayed", "resolved", "banished"]);
    expect(result.state.sides.player.score).toBe(1);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("rejects an emblem trigger's source as a definition error without committing a partial step", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [quick.id], dreamsigns: [invalidEmblem.id], energy: 1, deck }, enemy: { deck } });
    const before = JSON.stringify(state);
    expect(() => engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS)).toThrow(/emblem/);
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each(["player", "enemy"] as const)("banishes the %s event after its shuffle and draws, never shuffling or voiding it, and replays identically", (side) => {
    const other = opponent(side);
    const { state, ids } = boardState(engine.catalog, {
      active: side, phase: "day",
      [side]: { hand: [base.id, v.vanilla1.id], void: [v.vanilla2.id], deck, energy: 1 },
      [other]: { hand: [v.vanilla3.id], void: [v.vanilla1.id], deck },
    });
    const card = ids[side].hand[0];
    // The opponent cannot respond, so playing it resolves it.
    const action = { kind: "play", card, from: "hand" } as const;
    const result = engine.apply(state, side, action, NO_PROMPTS);
    const after = result.state;
    expectBanishedPublicly(result.events, after, card, side);
    expect(kinds(result.events, card)).toEqual(["cardPlayed", "resolved", "banished"]);
    const order = result.events.map((entry) => entry.kind);
    expect(order.lastIndexOf("cardDrawn")).toBeLessThan(order.indexOf("banished"));
    expect(order.lastIndexOf("shuffledIntoDeck")).toBeLessThan(order.indexOf("cardDrawn"));
    for (const owner of [side, other]) {
      expect(after.sides[owner].void).toEqual([]);
      expect(after.sides[owner].hand).toHaveLength(2);
      expect(after.sides[owner].deck).not.toContain(card);
    }
    expect(after.priority).toBeNull();
    expect(unannouncedChanges(result.events, state, after)).toEqual([]);
    expect(invariantViolations(after, engine.catalog)).toEqual([]);
    const saved = JSON.parse(JSON.stringify(state)) as BattleState;
    const replay = createEngine(engine.catalog).apply(saved, side, action, new ScriptedSource(result.answers.map((answer) => answer.value)));
    expect(replay).toEqual(result);
    expect(stateHash(replay.state)).toBe(stateHash(after));
  });

  it("redacts nothing a side can identify when one player's part already shuffled the other's deck", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { hand: [base.id], energy: 1, deck }, enemy: { hand: [v.vanilla2.id], void: [v.vanilla3.id], deck },
    });
    // The enemy's card in the player's hand returns to the enemy's deck during the player's part.
    const lent = ids.enemy.hand[0];
    state.sides.enemy.hand = [];
    state.sides.player.hand.push(lent);
    state.instances[lent] = { ...state.instances[lent], controller: "player" };
    const card = ids.player.hand[0];
    const result = engine.apply(state, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS);
    const shuffles = result.events.filter((entry) => entry.kind === "shuffledIntoDeck" && entry.side === "enemy");
    expect(shuffles).toHaveLength(2);
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
    expectBanishedPublicly(result.events, result.state, card, "player");
    expect(result.state.instances[lent]?.zone).not.toBe("void");
  });

  it("a prevented event never resolves and goes to its owner's void", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { hand: [base.id], energy: 1, deck }, enemy: { hand: [STACK.preventEvent.id], energy: 1, deck },
    });
    const card = ids.player.hand[0];
    const waiting = engine.apply(state, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS).state;
    const result = engine.apply(waiting, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, new ScriptedSource([[card]]));
    expect(result.state.instances[card]?.zone).toBe("void");
    expect(result.state.sides.player.void).toContain(card);
    expect(kinds(result.events, card)).not.toContain("banished");
    expect(kinds(result.events, card)).not.toContain("resolved");
    expect(result.state.sides.player.hand).toEqual([]);
  });

  it("an opponent's response resolves first, banishing itself, and the original is banished as it resolves", () => {
    // A second Interrupt in the enemy's hand keeps a decision open between the two resolutions.
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { hand: [quick.id], energy: 1, deck }, enemy: { hand: [quick.id, quick.id], energy: 2, deck },
    });
    const mine = ids.player.hand[0];
    const theirs = ids.enemy.hand[0];
    const waiting = engine.apply(state, "player", { kind: "play", card: mine, from: "hand" }, NO_PROMPTS).state;
    const mid = engine.apply(waiting, "enemy", { kind: "play", card: theirs, from: "hand" }, NO_PROMPTS);
    expectBanishedPublicly(mid.events, mid.state, theirs, "enemy");
    expect(kinds(mid.events, mine)).toEqual([]);
    expect(mid.state.instances[mine]?.zone).toBe("stack");
    expect(mid.state.stack).toHaveLength(1);
    expect(engine.decision(mid.state)).toEqual({ kind: "respond", side: "enemy" });
    const last = engine.apply(mid.state, "enemy", { kind: "pass" }, NO_PROMPTS);
    expectBanishedPublicly(last.events, last.state, mine, "player");
    expect(last.state.instances[theirs]?.zone).toBe("banished");
    expect(last.state.stack).toEqual([]);
    expect([last.state.sides.player.score, last.state.sides.enemy.score]).toEqual([1, 1]);
    expect(invariantViolations(last.state, engine.catalog)).toEqual([]);
  });

  it("a copy ceases to exist instead while the original is banished", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { hand: [quick.id], energy: 1, deck }, enemy: { hand: [copier.id], energy: 1, deck },
    });
    const card = ids.player.hand[0];
    const waiting = engine.apply(state, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS).state;
    let current = engine.apply(waiting, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, new ScriptedSource([[card]]));
    const events = [...current.events];
    for (let guard = 0; current.state.stack.length > 0 && guard < 10; guard++) {
      const decision = engine.decision(current.state);
      if (decision === null) break;
      current = engine.apply(current.state, decision.side, { kind: "pass" }, NO_PROMPTS);
      events.push(...current.events);
    }
    const copied = events.find((entry) => entry.kind === "cardCopied");
    if (copied?.kind !== "cardCopied") throw new Error("copy did not resolve");
    expect(current.state.instances[copied.copy]).toBeUndefined();
    expect(kinds(events, copied.copy)).toContain("ceasedToExist");
    expect(kinds(events, copied.copy)).not.toContain("banished");
    expectBanishedPublicly(events, current.state, card, "player");
    expect([current.state.sides.player.score, current.state.sides.enemy.score]).toEqual([1, 1]);
    expect(invariantViolations(current.state, engine.catalog)).toEqual([]);
  });

  it("a reclaimed play is banished once and stays reclaimed", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { void: [reclaimable.id], energy: 1, deck }, enemy: { deck } });
    const card = ids.player.void[0];
    const result = engine.apply(state, "player", { kind: "play", card, from: "void" }, NO_PROMPTS);
    expect(kinds(result.events, card)).toContain("resolved");
    expectBanishedPublicly(result.events, result.state, card, "player");
    expect(result.state.instances[card]?.status.reclaimed).toBe(true);
    expect(result.state.sides.player.score).toBe(2);
  });

  it.each([prompted, fault])("keeps a suspended resolution atomic across reload, stale and foreign answers ($id)", (fixture) => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [fixture.id], energy: 1, deck }, enemy: { deck } });
    const card = ids.player.hand[0];
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const intent = { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } } as const;
    const opened = applied(fold.reduce(sliceOf(state), intent));
    const pending = fold.pending(opened)!;
    // The banish precedes the prompt: shown on the pending display, not yet committed.
    expect(opened.committed.instances[card]?.zone).toBe("stack");
    expect(pending.display.instances[card]?.zone).toBe("banished");
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const fresh = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(fresh.pending(saved)).toEqual(pending);
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: true } as const;
    expect(fresh.reduce(saved, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, intent)).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const result = fresh.reduce(saved, answer);
    expect(result).toEqual(fold.reduce(opened, answer));
    const slice = applied(result);
    expect(slice.inFlight).toBeNull();
    if (fixture === fault) {
      if (result.kind !== "applied") throw new Error("expected the answer to run");
      expect(result.error?.message).toMatch(/synthetic failure/);
      expect(result.published).toEqual([]);
      expect(slice.committed.instances[card]?.zone).toBe("stack");
      expect(slice.committed.sides.player.banished).toEqual([]);
    } else {
      expect(slice.committed.instances[card]?.zone).toBe("banished");
      expect(slice.committed.sides.player.void).toEqual([]);
      expect(slice.committed.stack).toEqual([]);
    }
  });
});
