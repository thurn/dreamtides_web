import { useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData } from "../types/cards";
import { CardDisplay } from "./CardDisplay";
import type { CardTransfigurationDisplay } from "../transfiguration/transfiguration-logic";
import { logEvent } from "../logging";

/** Props for the CardOverlay component. */
interface CardOverlayProps {
  card: CardData | null;
  onClose: () => void;
  /** Paints the enlarged overlay as transfigured when the card carries one. */
  transfiguration?: CardTransfigurationDisplay;
}

/**
 * Shows an enlarged card as a centered overlay/modal with a dark backdrop.
 * Animates in with Framer Motion scale + fade. Dismisses on backdrop click
 * or Escape key.
 */
export function CardOverlay({
  card,
  onClose,
  transfiguration,
}: CardOverlayProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (card !== null) {
      logEvent("card_preview", { cardNumber: card.cardNumber });
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
    return undefined;
  }, [card, handleKeyDown]);

  return (
    <AnimatePresence>
      {card !== null && (
        <motion.div
          key="card-overlay-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
        >
          <motion.div
            key="card-overlay-content"
            className="relative"
            style={{ width: "min(450px, 90vw)" }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <CardDisplay card={card} transfiguration={transfiguration} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
