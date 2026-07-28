// Adapter bridging live journey state to the pure mobile deck viewer
// (`src/cumulus/screens/MobileDeckViewer`). Wiring only: it acquires `useJourney()`,
// builds the view-model from the live deck and card database, logs the open,
// and renders nothing while closed. All resolution logic lives in the pure
// builder (`mobile-deck-view-model.ts`); the screen itself stays pure.

import { useEffect, useMemo } from "react";
import { useJourney } from "../../state/journey-context";
import { logEvent } from "../../logging";
import { MobileDeckViewer } from "../../cumulus/screens/MobileDeckViewer";
import { buildMobileDeckView } from "./mobile-deck-view-model";

/** Props for {@link MobileDeckViewerAdapter}. */
interface MobileDeckViewerAdapterProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Live mobile deck viewer: builds the deck view-model from journey state and
 * renders the Cumulus screen while open.
 */
export function MobileDeckViewerAdapter({
  isOpen,
  onClose,
}: MobileDeckViewerAdapterProps) {
  const { state, journeyContent } = useJourney();

  const view = useMemo(
    () => buildMobileDeckView(state.deck, journeyContent.cardDatabase),
    [state.deck, journeyContent.cardDatabase],
  );

  useEffect(() => {
    if (!isOpen) return;
    logEvent("mobile_deck_viewer_opened", { cardCount: view.cards.length });
  }, [isOpen, view.cards.length]);

  if (!isOpen) return null;
  return <MobileDeckViewer view={view} onClose={onClose} />;
}
