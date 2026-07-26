import type { ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { GroupPanel } from "../components/controls/GroupPanel";
import {
  DreamAvatarPortrait,
  type DreamAvatarVisual,
} from "../components/hud/DreamAvatarPortrait";
import { Motes } from "../components/hud/Motes";
import { token } from "../primitives/tokens";
import type {
  QuestFailureBattleResult,
  QuestFailureReason,
} from "../../types/quest";
import {
  QUEST_RESULT_BOTTOM_SAFE_PADDING,
  QUEST_RESULT_CHROME_GRADIENT,
  QUEST_RESULT_CONTENT_MAX_WIDTH_PX,
  QUEST_RESULT_TOP_CHROME_CLEARANCE,
} from "./quest-result-layout";

export interface QuestFailedStatView {
  id: "battles" | "round" | "playerScore" | "enemyScore";
  label: string;
  value: number;
}

export interface QuestFailedDreamAvatarView extends DreamAvatarVisual {
  id: string;
  ability: string;
}

export interface QuestFailedView {
  result: QuestFailureBattleResult;
  reason: QuestFailureReason;
  title: string;
  message: string;
  reasonLabel: string;
  dreamAvatar: QuestFailedDreamAvatarView | null;
  stats: readonly QuestFailedStatView[];
}

export interface QuestFailedScreenProps {
  view: QuestFailedView | null;
  onNewQuest: () => void;
}

/** The sparse Cumulus quest-failure summary, paired with the victory surface. */
export function QuestFailedScreen({
  view,
  onNewQuest,
}: QuestFailedScreenProps): ReactElement {
  return (
    <div
      className="cumulus"
      data-testid="cumulus-quest-failed-screen"
      {...(view === null
        ? {}
        : {
            "data-quest-failed-screen": view.result,
            "data-quest-failed-reason": view.reason,
          })}
      style={{
        position: "fixed",
        inset: 0,
        minHeight: "100dvh",
        overflow: "hidden",
        background: token("--bg-app"),
        color: token("--text-primary"),
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            `radial-gradient(circle at 50% 8%, ${token("--danger")} 0%, transparent 42%), ` +
            QUEST_RESULT_CHROME_GRADIENT,
          opacity: 0.72,
        }}
      />
      <Motes on tint="violet" count={18} seed={91} />

      <main
        data-quest-failed-content=""
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: `${QUEST_RESULT_TOP_CHROME_CLEARANCE} ${token("--space-6")} ${QUEST_RESULT_BOTTOM_SAFE_PADDING}`,
          boxSizing: "border-box",
          display: "flex",
          justifyContent: "center",
          zIndex: 3,
        }}
      >
        {view === null ? (
          <p
            style={{
              margin: "auto",
              maxWidth: QUEST_RESULT_CONTENT_MAX_WIDTH_PX,
              font: token("--t-body"),
              color: token("--text-muted"),
              textAlign: "center",
            }}
          >
            Quest failure summary not found. Return to the quest menu to begin
            again.
          </p>
        ) : (
          <div
            style={{
              width: "100%",
              maxWidth: QUEST_RESULT_CONTENT_MAX_WIDTH_PX,
              minHeight: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
            }}
          >
            <div
              data-quest-failed-hierarchy=""
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <header
                data-quest-failed-section="title"
                style={{ textAlign: "center" }}
              >
                <h1
                  style={{
                    margin: 0,
                    font: token("--t-title"),
                    color: token("--text-primary"),
                  }}
                >
                  {view.title}
                </h1>
                <p
                  style={{
                    margin: `${token("--space-3")} 0 0`,
                    font: token("--t-body"),
                    color: token("--text-muted"),
                  }}
                >
                  {view.message}
                </p>
              </header>

              {view.dreamAvatar !== null && (
                <div
                  data-quest-failed-section="portrait"
                  data-quest-failed-dream-avatar={view.dreamAvatar.id}
                  style={{
                    alignSelf: "center",
                    display: "flex",
                    lineHeight: 0,
                    marginTop: token("--space-6"),
                  }}
                >
                  <DreamAvatarPortrait
                    dreamAvatar={view.dreamAvatar}
                    variant="panel"
                    size={112}
                    profile={{
                      id: view.dreamAvatar.id,
                      ability: view.dreamAvatar.ability,
                    }}
                  />
                </div>
              )}

              <div
                data-quest-failed-section="stats"
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  paddingBlock: token("--space-6"),
                  boxSizing: "border-box",
                }}
              >
                <GroupPanel>
                  <p
                    data-quest-failed-reason={view.reason}
                    style={{
                      margin: 0,
                      font: token("--t-eyebrow"),
                      letterSpacing: token("--tracking-eyebrow"),
                      textTransform: "uppercase",
                      textAlign: "center",
                      color: token("--danger"),
                    }}
                  >
                    {view.reasonLabel}
                  </p>
                  <dl
                    data-quest-failed-summary=""
                    style={{
                      margin: `${token("--space-5")} 0 0`,
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: token("--space-5"),
                    }}
                  >
                    {view.stats.map((stat) => (
                      <SummaryStat key={stat.id} stat={stat} />
                    ))}
                  </dl>
                </GroupPanel>
              </div>
            </div>

            <div
              data-quest-failed-action="start-new-run"
              style={{
                flexShrink: 0,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <GlassButton
                label="New Quest"
                variant="accent"
                onPress={onNewQuest}
                testId="quest-failed-start-new-run"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryStat({ stat }: { readonly stat: QuestFailedStatView }) {
  return (
    <div
      data-quest-failed-stat={stat.id}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-2"),
        textAlign: "center",
      }}
    >
      <dd
        style={{
          margin: 0,
          font: token("--t-title-sm"),
          color: token("--text-primary"),
        }}
      >
        {stat.value}
      </dd>
      <dt
        style={{
          font: token("--t-eyebrow"),
          letterSpacing: token("--tracking-eyebrow"),
          textTransform: "uppercase",
          color: token("--text-muted"),
        }}
      >
        {stat.label}
      </dt>
    </div>
  );
}
