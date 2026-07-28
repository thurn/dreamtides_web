import { useEffect, type ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CardGalleryPanel,
  type CardGalleryCardView,
} from "../components/card/CardGalleryPanel";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { MENU_BUTTON_PX, MENU_EDGE_INSET_MOBILE_PX } from "./chrome-geometry";
import { useIsDesktop } from "./use-is-desktop";

export interface DeckGalleryOverlayProps {
  /** Whether the gallery is mounted. */
  isOpen: boolean;
  /** Gallery heading. */
  title: string;
  /** Short supporting line beneath the heading. */
  subtitle: string;
  /** Resolved, UUID-backed deck entries in display order. */
  cards: readonly CardGalleryCardView[];
  /** Copy shown if no deck entries can be resolved. */
  emptyLabel: string;
  /** Accessible label for the close control and dialog. */
  closeLabel: string;
  /** Reserve the mobile top-left band for persistent journey menu chrome. */
  clearMobileJourneyMenu?: boolean;
  /** Dismisses the gallery. */
  onClose: () => void;
}

/**
 * Shared full-screen deck gallery used by deck reveal surfaces. It owns the
 * modal shell, responsive Cumulus gallery recipe, and Escape dismissal while
 * callers provide only their copy, resolved cards, and open state.
 */
export function DeckGalleryOverlay({
  isOpen,
  title,
  subtitle,
  cards,
  emptyLabel,
  closeLabel,
  clearMobileJourneyMenu = false,
  onClose,
}: DeckGalleryOverlayProps): ReactElement {
  const isDesktop = useIsDesktop();
  const clearsMobileMenu = !isDesktop && clearMobileJourneyMenu;
  const mobileMenuClearance =
    `calc(max(var(--safe-area-inset-top), ${String(MENU_EDGE_INSET_MOBILE_PX)}px) + ` +
    `${String(MENU_BUTTON_PX)}px + ${token("--space-4")})`;

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
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
          key="deck-gallery-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="cumulus"
          data-deck-gallery-overlay=""
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
            background: clearsMobileMenu ? token("--scrim-gallery") : undefined,
          }}
        >
          <div
            style={{
              position: "relative",
              zIndex: 1,
              width: isDesktop ? "min(100%, 1180px)" : "100%",
              height: isDesktop
                ? undefined
                : clearsMobileMenu
                  ? `calc(100% - ${mobileMenuClearance})`
                  : "100%",
              marginTop: clearsMobileMenu ? mobileMenuClearance : undefined,
              maxHeight: isDesktop
                ? `calc(100vh - ${token("--space-8")} - ${token("--space-8")})`
                : undefined,
              minHeight: 0,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <CardGalleryPanel
              title={title}
              subtitle={subtitle}
              rightAccessory={{
                kind: "iconButton",
                glyph: GLYPHS.close,
                label: closeLabel,
                onPress: onClose,
              }}
              cards={cards}
              emptyLabel={emptyLabel}
              columns={isDesktop ? "five" : "four"}
              cardSize={isDesktop ? "roomy" : "standard"}
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

export type { CardGalleryCardView as DeckGalleryCardView };
