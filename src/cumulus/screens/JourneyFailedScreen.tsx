import type { ReactElement } from "react";
import type { LocalizedString } from "@trox/runtime";
import { GlassButton } from "../components/controls/GlassButton";
import {
  AvatarPortrait,
  type AvatarVisual,
} from "../components/hud/AvatarPortrait";
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
import { tx } from "@trox/runtime";
import { useLocalizer } from "../../runtime/localization/use-localizer";
import type { AvatarId } from "../../types/identifiers";

export interface JourneyFailedStatView {
  id: "battles" | "round" | "playerScore" | "enemyScore";
  value: number;
}

export interface JourneyFailedAvatarView extends AvatarVisual {
  id: AvatarId;
  ability: LocalizedString;
}

export interface JourneyFailedView {
  result: JourneyFailureBattleResult;
  reason: JourneyFailureReason;
  avatar: JourneyFailedAvatarView | null;
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
  const resolve = useLocalizer();
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
            {resolve(
              tx(
                "Journey failure summary not found. Return to the journey menu to begin again.",
                "[journey] Error shown when the Journey-failure route has no persisted failure summary.",
              ),
            )}
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
                  {resolve(
                    view.result === "defeat"
                      ? tx(
                          "Journey Ended",
                          "[journey] Title when the Journey ends in defeat.",
                        )
                      : tx(
                          "Stalemate",
                          "[journey] Title when the Journey ends in a draw.",
                        ),
                  )}
                </h1>
                <p
                  style={{
                    margin: `${token("--space-xs")} 0 0`,
                    font: token("--t-body"),
                    color: token("--text-muted"),
                  }}
                >
                  {resolve(
                    view.result === "defeat"
                      ? tx(
                          "Your journey ends here.",
                          "[journey] Explanation beneath a Journey defeat title.",
                        )
                      : tx(
                          "Neither side could claim the dream.",
                          "[journey] Explanation beneath a drawn Journey title.",
                        ),
                  )}
                </p>
              </header>

              {view.avatar !== null && (
                <div
                  data-journey-failed-section="portrait"
                  data-journey-failed-avatar={view.avatar.id}
                  style={{
                    alignSelf: "center",
                    display: "flex",
                    width: 112,
                    lineHeight: 0,
                    marginTop: token("--space-l"),
                  }}
                >
                  <AvatarPortrait
                    avatar={view.avatar}
                    variant="panel"
                    profile={{
                      id: view.avatar.id,
                      ability: view.avatar.ability,
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
                      {resolve(
                        view.reason === "score_target_reached"
                          ? tx(
                              "Score Threshold Reached",
                              "[battle] [journey] Cause shown when a Journey battle ended at its score threshold.",
                            )
                          : view.reason === "turn_limit_reached"
                            ? tx(
                                "Turn Limit Reached",
                                "[battle] [journey] Cause shown when a Journey battle ended at its turn limit.",
                              )
                            : tx(
                                "Forced Result",
                                "[battle] [journey] Cause shown when a Journey battle ended with a forced result.",
                              ),
                      )}
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
                label={tx(
                  "New Journey",
                  "[journey] Command that starts a fresh Journey from a menu or terminal Journey result.",
                )}
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
  const resolve = useLocalizer();
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
        {resolve(
          stat.id === "battles"
            ? tx(
                "Battles Won",
                "[journey] Label beneath the count of battles won in a failed Journey.",
              )
            : stat.id === "round"
              ? tx(
                  "Final Round",
                  "[journey] Label beneath the final round number in a failed Journey.",
                )
              : stat.id === "playerScore"
                ? tx(
                    "Your Score",
                    "[journey] Label beneath the local player's final score in a failed Journey.",
                  )
                : tx(
                    "Opponent Score",
                    "[journey] Label beneath the opponent's final score in a failed Journey.",
                  ),
        )}
      </dt>
    </div>
  );
}
