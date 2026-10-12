// The battle screen model of play permissions: the void plays a permission
// offers, the void chooser's options for them, and the statuses a floating
// or static permission shows.
import { describe, expect, it, vi } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { createEngine, type BattleState, type InstanceId } from "../../engine";
import { boardState } from "../../engine/testing/board";
import { LAB } from "../../engine/testing/prompt-lab";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { zoneCatalog } from "../../engine/testing/zone-cards";
import { parseBattleCardId, parseBattleId } from "../../types/identifiers";
import { engineAbilityOptionLabel, engineBattleLogText, engineStatusLabel, type EngineStatusCopy } from "../../runtime/battle-prompt-messages";
import { buildEngineBattleScreenModel, enginePrintedKeywords, engineStatuses, withChooser } from "./engine-battle-view-model";
import { energy, staticAbility } from "../../engine/dsl/builders";
import { playFromZone } from "../../engine/effects/primitives/play-from-zone";
import { CHOSEN_SUBTYPE } from "../../engine/effects/primitives/choose-subtype";
import { cloneState } from "../../engine/state/clone";
import { revealToBoth } from "../../engine/view/knowledge";
import { syntheticId } from "../../engine/testing/synthetic-cards";
import { surfaceChoices } from "./prompt-host-view-model";
import type { FloatingEffect } from "../../engine/state/types";
import type { CardFilter } from "../../engine/dsl/types";
import { testCardSubtype } from "../../types/test-identities";
import * as copy from "../../runtime/battle-prompt-messages";

const engine = createEngine(zoneCatalog(Object.values(LAB)));
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
const cards = createEngineCardModels({ definitions: [], cards: new Map(), figment: () => undefined });

function screenOf(state: BattleState) {
  return buildEngineBattleScreenModel({
    battleId: parseBattleId("battle-engine-fixture"),
    human: "player",
    view: engine.view(state, "player"),
    legal: engine.legalActions(state, "player"),
    prompt: null,
    playing: null,
    decision: engine.decision(state),
    presented: true,
    notice: null,
    cards,
    catalog: engine.catalog,
    printedKeywords: enginePrintedKeywords(engine.catalog),
    avatars: { player: { avatar: null }, enemy: { avatar: null } },
    opponentName: "Fixture Opponent",
    essenceReward: 100,
    resultDismissed: false,
  });
}

const id = (instance: InstanceId | null | undefined) => parseBattleCardId(instance!);

