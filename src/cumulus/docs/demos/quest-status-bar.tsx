// Registry demo entry for QuestStatusBar — see motes.tsx for the wrapper-as-
// Component recipe this follows. QuestStatusBar is a TRANSPARENT HUD that
// positions itself against a `stageRef` (the screen root), so on its own it has
// nothing to sit over. The demo's `Component` is a small wrapper that supplies
// a phone-proportioned, `position: relative` stage with a dark scene-like
// backdrop (so the `.hud-outline` legibility utility is visibly doing its job
// over bare art), owns the `stageRef`, and renders `<QuestStatusBar>` inside it.
// `docName` still points at the real QuestStatusBar so the props table reports
// its actual API.
//
// Each dreamsign's `imageName` and the Dreamcaller `portrait` resolve from real
// production art in `public/` — the same assets the full-screen mockup uses — so the demo
// shows genuine dreamsign icons and a real Dreamcaller bust rather than
// stand-in glyphs. `dreamsigns` / `dreamcaller` are ReactNode-free object props
// seeded via defaultArgs.

import { useRef } from "react";
import { QuestStatusBar } from "../../components/hud/QuestStatusBar";
import type { QuestStatusBarProps } from "../../components/hud/QuestStatusBar";
import { artRef } from "../../primitives/art";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

function QuestStatusBarDemo(args: Omit<QuestStatusBarProps, "stageRef">) {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={stageRef}
      style={{
        position: "relative",
        width: 390,
        height: 300,
        overflow: "hidden",
        borderRadius: token("--radius-sheet"),
        // A dark, scene-like backdrop so the transparent HUD sits on "art"
        // and the .hud-outline glyph dilation is visibly earning its keep.
        background:
          "radial-gradient(120% 90% at 30% 20%, #3a2a55 0%, #1a1230 45%, #0a0612 100%)",
        touchAction: "none",
      }}
    >
      <QuestStatusBar {...args} stageRef={stageRef} />
    </div>
  );
}

export const questStatusBarDemo: CumulusComponent = {
  id: "quest-status-bar",
  title: "Quest Status Bar",
  blurb:
    "The persistent, transparent bottom HUD for quest screens. Its quest variant shows the complete run inventory; its desktop battle variant keeps essence and two-high Dreamsign columns at the playable board's lower corners. It docks at two sizes — `compact` on mobile, `grand` on desktop — scaling the whole bar up in proportion.",
  group: "Components",
  docName: "QuestStatusBar",
  Component: QuestStatusBarDemo,
  usage: [
    {
      note: "A transparent HUD that positions itself against the screen root and reveals the Dreamcaller / dreamsign popups anchored to it, so pass the screen's `stageRef`. Render it inside a `position: relative` scene root. Its shared bottom anchor adds one small visible gap after the real device safe area; screens should not reposition it. Mobile screen-level floating glass panels use `QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE` for their bottom edge so every screen preserves the same separation from the HUD.",
      code: `import { useRef } from "react";
import { QuestStatusBar } from "src/cumulus/components/hud/QuestStatusBar";

const stageRef = useRef<HTMLDivElement>(null);

<div ref={stageRef} style={{ position: "relative" }}>
  {/* scene art */}
  <QuestStatusBar
    stageRef={stageRef}
    essence={200}
    deck={22}
    dreamcaller={dreamcaller}
    dreamsigns={dreamsigns}
  />
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "quest",
      size: "compact",
      essence: 200,
      deck: 22,
      dreamcaller: {
        name: "Threxan",
        epithet: "the Resounding Wrath",
        portrait: artRef.dreamcaller("0025"),
        ability: "At the start of your first turn, draw a card.",
      },
      dreamsigns: [
        {
          id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
          name: "Amplified Acorn",
          imageName: "acorn_gold.png",
          effectDescription:
            "Once per turn, when you discard a card, your next card this turn costs 2● less.",
          isBane: false,
        },
        {
          id: "278EC1AB-F532-4862-84AE-63DF5E49548C",
          name: "Pyramid Relic",
          imageName: "aertfact.png",
          effectDescription:
            "The second character you play each turn costs 1● less.",
          isBane: false,
        },
        {
          id: "D1FDBE21-56F6-43C0-AAAC-1E4683964DA5",
          name: "Bell",
          imageName: "bell.png",
          effectDescription:
            "When you play a character from your void, rematerialize it.",
          isBane: false,
        },
      ],
    },
  },
};
