/**
 * "When you abandon …" looks back (`whenAbandon`; rules § Ability Types →
 * When you abandon a character; RD-hv-umm2.532-1), on synthetic cards: as a
 * character leaves play, the abandon abilities that work where their cards
 * are and match it as it is in play are armed, its own among them, and its
 * `abandoned` event fires exactly those, whether an effect, a cost, or a
 * Prevent's ransom abandoned it.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, activated, all, characterYouControl, energy, event, fromVoid, keyword, self, stackItem, staticAbility, target } from "../../../dsl/builders";
import { either, onMaterialized, triggered, whenAbandon, whenDissolved, whenPutIntoVoid, whileSourceInPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { instanceOrigin } from "../../../rules/activation";
import { addFloating, endFloating } from "../../../rules/floating";
import { dissolve, instanceOf } from "../../../rules/zones";
import { copyJson } from "../../../state/clone";
import { deserializeState, stateHash } from "../../../state/hash";
import type { AbilitySource, InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, placeFigment, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { resolveEffect } from "../../interpreter";
import { abandon } from "../abandon";
import { banishCards } from "../banish-cards";
import { disableTriggers } from "../disable-triggers";
import { draw } from "../draw";
import { delayed, floating } from "../floating-trigger";
import { gainAbilities } from "../gain-abilities";
import { gainEnergy } from "../gain-energy";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { giveAllTypes } from "../give-all-types";
import { optional } from "../optional";
import { prevent } from "../prevent";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";

const cardId = (index: number) => syntheticId(0xab5320 + index);

function card(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return {
    id: cardId(index), cardType, costs: [energy(0)], spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "", speed: "standard", status: "authored", abilities, ...extra,
  };
}

const A = {
  /** "When you abandon a character, draw a card and this character gains +1✦." */
  specter: card(0, "character", () => [triggered(whenAbandon("you", { cardType: "character" }), sequence(draw(1), gainSpark(self(), 1)))]),
  /** "When you abandon a character, gain 1⍟." */
  watcher: card(1, "character", () => [triggered(whenAbandon(), gainPoints(1))]),
  /** "When you abandon a Mage, gain 1⍟." */
  mageWatcher: card(2, "character", () => [triggered(whenAbandon("you", { subtype: "Mage" }), gainPoints(1))]),
  /** "Characters you control have all character types." */
  shifter: card(3, "character", () => [staticAbility(giveAllTypes(all(characterYouControl())))]),
  /** "Abandon a character: Gain 1●." */
  altar: card(4, "character", () => [activated([abandonCost()], gainEnergy(1))]),
  /** "Abandon two characters: Gain 1●." */
  altarTwo: card(5, "character", () => [activated([abandonCost({}, 2)], gainEnergy(1))]),
  /** "Abandon a character." */
  cull: card(6, "event", () => [event(abandon())]),
  /** "The opponent abandons a character." */
  tax: card(7, "event", () => [event(abandon("opponent"))]),
  /** "When you abandon a character, you may draw a card." */
  maySpecter: card(8, "character", () => [triggered(whenAbandon(), optional(draw(1)))]),
  /** "Prevent a card the opponent played unless they abandon a non-figment character." */
  ransom: card(9, "event", () => [event(prevent(stackItem({ controller: "opponent" }), { unlessAbandons: { figment: false } }))], { speed: "interrupt" }),
  /** "Gain 1●." */
  study: card(10, "event", () => [event(gainEnergy(1))]),
  /** "0●: Banish a character from the opponent's void. This character gains its abilities." */
  collector: card(11, "character", () => [activated([energy(0)], gainAbilities(banishCards([fromVoid({ cardType: "character" }, { player: "opponent" })])))]),
  /** "Return a character you control to hand." */
  returner: card(12, "event", () => [event(returnToHand(target(characterYouControl())))]),
  /** "▸Materialized: While this character is in play, when you abandon a character, gain 1⍟." */
  floater: card(13, "character", () => [triggered(onMaterialized(), floating(whenAbandon(), gainPoints(1), whileSourceInPlay()))]),
  /** "Once per turn, when you abandon a character, gain 1⍟." */
  onceWatcher: card(15, "character", () => [triggered(whenAbandon(), gainPoints(1), { oncePerTurn: true })]),
  /** "Reclaim. 0●: Banish a character from the opponent's void. This character gains its abilities." */
  reclaimCollector: card(16, "character", () => [keyword("reclaim"), activated([energy(0)], gainAbilities(banishCards([fromVoid({ cardType: "character" }, { player: "opponent" })])))]),
  /** "▸Materialized: This character's triggered abilities don't trigger while it is in play. When you abandon a character, gain 1⍟." */
  hermit: card(17, "character", () => [triggered(onMaterialized(), disableTriggers(self(), whileSourceInPlay())), triggered(whenAbandon(), gainPoints(1))]),
  /** "Until end of turn, a character you control's triggered abilities don't trigger while you control no characters." */
  hush: card(18, "event", () => [event(disableTriggers(target(characterYouControl()), "untilEndOfTurn", { cond: "controls", selector: characterYouControl(), atLeast: 0, atMost: 0 }))]),
  /** "Once per turn, when you abandon a character or a character you control is dissolved, gain 1⍟." */
  onceEither: card(19, "character", () => [triggered(either(whenAbandon(), whenDissolved()), gainPoints(1), { oncePerTurn: true })]),
  /** "Once per turn, when you abandon a character or a card is put into your void, gain 1⍟." */
  onceVoid: card(20, "character", () => [triggered(either(whenAbandon(), whenPutIntoVoid()), gainPoints(1), { oncePerTurn: true })]),
  /** "The next time you abandon a character or a character you control is dissolved, gain 1⍟." */
  nextTime: card(21, "event", () => [event(delayed(either(whenAbandon(), whenDissolved()), gainPoints(1)))]),
  /** "▸Materialized: While this character is in play, the next time you abandon a character or a character you control is dissolved, gain 1⍟." */
  nextWhile: card(22, "character", () => [triggered(onMaterialized(), delayed(either(whenAbandon(), whenDissolved()), gainPoints(1), whileSourceInPlay()))]),
  /**
   * As it resolves: the player's first back-rank character gains `onceWatcher`'s ability, the second is abandoned, that gain
   * ends, the first gains `onceEither`'s ability at the same index in its place, and the first is abandoned.
   */
  regain: card(23, "event", () => [], {
    synthetic: {
      resolve(ctx, item) {
        const [holder, other] = ctx.state.sides[item.controller].backRank;
        const gain = (index: number) => addFloating(ctx, {
          controller: item.controller, source: item.instance, expiry: { at: "never" },
          change: { kind: "abilities", instance: holder!, cardId: cardId(index), variant: copyJson(instanceOf(ctx.state, holder!).variant) },
        });
        const first = gain(15);
        dissolve(ctx, other!, null, true);
        endFloating(ctx, (effect) => effect.id === first);
        gain(19);
        dissolve(ctx, holder!, null, true);
      },
    },
  }),
  /** Abandons the player's first back-rank character as it resolves, then fails. */
  failing: card(14, "event", () => [], {
    synthetic: {
      resolve(ctx, item) {
        resolveEffect(ctx, abandon(), {
          source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
          ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
        });
        throw new Error("synthetic failure after abandonment");
      },
    },
  }),
} as const;

