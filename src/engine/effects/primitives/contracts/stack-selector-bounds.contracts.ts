import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { NO_DECK_MODS } from "../../../dsl/types";
import { energy, energyX, event, keyword, stackItem, all, anyCharacter, staticAbility } from "../../../dsl/builders";
import { matchingStackItems } from "../../../dsl/selectors";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { promptFingerprint } from "../../../prompts/fingerprint";
import { stateHash } from "../../../state/hash";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { sparkModifier } from "../spark-modifier";
import { prevent } from "../prevent";

const bounded: EngineCardDefinition = {
  ...v.interruptEvent, id: syntheticId(0x9700), status: "authored",
  abilities: (variant) => [event(prevent(stackItem({ costAtMost: variant.amplified ? 3 : 2 })))],
};
const sparkBounded: EngineCardDefinition = {
  ...bounded, id: syntheticId(0x9701),
  abilities: (variant) => [event(prevent(stackItem({ cardType: "character", sparkAtMost: variant.amplified ? 3 : 2 })))],
};
const variable: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(0x9702), costs: [energy(2), energyX()],
};
const immune: EngineCardDefinition = {
  ...v.vanilla2, id: syntheticId(0x9703), status: "authored", abilities: () => [keyword("cannotBePrevented")],
};
const anthem: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x9704), status: "authored", abilities: () => [staticAbility(sparkModifier(all(anyCharacter()), 5))] };
const engine = createEngine(testCatalog([bounded, sparkBounded, variable, immune, anthem]));
const deck = [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id];
function put(state: BattleState, id: InstanceId, side: Side, targets: InstanceId[] = []) {
  state.sides[side].hand = state.sides[side].hand.filter((card) => card !== id);
  state.instances[id].zone = "stack";
  state.stack.push({ kind: "card", instance: id, controller: side, choices: [{ modes: [], targets: [targets] }], x: 7, optionalPaid: [] });
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected applied intent");
  return outcome.slice;
}

