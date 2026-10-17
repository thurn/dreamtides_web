// D97OverworldScreen — the Dreamtides 97 overworld's React layer: the world
// canvas slot filling the screen, the HUD shell over it (an act and tier
// chip, the Essence readout, and a control bar of Deck, Quests and Menu), and
// the open panel slot. The HUD lets clicks through to the world except on its
// controls. PURE: it renders from a view model and reports control presses;
// the adapter owns the canvas, the panels and the input-focus rule.

import type { ReactElement, ReactNode } from "react";
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
  /** The open React panel, drawn over the world and the HUD. */
  readonly panel?: ReactNode;
  readonly onControl: (id: D97OverworldControlId) => void;
}

/** The overworld screen: world canvas, HUD shell and panel layer. */
export function D97OverworldScreen({
  view,
  world,
  panel,
  onControl,
}: D97OverworldScreenProps): ReactElement {
  const top = safeAreaInsetAtLeast("top", "--space-l");
  const side = safeAreaInsetAtLeast("left", "--space-l");
  const end = safeAreaInsetAtLeast("right", "--space-l");
  const bottom = safeAreaInsetAtLeast("bottom", "--space-l");
  return (
    <main
      className="cumulus"
      data-d97-screen="overworld"
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
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <div
          data-d97-hud-chip=""
          style={{ position: "absolute", top, left: side, pointerEvents: "auto" }}
        >
          <GlassPanel
            eyebrow={view.actLabel}
            title={view.tierLabel}
            radius="control"
            headerSpacing="compact"
            headerDivider={false}
          >
            {null}
          </GlassPanel>
        </div>
        {view.essence !== null && (
          <div
            data-d97-hud-essence=""
            style={{
              position: "absolute",
              top,
              right: end,
              pointerEvents: "auto",
              font: token("--t-title"),
              textShadow: token("--text-outline-media"),
            }}
          >
            <EssenceValue amount={view.essence} />
          </div>
        )}
        <nav
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
