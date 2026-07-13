// StartingDeckOverlay — the Cumulus presentational overlay for the starting-deck
// reveal.
//
// The first time a run has a Dreamcaller and has not yet seen its deck, the app
// shows the player the cards they begin the quest with. This is that popup: a
// CardGalleryPanel with the same left-aligned title/subtitle, trailing close
// accessory, and internal card-grid scroll used by card-selection sites.
//
// The body is a scrolling grid of the starting cards in acquisition order. Each
// GameCard grows in place on hover (desktop), while mobile uses the same
// press-to-read large preview as the Deck Viewer. The gallery sizes itself to
// the screen: desktop uses a roomy floating five-column glass panel, while
// mobile uses a full-bleed four-column alpha scrim with the gallery body's
// scroll affordance handled by CardGalleryPanel. The content is
// intentionally minimal — the title, one line of intro copy, and the cards;
// there are no filter, sort, or "Continue" controls. Dismissal is the close disc
// or Escape.
//
// PURE: renders from a view-model (`starting-deck-view-model.ts` builds it from
// live quest state in the adapter) and reports dismissal through `onClose`.

import { useEffect } from "react";
import type { ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GameCardModel } from "../components/card/CardView";
import { CardGalleryPanel } from "../components/card/CardGalleryPanel";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "./use-is-desktop";

/**
 * One starting-deck card, resolved to the card the player actually holds
 * (type/keyword changes and debug stat overrides applied) and paired with the
 * hooks the grid needs. Keyed by `entryId` — never the card name, which is not
 * unique.
 */
export interface StartingDeckCardView {
  /** Stable deck-entry id; the grid key and the basis of `testId`. */
  entryId: string;
  /** Canonical UUID-backed card model. */
  model: GameCardModel;
  /** `data-testid` for the card's grid tile. */
  testId: string;
}

/** The full starting-deck view: every resolvable entry in acquisition order. */
export interface StartingDeckView {
  cards: StartingDeckCardView[];
}

/** Props for {@link StartingDeckOverlay}. */
export interface StartingDeckOverlayProps {
  /** Whether the overlay is shown. Renders nothing (with an exit fade) closed. */
  isOpen: boolean;
  /** The resolved starting-deck cards to lay out. */
  view: StartingDeckView;
  /** Dismisses the overlay; fires on the close disc and on Escape. */
  onClose: () => void;
}

/**
 * The starting-deck reveal overlay: a modal CardGalleryPanel with a scrolling
 * grid of the starting cards. Closed by the trailing disc or Escape.
 */
export function StartingDeckOverlay({
  isOpen,
  view,
  onClose,
}: StartingDeckOverlayProps): ReactElement {
  const isDesktop = useIsDesktop();

  // The overlay carries Escape-to-close behavior. Active only while open.
  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="starting-deck-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Starting Deck"
          className="cumulus"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "fixed",
            inset: 0,
            width: isDesktop ? undefined : "100dvw",
            height: isDesktop ? undefined : "100dvh",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isDesktop ? token("--space-8") : 0,
          }}
        >
          <div
            style={{
              position: "relative",
              zIndex: 1,
              width: isDesktop ? "min(100%, 1180px)" : "100%",
              height: isDesktop ? undefined : "100%",
              maxHeight: isDesktop
                ? `calc(100vh - ${token("--space-8")} - ${token("--space-8")})`
                : undefined,
              minHeight: 0,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <CardGalleryPanel
              title="Starting Deck"
              subtitle="These are the cards you begin the quest with."
              rightAccessory={{
                kind: "iconButton",
                glyph: GLYPHS.close,
                label: "Close starting deck",
                onPress: onClose,
              }}
              cards={view.cards}
              emptyLabel="No cards in starting deck."
              columns={isDesktop ? "five" : "four"}
              cardSize={isDesktop ? "roomy" : "standard"}
              largeCards={isDesktop}
              frame={isDesktop ? "floating" : "fullBleed"}
              spacing={isDesktop ? "regular" : "compact"}
              cutoutAwareAccessory
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
