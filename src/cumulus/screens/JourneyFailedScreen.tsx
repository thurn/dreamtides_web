import type { ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import {
  DreamAvatarPortrait,
  type DreamAvatarVisual,
} from "../components/hud/DreamAvatarPortrait";
import { Motes } from "../components/hud/Motes";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { token } from "../primitives/tokens";
import type {
  JourneyFailureBattleResult,
  JourneyFailureReason,
} from "../../types/journey";
import {
  JOURNEY_RESULT_BOTTOM_SAFE_PADDING,
  JOURNEY_RESULT_CHROME_GRADIENT,
  JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX,
  JOURNEY_RESULT_TOP_CHROME_CLEARANCE,
} from "./journey-result-layout";
import { useMessages } from "../hooks/use-messages";

export interface JourneyFailedStatView {
  id: "battles" | "round" | "playerScore" | "enemyScore";
  value: number;
}

export interface JourneyFailedDreamAvatarView extends DreamAvatarVisual {
  id: string;
  ability: string;
}

export interface JourneyFailedView {
  result: JourneyFailureBattleResult;
  reason: JourneyFailureReason;
  dreamAvatar: JourneyFailedDreamAvatarView | null;
  stats: readonly JourneyFailedStatView[];
}

export interface JourneyFailedScreenProps {
  view: JourneyFailedView | null;
  onNewJourney: () => void;
}

/** The sparse Cumulus journey-failure summary, paired with the victory surface. */
export function JourneyFailedScreen({
  view,
  onNewJourney,
}: JourneyFailedScreenProps): ReactElement {
  const t = useMessages();
  return (
    <div
      className="cumulus"
      data-testid="cumulus-journey-failed-screen"
      {...(view === null
        ? {}
        : {
            "data-journey-failed-screen": view.result,
            "data-journey-failed-reason": view.reason,
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
            JOURNEY_RESULT_CHROME_GRADIENT,
          opacity: 0.72,
        }}
      />
      <Motes on tint="violet" count={18} seed={91} />

      <main
        data-journey-failed-content=""
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: `${JOURNEY_RESULT_TOP_CHROME_CLEARANCE} ${token("--space-l")} ${JOURNEY_RESULT_BOTTOM_SAFE_PADDING}`,
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
              maxWidth: JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX,
              font: token("--t-body"),
              color: token("--text-muted"),
              textAlign: "center",
            }}
          >
            {t("journey-failed-summary-missing")}
          </p>
        ) : (
          <div
            style={{
              width: "100%",
              maxWidth: JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX,
              minHeight: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
            }}
          >
            <div
              data-journey-failed-hierarchy=""
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <header
                data-journey-failed-section="title"
                style={{ textAlign: "center" }}
              >
                <h1
                  style={{
                    margin: 0,
                    font: token("--t-title"),
                    color: token("--text-primary"),
                  }}
                >
                  {t("journey-failed-title", { result: view.result })}
                </h1>
                <p
                  style={{
                    margin: `${token("--space-xs")} 0 0`,
                    font: token("--t-body"),
                    color: token("--text-muted"),
                  }}
                >
                  {t("journey-failed-message", { result: view.result })}
                </p>
              </header>

              {view.dreamAvatar !== null && (
                <div
                  data-journey-failed-section="portrait"
                  data-journey-failed-dream-avatar={view.dreamAvatar.id}
                  style={{
                    alignSelf: "center",
                    display: "flex",
                    width: 112,
                    lineHeight: 0,
                    marginTop: token("--space-l"),
                  }}
                >
                  <DreamAvatarPortrait
                    dreamAvatar={view.dreamAvatar}
                    variant="panel"
                    profile={{
                      id: view.dreamAvatar.id,
                      ability: view.dreamAvatar.ability,
                    }}
                  />
                </div>
              )}

              <div
                data-journey-failed-section="stats"
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  paddingBlock: token("--space-l"),
                  boxSizing: "border-box",
                }}
              >
                <GlassPanel testId="journey-failed-summary-panel">
                  <div style={{ padding: token("--space-l") }}>
                    <p
                      data-journey-failed-reason={view.reason}
                      style={{
                        margin: 0,
                        font: token("--t-eyebrow"),
                        letterSpacing: token("--tracking-eyebrow"),
                        textTransform: "uppercase",
                        textAlign: "center",
                        color: token("--danger"),
                      }}
                    >
                      {t("journey-failed-reason", { reason: view.reason })}
                    </p>
                    <dl
                      data-journey-failed-summary=""
                      style={{
                        margin: `${token("--space-m")} 0 0`,
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: token("--space-m"),
                      }}
                    >
                      {view.stats.map((stat) => (
                        <SummaryStat key={stat.id} stat={stat} />
                      ))}
                    </dl>
                  </div>
                </GlassPanel>
              </div>
            </div>

            <div
              data-journey-failed-action="start-new-run"
              style={{
                flexShrink: 0,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <GlassButton
                label={t("journey-failed-new-journey-action")}
                variant="accent"
                onPress={onNewJourney}
                testId="journey-failed-start-new-run"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryStat({ stat }: { readonly stat: JourneyFailedStatView }) {
  const t = useMessages();
  return (
    <div
      data-journey-failed-stat={stat.id}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-xs"),
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
          color: token("--text-on-glass-muted"),
        }}
      >
        {t("journey-failed-stat-label", { stat: stat.id })}
      </dt>
    </div>
  );
}
