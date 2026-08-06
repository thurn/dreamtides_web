import {
  useEffect,
  useState,
  type ReactElement,
} from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { GroupPanel } from "../components/controls/GroupPanel";
import { EssenceValue } from "../components/hud/EssenceValue";
import { Motes } from "../components/hud/Motes";
import { token } from "../primitives/tokens";
import { MOBILE_BATTLE_INSPECTOR_RAIL_TRACK } from "./mobile-battle-layout";
import { JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX } from "./journey-result-layout";

export type MobileBattleResultOutcome = "victory" | "defeat" | "draw";

export type MobileBattleResultView =
  | {
      readonly outcome: "victory";
      readonly summary: string;
      readonly essenceReward: number;
    }
  | {
      readonly outcome: "defeat" | "draw";
      readonly dismissed: boolean;
    };

export type MobileBattleResultAction =
  | "continue"
  | "dismiss"
  | "reopen"
  | "reset";

export interface BattleResultSurfaceProps {
  readonly view: MobileBattleResultView;
  readonly onAction?: (action: MobileBattleResultAction) => void;
  /** Centers the result over the playfield while the desktop inspector is docked. */
  readonly centerOnBattlefield?: boolean;
}

const REWARD_CALLOUT_MAX_WIDTH_PX = 280;
const REOPEN_CONTROL_MAX_WIDTH_PX = 220;
// Two slow Cumulus motion beats give the currency payoff time to read.
const ESSENCE_COUNT_UP_DURATION_MS = 840;

function titleFor(outcome: "defeat" | "draw"): string {
  return outcome === "defeat" ? "Defeat." : "Draw.";
}

function reopenLabel(outcome: "defeat" | "draw"): string {
  return outcome === "defeat" ? "Defeat — Reopen" : "Draw — Reopen";
}

function useEssenceCountUp(target: number): {
  readonly value: number;
  readonly complete: boolean;
} {
  const [value, setValue] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      setComplete(true);
      return;
    }

    let frame = 0;
    let startedAt: number | null = null;
    setValue(0);
    setComplete(false);

    const tick = (now: number): void => {
      startedAt ??= now;
      const progress = Math.min(
        (now - startedAt) / ESSENCE_COUNT_UP_DURATION_MS,
        1,
      );
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        setComplete(true);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target]);

  return { value, complete };
}

function ReopenControl({
  outcome,
  onAction,
}: {
  readonly outcome: "defeat" | "draw";
  readonly onAction?: (action: MobileBattleResultAction) => void;
}): ReactElement {
  return (
    <div
      className="cumulus"
      data-battle-result-reopen={outcome}
      style={{
        position: "fixed",
        right: `max(var(--safe-area-inset-right), ${token("--space-5")})`,
        bottom: `max(var(--safe-area-inset-bottom), ${token("--space-5")})`,
        zIndex: 80,
        width: `min(${String(REOPEN_CONTROL_MAX_WIDTH_PX)}px, calc(100vw - ${token("--space-10")}))`,
      }}
    >
      <GlassButton
        label={reopenLabel(outcome)}
        disabled={onAction === undefined}
        testId="battle-result-reopen"
        onPress={() => onAction?.("reopen")}
      />
    </div>
  );
}

