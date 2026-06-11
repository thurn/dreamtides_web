import { AnimatePresence, motion } from "framer-motion";
import {
  DreamwellCardView,
  type DreamwellCardViewData,
} from "../../components/DreamwellCardView";
import type { BattleSide } from "../types";

/**
 * The Dreamwell card surfaced during a side's Dreamwell phase, centered above
 * the battlefield (rules §The Dreamwell and Energy). The card animates in
 * quickly from the bottom of the screen on the player's turn and from the top on
 * the opponent's turn, matching the side whose Dreamwell card is being revealed,
 * then is dismissed when the side clicks through to the next phase.
 *
 * The overlay container ignores pointer events so it never blocks the board; the
 * card itself re-enables them so its on-hover glossary panel still works.
 */
export function BattleDreamwellDisplay({
  card,
  side,
  visible,
}: {
  card: DreamwellCardViewData | null;
  side: BattleSide;
  visible: boolean;
}) {
  // Player cards rise from the bottom of the screen; opponent cards drop from
  // the top, so each reveal reads as coming from its owner's edge.
  const offscreenY = side === "player" ? "120vh" : "-120vh";

  return (
    <div
      data-battle-region="dreamwell-display"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 40,
      }}
    >
      <AnimatePresence>
        {visible && card !== null ? (
          <motion.div
            key={card.id}
            data-battle-dreamwell-card={card.id}
            data-battle-dreamwell-side={side}
            initial={{ y: offscreenY, opacity: 0.2 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: offscreenY, opacity: 0 }}
            transition={{ type: "tween", duration: 0.32, ease: "easeOut" }}
            style={{
              width: "min(64vw, 46vh)",
              pointerEvents: "auto",
            }}
          >
            <DreamwellCardView card={card} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
