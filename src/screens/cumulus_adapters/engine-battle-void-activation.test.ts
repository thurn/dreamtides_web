// The battle screen model of activated abilities that work from the void:
// the ringed void pile, the void browser tiles that act, and the card
// chooser a void card opens.
import { describe, expect, it } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { createEngine, type BattleState, type InstanceId } from "../../engine";
import { boardState } from "../../engine/testing/board";
import { LAB } from "../../engine/testing/prompt-lab";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { zoneCatalog } from "../../engine/testing/zone-cards";
import { parseBattleCardId, parseBattleId } from "../../types/identifiers";
import { buildEngineBattleScreenModel, enginePrintedKeywords, voidBrowserCards, voidCardActions, withChooser } from "./engine-battle-view-model";
import { surfaceChoices } from "./prompt-host-view-model";

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
const activate = (source: InstanceId | undefined) => ({ kind: "activate" as const, source: source!, ability: 0 });

describe("void activations on the battle screen", () => {
  it("rings only the human's void cards with a legal activation, and only those browser tiles take presses", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { back: [SYNTHETIC.vanilla1.id], void: [SYNTHETIC.vanilla2.id, LAB.voidRevenant.id, LAB.voidReaper.id], energy: 1, deck },
      enemy: { back: [SYNTHETIC.vanilla1.id], void: [LAB.voidRevenant.id], deck },
    });
    const [vanilla, revenant, reaper] = ids.player.void;
    const model = screenOf(state);
    // The Reaper needs 2●: only the Revenant is activatable.
    expect([...model.affordances.activations.keys()]).toEqual([id(revenant)]);
    expect(voidCardActions(model.affordances, id(revenant))).toEqual([activate(revenant)]);
    expect(voidCardActions(model.affordances, id(reaper))).toEqual([]);
    const ringed = (side: "player" | "enemy") => model.view[side].voidCards.filter((card) => card.showPlayableOutline).map((card) => card.id);
    expect(ringed("player")).toEqual([id(revenant)]);
    expect(ringed("enemy")).toEqual([]);
    const tiles = voidBrowserCards(model.view.player).map((card) => [card.entryId, card.selection ?? null, card.pressable ?? true]);
    expect(tiles).toEqual([[id(vanilla), null, false], [id(revenant), "playable", true], [id(reaper), null, false]]);
  });

  it("opens a void card's chooser on its play from the void, then its abilities", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { back: [LAB.voidPermit.id, SYNTHETIC.vanilla1.id], void: [LAB.voidRevenant.id], energy: 3, deck },
      enemy: { deck },
    });
    const [revenant] = ids.player.void;
    const model = screenOf(state);
    const play = { kind: "play" as const, card: revenant, from: "void" as const };
    expect(voidCardActions(model.affordances, id(revenant))).toEqual([play, activate(revenant)]);
    const options = surfaceChoices(withChooser(model, { kind: "card", id: id(revenant) }, cards, () => null, engine.catalog).prompt.surface)?.options ?? [];
    expect(options.map((option) => option.select)).toEqual([
      { kind: "action", action: play },
      { kind: "action", action: activate(revenant) },
      { kind: "close" },
    ]);
  });
});
