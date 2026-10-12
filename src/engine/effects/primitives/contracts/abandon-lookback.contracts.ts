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
import { abandonCost, activated, all, characterYouControl, energy, event, fromVoid, self, stackItem, staticAbility, target } from "../../../dsl/builders";
import { onMaterialized, triggered, whenAbandon, whileSourceInPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
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
import { draw } from "../draw";
import { floating } from "../floating-trigger";
import { gainAbilities } from "../gain-abilities";
import { gainEnergy } from "../gain-energy";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { giveAllTypes } from "../give-all-types";
import { optional } from "../optional";
import { prevent } from "../prevent";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";

function card(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return {
    id: syntheticId(0xab5320 + index), cardType, costs: [energy(0)], spark: cardType === "character" ? 1 : null,
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
