import {
  DreamwellCardView,
  type DreamwellCardViewData,
} from "../../components/DreamwellCardView";
import type { BattleSide } from "../types";

/**
 * The Dreamwell card surfaced during a side's Dreamwell phase, centered above
 * the battlefield (rules §The Dreamwell and Energy). The card appears in place
 * while the Dreamwell phase is active and is dismissed when the side clicks
 * through to the next phase.
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
      {visible && card !== null ? (
        <div
          data-battle-dreamwell-card={card.id}
          data-battle-dreamwell-side={side}
          style={{
            width: "min(64vw, 46vh)",
            pointerEvents: "auto",
          }}
        >
          <DreamwellCardView card={card} />
        </div>
      ) : null}
    </div>
  );
}
