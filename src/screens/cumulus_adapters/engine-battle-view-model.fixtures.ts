// Shared fixtures for the battle screen model tests: an engine over the
// loop, zone, and prompt-lab cards, synthetic boards on it, and the human's
// screen model of a committed state or a prompt-lab fixture's battle.
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { createEngine, type BattleState, type InstanceId } from "../../engine";
import { createFoldAdapter, type BattleSlice } from "../../engine/fold/slice";
import { boardState, type BoardSetup } from "../../engine/testing/board";
import { LOOP_CARDS } from "../../engine/testing/loop-cards";
import { LAB, promptLabBattle, promptLabFixture } from "../../engine/testing/prompt-lab";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { zoneCatalog } from "../../engine/testing/zone-cards";
import { parseBattleCardId, parseBattleId } from "../../types/identifiers";
import {
  buildEngineBattleScreenModel,
  enginePrintedKeywords,
  type EngineBattleScreenModel,
} from "./engine-battle-view-model";
import { surfaceChoices, type PendingEnginePrompt } from "./prompt-host-view-model";

export const engine = createEngine(zoneCatalog([...LOOP_CARDS, ...Object.values(LAB)]));
export const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
export const cards = createEngineCardModels({ definitions: [], cards: new Map(), figment: () => undefined });
export const adapter = createFoldAdapter(engine);

export function board(setup: Partial<BoardSetup>) {
  return boardState(engine.catalog, {
    active: "player",
    phase: "day",
    ...setup,
    player: { deck, ...setup.player },
    enemy: { deck, ...setup.enemy },
  });
}

/** The screen model of a committed state, with the human's legal actions when it owns the decision. */
export function screenOf(state: BattleState, prompt: PendingEnginePrompt | null = null, display = state, presented = true, on = engine) {
  const decision = on.decision(state);
  return buildEngineBattleScreenModel({
    battleId: parseBattleId("battle-engine-fixture"),
    human: "player",
    view: on.view(display, "player"),
    legal: prompt === null && decision?.side === "player" ? on.legalActions(state, "player") : [],
    prompt,
    playing: null,
    decision: prompt === null ? decision : null,
    presented,
    notice: null,
    cards,
    catalog: on.catalog,
    printedKeywords: enginePrintedKeywords(on.catalog),
    avatars: { player: { avatar: null }, enemy: { avatar: null } },
    opponentName: "Fixture Opponent",
    essenceReward: 100,
    resultDismissed: false,
  });
}

/** The committed slice of a prompt-lab fixture's battle. */
export function labSlice(name: string): BattleSlice {
  const fixture = promptLabFixture(name);
  if (fixture === null) throw new Error(`no fixture ${name}`);
  return promptLabBattle(engine, fixture).slice;
}

/** The screen of a prompt-lab fixture's battle, at its pending prompt or decision. */
export function labScreen(name: string, presented = true) {
  const slice = labSlice(name);
  const pending = adapter.pending(slice);
  const model = screenOf(slice.committed, pending?.prompt ?? null, pending?.display ?? slice.committed, presented);
  return { prompt: pending?.prompt ?? null, model };
}

/** What each choice button of the model's surface selects. */
export const selections = (model: EngineBattleScreenModel) =>
  (surfaceChoices(model.prompt.surface)?.options ?? []).map((option) => option.select);

export const id = (instance: InstanceId | null | undefined) => {
  if (instance == null) throw new Error("missing instance");
  return parseBattleCardId(instance);
};
