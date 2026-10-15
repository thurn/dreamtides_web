/** Actual committed void origin qualifies a static ordinal independently of payment route. */
import { describe, expect, it } from "vitest";
import { activated, additionalCost, alternativeCost, characterYouControl, controls, discardCostFilter, energy, event, everyIn, keyword, reclaim, self, staticAbility } from "../../../dsl/builders";
import { triggered, triggeringCard, whenYouPlay } from "../../../dsl/triggers";
import type { Ability, CardFilter } from "../../../dsl/types";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { SIDES, opponent } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { playRoutes, type PlayRoute } from "../../../rules/timing";
import { NO_PROMPTS } from "../../../steps/sources";
import { runStep } from "../../../steps/runner";
import type { AnswerSource } from "../../../steps/types";
import { at, passUntil } from "../../../testing/trigger-harness";
import { invariantViolations } from "../../../testing/invariants";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import { costModifierNth } from "../cost-modifier";
import { playFromZone } from "../play-from-zone";
import { playImmediately } from "../play-immediately";
import { copyCard } from "../copy-card";
import { gainPoints } from "../gain-points";
import { grantReclaim } from "../grant-reclaim";
import { returnToHand } from "../return-to-hand";
import { ruleModifier } from "../rule-modifier";
import { shuffleInto } from "../shuffle-into";
import { takeExtraTurn } from "../take-extra-turn";
import { revealDeckTop } from "../reveal-deck-top";
import { nthCard, nthDeck, nthFixture, nthPlay, nthSettle } from "./cost-modifier-nth-support";

