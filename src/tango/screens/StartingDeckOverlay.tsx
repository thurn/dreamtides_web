// StartingDeckOverlay — the Tango presentational overlay for the starting-deck
// reveal.
//
// The first time a run has a Dreamcaller and has not yet seen its deck, the app
// shows the player the cards they begin the quest with. This is that popup,
// rebuilt on the Tango tier: it renders through the shared GlassDialog shell
// (bounded, centered glass panel on desktop; full-bleed frosted overlay on
// mobile, its header clearing the device cutout), so all of the frosted-glass
// chrome — the panel geometry, the safe-area padding, the close disc — is owned
// by GlassDialog rather than re-declared here. `cutoutAwareClose` opts the close
// disc into floating up beside a simulated Dynamic Island on a full-bleed mobile
// mock-up.
//
// The body is a scrolling grid of the starting cards in acquisition order, each
// wrapped in HoverZoomCard so hovering (desktop) or pressing (mobile) grows the
// card in place for a legible read. The content is intentionally minimal — the
// title, one line of intro copy, and the cards; there are no filter, sort, or
// "Continue" controls. Dismissal is the close disc or Escape.
//
// PURE: renders from a view-model (`starting-deck-view-model.ts` builds it from
// live quest state in the adapter) and reports dismissal through `onClose`.

import { useEffect } from "react";
import type { ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData } from "../../types/cards";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { HoverZoomCard } from "../components/card/HoverZoomCard";
import { GameCard } from "../components/card/CardView";
import { token } from "../primitives/tokens";

/**
 * One starting-deck card, resolved to the card the player actually holds
 * (type/keyword changes and debug stat overrides applied) and paired with the
 * hooks the grid needs. Keyed by `entryId` — never the card name, which is not
 * unique.
 */
export interface StartingDeckCardView {
  /** Stable deck-entry id; the grid key and the basis of `testId`. */
  entryId: string;
  /** The resolved card to paint. */
  card: CardData;
  /** The card's rendered rules text, fed to HoverZoomCard's glossary help. */
  glossaryText: string;
  /** `data-testid` for the card's HoverZoomCard wrapper. */
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

/** Grid tile min width (px); columns auto-fill to fill the row from there. */
const CARD_MIN_WIDTH_PX = 140;

/**
 * The starting-deck reveal overlay. Renders through {@link GlassDialog} (which
 * owns the glass chrome, the desktop/mobile geometry, and the close disc) with a
 * scrolling grid of the starting cards. Closed by the disc or Escape.
 */
export function StartingDeckOverlay({
  isOpen,
  view,
  onClose,
}: StartingDeckOverlayProps): ReactElement {
  // GlassDialog does not bind Escape, so the overlay carries the shipped
  // Escape-to-close behavior. Active only while open.
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <GlassDialog
            title="Starting Deck"
            subtitle="These are the cards you begin the quest with."
            onClose={onClose}
            closeLabel="Close starting deck"
            cutoutAwareClose
          >
            {view.cards.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    font: token("--t-body"),
                    color: token("--text-primary"),
                  }}
                >
                  No cards in starting deck.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(auto-fill, minmax(${String(
                    CARD_MIN_WIDTH_PX,
                  )}px, 1fr))`,
                  gap: token("--space-4"),
                }}
              >
                {view.cards.map((cardView) => (
                  <HoverZoomCard
                    key={cardView.entryId}
                    logSurface="starting_deck"
                    glossaryText={cardView.glossaryText}
                    testId={cardView.testId}
                  >
                    <GameCard card={cardView.card} suppressHoverHelp />
                  </HoverZoomCard>
                ))}
              </div>
            )}
          </GlassDialog>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
