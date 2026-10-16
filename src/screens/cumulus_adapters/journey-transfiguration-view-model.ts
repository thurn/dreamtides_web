import type { JourneyContent } from "../../data/journey-content";
import { projectAfterBattleCursor } from "../../rules/journey/journey-after-battle";
import type { JourneyState } from "../../types/journey";
import type { JourneyTransfigurationView } from "../../cumulus/screens/JourneyTransfigurationScreen";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { toDeckCardView } from "./mobile-deck-view-model";
import { buildTransfigurationGuideView, resolveTransfigurationGuide } from "./transfiguration-view-model";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { JOURNEY_SITE_MESSAGES } from "../../runtime/journey-site-messages";

/** Project only currently applicable cards without rolling their eventual forms. */
export function buildJourneyTransfigurationView(state: JourneyState, content: JourneyContent): JourneyTransfigurationView | null {
  if (state.screen.type !== "journeyTransfiguration") return null;
  const cursor = projectAfterBattleCursor(state.screen.choice);
  if (cursor?.kind !== "transfiguration") return null;
  const { choice, source } = cursor;
  const provider = createJourneyTransfigurationProvider(content);
  const instruction = JOURNEY_SITE_MESSAGES.randomTransfigurationInstruction(source.maxCount);
  const node = Object.values(state.atlas.nodes).find((candidate) => candidate.sites.some((site) => site.id === choice.siteId)) ?? null;
  return { siteId: choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index,
    scene: dreamscapeSceneRef(node, content), guide: buildTransfigurationGuideView(resolveTransfigurationGuide(content.guides), instruction),
    cards: state.deck.flatMap((entry) => {
      if (entry.transfiguration !== null || (provider.resolve(entry)?.forms.length ?? 0) === 0) return [];
      const card = toDeckCardView(content.transfigurationData, entry, content.cardDatabase, state.typeRemap);
      return card === null ? [] : [card];
    }), maxCount: source.maxCount, title: JOURNEY_SITE_MESSAGES.randomTransfigurationTitle, instruction,
    continueLabel: JOURNEY_SITE_MESSAGES.continue, confirmLabel: JOURNEY_SITE_MESSAGES.transfigureCount };
}
