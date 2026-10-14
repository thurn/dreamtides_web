/**
 * What each side sees of a battle: a view that shares nothing with its state,
 * hidden zones, snapshots, effects, triggers, figments, and public play
 * facts.
 */
import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import { eventVisibleTo, type EngineEvent } from "../events";
import { deserializeState, serializeState, stateHash } from "../state/hash";
import type { InstanceId, Side } from "../state/ids";
import { battleSeed, opponent, SIDES } from "../state/ids";
import type { BattleState, StackItem } from "../state/types";
import type { Variant } from "../dsl/types";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { boardState, cardIdOf, placeFigment } from "../testing/board";
import { ZONE, ZONE_FIGMENT } from "../testing/zone-cards";
import { fuzzInit, SYNTHETIC_FUZZ_POOL } from "../testing/fuzz";
import { AVATAR, DREAMSIGN } from "../testing/stack-cards";
import { hiddenFrom, strings } from "../testing/redaction";
import { cloneState } from "../state/clone";
import { view } from "./view";
import { testCardSubtype } from "../../types/test-identities";
import { catalog, v, fixture } from "./view.fixtures";
import { TRIGGER } from "../testing/trigger-cards";
import { passUntil } from "../testing/trigger-harness";
import { comparableView } from "../testing/determinization-fidelity";

/** Overwrites every array and object field reachable from `value`, innermost first. */
function vandalize(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) vandalize(entry);
    value.splice(0, value.length, "vandalized");
  } else if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      vandalize(record[key]);
      record[key] = "vandalized";
    }
    record.added = "vandalized";
  }
}

/** Instances whose identity `viewer` has not learned in the fixture: every deck and the opponent's hand. */
function unseen(state: BattleState, viewer: Side): InstanceId[] {
  return [...state.sides.player.deck, ...state.sides.enemy.deck, ...state.sides[opponent(viewer)].hand];
}

