// Full-screen mockup for Motes — the atmospheric particle layer. A
// Dream Atlas backdrop with the 'warm' tint drifting over the scene art
// (its default, documented context), and a translucent bottom console — a
// GlassPanel carrying the 'violet' tint in its documented chrome-only context.
// Both layers are the same component, only `tint` differs; Motes itself reads
// `prefers-reduced-motion`
// internally (its `dt-mote` class's media rule) and holds the motes at a
// fixed mid-opacity instead of drifting, so no extra handling is needed here.

import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
import { Motes } from "../../components/hud/Motes";
import { GlassPanel } from "../../components/overlay/GlassPanel";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";
import { parseDreamscapeId } from "../../../types/identifiers";

export function MotesMockup() {
  return (
    <div
      style={{
        ...sceneRoot,
        backgroundImage: `linear-gradient(to bottom, rgba(8,5,17,0.25) 0%, rgba(8,5,17,0.35) 55%, rgba(8,5,17,0.85) 100%), url(${dreamscapeSceneUrl(parseDreamscapeId("winterwake_fjords"))})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Warm tint — atmosphere over the scene art itself. */}
      <Motes tint="warm" count={22} seed={0} zIndex={2} />

      <div
        style={{
          position: "absolute",
          // Clears the fixed "← Back" affordance MockupView overlays at
          // top-left even on a narrow viewport, where this centered title
          // would otherwise sit underneath it.
          top: token("--space-6xl"),
          left: 0,
          right: 0,
          textAlign: "center",
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        <div
          style={{ font: token("--t-title"), color: token("--text-primary") }}
        >
          Winterwake Fjords
        </div>
        <div
          style={{
            font: token("--t-caption"),
            color: token("--text-secondary"),
            marginTop: token("--space-xs"),
          }}
        >
          Warm motes drift over the scene art; a chrome console below carries
          the violet tint.
        </div>
      </div>

      {/* Chrome-only console anchored to the right, mid-height — clear of the
          top title at every viewport size — carrying the 'violet' tint over its
          own glass pane rather than over scene art. */}
      <div
        style={{
          position: "absolute",
          right: token("--space-l"),
          top: "56%",
          width: "min(300px, 68vw)",
          zIndex: 3,
        }}
      >
        <GlassPanel>
          <Motes tint="violet" count={16} seed={7} zIndex={1} />
          <div
            style={{
              position: "relative",
              zIndex: 2,
              padding: token("--space-l"),
            }}
          >
            <p
              style={{
                font: token("--t-eyebrow"),
                letterSpacing: token("--tracking-eyebrow"),
                textTransform: "uppercase",
                color: token("--accent-bright"),
                margin: 0,
              }}
            >
              Chrome context
            </p>
            <p
              style={{
                font: token("--t-body"),
                color: token("--text-primary"),
                margin: `${token("--space-xs")} 0 0`,
              }}
            >
              The same particle field, tinted violet for a screen with no scene
              art behind it.
            </p>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
