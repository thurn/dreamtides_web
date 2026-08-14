import {useEffect, useState, type ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { EssenceValue } from "../components/hud/EssenceValue";
import { Motes } from "../components/hud/Motes";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { safeAreaInsetAtLeast } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import { useLocalizer } from "../../runtime/localization/use-localizer";
import { MOBILE_BATTLE_INSPECTOR_RAIL_TRACK } from "./mobile-battle-layout";
import { JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX } from "./journey-result-layout";
import { meaning,
  tx,
  txa,
  plural,
  one,
  other,
  opaque,
} from "@trox/runtime";
import type { LocalizedString } from "@trox/runtime";

export type MobileBattleResultOutcome = "victory" | "defeat" | "draw";

export type MobileBattleResultView =
  | {
      readonly outcome: "victory";
      readonly opponentName: LocalizedString;
      readonly playerScore: number;
      readonly opponentScore: number;
      readonly turnCount: number;
      readonly essenceReward: number;
    }
  | {
      readonly outcome: "defeat" | "draw";
      readonly dismissed: boolean;
    };

export type MobileBattleResultAction =
  "continue" | "dismiss" | "reopen" | "reset";

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
        right: `max(var(--safe-area-inset-right), ${token("--space-m")})`,
        bottom: `max(var(--safe-area-inset-bottom), ${token("--space-m")})`,
        zIndex: 80,
        width: `min(${String(REOPEN_CONTROL_MAX_WIDTH_PX)}px, calc(100vw - ${token("--space-4xl")}))`,
      }}
    >
      <GlassButton
        label={
          outcome === "defeat"
            ? tx("Defeat — Reopen", "[ui] Command that reopens a dismissed defeat result.")
            : tx("Draw — Reopen", "[ui] Command that reopens a dismissed draw result.")
        }
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
  const resolve = useLocalizer();
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
        paddingTop: `calc(max(var(--safe-area-inset-top), ${token("--safe-top")}) + ${token("--space-4xl")})`,
        paddingRight: safeAreaInsetAtLeast("right", "--space-l"),
        paddingBottom: `calc(max(var(--safe-area-inset-bottom), ${token("--safe-bottom")}) + ${token("--space-2xl")})`,
        paddingLeft: safeAreaInsetAtLeast("left", "--space-l"),
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
          gap: token("--space-l"),
          textAlign: "center",
        }}
      >
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: token("--space-xs"),
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
            {resolve(tx("Victory!", "[battle] Title for a victorious terminal battle result."))}
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
            {resolve(txa(
              plural(view.turnCount, [
                one(
                  "Defeated {opponent_name} · {player_score}–{opponent_score} · {turn_count} Turn",
                ),
                other(
                  "Defeated {opponent_name} · {player_score}–{opponent_score} · {turn_count} Turns",
                ),
              ]),
              {
                turn_count: view.turnCount,
                opponent_name: opaque(view.opponentName),
                player_score: view.playerScore,
                opponent_score: view.opponentScore,
              },
              "[battle] Victory summary after a battle. opponent_name is the authored display name of the defeated opponent and has unknown grammatical gender; player_score and opponent_score are non-negative point totals; turn_count is a positive count of completed battle turns.",
            ))}
          </p>
        </header>

        <div
          data-battle-reward-essence-callout=""
          style={{ width: "100%", maxWidth: REWARD_CALLOUT_MAX_WIDTH_PX }}
        >
          <GlassPanel radius="popover" testId="battle-reward-essence-panel">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: token("--space-xs"),
                padding: token("--space-l"),
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
                {resolve(tx(
                  "Essence Earned",
                  "[battle] Eyebrow above the animated Essence payout on a victorious battle result.",
                ))}
              </span>
              <span
                aria-label={resolve(txa(
                  "Gained {amount} Essence",
                  { amount: view.essenceReward },
                  "[accessibility] [battle] Name for the Essence reward value on the battle victory screen. amount is the non-negative amount already earned by the local player.",
                ))}
                data-battle-reward-essence-value=""
                style={{ font: token("--t-display") }}
              >
                <EssenceValue amount={`+${String(value)}`} />
              </span>
            </div>
          </GlassPanel>
        </div>

        <GlassButton
          label={tx(
            meaning("battle-result-continue", "Continue"),
            "[battle] Command that accepts a completed result or advances a resolved interaction.",
          )}
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
  readonly view: Extract<
    MobileBattleResultView,
    { outcome: "defeat" | "draw" }
  >;
  readonly onAction?: (action: MobileBattleResultAction) => void;
  readonly centerOnBattlefield: boolean;
}): ReactElement {
  const resolve = useLocalizer();
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
        paddingTop: `max(var(--safe-area-inset-top), ${token("--space-l")})`,
        paddingRight: safeAreaInsetAtLeast("right", "--space-l"),
        paddingBottom: `max(var(--safe-area-inset-bottom), ${token("--space-l")})`,
        paddingLeft: safeAreaInsetAtLeast("left", "--space-l"),
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
        <GlassPanel radius="popover" testId="battle-result-action-panel">
          <div
            data-battle-result-content=""
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: token("--space-l"),
              padding: token("--space-l"),
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
              {resolve(
                view.outcome === "defeat"
                  ? tx("Defeat.", "[battle] Title for a defeated terminal battle result.")
                  : tx("Draw.", "[battle] Title for a drawn terminal battle result."),
              )}
            </h1>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: token("--space-s"),
              }}
            >
              <GlassButton
                label={tx(
                  "Keep Inspecting",
                  "[ui] Command that dismisses a defeat or draw overlay while leaving the battlefield visible for inspection.",
                )}
                variant="accent"
                disabled={onAction === undefined}
                testId="battle-result-inspect"
                onPress={() => onAction?.("dismiss")}
              />
              <GlassButton
                label={tx(
                  "Reset Run…",
                  "[battle] Destructive command that opens the run-reset confirmation from a battle result.",
                )}
                variant="danger"
                disabled={onAction === undefined}
                testId="battle-result-reset"
                onPress={() => onAction?.("reset")}
              />
            </div>
          </div>
        </GlassPanel>
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
