/** Requirements read current physical cards before every paid play transaction. */
import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parsePromptId } from "../../../../types/identifiers";
import type { EngineCardDefinition } from "../../../catalog";
import { additionalCost, banishFromVoidCost, conditionCardCounts, discardCost, energy, event, keyword, playCondition, reclaim, staticAbility } from "../../../dsl/builders";
import { NO_DECK_MODS, type Ability, type PlayerRef } from "../../../dsl/types";
import { createEngine, IllegalAction } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { promptFingerprint } from "../../../prompts/fingerprint";
import type { Action } from "../../../rules/actions";
import type { PlayZone } from "../../../rules/timing";
import { stateHash } from "../../../state/hash";
import { opponent, SIDES, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { labBoard } from "../../../testing/lab-solver";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { gainEnergy } from "../gain-energy";
import { playFromZone } from "../play-from-zone";
import { playImmediately } from "../play-immediately";
import { revealDeckTop } from "../reveal-deck-top";
import { ruleModifier } from "../rule-modifier";

const deck = [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id];
const events = (count: number) => Array.from({ length: count }, () => v.event0.id);
function subject(index: number, extra: readonly Ability[] = [], player: PlayerRef = "you"): EngineCardDefinition {
  return { ...v.event1, id: syntheticId(0x10500 + index), costs: [energy(2)], status: "authored",
    abilities: (variant) => [playCondition(conditionCardCounts("void", variant.amplified ? 2 : 3, { player, filter: { cardType: "event" } })), ...extra, event(gainEnergy(5))] };
}
const required = subject(1);
const offering = subject(2, [keyword("offering")]);
const reclaimed = subject(3, [reclaim(energy(1))]);
const paying = subject(4, [additionalCost(discardCost(1))]);
const banishing = subject(8, [additionalCost(banishFromVoidCost(2))]);
const fast = { ...subject(5), speed: "fast" as const };
const permission: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x10510), abilities: () => [
  staticAbility(playFromZone("void", {}, { oncePerTurn: true })), staticAbility(playFromZone("deck")), staticAbility(revealDeckTop()),
] };
const alternative: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x10511), abilities: () => [staticAbility(ruleModifier({ rule: "eventAlternative", energy: 1 }))] };
const immediate: EngineCardDefinition = { ...v.event0, id: syntheticId(0x10512), status: "authored", abilities: () => [event(playImmediately("void"))] };
const relative = subject(6, [], "opponent");
const conjunction = { ...subject(7), abilities: () => [playCondition(conditionCardCounts("void", 1)), playCondition(conditionCardCounts("void", 2, { player: "opponent" })), event(gainEnergy(5))] };
const engine = createEngine(testCatalog([required, offering, reclaimed, paying, fast, permission, alternative, immediate, relative, conjunction, banishing]));
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`Expected applied intent: ${JSON.stringify(out)}`);
  return out;
}
function setup(side: Side, card: EngineCardDefinition = required, count = 3, from: PlayZone = "hand", amplified = false, back: readonly EngineCardDefinition[] = []) {
  return boardState(engine.catalog, { active: side, phase: "day",
    [side]: { energy: 10, deck: from === "deck" ? [card.id, ...deck] : deck,
      hand: from === "hand" ? [{ cardId: card.id, amplified }, v.event0.id, v.event0.id] : [v.event0.id, v.event0.id],
      void: from === "void" ? [card.id, ...events(Math.max(0, count - 1))] : events(count), back: back.map((c) => c.id) },
    [opponent(side)]: { energy: 10, hand: [v.interruptEvent.id], deck, void: events(4) },
  });
}
function action(ids: ReturnType<typeof setup>["ids"], side: Side, from: PlayZone = "hand"): Action {
  return { kind: "play", card: ids[side][from][0], from };
}
function hasPlay(state: BattleState, side: Side, play: Action) {
  return engine.legalActions(state, side).some((legal) => legal.kind === "play" && play.kind === "play" && legal.card === play.card && legal.from === play.from);
}
function refused(state: BattleState, side: Side, play: Action) {
  const before = JSON.parse(JSON.stringify(state)) as BattleState;
  const hash = stateHash(state);
  expect(hasPlay(state, side, play)).toBe(false);
  expect(() => engine.apply(state, side, play, NO_PROMPTS)).toThrow(IllegalAction);
  expect(createFoldAdapter(engine).reduce(sliceOf(state), { kind: "battleAction", side, action: play })).toEqual({ kind: "bounced", reason: "illegalAction" });
  expect(stateHash(state)).toBe(hash);
  expect(state).toEqual(before);
}
function savedJourney(slice: BattleSlice): Record<string, unknown> {
  return { mode: { kind: "journey" }, init: { battleId: "battle-1", siteId: "site-1", nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [] },
    engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } };
}

