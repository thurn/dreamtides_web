# Cumulus materials

A material is the physical treatment of a surface — what it is *made of*, before
any layout or content. Cumulus has exactly one translucent material and a small
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

The recipe lives once in `src/cumulus/internal/glass-surface.ts`
(`glassSurfaceStyle()`), which reads the `--glass-*` tokens — the fill, sheen,
blur, rim, and shadow all live as those tokens in `cumulus-tokens.css`. No other
file re-declares the material: edit a `--glass-*` literal and every glass
surface follows. `glassSurfaceStyle()` is radius-parameterized (its only other
job is to let a caller supply or omit the corner radius); everything else is the
fixed recipe.

Who wears it:

- **GlassPanel** — the shared persistent content container with a structured
  title area, composed body, and optional footer;
- **the InfoCard press-reveal popover shell** — the reveal-on-interaction card
  that every press/hover popup renders through (it overrides the fill to the
  warmer `--glass-fill-popover` tint; see below);
- **the StartingDeckModal panel**;
- **the BattleStatusDisplay card**;
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

## Controls on glass

GlassButton and IconButton name the surface beneath them with their strict
`placement` prop. `onMedia` uses the complete liquid-glass recipe because the
control itself is responsible for tinting and blurring the live scene.
`onGlass` is a nested tonal lens: the parent surface supplies the scene tint
and blur, while the control adds a low-alpha neutral fill, a brighter rim and
specular edge, and a tighter shadow. This keeps the inherited scene color
visible through the control and makes the nested object boundary clear.

CardGalleryPanel composes GlassPanel and derives this relationship from its
frame. A floating gallery renders labeled and icon accessories with
`placement="onGlass"`; a full-bleed gallery uses the standard scrim and renders
them with `placement="onMedia"`.

## Do not stack purple container cards on glass

Do not place an opaque purple container card, including `GroupPanel`, inside a
GlassPanel, GlassDialog, InfoCard, or another liquid-glass surface. The solid
purple rectangle interrupts the glass material and reads as a heavy card pasted
onto the pane. Lay the content directly on the glass with the glass text tokens
and spacing wrappers. Tangible game objects such as `GameCard` remain distinct
objects and may sit directly on the glass without another container behind them.

## `--glass-fill-popover`: the warmer reveal tint

There are two glass fills, and the difference is deliberate:

- `--glass-fill` — `rgba(14, 14, 16, 0.54)`, a neutral near-black — is the
  default glass fill.
- `--glass-fill-popover` — `rgba(18, 14, 28, 0.5)`, a warmer violet-black — is
  the InfoCard reveal fill.

The warmer tint makes a reveal read as its own distinct surface. The tint is a
design decision, not an accident — it is asserted by test, so a refactor that
collapses the two fills fails the build.

## Deck-viewer backdrop

The MobileDeckViewer, DesktopDeckViewer, and GlassPanel's full-bleed gallery
frame place their content over the 80%-black `--scrim-gallery` alpha overlay.
The backdrop darkens the live scene without applying a blur, keeping the scene's
forms recognizable while reducing visual competition with the card grid.
Floating GlassPanels remain liquid glass.

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
  surface used over scene media or solid screen surfaces. It collects dense
  related values into one unit and does not refract the scene; do not nest it
  inside liquid glass.
- **`--surface-chrome` / `--surface-chrome-strong`** are solid, opaque chrome
  for HUD elements and windows.

The rule: reach for glass only when a surface floats over painterly scene art
and should let it show through. Everything else is a solid material.
