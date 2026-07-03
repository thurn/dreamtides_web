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
// The dreamsign `art` / Dreamcaller `portrait` are inline SVG data URIs so the
// demo is self-contained (no external asset fetches), and `dreamsigns` /
// `dreamcaller` are ReactNode-free object props seeded via defaultArgs.

import { useRef } from "react";
import { QuestStatusBar } from "../../components/QuestStatusBar";
import type { QuestStatusBarProps } from "../../components/QuestStatusBar";
import { token } from "../../primitives/tokens";
import type { TangoComponent } from "../registry";

/** A tiny self-contained diamond glyph, tinted, as a stand-in dreamsign art. */
function signArt(fill: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>` +
    `<defs><radialGradient id='g' cx='50%' cy='38%' r='65%'>` +
    `<stop offset='0%' stop-color='${fill}'/><stop offset='100%' stop-color='#1a1525'/>` +
    `</radialGradient></defs>` +
    `<path d='M48 8 L84 48 L48 88 L12 48 Z' fill='url(#g)' stroke='${fill}' stroke-width='3'/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** A stand-in Dreamcaller portrait — a soft violet bust silhouette. */
const PORTRAIT = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='260' viewBox='0 0 200 260'>` +
    `<rect width='200' height='260' fill='#2a2140'/>` +
    `<circle cx='100' cy='96' r='46' fill='#c084fc'/>` +
    `<path d='M28 260 C28 190 172 190 172 260 Z' fill='#a855f7'/>` +
    `</svg>`,
)}`;

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
        borderRadius: token("--r-xl"),
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

export const questStatusBarDemo: TangoComponent = {
  id: "quest-status-bar",
  title: "Quest Status Bar",
  group: "Components",
  docName: "QuestStatusBar",
  Component: QuestStatusBarDemo,
  demo: {
    defaultArgs: {
      essence: 200,
      deck: 22,
      elevation: 10,
      signElevation: 10,
      dreamcaller: {
        name: "Seld Rakor",
        epithet: "the Unbound",
        portrait: PORTRAIT,
        ability:
          "Whenever you foresee, draw a card. ▸ Dawn: Gain 2 essence.",
      },
      dreamsigns: [
        {
          id: "s1",
          name: "Amulet of Waking",
          art: signArt("#ffd34d"),
          ability: "▸ Dawn: Gain 2 essence.",
        },
        {
          id: "s2",
          name: "Black Rose",
          art: signArt("#c084fc"),
          ability: "Whenever a character dissolves, foresee 1.",
        },
        {
          id: "s3",
          name: "Waking Crystal",
          art: signArt("#38bdf8"),
          ability: "Your first foresee each turn is enhanced.",
        },
      ],
    },
  },
};
