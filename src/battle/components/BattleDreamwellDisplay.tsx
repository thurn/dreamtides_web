import {
  DreamwellCardView,
  type DreamwellCardViewData,
} from "../../components/DreamwellCardView";
import type { BattleSide } from "../types";
import { AutomationGearIcon } from "./AutomationGearIcon";

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
  automationStatus,
  automationEnabled,
}: {
  card: DreamwellCardViewData | null;
  side: BattleSide;
  visible: boolean;
  automationStatus: "auto" | "manual" | "none";
  automationEnabled: boolean;
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
          // Key on the card identity so a card change mounts a fresh subtree
          // (and fresh `<img>` elements) rather than reusing the prior card's
          // DOM — a reused `<img>` keeps painting the old art until the new
          // source decodes, which would flash the previous Dreamwell card.
          key={card.id}
          data-battle-dreamwell-card={card.id}
          data-battle-dreamwell-side={side}
          data-battle-dreamwell-automation={automationStatus}
          style={{
            position: "relative",
            width: "min(64vw, 46vh)",
            pointerEvents: "auto",
          }}
        >
          <DreamwellCardView card={card} />
          {automationEnabled && automationStatus !== "none" ? (
            <AutomationGearIcon
              style={{
                position: "absolute",
                top: "13%",
                left: "7%",
                width: "9%",
                height: "auto",
                filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55))",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
          ) : null}
          {automationStatus !== "none" ? (
            <div
              style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                background: "rgba(20, 20, 30, 0.85)",
                color: "#e8e0ff",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                padding: "2px 8px",
                borderRadius: "999px",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {automationStatus === "auto" ? "Auto" : "Manual"}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