describe("view", () => {
  it("shares no object with its source state", () => {
    for (const viewer of SIDES) {
      const { state } = fixture();
      const before = serializeState(state);
      const hash = stateHash(state);
      vandalize(view(state, viewer, catalog));
      expect(serializeState(state)).toBe(before);
      expect(stateHash(state)).toBe(hash);
    }
  });

  it("shares no object with a modified variant of its source state", () => {
    for (const viewer of SIDES) {
      const { state, ids } = fixture();
      const front = ids.player.front[0];
      const instance = front === null ? undefined : state.instances[front];
      if (instance === undefined) throw new Error("fixture has an empty front");
      const variant: Variant = {
        amplified: true,
        transfigurations: ["Empowered", "Kindled"],
        deckMods: {
          sparkBonus: 1,
          costReduction: 1,
          fast: true,
          reclaim: 2,
          typeChange: { cardType: "character", subtype: testCardSubtype("Ancient") },
        },
      };
      state.instances[instance.id] = { ...instance, variant };
      const before = serializeState(state);
      const hash = stateHash(state);
      const seen = view(state, viewer, catalog);
      expect(seen.instances[instance.id]?.variant).toEqual(variant);
      vandalize(seen);
      expect(serializeState(state)).toBe(before);
      expect(stateHash(state)).toBe(hash);
    }
  });

  it("gives the engine's callers one view per committed state and side, equal to a fresh view", () => {
    const engine = createEngine(catalog);
    const { state } = fixture();
    const player = engine.view(state, "player");
    const enemy = engine.view(state, "enemy");
    expect(engine.view(state, "player")).toBe(player);
    expect(engine.view(state, "enemy")).toBe(enemy);
    expect(player).toEqual(view(state, "player", catalog));
    expect(enemy).toEqual(view(state, "enemy", catalog));
    const reloaded = deserializeState(serializeState(state));
    expect(engine.view(reloaded, "player")).not.toBe(player);
    expect(engine.view(reloaded, "player")).toEqual(player);
    // A state stepped in place to a new version is viewed afresh.
    reloaded.version += 1;
    reloaded.turn.turnNumber += 1;
    expect(engine.view(reloaded, "player")).toEqual(view(reloaded, "player", catalog));
    expect(engine.view(reloaded, "player").turn.turnNumber).toBe(player.turn.turnNumber + 1);
  });

  it("reveals neither the instance IDs nor the card IDs of cards in decks and the opponent's hand", () => {
    for (const viewer of SIDES) {
      const { state } = fixture();
      const seen = strings(view(state, viewer, catalog));
      expect(hiddenFrom(state, viewer).sort()).toEqual(unseen(state, viewer).sort());
      for (const id of unseen(state, viewer)) {
        expect(seen.has(id)).toBe(false);
        expect(seen.has(cardIdOf(state, id))).toBe(false);
      }
      expect(seen.has(state.seed)).toBe(false);
      expect(Object.keys(view(state, viewer, catalog))).not.toContain("seed");
      expect(Object.keys(view(state, viewer, catalog))).not.toContain("rng");
    }
  });

  it("reveals no hidden instance ID in a dealt battle", () => {
    const engine = createEngine(catalog);
    const { state } = engine.createBattle(fuzzInit(battleSeed("view-dealt"), SYNTHETIC_FUZZ_POOL), NO_PROMPTS);
    for (const viewer of SIDES) {
      const seen = strings(engine.view(state, viewer));
      const hidden = hiddenFrom(state, viewer);
      expect(hidden.length).toBeGreaterThan(0);
      expect(hidden.filter((id) => seen.has(id))).toEqual([]);
    }
  });

  it("counts hidden zones and lists the viewer's own hand, including a card the opponent owns", () => {
    const { state, ids, held } = fixture();
    const seen = view(state, "player", catalog);
    expect(seen.sides.player.hand).toEqual({ count: 3, known: [...ids.player.hand, held].map((id, index) => ({ id, index })) });
    expect(seen.instances[held]).toMatchObject({ owner: "enemy", controller: "player", zone: "hand" });
    expect(view(state, "enemy", catalog).instances[held]).toBeUndefined();
    expect(view(state, "enemy", catalog).sides.player.hand).toEqual({ count: 3, known: [] });
    expect(seen.sides.enemy.hand).toEqual({ count: 2, known: [] });
    expect(seen.sides.player.deck).toEqual({ count: 2, known: [] });
    expect(seen.sides.enemy.deck).toEqual({ count: 2, known: [] });
  });

  it("matches the state in public zones and the viewer's own hand", () => {
    for (const viewer of SIDES) {
      const { state } = fixture();
      const seen = view(state, viewer, catalog);
      const visible = Object.values(state.instances)
        .filter((instance) => instance.zone !== "deck" && (instance.zone !== "hand" || instance.controller === viewer))
        .map((instance) => instance.id);
      expect(Object.keys(seen.instances).sort()).toEqual([...visible].sort());
      for (const id of visible) {
        const { characteristics: _effective, reclaimCovered, ...instance } = seen.instances[id] ?? { characteristics: null, reclaimCovered: null };
        expect(reclaimCovered).toBe(false);
        expect(instance).toEqual(state.instances[id]);
      }
      for (const side of SIDES) {
        const source = state.sides[side];
        const sideView = seen.sides[side];
        expect(sideView.frontRank).toEqual(source.frontRank);
        expect(sideView.backRank).toEqual(source.backRank);
        expect(sideView.void).toEqual(source.void);
        expect(sideView.banished).toEqual(source.banished);
        expect(sideView.score).toBe(source.score);
        expect(sideView.currentEnergy).toBe(source.currentEnergy);
      }
      expect(seen.turn).toEqual(state.turn);
      expect(seen.config).toEqual(state.config);
      expect(seen.challenge).toEqual(state.challenge);
      expect(seen.result).toEqual(state.result);
      const stacked = (items: readonly StackItem[]) => items.map((item) => (item.kind === "card" ? item.instance : null));
      expect(stacked(seen.stack)).toEqual(stacked(state.stack));
      expect(seen.stack[1]).toEqual(state.stack[1]);
    }
  });

  it("shows each side's avatar and dreamsigns and the effects a side may pay to end, as snapshots", () => {
    const { state } = fixture();
    const enemyFront = state.sides.enemy.frontRank[0];
    for (const viewer of SIDES) {
      const seen = view(state, viewer, catalog);
      expect(seen.sides.player.avatar).toEqual({ id: AVATAR.drawer.id, exhausted: true });
      expect(seen.sides.enemy.avatar).toEqual({ id: AVATAR.rally.id, exhausted: false });
      expect(seen.sides.player.dreamsigns).toEqual([{ id: DREAMSIGN.points.id }]);
      expect(seen.sides.enemy.dreamsigns).toEqual([]);
      expect(seen.payable).toEqual([
        { id: "e1", controller: "player", payer: "enemy", cost: 2, source: { kind: "avatar", side: "player" }, affects: [enemyFront] },
      ]);
    }
    const seen = view(state, "player", catalog);
    state.sides.player.avatar = { id: AVATAR.drawer.id, exhausted: false };
    state.sides.player.dreamsigns.push({ id: DREAMSIGN.points.id });
    state.payable = [];
    expect(seen.sides.player.avatar?.exhausted).toBe(true);
    expect(seen.sides.player.dreamsigns).toHaveLength(1);
    expect(seen.payable).toHaveLength(1);
  });
  it("hides the source of an effect a side may pay to end when the viewer cannot see it", () => {
    const { state } = fixture();
    const enemyFront = state.sides.enemy.frontRank[0]!;
    const playerHand = state.sides.player.hand[0];
    state.payable = [{ id: "e1", payer: "enemy", cost: 2, source: playerHand, affects: [enemyFront] }];
    const enemy = view(state, "enemy", catalog);
    expect(enemy.payable).toEqual([{ id: "e1", controller: "player", payer: "enemy", cost: 2, source: null, affects: [enemyFront] }]);
    expect(strings(enemy).has(playerHand)).toBe(false);
    expect(view(state, "player", catalog).payable[0]?.source).toBe(playerHand);
  });

  it("keeps effect events from a card in a hidden zone private to the side holding it", () => {
    const { state } = fixture();
    const enemyFront = state.sides.enemy.frontRank[0]!;
    const playerHand = state.sides.player.hand[0];
    const origin = { kind: "card" as const, cardId: cardIdOf(state, playerHand), variant: { amplified: false } };
    const hiddenSource: EngineEvent[] = [
      { kind: "effectStarted", effect: "e5", controller: "player", source: playerHand, expiry: { at: "never" }, change: { kind: "trigger", ref: { origin, ability: 0, node: 0 }, once: true } },
      { kind: "payableEffectRegistered", effect: "e6", payer: "enemy", cost: 1, source: playerHand, affects: [enemyFront] },
    ];
    for (const event of hiddenSource) {
      expect(eventVisibleTo(event, "player", state)).toBe(true);
      expect(eventVisibleTo(event, "enemy", state)).toBe(false);
    }
    const avatar = { kind: "avatar" as const, side: "player" as const };
    const publicSource: EngineEvent[] = [
      { kind: "effectStarted", effect: "e7", controller: "player", source: avatar, expiry: { at: "endOfTurn" }, change: { kind: "spark", instance: enemyFront, amount: 1 } },
      { kind: "payableEffectRegistered", effect: "e8", payer: "enemy", cost: 1, source: avatar, affects: [enemyFront] },
    ];
    for (const event of publicSource) expect(eventVisibleTo(event, "enemy", state)).toBe(true);
  });

  it("shows floating effects and queued triggers, hiding cards the viewer cannot see", () => {
    const { state } = fixture();
    const enemyFront = state.sides.enemy.frontRank[0]!;
    const enemyHand = state.sides.enemy.hand[0];
    state.floating = [
      { id: "e2", controller: "player", source: { kind: "avatar", side: "player" }, timestamp: 1, expiry: { at: "endOfTurn" }, change: { kind: "spark", instance: enemyFront, amount: -1 } },
      { id: "e3", controller: "player", source: { kind: "avatar", side: "player" }, timestamp: 2, expiry: { at: "turnStart", side: "player" }, change: { kind: "spark", instance: enemyHand, amount: 2 } },
    ];
    const origin = { kind: "card" as const, cardId: v.event0.id, variant: { amplified: false } };
    state.triggerQueue = [{ source: enemyHand, controller: "enemy", origin, ability: 0, node: null, subject: enemyFront }];
    const player = view(state, "player", catalog);
    expect(player.floating.map((effect) => effect.id)).toEqual(["e2"]);
    expect(player.triggerQueue).toEqual([{ controller: "enemy", source: null, origin: null, ability: 0, node: null, subject: enemyFront }]);
    const enemy = view(state, "enemy", catalog);
    expect(enemy.floating.map((effect) => effect.id)).toEqual(["e2", "e3"]);
    expect(enemy.triggerQueue[0]?.source).toBe(enemyHand);
    expect(JSON.stringify(player)).not.toContain(v.event0.id);
  });

  it("hides a queued trigger's subject from a side that could not identify it as it triggered, even once it is public, across a reload", () => {
    const { state } = fixture();
    const enemyFront = state.sides.enemy.frontRank[0]!;
    const [discarded] = state.sides.enemy.hand;
    // The enemy drew `discarded` with a public trigger watching, then discarded it into its void.
    state.sides.enemy.hand = state.sides.enemy.hand.filter((id) => id !== discarded);
    state.sides.enemy.void.push(discarded);
    state.instances[discarded].zone = "void";
    const origin = { kind: "card" as const, cardId: cardIdOf(state, enemyFront), variant: { amplified: false } };
    state.triggerQueue = [
      { source: enemyFront, controller: "enemy", origin, ability: 0, node: null, subject: discarded, subjectHiddenFrom: ["player"] },
      { source: enemyFront, controller: "enemy", origin, ability: 0, node: null, subject: "i999" },
    ];
    const reloaded = deserializeState(serializeState(state));
    for (const shown of [state, reloaded]) {
      expect(view(shown, "player", catalog).triggerQueue.map((trigger) => trigger.subject)).toEqual([null, null]);
      expect(view(shown, "enemy", catalog).triggerQueue.map((trigger) => trigger.subject)).toEqual([discarded, null]);
      expect(view(shown, "player", catalog).triggerQueue[0]?.source).toBe(enemyFront);
    }
  });

  it("shows figments and figment copies by their printing with their effective characteristics, and keeps a card created in a hand private", () => {
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { back: [v.vanilla1.id], hand: [ZONE.handEcho.id], energy: 1 } });
    const figment = placeFigment(state, "player", { rank: "back", index: 1 }, { kind: "figment", figment: ZONE_FIGMENT.legion.id, spark: 1 });
    const copy = placeFigment(state, "player", { rank: "back", index: 2 }, { kind: "figmentCopy", cardId: v.vanilla3.id, spark: 0 });
    for (const viewer of SIDES) {
      const seen = view(state, viewer, catalog);
      expect(seen.instances[figment]).toMatchObject({ printing: { kind: "figment", figment: ZONE_FIGMENT.legion.id, spark: 1 }, characteristics: { subtype: "Warrior", spark: 3, cost: 0 } });
      expect(seen.instances[copy]).toMatchObject({ printing: { kind: "figmentCopy", cardId: v.vanilla3.id, spark: 0 }, characteristics: { spark: 0, cost: 3 } });
    }
    const engine = createEngine(catalog);
    const { state: after, events } = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([[ids.player.back[0]!]]));
    const created = events.find((event) => event.kind === "cardCreated");
    expect(created).toMatchObject({ zone: "hand", side: "player" });
    expect(created !== undefined && eventVisibleTo(created, "enemy", after)).toBe(false);
    expect(created !== undefined && eventVisibleTo(created, "player", after)).toBe(true);
  });
});

