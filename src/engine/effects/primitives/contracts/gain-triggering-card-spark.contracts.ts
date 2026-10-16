import { describe, expect, it } from "vitest";
import { parseBattleId, parseDreamsignId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import type { Engine, ApplyResult } from "../../../engine";
import type { EngineCardDefinition, EngineDreamsignDefinition, EngineFigmentDefinition } from "../../../catalog";
import { instanceOrigin } from "../../../rules/activation";
import { all, characterYouControl, count, energy, event, everyIn } from "../../../dsl/builders";
import { triggered, triggeringCard, whenDraw, whenMaterialize, whenReturn, whenYouPlay } from "../../../dsl/triggers";
import { NO_DECK_MODS, type Duration, type Trigger, type ValueExpr } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { effectiveSpark } from "../../../rules/spark";
import { serializeState, deserializeState, stateHash } from "../../../state/hash";
import { SIDES, opponent, parseFigmentId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import type { Step } from "../../../steps/kinds";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { resolveEffect } from "../../interpreter";
import type { ResolvingEffect } from "../../registry";
import * as p from "../index";

const SUBJECT = { ...v.vanilla2, id: syntheticId(0x611001), costs: [energy(0)] };
const DRAW = { ...v.event0, id: syntheticId(0x611002), abilities: () => [event(p.draw(1))] };
const RETURN = { ...v.event0, id: syntheticId(0x611003), abilities: () => [event(p.returnToHand(all(characterYouControl())))] };
const DECK = { ...v.event0, id: syntheticId(0x611004), abilities: () => [event(p.putInDeck([everyIn("hand", { cardType: "character" })], "top"))] };
const DISSOLVE = { ...v.event0, id: syntheticId(0x611005), abilities: () => [event(p.dissolve(all(characterYouControl())))] };
const REVIVE = { ...v.event0, id: syntheticId(0x611006), abilities: () => [event(p.returnFromVoid(everyIn("void", { cardType: "character" })))] };
const BANISH = { ...v.event0, id: syntheticId(0x611007), abilities: () => [event(p.banishCards([everyIn("void", { cardType: "character" })]))] };
const CREATE = { ...v.event0, id: syntheticId(0x611009), abilities: () => [event(p.createCard(SUBJECT.id))] };
const sourceCard: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x61100a), costs: [energy(0)] };
const signId = parseDreamsignId("00000000-0000-0000-0000-000000611001");
function world(side: Side, trigger: Trigger, effect: ResolvingEffect, setup: SideSetup, extra: readonly EngineCardDefinition[] = [], cardSource = false, figments: readonly EngineFigmentDefinition[] = []) {
  const watcher: EngineDreamsignDefinition = { id: signId, status: "authored", abilities: () => [triggered(trigger, effect)] };
  const producer = { ...sourceCard, abilities: watcher.abilities };
  const engine = createEngine(testCatalog([SUBJECT, DRAW, RETURN, DECK, DISSOLVE, REVIVE, BANISH, CREATE, producer, ...extra], { dreamsigns: [watcher] }, figments));
  const initial = boardState(engine.catalog, { active: side, phase: "day", [side]: {
    energy: 8, deck: [v.vanilla5.id, v.vanilla5.id, v.vanilla5.id],
    ...(cardSource ? { back: [producer.id] } : { dreamsigns: [signId] }), ...setup,
  }, [opponent(side)]: { energy: 8, deck: [v.vanilla5.id, v.vanilla5.id, v.vanilla5.id] } });
  return { engine, ...initial };
}
function step(engine: Engine, state: BattleState, action: Step) {
  const result = runStep(state, action, NO_PROMPTS, engine.catalog);
  if (result.kind !== "done") throw new Error(`Unexpected ${result.prompt.kind}`);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}
function cast(engine: Engine, state: BattleState, side: Side, card: InstanceId): ApplyResult {
  const first = engine.apply(state, side, { kind: "play", card, from: "hand" }, NO_PROMPTS);
  const rest = passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
  return { ...first, state: rest.state, events: [...first.events, ...rest.events] };
}
const gain = (amount: ValueExpr = 2, duration: Duration = "permanent") => p.gainTriggeringCardSpark(triggeringCard(), amount, duration);
const gains = (events: readonly EngineEvent[]) => events.filter(event => event.kind === "sparkGained");
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function saved(slice: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("battle-spark"), siteId: parseSiteId("site-spark"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-spark"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
    avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } };
}

