import type { ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { GroupPanel } from "../components/controls/GroupPanel";
import {
  DreamAvatarPortrait,
  type DreamAvatarVisual,
} from "../components/hud/DreamAvatarPortrait";
import { EssenceValue } from "../components/hud/EssenceValue";
import { Motes } from "../components/hud/Motes";
import { token } from "../primitives/tokens";
import {
  JOURNEY_RESULT_BOTTOM_SAFE_PADDING,
  JOURNEY_RESULT_CHROME_GRADIENT,
  JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX,
  JOURNEY_RESULT_TOP_CHROME_CLEARANCE,
} from "./journey-result-layout";

export interface JourneyCompleteStatView {
  id: "battles" | "dreamscapes" | "cards" | "dreamsigns" | "essence";
  label: string;
  value: number;
  kind: "number" | "essence";
}

export interface JourneyCompleteDreamAvatarView extends DreamAvatarVisual {
  id: string;
  ability: string;
}

export interface JourneyCompleteView {
  dreamAvatar: JourneyCompleteDreamAvatarView | null;
  stats: readonly JourneyCompleteStatView[];
}

export interface JourneyCompleteScreenProps {
  view: JourneyCompleteView;
  onNewJourney: () => void;
}

/** The sparse Cumulus victory summary, designed around a narrow mobile stage. */
export function JourneyCompleteScreen({
  view,
  onNewJourney,
}: JourneyCompleteScreenProps): ReactElement {
  return (
    <div
      className="cumulus"
      data-testid="cumulus-journey-complete-screen"
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
            `radial-gradient(circle at 50% 8%, ${token("--accent-tint")} 0%, transparent 44%), ` +
            JOURNEY_RESULT_CHROME_GRADIENT,
        }}
      />
      <Motes on tint="warm" count={18} seed={77} />

      <main
        data-journey-complete-content=""
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: `${JOURNEY_RESULT_TOP_CHROME_CLEARANCE} ${token("--space-6")} ${JOURNEY_RESULT_BOTTOM_SAFE_PADDING}`,
          boxSizing: "border-box",
          display: "flex",
          justifyContent: "center",
          zIndex: 3,
        }}
      >
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
            data-journey-complete-hierarchy=""
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <header
              data-journey-complete-section="title"
              style={{ textAlign: "center" }}
            >
              <h1
                style={{
                  margin: 0,
                  font: token("--t-title"),
                  color: token("--text-primary"),
                }}
              >
                Journey Complete
              </h1>
            </header>

            {view.dreamAvatar !== null && (
              <div
                data-journey-complete-section="portrait"
                data-journey-complete-dream-avatar={view.dreamAvatar.id}
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
              data-journey-complete-section="stats"
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
                <dl
                  data-journey-complete-summary=""
                  style={{
                    margin: 0,
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
            data-journey-complete-action="new-journey"
            style={{
              flexShrink: 0,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <GlassButton
              label="New Journey"
              variant="accent"
              onPress={onNewJourney}
              testId="journey-complete-new-journey"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryStat({ stat }: { readonly stat: JourneyCompleteStatView }) {
  return (
    <div
      data-journey-complete-stat={stat.id}
      style={{
        gridColumn: stat.id === "essence" ? "1 / -1" : undefined,
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
          color: stat.kind === "essence" ? token("--essence") : token("--text-primary"),
        }}
      >
        {stat.kind === "essence" ? (
          <EssenceValue amount={stat.value} />
        ) : (
          stat.value
        )}
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