it("keeps public play facts without exposing hidden current printing or identity, including legacy unknown costs", () => {
  for (const viewer of SIDES) for (const storedCost of [undefined, 2]) {
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { deck: [v.vanilla2.id] }, enemy: { deck: [v.vanilla1.id] } });
    const historical = ids.player.deck[0];
    state.turnLog.played.player.push({ instance: historical, cardType: "character", subtype: testCardSubtype("Mage"), allTypes: true, ...(storedCost === undefined ? {} : { cost: storedCost }) });
    const seen = view(state, viewer, catalog);
    expect(seen.turnLog.played.player).toEqual([{ instance: null, cardType: "character", subtype: testCardSubtype("Mage"), allTypes: true, ...(storedCost === undefined ? {} : { cost: 2 }) }]);
    expect(strings(seen).has(historical)).toBe(false);
    const changed = cloneState(state);
    changed.instances[historical] = { ...changed.instances[historical], printing: { kind: "card", cardId: v.vanilla5.id } };
    expect(view(changed, viewer, catalog)).toEqual(seen);
    // Once this viewer identifies the current card, a legacy record can recover its immutable cost.
    changed.knownTo[viewer].push(historical);
    expect(view(changed, viewer, catalog).turnLog.played.player[0]).toMatchObject({ instance: historical, cost: storedCost ?? 5 });
  }
});