const E = createEngine(testCatalog(Object.values(A)));
const deck = Array.from({ length: 6 }, () => v.vanilla1.id);

function setup(player: SideSetup, enemy: SideSetup = {}, active: Side = "player") {
  return boardState(E.catalog, { active, phase: "day", player: { deck, energy: 5, ...player }, enemy: { deck, energy: 5, ...enemy } });
}

/** Applies `action` for `side`, then passes until the stack and trigger queue are empty, checking every change is announced. */
function act(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const first = E.apply(state, side, action, source);
  const rest = passUntil(E, first.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  source.assertExhausted();
  const events: EngineEvent[] = [...first.events, ...rest.events];
  expect(invariantViolations(rest.state, E.catalog)).toEqual([]);
  expect(unannouncedChanges(events, state, rest.state)).toEqual([]);
  return { state: rest.state, events };
}
const play = (card: InstanceId | null | undefined): Action => ({ kind: "play", card: card!, from: "hand" });
const activate = (source: InstanceId | null | undefined, ability = 0): Action => ({ kind: "activate", source: source!, ability });
function queued(events: readonly EngineEvent[]): { source: AbilitySource | null; subject: InstanceId | null }[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [{ source: entry.source, subject: entry.subject }] : []));
}
const gained = (state: BattleState, id: InstanceId | null | undefined) => state.instances[id!]?.status.gainedSpark;

