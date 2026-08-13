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
          "[battle] Dreamwell history title.",
        )}
      subtitle={tx(
          "Shared draws, most recent first.",
          "[battle] Dreamwell history subtitle.",
        )}
      closeLabel={tx(
          "Close Dreamwell history",
          "[battle] Dreamwell history close action.",
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
              "[battle] Dreamwell history empty.",
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
