// D97DreamLoadingScreen — what the overworld shows while a dream's compiled
// map loads: the overworld's background with one small glass status panel.
// PURE: no props; the adapter decides when it shows. A dream's name never
// appears (decision P10).

import type { ReactElement } from "react";
import { GlassPanel } from "../../components/overlay/GlassPanel";
import { token } from "../../primitives/tokens";

/** The overworld while its dream loads. */
export function D97DreamLoadingScreen(): ReactElement {
  return (
    <main
      className="cumulus"
      data-d97-screen="dream-loading"
      aria-busy
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: token("--bg-app"),
      }}
    >
      <div role="status">
        <GlassPanel title={"Falling Asleep"} radius="control" headerSpacing="medium" headerDivider={false}>
          {null}
        </GlassPanel>
      </div>
    </main>
  );
}
