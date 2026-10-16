/** First-event copying through actual plays, global turns, safe views and transactional persistence. */
import { afterEach, describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { additionalEventCopy, event, everyIn, scoredWithCharacterLastTurn, self } from "../../../dsl/builders";
import { onDawn, triggered, triggeringCard, whenCopyTrigger, whenYouPlay } from "../../../dsl/triggers";
import { BASE_VARIANT, NO_DECK_MODS } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { cycleHash, loopSignature } from "../../../loops/signature";
import { opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleInit, BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { comparableView } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { getBattleInitProvider, registerBattleInitProvider } from "../../../../rules/battle/journey-battle";
import { GAME_ENGINE_CONFIG } from "../../../../rules/replay/replay";
import { registerReplayFixtureProviders, clearReplayFixtureProviders } from "../../../../rules/replay/fixture-providers";
import { createMemoryKeyValueStore } from "../../../../session/key-value-store";
import { createGameRepository, type StoredCheckpoint } from "../../../../session/game-repository";
import { createLocalGame, openLocalGame } from "../../../../session/local-game";
import { decodeGenesis, decodeEvent, isFoldableGenesis } from "../../../../eventlog/wire";
import { hashState } from "../../../../eventlog/hash";
import type { FoldState } from "../../../../rules/fold-state";
import { parseClientId, parseDreamsignId, parseGameId, parsePromptId } from "../../../../types/identifiers";
import type { ResolvingEffect } from "../../registry";
import * as p from "../index";
import battleFixture from "../../../../rules/replay/fixtures/battle.json";
import { decklists } from "./with-materialized-support";

const id = (n: number) => syntheticId(0x622000 + n);
const copy = () => p.copyFirstEventLastTurnToHand({ ephemeral: true });
const spell = (n: number, effect: ResolvingEffect): EngineCardDefinition => ({ ...v.event0, id: id(n), speed: "interrupt", status: "authored", abilities: () => [event(effect)] });
const first = spell(1, p.gainEnergy(1)), later = spell(2, p.gainEnergy(2)), extra = spell(3, p.takeExtraTurn());
const reader = spell(4, copy()), modal = spell(5, p.chooseOne(p.gainEnergy(1), p.gainEnergy(2)));
const hide = spell(6, p.shuffleInto([everyIn("void")]));
const bad: ResolvingEffect = { op: "copyCardTimes", card: self(), times: -1 };
const paused = spell(7, p.sequence(copy(), p.discard(1)));
const broken = spell(7, p.sequence(copy(), p.discard(1), bad));
const echo: EngineCardDefinition = { ...v.vanilla0, id: id(8), status: "authored", abilities: () => [triggered(whenYouPlay({ cardType: "event" }), p.copyCard(triggeringCard()))] };
const modifier: EngineCardDefinition = { ...v.vanilla0, id: id(9), status: "authored", abilities: () => [additionalEventCopy()] };
const watch: EngineDreamsignDefinition = { id: parseDreamsignId(id(10)), status: "authored", abilities: () => [triggered(whenCopyTrigger("you", { cardType: "event" }), p.gainEnergy(3))] };
const dawn: EngineDreamsignDefinition = { id: parseDreamsignId(id(11)), status: "authored", abilities: () => [triggered(onDawn(), copy())] };
const deck = Array.from({ length: 12 }, () => v.vanilla1.id);
const cards = [first, later, extra, reader, modal, hide, paused, echo, modifier];
const engine = createEngine(testCatalog(cards, { dreamsigns: [dawn, watch] }));
const originalProvider = getBattleInitProvider();
afterEach(() => { clearReplayFixtureProviders(); registerBattleInitProvider(originalProvider); });
const copies = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "cardCopied");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const foldOf = (state: BattleState) => ({ init: { seed: state.seed, scoreToWin: 1000, decks: decklists(state), dreamwell: [], dreamsigns: { player: state.sides.player.dreamsigns.map(s => s.id), enemy: state.sides.enemy.dreamsigns.map(s => s.id) } }, slice: slice(state) });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function world(side: Side, mine: SideSetup = {}, theirs: SideSetup = {}) {
  return boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 1000,
    [side]: { energy: 20, deck, hand: [first.id, later.id, extra.id, reader.id], dreamsigns: [dawn.id], ...mine },
    [opponent(side)]: { energy: 20, deck, hand: [first.id, later.id], dreamsigns: [dawn.id], ...theirs } });
}
function step(state: BattleState, command: Step, local = engine, answers = NO_PROMPTS) {
  const out = runStep(state, command, answers, local.catalog);
  if (out.kind !== "done") throw new Error(`Unexpected ${out.prompt.kind}`);
  expect(invariantViolations(out.state, local.catalog)).toEqual([]);
  return out;
}
function cast(state: BattleState, card: InstanceId, local = engine) {
  return step(step(state, { kind: "play", card, from: "hand" }, local).state, { kind: "resolveTop" }, local);
}
function next(state: BattleState, local = engine) {
  const turn = state.turn.turnNumber;
  return passUntil(local, state, s => s.turn.turnNumber > turn && s.turn.phase === "day" && local.decision(s) !== null);
}
function ready(side: Side, mine: SideSetup = {}) {
  const b = world(side, mine);
  const played = cast(b.state, b.ids[side].hand[0]);
  const withExtra = cast(played.state, b.ids[side].hand[2]);
  return { ...b, ...next(withExtra.state) };
}

