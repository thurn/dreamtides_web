// D97SliceEndScreen — the end of the M1 slice, reached by stepping through
// the exit door's veil: the run's Avatar and a summary of the run (battles,
// opponents beaten, collection, active deck, Essence). It names no dream.
// PURE: it renders from a view model and reports New Run.

import type { ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { AvatarPortrait, type AvatarVisual } from "../../components/hud/AvatarPortrait";
import { EssenceValue } from "../../components/hud/EssenceValue";
import { Motes } from "../../components/hud/Motes";
import { GlassPanel } from "../../components/overlay/GlassPanel";
import { token } from "../../primitives/tokens";
import {
  JOURNEY_RESULT_BOTTOM_SAFE_PADDING,
  JOURNEY_RESULT_CHROME_GRADIENT,
  JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX,
  JOURNEY_RESULT_TOP_CHROME_CLEARANCE,
} from "../journey-result-layout";
import type { AvatarId } from "../../../types/identifiers";

export interface D97SliceEndStatView {
  readonly id: "battles" | "beaten" | "collection" | "deck" | "essence";
  readonly value: number;
  readonly kind: "number" | "essence";
}

export interface D97SliceEndView {
  readonly avatar: (AvatarVisual & { readonly id: AvatarId; readonly ability: string }) | null;
  readonly stats: readonly D97SliceEndStatView[];
}

export interface D97SliceEndScreenProps {
  readonly view: D97SliceEndView;
  /** Null when no new run can be started from here. */
  readonly onNewRun: (() => void) | null;
}

/** Portrait width in the summary. */
const PORTRAIT_WIDTH = 112;

function statLabel(stat: D97SliceEndStatView): string {
  switch (stat.id) {
    case "battles":
      return stat.value === 1 ? "Battle Fought" : "Battles Fought";
    case "beaten":
      return stat.value === 1 ? "Opponent Beaten" : "Opponents Beaten";
    case "collection":
      return "Cards Owned";
    case "deck":
      return "Active Deck";
    case "essence":
      return "Essence";
  }
}

export function D97SliceEndScreen({ view, onNewRun }: D97SliceEndScreenProps): ReactElement {
  return (
    <div
      className="cumulus"
      data-testid="d97-slice-end-screen"
      style={{ position: "fixed", inset: 0, minHeight: "100dvh", overflow: "hidden", background: token("--bg-app"), color: token("--text-primary") }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 8%, ${token("--accent-tint")} 0%, transparent 44%), ${JOURNEY_RESULT_CHROME_GRADIENT}`,
        }}
      />
      <Motes on tint="warm" count={18} seed={97} />
      <main
        data-d97-slice-end-content=""
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
        <div style={{ width: "100%", maxWidth: JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX, minHeight: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <header data-d97-slice-end-section="title" style={{ textAlign: "center" }}>
              <h1 style={{ margin: 0, font: token("--t-title"), color: token("--text-primary") }}>{"Through the Veil"}</h1>
            </header>
            {view.avatar !== null && (
              <div
                data-d97-slice-end-section="portrait"
                data-d97-slice-end-avatar={view.avatar.id}
                style={{ alignSelf: "center", display: "flex", width: PORTRAIT_WIDTH, lineHeight: 0, marginTop: token("--space-l") }}
              >
                <AvatarPortrait avatar={view.avatar} variant="panel" profile={{ id: view.avatar.id, ability: view.avatar.ability }} />
              </div>
            )}
            <div
              data-d97-slice-end-section="stats"
              style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingBlock: token("--space-l"), boxSizing: "border-box" }}
            >
              <GlassPanel testId="d97-slice-end-summary-panel">
                <div style={{ padding: token("--space-l") }}>
                  <dl
                    data-d97-slice-end-summary=""
                    style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: token("--space-m") }}
                  >
                    {view.stats.map((stat) => (
                      <div
                        key={stat.id}
                        data-d97-slice-end-stat={stat.id}
                        style={{
                          gridColumn: stat.id === "essence" ? "1 / -1" : undefined,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: token("--space-xs"),
                          textAlign: "center",
                        }}
                      >
                        <dd style={{ margin: 0, font: token("--t-title-sm"), color: stat.kind === "essence" ? token("--essence") : token("--text-primary") }}>
                          {stat.kind === "essence" ? <EssenceValue amount={stat.value} /> : stat.value}
                        </dd>
                        <dt
                          style={{
                            font: token("--t-eyebrow"),
                            letterSpacing: token("--tracking-eyebrow"),
                            textTransform: "uppercase",
                            color: token("--text-on-glass-muted"),
                          }}
                        >
                          {statLabel(stat)}
                        </dt>
                      </div>
                    ))}
                  </dl>
                </div>
              </GlassPanel>
            </div>
          </div>
          {onNewRun !== null && (
            <div data-d97-slice-end-action="new-run" style={{ flexShrink: 0, display: "flex", justifyContent: "center" }}>
              <GlassButton label={"New Run"} variant="accent" onPress={onNewRun} testId="d97-slice-end-new-run" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
