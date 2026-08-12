import { tx } from "@trox/runtime";
import type { ReactElement } from "react";
import {
  DreamwellCard,
  type DreamwellCardModel,
} from "../../components/battle/DreamwellCard";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { token } from "../../primitives/tokens";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

export interface BattleDreamwellHistoryEntryView {
  readonly entryId: string;
  readonly cardId: string;
  readonly model: DreamwellCardModel;
}

export interface BattleDreamwellHistoryOverlayProps {
  readonly entries: readonly BattleDreamwellHistoryEntryView[];
  readonly onClose: () => void;
}

/** Pure Cumulus presentation for the shared Dreamwell draw history. */
export function BattleDreamwellHistoryOverlay({
  entries,
  onClose,
}: BattleDreamwellHistoryOverlayProps): ReactElement {
  const resolve = useLocalizer();
  return (
    <GlassDialog
      title={tx(
          "Dreamwell History",
          "Player-facing message for the battle dreamwell history title interface state.",
        )}
      subtitle={tx(
          "Shared draws, most recent first.",
          "Player-facing message for the battle dreamwell history subtitle interface state.",
        )}
      closeLabel={tx(
          "Close Dreamwell history",
          "Player-facing message for the battle dreamwell history close action interface state.",
        )}
      onClose={onClose}
      desktopCenterTarget="battlefield"
    >
      <div
        className="cumulus"
        data-battle-dreamwell-history-drawer=""
        data-battle-region="dreamwell-history"
        style={{
          display: "grid",
          gap: token("--space-s"),
          maxHeight: "58vh",
          overflowY: "auto",
        }}
      >
        {entries.length === 0 ? (
          <p
            style={{
              color: token("--text-on-glass-muted"),
              font: token("--t-body"),
            }}
          >
            {resolve(tx(
              "No Dreamwell cards drawn yet.",
              "Player-facing message for the battle dreamwell history empty interface state.",
            ))}
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.entryId}
              data-battle-dreamwell-history-card={entry.cardId}
              style={{ display: "grid" }}
            >
              <DreamwellCard model={entry.model} />
            </div>
          ))
        )}
      </div>
    </GlassDialog>
  );
}
