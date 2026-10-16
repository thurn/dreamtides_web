import { vi } from "vitest";
import * as contentCatalog from "../../engine/content-catalog";
import type { CardDefinition } from "../../content/define";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { registerJourneyTransfigurationProvider, journeyLoopTransfiguration } from "./journey-transfiguration";
import { afterBattle } from "./journey-loop.fixtures";
import { provider as beforeProvider } from "./journey-before-battle-purge-fixtures";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyDeckEntry } from "./journey-deck-entry";
import { journeyPurge } from "./journey-purge";
import { journeyTransfiguration } from "./journey-transfiguration";
import { testDreamsignId } from "../../types/test-identities";
import { loopDefinition, TOME } from "./journey-loop.fixtures";
/** Public synthetic battle constructors and intents shared by the remaining loop matrix. */
import { createEngine } from "../../engine";
import type { EngineCardDefinition } from "../../engine/catalog";
import { energy, event as eventAbility } from "../../engine/dsl/builders";
import { gainPoints } from "../../engine/effects/primitives";
import { syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { parseCardSubtype } from "../../types/card-identity";
import { LayerName } from "../../types/layer-name";
import { fixtureBattleInitProvider, FIXTURE_ENGINE, FIXTURE_POINTS_MODE } from "../replay/fixture-providers";
import { registerBattleInitProvider, registerBattleCompletionProvider } from "../battle/journey-battle";
import { journeyBattleOf } from "../battle/fold";
import { pendingEnginePrompt } from "../battle/engine-battle";
import { makeSite, NODE_ID } from "./sites-fixtures";
import { apply, fixture, LOOP, SITE_ID, TAIL, WINDOW, type LoopFixture, type LoopOptions } from "./journey-loop.fixtures";
import type { FoldState } from "../fold-state";

export function liveLoopBattle(outcome: "victory" | "defeat" | "draw" = "victory", final = false, options: LoopOptions = {}): LoopFixture & { battleEngine: typeof FIXTURE_ENGINE } {
  const f = fixture({ held: [LOOP, WINDOW, TAIL], ...options });
  const loss: EngineCardDefinition = { id: syntheticId(0x755), cardType: "event", costs: [energy(0)], spark: null, subtype: parseCardSubtype(""), speed: "standard", status: "authored", abilities: () => [eventAbility(gainPoints(1, "opponent"))] };
  const battleEngine = outcome === "defeat" ? createEngine(testCatalog([loss])) : FIXTURE_ENGINE;
  const base = fixtureBattleInitProvider();
  registerBattleInitProvider({ engine: battleEngine, beginBattle(input) {
    const start = base.beginBattle(input); if (start === null) return null;
    return { init: { ...start.init, nodeId: input.journey.currentDreamscape, completionLevelAtStart: input.journey.completionLevel },
      engineInit: { ...start.engineInit, ...(outcome === "draw" ? { turnLimit: 1 } : {}), ...(outcome === "defeat" ? { decks: { ...start.engineInit.decks, player: Array.from({ length: 10 }, () => ({ cardId: loss.id })) } } : {}) } };
  } });
  registerBattleCompletionProvider({ advanceAtlas: ({ journey }) => ({ ...journey.atlas, currentNodeId: null,
    nodes: { ...journey.atlas.nodes, [NODE_ID]: { ...journey.atlas.nodes[NODE_ID], state: "completed" } } }) });
  const initial = structuredClone(f.state);
  initial.journey.atlas.nodes[NODE_ID].sites = [makeSite("Battle")];
  initial.journey.atlas.nodes[NODE_ID].layer = LayerName.One;
  initial.journey.atlas.layers = final ? [[NODE_ID]] : [[NODE_ID], []];
  const started = apply(f, initial, "BEGIN_BATTLE", { siteId: SITE_ID }, { seq: 20 });
  if (started.outcome !== "applied" || started.state.battle === null) throw new Error("Public synthetic battle did not start");
  return { ...f, state: started.state, battleEngine };
}
export function endLoopBattle(f: ReturnType<typeof liveLoopBattle>, outcome: "victory" | "defeat" | "draw"): FoldState {
  let state = f.state;
  if (outcome !== "draw") {
    const battle = journeyBattleOf(state.battle)!;
    const card = battle.engine.slice.committed.sides.player.hand[0];
    const played = apply(f, state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } }, { seq: 21 });
    if (played.outcome !== "applied") throw new Error("Public synthetic play refused"); state = played.state;
    if (outcome === "victory") {
      const prompt = pendingEnginePrompt(state.battle, f.battleEngine);
      if (prompt === null) throw new Error("Public points prompt missing");
      const answered = apply(f, state, "BATTLE_ANSWER", { side: "player", promptId: prompt.prompt.id, value: FIXTURE_POINTS_MODE }, { seq: 22 });
      if (answered.outcome !== "applied") throw new Error("Public points answer refused"); state = answered.state;
    }
  } else {
    for (let index = 0; index < 12 && journeyBattleOf(state.battle)!.engine.slice.committed.result === null; index++) {
      const board = journeyBattleOf(state.battle)!.engine.slice.committed;
      const side = (["player", "enemy"] as const).find(side => f.battleEngine.legalActions(board, side).some(action => action.kind === "pass"));
      if (side === undefined) throw new Error("Public pass unavailable");
      const passed = apply(f, state, "BATTLE_ACTION", { side, action: { kind: "pass" } }, { seq: 23 + index });
      if (passed.outcome !== "applied") throw new Error("Public pass refused"); state = passed.state;
    }
  }
  if (journeyBattleOf(state.battle)!.engine.slice.committed.result === null) throw new Error("Actual engine result missing");
  const ended = apply(f, state, "END_BATTLE", {}, { seq: 40 });
  if (ended.outcome !== "applied" || ended.state.battle !== null) throw new Error("Actual END_BATTLE refused");
  return ended.state;
}

