import { JOURNEY_SITE_MESSAGES } from "../../runtime/journey-site-messages";
import type { JourneyContent } from "../../data/journey-content";
import type { JourneyState } from "../../types/journey";
import type { JourneyPurgeView } from "../../cumulus/screens/JourneyPurgeScreen";
import { currentPurgeSource } from "../../rules/journey/journey-purge";
import { essenceSiteGain } from "../../rules/journey/journey-essence";
import { journeyModifierRegistry, type JourneyModifierRegistry } from "../../rules/journey/modifier-registry";
import { toDeckCardView } from "./mobile-deck-view-model";
import { buildPurgeGuideView, resolvePurgeGuide } from "./purge-view-model";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

/** Project the exact folded permission and concrete deck entries into the existing picker. */
export function buildJourneyPurgeView(state: JourneyState, content: JourneyContent,
  registry: JourneyModifierRegistry = journeyModifierRegistry): JourneyPurgeView | null {
  if (state.screen.type !== "journeyPurge") return null;
  const choice = state.screen.choice;
  const source = currentPurgeSource(choice);
  if (source === undefined) return null;
  const limit = choice.kind === "beforeBattle" ? Math.max(0, state.deck.length - choice.minimumDeckSize) : choice.kind === "essenceSite" ? choice.count : currentPurgeSource(choice)!.maxCount;
  const instruction = choice.kind === "beforeBattle" ? JOURNEY_SITE_MESSAGES.beforeBattlePurgeInstruction(limit) : choice.kind === "essenceSite"
    ? `You may forgo this site's essence to purge ${String(limit)} cards.`
    : `You may purge up to ${String(limit)} cards after this battle.`;
  const node = Object.values(state.atlas.nodes).find((candidate) => candidate.sites.some((site) => site.id === choice.siteId)) ?? null;
  const runtime = state.siteRuntime[choice.siteId];
  return { siteId: choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex,
    choiceIndex: choice.kind === "afterBattle" ? choice.index : 0,
    scene: dreamscapeSceneRef(node, content), guide: buildPurgeGuideView(resolvePurgeGuide(content.guides), instruction),
    cards: state.deck.flatMap((entry) => {
      const card = toDeckCardView(content.transfigurationData, entry, content.cardDatabase, state.typeRemap);
      return card === null ? [] : [card];
    }), minCount: choice.kind === "essenceSite" ? limit : 0, maxCount: limit,
    title: "Purge Cards", instruction,
    collectAmount: choice.kind === "essenceSite" && runtime?.kind === "essence"
      ? essenceSiteGain(state, runtime.amount, registry) : null };
}
