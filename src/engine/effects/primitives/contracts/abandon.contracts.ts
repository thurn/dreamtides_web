import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, energyX, event, keyword, x } from "../../../dsl/builders";
import { onDissolved, triggered, whenAbandon } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, placeFigment, type BoardSetup } from "../../../testing/board";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { abandon } from "../abandon";
import { choosePlayer } from "../choose-player";
import { gainPoints } from "../gain-points";
import { sequence } from "../sequence";

const card = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(index), status: "authored", abilities: () => [event(effect)],
});
const own = card(1240, abandon());
const other = card(1241, abandon("opponent"));
const filtered = card(1242, sequence(abandon("you", { subtype: "Mage", another: true }), gainPoints(3)));
const selected = card(1243, choosePlayer((player) => abandon(player)));
const priced: EngineCardDefinition = { ...card(1244, abandon("opponent", { costAtMost: x() })), costs: [energyX(0)] };
const protectedCharacter: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1245), status: "authored",
  abilities: () => [keyword("veil"), keyword("cannotBeTargeted"), triggered(onDissolved(), gainPoints(2))],
};
const watcher: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1246), status: "authored",
  abilities: () => [triggered(whenAbandon(), gainPoints(1))],
};
const source: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1247), subtype: "Mage", status: "authored",
  abilities: () => [activated([], abandon("you", { another: true, subtype: "Mage" })), activated([], abandon())],
};
const mage: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(1248), subtype: "Mage" };
const failing: EngineCardDefinition = {
  ...card(1249, abandon("opponent")), abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, abandon("opponent"), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic failure after abandonment");
    },
  },
};
const engine = createEngine(testCatalog([own, other, filtered, selected, priced, protectedCharacter, watcher, source, mage, failing]));
const deck = Array.from({ length: 5 }, () => v.vanilla1.id);
function setup(controller: Side = "player", effect = own.id): BoardSetup {
  return {
    active: controller, phase: "day",
    [controller]: { hand: [effect, v.event0.id], back: [v.vanilla1.id, v.vanilla1.id], energy: 4, deck },
    [opponent(controller)]: { back: [v.vanilla2.id, v.vanilla2.id], hand: [v.event0.id], deck },
  };
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}
function opened(board = setup("player", other.id), records: EngineLogRecord[] = []) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: (record) => records.push(record) });
  const { state, ids } = boardState(engine.catalog, board);
  const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const slice = applied(fold.reduce(start, { kind: "battleAction", side: board.active, action: playFromHand(ids, board.active).action }));
  return { fold, slice, ids, start };
}

