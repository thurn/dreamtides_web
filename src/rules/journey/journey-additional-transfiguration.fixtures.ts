import { LayerName } from "../../types/layer-name";
import type { DreamsignId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import type { JourneyModifierDefinition } from "./modifier-registry";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyTransfiguration } from "./journey-transfiguration";
import { fixture, afterBattle, sign, type LoopOptions } from "./journey-loop.fixtures";

export const POUCH = testDreamsignId("additional-physical-pouch"), SECOND = testDreamsignId("additional-second-pouch");
export { apply, accept, resolveWindow, config, CARD_ID, ENTRY_ID, TOME, WINDOW, TAIL, SITE_ID, GENESIS, sign } from "./journey-loop.fixtures";
export function additional(options: LoopOptions = {}) {
  const f = fixture({ ...options, held: [], definitions: [] });
  const definitions: readonly JourneyModifierDefinition[] = [
    journeyTransfiguration(POUCH, { kind: "additionalRandomTransfiguration" }),
    journeyTransfiguration(SECOND, { kind: "additionalRandomTransfiguration" }),
    journeyTransfiguration(TOME_ID, { kind: "copyTransfiguredEvent" }),
    journeyTransfiguration(WINDOW_ID, { kind: "afterBattleTransfiguration", maxCount: 2 }),
    journeyTransfiguration(TAIL_ID, { kind: "afterBattleTransfiguration", maxCount: 1 }),
    ...(options.definitions ?? []),
  ];
  const registry = createJourneyModifierRegistry(definitions);
  const held: readonly DreamsignId[] = options.held ?? [POUCH];
  return { ...f, registry, definitions, state: { ...f.state, journey: { ...f.state.journey, dreamsigns: held.map(sign) } } };
}
import { TOME as TOME_ID, WINDOW as WINDOW_ID, TAIL as TAIL_ID } from "./journey-loop.fixtures";
export function additionalWindow(options: LoopOptions = {}) {
  const f = afterBattle(additional({ ...options, held: options.held ?? [POUCH, TOME_ID, WINDOW_ID, TAIL_ID] }));
  if (f.state.journey.screen.type !== "journeyTransfiguration") throw new Error("fixture window");
  f.state.journey.atlas.nodes[f.state.journey.currentDreamscape!].layer = LayerName.One;
  const sources = f.state.journey.screen.choice.sources.map((source, index) => index === 0 ? { ...source, maxCount: 2 } : source);
  f.state.journey.screen = { ...f.state.journey.screen, choice: { ...f.state.journey.screen.choice, sources } };
  return f;
}
