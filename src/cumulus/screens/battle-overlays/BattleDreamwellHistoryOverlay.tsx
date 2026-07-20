import type { ReactElement } from "react";
import {
  DreamwellCard,
  type DreamwellCardModel,
} from "../../components/battle/DreamwellCard";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { token } from "../../primitives/tokens";

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
  return (
    <GlassDialog
      title="Dreamwell History"
      subtitle="Shared draws, most recent first."
      closeLabel="Close Dreamwell history"
      onClose={onClose}
      desktopCenterTarget="battlefield"
    >
      <div
        className="cumulus"
        data-battle-dreamwell-history-drawer=""
        data-battle-region="dreamwell-history"
        style={{
          display: "grid",
          gap: token("--space-4"),
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
            No Dreamwell cards drawn yet.
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
