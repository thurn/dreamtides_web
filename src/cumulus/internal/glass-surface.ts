// glassSurfaceStyle — the shared "liquid glass" surface recipe.
//
// An Apple-style translucent glass material: a deep-chrome fill at reduced
// alpha over a blur+saturate backdrop, topped with a faint specular sheen, a
// hairline rim, a soft neutral interior wash, and a drop shadow. Because the
// fill is translucent and the backdrop blurs, whatever scene art sits behind
// the surface refracts through it as glass. CSS-only (no WebGL refraction), so
// it is safe on iOS Safari.
//
// This is the ONE glass recipe, shared so it reads identically everywhere it
// appears. Its consumers:
//   - the InfoCard press-reveal shell (which overrides the fill to the warmer
//     --glass-fill-popover tint; its fullBleed / atlasReveal text cards wear the
//     same recipe),
//   - GlassDialog — both its GlassBackdrop (a full-bleed frosted layer reduced
//     to fill + blur for an edge-to-edge surface) and its centered glass panel,
//   - BattleStatusDisplay — the passive battle resources and portrait card,
//   - control-treatment.ts's glassTrack() (via glassSurfaceStyle({ radius: null
//     })), which flows on to glassIconButtonChrome() → IconButton and
//     controlChrome() → the Select / SegmentedControl track+trigger and
//     GlassButton.
// So the one material reaches the InfoCard reveal shell, GlassDialog (and the
// shared full-bleed backdrop), IconButton, GlassButton, and the Select /
// SegmentedControl control cluster.
//
// The material's fill, sheen, blur, rim, and shadow live once as the --glass-*
// design tokens; this recipe is their ONLY reader. Edit a glass literal in
// cumulus-tokens.css and every glass surface follows — no file re-declares them.
//
// The flat information-grouping card (GroupPanel) is a DIFFERENT, solid surface
// and does not use this recipe.

import * as React from "react";
import { token } from "../primitives/tokens";

/** Options for {@link glassSurfaceStyle}. */
export interface GlassSurfaceOptions {
  /**
   * The corner radius (token string) of the glass surface. Defaults to
   * `token("--radius-popover")`. Pass `null` to omit `borderRadius` entirely so
   * a caller (a control track, a glass icon button) can supply its own.
   */
  radius?: string | null;
}

/**
 * The liquid-glass style object, spread onto the node that should read as
 * glass. Radius-parameterized (all other values are the fixed --glass-* recipe)
 * so the ONE material serves every surface — the popover shell, frosted
 * dialog backdrops, and radius-less control tracks alike. Only the
 * `saturate(1.5)` here is a raw literal; the fill/sheen/blur/rim/shadow are all
 * the --glass-* tokens.
 */
export function glassSurfaceStyle(
  options: GlassSurfaceOptions = {},
): React.CSSProperties {
  const { radius = token("--radius-popover") } = options;
  const blurBackdrop = `blur(${token("--glass-blur")}) saturate(1.5)`;
  return {
    // Deep chrome tint at reduced alpha so the backdrop blur reads as glass —
    // topped with a faint top-left specular sheen.
    background: `${token("--glass-sheen")}, ${token("--glass-fill")}`,
    backdropFilter: blurBackdrop,
    WebkitBackdropFilter: blurBackdrop,
    border: `1px solid ${token("--glass-rim")}`,
    ...(radius === null ? {} : { borderRadius: radius }),
    // Layered rim / interior wash / drop shadow.
    boxShadow: token("--glass-shadow"),
  };
}