describe("abandon look-back", () => {
  it("triggers a character's own ability once as an effect abandons it, after the abilities still in play, and gains no ✦ out of play", () => {
    const { state, ids } = setup({ back: [A.watcher.id, A.specter.id], hand: [A.cull.id] });
    const [watcher, specter] = ids.player.back;
    const { state: after, events } = act(state, "player", play(ids.player.hand[0]), [[specter!]]);
    expect(after.instances[specter!]?.zone).toBe("void");
    expect(queued(events)).toEqual([{ source: watcher, subject: specter }, { source: specter, subject: specter }]);
    expect(after.sides.player.hand).toHaveLength(1);
    expect(after.sides.player.score).toBe(1);
    expect(gained(after, specter)).toBe(0);
    expect(events.some((entry) => entry.kind === "sparkGained")).toBe(false);
  });

  it("triggers it once as it is abandoned to pay a cost", () => {
    const { state, ids } = setup({ back: [A.altar.id, A.specter.id] });
    const [altar, specter] = ids.player.back;
    const { state: after, events } = act(state, "player", activate(altar), [[specter!]]);
    expect(queued(events)).toEqual([{ source: specter, subject: specter }]);
    expect(after.sides.player.hand).toHaveLength(1);
    expect(after.sides.player.currentEnergy).toBe(6);
  });

  it("triggers once for another character's abandon, gaining +1✦ in play", () => {
    const { state, ids } = setup({ back: [A.specter.id, v.vanilla1.id], hand: [A.cull.id] });
    const [specter, vanilla] = ids.player.back;
    const { state: after, events } = act(state, "player", play(ids.player.hand[0]), [[vanilla!]]);
    expect(queued(events)).toEqual([{ source: specter, subject: vanilla }]);
    expect(gained(after, specter)).toBe(1);
    expect(after.sides.player.hand).toHaveLength(1);
  });

  it("abandons several characters one at a time, in slot order: one abandoned first does not see the later ones", () => {
    for (const specterFirst of [true, false]) {
      const back = specterFirst ? [A.altarTwo.id, A.specter.id, v.vanilla1.id] : [A.altarTwo.id, v.vanilla1.id, A.specter.id];
      const { state, ids } = setup({ back });
      const [altar, first, second] = ids.player.back;
      const [specter, vanilla] = specterFirst ? [first!, second!] : [second!, first!];
      const { events } = act(state, "player", activate(altar), [[first!, second!]]);
      expect(events.flatMap((entry) => (entry.kind === "abandoned" ? [entry.instance] : []))).toEqual([first, second]);
      // The specter sees its own abandon, and the other only while it is still in play.
      expect(queued(events)).toEqual(specterFirst
        ? [{ source: specter, subject: specter }]
        : [{ source: specter, subject: vanilla }, { source: specter, subject: specter }]);
    }
  });

  it("matches the character as it was in play: a type it had only there", () => {
    const { state, ids } = setup({ back: [A.shifter.id, A.mageWatcher.id, v.vanilla1.id], hand: [A.cull.id] });
    const [, mageWatcher, vanilla] = ids.player.back;
    const { state: after, events } = act(state, "player", play(ids.player.hand[0]), [[vanilla!]]);
    expect(queued(events)).toEqual([{ source: mageWatcher, subject: vanilla }]);
    expect(after.sides.player.score).toBe(1);
  });

  it("reads its abilities as it was in play: a gained ability sees its own abandon, one lost before it left does not", () => {
    const { state, ids } = setup({ back: [A.collector.id], hand: [A.cull.id, A.returner.id, A.cull.id] }, { void: [A.specter.id] });
    const [collector] = ids.player.back;
    const [cull, returner, again] = ids.player.hand;
    // Each prompt here has one legal answer, which the engine gives itself.
    const collected = act(state, "player", activate(collector)).state;
    expect(collected.instances[collector!]?.status.gainedAbilities).toHaveLength(1);
    const own = act(collected, "player", play(cull));
    // Its gained abilities end as it leaves play, yet the abandon reads them as they were.
    expect(own.state.instances[collector!]?.status.gainedAbilities).toBeUndefined();
    expect(queued(own.events)).toEqual([{ source: collector, subject: collector }]);
    expect(own.state.sides.player.hand).toHaveLength(3);

    const returned = act(collected, "player", play(returner));
    const replayed = act(returned.state, "player", play(collector)).state;
    expect(replayed.instances[collector!]?.status.gainedAbilities).toBeUndefined();
    const lost = act(replayed, "player", play(again));
    expect(lost.events.some((entry) => entry.kind === "abandoned" && entry.instance === collector)).toBe(true);
    expect(queued(lost.events)).toEqual([]);
  });

  it("does not trigger a gained once-per-turn ability already used this turn again on its own card's abandon", () => {
    const { state, ids } = setup({ back: [A.collector.id, v.vanilla1.id], hand: [A.cull.id, A.cull.id] }, { void: [A.onceWatcher.id] });
    const [collector, vanilla] = ids.player.back;
    const [first, second] = ids.player.hand;
    const collected = act(state, "player", activate(collector)).state;
    const used = act(collected, "player", play(first), [[vanilla!]]);
    expect(queued(used.events)).toEqual([{ source: collector, subject: vanilla }]);
    const own = act(used.state, "player", play(second));
    expect(own.events.some((entry) => entry.kind === "abandoned" && entry.instance === collector)).toBe(true);
    expect(queued(own.events)).toEqual([]);
    expect(own.state.sides.player.score).toBe(1);
  });

  it("triggers an unused gained once-per-turn ability on its own card's abandon without limiting one it gains after returning that turn", () => {
    const { state, ids } = setup({ back: [A.reclaimCollector.id, v.vanilla1.id], hand: [A.cull.id, A.cull.id] }, { void: [A.onceWatcher.id, A.onceWatcher.id] });
    const [collector, vanilla] = ids.player.back;
    const [first, second] = ids.player.hand;
    const [watcher, again] = ids.enemy.void;
    const collected = act(state, "player", activate(collector, 1), [[watcher]]).state;
    const own = act(collected, "player", play(first), [[collector!]]);
    expect(queued(own.events)).toEqual([{ source: collector, subject: collector }]);
    expect(own.state.sides.player.score).toBe(1);
    const returned = act(own.state, "player", { kind: "play", card: collector!, from: "void" }).state;
    const regained = act(returned, "player", activate(collector, 1)).state;
    expect(regained.instances[collector!]?.status.gainedAbilities).toHaveLength(1);
    expect(regained.instances[again]?.zone).toBe("banished");
    const later = act(regained, "player", play(second), [[vanilla!]]);
    expect(queued(later.events)).toEqual([{ source: collector, subject: vanilla }]);
    expect(later.state.sides.player.score).toBe(2);
  });

  it("reads trigger suppression as of just before the character left play", () => {
    // Disabled only while it is in play: suppressed for another's abandon and for its own.
    const hermit = setup({ back: [v.vanilla1.id], hand: [A.hermit.id, A.cull.id, A.cull.id] });
    const [hermitCard, first, second] = hermit.ids.player.hand;
    const materialized = act(hermit.state, "player", play(hermitCard)).state;
    const other = act(materialized, "player", play(first), [[hermit.ids.player.back[0]!]]);
    expect(queued(other.events)).toEqual([]);
    const own = act(other.state, "player", play(second));
    expect(own.events.some((entry) => entry.kind === "abandoned" && entry.instance === hermitCard)).toBe(true);
    expect(queued(own.events)).toEqual([]);
    expect(own.state.sides.player.score).toBe(0);

    // Disabled only once its side controls no characters, which its own abandon makes true: it still triggers.
    const hushed = setup({ back: [A.watcher.id], hand: [A.hush.id, A.cull.id] });
    const watcher = hushed.ids.player.back[0]!;
    const [hush, cull] = hushed.ids.player.hand;
    const quiet = act(hushed.state, "player", play(hush));
    expect(quiet.state.floating.map((effect) => effect.change.kind)).toEqual(["disableTriggers"]);
    const abandoned = act(quiet.state, "player", play(cull));
    expect(queued(abandoned.events)).toEqual([{ source: watcher, subject: watcher }]);
    expect(abandoned.state.sides.player.score).toBe(1);
  });

  it("triggers only for the side that abandons, and a stolen character's own ability for the side that controlled it", () => {
    const { state, ids } = setup({ back: [v.vanilla1.id, A.watcher.id], hand: [A.cull.id, A.tax.id] }, { back: [A.watcher.id, A.specter.id] });
    const [vanilla, playerWatcher] = ids.player.back;
    const [enemyWatcher, enemySpecter] = ids.enemy.back;
    const own = act(state, "player", play(ids.player.hand[0]), [[vanilla!]]);
    expect(queued(own.events)).toEqual([{ source: playerWatcher, subject: vanilla }]);
    const taxed = act(own.state, "player", play(ids.player.hand[1]), [[enemySpecter!]]);
    expect(queued(taxed.events)).toEqual([{ source: enemyWatcher, subject: enemySpecter }, { source: enemySpecter, subject: enemySpecter }]);
    expect(taxed.state.sides.player.score).toBe(1);
    expect(taxed.state.sides.enemy.score).toBe(1);

    // The player controls the enemy's specter: abandoned, it goes to the enemy's void and triggers for the player.
    const stolen = setup({ back: [A.watcher.id], hand: [A.cull.id] }, { back: [A.specter.id, A.watcher.id] });
    const specter = stolen.ids.enemy.back[0]!;
    stolen.state.sides.enemy.backRank[0] = null;
    stolen.state.sides.player.backRank[1] = specter;
    stolen.state.instances[specter] = { ...stolen.state.instances[specter], controller: "player" };
    const sent = act(stolen.state, "player", play(stolen.ids.player.hand[0]), [[specter]]);
    expect(sent.state.sides.enemy.void).toEqual([specter]);
    expect(queued(sent.events)).toEqual([{ source: stolen.ids.player.back[0], subject: specter }, { source: specter, subject: specter }]);
    expect(sent.state.sides.player.hand).toHaveLength(1);
    expect(sent.state.sides.enemy.hand).toHaveLength(0);
  });

  it("fires a floating trigger lasting while its source is in play on that source's own abandon", () => {
    const { state, ids } = setup({ hand: [A.floater.id, A.cull.id] });
    const [floaterCard, cull] = ids.player.hand;
    const materialized = act(state, "player", play(floaterCard)).state;
    const { state: after, events } = act(materialized, "player", play(cull));
    expect(after.floating.filter((effect) => effect.change.kind === "trigger")).toEqual([]);
    expect(queued(events)).toEqual([{ source: floaterCard, subject: floaterCard }]);
    expect(after.sides.player.score).toBe(1);
  });

  it("sees a reclaimed character banished instead and a figment copy ceasing to exist, each once", () => {
    const reclaimed = setup({ back: [A.specter.id], hand: [A.cull.id] });
    const specter = reclaimed.ids.player.back[0]!;
    reclaimed.state.instances[specter] = { ...reclaimed.state.instances[specter], status: { ...reclaimed.state.instances[specter].status, reclaimed: true } };
    const banished = act(reclaimed.state, "player", play(reclaimed.ids.player.hand[0]));
    expect(banished.state.instances[specter]?.zone).toBe("banished");
    expect(queued(banished.events)).toEqual([{ source: specter, subject: specter }]);
    expect(banished.state.sides.player.hand).toHaveLength(1);

    const copied = setup({ back: [A.watcher.id], hand: [A.cull.id] });
    const copy = placeFigment(copied.state, "player", { rank: "back", index: 1 }, { kind: "figmentCopy", cardId: A.specter.id, spark: null });
    const ceased = act(copied.state, "player", play(copied.ids.player.hand[0]), [[copy]]);
    expect(ceased.state.instances[copy]).toBeUndefined();
    expect(queued(ceased.events)).toEqual([{ source: copied.ids.player.back[0], subject: copy }, { source: copy, subject: copy }]);
    expect(ceased.state.sides.player.hand).toHaveLength(1);
  });

  it("lets a Prevent's ransom abandon the character whose own ability then triggers", () => {
    const { state, ids } = setup({ back: [A.specter.id], hand: [A.study.id] }, { hand: [A.ransom.id] });
    const specter = ids.player.back[0]!;
    // The ransom's controller accepts; the specter is the one character it can abandon.
    const source = new ScriptedSource([true]);
    const first = E.apply(state, "player", play(ids.player.hand[0]), source);
    const second = E.apply(first.state, "enemy", play(ids.enemy.hand[0]), source);
    source.assertExhausted();
    expect(second.events).toContainEqual({ kind: "abandoned", instance: specter, side: "player" });
    expect(queued(second.events)).toEqual([{ source: specter, subject: specter }]);
    expect(second.state.sides.player.hand).toHaveLength(1);
    expect(second.state.sides.player.currentEnergy).toBe(6);
  });
});

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
const reload = (slice: BattleSlice): BattleSlice => ({ ...(JSON.parse(JSON.stringify(slice)) as BattleSlice), committed: deserializeState(JSON.stringify(slice.committed)) });

