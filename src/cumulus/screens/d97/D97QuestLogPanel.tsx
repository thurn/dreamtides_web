// D97QuestLogPanel — the quest log: the one held quest under the panel's
// title (its name, who gave it, its current step, the items it has the
// player carry and what it pays) and Abandon, which is free; or a line saying
// no quest is held. Escape or the close disc closes it, returning focus to
// the control that opened it. PURE: it renders from a view model and reports
// Abandon and Close.

import type { ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { token } from "../../primitives/tokens";
import { useEscapeToClose } from "../../primitives/use-escape-to-close";
import type { D97QuestId } from "../../../types/identifiers";
import { D97Panel } from "./D97Panel";
import { D97RewardLine, type D97RewardView } from "./D97RewardLine";

export interface D97QuestLogQuestView {
  readonly questId: D97QuestId;
  readonly title: string;
  /** "active" while a step remains, "ready" when only the turn-in does. */
  readonly status: "active" | "ready";
  /** Who gave the quest, as a line, or null when the giver has no name to show. */
  readonly giverLine: string | null;
  /** The current step's line, or the turn-in line once ready. */
  readonly stepLine: string;
  /** Names of the quest items the player carries. */
  readonly items: readonly string[];
  /** What turning the quest in pays. */
  readonly reward: D97RewardView;
}

export interface D97QuestLogView {
  readonly title: string;
  readonly quest: D97QuestLogQuestView | null;
  readonly emptyLine: string;
  readonly itemsLabel: string;
  readonly rewardLabel: string;
  readonly abandonLabel: string;
}

export interface D97QuestLogPanelProps {
  readonly view: D97QuestLogView;
  readonly onAbandon: (questId: D97QuestId) => void;
  readonly onClose: () => void;
}

export function D97QuestLogPanel({ view, onAbandon, onClose }: D97QuestLogPanelProps): ReactElement {
  useEscapeToClose(onClose);
  const quest = view.quest;
  return (
    <D97Panel kind="quest-log" title={view.title} onClose={onClose}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: token("--space-xxs") }}>
              <h3 data-d97-quest-title="" style={{ margin: 0, font: token("--t-lead"), color: token("--text-on-glass") }}>
                {quest.title}
              </h3>
              {quest.giverLine !== null && (
                <p data-d97-quest-giver="" style={{ margin: 0, font: token("--t-body-sm"), color: token("--text-on-glass-muted") }}>
                  {quest.giverLine}
                </p>
              )}
            </div>
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
            <D97RewardLine label={view.rewardLabel} reward={quest.reward} surface="glass" />
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
    </D97Panel>
  );
}