describe("physical triggering-card spark", () => {
  it.each(SIDES)("gains on the actual stack subject, independently of the emblem and battlefield for %s", side => {
    const w = world(side, whenYouPlay({ cardType: "character" }), gain(count(characterYouControl())), { hand: [SUBJECT.id], back: [SUBJECT.id, SUBJECT.id] });
    const id = w.ids[side].hand[0], siblings = w.ids[side].back;
    const played = step(w.engine, w.state, { kind: "play", card: id, from: "hand" });
    expect(played.state.instances[id].zone).toBe("stack");
    const pumped = step(w.engine, played.state, { kind: "resolveTrigger" });
    expect(effectiveSpark(pumped.state, w.engine.catalog, id)).toBe(4);
    expect(gains(pumped.events)).toEqual([{ kind: "sparkGained", instance: id, amount: 2, expiry: { at: "never" }, additional: false }]);
    for (const sibling of siblings) expect(effectiveSpark(pumped.state, w.engine.catalog, sibling!)).toBe(2);
    for (const viewer of SIDES) expect(eventSeenBy(gains(pumped.events)[0], viewer, pumped.state)).toEqual(gains(pumped.events)[0]);
    const landed = step(w.engine, pumped.state, { kind: "resolveTop" }).state;
    expect(landed.instances[id].zone).toBe("play");
    expect(effectiveSpark(landed, w.engine.catalog, id)).toBe(4);
  });

  it.each(SIDES)("draws into a hidden hand with observer-safe gain details for %s", side => {
    const w = world(side, whenDraw(), gain(), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] });
    const id = w.ids[side].deck[0], done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(done.state.instances[id].zone).toBe("hand");
    expect(effectiveSpark(done.state, w.engine.catalog, id)).toBe(4);
    expect(gains(done.events)).toHaveLength(1);
    expect(eventSeenBy(gains(done.events)[0], side, done.state)).toEqual(gains(done.events)[0]);
    expect(eventSeenBy(gains(done.events)[0], opponent(side), done.state)).toBeNull();
    expect(w.engine.view(done.state, side).instances[id].status.gainedSpark).toBe(2);
    expect(w.engine.view(done.state, opponent(side)).instances[id]).toBeUndefined();
  });

  it.each(SIDES)("retains permanent gain through hand, deck, play, void and banishment for %s", side => {
    const w = world(side, whenReturn(), gain(), { back: [SUBJECT.id], hand: [RETURN.id, DECK.id, DRAW.id, DISSOLVE.id, REVIVE.id, DISSOLVE.id, BANISH.id] });
    const id = w.ids[side].back[0]!, [bounce, put, draw, dissolve, revive, dissolveAgain, banish] = w.ids[side].hand;
    let state = cast(w.engine, w.state, side, bounce).state;
    expect(state.instances[id].zone).toBe("hand");
    expect(effectiveSpark(state, w.engine.catalog, id)).toBe(4);
    for (const viewer of SIDES) expect(eventSeenBy({ kind: "sparkGained", instance: id, amount: 2, expiry: { at: "never" }, additional: false }, viewer, state)).not.toBeNull();
    state = cast(w.engine, state, side, put).state;
    expect(state.instances[id].zone).toBe("deck");
    expect(effectiveSpark(state, w.engine.catalog, id)).toBe(4);
    state = cast(w.engine, state, side, draw).state;
    state = cast(w.engine, state, side, id).state;
    expect(state.instances[id].zone).toBe("play");
    state = cast(w.engine, state, side, dissolveAgain).state;
    expect(state.instances[id].zone).toBe("void");
    expect(effectiveSpark(state, w.engine.catalog, id)).toBe(4);
    state = cast(w.engine, state, side, revive).state;
    state = cast(w.engine, state, side, id).state;
    state = cast(w.engine, state, side, dissolve).state;
    state = cast(w.engine, state, side, banish).state;
    expect(state.instances[id].zone).toBe("banished");
    expect(effectiveSpark(state, w.engine.catalog, id)).toBe(4);
  });

  it.each(SIDES)("distinguishes revealed hands from a concealed deck for every observer for %s", side => {
    for (const hidden of [false, true]) {
      const body = hidden ? p.sequence(p.shuffleInto([everyIn("hand")]), gain()) : p.sequence(p.reveal("you"), gain());
      const w = world(side, whenReturn(), body, { back: [SUBJECT.id], hand: [RETURN.id] });
      const id = w.ids[side].back[0]!, done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
      expect(done.state.instances[id].zone).toBe(hidden ? "deck" : "hand");
      expect(effectiveSpark(done.state, w.engine.catalog, id)).toBe(4);
      const emitted = gains(done.events)[0];
      for (const viewer of SIDES) {
        expect(eventSeenBy(emitted, viewer, done.state)).toEqual(hidden ? null : emitted);
        if (hidden) expect(w.engine.view(done.state, viewer).instances[id]).toBeUndefined();
      }
      const loaded = deserializeState(serializeState(done.state));
      expect(stateHash(loaded)).toBe(stateHash(done.state));
      expect(w.engine.legalActions(loaded, side)).toEqual(w.engine.legalActions(done.state, side));
      for (const viewer of SIDES) expect(w.engine.view(loaded, viewer)).toEqual(w.engine.view(done.state, viewer));
    }
  });

  it.each(SIDES.flatMap(side => ["untilEndOfTurn", "untilYourNextTurn", "untilNextDay"] .map(duration => ({ side, duration: duration as Duration }))))("expires $duration outside play for $side", ({ side, duration }) => {
    const w = world(side, whenDraw(), gain(2, duration), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id, v.vanilla5.id] });
    const id = w.ids[side].deck[0], pumped = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(effectiveSpark(pumped.state, w.engine.catalog, id)).toBe(4);
    expect(pumped.state.floating).toHaveLength(1);
    const target = duration === "untilYourNextTurn" ? side : opponent(side);
    const ended = passUntil(w.engine, pumped.state, next => next.turn.turnNumber > pumped.state.turn.turnNumber && at(w.engine, target, "day")(next)).state;
    expect(ended.instances[id].zone).toBe("hand");
    expect(effectiveSpark(ended, w.engine.catalog, id)).toBe(2);
    expect(ended.floating.filter(effect => effect.change.kind === "spark" && effect.change.instance === id)).toEqual([]);
    const loaded = deserializeState(serializeState(pumped.state));
    expect(stateHash(loaded)).toBe(stateHash(pumped.state));
    expect(effectiveSpark(loaded, w.engine.catalog, id)).toBe(4);
    expect(w.engine.view(loaded, opponent(side)).floating).toEqual([]);
    expect(parseJourneyBattleFoldState(saved(sliceOf(loaded)))).not.toBeNull();
  });

  it.each(SIDES)("expires a hand gain with its distinct source or public payment for %s", side => {
    for (const duration of ["whileSourceInPlay", { duration: "untilOpponentPays", cost: 1 }] as const) {
      const w = world(side, whenDraw(), gain(2, duration), { hand: [DRAW.id, RETURN.id], deck: [SUBJECT.id, v.vanilla5.id] }, [], true);
      const id = w.ids[side].deck[0], pumped = cast(w.engine, w.state, side, w.ids[side].hand[0]);
      expect(effectiveSpark(pumped.state, w.engine.catalog, id)).toBe(4);
      let ended: BattleState;
      if (duration === "whileSourceInPlay") ended = cast(w.engine, pumped.state, side, w.ids[side].hand[1]).state;
      else {
        const ready = passUntil(w.engine, pumped.state, at(w.engine, opponent(side), "day")).state;
        ended = w.engine.apply(ready, opponent(side), { kind: "payToEnd", effect: ready.payable[0].id }, NO_PROMPTS).state;
      }
      expect(ended.instances[id].zone).toBe("hand");
      expect(effectiveSpark(ended, w.engine.catalog, id)).toBe(2);
      expect(ended.floating).toEqual([]);
    }
    const w = world(side, whenDraw(), p.sequence(p.returnToHand(all(characterYouControl())), gain(2, "whileSourceInPlay")), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] }, [], true);
    const absentSource = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(absentSource.state.instances[w.ids[side].back[0]!].zone).toBe("hand");
    expect(gains(absentSource.events)).toEqual([]);
  });

  it.each(SIDES)("expires a temporary gain after the subject moves into its deck for %s", side => {
    const w = world(side, whenDraw(), p.sequence(gain(2, "untilEndOfTurn"), p.putInDeck([triggeringCard()], "top")), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] });
    const id = w.ids[side].deck[0], pumped = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    expect(pumped.state.instances[id].zone).toBe("deck");
    expect(effectiveSpark(pumped.state, w.engine.catalog, id)).toBe(4);
    const ended = passUntil(w.engine, pumped.state, at(w.engine, opponent(side), "day")).state;
    expect(ended.instances[id].zone).toBe("deck");
    expect(effectiveSpark(ended, w.engine.catalog, id)).toBe(2);
    expect(ended.floating.filter(effect => effect.change.kind === "spark" && effect.change.instance === id)).toEqual([]);
  });

  it.each(SIDES.flatMap(side => [false, true].flatMap(amplified => ["character", "event"] .map(cardType => ({ side, amplified, cardType: cardType as "character" | "event" })))))("uses the current physical definition for $side/$cardType/amplified=$amplified", ({ side, amplified, cardType }) => {
    const original = cardType === "character" ? v.event0 : SUBJECT;
    const w = world(side, whenYouPlay(), gain(), { hand: [{ cardId: original.id, amplified, deckMods: { ...NO_DECK_MODS, sparkBonus: 3, typeChange: { cardType, subtype: cardType === "character" ? "Warrior" : "" } } }] });
    const id = w.ids[side].hand[0], done = cast(w.engine, w.state, side, id);
    expect(done.state.instances[id].variant.amplified).toBe(amplified);
    expect(done.state.instances[id].status.gainedSpark).toBe(cardType === "character" ? 2 : 0);
    expect(gains(done.events)).toHaveLength(cardType === "character" ? 1 : 0);
  });

  it.each(SIDES)("skips a ceased physical subject and live figment copy for %s", side => {
    const w = world(side, whenReturn(), gain(), { hand: [CREATE.id, RETURN.id] });
    const created = cast(w.engine, w.state, side, w.ids[side].hand[0]).state;
    const id = created.sides[side].hand.find(id => created.instances[id].status.created)!;
    const played = cast(w.engine, created, side, id).state;
    const returned = cast(w.engine, played, side, w.ids[side].hand[1]);
    expect(returned.state.instances[id]).toBeUndefined();
    expect(gains(returned.events)).toEqual([]);
    for (const copied of [false, true]) {
      const figment: EngineFigmentDefinition = { id: parseFigmentId("00000000-0000-0000-0000-000000611002"), subtype: "Warrior", spark: 2, status: "authored", abilities: () => [] };
      const maker = { ...v.event0, id: syntheticId(0x61100d), abilities: () => [event(copied ? p.materializeFigmentCopy(everyIn("void", { cardType: "character" })) : p.materializeFigments(figment.id))] };
      const copy = world(side, whenMaterialize(), gain(), { hand: [maker.id], void: [SUBJECT.id] }, [maker], false, [figment]);
      const done = cast(copy.engine, copy.state, side, copy.ids[side].hand[0]);
      expect(gains(done.events)).toEqual([]);
      const copies = Object.values(done.state.instances).filter(instance => instance.printing.kind === (copied ? "figmentCopy" : "figment"));
      expect(copies).toHaveLength(1);
      expect(copies[0].status.gainedSpark).toBe(0);
    }
    const absent = { ...v.event0, id: syntheticId(0x61100b), abilities: () => [event(gain())] };
    const noSubject = world(side, whenYouPlay(), gain(), { hand: [absent.id] }, [absent]);
    expect(gains(cast(noSubject.engine, noSubject.state, side, noSubject.ids[side].hand[0]).events)).toEqual([]);
  });

  it.each(SIDES.flatMap(side => [false, true].map(amplified => ({ side, amplified }))))("adds to modified spark for $side/amplified=$amplified", ({ side, amplified }) => {
    const w = world(side, whenYouPlay(), gain(), { hand: [{ cardId: SUBJECT.id, amplified, deckMods: { ...NO_DECK_MODS, sparkBonus: 3 } }] });
    const id = w.ids[side].hand[0], done = cast(w.engine, w.state, side, id);
    expect(effectiveSpark(done.state, w.engine.catalog, id)).toBe(7);
  });

  it.each(SIDES)("keeps the old gainSpark stack/hand restriction and non-gain amounts for %s", side => {
    for (const trigger of [whenYouPlay({ cardType: "character" }), whenDraw()]) {
      const w = world(side, trigger, p.gainSpark(triggeringCard(), 2), { hand: [trigger.on === "draw" ? DRAW.id : SUBJECT.id], deck: [SUBJECT.id, v.vanilla5.id] });
      expect(gains(cast(w.engine, w.state, side, w.ids[side].hand[0]).events)).toEqual([]);
    }
    for (const amount of [0, -1]) {
      const w = world(side, whenYouPlay({ cardType: "character" }), gain(amount), { hand: [SUBJECT.id] });
      const done = cast(w.engine, w.state, side, w.ids[side].hand[0]);
      expect(gains(done.events).map(event => event.amount)).toEqual([amount]);
      expect(done.state.instances[w.ids[side].hand[0]].status.gainedSpark).toBe(amount);
    }
  });

  it.each(SIDES)("replays a pending optional gain, refusal and competing actor answers for %s", side => {
    const w = world(side, whenDraw(), p.optional(gain()), { hand: [DRAW.id], deck: [SUBJECT.id, v.vanilla5.id] });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "play", card: w.ids[side].hand[0], from: "hand" } }));
    const pending = fold.pending(opened);
    if (pending === null) throw new Error("Missing optional trigger prompt");
    expect(pending.prompt.cancellable).toBe(false);
    expect(fold.reduce(opened, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const loaded = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const fresh = createFoldAdapter(w.engine, { checkEventPrefix: true });
    expect(fresh.pending(loaded)?.prompt.id).toBe(pending.prompt.id);
    expect(fresh.reduce(loaded, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const value of [false, true]) {
      const answer = { kind: "answer", side, promptId: pending.prompt.id, value } as const;
      const directOutcome = fold.reduce(opened, answer), restartedOutcome = fresh.reduce(loaded, answer);
      const direct = applied(directOutcome), restarted = applied(restartedOutcome);
      if (directOutcome.kind !== "applied" || restartedOutcome.kind !== "applied") throw new Error("Expected applied optional answer");
      expect(restartedOutcome.published).toEqual(directOutcome.published);
      expect(restarted.publishedEvents).toBe(direct.publishedEvents);
      expect(stateHash(restarted.committed)).toBe(stateHash(direct.committed));
      expect(restarted.committed.instances[w.ids[side].deck[0]].status.gainedSpark).toBe(value ? 2 : 0);
      expect(fresh.reduce(restarted, answer).kind).toBe("bounced");
      expect(parseJourneyBattleFoldState(saved(restarted))).not.toBeNull();
    }
  });

  it.each(SIDES)("publishes no partial gain when a public synthetic step fails for %s", side => {
    const fail: EngineCardDefinition = { ...v.event0, id: syntheticId(0x61100c), synthetic: { resolve(ctx, item) {
      resolveEffect(ctx, gain(), { controller: item.controller, source: item.instance, origin: instanceOrigin(ctx.state.instances[item.instance]),
        subject: ctx.state.sides[item.controller].hand[0], ability: 0, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
      throw new Error("Synthetic failure after physical-card spark gain");
    } } };
    const w = world(side, whenYouPlay(), p.sequence(), { hand: [fail.id, SUBJECT.id] }, [fail]);
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const outcome = fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "play", card: w.ids[side].hand[0], from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("Expected failed resolution");
    expect(outcome.slice.committed.instances[w.ids[side].hand[1]].status.gainedSpark).toBe(0);
    expect(gains(outcome.published)).toEqual([]);
    expect(stateHash(w.state)).toBe(stateHash(deserializeState(serializeState(w.state))));
  });
});
