import type { JourneyContent } from "../../data/journey-content";
import type { JourneyState } from "../../types/journey";
import type { JourneyDuplicationView } from "../../cumulus/screens/JourneyDuplicationScreen";
import { validatedAfterBattleCursor } from "../../rules/journey/journey-after-battle";
import { journeyModifierRegistry, type JourneyModifierRegistry } from "../../rules/journey/modifier-registry";
import { JOURNEY_SITE_MESSAGES } from "../../runtime/journey-site-messages";
import { toDeckCardView } from "./mobile-deck-view-model";
import { buildDuplicationGuideView, resolveDuplicationGuide } from "./duplication-view-model";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

/** Read the earned source independently of current holdings and preserve physical choices. */
export function buildJourneyDuplicationView(state: JourneyState, content: JourneyContent,
  registry: JourneyModifierRegistry = journeyModifierRegistry): JourneyDuplicationView | null {
  if (state.screen.type !== "journeyDuplication") return null;
  const cursor = validatedAfterBattleCursor(state.screen.choice, state, registry);
  if (cursor?.kind !== "duplication") return null;
  const { choice, source } = cursor;
  const node = Object.values(state.atlas.nodes).find((candidate) => candidate.sites.some((site) => site.id === choice.siteId)) ?? null;
  const instruction = JOURNEY_SITE_MESSAGES.duplicationInstruction;
  return { siteId: choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex,
    choiceIndex: choice.index, earnedSeq: source.earnedSeq, scene: dreamscapeSceneRef(node, content),
    guide: buildDuplicationGuideView(resolveDuplicationGuide(content.guides), instruction),
    cards: state.deck.flatMap((entry) => {
      const card = toDeckCardView(content.transfigurationData, entry, content.cardDatabase, state.typeRemap);
      return card === null ? [] : [card];
    }), title: JOURNEY_SITE_MESSAGES.duplicationTitle, instruction,
    continueLabel: JOURNEY_SITE_MESSAGES.continue, confirmLabel: JOURNEY_SITE_MESSAGES.duplicateCard };
}