function VictoryReward({
  view,
  onAction,
  centerOnBattlefield,
}: {
  readonly view: Extract<MobileBattleResultView, { outcome: "victory" }>;
  readonly onAction?: (action: MobileBattleResultAction) => void;
  readonly centerOnBattlefield: boolean;
}): ReactElement {
  const [committing, setCommitting] = useState(false);
  const { value, complete } = useEssenceCountUp(view.essenceReward);

  const continueDisabled = !complete || committing || onAction === undefined;
  return (
    <section
      className="cumulus"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cumulus-battle-victory-title"
      data-battle-result-surface="victory"
      data-battle-reward-surface=""
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        minHeight: "100dvh",
        boxSizing: "border-box",
        overflowY: "auto",
        overscrollBehavior: "contain",
        background: token("--scrim-strong"),
        color: token("--text-primary"),
        display: "grid",
        gridTemplateColumns: centerOnBattlefield
          ? `minmax(0, 1fr) ${MOBILE_BATTLE_INSPECTOR_RAIL_TRACK}`
          : "minmax(0, 1fr)",
        placeItems: "center",
        paddingTop: `calc(max(var(--safe-area-inset-top), ${token("--safe-top")}) + ${token("--space-10")})`,
        paddingRight: `max(var(--safe-area-inset-right), ${token("--space-6")})`,
        paddingBottom: `calc(max(var(--safe-area-inset-bottom), ${token("--safe-bottom")}) + ${token("--space-8")})`,
        paddingLeft: `max(var(--safe-area-inset-left), ${token("--space-6")})`,
      }}
    >
      <Motes on tint="warm" count={18} seed={44} zIndex={1} />
      <div
        data-battle-reward-content=""
        data-battle-result-layout-content=""
        style={{
          position: "relative",
          zIndex: 2,
          gridColumn: "1",
          gridRow: "1",
          width: "100%",
          maxWidth: JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: token("--space-6"),
          textAlign: "center",
        }}
      >
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: token("--space-3"),
          }}
        >
          <h1
            id="cumulus-battle-victory-title"
            style={{
              margin: 0,
              font: token("--t-display"),
              color: token("--reward"),
            }}
          >
            Victory!
          </h1>
          <p
            data-battle-reward-summary=""
            style={{
              margin: 0,
              font: token("--t-body"),
              color: token("--text-secondary"),
              textShadow: token("--text-outline-media"),
            }}
          >
            {view.summary}
          </p>
        </header>

        <div
          data-battle-reward-essence-callout=""
          style={{ width: "100%", maxWidth: REWARD_CALLOUT_MAX_WIDTH_PX }}
        >
          <GroupPanel>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: token("--space-3"),
              }}
            >
              <span
                style={{
                  font: token("--t-eyebrow"),
                  letterSpacing: token("--tracking-eyebrow"),
                  color: token("--text-secondary"),
                  textTransform: "uppercase",
                }}
              >
                Essence Earned
              </span>
              <span
                aria-label={`Gained ${String(view.essenceReward)} essence`}
                data-battle-reward-essence-value=""
                style={{ font: token("--t-display") }}
              >
                <EssenceValue amount={`+${String(value)}`} />
              </span>
            </div>
          </GroupPanel>
        </div>

        <GlassButton
          label="Continue"
          variant="accent"
          disabled={continueDisabled}
          testId="battle-reward-continue"
          onPress={() => {
            if (continueDisabled) return;
            setCommitting(true);
            onAction?.("continue");
          }}
        />
      </div>
    </section>
  );
}

function DefeatOrDrawResult({
  view,
  onAction,
  centerOnBattlefield,
}: {
  readonly view: Extract<MobileBattleResultView, { outcome: "defeat" | "draw" }>;
  readonly onAction?: (action: MobileBattleResultAction) => void;
  readonly centerOnBattlefield: boolean;
}): ReactElement {
  if (view.dismissed) {
    return <ReopenControl outcome={view.outcome} onAction={onAction} />;
  }

  return (
    <section
      className="cumulus"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cumulus-battle-result-title"
      data-battle-result-surface={view.outcome}
      data-battle-result-overlay={view.outcome}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        minHeight: "100dvh",
        boxSizing: "border-box",
        overflowY: "auto",
        overscrollBehavior: "contain",
        background: token("--scrim"),
        color: token("--text-primary"),
        display: "grid",
        gridTemplateColumns: centerOnBattlefield
          ? `minmax(0, 1fr) ${MOBILE_BATTLE_INSPECTOR_RAIL_TRACK}`
          : "minmax(0, 1fr)",
        placeItems: "center",
        paddingTop: `max(var(--safe-area-inset-top), ${token("--space-6")})`,
        paddingRight: `max(var(--safe-area-inset-right), ${token("--space-6")})`,
        paddingBottom: `max(var(--safe-area-inset-bottom), ${token("--space-6")})`,
        paddingLeft: `max(var(--safe-area-inset-left), ${token("--space-6")})`,
      }}
    >
      <div
        data-battle-result-layout-content=""
        style={{
          gridColumn: "1",
          gridRow: "1",
          width: "100%",
          maxWidth: JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX,
        }}
      >
        <GroupPanel>
          <div
            data-battle-result-content=""
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: token("--space-6"),
              textAlign: "center",
            }}
          >
            <h1
              id="cumulus-battle-result-title"
              style={{
                margin: 0,
                font: token("--t-title"),
                color: token("--text-primary"),
              }}
            >
              {titleFor(view.outcome)}
            </h1>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: token("--space-4"),
              }}
            >
              <GlassButton
                label="Keep Inspecting"
                variant="accent"
                disabled={onAction === undefined}
                testId="battle-result-inspect"
                onPress={() => onAction?.("dismiss")}
              />
              <GlassButton
                label="Reset Run…"
                variant="danger"
                disabled={onAction === undefined}
                testId="battle-result-reset"
                onPress={() => onAction?.("reset")}
              />
            </div>
          </div>
        </GroupPanel>
      </div>
    </section>
  );
}

/** Cumulus victory payoff plus the compact defeat/draw result overlay. */
export function BattleResultSurface({
  view,
  onAction,
  centerOnBattlefield = false,
}: BattleResultSurfaceProps): ReactElement {
  return view.outcome === "victory" ? (
    <VictoryReward
      view={view}
      onAction={onAction}
      centerOnBattlefield={centerOnBattlefield}
    />
  ) : (
    <DefeatOrDrawResult
      view={view}
      onAction={onAction}
      centerOnBattlefield={centerOnBattlefield}
    />
  );
}