describe("stack selector bounds", () => {
  it.each(["player", "enemy"] as const)("%s preserves inclusive bounds, controller/type conjunctions and source exclusion", (side) => {
    const other = opponent(side);
    const start = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [v.event1.id], deck }, [other]: { hand: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck } });
    const own = start.ids[side].hand[0];
    put(start.state, own, side);
    for (const id of start.ids[other].hand) put(start.state, id, other);
    const [low, equal, high] = start.ids[other].hand;
    const match = (selector: ReturnType<typeof stackItem>, source: InstanceId = "i999") => matchingStackItems(start.state, engine.catalog, selector, side, source);
    expect(match(stackItem({ costAtMost: 2 }))).toEqual([equal, low, own]);
    expect(match(stackItem({ sparkAtMost: 2 }))).toEqual([equal, low]);
    expect(match(stackItem({ costAtMost: 3, sparkAtMost: 2, controller: "opponent", cardType: "character" }))).toEqual([equal, low]);
    expect(match(stackItem({ costAtMost: 2 }), equal)).toEqual([low, own]);
    expect(match(stackItem({ sparkAtMost: 3, controller: "you" }))).toEqual([]);
    expect(match(stackItem())).toEqual([high, equal, low, own]);
  });

  it("reads copiable cost with X zero and deck changes, not paid X, and admits stack copies but excludes abilities and immunity", () => {
    const start = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [variable.id, { cardId: v.vanilla3.id, deckMods: { ...NO_DECK_MODS, costReduction: 1 } }, immune.id], deck }, enemy: { deck } });
    for (const id of start.ids.player.hand) put(start.state, id, "player");
    const [x, reduced, blocked] = start.ids.player.hand;
    start.state.instances[x].status.created = true;
    start.state.stack.push({ kind: "ability", source: x, ability: 0, origin: { kind: "card", cardId: variable.id, variant: { amplified: false } }, controller: "player", choices: { modes: [], targets: [] }, x: null, optionalPaid: [] });
    const selector = { ...stackItem({ costAtMost: 2 }), preventable: true };
    expect(matchingStackItems(start.state, engine.catalog, selector, "player", "i999")).toEqual([reduced, x]);
    expect(matchingStackItems(start.state, engine.catalog, stackItem({ costAtMost: 2 }), "player", "i999")).toContain(blocked);
  });

  it("includes gained spark outside play, rejects null event spark, and clamps negative gains at zero", () => {
    const start = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [v.vanilla1.id, v.vanilla2.id, v.event0.id], deck }, enemy: { deck } });
    for (const id of start.ids.player.hand) put(start.state, id, "player");
    const [grown, zero] = start.ids.player.hand;
    start.state.instances[grown].status.gainedSpark = 2;
    start.state.instances[zero].status.gainedSpark = -3;
    expect(matchingStackItems(start.state, engine.catalog, stackItem({ sparkAtMost: 2 }), "player", "i999")).toEqual([zero]);
    expect(matchingStackItems(start.state, engine.catalog, stackItem({ sparkAtMost: 3 }), "player", "i999")).toEqual([zero, grown]);
  });

  it("keeps payment taxes out of cost caps and includes temporary and deck spark without in-play anthems", () => {
    const start = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [anthem.id], hand: [v.vanilla2.id, v.vanilla1.id, { cardId: v.vanilla1.id, deckMods: { ...NO_DECK_MODS, sparkBonus: 2 } }], deck }, enemy: { deck } });
    for (const id of start.ids.player.hand) put(start.state, id, "player");
    const [taxed, temporary, modified] = start.ids.player.hand;
    start.state.floating.push(
      { id: "e1", controller: "player", source: start.ids.player.back[0]!, timestamp: 1, expiry: { at: "endOfTurn" }, change: { kind: "cost", player: "player", filter: {}, amount: 5, next: false } },
      { id: "e2", controller: "player", source: start.ids.player.back[0]!, timestamp: 2, expiry: { at: "endOfTurn" }, change: { kind: "spark", instance: temporary, amount: 2 } },
    );
    start.state.nextEffect = 3;
    expect(matchingStackItems(start.state, engine.catalog, stackItem({ costAtMost: 2 }), "player", "i999")).toEqual([modified, temporary, taxed]);
    expect(matchingStackItems(start.state, engine.catalog, stackItem({ sparkAtMost: 2 }), "player", "i999")).toEqual([taxed]);
    expect(matchingStackItems(start.state, engine.catalog, stackItem({ sparkAtMost: 3 }), "player", "i999")).toEqual([modified, temporary, taxed]);
  });

  it.each([false, true])("actual Prevent resolves only within its selected %s amplified cap", (amplified) => {
    const start = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [v.vanilla3.id], energy: 4, deck }, enemy: { hand: [{ cardId: bounded.id, amplified }], energy: 3, deck } });
    const target = start.ids.player.hand[0];
    const first = engine.apply(start.state, "player", { kind: "play", card: target, from: "hand" }, NO_PROMPTS);
    if (!amplified) {
      expect(engine.legalActions(first.state, "enemy")).not.toContainEqual({ kind: "play", card: start.ids.enemy.hand[0], from: "hand" });
      expect(first.state.instances[target].zone).toBe("play");
      return;
    }
    const second = engine.apply(first.state, "enemy", { kind: "play", card: start.ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
    expect(second.events).toContainEqual({ kind: "prevented", instance: target, side: "player", to: "void", zoneOf: "player" });
    expect(invariantViolations(second.state, engine.catalog)).toEqual([]);
  });

  it("rechecks a selected target's live spark and stack presence without partial prevention", () => {
    for (const invalid of ["spark", "gone"] as const) {
      const start = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [v.vanilla2.id], deck }, enemy: { hand: [sparkBounded.id], deck } });
      const target = start.ids.player.hand[0];
      const source = start.ids.enemy.hand[0];
      put(start.state, target, "player");
      put(start.state, source, "enemy", [target]);
      if (invalid === "spark") start.state.instances[target].status.gainedSpark = 1;
      else {
        start.state.stack = start.state.stack.filter((item) => item.kind !== "card" || item.instance !== target);
        start.state.instances[target].zone = "void";
        start.state.sides.player.void.push(target);
      }
      start.state.priority = "player";
      const done = engine.apply(start.state, "player", { kind: "pass" }, NO_PROMPTS);
      expect(done.events).toContainEqual({ kind: "noLegalTarget", source });
      expect(done.events.some((event) => event.kind === "prevented")).toBe(false);
      expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
    }
  });

  it("reloads a multi-target preparation, rejects an invalid answer atomically, and cancels before payment", () => {
    const start = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [v.event1.id, v.vanilla2.id], deck }, enemy: { hand: [bounded.id], energy: 3, deck } });
    for (const id of start.ids.player.hand) put(start.state, id, "player");
    start.state.priority = "enemy";
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const initial: BattleSlice = { committed: start.state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const preparing = applied(fold.reduce(initial, { kind: "battleAction", side: "enemy", action: { kind: "play", card: start.ids.enemy.hand[0], from: "hand" } }));
    const reload = JSON.parse(JSON.stringify(preparing)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const pending = fresh.pending(reload)!;
    expect(promptFingerprint(pending.prompt)).toBe(promptFingerprint(fold.pending(preparing)!.prompt));
    const before = stateHash(reload.committed);
    expect(fresh.reduce(reload, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: ["i999"] }).kind).toBe("bounced");
    expect(stateHash(reload.committed)).toBe(before);
    const cancelled = applied(fresh.reduce(reload, { kind: "cancel", side: "enemy", promptId: pending.prompt.id }));
    expect(cancelled.committed.sides.enemy.currentEnergy).toBe(3);
    expect(cancelled.committed.sides.enemy.hand).toEqual(start.ids.enemy.hand);
  });
});