/** Actual canonical before-battle purge keeps its original start context. */
export function ordinaryBeforeBattleLoop(observe: Parameters<typeof beforeProvider>[0]) {
  const SOURCE = testDreamsignId("loop-before-source");
  const f = fixture({ held: [LOOP, SOURCE] });
  const registry = createJourneyModifierRegistry([loopDefinition(f.provider), journeyPurge(SOURCE, { kind: "beforeBattlePurge", minimumDeckSize: 1 })]);
  beforeProvider(observe);
  const state = structuredClone(f.state);
  state.journey.atlas.nodes[NODE_ID].sites = [makeSite("Battle")]; state.journey.atlas.nodes[NODE_ID].layer = LayerName.One;
  const configured = { ...f, registry, state };
  const prepared = apply(configured, state, "BEGIN_BATTLE", { siteId: SITE_ID }, { seq: 10 });
  if (prepared.outcome !== "applied" || prepared.state.journey.screen.type !== "journeyPurge" || prepared.state.journey.screen.choice.kind !== "beforeBattle") throw new Error("Actual before-battle permission missing");
  return { ...configured, state: prepared.state, originalChoice: prepared.state.journey.screen.choice, SOURCE };
}

/** Synthetic canonical source data uses the stable Bane UUID to exercise prevention. */
export function preventedLoopCopies() {
  const GUARD = testDreamsignId("loop-copy-prevention");
  const f = fixture({ cardType: "Event", held: [LOOP, TOME, TOME, GUARD] });
  const base = { ...f.base, id: NIGHTMARE_CARD_ID };
  const definition: CardDefinition = { id: NIGHTMARE_CARD_ID as CardDefinition["id"], name: "Synthetic", mtgName: "Synthetic", cardNumber: base.cardNumber,
    cardType: "Event", subtype: "", rarity: "Common", energyCost: 6, spark: null, isFast: false, isInterrupt: false, renderedText: "",
    isStarter: false, artOwned: true, imageNumber: 7551, tags: [], vanilla: true };
  const content = { ...f.content, cardDatabase: new Map([[base.cardNumber, base], [f.neighbor.cardNumber, f.neighbor]]) };
  const spy = vi.spyOn(contentCatalog, "contentCardDefinitions").mockReturnValue([contentCatalog.engineCardFromContent(definition)]);
  let provider;
  try { provider = createJourneyTransfigurationProvider(content); } finally { spy.mockRestore(); }
  registerJourneyTransfigurationProvider(provider);
  const factory = journeyLoopTransfiguration(LOOP, provider, NIGHTMARE_CARD_ID);
  if (!factory.ok) throw new Error("Synthetic canonical Bane source refused");
  const registry = createJourneyModifierRegistry([factory.definition, journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
    journeyTransfiguration(WINDOW, { kind: "afterBattleTransfiguration", maxCount: 1 }), journeyTransfiguration(TAIL, { kind: "afterBattleTransfiguration", maxCount: 1 }), journeyDeckEntry(GUARD, { kind: "preventNightmare" })]);
  return afterBattle({ ...f, base, content, provider, registry });
}
