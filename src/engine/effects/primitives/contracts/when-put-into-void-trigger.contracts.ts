/**
 * "When a … is put into your void" (`whenPutIntoVoid`; rules § Ability
 * Types → When a card is put into a void; RD-hv-umm2.77-1): every route into
 * a void announces `enteredVoid` once the card is there, and the trigger
 * matches the card as it is in that void, for the void's owner, if its
 * ability works where its card is at that moment.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, anyCharacter, characterYouControl, energy, event, stackItem, target } from "../../../dsl/builders";
import { triggered, whenPutIntoVoid } from "../../../dsl/triggers";
import type { CardFilter, FunctionalZone } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import { moveInstance } from "../../../rules/zones";
import { deserializeState, stateHash } from "../../../state/hash";
import type { AbilitySource, InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, placeFigment, type BoardSetup } from "../../../testing/board";
import { CONTINUOUS, CONTINUOUS_CARDS } from "../../../testing/continuous-cards";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { ZONE, ZONE_CARDS, ZONE_FIGMENT, ZONE_FIGMENTS } from "../../../testing/zone-cards";
import { abandon } from "../abandon";
import { banish } from "../banish";
import { costModifier } from "../cost-modifier";
import { discard } from "../discard";
import { dissolve } from "../dissolve";
import { draw } from "../draw";
import { erode } from "../erode";
import { foresee } from "../foresee";
import { gainEnergy } from "../gain-energy";
import { optional } from "../optional";
import { prevent } from "../prevent";
import { putFromTop } from "../put-in-deck";
import { returnToHand } from "../return-to-hand";
import { staticAbility } from "../../../dsl/builders";

const SMALL: CardFilter = { cardType: "character", costAtMost: 2 };

function character(index: number, cost: number, spark: number, abilities: EngineCardDefinition["abilities"], subtype = "Warrior"): EngineCardDefinition {
  return { ...v.vanilla1, id: syntheticId(1700 + index), costs: [energy(cost)], spark, subtype: subtype as EngineCardDefinition["subtype"], status: "authored", abilities };
}
function watcher(index: number, cost: number, spark: number, options: { player?: "you" | "opponent"; filter?: CardFilter; zone?: FunctionalZone } = {}): EngineCardDefinition {
  return character(index, cost, spark, () => [
    triggered(whenPutIntoVoid(options.player ?? "you", options.filter ?? SMALL), gainEnergy(1), options.zone === undefined ? {} : { zone: options.zone }),
  ]);
}
function spell(index: number, effect: Parameters<typeof event>[0], speed: EngineCardDefinition["speed"] = "standard"): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(1700 + index), speed, status: "authored", abilities: () => [event(effect)] };
}

const W = {
  /** "When a ≤2● cost character is put into your void, gain 1●." — 5●, 1✦: never matches itself. */
  watch: watcher(1, 5, 1),
  /** The same ability on a 1● card, which would match itself. */
  selfWatch: watcher(2, 1, 1),
  /** The same ability working in the void. */
  voidWatch: watcher(3, 1, 1, { zone: "void" }),
  /** "When a ≤2● cost character is put into the opponent's void, gain 1●." */
  opponentWatch: watcher(4, 5, 1, { player: "opponent" }),
  /** "When a card is put into your void, gain 1●." */
  cardWatch: watcher(5, 5, 1, { filter: {} }),
  /** "When a Mage is put into your void, gain 1●." */
  mageWatch: watcher(6, 5, 1, { filter: { subtype: "Mage" as CardFilter["subtype"] } }),
  /** "When a ≤2● cost character is put into your void, you may draw a card." */
  mayDraw: character(7, 5, 1, () => [triggered(whenPutIntoVoid("you", SMALL), optional(draw(1)))]),
  mage: character(8, 1, 1, () => [], "Mage"),
  /** "Characters cost you 2● less." */
  discount: character(9, 5, 1, () => [staticAbility(costModifier("you", { cardType: "character" }, -2))]),
} as const;
const S = {
  dissolveOne: spell(20, dissolve(target(anyCharacter()))),
  dissolveTwo: spell(21, dissolve(target(anyCharacter(), 2))),
  sweep: spell(22, dissolve(all(characterYouControl({ sparkAtMost: 1 })))),
  abandonOne: spell(23, abandon()),
  discardOne: spell(24, discard(1)),
  erodeTwo: spell(25, erode(2)),
  foreseeTwo: spell(26, foresee(2)),
  digTwo: spell(27, putFromTop(2, [{ to: "top", count: 1 }, { to: "void", count: "rest" }])),
  preventIt: spell(28, prevent(stackItem({ controller: "opponent" })), "interrupt"),
  banishOne: spell(29, banish(target(anyCharacter()))),
  bounceOne: spell(30, returnToHand(target(anyCharacter()))),
  /** Puts the top card of its controller's deck into the void, then fails. */
  failing: { ...v.event0, id: syntheticId(1731), status: "authored", abilities: () => [], synthetic: {
    resolve(ctx, item) {
      const [top] = ctx.state.sides[item.controller].deck;
      if (top !== undefined) moveInstance(ctx, top, "void");
      throw new Error("synthetic failure after a card entered the void");
    },
  } } satisfies EngineCardDefinition,
} as const;