describe("playCondition", () => {
  it.each(SIDES)("binds the %s variant, counts duplicate physical events and pays before gaining energy", (side) => {
    for (const amplified of [false, true]) {
      const threshold = amplified ? 2 : 3;
      for (const count of [0, threshold - 1, threshold, threshold + 1]) {
        const { state, ids } = setup(side, required, count, "hand", amplified);
        const play = action(ids, side);
        if (count < threshold) { refused(state, side, play); continue; }
        expect(new Set(ids[side].void).size).toBe(count);
        expect(hasPlay(state, side, play)).toBe(true);
        const played = engine.apply(state, side, play, NO_PROMPTS);
        expect(played.state.sides[side].currentEnergy).toBe(8);
        expect(played.state.instances[ids[side].hand[0]].zone).toBe("stack");
        expect(played.state.turnLog.played[side].map((card) => card.instance)).toEqual([ids[side].hand[0]]);
        expect(played.events.filter((e) => e.kind === "cardPlayed")).toEqual([{ kind: "cardPlayed", side, instance: ids[side].hand[0] }]);
        const resolved = passUntil(engine, played.state, (s) => s.stack.length === 0);
        expect(resolved.state.sides[side]).toMatchObject({ currentEnergy: 13, maxEnergy: 10 });
        expect(resolved.state.instances[ids[side].hand[0]].zone).toBe("void");
        expect(resolved.events.filter((e) => e.kind === "resolved" && e.instance === ids[side].hand[0])).toHaveLength(1);
      }
    }
    const unrequired = setup(side, v.event1, 0);
    expect(hasPlay(unrequired.state, side, action(unrequired.ids, side))).toBe(true);
  });

  it.each(SIDES)("reads current effective void types for %s, excluding hand sources, characters, other zones and past plays", (side) => {
    const { state, ids } = setup(side, required, 2);
    // The hand source and the other side's four events cannot supply the third.
    refused(state, side, action(ids, side));
    const typed = setup(side, required, 3);
    typed.state.instances[typed.ids[side].void[0]] = { ...typed.state.instances[typed.ids[side].void[0]], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Warrior" } } } };
    refused(typed.state, side, action(typed.ids, side));
    const changed = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [required.id], void: [v.event0.id, v.event0.id, v.vanilla1.id], deck, energy: 10 }, [opponent(side)]: { deck } });
    refused(changed.state, side, action(changed.ids, side));
    const changedType = JSON.parse(JSON.stringify(changed.state)) as BattleState;
    changedType.instances[changed.ids[side].void[2]] = { ...changedType.instances[changed.ids[side].void[2]], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } } };
    expect(hasPlay(changedType, side, action(changed.ids, side))).toBe(true);
    const historical = boardState(engine.catalog, { active: side, phase: "day", [side]: { energy: 10, deck,
      hand: [...Array.from({ length: 3 }, () => ({ cardId: v.event1.id, deckMods: { ...NO_DECK_MODS, reclaim: 0 } })), required.id] },
      [opponent(side)]: { energy: 10, deck, hand: [v.interruptEvent.id] } });
    let after = historical.state;
    for (const card of historical.ids[side].hand.slice(0, 3)) {
      const play = engine.apply(after, side, { kind: "play", card, from: "hand" }, NO_PROMPTS);
      after = passUntil(engine, play.state, (s) => s.stack.length === 0).state;
    }
    for (const card of historical.ids[side].hand.slice(0, 2)) {
      const play = engine.apply(after, side, { kind: "play", card, from: "void" }, NO_PROMPTS);
      after = passUntil(engine, play.state, (s) => s.stack.length === 0).state;
    }
    expect(after.turnLog.played[side]).toHaveLength(5);
    expect(after.sides[side].void).toHaveLength(1);
    refused(after, side, { kind: "play", card: historical.ids[side].hand[3], from: "hand" });
    const source = ids[side].hand[0];
    state.instances[source] = { ...state.instances[source], owner: opponent(side) };
    refused(state, side, action(ids, side));
    const ownedElsewhere = setup(side, required, 3);
    ownedElsewhere.state.instances[ownedElsewhere.ids[side].hand[0]] = { ...ownedElsewhere.state.instances[ownedElsewhere.ids[side].hand[0]], owner: opponent(side) };
    expect(hasPlay(ownedElsewhere.state, side, action(ownedElsewhere.ids, side))).toBe(true);

  });

  it.each(SIDES)("resolves explicit relative players and conjoins multiple %s requirements", (side) => {
    const other = setup(side, relative, 0);
    expect(hasPlay(other.state, side, action(other.ids, side))).toBe(true);
    const both = setup(side, conjunction, 0);
    refused(both.state, side, action(both.ids, side));
    const yes = setup(side, conjunction, 1);
    expect(hasPlay(yes.state, side, action(yes.ids, side))).toBe(true);
  });

  it.each(SIDES)("guards every ordinary %s route before route choices and payment", (side) => {
    for (const route of ["hand", "offering", "reclaim", "permission", "deck", "eventAlternative"] as const) {
      const card = route === "offering" ? offering : route === "reclaim" ? reclaimed : route === "eventAlternative" ? fast : required;
      const from = route === "deck" ? "deck" : route === "reclaim" || route === "permission" ? "void" : "hand";
      const back = route === "permission" || route === "deck" ? [permission] : route === "eventAlternative" ? [alternative] : [];
      const no = setup(side, card, 2, from, false, back);
      refused(no.state, side, action(no.ids, side, from));
      const yes = setup(side, card, 3, from, false, back);
      const answers = route === "offering" ? [1, [yes.ids[side].hand[1]]] : route === "eventAlternative" ? [1] : [];
      const source = yes.ids[side][from][0];
      const out = engine.apply(yes.state, side, action(yes.ids, side, from), new ScriptedSource(answers));
      const cost = route === "offering" ? 0 : route === "reclaim" || route === "eventAlternative" ? 1 : 2;
      expect(out.state.sides[side].currentEnergy).toBe(10 - cost);
      expect(out.state.instances[source].zone).toBe("stack");
      // The source counted itself in its void before moving; resolution ignores the resulting deficit.
      const end = passUntil(engine, out.state, (s) => s.stack.length === 0).state;
      expect(end.sides[side].currentEnergy).toBe(15 - cost);
      expect(end.instances[source].zone).toBe(route === "reclaim" ? "banished" : "void");
    }
  });

  it.each(SIDES)("checks %s requirements before costs consume the counted events", (side) => {
    const { state, ids } = setup(side, banishing, 3);
    const out = engine.apply(state, side, action(ids, side), new ScriptedSource([ids[side].void.slice(0, 2)]));
    expect(out.state.sides[side].void).toHaveLength(1);
    expect(out.state.sides[side].currentEnergy).toBe(8);
    const end = passUntil(engine, out.state, (s) => s.stack.length === 0).state;
    expect(end.sides[side].currentEnergy).toBe(13);
    const solved = labBoard(engine, banishing.id, [], side);
    expect(solved.state.sides[side].void).toHaveLength(3);
    expect(engine.legalActions(solved.state, side).some((a) => a.kind === "play")).toBe(true);
  });

  it.each(SIDES)("preserves %s payment/history through cancel, cold replay, invalid/stale/foreign and concurrent inputs", (side) => {
    const { state, ids } = setup(side, paying, 3);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side, action: action(ids, side) }));
    const pending = fold.pending(opened.slice)!;
    expect(pending.prompt.kind).toBe("chooseCards");
    expect(opened.slice.committed).toEqual(state);
    const cancelled = applied(fold.reduce(opened.slice, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(cancelled.slice.committed).toEqual(state);
    expect(parseJourneyBattleFoldState(savedJourney(opened.slice))).not.toBeNull();
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(saved)).toEqual(pending);
    const answer = { kind: "answer", side, promptId: pending.prompt.id, value: [ids[side].hand[1]] } as const;
    expect(cold.reduce(saved, { ...answer, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(saved, { ...answer, promptId: parsePromptId("0:0:0") })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(cold.reduce(saved, { ...answer, value: [ids[opponent(side)].hand[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(cold.reduce(saved, { kind: "battleAction", side, action: action(ids, side) })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(cold.reduce(cancelled.slice, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const resumed = applied(cold.reduce(saved, answer));
    const warm = applied(fold.reduce(opened.slice, answer));
    expect(resumed.published).toEqual(warm.published);
    expect(stateHash(resumed.slice.committed)).toBe(stateHash(warm.slice.committed));
    expect(resumed.slice.committed.sides[side].currentEnergy).toBe(8);
    expect(resumed.slice.committed.turnLog.played[side]).toHaveLength(1);
    expect(cold.reduce(resumed.slice, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const partial: BattleSlice = { ...saved, inFlight: { ...saved.inFlight!, answers: [{ fingerprint: promptFingerprint(pending.prompt), value: [ids[opponent(side)].hand[0]] }] } };
    expect(cold.pending(partial)).toBeNull();
    const recovered = cold.reduce(partial, answer);
    if (recovered.kind !== "applied") throw new Error("Expected saved-answer recovery");
    expect(recovered.error).not.toBeNull();
    expect(recovered.slice.committed).toEqual(state);
    expect(recovered.slice.inFlight).toBeNull();
    // A restored refusal still reads its own current threshold.
    const below = setup(side, paying, 2);
    refused(JSON.parse(JSON.stringify(below.state)) as BattleState, side, action(below.ids, side));
    const invalidated: BattleSlice = { ...saved, committed: below.state };
    expect(cold.pending(invalidated)).toBeNull();
    const blockedReplay = cold.reduce(invalidated, answer);
    if (blockedReplay.kind !== "applied") throw new Error("Expected requirement replay recovery");
    expect(blockedReplay.error).not.toBeNull();
    expect(blockedReplay.slice.committed).toEqual(below.state);
    expect(blockedReplay.slice.inFlight).toBeNull();
  });

  it.each(SIDES)("keeps immediate timing while enforcing a type-changed %s card's requirement", (side) => {
    for (const count of [2, 3]) {
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [immediate.id], void: [required.id, ...events(count)], energy: 10, deck }, [opponent(side)]: { hand: [v.interruptEvent.id], energy: 10, deck } });
      const source = ids[side].void[0];
      state.instances[source] = { ...state.instances[source], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Warrior" } } } };
      const played = engine.apply(state, side, action(ids, side), NO_PROMPTS);
      const answered = engine.apply(played.state, opponent(side), { kind: "pass" }, new ScriptedSource(count === 3 ? [[source]] : []));
      expect(answered.state.instances[source].zone).toBe(count === 3 ? "stack" : "void");
      expect(answered.state.sides[side].currentEnergy).toBe(count === 3 ? 8 : 10);
      expect(answered.state.turnLog.played[side]).toHaveLength(count === 3 ? 2 : 1);
      if (count === 3) expect(answered.events.filter((e) => e.kind === "cardPlayed")).toEqual([{ kind: "cardPlayed", side, instance: source }]);
    }
  });

  it.each(SIDES)("stages only the required matching void deficit for %s and preserves declared refusal", (side) => {
    for (const amplified of [false, true]) {
      const entry = { cardId: required.id, amplified };
      const solved = labBoard(engine, entry, [], side);
      const count = amplified ? 2 : 3;
      expect(solved.state.sides[side].void).toHaveLength(count);
      expect(solved.state.sides[opponent(side)].void).toEqual([]);
      expect(engine.legalActions(solved.state, side).some((a) => a.kind === "play")).toBe(true);
      const declared = labBoard(engine, entry, [], side, { [side]: { void: events(count - 1) } });
      expect(engine.legalActions(declared.state, side).some((a) => a.kind === "play")).toBe(false);
    }
  });
});