function playedHistory(active: Side, cardId = TRIGGER.materializedOrDawn.id) {
  const engine = createEngine(catalog);
  const board = boardState(catalog, { active, phase: "day",
    [active]: { hand: [cardId], deck: [v.vanilla1.id], energy: 10 },
    [opponent(active)]: { deck: [v.vanilla2.id] } });
  const owned = (side: Side) => Object.values(board.state.instances).flatMap((card) =>
    card.owner === side && card.printing.kind === "card" ? [{ cardId: card.printing.cardId, ...card.variant }] : []);
  const decks = { player: owned("player"), enemy: owned("enemy") };
  const played = engine.apply(board.state, active, { kind: "play", card: board.ids[active].hand[0], from: "hand" }, NO_PROMPTS);
  const resolved = passUntil(engine, played.state, (state) => state.stack.length === 0);
  return { engine, state: resolved.state, decks, events: [...played.events, ...resolved.events] };
}

for (const active of SIDES) describe(`named-trigger history ownership for ${active}`, () => {
  it("keeps returned named-trigger arrays separate from source and independent observers", () => {
    for (const viewer of SIDES) {
      const { engine, state, events } = playedHistory(active);
      const before = serializeState(state), hash = stateHash(state);
      const seen = engine.view(state, viewer), other = engine.view(state, opponent(viewer));
      const independent = engine.view(deserializeState(before), viewer);
      const otherBefore = JSON.stringify(other), independentBefore = JSON.stringify(independent);
      const names = seen.turnLog.played[active][0].namedTriggers;
      if (names === undefined) throw new Error("The public named-trigger history is absent");
      expect(events).toContainEqual(expect.objectContaining({ kind: "cardPlayed", side: active }));
      expect(events).toContainEqual(expect.objectContaining({ kind: "materialized", side: active }));
      expect(names).toEqual(["materialized", "dawn"]);
      expect(names).not.toBe(state.turnLog.played[active][0].namedTriggers);
      expect(names).not.toBe(other.turnLog.played[active][0].namedTriggers);
      expect(names).not.toBe(independent.turnLog.played[active][0].namedTriggers);
      Reflect.set(names, "length", 0);
      expect(serializeState(state)).toBe(before);
      expect(stateHash(state)).toBe(hash);
      expect(JSON.stringify(other)).toBe(otherBefore);
      expect(JSON.stringify(independent)).toBe(independentBefore);
    }
  });

  it("keeps direct and JSON sampled named-trigger arrays separate from their input views", () => {
    for (const viewer of SIDES) for (const json of [false, true]) {
      const { engine, state, decks } = playedHistory(active);
      const before = serializeState(state), hash = stateHash(state);
      const seen = engine.view(state, viewer), other = engine.view(state, opponent(viewer));
      const independent = engine.view(deserializeState(before), viewer);
      const input = json ? JSON.parse(JSON.stringify(seen)) as typeof seen : seen;
      const inputBefore = JSON.stringify(input), otherBefore = JSON.stringify(other), independentBefore = JSON.stringify(independent);
      const restored = engine.determinize(input, decks, () => 0.4);
      const restoredView = engine.view(restored, viewer);
      expect(comparableView(restoredView)).toEqual(comparableView(seen));
      expect(comparableView(engine.view(engine.determinize(restoredView, decks, () => 0.4), viewer))).toEqual(comparableView(seen));
      const names = restored.turnLog.played[active][0].namedTriggers;
      if (names === undefined) throw new Error("The sampled named-trigger history is absent");
      expect(names).toEqual(["materialized", "dawn"]);
      expect(names).not.toBe(input.turnLog.played[active][0].namedTriggers);
      Reflect.set(names, "length", 0);
      expect(JSON.stringify(input)).toBe(inputBefore);
      expect(serializeState(state)).toBe(before);
      expect(stateHash(state)).toBe(hash);
      expect(JSON.stringify(other)).toBe(otherBefore);
      expect(JSON.stringify(independent)).toBe(independentBefore);
    }
  });

  it("preserves absent legacy named triggers and present empty named-trigger arrays", () => {
    for (const viewer of SIDES) for (const cardId of [TRIGGER.materializedOrDawn.id, v.vanilla2.id]) {
      const { engine, state, decks } = playedHistory(active, cardId);
      const before = serializeState(state);
      const seen = engine.view(state, viewer);
      const expected = cardId === v.vanilla2.id ? [] : ["materialized", "dawn"];
      expect(seen.turnLog.played[active][0].namedTriggers).toEqual(expected);
      const transported = JSON.parse(JSON.stringify(seen)) as typeof seen;
      const restored = engine.determinize(transported, decks, () => 0.4);
      expect(comparableView(engine.view(restored, viewer))).toEqual(comparableView(seen));
      expect(restored.turnLog.played[active][0].namedTriggers).toEqual(expected);
      expect(Object.prototype.hasOwnProperty.call(restored.turnLog.played[active][0], "namedTriggers")).toBe(true);
      const legacy = { ...transported, turnLog: { ...transported.turnLog, played: { ...transported.turnLog.played,
        [active]: transported.turnLog.played[active].map(({ namedTriggers: _names, ...old }) => old) } } };
      const sampledLegacy = engine.determinize(legacy, decks, () => 0.4);
      const legacyView = engine.view(sampledLegacy, viewer);
      expect(Object.prototype.hasOwnProperty.call(legacyView.turnLog.played[active][0], "namedTriggers")).toBe(false);
      expect(comparableView(legacyView)).toEqual(comparableView(legacy));
      expect(serializeState(state)).toBe(before);
    }
  });
});
