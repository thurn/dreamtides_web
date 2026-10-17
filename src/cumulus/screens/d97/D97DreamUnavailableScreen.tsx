// D97DreamUnavailableScreen — what the overworld shows when the run's dream
// cannot be played (its dream is not in this build, or its map failed to
// load): the dream-loading screen's background with one glass panel and a way
// back to the main menu. The run itself stays saved. PURE: it reports Main
// Menu. A dream's name never appears (decision P10).

import type { ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import { GlassPanel } from "../../components/overlay/GlassPanel";
import { token } from "../../primitives/tokens";

export interface D97DreamUnavailableScreenProps {
  /** Null when no main menu can be opened from here. */
  readonly onMainMenu: (() => void) | null;
}

/** The panel's widest measure, so its message wraps at a readable length. */
const PANEL_MAX_WIDTH_PX = 420;

/** The overworld when its dream cannot be played. */
export function D97DreamUnavailableScreen({ onMainMenu }: D97DreamUnavailableScreenProps): ReactElement {
  return (
    <main
      className="cumulus"
      data-d97-screen="dream-unavailable"
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: token("--gutter"),
        boxSizing: "border-box",
        background: token("--bg-app"),
      }}
    >
      <div role="alert" style={{ width: "100%", maxWidth: PANEL_MAX_WIDTH_PX }}>
        <GlassPanel
          title={"The Dream Will Not Hold"}
          subtitle={"This dream could not be opened. Your run is kept as you left it."}
          radius="control"
          headerSpacing="medium"
          headerDivider={false}
          testId="d97-dream-unavailable-panel"
        >
          {onMainMenu !== null && (
            <div
              data-d97-dream-unavailable-action="main-menu"
              style={{ display: "flex", justifyContent: "center", padding: token("--space-l") }}
            >
              <GlassButton
                label={"Main Menu"}
                variant="accent"
                placement="onGlass"
                testId="d97-dream-unavailable-main-menu"
                onPress={onMainMenu}
              />
            </div>
          )}
        </GlassPanel>
      </div>
    </main>
  );
}
