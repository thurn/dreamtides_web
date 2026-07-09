// StartingDeckOverlay — the Tango presentational overlay for the starting-deck
// reveal.
//
// The first time a run has a Dreamcaller and has not yet seen its deck, the app
// shows the player the cards they begin the quest with. This is that popup: a
// CardGalleryPanel with the same left-aligned title/subtitle, trailing close
// accessory, and internal card-grid scroll used by card-selection sites.
//
// The body is a scrolling grid of the starting cards in acquisition order. Each
// GameCard grows in place on hover (desktop) or press (mobile) for a legible
// read — that hover-zoom and its glossary stack live inside GameCard itself. On
// a roomy desktop the dialog widens (`wide`) and the grid columns enlarge so the
// ten-card starter deck fits as two rows without internal scrolling. The content
// is intentionally minimal — the title, one line of intro copy, and the cards;
// there are no filter, sort, or "Continue" controls. Dismissal is the close disc
// or Escape.
//
// PURE: renders from a view-model (`starting-deck-view-model.ts` builds it from
// live quest state in the adapter) and reports dismissal through `onClose`.

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData } from "../../types/cards";
import { CardGalleryPanel } from "../components/card/CardGalleryPanel";
import { GlassBackdrop } from "../components/overlay/GlassDialog";
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
  /** The resolved card to paint. */
  card: CardData;
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
 * A roomy desktop is wide AND tall enough to lay the ten-card starter deck out
 * as an enlarged 5x2 grid without internal scroll, so the overlay widens its
 * panel and grid there.
 */
const ROOMY_DESKTOP_QUERY = "(min-width: 1400px) and (min-height: 800px)";

/** Tracks whether the viewport matches {@link ROOMY_DESKTOP_QUERY}. */
function useRoomyDesktop(): boolean {
  const [roomy, setRoomy] = useState<boolean>(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia(ROOMY_DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }
    const query = window.matchMedia(ROOMY_DESKTOP_QUERY);
    const onChange = (): void => setRoomy(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  return roomy;
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
  const roomyDesktop = useRoomyDesktop();
  const wideDesktop = isDesktop && roomyDesktop;

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
          className="tango"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isDesktop
              ? wideDesktop
                ? token("--space-8")
                : token("--space-7")
              : 0,
          }}
        >
          {!isDesktop && <GlassBackdrop />}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              width: "100%",
              height: isDesktop
                ? wideDesktop
                  ? `calc(100vh - ${token("--space-8")} - ${token("--space-8")})`
                  : "85vh"
                : "100%",
              maxWidth: isDesktop
                ? wideDesktop
                  ? "min(1120px, 90vw)"
                  : "min(900px, 90vw)"
                : undefined,
              maxHeight: isDesktop
                ? wideDesktop
                  ? `calc(100vh - ${token("--space-8")} - ${token("--space-8")})`
                  : "85vh"
                : undefined,
              minHeight: 0,
              display: "flex",
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
              columns="auto"
              cardSize={roomyDesktop ? "roomy" : "standard"}
              cutoutAwareAccessory
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
