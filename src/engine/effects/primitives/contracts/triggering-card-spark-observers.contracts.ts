import { describe, expect, it } from "vitest";
import { parseBattleId, parseDreamsignId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { battleLogEntries } from "../../../../screens/cumulus_adapters/engine-battle-log-view-model";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { all, characterYouControl, energy, event, everyIn } from "../../../dsl/builders";
import { triggered, triggeringCard, whenDraw, whenGainsSpark } from "../../../dsl/triggers";
import type { Duration, Trigger } from "../../../dsl/types";
import { createEngine, type Engine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { effectiveSpark } from "../../../rules/spark";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { SIDES, opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import type { Effect } from "../../registry";
import * as p from "../index";

const SUBJECT = { ...v.vanilla2, id: syntheticId(0x646001), costs: [energy(0)] };
const DRAW = { ...v.event0, id: syntheticId(0x646002), abilities: () => [event(p.draw(1))] };
const PUMP = { ...v.event0, id: syntheticId(0x646003), abilities: () => [event(p.gainSpark(all(characterYouControl()), 2))] };
const CREATE = { ...v.event0, id: syntheticId(0x646004), abilities: () => [event(p.createCard(SUBJECT.id))] };
const sourceCard = { ...v.vanilla1, id: syntheticId(0x646005), costs: [energy(0)] };
const signId = parseDreamsignId("00000000-0000-0000-0000-000000646001");
function world(side: Side, trigger: Trigger, effect: Effect, setup: SideSetup, extra: readonly EngineCardDefinition[] = [], cardSource = false) {
  const watcher: EngineDreamsignDefinition = { id: signId, status: "authored", abilities: () => [triggered(trigger, effect)] };
  const producer = { ...sourceCard, abilities: watcher.abilities };
  const engine = createEngine(testCatalog([SUBJECT, DRAW, PUMP, CREATE, producer, ...extra], { dreamsigns: [watcher] }));
  const initial = boardState(engine.catalog, { active: side, phase: "day", [side]: {
    energy: 8, ...(cardSource ? { back: [producer.id] } : { dreamsigns: [signId] }), deck: [v.vanilla5.id, v.vanilla5.id, v.vanilla5.id], ...setup,
  }, [opponent(side)]: { energy: 8, deck: [v.vanilla5.id, v.vanilla5.id, v.vanilla5.id] } });
  return { engine, ...initial };
}
function cast(engine: Engine, state: BattleState, side: Side, card: InstanceId) {
  const first = engine.apply(state, side, { kind: "play", card, from: "hand" }, NO_PROMPTS);
  const rest = passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
  expect(invariantViolations(rest.state, engine.catalog)).toEqual([]);
  return { state: rest.state, events: [...first.events, ...rest.events] };
}
const gain = (amount = 2, duration: Duration = "permanent") => p.gainTriggeringCardSpark(triggeringCard(), amount, duration);
const gains = (events: readonly EngineEvent[]) => events.filter(event => event.kind === "sparkGained");
function announcements(events: readonly EngineEvent[]) {
  return events.filter(event => event.kind === "sparkGained" || event.kind === "payableEffectRegistered" || event.kind === "effectStarted");
}
function projected(events: readonly EngineEvent[], viewer: Side, state: BattleState) {
  return events.flatMap(event => { const seen = eventSeenBy(event, viewer, state); return seen === null ? [] : [seen]; });
}
function saved(slice: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("battle-spark-observers"), siteId: parseSiteId("site-spark-observers"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-spark-observers"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
    avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice } };
}
function logged(engine: Engine, events: readonly EngineEvent[], viewer: Side, state: BattleState, before: BattleState) {
  return battleLogEntries(events, viewer, state, engine.view(state, viewer), engine.view(before, viewer), "observer-contract");
}
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome;
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });

describe("triggering-card spark emission observers", () => {
  it.each(SIDES.flatMap(side => [0, -1, 2].map(amount => ({ side, amount }))))("keeps a hidden $amount gain private after later revelation for $side", ({ side, amount }) => {
    const w = world(side, whenDraw(), p.sequence(gain(amount), p.reveal()), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] });
    const id = w.ids[side].deck[0], done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(w.engine.view(done.state, opponent(side)).instances[id]).toBeDefined();
    expect(done.state.instances[id].status.gainedSpark).toBe(amount);
    const emitted = gains(done.events);
    expect(emitted).toHaveLength(1);
    for (const events of [done.events, JSON.parse(JSON.stringify(done.events)) as EngineEvent[]]) {
      expect(eventSeenBy(gains(events)[0], side, done.state)).toEqual(emitted[0]);
      expect(eventSeenBy(gains(events)[0], opponent(side), done.state)).toBeNull();
      expect(logged(w.engine, events, side, done.state, w.state).filter(entry => entry.event.kind === "sparkGained")).toHaveLength(1);
      expect(logged(w.engine, events, opponent(side), done.state, w.state).filter(entry => entry.event.kind === "sparkGained")).toEqual([]);
    }
  });

  it.each(SIDES)("shows an informed gain after revelation, even when a later shuffle hides it for %s", side => {
    const w = world(side, whenDraw(), p.sequence(p.reveal(), gain(), p.shuffleInto([everyIn("hand")])), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] });
    const id = w.ids[side].deck[0], done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    const emitted = gains(done.events)[0];
    expect(emitted).toEqual({ kind: "sparkGained", instance: id, amount: 2, expiry: { at: "never" }, additional: false });
    for (const viewer of SIDES) {
      expect(w.engine.view(done.state, viewer).instances[id]).toBeUndefined();
      expect(eventSeenBy(emitted, viewer, done.state)).toEqual(emitted);
      expect(logged(w.engine, done.events, viewer, done.state, w.state).find(entry => entry.event.kind === "sparkGained")?.event).toEqual(emitted);
    }
  });

  it.each(SIDES)("keeps every temporary gain announcement private after later revelation for %s", side => {
    const w = world(side, whenDraw(), p.sequence(gain(2, "untilEndOfTurn"), p.reveal()), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] });
    const id = w.ids[side].deck[0], done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    const transported = JSON.parse(JSON.stringify(done.events)) as EngineEvent[];
    for (const events of [done.events, transported]) {
      expect(announcements(projected(events, side, done.state)).map(event => event.kind)).toEqual(["effectStarted", "sparkGained"]);
      const blind = projected(events, opponent(side), done.state);
      expect(announcements(blind)).toEqual([]);
      expect(JSON.stringify(blind.filter(event => event.kind !== "revealed"))).not.toContain(`"${id}"`);
      expect(announcements(logged(w.engine, events, opponent(side), done.state, w.state).map(entry => entry.event))).toEqual([]);
    }
    expect(done.state.floating[0]).not.toHaveProperty("sparkSeenBy");
  });

  it.each(SIDES)("retains a public temporary announcement after its source and subject shuffle for %s", side => {
    const w = world(side, whenDraw(), p.sequence(p.reveal(), gain(2, "untilEndOfTurn"), p.returnToHand(all(characterYouControl())), p.shuffleInto([everyIn("hand")])), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] }, [], true);
    const done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    const started = done.events.find(event => event.kind === "effectStarted");
    if (started?.kind !== "effectStarted") throw new Error("Missing spark companion");
    for (const viewer of SIDES) {
      expect(w.engine.view(done.state, viewer).instances[w.ids[side].back[0]!]).toBeUndefined();
      expect(eventSeenBy(started, viewer, done.state)).toEqual(started);
      expect(announcements(logged(w.engine, done.events, viewer, done.state, w.state).map(entry => entry.event))).toEqual(announcements(done.events));
    }
  });

  it.each(SIDES)("captures private source authority before a later materialization for %s", side => {
    const w = world(side, whenDraw(), p.sequence(p.returnToHand(all(characterYouControl())), p.reveal(), gain(2, "untilEndOfTurn"), p.materialize(everyIn("hand", { cardType: "character" }))), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] }, [], true);
    const done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    const started = done.events.find(event => event.kind === "effectStarted");
    if (started?.kind !== "effectStarted") throw new Error("Missing spark companion");
    expect(done.state.instances[w.ids[side].back[0]!].zone).toBe("play");
    expect(eventSeenBy(started, side, done.state)).toEqual(started);
    expect(eventSeenBy(started, opponent(side), done.state)).toBeNull();
    expect(logged(w.engine, done.events, opponent(side), done.state, w.state).some(entry => entry.event.kind === "effectStarted")).toBe(false);
  });

  it.each(SIDES)("captures no observers for a concealed deck gain for %s", side => {
    const w = world(side, whenDraw(), p.sequence(p.shuffleInto([everyIn("hand")]), gain(2, "untilEndOfTurn")), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] });
    const id = w.ids[side].deck[0], done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(effectiveSpark(done.state, w.engine.catalog, id)).toBe(4);
    for (const viewer of SIDES) {
      expect(eventSeenBy(gains(done.events)[0], viewer, done.state)).toBeNull();
      expect(announcements(projected(done.events, viewer, done.state))).toEqual([]);
      expect(announcements(logged(w.engine, done.events, viewer, done.state, w.state).map(entry => entry.event))).toEqual([]);
    }
  });

  it.each(SIDES)("protects paid-duration subjects after reveal while preserving payment for %s", side => {
    const w = world(side, whenDraw(), p.sequence(gain(2, { duration: "untilOpponentPays", cost: 1 }), p.reveal()), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] });
    const id = w.ids[side].deck[0], done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    const registered = done.events.find(event => event.kind === "payableEffectRegistered");
    if (registered?.kind !== "payableEffectRegistered") throw new Error("Missing payable registration");
    const effect = done.state.payable[0];
    expect(effect).toEqual({ id: registered.effect, payer: opponent(side), cost: 1, source: { kind: "dreamsign", side, index: 0 }, affects: [id] });
    for (const raw of [registered, JSON.parse(JSON.stringify(registered)) as EngineEvent]) {
      const owner = eventSeenBy(raw, side, done.state), blind = eventSeenBy(raw, opponent(side), done.state);
      expect(owner).toEqual({ kind: "payableEffectRegistered", effect: effect.id, payer: effect.payer, cost: 1, source: effect.source, affects: [id] });
      expect(blind).toEqual({ kind: "payableEffectRegistered", effect: effect.id, payer: effect.payer, cost: 1, source: effect.source, affects: [] });
      expect(JSON.stringify(blind)).not.toContain(`"${id}"`);
    }
    const blindLog = logged(w.engine, done.events, opponent(side), done.state, w.state).find(entry => entry.event.kind === "payableEffectRegistered");
    expect(blindLog?.event).toEqual(eventSeenBy(registered, opponent(side), done.state));
    expect(blindLog?.cards[id]).toBeUndefined();
    expect(eventSeenBy(gains(done.events)[0], opponent(side), done.state)).toBeNull();
    expect(projected(done.events, opponent(side), done.state).filter(event => event.kind !== "revealed").some(event => JSON.stringify(event).includes(`"${id}"`))).toBe(false);
    expect(announcements(logged(w.engine, done.events, opponent(side), done.state, w.state).map(entry => entry.event)).map(event => event.kind)).toEqual(["payableEffectRegistered"]);
    expect(announcements(projected(done.events, side, done.state)).map(event => event.kind)).toEqual(["payableEffectRegistered", "effectStarted", "sparkGained"]);
    expect(done.state.floating[0]).not.toHaveProperty("sparkSeenBy");
    const loaded = deserializeState(serializeState(done.state));
    expect(stateHash(loaded)).toBe(stateHash(done.state));
    const ready = passUntil(w.engine, loaded, at(w.engine, opponent(side), "day")).state;
    const energyBefore = ready.sides[opponent(side)].currentEnergy;
    const paid = w.engine.apply(ready, opponent(side), { kind: "payToEnd", effect: effect.id }, NO_PROMPTS);
    expect(paid.state.sides[opponent(side)].currentEnergy).toBe(energyBefore - 1);
    expect(paid.state.payable).toEqual([]);
    expect(paid.state.floating).toEqual([]);
    expect(effectiveSpark(paid.state, w.engine.catalog, id)).toBe(2);
    expect(paid.events).toContainEqual({ kind: "payableEffectEnded", effect: effect.id, payer: opponent(side), paid: true });
  });

  it.each(SIDES.flatMap(side => ["shuffle", "cease"].map(departure => ({ side, departure }))))("keeps public ordinary/additional gains after $departure for $side", ({ side, departure }) => {
    const leave = departure === "shuffle" ? p.sequence(p.putInDeck([triggeringCard()], "top"), p.shuffleInto()) : p.returnToHand(all(characterYouControl()));
    const w = world(side, whenGainsSpark(), p.sequence(p.gainAdditionalSpark(triggeringCard(), 1), leave), { hand: [CREATE.id, PUMP.id], back: departure === "shuffle" ? [SUBJECT.id] : [] });
    const created = departure === "shuffle" ? w.state : cast(w.engine, w.state, side, w.ids[side].hand[0]).state;
    const id = departure === "shuffle" ? w.ids[side].back[0]! : created.sides[side].hand.find(id => created.instances[id].status.created)!;
    const played = departure === "shuffle" ? created : cast(w.engine, created, side, id).state;
    const done = cast(w.engine, played, side, w.ids[side].hand[1]);
    expect(departure === "cease" ? done.state.instances[id] : done.state.instances[id]?.zone).toBe(departure === "cease" ? undefined : "deck");
    expect(gains(done.events).map(event => [event.instance, event.amount, event.additional])).toEqual([[id, 2, false], [id, 1, true]]);
    for (const viewer of SIDES) {
      expect(gains(done.events).map(event => eventSeenBy(event, viewer, done.state))).toEqual(gains(done.events));
      expect(logged(w.engine, JSON.parse(JSON.stringify(done.events)) as EngineEvent[], viewer, done.state, played)
        .filter(entry => entry.event.kind === "sparkGained").map(entry => entry.event)).toEqual(gains(done.events));
    }
  });

  it.each(SIDES)("retains public payable subjects after a later shuffle for %s", side => {
    const w = world(side, whenDraw(), p.sequence(p.reveal(), gain(2, { duration: "untilOpponentPays", cost: 1 }), p.shuffleInto([everyIn("hand")])), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] });
    const id = w.ids[side].deck[0], done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    const registered = done.events.find(event => event.kind === "payableEffectRegistered");
    if (registered?.kind !== "payableEffectRegistered") throw new Error("Missing payable registration");
    expect(done.state.payable[0].affects).toEqual([id]);
    for (const viewer of SIDES) {
      expect(w.engine.view(done.state, viewer).instances[id]).toBeUndefined();
      expect(eventSeenBy(registered, viewer, done.state)).toEqual(registered);
      expect(announcements(projected(done.events, viewer, done.state))).toEqual(announcements(done.events));
      expect(logged(w.engine, done.events, viewer, done.state, w.state).find(entry => entry.event.kind === "payableEffectRegistered")?.event).toEqual(registered);
    }
  });

  it.each(SIDES)("ends a paid-duration effect unpaid when its created subject ceases for %s", side => {
    const w = world(side, whenGainsSpark(), p.sequence(gain(2, { duration: "untilOpponentPays", cost: 1 }), p.returnToHand(all(characterYouControl()))), { hand: [CREATE.id, PUMP.id] });
    const created = cast(w.engine, w.state, side, w.ids[side].hand[0]).state;
    const id = created.sides[side].hand.find(id => created.instances[id].status.created)!;
    const played = cast(w.engine, created, side, id).state;
    const done = cast(w.engine, played, side, w.ids[side].hand[1]);
    expect(done.state.instances[id]).toBeUndefined();
    expect(done.state.payable).toEqual([]);
    expect(done.state.floating).toEqual([]);
    const registered = done.events.find(event => event.kind === "payableEffectRegistered");
    if (registered?.kind !== "payableEffectRegistered") throw new Error("Missing payable registration");
    expect(registered.affects).toEqual([id]);
    expect(done.events).toContainEqual({ kind: "payableEffectEnded", effect: registered.effect, payer: opponent(side), paid: false });
    for (const viewer of SIDES) {
      expect(eventSeenBy(registered, viewer, done.state)).toEqual(registered);
      expect(announcements(projected(done.events, viewer, done.state))).toEqual(announcements(done.events));
      expect(announcements(logged(w.engine, done.events, viewer, done.state, played).map(entry => entry.event))).toEqual(announcements(done.events));
    }
  });

  it.each(SIDES)("recomputes observations after prompt restart and rejects wrong/stale answers for %s", side => {
    const w = world(side, whenDraw(), p.sequence(gain(2, { duration: "untilOpponentPays", cost: 1 }), p.optional(p.reveal())), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const opening = applied(fold.reduce(slice(w.state), { kind: "battleAction", side, action: { kind: "play", card: w.ids[side].hand[0], from: "hand" } }));
    const opened = opening.slice;
    const pending = fold.pending(opened);
    if (pending === null) throw new Error("Missing optional prompt");
    const transport = JSON.parse(JSON.stringify({ slice: opened, publishedPrefix: opening.published })) as { slice: BattleSlice; publishedPrefix: EngineEvent[] };
    const parsed = parseJourneyBattleFoldState(saved(transport.slice));
    if (parsed === null) throw new Error("Saved suspended gain rejected");
    const loaded = parsed.engine.slice;
    expect(announcements(opening.published).map(event => event.kind)).toEqual(["payableEffectRegistered", "effectStarted", "sparkGained"]);
    expect(transport.publishedPrefix).toEqual(opening.published);
    expect(projected(transport.publishedPrefix, opponent(side), pending.display).some(event => JSON.stringify(event).includes(`"${w.ids[side].deck[0]}"`))).toBe(false);
    const restarted = createFoldAdapter(w.engine, { checkEventPrefix: true });
    expect(restarted.reduce(loaded, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const answer = { kind: "answer", side, promptId: pending.prompt.id, value: true } as const;
    const direct = applied(fold.reduce(opened, answer)), fresh = applied(restarted.reduce(loaded, answer));
    expect(fresh.published).toEqual(direct.published);
    expect(restarted.pending(loaded)?.display).toEqual(pending.display);
    expect(stateHash(fresh.slice.committed)).toBe(stateHash(direct.slice.committed));
    expect(fresh.slice.publishedEvents).toBe(direct.slice.publishedEvents);
    for (const viewer of SIDES) {
      const project = (outcome: typeof direct) => [...transport.publishedPrefix, ...outcome.published].map(event => eventSeenBy(event, viewer, outcome.slice.committed));
      expect(project(fresh)).toEqual(project(direct));
    }
    expect(restarted.reduce(fresh.slice, answer).kind).toBe("bounced");
  });
});
