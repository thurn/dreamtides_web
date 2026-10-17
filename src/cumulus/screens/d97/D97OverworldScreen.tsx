// D97OverworldScreen — the Dreamtides 97 overworld's React layer: the world
// canvas slot filling the screen, the HUD shell over it (an act and tier
// chip, the Essence readout, and a control bar of Deck, Quests and Menu), and
// the open panel slot. Every HUD element is one glass pill: the chips are
// liquid-glass panels at the control radius and the GlassButton height, with
// the button voice, so they read as the control bar's siblings. The HUD lets
// clicks through to the world except on its controls, and hides while a
// panel occupies the screen so no HUD text shows through it (overlays carry
// no scrim). It reports how much of the screen's bottom the control bar
// covers, so the camera keeps the player above it. The screen carries the
// Cumulus type floor: no D97 chrome text renders under 12px.
// PURE: it renders from a view model and reports control presses; the adapter
// owns the canvas, the panels and the input-focus rule.

import { useLayoutEffect, useRef, type ReactElement, type ReactNode } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { EssenceValue } from "../../components/hud/EssenceValue";
import { GlassPanel } from "../../components/overlay/GlassPanel";
import { safeAreaInsetAtLeast } from "../../primitives/safe-area";
import { token } from "../../primitives/tokens";

export type D97OverworldControlId = "deck" | "quests" | "menu";

export interface D97OverworldControlView {
  readonly id: D97OverworldControlId;
  readonly label: string;
  /** False until the control's surface exists. */
  readonly enabled: boolean;
}

export interface D97OverworldHudView {
  /** The act chip's lines; a dream's name never appears. */
  readonly actLabel: string;
  readonly tierLabel: string;
  /** The run's Essence, or null before the run holds any. */
  readonly essence: number | null;
  readonly controls: readonly D97OverworldControlView[];
}

export interface D97OverworldScreenProps {
  readonly view: D97OverworldHudView;
  /** The world canvas, sized to fill the screen. */
  readonly world: ReactNode;
  /** The open React panel, drawn over the world in place of the HUD. */
  readonly panel?: ReactNode;
  /** Whether a panel occupies the screen: the HUD hides under it. */
  readonly panelOpen: boolean;
  readonly onControl: (id: D97OverworldControlId) => void;
  /** CSS pixels from the screen's bottom edge to the control bar's top, on every layout change. */
  readonly onHudInset: (bottom: number) => void;
}

/**
 * A HUD chip's inner height: the standard GlassButton's 42px outer height
 * less the glass panel's 1px rim above and below, so chips and controls match.
 */
const HUD_PILL_HEIGHT_PX = 40;

/** A static HUD chip: the control bar's glass material and height, holding one line in the button voice. */
function HudPill({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <GlassPanel radius="control">
      <div
        data-d97-hud-pill=""
        style={{
          boxSizing: "border-box",
          height: HUD_PILL_HEIGHT_PX,
          display: "flex",
          alignItems: "center",
          gap: token("--space-s"),
          padding: `0 ${token("--space-l")}`,
          font: token("--t-button"),
          color: token("--text-on-glass"),
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </div>
    </GlassPanel>
  );
}

/** The overworld screen: world canvas, HUD shell and panel layer. */
export function D97OverworldScreen({
  view,
  world,
  panel,
  panelOpen,
  onControl,
  onHudInset,
}: D97OverworldScreenProps): ReactElement {
  const screenRef = useRef<HTMLElement | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const screen = screenRef.current;
    const bar = barRef.current;
    if (screen === null || bar === null) return undefined;
    const measure = () => onHudInset(Math.max(0, screen.getBoundingClientRect().bottom - bar.getBoundingClientRect().top));
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(screen);
    observer?.observe(bar);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [onHudInset]);
  const top = safeAreaInsetAtLeast("top", "--space-l");
  const side = safeAreaInsetAtLeast("left", "--space-l");
  const end = safeAreaInsetAtLeast("right", "--space-l");
  const bottom = safeAreaInsetAtLeast("bottom", "--space-l");
  return (
    <main
      ref={screenRef}
      className="cumulus"
      data-d97-screen="overworld"
      data-cumulus-type-floor=""
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: token("--bg-app"),
      }}
    >
      {world}
      <div
        data-d97-hud=""
        data-d97-hud-hidden={panelOpen ? "true" : "false"}
        aria-hidden={panelOpen ? true : undefined}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", visibility: panelOpen ? "hidden" : "visible" }}
      >
        <div
          data-d97-hud-chip=""
          style={{ position: "absolute", top, left: side, pointerEvents: "auto" }}
        >
          <HudPill>
            <span>{view.actLabel}</span>
            {view.tierLabel !== "" && (
              <>
                <span aria-hidden="true" style={{ color: token("--text-on-glass-muted") }}>
                  {"·"}
                </span>
                <span>{view.tierLabel}</span>
              </>
            )}
          </HudPill>
        </div>
        {view.essence !== null && (
          <div data-d97-hud-essence="" style={{ position: "absolute", top, right: end, pointerEvents: "auto" }}>
            <HudPill>
              <EssenceValue amount={view.essence} tone="mark" />
            </HudPill>
          </div>
        )}
        <nav
          ref={barRef}
          aria-label={"Overworld controls"}
          data-d97-hud-controls=""
          style={{
            position: "absolute",
            left: "50%",
            bottom,
            transform: "translateX(-50%)",
            display: "flex",
            gap: token("--space-s"),
            pointerEvents: "auto",
          }}
        >
          {view.controls.map((control) => (
            <GlassButton
              key={control.id}
              label={control.label}
              disabled={!control.enabled}
              testId={`d97-control-${control.id}`}
              onPress={() => onControl(control.id)}
            />
          ))}
        </nav>
      </div>
      {panel}
    </main>
  );
}