describe("one abandonment's look-back events", () => {
  // An abandon announces `abandoned` and then `dissolved`; a limited ability matching both triggers once.
  it("triggers a once-per-turn ability matching both the abandon and the dissolve once, for another character and for its own card", () => {
    const other = setup({ back: [A.onceEither.id, v.vanilla1.id], hand: [A.cull.id] });
    const [watcher, vanilla] = other.ids.player.back;
    const sent = act(other.state, "player", play(other.ids.player.hand[0]), [[vanilla!]]);
    expect(queued(sent.events)).toEqual([{ source: watcher, subject: vanilla }]);
    expect(sent.state.sides.player.score).toBe(1);

    const own = setup({ back: [A.onceEither.id], hand: [A.cull.id] });
    const self = own.ids.player.back[0]!;
    const gone = act(own.state, "player", play(own.ids.player.hand[0]));
    expect(gone.state.instances[self]?.zone).toBe("void");
    expect(queued(gone.events)).toEqual([{ source: self, subject: self }]);
    expect(gone.state.sides.player.score).toBe(1);
  });

  it("triggers a gained once-per-turn ability matching both once on its own card's abandon, whose use battle state does not keep", () => {
    const { state, ids } = setup({ back: [A.collector.id], hand: [A.cull.id] }, { void: [A.onceEither.id] });
    const collector = ids.player.back[0]!;
    // Each prompt here has one legal answer, which the engine gives itself.
    const collected = act(state, "player", activate(collector)).state;
    expect(collected.instances[collector]?.status.gainedAbilities).toHaveLength(1);
    const { state: after, events } = act(collected, "player", play(ids.player.hand[0]));
    expect(queued(events)).toEqual([{ source: collector, subject: collector }]);
    expect(after.sides.player.score).toBe(1);
  });

  it("does not limit a once-per-turn ability gained in place of a used one ended earlier in the same step", () => {
    const { state, ids } = setup({ back: [v.vanilla1.id, v.vanilla1.id], hand: [A.regain.id] });
    const [holder, other] = ids.player.back;
    const { state: after, events } = act(state, "player", play(ids.player.hand[0]));
    expect(queued(events)).toEqual([{ source: holder, subject: other }, { source: holder, subject: holder }]);
    expect(after.sides.player.score).toBe(2);
  });

  it("does not trigger a once-per-turn look-back ability already used by another of its triggers since the character left play", () => {
    const { state, ids } = setup({ back: [A.onceVoid.id, v.vanilla1.id], hand: [A.cull.id] });
    const [watcher, vanilla] = ids.player.back;
    const { state: after, events } = act(state, "player", play(ids.player.hand[0]), [[vanilla!]]);
    // The abandoned character enters the void before it is announced as abandoned.
    expect(queued(events)).toEqual([{ source: watcher, subject: vanilla }]);
    expect(after.sides.player.score).toBe(1);
  });

  it("triggers a one-shot delayed trigger matching both the abandon and the dissolve once", () => {
    const { state, ids } = setup({ back: [v.vanilla1.id], hand: [A.nextTime.id, A.cull.id] });
    const vanilla = ids.player.back[0]!;
    const [nextTime, cull] = ids.player.hand;
    const waiting = act(state, "player", play(nextTime)).state;
    expect(waiting.floating.map((effect) => effect.change.kind)).toEqual(["trigger"]);
    // The vanilla is the one character to abandon, so the engine answers the prompt itself.
    const { state: after, events } = act(waiting, "player", play(cull));
    expect(queued(events)).toEqual([{ source: nextTime, subject: vanilla }]);
    expect(after.floating).toEqual([]);
    expect(after.sides.player.score).toBe(1);
  });

  it("triggers once a one-shot trigger whose duration ended as its own source was abandoned", () => {
    const { state, ids } = setup({ hand: [A.nextWhile.id, A.cull.id] });
    const [source, cull] = ids.player.hand;
    const materialized = act(state, "player", play(source)).state;
    expect(materialized.floating.map((effect) => effect.change.kind)).toEqual(["trigger"]);
    const { state: after, events } = act(materialized, "player", play(cull));
    expect(after.instances[source]?.zone).toBe("void");
    expect(queued(events)).toEqual([{ source, subject: source }]);
    expect(after.floating).toEqual([]);
    expect(after.sides.player.score).toBe(1);
  });
});

