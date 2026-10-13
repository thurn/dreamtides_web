/** Provisional unregistered Aspects consumed as permanent emblems with synthetic cards. */
import { describe, expect, it } from "vitest";
import { dawnReclaimAspectAbilities } from "../../../content/apollyon/aspects/aspect-8890b892-0634-4b8a-bfc0-018adfa979a7";
import { secondEventWarriorAspectAbilities } from "../../../content/apollyon/aspects/aspect-9a1bf275-2763-4db9-ad10-86d8f7e7efdf";
import type { EngineAvatarDefinition, EngineCardDefinition } from "../../../engine/catalog";
import { all, anyCharacter, characterYouControl, energy, event, target } from "../../../engine/dsl/builders";
import { triggered, triggeringCard, whenYouPlay } from "../../../engine/dsl/triggers";
import { NO_DECK_MODS } from "../../../engine/dsl/types";
import { createEngine } from "../../../engine/engine";
import { resolveEffect } from "../../../engine/effects/interpreter";
import { copyCard } from "../../../engine/effects/primitives/copy-card";
import { dissolve } from "../../../engine/effects/primitives/dissolve";
import { exhaust } from "../../../engine/effects/primitives/exhaust";
import { gainPoints } from "../../../engine/effects/primitives/gain-points";
import { gainSpark } from "../../../engine/effects/primitives/gain-spark";
import { giveAllTypes } from "../../../engine/effects/primitives/give-all-types";
import { eventSeenBy, type EngineEvent } from "../../../engine/events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../engine/fold/slice";
import type { Answer } from "../../../engine/prompts/types";
import { instanceOrigin } from "../../../engine/rules/activation";
import { instanceOf } from "../../../engine/rules/zones";
import { deserializeState, serializeState, stateHash } from "../../../engine/state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../engine/state/ids";
import type { BattleState } from "../../../engine/state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../engine/steps/sources";
import { boardState, type SideSetup } from "../../../engine/testing/board";
import { invariantViolations } from "../../../engine/testing/invariants";
import { syntheticId, testCatalog } from "../../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../../engine/testing/trigger-harness";
import { parseAvatarId, parsePromptId } from "../../../types/identifiers";

