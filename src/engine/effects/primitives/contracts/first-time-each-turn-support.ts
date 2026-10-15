/** Private public-engine fixtures for first-occasion contracts. */
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import type { BattleSlice, IntentOutcome } from "../../../fold/slice";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
export { SYNTHETIC as v } from "../../../testing/synthetic-cards";
export const card = (n: number, abilities: EngineCardDefinition["abilities"], subtype: EngineCardDefinition["subtype"] = "Warrior"): EngineCardDefinition =>
  ({ ...v.vanilla1, id: syntheticId(0x237100 + n), costs: [], abilities, subtype });
export function world(side: Side, cards: readonly EngineCardDefinition[], own: SideSetup, other: SideSetup = {}) {
  const engine = createEngine(testCatalog(cards));
  return { engine, side, ...boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { deck: Array.from({ length: 8 }, () => v.vanilla1.id), energy: 8, ...own },
    [opponent(side)]: { deck: Array.from({ length: 8 }, () => v.vanilla1.id), energy: 8, ...other } }) };
}
export type World = ReturnType<typeof world>;
export function step(w: World, state: BattleState, action: Step, values: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const source = values.length === 0 ? NO_PROMPTS : new ScriptedSource(values);
  const out = runStep(state, action, source, w.engine.catalog);
  if (out.kind !== "done") throw new Error("Expected complete fixture step");
  if (source instanceof ScriptedSource) source.assertExhausted();
  return out;
}
export function activate(w: World, state: BattleState, source: InstanceId, ability = 0) {
  const cast = step(w, state, { kind: "activate", source, ability });
  return step(w, cast.state, { kind: "resolveTop" });
}
export function drain(w: World, start: BattleState) {
  let state = start;
  for (let n = 0; state.triggerQueue.length > 0 && state.result === null; n++) {
    if (n >= 40) throw new Error("Fixture failed to drain");
    state = step(w, state, { kind: "resolveTrigger" }).state;
  }
  return state;
}
export const queued = (events: readonly EngineEvent[]) => events.filter(event => event.kind === "triggerQueued");
export const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
export function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error(JSON.stringify(out));
  return out;
}
export function parseSaved(slice: unknown) {
  return parseJourneyBattleFoldState({ mode: { kind: "journey" }, init: {
    battleId: parseBattleId("first-occasion"), siteId: parseSiteId("first-occasion"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("first-occasion"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } })?.engine.slice ?? null;
}
export const decklists = (w: World) => ({
  player: Object.values(w.state.instances).flatMap(i => i.owner === "player" && i.printing.kind === "card" ? [{ cardId: i.printing.cardId }] : []),
  enemy: Object.values(w.state.instances).flatMap(i => i.owner === "enemy" && i.printing.kind === "card" ? [{ cardId: i.printing.cardId }] : []),
});