describe("abandon look-back recovery", () => {
  it("keeps a self-abandon's queued trigger and prompt through a reload, rejects stale, foreign, invalid and concurrent input, and matches inline play", () => {
    const { state, ids } = setup({ back: [A.maySpecter.id], hand: [A.cull.id] });
    const specter = ids.player.back[0]!;
    const cull = ids.player.hand[0];
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    // The specter is the only character to abandon, so the play resolves to its "you may" prompt.
    const asked = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(cull) }));
    const saved = reload(asked);
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const may = fresh.pending(saved)!;
    expect(may.prompt).toMatchObject({ side: "player", purpose: { role: "youMay", source: specter } });
    expect(may.display.instances[specter]?.zone).toBe("void");
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, { kind: "answer", side: "player", promptId: may.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, { kind: "answer", side: "enemy", promptId: may.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(saved, { kind: "answer", side: "player", promptId: may.prompt.id, value: [specter] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const done = applied(fresh.reduce(saved, { kind: "answer", side: "player", promptId: may.prompt.id, value: true }));
    expect(fresh.pending(done)).toBeNull();
    const inline = act(state, "player", play(cull), [true]);
    expect(stateHash(done.committed)).toBe(stateHash(inline.state));
    expect(done.committed.sides.player.hand).toHaveLength(1);
  });

  it("commits neither the abandon nor its trigger when the step fails after abandoning", () => {
    const { state, ids } = setup({ back: [A.specter.id], hand: [A.failing.id] });
    const specter = ids.player.back[0]!;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const failed = fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) });
    if (failed.kind !== "applied" || failed.error === null) throw new Error("expected the synthetic failure");
    expect(failed.slice.inFlight).toBeNull();
    expect(failed.slice.committed.instances[specter]?.zone).toBe("play");
    expect(failed.slice.committed.triggerQueue).toEqual([]);
    expect(failed.slice.committed.sides.player.score).toBe(0);
    expect(failed.published.some((entry) => entry.kind === "abandoned" || entry.kind === "triggerQueued")).toBe(false);
  });
});