describe("abandon", () => {
  it.each(["player", "enemy"] as const)("%s's own or forced opponent choice abandons exactly the chosen physical instance", (controller) => {
    for (const effect of [own, other]) {
      const chooser = effect === own ? controller : opponent(controller);
      const records: EngineLogRecord[] = [];
      const { fold, slice, ids, start } = opened(setup(controller, effect.id), records);
      const pending = fold.pending(slice)!;
      const chosen = ids[chooser].back[1]!;
      expect(pending.prompt).toMatchObject({
        kind: "chooseCards", side: chooser, candidates: ids[chooser].back, min: 1, max: 1,
        cancellable: false, purpose: { role: "abandon", source: ids[controller].hand[0], cardId: effect.id },
      });
      expect(pending.prompt.privateTo).toBeUndefined();
      expect(start.committed.instances[chosen].printing).toEqual(start.committed.instances[ids[chooser].back[0]!].printing);
      expect(ids[chooser].back[0]).not.toBe(chosen);
      for (const viewer of [controller, opponent(controller)]) {
        const projected = promptView(pending.prompt, viewer, pending.display);
        expect(projected).toMatchObject({ candidates: ids[chooser].back });
        const battle = view(pending.display, viewer, engine.catalog);
        for (const hidden of pending.display.sides[opponent(viewer)].hand) expect(battle.instances[hidden]).toBeUndefined();
        expect(battle.instances[ids[opponent(viewer)].deck[0]]).toBeUndefined();
      }
      const outcome = fold.reduce(slice, { kind: "answer", side: chooser, promptId: pending.prompt.id, value: [chosen] });
      const done = applied(outcome);
      expect(done.committed.instances[chosen]).toMatchObject({ zone: "void", owner: chooser, controller: chooser });
      expect(done.committed.instances[ids[chooser].back[0]!].zone).toBe("play");
      expect(done.committed.sides[opponent(chooser)].backRank.filter(Boolean)).toEqual(ids[opponent(chooser)].back);
      if (outcome.kind !== "applied") throw new Error("answer bounced");
      expect(outcome.published).toContainEqual({ kind: "abandoned", instance: chosen, side: chooser });
      expect(outcome.published).toContainEqual({ kind: "dissolved", instance: chosen, side: chooser });
      expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
      expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptOpened", side: chooser, role: "abandon", cardId: effect.id }));
      expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptAnswered", side: chooser, value: [chosen] }));
    }
  });

  it("chooses during resolution with no play-time targets and composes with choosePlayer", () => {
    const { fold, slice, ids } = opened(setup("player", selected.id));
    const playerChoice = fold.pending(slice)!.prompt;
    expect(playerChoice).toMatchObject({ kind: "chooseMode", cancellable: false, purpose: { role: "choosePlayer" } });
    const next = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: playerChoice.id, value: 1 }));
    expect(fold.pending(next)!.prompt).toMatchObject({ kind: "chooseCards", side: "enemy", candidates: ids.enemy.back, purpose: { role: "abandon" } });
    // The source already left the hand without a target choice in preparation.
    expect(fold.pending(next)!.display.instances[ids.player.hand[0]].zone).toBe("stack");
  });

  it("matches relative to the chooser while preserving source X and the source exclusion", () => {
    const { fold, slice, ids } = opened({ ...setup("player", priced.id), enemy: { back: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck } });
    const paidX = fold.pending(slice)!.prompt;
    const resolved = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: paidX.id, value: 2 }));
    expect(fold.pending(resolved)!.prompt).toMatchObject({ side: "enemy", candidates: ids.enemy.back.slice(0, 2) });
    const board = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [source.id, mage.id, mage.id, v.vanilla1.id], deck }, enemy: { back: [mage.id], deck } });
    const me = board.ids.player.back[0]!;
    const result = engine.apply(board.state, "player", { kind: "activate", source: me, ability: 0 }, new ScriptedSource([[board.ids.player.back[2]!]]));
    expect(result.state.instances[me].zone).toBe("play");
    expect(result.state.instances[board.ids.player.back[1]!].zone).toBe("play");
    expect(result.state.instances[board.ids.player.back[2]!].zone).toBe("void");
    expect(result.state.instances[board.ids.enemy.back[0]!].zone).toBe("play");
    const lone = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [source.id], deck }, enemy: { deck } });
    const self = lone.ids.player.back[0]!;
    const selfResult = engine.apply(lone.state, "player", { kind: "activate", source: self, ability: 1 }, new ScriptedSource([]));
    expect(selfResult.state.instances[self].zone).toBe("void");
  });

  it("does nothing for empty or unmatched eligibility without a prompt or false target failure, then continues", () => {
    for (const back of [[], [v.vanilla1.id, v.vanilla2.id]]) {
      const result = runScenario(engine, {
        board: { active: "player", phase: "day", player: { hand: [filtered.id], back, deck }, enemy: { back: [mage.id], deck } },
        steps: (ids) => [playFromHand(ids, "player")],
      });
      expect(result.answers).toEqual([]);
      expect(result.events.filter((e) => e.kind === "abandoned" || e.kind === "dissolved" || e.kind === "noLegalTarget")).toEqual([]);
      expect(result.state.sides.player.score).toBe(3);
      expect(result.state.sides.player.backRank.filter(Boolean)).toEqual(result.ids.player.back);
    }
  });

  it("abandons a borrowed Veil and untargetable character to its owner's void, firing both kinds of trigger for its controller", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { hand: [other.id], deck }, enemy: { back: [protectedCharacter.id, watcher.id], deck },
    });
    const chosen = ids.enemy.back[0]!;
    state.instances[chosen] = { ...state.instances[chosen], owner: "player" };
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([[chosen]]));
    expect(result.state.instances[chosen]).toMatchObject({ owner: "player", controller: "player", zone: "void" });
    expect(result.state.sides.player.void).toContain(chosen);
    expect(result.state.sides.enemy.score).toBe(3);
    expect(result.state.sides.player.score).toBe(0);
    expect(result.events).toContainEqual({ kind: "abandoned", instance: chosen, side: "enemy" });
    expect(result.events).toContainEqual({ kind: "dissolved", instance: chosen, side: "enemy" });
    expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("uses created and reclaimed replacements, preserving abandoned announcements and dissolved-trigger eligibility", () => {
    for (const created of [true, false]) {
      const { state, ids } = boardState(engine.catalog, {
        active: "player", phase: "day", player: { hand: [other.id], deck }, enemy: { back: [watcher.id, created ? null : protectedCharacter.id], deck },
      });
      const chosen = created
        ? placeFigment(state, "enemy", { rank: "back", index: 1 }, { kind: "figmentCopy", cardId: protectedCharacter.id, spark: null })
        : ids.enemy.back[1]!;
      if (!created) state.instances[chosen].status.reclaimed = true;
      const result = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([[chosen]]));
      expect(result.events).toContainEqual({ kind: "abandoned", instance: chosen, side: "enemy" });
      const kinds = result.events.filter((e) => "instance" in e && e.instance === chosen).map((e) => e.kind);
      if (created) {
        expect(result.state.instances[chosen]).toBeUndefined();
        expect(kinds).toEqual(["leftPlay", "abandoned", "dissolved", "ceasedToExist"]);
        expect(result.state.sides.enemy.score).toBe(3);
        const queued = result.events.findIndex((e) => e.kind === "triggerQueued" && e.source === chosen);
        expect(queued).toBeGreaterThan(-1);
        expect(queued).toBeLessThan(result.events.findIndex((e) => e.kind === "ceasedToExist" && e.instance === chosen));
      } else {
        expect(result.state.instances[chosen].zone).toBe("banished");
        expect(kinds).toEqual(["leftPlay", "banished", "abandoned"]);
        expect(result.state.sides.enemy.score).toBe(1);
      }
      expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });

  it("reconstructs its public prompt after reload, rejects invalid, stale, foreign and concurrent input, and accepts once", () => {
    const { slice, ids } = opened();
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const pending = fresh.pending(saved)!;
    expect(pending).toEqual(createFoldAdapter(engine).pending(slice));
    const hash = stateHash(saved.committed);
    const answer = (side: Side, value: readonly InstanceId[]) => fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("player", [ids.enemy.back[0]!])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const value of [[], ids.enemy.back.filter((id) => id !== null), [ids.enemy.back[0]!, ids.enemy.back[0]!], [ids.player.back[0]!], [ids.enemy.hand[0]], [ids.enemy.deck[0]]]) {
      expect(answer("enemy", value)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [ids.enemy.back[0]!] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(saved, { kind: "cancel", side: "enemy", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(saved.committed)).toBe(hash);
    const intent = { kind: "answer" as const, side: "enemy" as const, promptId: pending.prompt.id, value: [ids.enemy.back[1]!] };
    const done = applied(fresh.reduce(saved, intent));
    expect(done).toEqual(applied(createFoldAdapter(engine).reduce(slice, intent)));
    expect(fresh.pending(done)).toBeNull();
    expect(done.committed.sides.enemy.void).toEqual([ids.enemy.back[1]]);
    expect(fresh.reduce(done, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("rolls back an error after abandonment without partial committed movement, trigger awards, or event publication", () => {
    const { slice, ids } = opened({
      active: "player", phase: "day", player: { hand: [failing.id], deck }, enemy: { back: [protectedCharacter.id, watcher.id], deck },
    });
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const prompt = fresh.pending(saved)!.prompt;
    const outcome = fresh.reduce(saved, { kind: "answer", side: "enemy", promptId: prompt.id, value: [ids.enemy.back[0]!] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic failure");
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.inFlight).toBeNull();
    expect(outcome.slice.committed).toEqual(slice.committed);
    expect(outcome.slice.committed.sides.enemy.void).toEqual([]);
    expect(outcome.slice.committed.sides.enemy.score).toBe(0);
    expect(fresh.pending(outcome.slice)).toBeNull();
    expect(outcome.error.message).toContain("synthetic failure after abandonment");
  });
});
