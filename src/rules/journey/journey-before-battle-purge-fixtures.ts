import type { EventContext, EngineConfig } from "../../eventlog/types";
import type { DreamsignId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import { LayerName } from "../../types/layer-name";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import type { GameEventType } from "../events";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { fixtureBattleInitProvider } from "../replay/fixture-providers";
import { registerBattleInitProvider, type BattleInitProvider } from "../battle/journey-battle";
import { createJourneyModifierRegistry, type JourneyModifierDefinition, type JourneyModifierRegistry } from "./modifier-registry";
import { journeyPurge } from "./journey-purge";
import { journeyEssence } from "./journey-essence";
import { registerDeckContentProvider } from "./deck";
import { makeEntry, makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { ctx, event } from "./lifecycle-fixtures";
export { ctx, event, SITE_ID };
export const SOURCE = testDreamsignId("before729-source"), LOWER = testDreamsignId("before729-lower"), FRUIT = testDreamsignId("before729-fruit"), GUARD = testDreamsignId("before729-guard"), OBSERVER = testDreamsignId("before729-observer");
export const sign = (id: DreamsignId) => ({ id, name: "", effectDescription: "" });
export function registry(extra: readonly JourneyModifierDefinition[] = []) {
  return createJourneyModifierRegistry([journeyPurge(SOURCE, { kind: "beforeBattlePurge", minimumDeckSize: 2 }), journeyPurge(LOWER, { kind: "beforeBattlePurge", minimumDeckSize: 1 }), journeyEssence(FRUIT, { kind: "purgedCardEssence", amount: 7 }), journeyPurge(GUARD, { kind: "preventPurge" }), ...extra]);
}
export function initial(held: readonly DreamsignId[] = [SOURCE], count = 4): FoldState {
  registerDeckContentProvider({ resolveCardNumber: () => 1, resolveDreamsign: sign });
  const result = stateWithSites([makeSite("Battle")], { essence: 50, dreamsigns: held.map(sign), deck: Array.from({ length: count }, (_, n) => makeEntry({ entryId: parseDeckEntryId(`before729-entry-${n}`), cardNumber: 1, isBane: n === 0 })) });
  for (const node of Object.values(result.journey.atlas.nodes)) node.layer = LayerName.One;
  return result;
}
/** Actual ordinary provider contract and real engine; physical entries share a card UUID. */
export function provider(observe: (input: Parameters<BattleInitProvider["beginBattle"]>[0]) => void = () => {}) {
  const base = fixtureBattleInitProvider();
  const installed: BattleInitProvider = { ...base, beginBattle(input) {
    observe(input);
    const start = base.beginBattle(input); if (start === null) return null;
    return { ...start, init: { ...start.init, nodeId: input.journey.currentDreamscape, completionLevelAtStart: input.journey.completionLevel }, engineInit: { ...start.engineInit, decks: { ...start.engineInit.decks, player: input.journey.deck.map(() => start.engineInit.decks.player[0]) } } };
  } };
  registerBattleInitProvider(installed); return installed;
}
export function apply(s: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, mods = registry(), context: Partial<EventContext> = {}) {
  return reduceGameEvent(s, event(type, payload), ctx({ seq: type === "BEGIN_BATTLE" ? 10 : 11, ...context }), mods);
}
export function pending(s = initial(), mods = registry()): FoldState {
  const result = apply(s, "BEGIN_BATTLE", { siteId: SITE_ID }, mods); if (result.outcome !== "applied" || result.state.journey.screen.type !== "journeyPurge") throw new Error("Missing earned choice"); return result.state;
}
export function payload(s: FoldState, entryIds: readonly unknown[] = []) {
  if (s.journey.screen.type !== "journeyPurge" || s.journey.screen.choice.kind !== "beforeBattle") throw new Error("Missing before permission");
  const c = s.journey.screen.choice;
  return { siteId: c.siteId, dreamsignId: c.dreamsignId, heldIndex: c.heldIndex, choiceIndex: 0, earnedSeq: c.earnedSeq, entryIds };
}
export function config(s: FoldState, mods: JourneyModifierRegistry): EngineConfig<FoldState> {
  return { ...GAME_ENGINE_CONFIG, genesisState: () => s, reducer: (state, e, context) => reduceGameEvent(state, e, context, mods) };
}
