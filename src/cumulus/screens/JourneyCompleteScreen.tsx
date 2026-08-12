import type { ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import {
  DreamAvatarPortrait,
  type DreamAvatarVisual,
} from "../components/hud/DreamAvatarPortrait";
import { EssenceValue } from "../components/hud/EssenceValue";
import { Motes } from "../components/hud/Motes";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { token } from "../primitives/tokens";
import {
  JOURNEY_RESULT_BOTTOM_SAFE_PADDING,
  JOURNEY_RESULT_CHROME_GRADIENT,
  JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX,
  JOURNEY_RESULT_TOP_CHROME_CLEARANCE,
} from "./journey-result-layout";
import { tx, txa, plural, one, other, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../runtime/localization/use-localizer";

export interface JourneyCompleteStatView {
  id: "battles" | "dreamscapes" | "cards" | "dreamsigns" | "essence";
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
  const resolve = useLocalizer();
  const statLabel = (stat: JourneyCompleteStatView): LocalizedString => {
    switch (stat.id) {
      case "battles":
        return txa(plural(stat.value, [one("Battle Won"), other("Battles Won")]), {}, "Label beneath the completed Journey's number of battles won. The number is rendered separately above.");
      case "dreamscapes":
        return txa(plural(stat.value, [one("Dreamscape"), other("Dreamscapes")]), {}, "Label beneath the number of Dreamscapes in a completed Journey. The number is rendered separately above.");
      case "cards":
        return tx("Final Deck", "Label beneath the number of cards in the completed Journey's final deck.");
      case "dreamsigns":
        return txa(plural(stat.value, [one("Dreamsign"), other("Dreamsigns")]), {}, "Label beneath the number of Dreamsigns in a completed Journey. The number is rendered separately above.");
      case "essence":
        return tx("Essence Remaining", "Label beneath the remaining Essence at the end of a Journey.");
    }
  };

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
          padding: `${JOURNEY_RESULT_TOP_CHROME_CLEARANCE} ${token("--space-l")} ${JOURNEY_RESULT_BOTTOM_SAFE_PADDING}`,
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
                {resolve(tx(
                  "Journey Complete",
                  "Player-facing message for the journey complete title interface state.",
                ))}
              </h1>
            </header>

            {view.dreamAvatar !== null && (
              <div
                data-journey-complete-section="portrait"
                data-journey-complete-dream-avatar={view.dreamAvatar.id}
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
              data-journey-complete-section="stats"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                paddingBlock: token("--space-l"),
                boxSizing: "border-box",
              }}
            >
              <GlassPanel testId="journey-complete-summary-panel">
                <div style={{ padding: token("--space-l") }}>
                  <dl
                    data-journey-complete-summary=""
                    style={{
                      margin: 0,
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: token("--space-m"),
                    }}
                  >
                    {view.stats.map((stat) => (
                      <SummaryStat
                        key={stat.id}
                        stat={stat}
                        label={statLabel(stat)}
                      />
                    ))}
                  </dl>
                </div>
              </GlassPanel>
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
              label={tx(
                "New Journey",
                "Command that starts a fresh Journey from a menu or terminal Journey result.",
              )}
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

function SummaryStat({
  stat,
  label,
}: {
  readonly stat: JourneyCompleteStatView;
  readonly label: LocalizedString;
}) {
  const resolve = useLocalizer();
  return (
    <div
      data-journey-complete-stat={stat.id}
      style={{
        gridColumn: stat.id === "essence" ? "1 / -1" : undefined,
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
          color:
            stat.kind === "essence"
              ? token("--essence")
              : token("--text-primary"),
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
          color: token("--text-on-glass-muted"),
        }}
      >
        {resolve(label)}
      </dt>
    </div>
  );
}
