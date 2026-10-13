import { describe, expect, it } from "vitest";
import { parseBattleId, parseDreamsignId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { battleLogEntries } from "../../../../screens/cumulus_adapters/engine-battle-log-view-model";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { all, characterYouControl, energy, event, everyIn, self } from "../../../dsl/builders";
import { triggered, triggeringCard, whenDraw, whenGainsSpark } from "../../../dsl/triggers";
import type { Duration, Trigger } from "../../../dsl/types";
import { createEngine, type Engine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOf } from "../../../rules/zones";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { SIDES, opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { runStep } from "../../../steps/runner";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { resolveEffect } from "../../interpreter";
import type { Effect } from "../../registry";
import * as p from "../index";

const SUBJECT = { ...v.vanilla2, id: syntheticId(0x648001), costs: [energy(0)] };
const DRAW = { ...v.event0, id: syntheticId(0x648002), abilities: () => [event(p.draw(1))] };
const CREATE = { ...v.event0, id: syntheticId(0x648003), abilities: () => [event(p.createCard(SUBJECT.id))] };
const SOURCE = { ...v.vanilla1, id: syntheticId(0x648004), costs: [energy(0)] };
const signId = parseDreamsignId("00000000-0000-0000-0000-000000648001");
const gain = (amount = 2, duration: Duration = "untilEndOfTurn") => p.gainSpark(all(characterYouControl()), amount, duration);
function world(side: Side, trigger: Trigger, effect: Effect, setup: SideSetup, extra: readonly EngineCardDefinition[] = [], cardSource = false) {
  const watcher: EngineDreamsignDefinition = { id: signId, status: "authored", abilities: () => [triggered(trigger, effect)] };
  const producer = { ...SOURCE, abilities: watcher.abilities };
  const engine = createEngine(testCatalog([SUBJECT, DRAW, CREATE, producer, ...extra], { dreamsigns: [watcher] }));
  const initial = boardState(engine.catalog, { active: side, phase: "day", [side]: {
    energy: 8, deck: [v.vanilla5.id, v.vanilla5.id],
    ...(cardSource ? { back: [producer.id] } : { dreamsigns: [signId] }), ...setup,
  }, [opponent(side)]: { energy: 8, deck: [v.vanilla5.id, v.vanilla5.id] } });
  return { engine, ...initial };
}
function cast(engine: Engine, state: BattleState, side: Side, card: InstanceId) {
  const first = engine.apply(state, side, { kind: "play", card, from: "hand" }, NO_PROMPTS);
  const rest = passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
  expect(invariantViolations(rest.state, engine.catalog)).toEqual([]);
  return { state: rest.state, events: [...first.events, ...rest.events] };
}
const gains = (events: readonly EngineEvent[]) => events.filter(event => event.kind === "sparkGained");
const starts = (events: readonly EngineEvent[]) => events.filter(event => event.kind === "effectStarted").filter(event => event.change.kind === "spark");
function logged(engine: Engine, events: readonly EngineEvent[], viewer: Side, state: BattleState, before: BattleState) {
  return battleLogEntries(events, viewer, state, engine.view(state, viewer), engine.view(before, viewer), "temporary-spark-contract");
}
function assertPublic(engine: Engine, events: readonly EngineEvent[], state: BattleState, before: BattleState) {
  for (const transported of [events, JSON.parse(JSON.stringify(events)) as EngineEvent[]]) for (const viewer of SIDES) {
    expect(starts(transported).map(event => eventSeenBy(event, viewer, state))).toEqual(starts(events));
    expect(logged(engine, transported, viewer, state, before).filter(entry => entry.event.kind === "effectStarted").map(entry => entry.event)).toEqual(starts(events));
  }
  expect(state.floating.every(effect => !("sparkSeenBy" in effect))).toBe(true);
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome;
}
function saved(value: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("battle-temporary-spark"), siteId: parseSiteId("site-temporary-spark"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-temporary-spark"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
    avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: value } };
}

describe("ordinary and additional temporary spark observations", () => {
  it.each(SIDES)("retains ordinary announcements after the subject and source shuffle for %s", side => {
    const w = world(side, whenDraw(), p.sequence(gain(), p.returnToHand(all(characterYouControl())), p.shuffleInto([everyIn("hand")])),
      { hand: [DRAW.id], back: [SOURCE.id, SUBJECT.id] }, [], true);
    const done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(starts(done.events)).toHaveLength(2);
    for (const id of w.ids[side].back) {
      expect(done.state.instances[id!].zone).toBe("deck");
      for (const viewer of SIDES) expect(w.engine.view(done.state, viewer).instances[id!]).toBeUndefined();
    }
    expect(gains(done.events)).toEqual(w.ids[side].back.map(instance => ({ kind: "sparkGained", instance, amount: 2, expiry: { at: "endOfTurn" }, additional: false })));
    assertPublic(w.engine, done.events, done.state, w.state);
  });

  it.each(SIDES.flatMap(side => ["ordinary", "additional"].flatMap(kind => ["shuffle", "cease"].map(departure => ({ side, kind, departure }))))) ("retains $kind companions after $departure for $side", ({ side, kind, departure }) => {
      const leave = p.sequence(p.returnToHand(all(characterYouControl())), ...(departure === "shuffle" ? [p.shuffleInto([everyIn("hand")])] : []));
      const PUMP = { ...v.event0, id: syntheticId(0x648005), abilities: () => [event(p.sequence(gain(), ...(kind === "ordinary" ? [leave] : [])))] };
      const w = world(side, whenGainsSpark(), kind === "additional" ? p.sequence(p.gainAdditionalSpark(triggeringCard(), 1), leave) : p.gainPoints(1),
        { hand: [CREATE.id, PUMP.id], back: departure === "shuffle" ? [SUBJECT.id] : [] }, [PUMP]);
      const created = departure === "shuffle" ? w.state : cast(w.engine, w.state, side, w.ids[side].hand[0]).state;
      const id = departure === "shuffle" ? w.ids[side].back[0]! : created.sides[side].hand.find(id => created.instances[id].status.created)!;
      const played = departure === "shuffle" ? created : cast(w.engine, created, side, id).state;
      const done = cast(w.engine, played, side, w.ids[side].hand[1]);
      expect(departure === "cease" ? done.state.instances[id] : done.state.instances[id]?.zone).toBe(departure === "cease" ? undefined : "deck");
      expect(gains(done.events)).toEqual([
        { kind: "sparkGained", instance: id, amount: 2, expiry: { at: "endOfTurn" }, additional: false },
        ...(kind === "additional" ? [{ kind: "sparkGained", instance: id, amount: 1, expiry: { at: "endOfTurn" }, additional: true }] : []),
      ]);
      expect(starts(done.events)).toHaveLength(kind === "additional" ? 2 : 1);
      expect(done.events.filter(event => event.kind === "triggerQueued")).toHaveLength(1);
      assertPublic(w.engine, done.events, done.state, played);
    });

  it.each(SIDES.flatMap(side => ["ordinary", "additional"].map(kind => ({ side, kind }))))("keeps $kind causal source private after its later revelation for $side", ({ side, kind }) => {
    const PUMP = { ...v.event0, id: syntheticId(0x648006), abilities: () => [event(gain())] };
    const effect = p.sequence(p.returnToHand(self()), kind === "ordinary" ? gain() : p.gainAdditionalSpark(triggeringCard(), 1),
      p.reveal(), p.materialize(everyIn("hand", { cardType: "character" })));
    const w = world(side, kind === "ordinary" ? whenDraw() : whenGainsSpark(), effect,
      { hand: [kind === "ordinary" ? DRAW.id : PUMP.id], back: [SOURCE.id, SUBJECT.id] }, [PUMP], true);
    const source = w.ids[side].back[0]!, subject = w.ids[side].back[1]!, done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(done.state.instances[source].zone).toBe("play");
    const privateStarts = starts(done.events).filter(event => event.source === source);
    expect(privateStarts).toHaveLength(1);
    expect(privateStarts[0].change).toEqual({ kind: "spark", instance: subject, amount: kind === "ordinary" ? 2 : 1 });
    for (const raw of [done.events, JSON.parse(JSON.stringify(done.events)) as EngineEvent[]]) {
      const announcement = starts(raw).find(event => event.source === source)!;
      expect(eventSeenBy(announcement, side, done.state)).toEqual(announcement);
      expect(eventSeenBy(announcement, opponent(side), done.state)).toBeNull();
      const blind = logged(w.engine, raw, opponent(side), done.state, w.state).filter(entry => entry.event.kind === "effectStarted" && entry.event.source === source);
      expect(blind).toEqual([]);
    }
    expect(done.state.floating.every(effect => !("sparkSeenBy" in effect))).toBe(true);
  });

  it.each(SIDES.flatMap(side => [0, -1, 2].map(amount => ({ side, amount }))))("retains exact $amount gain and additional inherited expiry for $side", ({ side, amount }) => {
    const PUMP = { ...v.event0, id: syntheticId(0x648007), abilities: () => [event(gain(amount))] };
    const w = world(side, whenGainsSpark(), p.gainAdditionalSpark(triggeringCard(), 1), { hand: [PUMP.id], back: [SUBJECT.id] }, [PUMP]);
    const id = w.ids[side].back[0]!, done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(gains(done.events)).toEqual([
      { kind: "sparkGained", instance: id, amount, expiry: { at: "endOfTurn" }, additional: false },
      ...(amount > 0 ? [{ kind: "sparkGained", instance: id, amount: 1, expiry: { at: "endOfTurn" }, additional: true }] : []),
    ]);
    expect(done.events.filter(event => event.kind === "triggerQueued")).toHaveLength(amount > 0 ? 1 : 0);
    expect(effectiveSpark(done.state, w.engine.catalog, id)).toBe(2 + amount + (amount > 0 ? 1 : 0));
    expect(done.state.instances[id].status.gainedSpark).toBe(0);
    assertPublic(w.engine, done.events, done.state, w.state);
    const loaded = deserializeState(serializeState(done.state));
    expect(stateHash(loaded)).toBe(stateHash(done.state));
    const ended = passUntil(w.engine, loaded, at(w.engine, opponent(side), "day")).state;
    expect(ended.floating).toEqual([]);
    expect(effectiveSpark(ended, w.engine.catalog, id)).toBe(2);
  });

  it.each(SIDES.flatMap(side => [0, -1, 2].map(amount => ({ side, amount }))))("announces additional $amount without triggering another gain ability for $side", ({ side, amount }) => {
    const PUMP = { ...v.event0, id: syntheticId(0x64800b), abilities: () => [event(gain())] };
    const w = world(side, whenGainsSpark(), p.gainAdditionalSpark(triggeringCard(), amount), { hand: [PUMP.id], back: [SUBJECT.id] }, [PUMP]);
    const id = w.ids[side].back[0]!, done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(gains(done.events)[1]).toEqual({ kind: "sparkGained", instance: id, amount, expiry: { at: "endOfTurn" }, additional: true });
    expect(starts(done.events)).toHaveLength(2);
    expect(done.events.filter(event => event.kind === "triggerQueued")).toHaveLength(1);
    expect(effectiveSpark(done.state, w.engine.catalog, id)).toBe(4 + amount);
    assertPublic(w.engine, done.events, done.state, w.state);
  });

  it.each(SIDES)("retains additional announcements after its public card source shuffles for %s", side => {
    const PUMP = { ...v.event0, id: syntheticId(0x64800c), abilities: () => [event(gain())] };
    const w = world(side, whenGainsSpark(), p.sequence(p.gainAdditionalSpark(triggeringCard(), 1), p.returnToHand(all(characterYouControl())), p.shuffleInto([everyIn("hand")])),
      { hand: [PUMP.id], back: [SOURCE.id, SUBJECT.id] }, [PUMP], true);
    const done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(gains(done.events).filter(event => event.additional)).toHaveLength(1);
    expect(done.state.instances[w.ids[side].back[0]!].zone).toBe("deck");
    assertPublic(w.engine, done.events, done.state, w.state);
  });

  it.each(SIDES)("keeps permanent storage and excludes departed characters and expired source durations for %s", side => {
    const w = world(side, whenDraw(), p.sequence(gain(2, "permanent"), p.returnToHand(self()), gain(3, "whileSourceInPlay"), p.returnToHand(all(characterYouControl())), gain()),
      { hand: [DRAW.id], back: [SOURCE.id, SUBJECT.id] }, [], true);
    const done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(starts(done.events)).toEqual([]);
    expect(gains(done.events)).toHaveLength(2);
    for (const id of w.ids[side].back) expect(done.state.instances[id!].status.gainedSpark).toBe(2);
    expect(done.state.floating).toEqual([]);
  });

  it.each(SIDES)("preserves an additional source-bound expiry and skips it when that source leaves for %s", side => {
    const PUMP = { ...v.event0, id: syntheticId(0x648008), abilities: () => [event(p.draw(1))] };
    for (const departed of [false, true]) {
      const source = { ...SOURCE, id: syntheticId(0x64800a), abilities: () => [triggered(whenDraw(), gain(2, "whileSourceInPlay"))] };
      const w = world(side, whenGainsSpark(), p.sequence(...(departed ? [p.returnToHand(all(characterYouControl()))] : []), p.gainAdditionalSpark(triggeringCard(), 1)),
        { hand: [PUMP.id], back: [source.id, SUBJECT.id] }, [PUMP, source]);
      const done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
      expect(gains(done.events).filter(event => event.additional)).toHaveLength(departed ? 0 : 2);
      if (!departed) {
        expect(done.state.floating.every(effect => effect.expiry.at === "sourceLeavesPlay" && effect.expiry.source === w.ids[side].back[0])).toBe(true);
        assertPublic(w.engine, done.events, done.state, w.state);
      } else expect(done.state.floating).toEqual([]);
    }
  });

  it.each(SIDES)("retains announcements through serialized post-gain suspension and rejects competing inputs for %s", side => {
    const w = world(side, whenDraw(), p.sequence(gain(), p.optional(p.sequence(p.returnToHand(all(characterYouControl())), p.shuffleInto([everyIn("hand")])))),
      { hand: [DRAW.id], back: [SUBJECT.id] });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const opening = applied(fold.reduce(slice(w.state), { kind: "battleAction", side, action: { kind: "play", card: w.ids[side].hand[0], from: "hand" } }));
    const pending = fold.pending(opening.slice);
    if (pending === null) throw new Error("Missing post-gain optional prompt");
    const transport = JSON.parse(JSON.stringify({ slice: opening.slice, prefix: opening.published })) as { slice: BattleSlice; prefix: EngineEvent[] };
    const parsed = parseJourneyBattleFoldState(saved(transport.slice));
    if (parsed === null) throw new Error("Suspended temporary gain failed parsing");
    const fresh = createFoldAdapter(w.engine, { checkEventPrefix: true }), loaded = parsed.engine.slice;
    expect(fresh.pending(loaded)).toEqual(pending);
    expect(starts(transport.prefix)).toHaveLength(1);
    expect(fresh.reduce(loaded, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(loaded, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(loaded, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const answer = { kind: "answer", side, promptId: pending.prompt.id, value: true } as const;
    expect(fresh.reduce({ ...loaded, attempt: loaded.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const direct = applied(fold.reduce(opening.slice, answer)), restarted = applied(fresh.reduce(loaded, answer));
    expect(restarted.published).toEqual(direct.published);
    expect(restarted.slice.publishedEvents).toBe(direct.slice.publishedEvents);
    expect(stateHash(restarted.slice.committed)).toBe(stateHash(direct.slice.committed));
    expect(fresh.reduce(restarted.slice, answer).kind).toBe("bounced");
    assertPublic(w.engine, [...transport.prefix, ...restarted.published], restarted.slice.committed, w.state);
  });

  it.each(SIDES)("rolls back a fault after the real temporary gain and recovers atomically for %s", side => {
    let fail = true;
    const fault: EngineCardDefinition = { ...v.event0, id: syntheticId(0x648009), abilities: () => [], synthetic: { resolve(ctx, item) {
      resolveEffect(ctx, gain(), { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
      if (fail) throw new Error("injected fault after temporary gain");
    } } };
    const engine = createEngine(testCatalog([fault, SUBJECT]));
    const w = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [fault.id], back: [SUBJECT.id], deck: [v.vanilla5.id] } });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const result = fold.reduce(slice(w.state), { kind: "battleAction", side, action: { kind: "play", card: w.ids[side].hand[0], from: "hand" } });
    if (result.kind !== "applied" || result.error === null) throw new Error("Expected injected gain failure");
    expect(result.published.some(event => event.kind === "effectStarted" || event.kind === "sparkGained")).toBe(false);
    expect(result.slice.committed.floating).toEqual([]);
    expect(effectiveSpark(result.slice.committed, engine.catalog, w.ids[side].back[0]!)).toBe(2);
    expect(fold.pending(result.slice)).toBeNull();
    fail = false;
    const recovered = runStep(result.slice.committed, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog);
    if (recovered.kind !== "done") throw new Error("Unexpected recovery prompt");
    expect(starts(recovered.events)).toHaveLength(1);
    expect(effectiveSpark(recovered.state, engine.catalog, w.ids[side].back[0]!)).toBe(4);
    assertPublic(engine, recovered.events, recovered.state, w.state);
  });
});
