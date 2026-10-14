/**
 * Trigger events seen by each side: the subjects and sources a trigger names
 * only as the viewing side may see them.
 */
import { describe, expect, it } from "vitest";
import { eventSeenBy, eventVisibleTo, type EngineEvent } from "../events";
import { createFoldAdapter } from "../fold/slice";
import { departKnowledge, settleKnowledge } from "../view/knowledge";
import { deserializeState, stateHash } from "../state/hash";
import type { AbilitySource } from "../state/ids";
import { SIDES } from "../state/ids";
import type { Answer } from "../prompts/types";
import { DSL } from "../testing/dsl-cards";
import { v, deck, L, engine, board, play, strings, seenBy } from "./triggers.fixtures";

describe("trigger subjects hidden from a side", () => {
  it("shows the opponent a public trigger on a draw without the card drawn into a hidden hand", () => {
    const { state, ids } = board({ player: { back: [L.drawPoints.id], hand: [DSL.drawTwo.id], energy: 1, deck }, enemy: { deck } });
    const result = play(state, "player", ids.player.hand[0]);
    const drawn = result.state.sides.player.hand;
    expect(drawn).toEqual(ids.player.deck.slice(0, 2));
    const queued = result.events.filter((entry) => entry.kind === "triggerQueued");
    expect(queued.map((entry) => entry.subject)).toEqual(drawn);
    for (const entry of queued) {
      expect(entry.subjectHiddenFrom).toEqual(["enemy"]);
      expect(eventSeenBy(entry, "enemy", result.state)).toEqual({ ...entry, subject: null });
      expect(eventSeenBy(entry, "player", result.state)).toEqual(entry);
    }
    const enemy = strings([seenBy(result.events, "enemy", result.state), engine.view(result.state, "enemy")]);
    for (const id of drawn) expect(enemy.has(id)).toBe(false);
    expect(result.state.sides.player.score).toBe(2);
  });

  it("never names a drawn card as a draw trigger's subject to the opponent, even once it is discarded into the void, across a reload", () => {
    const { state, ids } = board({ player: { back: [L.drawPoints.id], hand: [L.drawThenDiscard.id, v.vanilla2.id], deck }, enemy: { deck } });
    const drawn = ids.player.deck[0];
    const answers: Answer[] = [[drawn]];
    const action = { kind: "play", card: ids.player.hand[0], from: "hand" } as const;
    const inline = play(state, "player", ids.player.hand[0], answers);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action });
    if (opened.kind !== "applied") throw new Error("bounced");
    const pending = fold.pending(opened.slice);
    if (pending === null) throw new Error("no prompt");
    // Suspended at the discard, the drawn card is in hand and the draw trigger is queued.
    const reloaded = deserializeState(JSON.stringify(pending.display));
    for (const display of [pending.display, reloaded]) {
      expect(engine.view(display, "enemy").triggerQueue.map((entry) => entry.subject)).toEqual([null]);
      expect(engine.view(display, "player").triggerQueue.map((entry) => entry.subject)).toEqual([drawn]);
    }
    const answered = fold.reduce(opened.slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [drawn] });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    const published = [...opened.published, ...answered.published];
    expect(published).toEqual(inline.events);
    expect(stateHash(answered.slice.committed)).toBe(stateHash(inline.state));
    const after = answered.slice.committed;
    expect(after.instances[drawn]?.zone).toBe("void");
    const queued = published.find((entry) => entry.kind === "triggerQueued");
    expect(queued !== undefined && eventSeenBy(queued, "enemy", after)).toMatchObject({ kind: "triggerQueued", subject: null });
    expect(queued !== undefined && eventSeenBy(queued, "player", after)).toMatchObject({ kind: "triggerQueued", subject: drawn });
    // The discard itself is public: the card is in the void.
    expect(seenBy(published, "enemy", after)).toContainEqual({ kind: "discarded", side: "player", instance: drawn });
  });

  it("keeps a created card discarded from a hidden hand, and the triggers it causes, from naming it to the opponent", () => {
    const { state, ids } = board({
      player: { back: [L.discardWatcher.id], hand: [DSL.discardTwo.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck },
      enemy: { deck },
    });
    const [, created, kept] = ids.player.hand;
    state.instances[created].status.created = true;
    const result = play(state, "player", ids.player.hand[0], [[created, kept]]);
    expect(result.state.instances[created]).toBeUndefined();
    expect(result.state.sides.player.void).toContain(kept);
    expect(result.state.sides.player.currentEnergy).toBe(2);
    const enemy = seenBy(result.events, "enemy", result.state);
    expect(strings([enemy, engine.view(result.state, "enemy")]).has(created)).toBe(false);
    expect(enemy).toContainEqual({ kind: "discarded", side: "player", instance: kept });
    // The opponent still sees both discard triggers queue.
    expect(enemy.filter((entry) => entry.kind === "triggerQueued").map((entry) => entry.subject)).toEqual([null, kept]);
    const player = seenBy(result.events, "player", result.state);
    expect(player).toContainEqual({ kind: "discarded", side: "player", instance: created });
    expect(player).toContainEqual({ kind: "ceasedToExist", instance: created, side: "player", from: "hand" });
  });
});