describe("play permissions on the battle screen", () => {
  it("rings the void cards a static permission covers and offers each as a void play", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { back: [LAB.voidPermit.id], void: [SYNTHETIC.vanilla1.id, SYNTHETIC.event1.id], energy: 2, deck },
      enemy: { void: [SYNTHETIC.vanilla1.id], deck },
    });
    const [character, spell] = ids.player.void;
    const model = screenOf(state);
    expect([...model.affordances.voidPlays.keys()]).toEqual([id(character)]);
    const ringed = (side: "player" | "enemy") => model.view[side].voidCards.filter((card) => card.showPlayableOutline).map((card) => card.id);
    expect(ringed("player")).toEqual([id(character)]);
    expect(ringed("enemy")).toEqual([]);
    expect(ringed("player")).not.toContain(id(spell));
    expect(model.view.player.status.statuses).toHaveLength(1);
    expect(model.view.enemy.status.statuses).toBeUndefined();

    const options = surfaceChoices(withChooser(model, { kind: "void" }, cards, () => null, engine.catalog).prompt.surface)?.options ?? [];
    const instance = engine.view(state, "player").instances[character];
    expect(options[0]).toEqual({
      label: engineAbilityOptionLabel({ kind: "playFromVoid", name: cards(instance).displaySnapshot.name }),
      select: { kind: "action", action: { kind: "play", card: character, from: "void" } },
    });
  });

  it.each([
    { subtype: testCardSubtype("Fixture Warrior") },
    { cardType: "character", costAtMost: 2 },
    { cardType: "character", costAtLeast: 0, costAtMost: 0 },
    { cardType: "event", costAtLeast: 4 },
  ] satisfies readonly CardFilter[])("passes the complete live static filter to existing status copy: %j", (filter) => {
    const source = {
      id: syntheticId(0x3931), cardType: "character" as const, costs: [energy(4)], spark: 3,
      subtype: testCardSubtype("Fixture Ancient"), speed: "standard" as const, status: "authored" as const,
      abilities: () => [staticAbility(playFromZone("void", filter))],
    };
    const local = createEngine(zoneCatalog([source]));
    const { state } = boardState(local.catalog, { active: "player", phase: "day", player: { back: [source.id], deck } });
    const statusCopy = vi.spyOn(copy, "engineStatusLabel");
    try {
      const badges = engineStatuses(local.view(state, "player"), "player", () => []);
      expect(statusCopy.mock.calls.filter(([status]) => status.kind === "playFrom").map(([status]) => status)).toEqual([
        { kind: "playFrom", named: false, filter, next: false, expiry: { at: "never" } },
      ]);
      expect(badges.sides.player).toHaveLength(1);
      expect(badges.sides.enemy).toEqual([]);
      expect(badges.cards.size).toBe(0);
      const older = { ...local.view(state, "player"), staticPlayPermissions: undefined };
      expect(engineStatuses(older, "player", () => []).sides.player).toEqual([]);
    } finally {
      statusCopy.mockRestore();
    }
  });

  it("badges an identifiable hand-source permission while withholding it from an uninformed viewer", () => {
    const sourceCard = {
      id: syntheticId(0x4470), cardType: "character" as const, costs: [energy(4)], spark: 3,
      subtype: testCardSubtype("Fixture Ancient"), speed: "standard" as const, status: "authored" as const,
      abilities: () => [staticAbility(playFromZone("void", { cardType: "character", costAtMost: 0 }), { zone: "hand" })],
    };
    const local = createEngine(zoneCatalog([sourceCard]));
    const { state, ids } = boardState(local.catalog, { active: "enemy", phase: "day", enemy: { hand: [sourceCard.id], deck } });
    const statuses = (next: BattleState, viewer: "player" | "enemy") => engineStatuses(local.view(next, viewer), viewer, () => []).sides;
    expect(statuses(state, "player")).toEqual({ player: [], enemy: [] });
    expect(statuses(state, "enemy").enemy).toHaveLength(1);
    const known = cloneState(state);
    known.version += 1;
    revealToBoth(known, [ids.enemy.hand[0]]);
    expect(statuses(known, "player").enemy).toHaveLength(1);
    expect(statuses(known, "player").player).toEqual([]);
  });

  it("keeps named hidden floating permissions private and visible floating badges single", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { back: [LAB.voidPermit.id], void: [SYNTHETIC.vanilla1.id], deck },
      enemy: { hand: [SYNTHETIC.vanilla2.id], deck },
    });
    const source = ids.player.back[0]!;
    for (const [index, instance] of [ids.player.void[0], ids.enemy.hand[0]].entries()) {
      state.floating.push({ id: `e${903 + index}`, controller: "player", source, timestamp: 1, expiry: { at: "endOfTurn" },
        change: { kind: "playFrom", player: "player", zone: "void", instance, filter: {}, next: false } });
    }
    const seen = engine.view(state, "player");
    expect(seen.floating).toHaveLength(1);
    expect(JSON.stringify(seen)).not.toContain(`"${ids.enemy.hand[0]}"`);
    const badges = engineStatuses(seen, "player", () => []);
    expect(badges.sides.player).toHaveLength(1);
    expect(badges.cards.get(ids.player.void[0])).toHaveLength(1);
    expect(badges.cards.has(ids.enemy.hand[0])).toBe(false);
  });

  it("updates side badges with the live source condition, controller and lifetime", () => {
    const sourceCard = {
      id: syntheticId(0x3932), cardType: "character" as const, costs: [energy(4)], spark: 3,
      subtype: testCardSubtype("Fixture Ancient"), speed: "standard" as const, status: "authored" as const,
      abilities: () => [staticAbility(playFromZone("void", { subtype: CHOSEN_SUBTYPE }))],
    };
    const local = createEngine(zoneCatalog([sourceCard]));
    const { state, ids } = boardState(local.catalog, { active: "player", phase: "day", player: { back: [sourceCard.id], deck } });
    const statuses = (next: BattleState) => engineStatuses(local.view(next, "player"), "player", () => []).sides;
    expect(statuses(state)).toEqual({ player: [], enemy: [] });
    const source = ids.player.back[0]!;
    const active = cloneState(state);
    active.version += 1;
    active.floating.push({ id: "e905", controller: "player", source, timestamp: 1, expiry: { at: "sourceLeavesPlay", source },
      change: { kind: "subtype", instance: source, subtype: testCardSubtype("Fixture Chosen") } });
    expect(statuses(active).player).toHaveLength(1);
    const taken = cloneState(active);
    taken.version += 1;
    taken.instances[source] = { ...taken.instances[source], controller: "enemy" };
    taken.sides.player.backRank[0] = null;
    taken.sides.enemy.backRank[0] = source;
    expect(statuses(taken).player).toEqual([]);
    expect(statuses(taken).enemy).toHaveLength(1);
    const departed = cloneState(taken);
    departed.version += 1;
    departed.instances[source] = { ...departed.instances[source], zone: "void" };
    departed.sides.enemy.backRank[0] = null;
    departed.sides.player.void.push(source);
    expect(statuses(departed)).toEqual({ player: [], enemy: [] });
  });

  it("badges a floating permission on the card it names, or on its player's side, and logs it as it starts", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { back: [SYNTHETIC.vanilla1.id], void: [SYNTHETIC.vanilla2.id], energy: 2, deck },
      enemy: { deck },
    });
    const [source] = ids.player.back;
    const [named] = ids.player.void;
    const effect = (index: number, change: FloatingEffect["change"], expiry: FloatingEffect["expiry"]): FloatingEffect => ({
      id: `e${900 + index}`,
      controller: "player",
      source: source!,
      timestamp: 0,
      expiry,
      change,
    });
    const turn = effect(1, { kind: "playFrom", player: "player", zone: "void", instance: named, filter: {}, next: false }, { at: "endOfTurn" });
    const once = effect(2, { kind: "playFrom", player: "player", zone: "void", instance: null, filter: { cardType: "event" }, next: true }, { at: "never" });
    state.floating.push(turn, once);
    const model = screenOf(state);
    const namedStatus: EngineStatusCopy = { kind: "playFrom", named: true, filter: {}, next: false, expiry: turn.expiry };
    const sideStatus: EngineStatusCopy = { kind: "playFrom", named: false, filter: { cardType: "event" }, next: true, expiry: once.expiry };
    expect(model.view.player.voidCards.find((card) => card.id === id(named))?.statuses).toEqual([
      { kind: "duration", label: engineStatusLabel(namedStatus, "player") },
    ]);
    expect(model.view.player.status.statuses).toEqual([{ kind: "duration", label: engineStatusLabel(sideStatus, "player") }]);
    expect(model.view.enemy.status.statuses).toBeUndefined();
    expect(engineStatusLabel(namedStatus, "player")).not.toBe(engineStatusLabel(sideStatus, "player"));
    const log = (effect: FloatingEffect, human: "player" | "enemy") =>
      engineBattleLogText(
        { kind: "effectStarted", effect: effect.id, controller: effect.controller, source: source!, expiry: effect.expiry, change: effect.change },
        { human, card: () => null, dreamwell: () => null },
      );
    expect(log(turn, "player")).toContain(engineStatusLabel(namedStatus, "player"));
    // A permission naming no card is logged from the reader's side.
    expect(log(once, "player")).toBeTruthy();
    expect(log(once, "player")).not.toBe(log(once, "enemy"));
  });

  it.each([
    { filter: { subtype: testCardSubtype("Fixture Warrior") }, named: false, next: false },
    { filter: { cardType: "character", costAtMost: 2 }, named: false, next: false },
    { filter: { cardType: "character", costAtMost: 0 }, named: false, next: true },
    { filter: { cardType: "event", costAtLeast: 4 }, named: false, next: true },
    { filter: { costAtLeast: 2, costAtMost: 2 }, named: true, next: false },
    { filter: { cardType: "character", subtype: testCardSubtype("Fixture Warrior"), costAtLeast: 1, costAtMost: 3 }, named: true, next: true },
    { filter: {}, named: true, next: false },
  ] satisfies readonly { filter: CardFilter; named: boolean; next: boolean }[])("carries the exact permission filter into its status copy: %j", ({ filter, named, next }) => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { back: [SYNTHETIC.vanilla1.id], void: [SYNTHETIC.vanilla2.id], energy: 2, deck },
      enemy: { deck },
    });
    const source = ids.player.back[0]!;
    const expiry: FloatingEffect["expiry"] = next ? { at: "never" } : { at: "endOfTurn" };
    state.floating.push({
      id: "e901", controller: "player", source, timestamp: 0, expiry,
      change: { kind: "playFrom", player: "player", zone: "void", instance: named ? ids.player.void[0] : null, filter, next },
    });
    const statusCopy = vi.spyOn(copy, "engineStatusLabel");
    try {
      screenOf(state);
      const input = statusCopy.mock.calls.find(([status]) => status.kind === "playFrom")?.[0];
      expect(input).toMatchObject({ kind: "playFrom", named, filter, next, expiry });
    } finally {
      statusCopy.mockRestore();
    }
  });

});
