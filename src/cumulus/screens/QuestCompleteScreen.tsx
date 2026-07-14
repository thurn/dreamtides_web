import type { ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { GroupPanel } from "../components/controls/GroupPanel";
import { EssenceValue } from "../components/hud/EssenceValue";
import { Motes } from "../components/hud/Motes";
import { token } from "../primitives/tokens";
import { MENU_BUTTON_PX, MENU_EDGE_INSET_MOBILE_PX } from "./chrome-geometry";

export interface QuestCompleteStatView {
  id: "battles" | "dreamscapes" | "cards" | "dreamsigns" | "essence";
  label: string;
  value: number;
  kind: "number" | "essence";
}

export interface QuestCompleteView {
  stats: readonly QuestCompleteStatView[];
}

export interface QuestCompleteScreenProps {
  view: QuestCompleteView;
  onNewQuest: () => void;
}

const CONTENT_MAX_WIDTH_PX = 440;
const TOP_CHROME_CLEARANCE =
  `calc(max(var(--safe-area-inset-top), ${token("--safe-top")}, ` +
  `calc(max(var(--safe-area-inset-top), ${String(MENU_EDGE_INSET_MOBILE_PX)}px) + ${String(MENU_BUTTON_PX)}px)) + ${token("--space-5")})`;
const BOTTOM_SAFE_PADDING =
  `calc(max(var(--safe-area-inset-bottom), ${token("--safe-bottom")}) + ${token("--space-6")})`;

/** The sparse Cumulus victory summary, designed around a narrow mobile stage. */
export function QuestCompleteScreen({
  view,
  onNewQuest,
}: QuestCompleteScreenProps): ReactElement {
  return (
    <div
      className="cumulus"
      data-testid="cumulus-quest-complete-screen"
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
            `linear-gradient(180deg, ${token("--surface-chrome-strong")} 0%, ${token("--bg-app")} 72%)`,
        }}
      />
      <Motes on tint="warm" count={18} seed={77} />

      <main
        data-quest-complete-content=""
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: `${TOP_CHROME_CLEARANCE} ${token("--space-6")} ${BOTTOM_SAFE_PADDING}`,
          boxSizing: "border-box",
          display: "flex",
          justifyContent: "center",
          zIndex: 3,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: CONTENT_MAX_WIDTH_PX,
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: token("--space-8"),
            }}
          >
            <header style={{ textAlign: "center" }}>
              <h1
                style={{
                  margin: 0,
                  font: token("--t-title"),
                  color: token("--text-primary"),
                }}
              >
                Quest Complete
              </h1>
            </header>

            <GroupPanel>
              <dl
                data-quest-complete-summary=""
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

          <div
            data-quest-complete-action="new-quest"
            style={{
              flexShrink: 0,
              display: "flex",
              justifyContent: "center",
              paddingTop: token("--space-8"),
            }}
          >
            <GlassButton
              label="New Quest"
              variant="accent"
              onPress={onNewQuest}
              testId="quest-complete-new-quest"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryStat({ stat }: { readonly stat: QuestCompleteStatView }) {
  return (
    <div
      data-quest-complete-stat={stat.id}
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
          color: stat.kind === "essence" ? token("--essence") : token("--gold"),
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
