// D97QuestLogPanel — the quest log: the one held quest, its current step,
// the items it has the player carry, and Abandon (which is free); or a line
// saying no quest is held. PURE: it renders from a view model and reports
// Abandon and Close.

import type { ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { token } from "../../primitives/tokens";
import type { D97QuestId } from "../../../types/identifiers";

export interface D97QuestLogQuestView {
  readonly questId: D97QuestId;
  readonly title: string;
  /** "active" while a step remains, "ready" when only the turn-in does. */
  readonly status: "active" | "ready";
  /** The current step's line, or the turn-in line once ready. */
  readonly stepLine: string;
  /** Names of the quest items the player carries. */
  readonly items: readonly string[];
}

export interface D97QuestLogView {
  readonly title: string;
  readonly quest: D97QuestLogQuestView | null;
  readonly emptyLine: string;
  readonly itemsLabel: string;
  readonly abandonLabel: string;
}

export interface D97QuestLogPanelProps {
  readonly view: D97QuestLogView;
  readonly onAbandon: (questId: D97QuestId) => void;
  readonly onClose: () => void;
}

export function D97QuestLogPanel({ view, onAbandon, onClose }: D97QuestLogPanelProps): ReactElement {
  const quest = view.quest;
  return (
    <GlassDialog title={view.title} presentation="popup" onClose={onClose}>
      <div
        data-d97-quest-log=""
        data-d97-quest-id={quest?.questId ?? ""}
        data-d97-quest-status={quest?.status ?? "none"}
        style={{ display: "flex", flexDirection: "column", gap: token("--space-m") }}
      >
        {quest === null ? (
          <p style={{ margin: 0, font: token("--t-body"), color: token("--text-on-glass-muted") }}>{view.emptyLine}</p>
        ) : (
          <>
            <h3 style={{ margin: 0, font: token("--t-title"), color: token("--text-on-glass") }}>{quest.title}</h3>
            <p data-d97-quest-step="" style={{ margin: 0, font: token("--t-body"), color: token("--text-on-glass") }}>
              {quest.stepLine}
            </p>
            {quest.items.length > 0 && (
              <p
                data-d97-quest-items={String(quest.items.length)}
                style={{ margin: 0, font: token("--t-body"), color: token("--text-on-glass-muted") }}
              >
                {`${view.itemsLabel} ${quest.items.join(", ")}`}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <GlassButton
                label={view.abandonLabel}
                variant="danger"
                placement="onGlass"
                testId="d97-quest-abandon"
                onPress={() => onAbandon(quest.questId)}
              />
            </div>
          </>
        )}
      </div>
    </GlassDialog>
  );
}
