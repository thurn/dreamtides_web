# Tango materials

A material is the physical treatment of a surface — what it is *made of*, before
any layout or content. Tango has exactly one translucent material and a small
set of solid ones. Picking the material is the first decision when a surface
floats over the game's painterly scene art: does the scene show through it, or
not?

## Liquid glass

Liquid glass is the one frosted, backdrop-blurred material — an Apple-style
translucent surface: a deep-chrome fill at reduced alpha over a blur+saturate
backdrop, topped with a faint specular sheen, a hairline rim, and a layered
interior wash and drop shadow. Because the fill is translucent and the backdrop
blurs, whatever scene art sits behind the surface refracts through it as glass.
It is CSS-only (no WebGL refraction), so it is safe on iOS Safari.

The recipe lives once in `src/tango/internal/glass-surface.ts`
(`glassSurfaceStyle()`), which reads the `--glass-*` tokens — the fill, sheen,
blur, rim, and shadow all live as those tokens in `tango-tokens.css`. No other
file re-declares the material: edit a `--glass-*` literal and every glass
surface follows. `glassSurfaceStyle()` is radius-parameterized (its only other
job is to let a caller supply or omit the corner radius); everything else is the
fixed recipe.

Who wears it:

- **the InfoCard press-reveal popover shell** — the reveal-on-interaction card
  that every press/hover popup renders through (it overrides the fill to the
  warmer `--glass-fill-popover` tint; see below);
- **the MobileDeckViewer and DesktopDeckViewer full-bleed backdrops** — the
  frosted scrim the deck viewer floats over;
- **the StartingDeckModal panel**;
- **the glass controls and glass icon buttons** — `glassTrack()` and
  `glassIconButtonChrome()` in `control-treatment.ts`, which route through the
  same recipe (via `glassSurfaceStyle({ radius: null })`) so a control track and
  a popover shell read as the same material.

Choose glass only for a surface that floats over the scene and should let the
scene show through. A surface that does not sit over painterly art has no glass
to refract, so it uses a solid material instead (see "Not glass").

## Text on glass

All text painted on blurred glass uses the glass text tokens:

- `--text-on-glass` for primary labels, names, titles, and spoken copy;
- `--text-on-glass-muted` for secondary copy.

Accent, essence, points, and production-bridge violet tokens are never text
colors on blurred glass. The glass material samples scene art, so bright sky,
snow, gold, and white painterly regions can sit directly behind the glyphs; the
purple accent family fails that contrast case. Purple may still frame a button,
glow an object, or color an economy mark on solid chrome, but glass text stays
white or warm near-white.

## `--glass-fill-popover`: the warmer reveal tint

There are two glass fills, and the difference is deliberate:

- `--glass-fill` — `rgba(14, 14, 16, 0.54)`, a neutral near-black — is the
  deck-viewer glass.
- `--glass-fill-popover` — `rgba(18, 14, 28, 0.5)`, a warmer violet-black — is
  the InfoCard reveal fill.

A press-reveal popover often opens on the same screen as the deck-viewer glass,
and the warmer tint makes the reveal read as its own distinct surface rather
than blending into the neutral glass behind it. The tint is a design decision,
not an accident — it is asserted by test, so a refactor that collapses the two
fills fails the build.

## The blur-preservation constraint

A glass surface's `backdrop-filter` only samples the scene when neither the
surface itself nor any ancestor wrapper sits in a composited layer. `opacity`,
`transform`, and `animation` each promote an element to its own composited
layer, and once a surface (or an ancestor) is in one, `backdrop-filter` samples
that layer — an empty gray plane — instead of the scene, and the glass reads as
flat gray.

The InfoCard popover is therefore kept out of those layers: its portal wrapper
carries no entrance `opacity`/`transform`/`animation`, and the unmeasured
popover is hidden with `visibility` (which does not promote a layer) rather than
`opacity` (which does). This is why the shell blurs the live scene underneath it
instead of an empty gray layer. A regression test asserts the wrapper emits no
`opacity`, `animation`, or `transform` styles (from `c903242a`). When you place
or animate a glass surface, keep the surface and its ancestors out of
opacity/transform/animation layers, or the blur silently dies.

## Not glass

Most surfaces are solid — they do not sample the backdrop, and choosing glass
for them would be wrong:

- **GroupPanel** — the information-grouping card — is a flat, solid deep-plum
  surface. It collects dense related values into one unit and does not refract
  the scene.
- **`--surface-chrome` / `--surface-chrome-strong`** are solid, opaque chrome
  for HUD elements and windows.

The rule: reach for glass only when a surface floats over painterly scene art
and should let it show through. Everything else is a solid material.
