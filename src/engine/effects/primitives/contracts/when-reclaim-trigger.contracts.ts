/**
 * "When you reclaim a card" (`whenReclaim`) and "When you reclaim this
 * character" (`whenReclaimSelf`; rules § Ability Types → When you reclaim a
 * card, When you reclaim this character; RD-hv-umm2.91-1): a play from the
 * void by Reclaim, matched as `cardPlayed` announces it with the card on the
 * stack. The self form works from the stack, and "it gains +1✦" gives the
 * card on the stack spark it keeps in play. "This character's ✦"
 * (`thisCharacterSpark`; RD-hv-umm2.91-2) reads the source's spark as the
 * effect resolves.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, characterYouControl, energy, event, reclaim, self, stackItem, staticAbility } from "../../../dsl/builders";
import { triggered, triggeringCard, untilEndOfTurn, whenReclaim, whenReclaimSelf } from "../../../dsl/triggers";
import { thisCharacterSpark } from "../../../dsl/values";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { effectiveSpark } from "../../../rules/spark";
import { deserializeState, stateHash } from "../../../state/hash";
import type { AbilitySource, InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { CardSubtype } from "../../../../types/card-identity";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { dissolve } from "../dissolve";
import { draw } from "../draw";
import { gainEnergy } from "../gain-energy";
import { gainPoints } from "../gain-points";
import { gainAdditionalSpark, gainSpark } from "../gain-spark";
import { optional } from "../optional";
import { playFromZone } from "../play-from-zone";
import { prevent } from "../prevent";
import { reclaimNotBanished } from "../reclaim-not-banished";
import { sequence } from "../sequence";
import { sparkModifier } from "../spark-modifier";

function card(
  index: number,
  cardType: "character" | "event",
  cost: number,
  abilities: EngineCardDefinition["abilities"],
  options: { readonly spark?: number; readonly subtype?: CardSubtype; readonly speed?: EngineCardDefinition["speed"] } = {},
): EngineCardDefinition {
  return {
    id: syntheticId(0x9100 + index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? (options.spark ?? 1) : null,
    subtype: cardType === "character" ? (options.subtype ?? "Warrior") : "",
    speed: options.speed ?? "standard",
    status: "authored",
    abilities,
  };
}

const D = {
  /** "When you reclaim this character, it gains +1✦. Reclaim 0●" */
  construct: card(0, "character", 2, () => [triggered(whenReclaimSelf(), gainSpark(triggeringCard(), 1)), reclaim(energy(0))]),
  /** "Interrupt. When you reclaim this character, it gains +1✦. Reclaim 0●" */
  interruptConstruct: card(11, "character", 2, () => [triggered(whenReclaimSelf(), gainSpark(triggeringCard(), 1)), reclaim(energy(0))], { speed: "interrupt" }),
  /** "When you reclaim a card, gain 1●." */
  watch: card(1, "character", 5, () => [triggered(whenReclaim(), gainEnergy(1))]),
  /** "When the opponent reclaims an event, gain 1●." */
  opponentEventWatch: card(2, "character", 5, () => [triggered(whenReclaim("opponent", { cardType: "event" }), gainEnergy(1))]),
  /** "When you reclaim a card, you may draw a card." */
  mayDraw: card(3, "character", 5, () => [triggered(whenReclaim(), optional(draw(1)))]),
  /** "When you reclaim a card, prevent a card you control on the stack." */
  preventer: card(4, "character", 5, () => [triggered(whenReclaim(), prevent(stackItem({ controller: "you" })))]),
  /** "Once per turn, when you reclaim a card, gain X⍟ where X is this character's ✦. Then this character gains +1✦." */
  delver: card(5, "character", 2, () => [
    triggered(whenReclaim(), sequence(gainPoints(thisCharacterSpark()), gainSpark(self(), 1)), { oncePerTurn: true }),
  ], { spark: 2, subtype: "Explorer" }),
  /** "Other characters you control have +1✦." */
  anthem: card(6, "character", 5, () => [staticAbility(sparkModifier(all(characterYouControl({ another: true })), 1))]),
  /** "When you reclaim a card, dissolve each Explorer you control." */
  explorerKiller: card(7, "character", 5, () => [triggered(whenReclaim(), dissolve(all(characterYouControl({ subtype: "Explorer" }))))]),
  /** "Cards you reclaim are not banished when they leave play." */
  keeper: card(8, "character", 5, () => [staticAbility(reclaimNotBanished())], { subtype: "Ancient" }),
  /** "When you reclaim a card, gain 1●, then <a definition error>." */
  thrower: card(9, "character", 5, () => [triggered(whenReclaim(), sequence(gainEnergy(1), gainAdditionalSpark(self(), 1)))]),
  /** A static ability that reads its own ✦, which only a resolving effect may. */
  selfReader: card(10, "character", 5, () => [staticAbility(sparkModifier(self(), thisCharacterSpark()))]),
} as const;
const S = {
  /** "Gain 1⍟. Reclaim 0●" */
  reclaimEvent: card(20, "event", 0, () => [event(gainPoints(1)), reclaim(energy(0))]),
  /** "Gain 1⍟. Reclaim 0●", a character. */
  reclaimCharacter: card(21, "character", 3, () => [reclaim(energy(0))]),
  /** "This turn, you may play cards from your void." */
  permitVoid: card(22, "event", 0, () => [event(playFromZone("void", {}, { duration: untilEndOfTurn() }))]),
  /** "Dissolve each Warrior you control." */
  dissolveWarriors: card(23, "event", 0, () => [event(dissolve(all(characterYouControl({ subtype: "Warrior" }))))]),
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
function fromVoid(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []) {
  if (card === undefined) throw new Error("no card");
  return act(state, side, { kind: "play", card, from: "void" }, answers);
}
function fromHand(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []) {
  if (card === undefined) throw new Error("no card");
  return act(state, side, { kind: "play", card, from: "hand" }, answers);
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
const spark = (state: BattleState, id: InstanceId) => effectiveSpark(state, E.catalog, id);

describe("whenReclaimSelf", () => {
  it("triggers from the stack on its own Reclaim, after the watchers in play, and the spark it gains there stays as it enters play", () => {
    const { state, ids } = setup({ player: { back: [D.watch.id], void: [D.construct.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [watch] = ids.player.back;
    const [construct] = ids.player.void;
    const played = fromVoid(state, "player", construct);
    expect(queued(played.events)).toEqual([watch, construct]);
    expect(subjects(played.events)).toEqual([construct, construct]);
    // Both resolve before the opponent receives priority, with the card still on the stack; it then resolves into play.
    const order = played.events.map((entry) => `${entry.kind}:${"instance" in entry ? String(entry.instance) : ""}`);
    const gained = order.indexOf(`sparkGained:${construct}`);
    expect(gained).toBeGreaterThan(order.indexOf(`cardPlayed:${construct}`));
    expect(gained).toBeLessThan(order.indexOf(`materialized:${construct}`));
    expect(played.state.sides.player.currentEnergy).toBe(1);
    const landed = resolved(played.state);
    expect(landed.instances[construct]?.zone).toBe("play");
    expect(landed.instances[construct]?.status.gainedSpark).toBe(1);
    expect(spark(landed, construct)).toBe(2);
  });

  it("does not trigger when its card is played from hand or by a play permission, nor for another reclaimed card", () => {
    const { state, ids } = setup({
      player: { hand: [D.construct.id, S.permitVoid.id], void: [D.construct.id, S.reclaimEvent.id], energy: 4, deck: filler },
      enemy: { deck: filler },
    });
    const [inHand, permit] = ids.player.hand;
    const [inVoid, reclaimEvent] = ids.player.void;
    const handPlay = resolved(fromHand(state, "player", inHand).state);
    expect(handPlay.instances[inHand]?.status.gainedSpark).toBe(0);
    // Another card's Reclaim is not this card's.
    const other = resolved(fromVoid(handPlay, "player", reclaimEvent).state);
    expect(other.instances[inVoid]?.status.gainedSpark).toBe(0);
    expect(other.instances[inHand]?.status.gainedSpark).toBe(0);
    // With a permission and Reclaim, the permission route (mode 0) is not a reclaim; Reclaim (mode 1) is.
    const permitted = resolved(fromHand(other, "player", permit).state);
    const byPermission = fromVoid(permitted, "player", inVoid, [0]);
    expect(queued(byPermission.events)).toEqual([]);
    expect(byPermission.state.instances[inVoid]?.status.gainedSpark).toBe(0);
    const byReclaim = fromVoid(permitted, "player", inVoid, [1]);
    expect(queued(byReclaim.events)).toEqual([inVoid]);
    expect(byReclaim.state.instances[inVoid]?.status.gainedSpark).toBe(1);
  });

  it("sees only its own Reclaim while it waits on the stack under another reclaimed card", () => {
    const { state, ids } = setup({
      player: { hand: [v.vanilla1.id], void: [D.interruptConstruct.id, D.interruptConstruct.id], energy: 1, deck: filler },
      enemy: { hand: [v.interruptEvent.id, v.interruptEvent.id], energy: 2, deck: filler },
    });
    const [first, second] = ids.player.void;
    const [enemyFirst, enemySecond] = ids.enemy.hand;
    const opened = fromHand(state, "player", ids.player.hand[0]);
    const firstResponse = fromHand(opened.state, "enemy", enemyFirst);
    const firstReclaim = fromVoid(firstResponse.state, "player", first);
    expect(queued(firstReclaim.events)).toEqual([first]);
    const secondResponse = fromHand(firstReclaim.state, "enemy", enemySecond);
    // The first is still on the stack as the second's play is announced; the enemy then cannot respond and the stack resolves.
    expect(secondResponse.state.stack.map((item) => (item.kind === "card" ? item.instance : null))).toContain(first);
    const secondReclaim = fromVoid(secondResponse.state, "player", second);
    expect(queued(secondReclaim.events)).toEqual([second]);
    expect([first, second].map((id) => secondReclaim.state.instances[id]?.status.gainedSpark)).toEqual([1, 1]);
  });

  it("gains again on each Reclaim when its reclaimed card is not banished", () => {
    const { state, ids } = setup({ player: { back: [D.keeper.id], hand: [S.dissolveWarriors.id], void: [D.construct.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [construct] = ids.player.void;
    const first = resolved(fromVoid(state, "player", construct).state);
    expect(spark(first, construct)).toBe(2);
    const dissolved = resolved(fromHand(first, "player", ids.player.hand[0]).state);
    expect(dissolved.instances[construct]?.zone).toBe("void");
    const second = resolved(fromVoid(dissolved, "player", construct).state);
    expect(second.instances[construct]?.status.gainedSpark).toBe(2);
    expect(spark(second, construct)).toBe(3);
  });

  it("gains nothing when its card leaves the stack before the trigger resolves", () => {
    const { state, ids } = setup({ player: { back: [D.preventer.id], void: [D.construct.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [preventer] = ids.player.back;
    const [construct] = ids.player.void;
    const played = fromVoid(state, "player", construct);
    // The watcher in play resolves first and prevents the reclaimed card, which is banished instead.
    expect(queued(played.events)).toEqual([preventer, construct]);
    expect(played.state.instances[construct]?.zone).toBe("banished");
    expect(played.events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: construct }));
    expect(played.events.some((entry) => entry.kind === "sparkGained")).toBe(false);
    expect(played.state.instances[construct]?.status.gainedSpark).toBe(0);
  });

  it("shows its trigger and the card's gain to both sides with nothing redacted", () => {
    const { state, ids } = setup({ player: { void: [D.construct.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [construct] = ids.player.void;
    const played = fromVoid(state, "player", construct);
    for (const viewer of ["player", "enemy"] as const) {
      const seen = played.events.flatMap((entry) => {
        const shown = eventSeenBy(entry, viewer, played.state);
        return shown === null ? [] : [shown];
      });
      expect(seen).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: construct, subject: construct }));
      expect(seen).toContainEqual(expect.objectContaining({ kind: "sparkGained", instance: construct }));
    }
    expect(played.events.filter((entry) => entry.kind === "triggerQueued" && entry.subjectHiddenFrom !== undefined)).toEqual([]);
    expect(eventRedactionViolations(played.events, state, played.state)).toEqual([]);
  });

  it("keeps its queued trigger on the stack card across a reload and resolves it identically through the fold", () => {
    const { state, ids } = setup({ player: { back: [D.mayDraw.id], void: [D.construct.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [mayDraw] = ids.player.back;
    const [construct] = ids.player.void;
    const action = { kind: "play", card: construct, from: "void" } as const;
    const inline = E.apply(state, "player", action, new ScriptedSource([true]));
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action });
    if (opened.kind !== "applied" || opened.error !== null) throw new Error("bounced");
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const reloaded: BattleSlice = { ...saved, committed: deserializeState(JSON.stringify(opened.slice.committed)) };
    const pending = createFoldAdapter(E, { checkEventPrefix: true }).pending(reloaded);
    if (pending === null) throw new Error("no trigger prompt after reload");
    expect(pending.prompt).toMatchObject({ side: "player", purpose: { role: "youMay", source: mayDraw } });
    expect(pending.display.triggerQueue.map((entry) => entry.source)).toEqual([construct]);
    const answered = createFoldAdapter(E, { checkEventPrefix: true }).reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    expect(stateHash(answered.slice.committed)).toBe(stateHash(inline.state));
    expect([...opened.published, ...answered.published]).toEqual(inline.events);
    expect(answered.slice.committed.instances[construct]?.status.gainedSpark).toBe(1);
  });

  it("keeps the reclaim and its later triggers queued when an earlier trigger fails as it resolves", () => {
    const { state, ids } = setup({ player: { back: [D.thrower.id], void: [D.construct.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [thrower] = ids.player.back;
    const [construct] = ids.player.void;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: construct, from: "void" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected the definition error");
    // The play step committed; the failing trigger step committed nothing, its gained 1● included.
    const committed = outcome.slice.committed;
    expect(outcome.slice.inFlight).toBeNull();
    expect(committed.instances[construct]?.zone).toBe("stack");
    expect(committed.triggerQueue.map((entry) => entry.source)).toEqual([thrower, construct]);
    expect(committed.sides.player.currentEnergy).toBe(0);
    expect(committed.instances[construct]?.status.gainedSpark).toBe(0);
    expect(outcome.published.some((entry) => entry.kind === "sparkGained" || entry.kind === "triggerResolved")).toBe(false);
  });
});

describe("whenReclaim", () => {
  it("matches only the named player's plays by Reclaim, by the card's type as it was played", () => {
    const { state, ids } = setup({
      player: { back: [D.watch.id, D.opponentEventWatch.id], hand: [v.vanilla1.id], void: [S.reclaimEvent.id, S.reclaimCharacter.id], energy: 1, deck: filler },
      enemy: { back: [D.opponentEventWatch.id], void: [S.reclaimEvent.id], deck: filler },
    });
    const [watch] = ids.player.back;
    const [enemyWatch] = ids.enemy.back;
    const [vanilla] = ids.player.hand;
    const [reclaimEvent, reclaimCharacter] = ids.player.void;
    const handPlay = fromHand(state, "player", vanilla);
    expect(queued(handPlay.events)).toEqual([]);
    const eventPlay = fromVoid(resolved(handPlay.state), "player", reclaimEvent);
    // The player's own watcher, then the enemy's "when the opponent reclaims an event"; the player's opponent watcher sees nothing.
    expect(queued(eventPlay.events)).toEqual([watch, enemyWatch]);
    const characterPlay = fromVoid(resolved(eventPlay.state), "player", reclaimCharacter);
    expect(queued(characterPlay.events)).toEqual([watch]);
    expect(characterPlay.state.sides.enemy.currentEnergy).toBe(1);
  });

  it("does not see its own card reclaimed, since it works in play", () => {
    const watchWithReclaim = card(30, "character", 5, () => [triggered(whenReclaim(), gainEnergy(1)), reclaim(energy(0))]);
    const engine = createEngine(testCatalog([watchWithReclaim]));
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { void: [watchWithReclaim.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const played = engine.apply(state, "player", { kind: "play", card: ids.player.void[0], from: "void" }, NO_PROMPTS);
    expect(queued(played.events)).toEqual([]);
  });
});

describe("thisCharacterSpark", () => {
  it("reads the source's effective spark as the effect resolves, before the gain that follows it, once per turn", () => {
    const { state, ids } = setup({ player: { back: [D.anthem.id, D.delver.id], void: [S.reclaimEvent.id, S.reclaimEvent.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [, delver] = ids.player.back;
    const [first, second] = ids.player.void;
    // 2✦ printed and +1✦ from the anthem: 3⍟, then the event's own 1⍟.
    const once = resolved(fromVoid(state, "player", first).state);
    expect(once.sides.player.score).toBe(4);
    expect(spark(once, delver!)).toBe(4);
    const twice = fromVoid(once, "player", second);
    expect(queued(twice.events)).toEqual([]);
    expect(resolved(twice.state).sides.player.score).toBe(5);
  });

  it("still resolves after the source left play, which then gains nothing, and a static ability cannot read it", () => {
    const { state, ids } = setup({ player: { back: [D.explorerKiller.id, D.delver.id], void: [D.construct.id], energy: 0, deck: filler }, enemy: { deck: filler } });
    const [killer, delver] = ids.player.back;
    const [construct] = ids.player.void;
    const played = fromVoid(state, "player", construct);
    expect(queued(played.events)).toEqual([killer, delver, construct]);
    expect(played.state.instances[delver!]?.zone).toBe("void");
    expect(played.events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: delver }));
    expect(played.state.instances[delver!]?.status.gainedSpark).toBe(0);

    const reader = setup({ player: { back: [D.selfReader.id], deck: filler }, enemy: { deck: filler } });
    expect(() => spark(reader.state, reader.ids.player.back[0]!)).toThrow("static ability");
  });
});
