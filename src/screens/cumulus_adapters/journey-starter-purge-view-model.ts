import type { JourneyState } from "../../types/journey";
import type { JourneyContent } from "../../data/journey-content";
import type { JourneyStarterPurgeView } from "../../cumulus/screens/JourneyStarterPurgeScreen";
import { toDeckCardView } from "./mobile-deck-view-model";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { JOURNEY_SITE_MESSAGES } from "../../runtime/journey-site-messages";
/** Only earned physical starter entries appear; current catalog identity is checked defensively. */
export function buildJourneyStarterPurgeView(journey: JourneyState, content: JourneyContent): JourneyStarterPurgeView | null {
  if (journey.screen.type !== "journeyStarterPurge") return null;
  const choice = journey.screen.choice, source = choice.sources[choice.index];
  if (source === undefined) return null;
  const node = journey.currentDreamscape === null ? null : journey.atlas.nodes[journey.currentDreamscape] ?? null;
  return { dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, permissionSeq: choice.permissionSeq,
    scene: dreamscapeSceneRef(node ?? { dreamscapeId: content.dreamscapes[0]?.id ?? null }, content),
    maxCount: source.maxCount, title: JOURNEY_SITE_MESSAGES.starterPurgeTitle, instruction: JOURNEY_SITE_MESSAGES.starterPurgeInstruction(source.maxCount),
    continueLabel: JOURNEY_SITE_MESSAGES.continue, confirmLabel: JOURNEY_SITE_MESSAGES.purgeCount,
    cards: journey.deck.flatMap((entry) => {
      const earned = source.entries.find((old) => old.entryId === entry.entryId), base = content.cardDatabase.get(entry.cardNumber);
      if (earned === undefined || base?.id !== earned.cardId || !(base.isStarter === true || base.roles?.includes("starter-deck"))) return [];
      const card = toDeckCardView(content.transfigurationData, entry, content.cardDatabase, journey.typeRemap);
      return card === null ? [] : [card];
    }) };
}