/** The event kinds that name an ability's source. */
const SOURCED_KINDS: readonly EngineEvent["kind"][] = ["triggerQueued", "triggerResolved", "effectStarted", "payableEffectRegistered", "noLegalTarget", "winConditionMet"];

/** Whether `entry` identifies an ability's source, rather than redacting it. */
function sourced(entry: EngineEvent): boolean {
  return SOURCED_KINDS.includes(entry.kind) && namedSources(entry).some(source => source !== null);
}

/** The sources the `kind` events in `events` name, in order. */
function sourcesOf(events: readonly EngineEvent[], kind: "triggerQueued" | "triggerResolved" | "payableEffectRegistered" | "noLegalTarget"): (AbilitySource | null)[] {
  return events.flatMap((entry) => (entry.kind === kind ? [entry.source] : []));
}

/** The sources `entry` names: a `winConditionMet`'s `sources`, else its `source`, if any. */
function namedSources(entry: EngineEvent): (AbilitySource | null)[] {
  if (entry.kind === "winConditionMet") return [...entry.sources];
  return "source" in entry ? [entry.source] : [];
}

describe("trigger sources hidden from a side", () => {
  // The player's play triggers three cards on top of the enemy's deck: a
  // delayed trigger (effectStarted), a payable effect on the player's
  // character, and a dissolve with no legal target.
  const deckSetup = () =>
    board({
      player: { back: [v.vanilla1.id], hand: [v.event0.id], deck },
      enemy: { deck: [L.anywhereDelayed.id, L.anywherePayable.id, L.anywhereDissolveOwn.id, ...deck] },
    });
  const cards = [L.anywhereDelayed.id, L.anywherePayable.id, L.anywhereDissolveOwn.id];

  it("redacts hidden deck sources and retains their public numeric Spark change", () => {
    const { state, ids } = deckSetup();
    const hidden = ids.enemy.deck.slice(0, 3);
    const result = play(state, "player", ids.player.hand[0]);
    expect(sourcesOf(result.events, "triggerResolved")).toEqual(hidden);
    expect(sourcesOf(result.events, "payableEffectRegistered")).toEqual([hidden[1]]);
    expect(sourcesOf(result.events, "noLegalTarget")).toEqual([hidden[2]]);
    expect(result.events.filter((entry) => entry.kind === "effectStarted").length).toBeGreaterThan(0);
    for (const id of hidden) expect(result.state.instances[id]?.zone).toBe("deck");

    const enemy = seenBy(result.events, "enemy", result.state);
    expect(sourcesOf(enemy, "triggerQueued")).toEqual([null, null, null]);
    expect(sourcesOf(enemy, "triggerResolved")).toEqual([null, null, null]);
    expect(sourcesOf(enemy, "payableEffectRegistered")).toEqual([null]);
    expect(sourcesOf(enemy, "noLegalTarget")).toEqual([null]);
    // The public scalar carries its exact metadata without identifying the hidden causal source.
    const publicSpark = result.events.filter(entry => entry.kind === "effectStarted" && entry.change.kind === "spark");
    expect(publicSpark).toHaveLength(1);
    expect(enemy.filter(entry => entry.kind === "effectStarted")).toEqual(publicSpark.map(entry => ({ ...entry, source: null })));
    expect(seenBy(result.events, "player", result.state).some(sourced)).toBe(false);
    for (const viewer of SIDES) {
      const named = strings([seenBy(result.events, viewer, result.state), engine.view(result.state, viewer)]);
      for (const id of [...hidden, ...cards]) expect(named.has(id)).toBe(false);
    }
    // Visibility is a function of the event and the state that arrives with it, so a reload sees the same.
    const reloaded = deserializeState(JSON.stringify(result.state));
    for (const viewer of SIDES) expect(seenBy(result.events, viewer, reloaded)).toEqual(seenBy(result.events, viewer, result.state));
  });

  it("shows a deck card's triggers and effects whole to a holder that knows the card", () => {
    const { state, ids } = deckSetup();
    const hidden = ids.enemy.deck.slice(0, 3);
    state.knownTo.enemy.push(...hidden);
    const result = play(state, "player", ids.player.hand[0]);
    const enemy = seenBy(result.events, "enemy", result.state);
    expect(enemy).toEqual(result.events.filter((entry) => eventVisibleTo(entry, "enemy", result.state)));
    expect(sourcesOf(enemy, "triggerQueued")).toEqual(hidden);
    expect(sourcesOf(enemy, "payableEffectRegistered")).toEqual([hidden[1]]);
    expect(enemy.some((entry) => entry.kind === "effectStarted" && entry.source === hidden[0])).toBe(true);
    expect(seenBy(result.events, "player", result.state).some(sourced)).toBe(false);
    const reloaded = deserializeState(JSON.stringify(result.state));
    expect(seenBy(result.events, "enemy", reloaded)).toEqual(enemy);
  });

  it("shows a trigger from a hidden hand whole to its holder only", () => {
    const { state, ids } = board({
      player: { back: [v.vanilla1.id], hand: [v.event0.id], deck },
      enemy: { hand: [L.anywhereDelayed.id, L.anywherePayable.id, L.anywhereDissolveOwn.id], deck },
    });
    const hidden = ids.enemy.hand;
    const result = play(state, "player", ids.player.hand[0]);
    const enemy = seenBy(result.events, "enemy", result.state);
    expect(enemy).toEqual(result.events.filter((entry) => entry.kind !== "cardDrawn" || entry.side === "enemy"));
    expect(sourcesOf(enemy, "triggerResolved")).toEqual(hidden);
    expect(sourcesOf(enemy, "noLegalTarget")).toEqual([hidden[2]]);
    expect(seenBy(result.events, "player", result.state).some(sourced)).toBe(false);
  });

  it("names a deck card drawn by its own trigger to its holder, which now identifies it, and to no one else", () => {
    const { state, ids } = board({ player: { hand: [v.event0.id], deck }, enemy: { deck: [L.anywhereDraw.id, ...deck] } });
    const drawn = ids.enemy.deck[0];
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.state.instances[drawn]?.zone).toBe("hand");
    // Events are judged in the state that arrives with them: the trigger's source is in its holder's hand there, as in the view.
    const enemy = seenBy(result.events, "enemy", result.state);
    expect(sourcesOf(enemy, "triggerQueued")).toEqual([drawn]);
    expect(sourcesOf(enemy, "triggerResolved")).toEqual([drawn]);
    const player = seenBy(result.events, "player", result.state);
    expect(player.some(sourced)).toBe(false);
    expect(strings([player, engine.view(result.state, "player")]).has(drawn)).toBe(false);
  });

  it("keeps naming a hand card put into its holder's deck to the holder, which watched it move", () => {
    const { state, ids } = board({ player: { hand: [v.event0.id], deck }, enemy: { hand: [L.handWin.id], deck } });
    const hidden = ids.enemy.hand[0];
    const result = play(state, "player", ids.player.hand[0]);
    const moved = deserializeState(JSON.stringify(result.state));
    const instance = moved.instances[hidden];
    if (instance === undefined) throw new Error("no hidden card");
    // Moved as zone changes move cards: every side that could see it keeps knowing it.
    const seers = departKnowledge(moved, instance);
    moved.sides.enemy.hand = moved.sides.enemy.hand.filter((id) => id !== hidden);
    moved.sides.enemy.deck.unshift(hidden);
    instance.zone = "deck";
    settleKnowledge(moved, instance, seers);
    const named = result.events.filter(sourced);
    expect(seenBy(named, "enemy", moved)).toEqual(named);
    expect(seenBy(named, "player", moved)).toEqual([]);
    // A holder that lost track of it, as after the opponent looked at and reordered that deck, sees the events without it.
    moved.knownTo.enemy = [];
    expect(seenBy(named, "enemy", moved).flatMap(namedSources)).toEqual(named.map(() => null));
  });

  it("hides a source that has left the battle from both sides", () => {
    const { state, ids } = board({ player: { back: [L.anywhereWin.id], hand: [v.event0.id], deck }, enemy: { deck } });
    const source = ids.player.back[0];
    if (source === null || source === undefined) throw new Error("no source");
    const resolved: EngineEvent = { kind: "triggerResolved", source, controller: "player", ability: 0, node: null, applied: true };
    for (const viewer of SIDES) expect(eventSeenBy(resolved, viewer, state)).toEqual(resolved);
    const departed = deserializeState(JSON.stringify(state));
    delete departed.instances[source];
    departed.sides.player.backRank = departed.sides.player.backRank.map((id) => (id === source ? null : id));
    for (const viewer of SIDES) expect(eventSeenBy(resolved, viewer, departed)).toEqual({ ...resolved, source: null });
  });
});
