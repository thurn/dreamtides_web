// Registry demo entry for JourneyStatusBar — see motes.tsx for the wrapper-as-
// Component recipe this follows. JourneyStatusBar is a TRANSPARENT HUD that
// positions itself against a `stageRef` (the screen root), so on its own it has
// nothing to sit over. The demo's `Component` is a small wrapper that supplies
// a phone-proportioned, `position: relative` stage with a dark scene-like
// backdrop (so the `.hud-outline` legibility utility is visibly doing its job
// over bare art), owns the `stageRef`, and renders `<JourneyStatusBar>` inside it.
// `docName` still points at the real JourneyStatusBar so the props table reports
// its actual API.
//
// Each dreamsign's `imageName` and the DreamAvatar `portrait` resolve from real
// production art in `public/` — the same assets the full-screen mockup uses — so the demo
// shows genuine dreamsign icons and a real DreamAvatar bust rather than
// stand-in glyphs. `dreamsigns` / `dreamAvatar` are ReactNode-free object props
// seeded via defaultArgs.

import { useRef } from "react";
import { assertLocalized } from "@trox/runtime";
import { JourneyStatusBar } from "../../components/hud/JourneyStatusBar";
import type { JourneyStatusBarProps } from "../../components/hud/JourneyStatusBar";
import { artRef } from "../../primitives/art";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";
import { parseDreamAvatarId } from "../../../types/identifiers";
import { demoDreamsign } from "./promotion-fixtures";

function JourneyStatusBarDemo(args: Omit<JourneyStatusBarProps, "stageRef">) {
  const stageRef = useRef<HTMLDivElement>(null);
  const size = args.variant === "battle" ? "grand" : args.size;
  return (
    <div
      ref={stageRef}
      style={{
        position: "relative",
        width: 390,
        height: 300,
        overflow: "hidden",
        // JourneyStatusBar uses viewport-fixed chrome in production. Making
        // this specimen its containing block keeps every fixed HUD element
        // aligned to the same stageRef inside the docs preview boundary.
        transform: "translateZ(0)",
        borderRadius: token("--radius-large"),
        // A dark, scene-like backdrop so the transparent HUD sits on "art"
        // and the .hud-outline glyph dilation is visibly earning its keep.
        background:
          "radial-gradient(120% 90% at 30% 20%, #3a2a55 0%, #1a1230 45%, #0a0612 100%)",
        touchAction: "none",
      }}
    >
      <JourneyStatusBar {...args} size={size} stageRef={stageRef} />
    </div>
  );
}

export const journeyStatusBarDemo: CumulusComponent = {
  id: "journey-status-bar",
  title: "Journey Status Bar",
  blurb:
    "The persistent, transparent bottom HUD for journey screens. Its journey variant shows the complete run inventory; its desktop-only battle variant keeps essence and bottom-up, right-to-left Dreamsign columns at the playable board's lower corners. It docks at `compact` on mobile and `grand` on desktop; choosing the battle demo enforces the production `grand` size.",
  relatedSystems: ["journey-screen-host-chrome"],
  group: "Status, Feedback & Effects",
  docName: "JourneyStatusBar",
  Component: JourneyStatusBarDemo,
  usage: [
    {
      note: "A transparent HUD that positions itself against the screen root and reveals the DreamAvatar / dreamsign popups anchored to it, so pass the screen's `stageRef`. Render it inside a `position: relative` scene root. Its shared bottom anchor adds one small visible gap after the real device safe area; screens should not reposition it. Mobile screen-level floating glass panels use `JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE` for their bottom edge so every screen preserves the same separation from the HUD.",
      code: `import { useRef } from "react";
import { JourneyStatusBar } from "src/cumulus/components/hud/JourneyStatusBar";

const stageRef = useRef<HTMLDivElement>(null);

<div ref={stageRef} style={{ position: "relative" }}>
  {/* scene art */}
  <JourneyStatusBar
    stageRef={stageRef}
    essence={200}
    deck={22}
    dreamAvatar={dreamAvatar}
    dreamsigns={dreamsigns}
  />
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "journey",
      size: "compact",
      essence: 200,
      deck: 22,
      dreamAvatar: {
        id: parseDreamAvatarId("84e7020c-7384-4cc3-a20f-ab05f03cc375"),
        name: assertLocalized("Threxan"),
        epithet: assertLocalized("the Resounding Wrath"),
        portrait: artRef.dreamAvatar("0025"),
        ability: assertLocalized(
          "At the start of your first turn, draw a card.",
        ),
      },
      dreamsigns: [demoDreamsign(1), demoDreamsign(2), demoDreamsign(3)],
    },
  },
};
