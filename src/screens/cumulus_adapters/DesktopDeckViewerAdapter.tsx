// Adapter bridging live journey state to the pure desktop deck viewer
// (`src/cumulus/screens/DesktopDeckViewer`). Wiring only: it acquires `useJourney()`,
// builds the view-model from the live deck, card database, DreamAvatar,
// dreamsigns, run seed, and pool context; logs the open; and renders nothing
// while closed. All resolution logic lives in the pure builder
// (`desktop-deck-view-model.ts`); the screen itself stays pure.

import { useEffect, useMemo, useRef } from "react";
import { useJourney } from "../../state/journey-context";
import { logEvent } from "../../logging";
import { DesktopDeckViewer } from "../../cumulus/screens/DesktopDeckViewer";
import { buildDesktopDeckView } from "./desktop-deck-view-model";

/** Props for {@link DesktopDeckViewerAdapter}. */
interface DesktopDeckViewerAdapterProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Live desktop deck viewer: builds the deck view-model from journey state and
 * renders the Cumulus screen while open.
 */
export function DesktopDeckViewerAdapter({
  isOpen,
  onClose,
}: DesktopDeckViewerAdapterProps) {
  const { state, journeyContent } = useJourney();
  const wasOpenRef = useRef(false);

  const view = useMemo(
    () =>
      buildDesktopDeckView(
        journeyContent.transfigurationData,
        state.deck,
        journeyContent.cardDatabase,
        state.dreamAvatar,
        state.dreamsigns,
        journeyContent.dreamAvatars,
        journeyContent.poolContext,
        state.seed,
      ),
    [
      state.deck,
      journeyContent.cardDatabase,
      state.dreamAvatar,
      state.dreamsigns,
      journeyContent.dreamAvatars,
      journeyContent.poolContext,
      journeyContent.transfigurationData,
      state.seed,
    ],
  );
  const cardCount = view.cards.length;
  const dreamsignCount = view.dreamsigns.length;
  const hasDreamAvatar = view.dreamAvatar !== null;

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!isOpen || wasOpen) return;
    logEvent("desktop_deck_viewer_opened", {
      cardCount,
      dreamsignCount,
      hasDreamAvatar,
    });
  }, [cardCount, dreamsignCount, hasDreamAvatar, isOpen]);

  if (!isOpen) return null;
  return <DesktopDeckViewer view={view} onClose={onClose} />;
}