const aspects = {
  dawn: { id: parseAvatarId("d5599cfc-eb2b-465d-8e1b-076cb118ac59"), status: "authored", abilities: dawnReclaimAspectAbilities },
  warrior: { id: parseAvatarId("8c8bc6a5-6ece-4ba2-a360-f93619373bbf"), status: "authored", abilities: secondEventWarriorAspectAbilities },
} as const satisfies Record<string, EngineAvatarDefinition>;
function card(index: number, cardType: "character" | "event", cost: number, abilities: EngineCardDefinition["abilities"], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { id: syntheticId(0x64200 + index), cardType, costs: [energy(cost)], spark: cardType === "character" ? 2 : null,
    subtype: cardType === "character" ? "Warrior" : "", speed: "standard", status: "authored", abilities, ...extra };
}
const cards = {
  warrior: card(0, "character", 2, () => [], { status: "vanilla" }),
  mage: card(1, "character", 3, () => [], { status: "vanilla", subtype: "Mage" }),
  plain: card(2, "event", 0, () => [], { status: "vanilla" }),
  quick: card(3, "event", 0, () => [], { status: "vanilla", speed: "interrupt" }),
  exhaust: card(4, "event", 0, () => [event(exhaust(all(anyCharacter())))]),
  dissolve: card(5, "event", 0, () => [event(dissolve(target(characterYouControl())))]),
  types: card(6, "event", 0, () => [event(giveAllTypes(target(characterYouControl()), "untilEndOfTurn"))]),
  targeted: card(7, "event", 0, () => [event(gainSpark(target(characterYouControl()), 1))]),
  echo: card(8, "character", 0, () => [triggered(whenYouPlay({ cardType: "event" }), copyCard(triggeringCard()))], { subtype: "Mage" }),
  fault: card(9, "event", 0, () => [], { synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, gainPoints(1), { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
    throw new Error("synthetic later resolution fault");
  } } }),
} as const;
const E = createEngine(testCatalog(Object.values(cards), { avatars: Object.values(aspects) }));
const deck = Array.from({ length: 8 }, () => cards.warrior.id);
const filler = (count: number) => Array.from({ length: count }, () => cards.plain.id);
function setup(kind: keyof typeof aspects, side: Side, own: SideSetup, other: SideSetup = {}, active = side) {
  return boardState(E.catalog, { active, phase: "day", scoreToWin: 100,
    [side]: { avatar: aspects[kind].id, energy: 10, deck, ...own }, [opponent(side)]: { energy: 10, deck, ...other } });
}
function play(state: BattleState, side: Side, instance: InstanceId, answers: readonly Answer[] = [], from: "hand" | "void" = "hand") {
  const source = new ScriptedSource(answers);
  const start = E.apply(state, side, { kind: "play", card: instance, from }, source);
  const rest = passUntil(E, start.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  source.assertExhausted();
  expect(invariantViolations(rest.state, E.catalog)).toEqual([]);
  return { state: rest.state, events: [...start.events, ...rest.events] };
}
const queues = (events: readonly EngineEvent[], side: Side) => events.filter(entry => entry.kind === "triggerQueued" && entry.controller === side && typeof entry.source === "object" && entry.source?.kind === "avatar");
const grants = (events: readonly EngineEvent[]) => events.filter((entry): entry is Extract<EngineEvent, { kind: "effectStarted" }> => entry.kind === "effectStarted" && entry.change.kind === "keyword" && entry.change.keyword === "reclaim");
const day = (state: BattleState, side: Side) => passUntil(E, state, at(E, side, "day"), NO_PROMPTS, 100);
const exhausted = (state: BattleState, ids: readonly InstanceId[]) => ids.map(id => state.instances[id].status.exhausted);
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Expected applied intent: ${JSON.stringify(outcome)}`);
  return outcome;
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function foldDay(start: BattleSlice, side: Side) {
  const fold = createFoldAdapter(E, { checkEventPrefix: true });
  let current = start;
  const events: EngineEvent[] = [];
  for (let count = 0; !at(E, side, "day")(current.committed); count++) {
    const decision = E.decision(current.committed);
    if (decision === null || count >= 100) throw new Error("Missing pass decision");
    const result = applied(fold.reduce(current, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
    events.push(...result.published);
    current = result.slice;
    expect(current.inFlight).toBeNull();
  }
  return { fold, slice: current, events };
}

for (const side of SIDES) describe(`${side} pair-292 permanent Aspects`, () => {
  const other = opponent(side);
  it("checks the seven-card threshold at own Dawn and persists one reproducible public physical grant", () => {
    for (const count of [6, 7]) {
      const f = setup("dawn", side, { void: [cards.warrior.id, cards.mage.id, ...filler(count - 2)] }, { void: [cards.warrior.id] }, other);
      const run = day(f.state, side);
      expect(queues(run.events, side)).toEqual(count === 6 ? [] : [expect.objectContaining({ source: { kind: "avatar", side }, subject: null })]);
      expect(grants(run.events)).toHaveLength(count === 6 ? 0 : 1);
      expect(run.state.sides[side].void).toEqual(f.ids[side].void);
      expect(run.state.sides[other].void).toEqual(f.ids[other].void);
      expect(run.state.rng).toEqual(count === 6 ? f.state.rng : { ...f.state.rng, "random:selection": (f.state.rng["random:selection"] ?? 0) + 1 });
      const replay = day(deserializeState(serializeState(f.state)), side);
      expect({ hash: stateHash(replay.state), events: replay.events }).toEqual({ hash: stateHash(run.state), events: run.events });
      for (const entry of grants(run.events)) {
        if (entry.change.kind !== "keyword") throw new Error("Missing keyword grant");
        expect(f.ids[side].void.slice(0, 2)).toContain(entry.change.instance);
        expect(entry).toMatchObject({ controller: side, source: { kind: "avatar", side }, expiry: { at: "never" }, change: { keyword: "reclaim", gains: true } });
        for (const viewer of SIDES) {
          expect(E.view(run.state, viewer).instances[entry.change.instance].characteristics.keywords).toContain("reclaim");
          expect(eventSeenBy(entry, viewer, run.state)).toEqual(entry);
        }
      }
      for (const viewer of SIDES) expect(E.view(run.state, viewer).sides[side].avatar?.id).toBe(aspects.dawn.id);
      const opposing = day(run.state, other);
      expect(queues(opposing.events, side)).toEqual([]);
      expect(grants(opposing.events)).toEqual([]);
      expect(opposing.state.rng).toEqual(run.state.rng);
    }
  });

  it("handles an empty eligible pool without RNG and grants through full capacity while refusing an actual Reclaim play", () => {
    for (const voidCards of [[], filler(7)]) {
      const f = setup("dawn", side, { void: voidCards }, {}, other);
      const run = day(f.state, side);
      expect(queues(run.events, side)).toHaveLength(voidCards.length === 0 ? 0 : 1);
      expect(grants(run.events)).toEqual([]);
      expect(run.state.rng).toEqual(f.state.rng);
    }
    const f = setup("dawn", side, { back: Array.from({ length: 10 }, () => cards.warrior.id), void: [cards.mage.id, ...filler(6)] }, {}, other);
    const run = day(f.state, side);
    const id = f.ids[side].void[0];
    expect(grants(run.events)).toHaveLength(1);
    expect(E.view(run.state, side).instances[id].characteristics.keywords).toContain("reclaim");
    expect(run.state.sides[side].backRank).toEqual(f.state.sides[side].backRank);
    const fold = createFoldAdapter(E);
    const before = stateHash(run.state);
    expect(fold.reduce(slice(run.state), { kind: "battleAction", side, action: { kind: "play", card: id, from: "void" } })).toEqual({ kind: "bounced", reason: "illegalAction" });
    expect(stateHash(run.state)).toBe(before);
  });

  it("selects effective character types after actual plays and departures", () => {
    const f = setup("dawn", side, { void: filler(4), hand: [
      { cardId: cards.plain.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Warrior" } } },
      cards.dissolve.id,
      { cardId: cards.warrior.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } },
    ] });
    const entered = play(f.state, side, f.ids[side].hand[0]);
    const left = play(entered.state, side, f.ids[side].hand[1]);
    const excluded = play(left.state, side, f.ids[side].hand[2]);
    const run = day(day(excluded.state, other).state, side);
    const selected = grants(run.events);
    expect(selected).toEqual([expect.objectContaining({ change: { kind: "keyword", instance: f.ids[side].hand[0], keyword: "reclaim", gains: true } })]);
    expect(E.view(run.state, side).instances[f.ids[side].hand[2]].characteristics.keywords).not.toContain("reclaim");
  });

  it("plays the selected physical card for its normal cost and carries the permanent grant through Reclaim and banishment", () => {
    const f = setup("dawn", side, { void: [cards.mage.id, ...filler(6)], hand: [cards.dissolve.id] }, {}, other);
    const run = day(f.state, side);
    const id = f.ids[side].void[0];
    const nextTurn = day(day(run.state, other).state, side).state;
    expect(E.view(nextTurn, side).instances[id].characteristics.keywords).toContain("reclaim");
    const reclaimed = play(nextTurn, side, id, [], "void");
    expect(reclaimed.state.sides[side].currentEnergy).toBe(nextTurn.sides[side].currentEnergy - 3);
    expect(reclaimed.state.instances[id]).toMatchObject({ zone: "play", status: { reclaimed: true, playedViaReclaim: true, exhausted: true } });
    const left = play(reclaimed.state, side, f.ids[side].hand[0]);
    expect(left.state.instances[id].zone).toBe("banished");
    expect(left.state.sides[side].void).not.toContain(id);
    for (const viewer of SIDES) expect(E.view(left.state, viewer).instances[id].characteristics.keywords).toContain("reclaim");
  });

  it("awakens only controlled Warriors on the second actual event and resets on the next turn", () => {
    const f = setup("warrior", side, { back: [cards.warrior.id, cards.mage.id], hand: [cards.exhaust.id, cards.warrior.id, cards.plain.id, cards.exhaust.id, cards.warrior.id, cards.plain.id, cards.plain.id] }, { back: [cards.warrior.id], hand: [cards.quick.id] });
    const mine = f.ids[side].back[0]!;
    const mage = f.ids[side].back[1]!;
    const enemy = f.ids[other].back[0]!;
    const first = E.apply(f.state, side, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const reply = E.apply(first.state, other, { kind: "play", card: f.ids[other].hand[0], from: "hand" }, NO_PROMPTS);
    const resolved = passUntil(E, reply.state, next => next.stack.length === 0).state;
    expect(queues([...first.events, ...reply.events], side)).toEqual([]);
    expect(exhausted(resolved, [mine, mage, enemy])).toEqual([true, true, true]);
    const warrior = play(resolved, side, f.ids[side].hand[1]);
    const second = play(warrior.state, side, f.ids[side].hand[2]);
    expect(queues(second.events, side)).toEqual([expect.objectContaining({ source: { kind: "avatar", side }, subject: f.ids[side].hand[2] })]);
    expect(exhausted(second.state, [mine, f.ids[side].hand[1], mage, enemy])).toEqual([false, false, true, true]);
    for (const viewer of SIDES) for (const entry of queues(second.events, side)) expect(eventSeenBy(entry, viewer, second.state)).toEqual(entry);
    const third = play(second.state, side, f.ids[side].hand[3]);
    expect(queues(third.events, side)).toEqual([]);
    expect(third.state.instances[mine].status.exhausted).toBe(true);
    const nextDay = day(day(third.state, other).state, side).state;
    const freshWarrior = play(nextDay, side, f.ids[side].hand[4]);
    const freshFirst = play(freshWarrior.state, side, f.ids[side].hand[5]);
    expect(freshFirst.state.instances[f.ids[side].hand[4]].status.exhausted).toBe(true);
    expect(queues(freshFirst.events, side)).toEqual([]);
    const freshSecond = play(freshFirst.state, side, f.ids[side].hand[6]);
    expect(freshSecond.state.instances[f.ids[side].hand[4]].status.exhausted).toBe(false);
    expect(queues(freshSecond.events, side)).toHaveLength(1);
  });

  it("reads effective Warrior membership and effective event counts live", () => {
    const f = setup("warrior", side, { back: [cards.mage.id], hand: [cards.exhaust.id, cards.types.id] }, { back: [cards.mage.id] });
    const first = play(f.state, side, f.ids[side].hand[0]);
    const id = f.ids[side].back[0]!;
    const typed = play(first.state, side, f.ids[side].hand[1]);
    // The second event's trigger precedes that event's type grant: the Mage stays exhausted.
    expect(typed.state.instances[id].status.exhausted).toBe(true);
    const nextDay = day(day(typed.state, other).state, side).state;
    const effective = setup("warrior", side, { hand: [cards.mage.id, cards.types.id, cards.plain.id] }, { back: [cards.mage.id] });
    const enteredMage = play(effective.state, side, effective.ids[side].hand[0]);
    const firstTypeEvent = play(enteredMage.state, side, effective.ids[side].hand[1]);
    const effectiveMage = effective.ids[side].hand[0];
    expect(E.view(firstTypeEvent.state, side).instances[effectiveMage].characteristics.allTypes).toBe(true);
    expect(firstTypeEvent.state.instances[effectiveMage].status.exhausted).toBe(true);
    const awakened = play(firstTypeEvent.state, side, effective.ids[side].hand[2]);
    expect(awakened.events.flatMap(entry => entry.kind === "exhaustionChanged" && !entry.exhausted ? [entry.instance] : [])).toEqual([effectiveMage]);
    expect(awakened.state.instances[effectiveMage].status.exhausted).toBe(false);
    const fresh = setup("warrior", side, { hand: [
      { cardId: cards.plain.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Warrior" } } },
      cards.exhaust.id,
      { cardId: cards.warrior.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } },
    ] });
    const character = play(fresh.state, side, fresh.ids[side].hand[0]);
    const exhaustedState = play(character.state, side, fresh.ids[side].hand[1]);
    const second = play(exhaustedState.state, side, fresh.ids[side].hand[2]);
    expect(second.state.instances[fresh.ids[side].hand[0]].status.exhausted).toBe(false);
    expect(queues(second.events, side)).toHaveLength(1);
    expect(E.view(nextDay, side).instances[id].characteristics.allTypes).toBe(false);
  });

  it("excludes actual event copies from nth counting and lets them cease without a premature reward", () => {
    const f = setup("warrior", side, { back: [cards.warrior.id, cards.echo.id], hand: [cards.exhaust.id, cards.plain.id] });
    const first = play(f.state, side, f.ids[side].hand[0]);
    expect(first.events.filter(entry => entry.kind === "cardCopied")).toHaveLength(1);
    expect(queues(first.events, side)).toEqual([]);
    expect(first.state.instances[f.ids[side].back[0]!].status.exhausted).toBe(true);
    expect(first.state.turnLog.played[side]).toHaveLength(1);
    const second = play(first.state, side, f.ids[side].hand[1]);
    expect(queues(second.events, side)).toEqual([expect.objectContaining({ subject: f.ids[side].hand[1] })]);
    expect(second.state.instances[f.ids[side].back[0]!].status.exhausted).toBe(false);
    expect(second.state.turnLog.played[side]).toHaveLength(2);
    for (const entry of [...first.events, ...second.events]) if (entry.kind === "cardCopied") expect(second.state.instances[entry.copy]).toBeUndefined();
  });

  it("cancels and replays an ordinary target choice without losing the permanent emblem or accepting stale, foreign or competing answers", () => {
    const f = setup("warrior", side, { back: [cards.warrior.id, cards.mage.id], hand: [cards.exhaust.id, cards.targeted.id, cards.plain.id] });
    const first = play(f.state, side, f.ids[side].hand[0]);
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const initial = slice(first.state);
    const intent = { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[1], from: "hand" } } as const;
    const opened = applied(fold.reduce(initial, intent)).slice;
    const pending = fold.pending(opened);
    if (pending?.prompt.kind !== "chooseTargets") throw new Error("Missing ordinary target prompt");
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side, promptId: pending.prompt.id })).slice;
    expect(stateHash(cancelled.committed)).toBe(stateHash(initial.committed));
    const restarted = applied(fold.reduce(cancelled, intent)).slice;
    const fresh = fold.pending(restarted);
    if (fresh === null) throw new Error("Missing restarted prompt");
    const id = f.ids[side].back[0]!;
    expect(fold.reduce(restarted, { kind: "answer", side, promptId: pending.prompt.id, value: [id] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fold.reduce(restarted, { kind: "answer", side: other, promptId: fresh.prompt.id, value: [id] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(restarted, { kind: "answer", side, promptId: fresh.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(restarted, { kind: "battleAction", side: other, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const reload = createFoldAdapter(E, { checkEventPrefix: true });
    const saved: BattleSlice = JSON.parse(JSON.stringify(restarted)) as BattleSlice;
    expect(reload.pending(saved)?.prompt).toEqual(fresh.prompt);
    const answer = { kind: "answer", side, promptId: fresh.prompt.id, value: [id] } as const;
    const done = fold.reduce(restarted, answer);
    expect(reload.reduce(saved, answer)).toEqual(done);
    const result = applied(done).slice;
    expect(result.committed.instances[id].status.exhausted).toBe(false);
    expect(result.committed.sides[side].avatar?.id).toBe(aspects.warrior.id);
    expect(reload.reduce(result, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(E.view(result.committed, other).instances[f.ids[side].hand[2]]).toBeUndefined();
  });

  it("retains a committed Dawn grant and RNG while a later actual played effect fails atomically", () => {
    const f = setup("dawn", side, { void: [cards.mage.id, ...filler(6)], hand: [cards.fault.id] }, {}, other);
    const run = foldDay(slice(f.state), side);
    expect(grants(run.events)).toHaveLength(1);
    const failed = run.fold.reduce(run.slice, { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[0], from: "hand" } });
    if (failed.kind !== "applied" || failed.error === null) throw new Error("Expected later resolution failure");
    expect(failed.error.kind).toBe("engine_error");
    expect(failed.slice.inFlight).toBeNull();
    expect(failed.slice.committed.sides[side].score).toBe(0);
    expect(failed.slice.committed.rng).toEqual(run.slice.committed.rng);
    expect(E.view(failed.slice.committed, side).instances[f.ids[side].void[0]].characteristics.keywords).toContain("reclaim");
    expect(failed.published.filter(entry => entry.kind === "pointsScored")).toEqual([]);
    expect(failed.published.filter(entry => entry.kind === "effectStarted")).toEqual([]);
    const promptId = parsePromptId("642000:0:0");
    for (const actor of SIDES) expect(run.fold.reduce(run.slice, { kind: "cancel", side: actor, promptId })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(deserializeState(serializeState(failed.slice.committed)))).toBe(stateHash(failed.slice.committed));
    expect(invariantViolations(failed.slice.committed, E.catalog)).toEqual([]);
  });
});