const EVENT = { cardType: "event" } as const;
const character = (n: number, abilities: readonly Ability[] = []) => nthCard(500 + n, { abilities: () => abilities });
const spell = (n: number, abilities: readonly Ability[] = []) => nthCard(2000 + n, { cardType: "event", spark: null, subtype: "", abilities: () => [...abilities, event(gainPoints(0))] });
function provider(n: number, mode: "set" | "reduce" = "reduce", ordinal = 1, filter: CardFilter = EVENT, abilities: readonly Ability[] = []) {
  return character(100 + n, [staticAbility(costModifierNth("you", filter, ordinal, mode === "set" ? { set: 0 } : { reduce: 1 }, { from: "void" })),
    staticAbility(playFromZone("void", {})), ...abilities]);
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
  return result.slice;
}
function saved(slice: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("battle-origin-nth"), siteId: parseSiteId("site-origin-nth"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-origin-nth"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "origin-nth", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as BattleSlice } };
}

for (const side of SIDES) describe(`${side} origin-qualified nth`, () => {
  for (const mode of ["set", "reduce"] as const) for (const ordinal of [1, 2, 3]) it(`${mode} ${ordinal} counts only earlier matching actual void plays`, () => {
    const source = provider(1, mode, ordinal), subject = spell(1), other = character(1);
    const f = nthFixture(side, [source, subject, other], { back: [source.id], hand: [subject.id], void: [other.id, subject.id, subject.id, subject.id] });
    let state = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    expect(state.sides[side].currentEnergy).toBe(28);
    state = nthPlay(f.engine, state, side, f.ids[side].void[0], "void").state;
    for (let index = 0; index < 3; index++) {
      const id = f.ids[side].void[index + 1], before = state.sides[side].currentEnergy;
      const expected = index === ordinal - 1 ? mode === "set" ? 0 : 1 : 2;
      expect(f.engine.view(state, side).instances[id]?.characteristics.cost).toBe(expected);
      const input = stateHash(state);
      f.engine.legalActions(state, side); f.engine.view(state, side);
      expect(stateHash(state)).toBe(input);
      state = nthPlay(f.engine, state, side, id, "void").state;
      expect(before - state.sides[side].currentEnergy).toBe(expected);
    }
    expect(state.turnLog.played[side].map(record => record.playedFromVoid)).toEqual([false, true, true, true, true]);
    expect(state.turnLog.played[opponent(side)]).toEqual([]);
    expect(invariantViolations(state, f.engine.catalog)).toEqual([]);
  });

  for (const mode of ["set", "reduce"] as const) for (const route of ["permission", "plain", "printed", "granted", "alternativeCost", "eventAlternative"] as const) it(`${route} ${mode} keeps origin separate from replacement bases`, () => {
    const chosen: PlayRoute = route === "plain" || route === "printed" || route === "granted" ? "reclaim" : route;
    const own: Ability[] = route === "plain" ? [keyword("reclaim")] : route === "printed" ? [reclaim(energy(5))] : route === "alternativeCost" ? [alternativeCost(energy(4))] : [];
    const subject = { ...spell(2, own), ...(route === "eventAlternative" ? { speed: "fast" as const } : {}) }, source = provider(2, mode, 1, EVENT, route === "eventAlternative" ? [staticAbility(ruleModifier({ rule: "eventAlternative", energy: 1 }))] : []);
    const grant = spell(3, [event(grantReclaim(everyIn("void", EVENT), { costs: [energy(4)] }))]);
    const f = nthFixture(side, [source, subject, grant], { back: [source.id], void: [subject.id, subject.id], hand: route === "granted" ? [grant.id] : [] });
    let state = route === "granted" ? nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state : f.state;
    const sourceAnswer: AnswerSource = { answer(prompt) { if (prompt.purpose.role === "voidRoute" || prompt.purpose.role === "playRoute") return playRoutes(state, f.engine.catalog, f.ids[side].void[0], "void").indexOf(chosen); throw new Error(`Unexpected ${prompt.purpose.role}`); } };
    const before = state.sides[side].currentEnergy;
    state = nthPlay(f.engine, state, side, f.ids[side].void[0], "void", sourceAnswer).state;
    const base = route === "printed" ? 5 : route === "granted" || route === "alternativeCost" ? 4 : route === "eventAlternative" ? 1 : 2;
    const replacement = route === "printed" || route === "granted" || route === "alternativeCost" || route === "eventAlternative";
    expect(before - state.sides[side].currentEnergy).toBe(mode === "reduce" ? base - 1 : replacement ? base : 0);
    expect(state.turnLog.played[side][state.turnLog.played[side].length - 1]).toMatchObject({ instance: f.ids[side].void[0], playedFromVoid: true });
    expect(f.engine.view(state, side).instances[f.ids[side].void[1]]?.characteristics.cost).toBe(2);
  });

  it("a known deck-top permission remains non-void in previews and committed history", () => {
    const subject = spell(4), source = provider(4, "set", 1, EVENT, [staticAbility(playFromZone("deck", EVENT)), staticAbility(revealDeckTop())]);
    const f = nthFixture(side, [subject, source], { back: [source.id], deck: [subject.id], void: [subject.id] });
    expect(f.engine.view(f.state, side).instances[f.ids[side].deck[0]]?.characteristics.cost).toBe(2);
    const played = nthPlay(f.engine, f.state, side, f.ids[side].deck[0], "deck").state;
    expect(played.turnLog.played[side][0].playedFromVoid).toBe(false);
    expect(nthPlay(f.engine, played, side, f.ids[side].void[0], "void").state.sides[side].currentEnergy).toBe(28);
  });

  it("immediate character play captures the void before the same shared commit transition", () => {
    const subject = character(5), source = provider(5, "reduce", 1, { cardType: "character" }, [activated([], playImmediately("void"))]);
    const f = nthFixture(side, [subject, source], { back: [source.id], void: [subject.id, subject.id] });
    const first = nthSettle(f.engine, f.engine.apply(f.state, side, { kind: "activate", source: f.ids[side].back[0]!, ability: 2 }, { answer: () => [f.ids[side].void[0]] }).state);
    expect(first.sides[side].currentEnergy).toBe(29);
    expect(first.turnLog.played[side]).toEqual([expect.objectContaining({ instance: f.ids[side].void[0], playedFromVoid: true })]);
    expect(nthPlay(f.engine, first, side, f.ids[side].void[1], "void").state.sides[side].currentEnergy).toBe(27);
  });

  it("prior void history survives a false condition and later source entry", () => {
    const subject = character(6), permission = character(7, [staticAbility(playFromZone("void", {}))]);
    const source = character(8, [staticAbility(costModifierNth("you", { cardType: "character" }, 1, { reduce: 1 }, { from: "void" }), { while: controls(characterYouControl(), 3) })]);
    const f = nthFixture(side, [subject, permission, source], { back: [permission.id], hand: [source.id], void: [subject.id, subject.id] });
    let state = nthPlay(f.engine, f.state, side, f.ids[side].void[0], "void").state;
    state = nthPlay(f.engine, state, side, f.ids[side].hand[0]).state;
    expect(nthPlay(f.engine, state, side, f.ids[side].void[1], "void").state.sides[side].currentEnergy).toBe(24);
  });

  it("repeated physical plays retain separate origins while copies add no ordinal", () => {
    const subject = spell(5), body = character(9, [activated([], returnToHand(self()))]);
    const source = provider(6, "reduce", 2, {}, [triggered(whenYouPlay(EVENT), copyCard(triggeringCard()))]);
    const f = nthFixture(side, [subject, body, source], { back: [source.id], void: [body.id, subject.id] });
    let state = nthPlay(f.engine, f.state, side, f.ids[side].void[0], "void").state;
    state = nthSettle(f.engine, f.engine.apply(state, side, { kind: "activate", source: f.ids[side].void[0], ability: 0 }, NO_PROMPTS).state);
    state = nthPlay(f.engine, state, side, f.ids[side].void[0]).state;
    const before = state.sides[side].currentEnergy, nextInstance = state.nextInstance;
    const played = nthPlay(f.engine, state, side, f.ids[side].void[1], "void");
    expect(played.state.nextInstance).toBeGreaterThan(nextInstance);
    expect(before - played.state.sides[side].currentEnergy).toBe(1);
    expect(played.state.turnLog.played[side].map(record => record.playedFromVoid)).toEqual([true, false, true]);
    expect(played.state.turnLog.played[side].map(record => record.instance)).toEqual([f.ids[side].void[0], f.ids[side].void[0], f.ids[side].void[1]]);
  });

  it("public clone, save and anonymous determinization preserve captured origin after a shuffle", () => {
    const subject = spell(6), source = provider(7, "set", 1, EVENT, [activated([], shuffleInto([everyIn("void", EVENT)]))]);
    const f = nthFixture(side, [subject, source], { back: [source.id], void: [subject.id], hand: [subject.id] });
    const first = nthPlay(f.engine, f.state, side, f.ids[side].void[0], "void").state;
    const state = nthSettle(f.engine, f.engine.apply(first, side, { kind: "activate", source: f.ids[side].back[0]!, ability: 2 }, NO_PROMPTS).state);
    expect(cloneState(state).turnLog).toEqual(state.turnLog);
    expect(stateHash(deserializeState(serializeState(state)))).toBe(stateHash(state));
    expect(parseJourneyBattleFoldState(saved(sliceOf(state)))).not.toBeNull();
    const decks = { [side]: [...nthDeck, source.id, subject.id, subject.id].map(cardId => ({ cardId })), [opponent(side)]: nthDeck.map(cardId => ({ cardId })) };
    for (const viewer of SIDES) {
      const view = f.engine.view(state, viewer);
      expect(view.turnLog.played[side][0]).toMatchObject({ instance: null, playedFromVoid: true });
      const sampled = f.engine.determinize(view, { player: decks.player, enemy: decks.enemy }, () => 0.5);
      expect(f.engine.view(sampled, viewer).turnLog).toEqual(view.turnLog);
      expect(sampled.turnLog.played[side][0].playedFromVoid).toBe(true);
      expect(parseJourneyBattleFoldState(saved(sliceOf(sampled)))).not.toBeNull();
    }
  });

  for (const filter of [EVENT, {}]) it("missing legacy origin withholds only the new modifier, never guesses from current void", () => {
    const subject = spell(7), source = provider(8, "reduce", 1, filter);
    const f = nthFixture(side, [source, subject], { back: [source.id], hand: [subject.id], void: [subject.id] });
    const first = nthPlay(f.engine, f.state, side, f.ids[side].hand[0]).state;
    const legacy = deserializeState(serializeState(first));
    const record = legacy.turnLog.played[side][0];
    delete (record as { playedFromVoid?: boolean }).playedFromVoid;
    expect(legacy.instances[record.instance].zone).toBe("void");
    expect(parseJourneyBattleFoldState(saved(sliceOf(legacy)))).not.toBeNull();
    expect(nthPlay(f.engine, legacy, side, f.ids[side].void[0], "void").state.sides[side].currentEnergy).toBe(26);
    const known = nthPlay(f.engine, first, side, f.ids[side].void[0], "void").state;
    expect(known.sides[side].currentEnergy).toBe(27);
    const old = character(200, [staticAbility(costModifierNth("you", EVENT, 2, { set: 0 })), staticAbility(playFromZone("void", EVENT))]);
    const control = nthFixture(side, [old, subject], { back: [old.id], hand: [subject.id], void: [subject.id] });
    const ordinary = deserializeState(serializeState(nthPlay(control.engine, control.state, side, control.ids[side].hand[0]).state));
    delete (ordinary.turnLog.played[side][0] as { playedFromVoid?: boolean }).playedFromVoid;
    expect(nthPlay(control.engine, ordinary, side, control.ids[side].void[0], "void").state.sides[side].currentEnergy).toBe(28);
  });

  it("cancel, illegal/stale/foreign/concurrent answers and reload commit exactly one true record", () => {
    const source = provider(9, "set"), subject = spell(8, [additionalCost(discardCostFilter({ cardType: "character" }))]), fodder = character(10);
    const f = nthFixture(side, [source, subject, fodder], { back: [source.id], hand: [fodder.id, fodder.id], void: [subject.id, subject.id], energy: 0 });
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const intent = { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].void[0], from: "void" } } as const;
    const opened = applied(fold.reduce(sliceOf(f.state), intent)), pending = fold.pending(opened)!;
    expect(opened.committed.turnLog.played[side]).toEqual([]);
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(f.state));
    const reopened = applied(fold.reduce(cancelled, intent));
    expect(fold.reduce(reopened, { kind: "answer", side, promptId: pending.prompt.id, value: [f.ids[side].hand[0]] }).kind).toBe("bounced");
    const loaded = parseJourneyBattleFoldState(saved(reopened))!.engine.slice;
    const fresh = createFoldAdapter(f.engine, { checkEventPrefix: true }), current = fresh.pending(loaded)!;
    expect(fresh.reduce(loaded, { kind: "answer", side: opponent(side), promptId: current.prompt.id, value: [f.ids[side].hand[0]] }).kind).toBe("bounced");
    expect(fresh.reduce(loaded, { kind: "answer", side, promptId: current.prompt.id, value: [] }).kind).toBe("bounced");
    const answer = { kind: "answer", side, promptId: current.prompt.id, value: [f.ids[side].hand[0]] } as const;
    const paid = applied(fresh.reduce(loaded, answer));
    expect(paid.committed.turnLog.played[side]).toEqual([expect.objectContaining({ instance: f.ids[side].void[0], playedFromVoid: true })]);
    expect(fresh.reduce(paid, answer).kind).toBe("bounced");
    expect(stateHash(applied(fold.reduce(reopened, answer)).committed)).toBe(stateHash(paid.committed));
    expect(serializeState(loaded.committed)).toBe(serializeState(parseJourneyBattleFoldState(saved(reopened))!.engine.slice.committed));
  });

  it("an unaffordable attempted void play preserves input and its unconsumed ordinal", () => {
    const subject = spell(20, [additionalCost(energy(2))]), source = provider(20, "set");
    const f = nthFixture(side, [subject, source], { back: [source.id], void: [subject.id], energy: 1 });
    const action = { kind: "play", card: f.ids[side].void[0], from: "void" } as const;
    const before = serializeState(f.state);
    expect(f.engine.legalActions(f.state, side)).not.toContainEqual(action);
    expect(() => f.engine.apply(f.state, side, action, NO_PROMPTS)).toThrow();
    expect(serializeState(f.state)).toBe(before);
    expect(f.state.turnLog.played[side]).toEqual([]);
  });

  it("save guard validates provenance scalars and only the latest matching physical stack record", () => {
    const subject = spell(9), source = provider(10);
    const f = nthFixture(side, [subject, source], { back: [source.id], hand: [subject.id], void: [subject.id] });
    const committed = runStep(f.state, { kind: "play", card: f.ids[side].void[0], from: "void" }, NO_PROMPTS, f.engine.catalog);
    if (committed.kind !== "done") throw new Error("Expected a completed play boundary");
    const first = committed.state;
    expect(first.stack).toEqual([expect.objectContaining({ kind: "card", playedFromVoid: true })]);
    const baseline = saved(sliceOf(first));
    expect(parseJourneyBattleFoldState(baseline)).not.toBeNull();
    const record = baseline.engine.slice.committed.turnLog.played[side][0];
    expect(record.playedFromVoid).toBe(true);
    for (const value of [null, 0, "void", false]) {
      const bad = saved(sliceOf(first));
      Object.assign(bad.engine.slice.committed.turnLog.played[side][0], { playedFromVoid: value });
      expect(parseJourneyBattleFoldState(bad)).toBeNull();
    }
    const historical = saved(sliceOf(nthPlay(f.engine, f.state, side, f.ids[side].void[0], "void").state));
    Object.assign(historical.engine.slice.committed.turnLog.played[side][0], { playedFromVoid: null });
    expect(parseJourneyBattleFoldState(historical)).toBeNull();
    const legacy = saved(sliceOf(first));
    delete (legacy.engine.slice.committed.turnLog.played[side][0] as { playedFromVoid?: boolean }).playedFromVoid;
    expect(parseJourneyBattleFoldState(legacy)).not.toBeNull();
    const repeats = saved(sliceOf(first));
    repeats.engine.slice.committed.turnLog.played[side].unshift({ ...record, playedFromVoid: false });
    expect(parseJourneyBattleFoldState(repeats)).not.toBeNull();
    const floating = saved(sliceOf(f.state));
    floating.engine.slice.committed.nextEffect = 2;
    floating.engine.slice.committed.floating.push({ id: "e1", controller: side, source: f.ids[side].back[0]!, timestamp: 0, expiry: { at: "never" }, change: { kind: "cost", player: side, filter: {}, amount: -1, next: false } });
    expect(parseJourneyBattleFoldState(floating)).not.toBeNull();
    Object.assign(floating.engine.slice.committed.floating[0].change, { from: "void" });
    expect(parseJourneyBattleFoldState(floating)).toBeNull();
  });

  it("ordinary and extra turns reset the void cohort for both actors", () => {
    const subject = spell(10), source = provider(11), extra = spell(11, [event(takeExtraTurn())]);
    const f = nthFixture(side, [subject, source, extra], { back: [source.id], void: [subject.id, subject.id, subject.id], hand: [extra.id] });
    let state = nthPlay(f.engine, f.state, side, f.ids[side].void[0], "void").state;
    state = nthPlay(f.engine, state, side, f.ids[side].hand[0]).state;
    const number = state.turn.turnNumber;
    for (const boundary of [number, number + 1]) {
      state = passUntil(f.engine, state, next => next.turn.turnNumber > boundary && at(f.engine, side, "day")(next)).state;
      expect(state.turnLog.played).toEqual({ player: [], enemy: [] });
      const before = state.sides[side].currentEnergy;
      state = nthPlay(f.engine, state, side, f.ids[side].void[boundary === number ? 1 : 2], "void").state;
      expect(before - state.sides[side].currentEnergy).toBe(1);
    }
  });
});
