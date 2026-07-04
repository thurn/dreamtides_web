// Shared chrome for the full-screen component mockups. Every mockup fills the
// viewport (the MockupView wrapper in TangoApp gives it a 100vw×100vh stage)
// via `sceneRoot`, and clips its own bleed. Kept token-styled so the mockups
// dogfood the design system they document. What each mockup demonstrates is
// stated in the component's `blurb` on the overview and doc page, above the
// example — the scene itself stays uncaptioned.

import type { CSSProperties } from "react";
import { token } from "../../primitives/tokens";

/** Root style for a mockup: fills the MockupView stage, clips its own bleed. */
export const sceneRoot: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  boxSizing: "border-box",
  fontFamily: token("--font-ui"),
  color: token("--text-primary"),
};
