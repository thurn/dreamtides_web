import { decklists } from "./with-materialized-support";
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { anyCharacter, energy, everyIn, event, self, target } from "../../../dsl/builders";
import { onMaterialized, triggered, whenYouPlay } from "../../../dsl/triggers";
import { thisCharacterSpark } from "../../../dsl/values";
import { materialize } from "../materialize";
import { banishCards } from "../banish-cards";
import { dissolve } from "../dissolve";
import { capturedCards, withMaterialized } from "../with-materialized";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import type { Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { EngineLogRecord } from "../../../log";
import { effectiveSpark } from "../../../rules/spark";
import { invariantViolations } from "../../../testing/invariants";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { resolveEffect } from "../../interpreter";
import type { ResolvingEffect } from "../../registry";
import { repeat } from "../repeat";
import { sequence } from "../sequence";
import { gainSpark } from "../gain-spark";
import { boardState } from "../../../testing/board";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { CHOSEN_SUBTYPE, chooseSubtype } from "../choose-subtype";
import { delayed, floating } from "../floating-trigger";
import { gainPoints } from "../gain-points";
import { drawMatching } from "../draw-matching";

const mage: EngineCardDefinition = { id: syntheticId(0x7810), cardType: "character", costs: [energy(1)], spark: 2, subtype: "Mage", speed: "standard", status: "vanilla", abilities: () => [] };
const warrior: EngineCardDefinition = { ...mage, id: syntheticId(0x7811), subtype: "Warrior" };

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function sliceOf(state: BattleState): BattleSlice {
  return { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
}
function saved(slice: BattleSlice) {
  return parseJourneyBattleFoldState({ mode: { kind: "journey" },
    init: { battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
      enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [] },
    engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown },
  });
}
function fixture(effect: ResolvingEffect, side: Side, failAfter = false, phase: "day" | "night" = "day") {
  const card: EngineCardDefinition = { id: syntheticId(0x7812), cardType: "event", costs: [energy(1)], spark: null,
    subtype: "", speed: "fast", status: "authored", abilities: () => [event(effect)],
    ...(failAfter ? { synthetic: { resolve(ctx, item) {
      resolveEffect(ctx, effect, { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
      throw new Error("synthetic failure after trigger installation");
    } } } satisfies Pick<EngineCardDefinition, "synthetic"> : {}),
  };
  const engine = createEngine(testCatalog([mage, warrior, card]));
  const { state, ids } = boardState(engine.catalog, { active: side, phase, [side]: {
    hand: [{ cardId: card.id, amplified: true }, warrior.id, mage.id, mage.id], back: [mage.id, mage.id, warrior.id],
    energy: 8, deck: [warrior.id, mage.id, warrior.id, mage.id],
  } });
  const logs: EngineLogRecord[] = [];
  const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: record => logs.push(record) });
  const intents: BattleIntent[] = [];
  const publications: unknown[] = [];
  let current = sliceOf(state);
  const reduce = (intent: BattleIntent) => {
    const result = fold.reduce(current, intent);
    current = applied(result);
    intents.push(intent);
    if (result.kind === "applied") publications.push(...result.published);
    return current;
  };
  return { engine, ids, state, logs, fold, intents, publications, get current() { return current; },
    reduce, play: (index: number) => reduce({ kind: "battleAction", side, action: playFromHand(ids, side, index).action }),
    answer: (value: number | readonly import("../../../state/ids").InstanceId[]) => reduce({ kind: "answer", side, promptId: fold.pending(current)!.prompt.id, value }),
    mode: (type: "Mage" | "Warrior") => engine.catalog.characterTypes.indexOf(type),
  };
}

describe("floating chosen subtype", () => {
  for (const side of ["player", "enemy"] as const) {
    for (const futureEffect of [false, true]) {
      it(`installs a chosen-type ${futureEffect ? "deferred effect" : "trigger filter"} for ${side}`, () => {
        const instruction = futureEffect
          ? delayed(whenYouPlay({ cardType: "character" }), drawMatching({ cardType: "character", subtype: CHOSEN_SUBTYPE }))
          : floating(whenYouPlay({ subtype: CHOSEN_SUBTYPE }), gainPoints(1));
        const effect = chooseSubtype({ then: instruction });
        const card: EngineCardDefinition = { id: syntheticId(0x7812), cardType: "event", costs: [energy(1)], spark: null, subtype: "", speed: "fast", status: "authored", abilities: () => [event(effect)] };
        const engine = createEngine(testCatalog([mage, warrior, card]));
        const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [card.id], energy: 3, deck: [warrior.id, mage.id] } });
        const fold = createFoldAdapter(engine, { checkEventPrefix: true });
        const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
        const opened = fold.reduce(start, { kind: "battleAction", side, action: playFromHand(ids, side).action });
        if (opened.kind !== "applied" || opened.error !== null) throw new Error(JSON.stringify(opened));
        const prompt = fold.pending(opened.slice)!.prompt;
        const outcome = fold.reduce(opened.slice, { kind: "answer", side, promptId: prompt.id, value: engine.catalog.characterTypes.indexOf("Mage") });
        expect(outcome.kind).toBe("applied");
        if (outcome.kind !== "applied") throw new Error("expected applied installation");
        expect(outcome.error).toBeNull();
        expect(outcome.slice.committed.floating).toMatchObject([{ source: ids[side].hand[0], controller: side, change: { kind: "trigger" } }]);
      });
    }
  }

  for (const side of ["player", "enemy"] as const) {
    for (const once of [false, true]) {
      it(`keeps two choices of the same ${once ? "delayed" : "floating"} instruction independent after source departure and replay for ${side}`, () => {
        const future = sequence(drawMatching({ cardType: "character", subtype: CHOSEN_SUBTYPE }), gainPoints(1));
        const trigger = whenYouPlay({ subtype: CHOSEN_SUBTYPE });
        const instruction = once ? delayed(trigger, future) : floating(trigger, future);
        const effect = repeat(2, chooseSubtype({ then: instruction }));
        const snapshot = JSON.stringify(effect);
        if (trigger.on !== "play") throw new Error("expected play filter");
        Object.freeze(trigger.filter);
        Object.freeze(trigger);
        Object.freeze(instruction);
        const run = fixture(effect, side);
        const initial = JSON.stringify(run.state);
        run.play(0);
        run.answer(run.mode("Mage"));
        const mid = JSON.parse(JSON.stringify(run.current)) as BattleSlice;
        expect(saved(mid)).not.toBeNull();
        expect(createFoldAdapter(run.engine, { checkEventPrefix: true }).pending(mid)).toEqual(run.fold.pending(run.current));
        run.answer(run.mode("Warrior"));
        expect(run.current.committed.instances[run.ids[side].hand[0]].zone).toBe("void");
        const installed = run.current.committed.floating;
        expect(installed).toHaveLength(2);
        expect(installed.map(record => record.change)).toMatchObject(["Mage", "Warrior"].map(chosenSubtype => ({
          ref: { chosenSubtype, origin: { kind: "card", cardId: syntheticId(0x7812), variant: { amplified: true } } },
        })));
        expect(installed[0].change.kind === "trigger" && installed[1].change.kind === "trigger" && installed[0].change.ref.node).toBe(installed[1].change.kind === "trigger" ? installed[1].change.ref.node : -1);
        run.play(1);
        expect(run.current.committed.sides[side].score).toBe(1);
        expect(run.current.committed.sides[side].hand).toContain(run.ids[side].deck[0]);
        expect(run.current.committed.sides[side].hand).not.toContain(run.ids[side].deck[1]);
        expect(run.current.committed.floating).toHaveLength(once ? 1 : 2);
        const loaded = saved(run.current)!;
        const fresh = createFoldAdapter(run.engine, { checkEventPrefix: true });
        const next = { kind: "battleAction" as const, side, action: playFromHand(run.ids, side, 2).action };
        expect(fresh.reduce(loaded.engine.slice, next)).toEqual(run.fold.reduce(run.current, next));
        run.play(2);
        expect(run.current.committed.sides[side].score).toBe(2);
        expect(run.current.committed.sides[side].hand).toContain(run.ids[side].deck[1]);
        run.play(3);
        expect(run.current.committed.sides[side].score).toBe(once ? 2 : 3);
        expect(run.current.committed.floating).toHaveLength(once ? 0 : 2);
        let replay = sliceOf(run.state);
        const replayEvents: unknown[] = [];
        for (const intent of run.intents) {
          const result = fresh.reduce(replay, intent);
          replay = applied(result);
          if (result.kind === "applied") replayEvents.push(...result.published);
        }
        expect(replay).toEqual(run.current);
        expect(replayEvents).toEqual(run.publications);
        expect(run.logs.filter(record => record.event === "engine.trigger").map(record => record.detail)).toEqual(expect.arrayContaining([
          expect.objectContaining({ kind: "triggerQueued", source: run.ids[side].hand[0], chosenSubtype: "Warrior" }),
          expect.objectContaining({ kind: "triggerResolved", source: run.ids[side].hand[0], chosenSubtype: "Mage" }),
        ]));
        expect(JSON.stringify(effect)).toBe(snapshot);
        expect(JSON.stringify(run.state)).toBe(initial);
        expect(invariantViolations(run.current.committed, run.engine.catalog)).toEqual([]);
      });
    }

    it(`retains a future nested installation and queued target binding across restart for ${side}`, () => {
      const inner = floating(whenYouPlay({ subtype: CHOSEN_SUBTYPE }), gainSpark(target(anyCharacter({ subtype: CHOSEN_SUBTYPE })), 2), "permanent");
      const run = fixture(chooseSubtype({ then: delayed(whenYouPlay({ cardType: "character" }), inner) }), side);
      run.play(0);
      run.answer(run.mode("Mage"));
      run.play(1);
      expect(run.current.committed.floating).toHaveLength(1);
      run.play(2);
      const prompt = run.fold.pending(run.current)!.prompt;
      expect(prompt.kind).toBe("chooseTargets");
      if (prompt.kind !== "chooseTargets") throw new Error("expected future target choice");
      expect(prompt.candidates).toContain(run.ids[side].back[0]);
      expect(prompt.candidates).not.toContain(run.ids[side].back[2]);
      expect(run.current.committed.triggerQueue[0]).toMatchObject({ chosenSubtype: "Mage", source: run.ids[side].hand[0] });
      const loaded = saved(run.current)!;
      const fresh = createFoldAdapter(run.engine, { checkEventPrefix: true });
      expect(fresh.pending(loaded.engine.slice)!.prompt).toEqual(prompt);
      for (const viewer of ["player", "enemy"] as const) {
        const view = run.engine.view(loaded.engine.slice.committed, viewer);
        expect(view.triggerQueue[0]).toMatchObject({ chosenSubtype: "Mage", source: run.ids[side].hand[0] });
        const sampled = run.engine.determinize(view, decklists(loaded.engine.slice.committed), () => 0.5);
        expect(sampled.triggerQueue[0]).toMatchObject({ chosenSubtype: "Mage", source: run.ids[side].hand[0] });
        expect(fresh.pending({ ...loaded.engine.slice, committed: sampled })!.prompt).toEqual(prompt);
      }
      const answer = { kind: "answer" as const, side, promptId: prompt.id, value: [run.ids[side].back[0]!] };
      expect(fresh.reduce(loaded.engine.slice, { ...answer, side: side === "player" ? "enemy" : "player" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      expect(fresh.reduce(loaded.engine.slice, { ...answer, value: [run.ids[side].back[2]!] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(fresh.reduce({ ...loaded.engine.slice, attempt: loaded.engine.slice.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
      expect(fresh.reduce(loaded.engine.slice, { kind: "cancel", side, promptId: prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
      expect(fresh.reduce(loaded.engine.slice, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      expect(fresh.reduce(loaded.engine.slice, answer)).toEqual(run.fold.reduce(run.current, answer));
      run.answer(answer.value);
      expect(effectiveSpark(run.current.committed, run.engine.catalog, run.ids[side].back[0]!)).toBe(4);
      expect(fresh.reduce(run.current, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
      const malformed = JSON.parse(JSON.stringify(loaded.engine.slice)) as BattleSlice;
      Object.assign(malformed.committed.triggerQueue[0], { chosenSubtype: { subtype: "Mage" } });
      expect(saved(malformed)).toBeNull();
    });

    it(`keeps captured cards and departure spark with a chosen installation for ${side}`, () => {
      const future = sequence(banishCards([capturedCards()]), gainPoints(thisCharacterSpark()), drawMatching({ subtype: CHOSEN_SUBTYPE }));
      const effect = chooseSubtype({ then: withMaterialized(materialize(everyIn("void", { cardType: "character" })),
        sequence(dissolve(self()), delayed(whenYouPlay({ subtype: CHOSEN_SUBTYPE }), future))) });
      const source: EngineCardDefinition = { ...warrior, id: syntheticId(0x7813), spark: 4, status: "authored", abilities: () => [triggered(onMaterialized(), effect)] };
      const engine = createEngine(testCatalog([mage, warrior, source]));
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: {
        hand: [source.id, warrior.id, mage.id], void: [mage.id], deck: [mage.id, warrior.id], energy: 5,
      } });
      const fold = createFoldAdapter(engine, { checkEventPrefix: true });
      let slice = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side, action: playFromHand(ids, side).action }));
      slice = applied(fold.reduce(slice, { kind: "answer", side, promptId: fold.pending(slice)!.prompt.id, value: engine.catalog.characterTypes.indexOf("Mage") }));
      expect(slice.committed.instances[ids[side].hand[0]].zone).toBe("void");
      expect(slice.committed.floating[0].change).toMatchObject({ kind: "trigger", captured: [ids[side].void[0]], lastKnownSourceSpark: 4, ref: { chosenSubtype: "Mage" } });
      slice = saved(slice)!.engine.slice;
      for (const index of [1, 2]) slice = applied(fold.reduce(slice, { kind: "battleAction", side, action: playFromHand(ids, side, index).action }));
      expect(slice.committed.instances[ids[side].void[0]].zone).toBe("banished");
      expect(slice.committed.sides[side].score).toBe(4);
      expect(slice.committed.sides[side].hand).toEqual([ids[side].deck[0]]);
      expect(slice.committed.floating).toEqual([]);
      expect(invariantViolations(slice.committed, engine.catalog)).toEqual([]);
    });

    it(`rolls back a partial installation and recovers identically after restart for ${side}`, () => {
      const instruction = delayed(whenYouPlay({ subtype: CHOSEN_SUBTYPE }), gainPoints(1));
      const run = fixture(repeat(2, chooseSubtype({ then: instruction })), side, true);
      run.play(0);
      run.answer(run.mode("Mage"));
      expect(run.fold.pending(run.current)!.display.floating).toHaveLength(1);
      expect(run.current.committed.floating).toEqual([]);
      const current = JSON.parse(JSON.stringify(run.current)) as BattleSlice;
      const prompt = run.fold.pending(run.current)!.prompt;
      const intent = { kind: "answer" as const, side, promptId: prompt.id, value: run.mode("Warrior") };
      const failed = run.fold.reduce(run.current, intent);
      expect(createFoldAdapter(run.engine, { checkEventPrefix: true }).reduce(current, intent)).toEqual(failed);
      if (failed.kind !== "applied") throw new Error("expected recovery");
      expect(failed.error).not.toBeNull();
      expect(failed.published).toEqual([]);
      expect(failed.slice.inFlight).toBeNull();
      expect(failed.slice.committed.floating).toEqual([]);
      expect(failed.slice.committed.instances).toEqual(run.current.committed.instances);
      expect(failed.slice.committed.sides).toEqual(run.current.committed.sides);
    });

    it(`expires a bound repeating trigger while ordinary unbound triggers remain valid for ${side}`, () => {
      const effect = sequence(chooseSubtype({ then: floating(whenYouPlay({ subtype: CHOSEN_SUBTYPE }), gainPoints(1)) }),
        floating(whenYouPlay({ subtype: "Mage" }), gainPoints(1), "permanent"));
      const run = fixture(effect, side, false, "night");
      run.play(0);
      run.answer(run.mode("Mage"));
      const records = run.current.committed.floating;
      expect(records[0].change.kind === "trigger" && records[0].change.ref.chosenSubtype).toBe("Mage");
      expect(records[1].change.kind === "trigger" && records[1].change.ref.chosenSubtype).toBeUndefined();
      expect(saved(run.current)).not.toBeNull();
      for (const invalid of [null, 3, {}, [], "", "{chosen character type}", "*", "X"]) {
        const malformed = JSON.parse(JSON.stringify(run.current)) as BattleSlice;
        if (malformed.committed.floating[0].change.kind !== "trigger") throw new Error("expected trigger");
        Object.assign(malformed.committed.floating[0].change.ref, { chosenSubtype: invalid });
        expect(saved(malformed)).toBeNull();
      }
      run.reduce({ kind: "battleAction", side, action: { kind: "pass" } });
      expect(run.current.committed.floating).toHaveLength(1);
      expect(run.current.committed.floating[0].change.kind === "trigger" && run.current.committed.floating[0].change.ref.chosenSubtype).toBeUndefined();
      expect(invariantViolations(run.current.committed, run.engine.catalog)).toEqual([]);
    });
  }
});
