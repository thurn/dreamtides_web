import type { JourneyContent } from "../../data/journey-content";
import type { JourneyOpeningHandView } from "../../cumulus/screens/JourneyOpeningHandScreen";
import type { JourneyState } from "../../types/journey";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { journeyOpeningHandEntries } from "../../rules/journey/journey-battle-init";
import { JOURNEY_SITE_MESSAGES } from "../../runtime/journey-site-messages";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { toDeckCardView } from "./mobile-deck-view-model";

type Permission = Pick<JourneyOpeningHandView, "dreamsignId" | "heldIndex" | "choiceIndex" | "permissionSeq">;

/** The adapter supplies the validated permission; content resolves actual physical options. */
export function buildJourneyOpeningHandView(journey: JourneyState, content: JourneyContent,
  permission: Permission): JourneyOpeningHandView | null {
  if (journey.dreamsigns[permission.heldIndex]?.id !== permission.dreamsignId) return null;
  const provider = createJourneyTransfigurationProvider(content);
  const entries = journeyOpeningHandEntries(journey.deck, entry => provider.resolve(entry));
  if (entries === null) return null;
  const node = journey.currentDreamscape === null ? null : journey.atlas.nodes[journey.currentDreamscape] ?? null;
  const cards = entries.flatMap(({ entry }) => {
    const card = toDeckCardView(content.transfigurationData, entry, content.cardDatabase, journey.typeRemap);
    return card === null ? [] : [card];
  });
  return { ...permission, scene: dreamscapeSceneRef(node ?? { dreamscapeId: content.dreamscapes[0]?.id ?? null }, content),
    cards, title: JOURNEY_SITE_MESSAGES.openingHandTitle, instruction: JOURNEY_SITE_MESSAGES.openingHandInstruction,
    confirmLabel: JOURNEY_SITE_MESSAGES.openingHandConfirm, continueLabel: JOURNEY_SITE_MESSAGES.continue,
    emptyLabel: JOURNEY_SITE_MESSAGES.openingHandEmpty };
}
