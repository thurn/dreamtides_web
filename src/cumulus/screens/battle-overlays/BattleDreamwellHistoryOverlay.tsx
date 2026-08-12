import { localizationTodo } from "@trox/runtime";
import type { ReactElement } from "react";
import {
  DreamwellCard,
  type DreamwellCardModel,
} from "../../components/battle/DreamwellCard";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { token } from "../../primitives/tokens";
import { useMessages } from "../../hooks/use-messages";

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
  const t = useMessages();
  return (
    <GlassDialog
      title={localizationTodo(t("battle-dreamwell-history-title"))}
      subtitle={localizationTodo(t("battle-dreamwell-history-subtitle"))}
      closeLabel={localizationTodo(t("battle-dreamwell-history-close-action"))}
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
            {t("battle-dreamwell-history-empty")}
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
