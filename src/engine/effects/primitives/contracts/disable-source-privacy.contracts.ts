/** Hidden producer contracts compare public views and ordinary future play. */
import { describe, expect, it } from "vitest";
import { activated, all, anyCharacter, energy, event, everyIn } from "../../../dsl/builders";
import { triggered, whenDraw } from "../../../dsl/triggers";
import type { Condition } from "../../../dsl/types";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { battleSeed, type InstanceId, type Side } from "../../../state/ids";
import { stateHash } from "../../../state/hash";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { comparableView, determinizationDivergences } from "../../../testing/determinization-fidelity";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { resolveEffect } from "../../interpreter";
import * as p from "../index";

const conditions: readonly (Condition | null)[] = [null, { cond: "sourceIn", zone: "hand" }];
function fixture(condition: Condition | null) {
  const disable = p.disableTriggers(all(anyCharacter()), "permanent", condition, "triggeredAndActivated");
  const hand = (index: number, nth?: number): EngineCardDefinition => ({ ...v.vanilla1, id: syntheticId(0x77b10 + index), costs: [energy(0)],
    abilities: () => [triggered(whenDraw("opponent", nth), disable, { zone: "hand" })] });
  const [twice, first, second] = [hand(0), hand(1, 1), hand(2, 2)];
  const starter: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x77b20), cardType: "event", spark: null, subtype: "", costs: [energy(0)], abilities: () => [event(p.draw(2))] };
  const target: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x77b21), abilities: () => [activated([energy(0)], p.gainPoints(1))] };
  const observer: EngineCardDefinition = { ...starter, id: syntheticId(0x77b22), synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, p.sequence(p.reveal("opponent"), p.shuffleInto([everyIn("hand", {}, { player: "opponent" })]), p.discard(1)), {
      controller: item.controller, source: item.instance, origin: instanceOrigin(ctx.state.instances[item.instance]), ability: 0, x: null,
      optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("Synthetic failure after publishing attribution");
  } } };
  const engine = createEngine(testCatalog([twice, first, second, starter, target, observer]));
  function world(shared: boolean) {
    const initial = boardState(engine.catalog, { active: "player", phase: "day", player: {
      back: [target.id], hand: [starter.id, observer.id], deck: [v.vanilla3.id, v.vanilla5.id], energy: 8,
    }, enemy: { hand: shared ? [twice.id, v.vanilla1.id, v.interruptEvent.id] : [first.id, second.id, v.interruptEvent.id], deck: shared ? [first.id, second.id] : [twice.id, v.vanilla1.id], energy: 8 } });
    const entries = (side: Side) => Object.values(initial.state.instances).filter((instance) => instance.owner === side)
      .sort((a, b) => JSON.stringify(a.printing).localeCompare(JSON.stringify(b.printing)))
      .flatMap((instance) => instance.printing.kind === "card" ? [{ cardId: instance.printing.cardId }] : []);
    const lists = { player: entries("player"), enemy: entries("enemy") };
    const cast = engine.apply(initial.state, "player", { kind: "play", card: initial.ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    const done = passUntil(engine, cast.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0);
    return { ...initial, state: done.state, lists, view: engine.view(done.state, "player"), events: [...cast.events, ...done.events] };
  }
  return { engine, world };
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Expected successful fold intent: ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
function saved(slice: BattleSlice): Record<string, unknown> {
  return { mode: { kind: "journey" }, init: {
    battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
    avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } };
}
function sources(state: BattleState): InstanceId[] {
  return state.floating.map((effect) => { if (typeof effect.source !== "string") throw new Error("Expected reconstructed card source"); return effect.source; });
}

describe("combined disabling private source attribution", () => {
  it.each(conditions)("conceals private alias, printing, owner and existence for %j", (condition) => {
    const { engine, world } = fixture(condition), shared = world(true), separate = world(false);
    const redacted = (outcome: typeof shared) => outcome.events.map((item) => eventSeenBy(item, "player", outcome.state));
    expect(redacted(shared)).toEqual(redacted(separate));
    expect(shared.view).toEqual(separate.view);
    expect(shared.view.floating).toHaveLength(2);
    const malformed = { ...shared.view, floating: shared.view.floating.map((effect) => ({ ...effect, rememberedSource: { obligation: shared.view.floating[1].id } })) };
    expect(() => engine.determinize(malformed, shared.lists, () => 0.4)).toThrow(/invalid source obligation/);
    for (const effect of shared.view.floating) {
      expect(effect.source).toBeNull();
      expect(effect.rememberedSource).toEqual({ obligation: effect.id });
      expect(effect).not.toHaveProperty("sourceObservedBy");
    }
    const absent = structuredClone(shared.state);
    for (const id of new Set(sources(absent))) {
      const replacement: InstanceId = `i${absent.nextInstance++}`;
      absent.instances[replacement] = { ...absent.instances[id], id: replacement, printing: { kind: "card", cardId: v.vanilla1.id } };
      delete absent.instances[id];
      absent.sides.enemy.hand = absent.sides.enemy.hand.map((entry) => entry === id ? replacement : entry);
    }
    if (condition === null) expect(engine.view(absent, "player")).toEqual(shared.view);
    for (const random of [() => 0.4, () => 0.99]) {
      const left = engine.determinize(shared.view, shared.lists, random), right = engine.determinize(separate.view, separate.lists, random);
      expect(stateHash(left)).toBe(stateHash(right));
      expect(comparableView(engine.view(left, "player"))).toEqual(comparableView(shared.view));
      expect(determinizationDivergences(engine, shared.state, shared.lists, battleSeed("private-producer"), 7)).toEqual([]);
    }
  });

  it("permits both private aliases with the same view and keeps future source conditions dynamic", () => {
    const { engine, world } = fixture(conditions[1]), original = world(true);
    for (const shared of [true, false]) {
      let calls = 0;
      const random = () => shared ? 0.4 : calls++ % 2 === 0 ? 0.4 : 0.6;
      const sample = engine.determinize(original.view, original.lists, random), [first, second] = sources(sample);
      expect(first === second).toBe(shared);
      expect(sample.instances[first].zone).toBe("hand"); expect(sample.instances[second].zone).toBe("hand");
      expect(engine.view(sample, "player").disabledActivations).toEqual(original.view.disabledActivations);
      const ready = passUntil(engine, sample, at(engine, "enemy", "day")).state;
      const cast = engine.apply(ready, "enemy", { kind: "play", card: first, from: "hand" }, NO_PROMPTS);
      const done = passUntil(engine, cast.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0).state;
      expect(engine.view(done, "player").disabledActivations).toEqual(shared ? [] : original.view.disabledActivations);
    }
  });

  it("samples an unknown source across both owners, known hidden cards and a nonexistent alternative", () => {
    const { engine, world } = fixture(null), original = world(true);
    // Visible history may identify a card without identifying a subsequent private producer.
    const marked = structuredClone(original.state);
    const id = marked.sides.enemy.hand[1];
    marked.knownTo.player.push(id);
    const seen = engine.view(marked, "player");
    const candidateSets: BattleState[] = [engine.determinize(original.view, original.lists, () => 0.99), engine.determinize(seen, original.lists, () => 0.6)];
    expect(candidateSets[0].instances[sources(candidateSets[0])[0]]).toBeUndefined();
    expect(sources(candidateSets[1]).some((source) => candidateSets[1].instances[source]?.printing.kind === "card")).toBe(true);
    const ownHidden = structuredClone(original.state);
    ownHidden.knownTo.player = ownHidden.knownTo.player.filter((entry) => !ownHidden.sides.player.hand.includes(entry));
    // A deck is hidden from its owner too; a private draw producer can bind there.
    const card = ownHidden.sides.player.hand.pop()!;
    ownHidden.sides.player.deck.push(card); ownHidden.instances[card] = { ...ownHidden.instances[card], zone: "deck" };
    const ownSeen = engine.view(ownHidden, "player");
    const sampled = engine.determinize(ownSeen, original.lists, () => 0);
    expect(sources(sampled).some((source) => sampled.instances[source]?.owner === "player")).toBe(true);
    expect(comparableView(engine.view(sampled, "player"))).toEqual(comparableView(ownSeen));
  });

  it("persists observed attribution, treats missing legacy flags conservatively and validates strict modes", () => {
    const { engine, world } = fixture(null), original = world(true);
    const observed = structuredClone(original.state);
    const fold = createFoldAdapter(engine);
    // An ordinary reveal exposes the already published effect's source attribution.
    const cast = applied(fold.reduce(sliceOf(observed), { kind: "battleAction", side: "player", action: { kind: "play", card: original.ids.player.hand[1], from: "hand" } }));
    const suspended = applied(fold.reduce(cast, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const pending = fold.pending(suspended)!;
    expect(pending.display.floating.every((effect) => effect.sourceObservedBy?.includes("player"))).toBe(true);
    const parsed = parseJourneyBattleFoldState(saved({ ...suspended, committed: pending.display }))!;
    expect(stateHash(parsed.engine.slice.committed)).toBe(stateHash(pending.display));
    const seen = engine.view(parsed.engine.slice.committed, "player");
    expect(seen.floating[0].rememberedSource).toEqual(seen.floating[1].rememberedSource);
    expect(seen.floating[0].rememberedSource).toHaveProperty("member");
    const legacy = structuredClone(parsed.engine.slice.committed);
    legacy.floating = legacy.floating.map(({ sourceObservedBy: _observed, ...effect }) => effect);
    expect(parseJourneyBattleFoldState(saved(sliceOf(legacy)))).not.toBeNull();
    expect(engine.view(legacy, "player").floating.map((effect) => effect.rememberedSource)).toEqual(legacy.floating.map((effect) => ({ obligation: effect.id })));
    for (const malformed of [null, true, "player", ["player", "player"], ["other"], ["player", 1]]) {
      const data = saved(sliceOf(original.state));
      const engineData = data.engine as { slice: { committed: { floating: { sourceObservedBy: unknown }[] } } };
      engineData.slice.committed.floating[0].sourceObservedBy = malformed;
      expect(parseJourneyBattleFoldState(data)).toBeNull();
    }
    for (const mode of [undefined, "triggered"] as const) {
      const state = structuredClone(original.state), effect = state.floating[0];
      if (effect.change.kind !== "disableTriggers") throw new Error("Missing combined effect");
      state.floating[0] = { ...effect, sourceObservedBy: ["enemy"], change: { ...effect.change, mode } };
      expect(parseJourneyBattleFoldState(saved(sliceOf(state)))).toBeNull();
    }
  });

  it("reloads published observation, rejects invalid concurrent and stale input, and retains attribution on error", () => {
    const { engine, world } = fixture(null), original = world(true), fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const cast = applied(fold.reduce(sliceOf(original.state), { kind: "battleAction", side: "player", action: { kind: "play", card: original.ids.player.hand[1], from: "hand" } }));
    const pendingSlice = applied(fold.reduce(cast, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const loaded = parseJourneyBattleFoldState(saved(pendingSlice))!.engine.slice, pending = fold.pending(loaded)!;
    expect(pending.prompt.kind).toBe("chooseCards");
    expect(fold.pending(pendingSlice)!.prompt).toEqual(pending.prompt);
    expect(fold.reduce(loaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(loaded, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(loaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(loaded, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [pending.display.sides.player.hand[0]] } as const;
    const failed = fold.reduce(loaded, answer), direct = fold.reduce(pendingSlice, answer);
    if (failed.kind !== "applied" || direct.kind !== "applied") throw new Error("Expected contained error");
    expect(failed.error).not.toBeNull(); expect(stateHash(failed.slice.committed)).toBe(stateHash(direct.slice.committed));
    expect(failed.slice.inFlight).toBeNull(); expect(failed.slice.committed.floating).toHaveLength(2);
    expect(failed.slice.committed.floating.every((effect) => effect.sourceObservedBy?.includes("player"))).toBe(true);
    expect(failed.slice.committed.sides.enemy.hand).toEqual(cast.committed.sides.enemy.hand);
    const restarted = applied(fold.reduce(failed.slice, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    expect(fold.reduce(restarted, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(parseJourneyBattleFoldState(saved(failed.slice))).not.toBeNull();
  });
});
