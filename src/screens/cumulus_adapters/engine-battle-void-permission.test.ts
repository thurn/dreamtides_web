// The battle screen model of play permissions: the void plays a permission
// offers, the void chooser's options for them, and the statuses a floating
// permission shows.
import { describe, expect, it, vi } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { createEngine, type BattleState, type InstanceId } from "../../engine";
import { boardState } from "../../engine/testing/board";
import { LAB } from "../../engine/testing/prompt-lab";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { zoneCatalog } from "../../engine/testing/zone-cards";
import { parseBattleCardId, parseBattleId } from "../../types/identifiers";
import { engineAbilityOptionLabel, engineBattleLogText, engineStatusLabel, type EngineStatusCopy } from "../../runtime/battle-prompt-messages";
import { buildEngineBattleScreenModel, enginePrintedKeywords, withChooser } from "./engine-battle-view-model";
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

    const options = surfaceChoices(withChooser(model, { kind: "void" }, cards, () => null, engine.catalog).prompt.surface)?.options ?? [];
    const instance = engine.view(state, "player").instances[character];
    expect(options[0]).toEqual({
      label: engineAbilityOptionLabel({ kind: "playFromVoid", name: cards(instance).displaySnapshot.name }),
      select: { kind: "action", action: { kind: "play", card: character, from: "void" } },
    });
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
