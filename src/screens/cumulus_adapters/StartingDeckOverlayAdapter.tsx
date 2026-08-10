// Adapter bridging live journey state to the pure starting-deck overlay
// (`src/cumulus/screens/StartingDeckOverlay`). Wiring only: it acquires
// `useJourney()`, builds the view-model from the live deck and card database, logs
// the open (once per open session) and the close (with the elapsed duration),
// and renders the Cumulus overlay. All resolution logic lives in the pure builder
// (`starting-deck-view-model.ts`); the overlay itself stays pure.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useJourney } from "../../state/journey-context";
import { logEvent } from "../../logging";
import { StartingDeckOverlay } from "../../cumulus/screens/StartingDeckOverlay";
import { buildStartingDeckView } from "./starting-deck-view-model";

/** Props for {@link StartingDeckOverlayAdapter}. */
interface StartingDeckOverlayAdapterProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Live starting-deck reveal: builds the deck view-model from journey state,
 * instruments open/close, and renders the Cumulus overlay (which owns the
 * open/close animation, so it is rendered whether or not it is open).
 */
export function StartingDeckOverlayAdapter({
  isOpen,
  onClose,
}: StartingDeckOverlayAdapterProps) {
  const { state, journeyContent } = useJourney();
  const openTimestampRef = useRef(0);
  const wasOpenRef = useRef(false);

  const view = useMemo(
    () =>
      buildStartingDeckView(
        state.deck,
        journeyContent.cardDatabase,
      ),
    [state.deck, journeyContent.cardDatabase],
  );
  const cardCount = view.cards.length;

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!isOpen || wasOpen) return;
    openTimestampRef.current = Date.now();
    logEvent("starting_deck_modal_opened", { cardCount });
  }, [cardCount, isOpen]);

  const handleClose = useCallback(() => {
    logEvent("starting_deck_modal_closed", {
      durationMs: Date.now() - openTimestampRef.current,
    });
    onClose();
  }, [onClose]);

  return (
    <StartingDeckOverlay isOpen={isOpen} view={view} onClose={handleClose} />
  );
}