const E = createEngine(testCatalog([...ZONE_CARDS, ...CONTINUOUS_CARDS, ...Object.values(W), ...Object.values(S)], {}, ZONE_FIGMENTS));
const deck = Array.from({ length: 6 }, () => v.vanilla3.id);

function setup(board: Omit<BoardSetup, "phase" | "active"> & Partial<Pick<BoardSetup, "active">>) {
  return boardState(E.catalog, { active: "player", phase: "day", ...board });
}
function cast(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []) {
  if (card === undefined) throw new Error("no card");
  const source = new ScriptedSource(answers);
  const result = E.apply(state, side, { kind: "play", card, from: "hand" }, answers.length === 0 ? NO_PROMPTS : source);
  if (answers.length > 0) source.assertExhausted();
  expect(invariantViolations(result.state, E.catalog)).toEqual([]);
  return result;
}
function queued(events: readonly EngineEvent[]): (AbilitySource | null)[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
}
function subjects(events: readonly EngineEvent[]): (InstanceId | null)[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.subject] : []));
}
function entered(events: readonly EngineEvent[]): InstanceId[] {
  return events.flatMap((entry) => (entry.kind === "enteredVoid" ? [entry.instance] : []));
}

describe("whenPutIntoVoid", () => {
  it("triggers on a dissolve and an abandon, once the character is in the void", () => {
    const { state, ids } = setup({ player: { back: [W.watch.id, v.vanilla2.id, v.vanilla1.id], hand: [S.dissolveOne.id, S.abandonOne.id], energy: 0, deck }, enemy: { deck } });
    const [watch, two, one] = ids.player.back;
    const dissolved = cast(state, "player", ids.player.hand[0], [[two!]]);
    const at = dissolved.events.findIndex((entry) => entry.kind === "enteredVoid" && entry.instance === two);
    expect(dissolved.events.slice(at - 1, at + 3).map((entry) => entry.kind)).toEqual(["leftPlay", "enteredVoid", "triggerQueued", "dissolved"]);
    expect(subjects(dissolved.events)).toEqual([two]);
    const abandoned = cast(dissolved.state, "player", ids.player.hand[1], [[one!]]);
    expect(queued(abandoned.events)).toEqual([watch]);
    expect(subjects(abandoned.events)).toEqual([one]);
    expect(abandoned.state.sides.player.currentEnergy).toBe(2);
  });

  it("triggers on a discard, an erode, a foresee, a put-the-rest-into-your-void, and a prevent, from any zone", () => {
    const { state, ids } = setup({
      player: { back: [W.watch.id], hand: [S.discardOne.id, v.vanilla2.id, S.erodeTwo.id, S.foreseeTwo.id, S.digTwo.id], deck: [v.vanilla1.id, v.vanilla3.id, v.vanilla2.id, v.vanilla1.id, v.vanilla2.id, v.vanilla1.id], energy: 0 },
      enemy: { deck },
    });
    const [discardCard, small, erodeCard, foreseeCard, digCard] = ids.player.hand;
    const [d0, d1, d2, d3, d4, d5] = ids.player.deck;
    const discarded = cast(state, "player", discardCard, [[small]]);
    expect(subjects(discarded.events)).toEqual([small]);
    const eroded = cast(discarded.state, "player", erodeCard);
    // A 1● and a 3● character: only the first matches.
    expect(entered(eroded.events)).toEqual([d0, d1, erodeCard]);
    expect(subjects(eroded.events)).toEqual([d0]);
    const foreseen = cast(eroded.state, "player", foreseeCard, [[{ card: d2, to: "void" }, { card: d3, to: "void" }]]);
    expect(subjects(foreseen.events)).toEqual([d2, d3]);
    const dug = cast(foreseen.state, "player", digCard, [[{ card: d4, to: "top" }, { card: d5, to: "void" }]]);
    expect(subjects(dug.events)).toEqual([d5]);
    expect(dug.state.sides.player.currentEnergy).toBe(5);
    // The opponent prevents a 2● character the player plays: it goes from the stack to its owner's void.
    const enemyTurn = setup({ active: "enemy", player: { back: [W.watch.id], hand: [S.preventIt.id], energy: 0, deck }, enemy: { back: [W.watch.id], hand: [v.vanilla2.id], energy: 2, deck } });
    const played = E.apply(enemyTurn.state, "enemy", { kind: "play", card: enemyTurn.ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
    // The only card on the stack is chosen automatically.
    const prevented = cast(played.state, "player", enemyTurn.ids.player.hand[0]);
    expect(prevented.state.instances[enemyTurn.ids.enemy.hand[0]]?.zone).toBe("void");
    expect(queued(prevented.events)).toEqual([enemyTurn.ids.enemy.back[0]]);
  });

  it("sees a resolved event card only when its filter takes events, and never a banish, a return to hand, a figment, or a reclaimed card", () => {
    const { state, ids } = setup({
      player: { back: [W.watch.id, W.cardWatch.id, v.vanilla1.id, v.vanilla1.id, v.vanilla1.id], hand: [S.banishOne.id, S.bounceOne.id, S.dissolveOne.id, S.abandonOne.id], energy: 0, deck },
      enemy: { deck },
    });
    const [watch, cardWatch, banished, bounced, reclaimed] = ids.player.back;
    const [banishCard, bounceCard, dissolveCard, abandonCard] = ids.player.hand;
    const figment = placeFigment(state, "player", { rank: "back", index: 5 }, { kind: "figment", figment: ZONE_FIGMENT.warrior.id, spark: 1 });
    state.instances[reclaimed!].status.reclaimed = true;
    let next = cast(state, "player", banishCard, [[banished!]]);
    // The resolved event card itself enters the void: a card, but no character.
    expect(entered(next.events)).toEqual([banishCard]);
    expect(queued(next.events)).toEqual([cardWatch]);
    next = cast(next.state, "player", bounceCard, [[bounced!]]);
    expect(queued(next.events)).toEqual([cardWatch]);
    next = cast(next.state, "player", dissolveCard, [[figment]]);
    expect(next.state.instances[figment]).toBeUndefined();
    expect(queued(next.events)).toEqual([cardWatch]);
    next = cast(next.state, "player", abandonCard, [[reclaimed!]]);
    expect(next.state.instances[reclaimed!]?.zone).toBe("banished");
    expect(entered(next.events)).toEqual([abandonCard]);
    expect(queued(next.events)).toEqual([cardWatch]);
    expect(queued(next.events)).not.toContain(watch);
  });

  it("matches the card as it is in the void: types it had only in play and cost changes do not count", () => {
    const { state, ids } = setup({
      player: { back: [CONTINUOUS.everyType.id, W.mageWatch.id, W.watch.id, W.discount.id, v.vanilla1.id, W.mage.id], hand: [S.dissolveOne.id, S.dissolveOne.id, v.vanilla3.id, S.discardOne.id], energy: 0, deck },
      enemy: { deck },
    });
    const [, mageWatch, watch, , warrior, mage] = ids.player.back;
    const [first, second, three, discardCard] = ids.player.hand;
    const warriorGone = cast(state, "player", first, [[warrior!]]);
    // A Mage in play only through the static: a Warrior in the void.
    expect(queued(warriorGone.events)).toEqual([watch]);
    const mageGone = cast(warriorGone.state, "player", second, [[mage!]]);
    expect(queued(mageGone.events)).toEqual([mageWatch, watch]);
    // "Characters cost you 2● less" changes what a 3● character costs to play, not its cost.
    const discarded = cast(mageGone.state, "player", discardCard);
    expect(discarded.state.instances[three]?.zone).toBe("void");
    expect(queued(discarded.events)).toEqual([]);
  });

  it("triggers for the void's owner: both sides' watchers, a stolen character, and a stolen watcher, the active side first", () => {
    const { state, ids } = setup({
      player: { back: [W.watch.id, W.opponentWatch.id, v.vanilla1.id], hand: [S.dissolveTwo.id], energy: 0, deck },
      enemy: { back: [W.watch.id, v.vanilla2.id], deck },
    });
    const [watch, opponentWatch, mine] = ids.player.back;
    const [enemyWatch, theirs] = ids.enemy.back;
    const both = cast(state, "player", ids.player.hand[0], [[theirs!, mine!]]);
    expect(queued(both.events)).toEqual([opponentWatch, enemyWatch, watch]);
    expect(subjects(both.events)).toEqual([theirs, theirs, mine]);

    const stolen = setup({
      active: "enemy",
      player: { back: [W.watch.id, v.vanilla1.id], deck },
      enemy: { back: [W.watch.id, v.vanilla1.id], hand: [ZONE.seize.id, ZONE.seize.id, S.dissolveOne.id, S.dissolveOne.id], energy: 6, deck },
    });
    const [playerWatch, small] = stolen.ids.player.back;
    const [enemyOwn, enemySmall] = stolen.ids.enemy.back;
    const [seizeSmall, seizeWatch, kill, killOwn] = stolen.ids.enemy.hand;
    let next = cast(stolen.state, "enemy", seizeSmall, [[small!]]).state;
    next = cast(next, "enemy", seizeWatch).state;
    expect(next.instances[playerWatch!]?.controller).toBe("enemy");
    // The enemy dissolves the stolen character: it goes to its owner's void, which no watcher controlled by the player watches now.
    const killed = cast(next, "enemy", kill, [[small!]]);
    expect(killed.state.sides.player.void).toContain(small);
    expect(queued(killed.events)).toEqual([]);
    // The enemy's own small character goes to the enemy's void, which the stolen watcher now watches too.
    const own = cast(killed.state, "enemy", killOwn, [[enemySmall!]]);
    expect(queued(own.events)).toEqual([enemyOwn, playerWatch]);
    expect(own.state.sides.enemy.currentEnergy).toBe(2);
  });

  it("never sees its own card put into a void from play, sees nothing once there, and sees one entry at a time", () => {
    const { state, ids } = setup({
      player: { back: [v.vanilla1.id, W.selfWatch.id, v.vanilla1.id, W.watch.id], hand: [S.sweep.id], energy: 0, deck },
      enemy: { deck },
    });
    const [first, self, last, watch] = ids.player.back;
    const result = cast(state, "player", ids.player.hand[0]);
    // The sweep dissolves B0, B1, B2, B3 one at a time. The 1● watcher sees B0 and leaves before B2; the 5● watcher sees B0, B1 and B2.
    expect(entered(result.events).slice(0, 4)).toEqual([first, self, last, watch]);
    expect(queued(result.events)).toEqual([self, watch, watch, watch]);
    expect(subjects(result.events)).toEqual([first, first, self, last]);
  });

  it("works in the void when its ability says so, seeing its own arrival and later ones", () => {
    const { state, ids } = setup({
      player: { back: [W.voidWatch.id, v.vanilla1.id], hand: [S.dissolveOne.id, S.dissolveOne.id], energy: 0, deck },
      enemy: { deck },
    });
    const [voidWatch, small] = ids.player.back;
    const own = cast(state, "player", ids.player.hand[0], [[voidWatch!]]);
    expect(queued(own.events)).toEqual([voidWatch]);
    expect(subjects(own.events)).toEqual([voidWatch]);
    const later = cast(own.state, "player", ids.player.hand[1]);
    expect(later.state.instances[small!]?.zone).toBe("void");
    expect(queued(later.events)).toEqual([voidWatch]);
    expect(later.state.sides.player.currentEnergy).toBe(2);
  });

  it("names an eroded card from a hidden deck to both sides once it is in the void, with nothing redacted", () => {
    const { state, ids } = setup({ player: { back: [W.watch.id], hand: [S.erodeTwo.id], energy: 0, deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] }, enemy: { deck } });
    const [top, second] = ids.player.deck;
    expect(E.view(state, "enemy").instances[top]).toBeUndefined();
    const result = cast(state, "player", ids.player.hand[0]);
    for (const viewer of ["player", "enemy"] as const) {
      const seen = result.events.flatMap((entry) => {
        const shown = eventSeenBy(entry, viewer, result.state);
        return shown === null ? [] : [shown];
      });
      expect(seen.filter((entry) => entry.kind === "enteredVoid").map((entry) => entry.kind === "enteredVoid" && entry.from)).toEqual(["deck", "deck", "stack"]);
      expect(subjects(seen)).toEqual([top, second]);
    }
    expect(result.events.filter((entry) => entry.kind === "triggerQueued" && entry.subjectHiddenFrom !== undefined)).toEqual([]);
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
  });

  it("keeps a queued trigger across a reload and resolves it identically through the fold", () => {
    const { state, ids } = setup({ player: { back: [W.mayDraw.id, v.vanilla2.id], hand: [S.dissolveOne.id], energy: 0, deck }, enemy: { deck } });
    const [, small] = ids.player.back;
    const action = { kind: "play", card: ids.player.hand[0], from: "hand" } as const;
    const inline = E.apply(state, "player", action, new ScriptedSource([[small!], true]));
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opened = fold.reduce(start, { kind: "battleAction", side: "player", action });
    if (opened.kind !== "applied") throw new Error("bounced");
    const targeted = fold.pending(opened.slice);
    if (targeted === null) throw new Error("no target prompt");
    const chosen = fold.reduce(opened.slice, { kind: "answer", side: "player", promptId: targeted.prompt.id, value: [small!] });
    if (chosen.kind !== "applied" || chosen.error !== null) throw new Error("target failed");
    const saved = JSON.parse(JSON.stringify(chosen.slice)) as BattleSlice;
    const reloaded: BattleSlice = { ...saved, committed: deserializeState(JSON.stringify(chosen.slice.committed)) };
    const pending = createFoldAdapter(E, { checkEventPrefix: true }).pending(reloaded);
    if (pending === null) throw new Error("no trigger prompt after reload");
    expect(pending.prompt).toMatchObject({ side: "player", purpose: { role: "youMay", source: ids.player.back[0] } });
    expect(pending.display.sides.player.void).toContain(small);
    const answered = createFoldAdapter(E, { checkEventPrefix: true }).reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    expect(stateHash(answered.slice.committed)).toBe(stateHash(inline.state));
    expect([...opened.published, ...chosen.published, ...answered.published]).toEqual(inline.events);
    expect(answered.slice.committed.sides.player.hand).toHaveLength(1);
  });

  it("queues nothing from a step that fails after a card entered the void", () => {
    const { state, ids } = setup({ player: { back: [W.watch.id], hand: [S.failing.id], energy: 0, deck: [v.vanilla1.id, v.vanilla1.id] }, enemy: { deck } });
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic failure");
    expect(outcome.error.message).toContain("synthetic failure after a card entered the void");
    expect(outcome.published.some((entry) => entry.kind === "enteredVoid" || entry.kind === "triggerQueued")).toBe(false);
    expect(outcome.slice.committed.triggerQueue).toEqual([]);
    expect(outcome.slice.committed.sides.player.void).toEqual([]);
    expect(outcome.slice.committed.sides.player.currentEnergy).toBe(0);
  });
});
