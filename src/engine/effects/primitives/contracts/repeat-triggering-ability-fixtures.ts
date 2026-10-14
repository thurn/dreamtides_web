/** Private synthetic fixtures consumed only by the two exact-repeat contract modules. */
import type { EmblemDefinitions, EngineCardDefinition, EngineFigmentDefinition } from "../../../catalog";
import { activated, all, characterYouControl } from "../../../dsl/builders";
import { triggered, whenNamedAbilityTriggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import type { BattleSlice, IntentOutcome } from "../../../fold/slice";
import { opponent, type InstanceId, type Phase, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import type { Step } from "../../../steps/kinds";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import * as p from "../index";
export { SYNTHETIC as v } from "../../../testing/synthetic-cards";
export const card = (index: number, abilities: EngineCardDefinition["abilities"], subtype: EngineCardDefinition["subtype"] = "Warrior"): EngineCardDefinition =>
  ({ ...v.vanilla1, id: syntheticId(0x712000 + index), abilities, subtype });
export const mages = all(characterYouControl({ subtype: "Mage" }));
export const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id];
export function world(side: Side, cards: readonly EngineCardDefinition[], own: SideSetup, other: SideSetup = {}, emblems: EmblemDefinitions = {}, figments: readonly EngineFigmentDefinition[] = [], phase: Phase = "day") {
  const engine = createEngine(testCatalog(cards, emblems, figments));
  return { engine, side, ...boardState(engine.catalog, { active: side, phase, scoreToWin: 100,
    [side]: { deck, energy: 8, ...own }, [opponent(side)]: { deck, energy: 8, ...other } }) };
}
type World = ReturnType<typeof world>;
export function step(w: World, state: BattleState, action: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const out = runStep(state, action, source, w.engine.catalog);
  if (out.kind !== "done") throw new Error("Unexpected suspension");
  if (source instanceof ScriptedSource) source.assertExhausted();
  return out;
}
export function activate(w: World, source: InstanceId, ability = 0) {
  const cast = step(w, w.state, { kind: "activate", source, ability });
  return step(w, cast.state, { kind: "resolveTop" });
}
export function drain(w: World, start: BattleState) {
  let state = start;
  for (let n = 0; state.triggerQueue.length > 0 && state.result === null; n++) {
    if (n >= 40) throw new Error("Fixture did not drain");
    state = step(w, state, { kind: "resolveTrigger" }).state;
  }
  return state;
}
export const decklists = (w: World) => ({
  player: Object.values(w.state.instances).flatMap(i => i.owner === "player" && i.printing.kind === "card" ? [{ cardId: i.printing.cardId }] : []),
  enemy: Object.values(w.state.instances).flatMap(i => i.owner === "enemy" && i.printing.kind === "card" ? [{ cardId: i.printing.cardId }] : []),
});
export const queued = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "triggerQueued");
export const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
export function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error(JSON.stringify(out));
  return out;
}
export function parseSaved(slice: unknown) {
  const loaded = parseJourneyBattleFoldState({ mode: { kind: "journey" }, init: {
    battleId: parseBattleId("repeat-occurrence"), siteId: parseSiteId("repeat-occurrence"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("repeat-occurrence"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } });
  return loaded?.engine.slice ?? null;
}
export function reload(slice: BattleSlice) {
  const loaded = parseSaved(slice);
  if (loaded === null) throw new Error("Saved admission rejected");
  return loaded;
}
export const force = card(0, () => [activated([], p.triggerAbility(mages, "materialized"))]);
export const observer = card(1, () => [triggered(whenNamedAbilityTriggered("materialized"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