for (const side of SIDES) describe(`first-event last-turn ${side}`, () => {
  const other = opponent(side);
  it("global window and extra turns include off-turn plays and replace older own turns", () => {
    const b = world(side);
    const own = cast(b.state, b.ids[side].hand[0]);
    const dusk = passUntil(engine, own.state, s => s.turn.phase === "dusk" && engine.decision(s)?.side === other).state;
    const off = cast(dusk, b.ids[other].hand[0]);
    const opposing = next(off.state);
    expect(copies(opposing.events)).toMatchObject([{ side: other, original: b.ids[other].hand[0] }]);
    const empty = next(opposing.state);
    expect(copies(empty.events)).toEqual([]);
    expect(empty.state.turn.round).toBeGreaterThan(b.state.turn.round);
    const f = ready(side);
    expect(f.state.turn.extra).toBe(true);
    expect(copies(f.events)).toMatchObject([{ side, original: f.ids[side].hand[0] }]);
    const another = cast(f.state, f.ids[side].hand[1]);
    const normal = next(another.state);
    expect(copies(normal.events)).toEqual([]);
    const again = next(normal.state);
    expect(copies(again.events)).toEqual([]);
  });

  it("global window includes every opponent extra turn without retaining an older own event", () => {
    const b = world(side, {}, { hand: [extra.id] });
    const own = cast(b.state, b.ids[side].hand[0]);
    const dusk = passUntil(engine, own.state, s => s.turn.phase === "dusk" && engine.decision(s)?.side === other).state;
    const granted = cast(dusk, b.ids[other].hand[0]);
    const opponentExtra = next(granted.state);
    expect(opponentExtra.state.turn.extra).toBe(true);
    expect(copies(opponentExtra.events)).toMatchObject([{ side: other, original: b.ids[other].hand[0] }]);
    const ordinary = next(opponentExtra.state);
    expect(ordinary.state.turn.active).toBe(other); expect(ordinary.state.turn.extra).toBe(false);
    expect(copies(ordinary.events)).toEqual([]);
    expect(copies(next(ordinary.state).events)).toEqual([]);
  });

  it("global window starts empty but a first own turn can read a preceding opponent Interrupt", () => {
    const b = world(other, { hand: [reader.id] }, { hand: [first.id] });
    b.state.turn.turnNumber = 1; b.state.turn.round = 1; b.state.turn.sideTurns = { player: Number(other === "player"), enemy: Number(other === "enemy") };
    const noHistory = cast(b.state, b.ids[other].hand[0]);
    expect(copies(noHistory.events)).toEqual([]);
    const dusk = passUntil(engine, noHistory.state, s => s.turn.phase === "dusk" && engine.decision(s)?.side === side).state;
    const interrupt = cast(dusk, b.ids[side].hand[0]);
    const firstOwn = next(interrupt.state);
    expect(firstOwn.state.turn.sideTurns[side]).toBe(1);
    expect(copies(firstOwn.events)).toMatchObject([{ side, original: b.ids[side].hand[0] }]);
  });

  it("first actual event excludes a preceding character, later events and stack copies", () => {
    const b = world(side, { back: [echo.id], hand: [v.vanilla0.id, first.id, later.id, extra.id] });
    let state = cast(b.state, b.ids[side].hand[0]).state;
    state = step(state, { kind: "play", card: b.ids[side].hand[1], from: "hand" }).state;
    const copied = step(state, { kind: "resolveTrigger" });
    expect(copies(copied.events)).toHaveLength(1);
    state = step(step(copied.state, { kind: "resolveTop" }).state, { kind: "resolveTop" }).state;
    // The same watcher copies each later spell; drain real stack and FIFO through the public driver.
    state = engine.apply(state, side, { kind: "play", card: b.ids[side].hand[2], from: "hand" }, NO_PROMPTS).state;
    while (state.stack.length > 0) state = engine.apply(state, engine.decision(state)!.side, { kind: "pass" }, NO_PROMPTS).state;
    state = engine.apply(state, side, { kind: "play", card: b.ids[side].hand[3], from: "hand" }, NO_PROMPTS).state;
    while (state.stack.length > 0) state = engine.apply(state, engine.decision(state)!.side, { kind: "pass" }, NO_PROMPTS).state;
    expect(copies(next(state).events)).toMatchObject([{ original: b.ids[side].hand[1], side }]);
  });

  it("captured values and created lifecycle survive cessation and mutable noncopiable status", () => {
    const variant = { amplified: true, transfigurations: ["Inspired" as const], deckMods: { ...NO_DECK_MODS, costReduction: 1, fast: true } };
    const b = world(side, { hand: [{ cardId: first.id, ...variant }, later.id, extra.id, reader.id] });
    const original = b.ids[side].hand[0];
    Object.assign(b.state.instances[original].status, { created: true, gainedSpark: 7, counters: 4, offering: true, x: 6 });
    const gone = cast(b.state, original);
    expect(gone.state.instances[original]).toBeUndefined();
    const advanced = next(cast(gone.state, b.ids[side].hand[2]).state);
    const [made] = copies(advanced.events);
    const output = advanced.state.instances[made.copy];
    expect(output).toMatchObject({ printing: { kind: "card", cardId: first.id }, variant, owner: side, controller: side, status: {
      created: true, ephemeral: true, gainedSpark: 0, counters: 0, offering: false, reclaimed: false, playedViaReclaim: false, x: null,
    } });
    expect(output.status.gainedAbilities).toBeUndefined();
    expect(eventSeenBy(made, side, advanced.state)).toMatchObject({ original: null });
    expect(eventSeenBy(made, other, advanced.state)).toBeNull();
    const played = step(advanced.state, { kind: "play", card: made.copy, from: "hand" });
    expect(played.state.instances[made.copy].status.ephemeral).toBe(false);
    expect(step(played.state, { kind: "resolveTop" }).state.instances[made.copy]).toBeUndefined();
    expect(next(advanced.state).state.instances[made.copy]).toBeUndefined();
    const live = ready(side);
    const previous = live.state.firstEventHistory!.previous![side]!;
    live.state.instances[previous.instance] = { ...live.state.instances[previous.instance], variant: { amplified: true } };
    const historical = cast(live.state, live.ids[side].hand[3]);
    expect(historical.state.instances[copies(historical.events)[0].copy].variant).toEqual(BASE_VARIANT);
  });

  it("created lifecycle uses the existing event-copy modifiers and observers for each physical copy", () => {
    const f = ready(side, { back: [modifier.id], dreamsigns: [dawn.id, watch.id] });
    const made = copies(f.events);
    expect(made).toHaveLength(2);
    expect(made[1].bonusFrom).toMatchObject({ primary: made[0].copy });
    expect(new Set(made.map(e => e.copy)).size).toBe(2);
    for (const e of made) expect(f.state.instances[e.copy]).toMatchObject({ owner: side, controller: side, status: { created: true, ephemeral: true } });
    expect(f.events.flatMap(e => e.kind === "energyChanged" && e.cause === "effect" ? [e.change] : [])).toEqual([3, 3]);
  });

  it("privacy and sampling keep one current occurrence and no hidden physical alias", () => {
    const b = world(side, { hand: [first.id, hide.id, extra.id, reader.id] });
    const hidden = cast(cast(b.state, b.ids[side].hand[0]).state, b.ids[side].hand[1]).state;
    for (const viewer of SIDES) {
      const seen = engine.view(hidden, viewer);
      expect(seen.firstEventHistory!.current![side]).toMatchObject({ instance: null, printing: { cardId: first.id } });
      expect(JSON.stringify(seen.firstEventHistory)).not.toContain(`"${b.ids[side].hand[0]}"`);
      const sampled = engine.determinize(seen, decklists(hidden), () => 0.25);
      expect(comparableView(engine.view(sampled, viewer))).toEqual(comparableView(seen));
      expect(sampled.firstEventHistory!.current![side]!.instance).toBe(sampled.turnLog.played[side][0].instance);
      expect(sampled.instances[sampled.firstEventHistory!.current![side]!.instance]).toBeUndefined();
      expect(parseEngineBattleFold(foldOf(sampled), engine.catalog)).not.toBeNull();
    }
    const prior = next(cast(hidden, b.ids[side].hand[2]).state).state;
    for (const viewer of SIDES) {
      const seen = engine.view(prior, viewer);
      const sampled = engine.determinize(seen, decklists(prior), () => 0.75);
      expect(comparableView(engine.view(sampled, viewer))).toEqual(comparableView(seen));
      const original = sampled.firstEventHistory!.previous![side]!.instance;
      expect(sampled.instances[original]).toBeUndefined();
      const altered = cloneState(prior);
      const anonymous: InstanceId = `i${altered.nextInstance++}`;
      altered.firstEventHistory!.previous![side] = { ...altered.firstEventHistory!.previous![side]!, instance: anonymous };
      expect(engine.view(altered, viewer)).toEqual(seen);
      expect(stateHash(engine.determinize(engine.view(altered, viewer), decklists(prior), () => 0.75))).toBe(stateHash(sampled));
    }
    const cloned = cloneState(prior), roundtrip = deserializeState(serializeState(prior));
    expect(stateHash(cloned)).toBe(stateHash(roundtrip));
    (cloned.firstEventHistory!.previous![side]!.variant as { deckMods?: typeof NO_DECK_MODS }).deckMods = { ...NO_DECK_MODS, fast: true };
    expect(stateHash(cloned)).not.toBe(stateHash(prior));
    expect(cycleHash(cloned)).not.toBe(cycleHash(prior)); expect(loopSignature(cloned)).not.toBe(loopSignature(prior));
  });

  it("saved boundary rejects malformed or unknown required windows and preserves unrelated legacy recovery", () => {
    const f = ready(side), valid = foldOf(f.state);
    expect(parseEngineBattleFold(valid, engine.catalog)).not.toBeNull();
    const entry = f.state.firstEventHistory!.previous![side]!;
    const empty = { player: null, enemy: null };
    const malformed = [true, {}, { current: empty }, { current: empty, previous: empty, extra: true },
      { current: empty, previous: { [side]: entry } }, { current: empty, previous: { ...empty, [side]: { ...entry, instance: "i999999" } } },
      { current: empty, previous: { ...empty, [side]: { ...entry, extra: true } } },
      { current: empty, previous: { ...empty, [side]: { ...entry, variant: { amplified: "yes" } } } },
      { current: { ...empty, [side]: entry }, previous: empty }];
    for (const firstEventHistory of malformed) expect(parseEngineBattleFold({ ...valid, slice: { ...valid.slice, committed: { ...f.state, firstEventHistory } } }, engine.catalog)).toBeNull();
    for (const boundary of ["absent", "current", "previous", "history"] as const) {
      const legacy = structuredClone(valid);
      if (boundary === "absent") delete legacy.slice.committed.firstEventHistory;
      else if (boundary === "history") { const base = structuredClone(legacy.slice); delete base.committed.firstEventHistory; legacy.slice = { ...legacy.slice, history: { base, entries: [] } }; }
      else legacy.slice.committed.firstEventHistory![boundary] = null;
      expect(parseEngineBattleFold(legacy, engine.catalog)).toBeNull();
    }
    const legacy = cloneState(f.state); delete legacy.firstEventHistory;
    expect(Object.prototype.hasOwnProperty.call(cloneState(legacy), "firstEventHistory")).toBe(false);
    expect(() => cast(legacy, f.ids[side].hand[3])).toThrow();
    // A reader-free catalogue establishes compatibility independently of the current source inventory.
    const plain = createEngine(testCatalog(cards.map(card => ({ ...card, abilities: () => [] })), { dreamsigns: [{ ...dawn, abilities: () => [] }] }));
    expect(parseEngineBattleFold(foldOf(legacy), plain.catalog)).not.toBeNull();
    const one = next(legacy, plain).state;
    expect(one.firstEventHistory!.previous).toBeNull();
    expect(next(one, plain).state.firstEventHistory!.previous).toEqual(empty);
  });

  it("saved boundary recognizes ceased, gained and delayed origins without guessing hidden card definitions", () => {
    const b = world(side, { hand: [], dreamsigns: [] }, { hand: [], dreamsigns: [] });
    const empty = foldOf(b.state);
    const origin = { kind: "card" as const, cardId: reader.id, variant: BASE_VARIANT };
    for (const location of ["stack", "queue", "gained", "delayed"] as const) {
      const retained = structuredClone(empty), state = retained.slice.committed;
      const source: InstanceId = `i${state.nextInstance++}`;
      if (location === "stack" || location === "gained") state.stack.push({ kind: "ability", source, controller: side, ability: 0, choices: { modes: [], targets: [] }, x: null, optionalPaid: [],
        origin: location === "gained" ? { kind: "card", cardId: v.vanilla1.id, variant: BASE_VARIANT, gained: [{ cardId: reader.id, variant: BASE_VARIANT }] } : origin });
      else if (location === "queue") state.triggerQueue.push({ source, controller: side, origin, ability: 0, node: null, subject: null });
      else { state.floating.push({ id: "e1", source, controller: side, timestamp: 0, expiry: { at: "never" }, change: { kind: "trigger", ref: { origin, ability: 0, node: 0 }, once: true } }); state.nextEffect = 2; }
      expect(parseEngineBattleFold(retained, engine.catalog), location).not.toBeNull();
      delete state.firstEventHistory;
      expect(parseEngineBattleFold(retained, engine.catalog), location).toBeNull();
    }
    delete empty.slice.committed.firstEventHistory;
    expect(parseEngineBattleFold(empty, engine.catalog)).not.toBeNull();
  });

  it("transactional capture rolls back an error after actual play recording and recovers from the committed boundary", () => {
    const b = world(side);
    delete b.state.characterScoring;
    const failing = createEngine(testCatalog(cards, { dreamsigns: [{ ...dawn, abilities: () => [triggered(whenYouPlay(), p.gainEnergy(1), { condition: scoredWithCharacterLastTurn() })] }] }));
    const before = stateHash(b.state);
    expect(() => runStep(b.state, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, NO_PROMPTS, failing.catalog)).toThrow();
    expect(stateHash(b.state)).toBe(before);
    const recovered = cast(deserializeState(serializeState(b.state)), b.ids[side].hand[0]);
    expect(recovered.state.firstEventHistory!.current![side]).toMatchObject({ instance: b.ids[side].hand[0], printing: { cardId: first.id } });
  });

  it("transactional Ending suspension keeps the preceding window fixed until an actual completed transition", () => {
    const handLimit = world(side).state.config.handLimit;
    const b = world(side, { hand: [first.id, ...Array.from({ length: handLimit + 1 }, () => v.vanilla1.id)] });
    const played = cast(b.state, b.ids[side].hand[0]);
    const night = passUntil(engine, played.state, at(engine, side, "night")).state;
    const adapter = createFoldAdapter(engine, { checkEventPrefix: true });
    const held = applied(adapter.reduce(slice(night), { kind: "battleAction", side, action: { kind: "pass" } }));
    const pending = adapter.pending(held)!;
    expect(pending.prompt.kind).toBe("chooseCards");
    expect(held.committed.firstEventHistory).toEqual(night.firstEventHistory);
    expect(pending.display.firstEventHistory).toEqual(night.firstEventHistory);
    if (pending.prompt.kind !== "chooseCards") throw new Error("Missing hand-limit choice");
    const answer = { kind: "answer" as const, side, promptId: pending.prompt.id, value: pending.prompt.candidates.slice(0, pending.prompt.min) };
    const direct = applied(adapter.reduce(held, answer));
    const restored = applied(createFoldAdapter(engine, { checkEventPrefix: true }).reduce(structuredClone(held), answer));
    expect(stateHash(restored.committed)).toBe(stateHash(direct.committed));
    expect(restored.committed.turn.turnNumber).toBeGreaterThan(night.turn.turnNumber);
    expect(restored.committed.firstEventHistory!.previous![side]).toMatchObject({ instance: b.ids[side].hand[0] });
  });

  it("transactional prompt replay and refusal retain the captured boundary after a partial copy", () => {
    const f = ready(side, { hand: [first.id, later.id, extra.id, paused.id] });
    const local = createEngine(testCatalog(cards.map(card => card.id === paused.id ? broken : card), { dreamsigns: [dawn] }));
    const adapter = createFoldAdapter(local, { checkEventPrefix: true });
    let current = applied(adapter.reduce(slice(f.state), { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[3], from: "hand" } }));
    while (adapter.pending(current) === null) current = applied(adapter.reduce(current, { kind: "battleAction", side: local.decision(current.committed)!.side, action: { kind: "pass" } }));
    const pending = adapter.pending(current)!, saved = structuredClone(current), before = stateHash(saved.committed);
    expect(pending.display.sides[side].hand.length).toBeGreaterThan(saved.committed.sides[side].hand.length);
    if (pending.prompt.kind !== "chooseCards") throw new Error("Missing discard choice");
    const answer = { kind: "answer" as const, side, promptId: pending.prompt.id, value: [pending.prompt.candidates[0]] };
    expect(adapter.reduce(saved, { ...answer, side: other })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(adapter.reduce(saved, { ...answer, promptId: parsePromptId("999:999:999") })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(adapter.reduce(saved, { ...answer, value: ["i999999"] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(adapter.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(adapter.reduce(saved, { kind: "battleAction", side: other, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const failed = adapter.reduce(saved, answer);
    expect(failed.kind).toBe("applied");
    if (failed.kind !== "applied") throw new Error("Missing error recovery");
    expect(failed.error).not.toBeNull(); expect(stateHash(failed.slice.committed)).toBe(before); expect(failed.slice.inFlight).toBeNull();
    const repaired = createFoldAdapter(engine, { checkEventPrefix: true });
    const resumed = applied(repaired.reduce(structuredClone(saved), answer));
    const direct = applied(repaired.reduce(saved, answer));
    expect(stateHash(resumed.committed)).toBe(stateHash(direct.committed));
    expect(resumed.committed.firstEventHistory).toEqual(saved.committed.firstEventHistory);
    expect(repaired.reduce(resumed, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(saved.committed)).toBe(before);
    const b = world(side, { hand: [modal.id] });
    const cancelAdapter = createFoldAdapter(engine), opened = applied(cancelAdapter.reduce(slice(b.state), { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } }));
    const prompt = cancelAdapter.pending(opened)!.prompt;
    const cancelled = applied(cancelAdapter.reduce(opened, { kind: "cancel", side, promptId: prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(b.state));
    const replayed = applied(cancelAdapter.reduce(structuredClone(opened), { kind: "answer", side, promptId: prompt.id, value: 0 }));
    const source = new ScriptedSource([0]);
    const inline = engine.apply(b.state, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, source);
    source.assertExhausted(); expect(stateHash(replayed.committed)).toBe(stateHash(inline.state));
    expect(cancelAdapter.reduce(cancelled, { kind: "answer", side, promptId: prompt.id, value: 0 })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });
});

it("first-event last-turn refuses unsupported builders and preflights invalid captured values atomically", () => {
  for (const options of [undefined, null, {}, { ephemeral: false }]) expect(() => p.copyFirstEventLastTurnToHand(options as never)).toThrow();
  const f = ready("player"), original = serializeState(f.state);
  f.state.firstEventHistory!.previous!.player = { instance: f.ids.player.hand[0], printing: { kind: "card", cardId: id(999) }, variant: BASE_VARIANT };
  const before = stateHash(f.state);
  expect(() => cast(f.state, f.ids.player.hand[3])).toThrow(); expect(stateHash(f.state)).toBe(before);
  expect(original).not.toBe(serializeState(f.state));
});

it("first-event last-turn recovers a required unknown checkpoint from actual genesis and events", async () => {
  registerReplayFixtureProviders();
  const baseProvider = getBattleInitProvider()!;
  const ownDeck = [first.id, extra.id, paused.id, ...deck].map(cardId => ({ cardId }));
  const init: BattleInit = { seed: world("player").state.seed, scoreToWin: 1000, decks: { player: ownDeck, enemy: deck.map(cardId => ({ cardId })) }, dreamwell: [], dreamsigns: { player: [dawn.id] }, setup: {
    placements: [{ side: "player", deckIndex: 0, zone: "hand" }, { side: "player", deckIndex: 1, zone: "hand" }, { side: "player", deckIndex: 2, zone: "hand" }],
    sides: { player: { currentEnergy: 20, maxEnergy: 20, score: 0 }, enemy: { currentEnergy: 20, maxEnergy: 20, score: 0 } },
    turn: { active: "player", phase: "day", round: 1, turnNumber: 1, sideTurns: { player: 1, enemy: 0 }, lastNormal: "player" }, dreamwell: { deck: [], next: 0 },
  } };
  registerBattleInitProvider({ engine, beginBattle(input) { const declared = baseProvider.beginBattle(input); return declared === null ? null : { ...declared, engineInit: init }; } });
  const genesis = decodeGenesis(JSON.stringify(battleFixture.genesis));
  if (genesis === null || !isFoldableGenesis(genesis)) throw new Error("Missing synthetic genesis");
  const store = createMemoryKeyValueStore(), repository = createGameRepository(store), gameId = parseGameId("first-event-reload");
  const game = await createLocalGame(repository, GAME_ENGINE_CONFIG, { gameId, genesis, localPlayerId: parseClientId("first-event-reload") }, { checkpointInterval: 1, now: () => 0, eventClock: () => "2026-01-01T00:00:00.000Z" });
  try {
    for (const record of battleFixture.events) { const e = decodeEvent(JSON.stringify(record.event)); game.log.append({ type: e.type, payload: e.payload }); if (e.type === "BEGIN_BATTLE") break; }
    const act = (cardId: typeof first.id) => {
      const state = game.log.state().battle!.engine.slice.committed;
      const card = state.sides.player.hand.find(id => state.instances[id].printing.kind === "card" && state.instances[id].printing.cardId === cardId)!;
      game.log.append({ type: "BATTLE_ACTION", payload: { side: "player", action: { kind: "play", card, from: "hand" } } });
      while (game.log.state().battle!.engine.slice.committed.stack.length) game.log.append({ type: "BATTLE_ACTION", payload: { side: engine.decision(game.log.state().battle!.engine.slice.committed)!.side, action: { kind: "pass" } } });
    };
    act(first.id); act(extra.id);
    for (let n = 0; ; n++) { const state = game.log.state().battle!.engine.slice.committed; if (state.turn.turnNumber > 1 && at(engine, "player", "day")(state)) break; if (n > 30) throw new Error("Missing next turn"); game.log.append({ type: "BATTLE_ACTION", payload: { side: engine.decision(state)!.side, action: { kind: "pass" } } }); }
    await game.flush();
    const exact = GAME_ENGINE_CONFIG.encode(game.log.state()), checkpoint = await store.get(`game/${gameId}/checkpoint`) as StoredCheckpoint;
    const saved = JSON.parse(checkpoint.state) as FoldState; delete saved.battle!.engine.slice.committed.firstEventHistory;
    await store.putAll([[`game/${gameId}/checkpoint`, { ...checkpoint, state: JSON.stringify(saved), stateHash: hashState(saved) }]]);
    const loaded = await openLocalGame(repository, GAME_ENGINE_CONFIG, gameId, { now: () => 0 });
    if (loaded === null) throw new Error("Missing recovery");
    try { expect(loaded.opened).toMatchObject({ checkpointRejected: true, replayFoldErrors: 0 }); expect(GAME_ENGINE_CONFIG.encode(loaded.log.state())).toBe(exact); } finally { await loaded.close(); }
    const count = (await repository.readEvents(gameId, 0)).length;
    game.log.append({ type: "LOAD_STATE", payload: { snapshot: saved.journey, battle: saved.battle } }); await game.flush();
    expect(GAME_ENGINE_CONFIG.encode(game.log.state())).toBe(exact); expect((await repository.readEvents(gameId, 0)).length).toBe(count + 1);
  } finally { await game.close(); }
});
