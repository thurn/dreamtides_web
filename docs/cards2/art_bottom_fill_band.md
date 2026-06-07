# Handoff: Card Art Bottom Fill Band

## What this feature is

Card art is full-bleed behind a portrait `5 : 7` frame, with the rules text box
floating over the lower part of the art. The **bottom fill band** replaces the
bottom strip of crisp artwork with a blurred, darkened, color-matched
continuation of the art, so that:

- Important art elements are not lost behind the bottom text box.
- The text box sits on a calm, on-palette backdrop instead of busy crisp art.
- The artwork is effectively pushed up into a slightly wider-aspect region.

Everything is rendered live in CSS inside `CardView` — there is no baked image
pipeline. The art-crop editor previews through the same `CardView`, so any change
here is reflected in the editor automatically.

This document is a build guide. It describes the current implementation, the
model behind it, the **constraints that make this deceptively hard**, and a
catalogue of failure modes with the strategy that avoids each one. Read the
constraints and pitfalls sections before changing anything — almost every
"obvious" simplification here has already been tried and has a specific way of
looking wrong.

## Where it lives

- `src/components/CardView.tsx` — all of it. The art-extension constants, the
  crop-math helpers (`artCoverMetrics`, `artImageStyleExtended`), the
  bottom-color sampler (`sampleBottomColor`), the `ResizeObserver` that measures
  the rules box, and the `ArtLayers` component that stacks the layers.
- `src/components/card-aspect.ts` — `CARD_ASPECT_RATIO_VALUE`,
  `ART_EXTENSION_FRACTION` (band height as a fraction of card height), and
  `ART_REGION_ASPECT_RATIO_VALUE` (the wider aspect of the art region).
- `src/components/ArtCropEditor` / the card editor — consume `CardView`, so they
  need no changes when this feature changes.

## Source art assumptions (important)

The `cards_v2` art is a **uniform 462 × 280 (landscape)** image with a **~21px
watermark / letterbox strip across the very bottom**. Two consequences drive the
whole design:

1. The source is **landscape inside a portrait frame.** Under `object-fit:
   cover`, the full source *height* fills the frame and the *sides* are cropped.
   There is therefore very little "extra" image below the visible crop window to
   borrow for a downward continuation — most of what is below the window is the
   watermark strip.
2. The **watermark must never be visible.** `DEFAULT_ART_CROP` zooms to `1.17`,
   which historically pushed the strip below the card edge by luck. The moment
   the art is pushed up (so the source bottom rises into view), the strip
   reappears and must be explicitly cropped (see Watermark crop).

If the art format ever changes (different size, no strip, portrait sources),
re-check `ART_SOURCE_BOTTOM_CROP` and the cover assumptions.

## The crop model

`artCoverMetrics(art, imageAspect, frameAspect)` is the single source of truth
for cover math. Given a normalized crop `{ x, y, scale }` (pan in `-1..1`, cover
zoom `scale ≥ 1`) and the aspect ratio of the box being covered, it returns:

- `renderW`, `renderH` — the image size as a multiple of the frame (≥ 1 on the
  covered axis), and
- `panX`, `panY` — translate as a percentage of the image's own size, bounded so
  `|pan| === 1` aligns the image edge with the frame edge.

`artImageStyleExtended(art, imageAspect)` consumes it: it places the crop inside
a **full-card** container, sized to the art region (the top
`1 - ART_EXTENSION_FRACTION`, fitted at the wider `ART_REGION_ASPECT_RATIO_VALUE`)
and centered on the art region's center (not the card's), so the image keeps its
art-region size/position but is free to extend past the band into the lower part
of the card.

**Both** the crisp artwork and the blurred continuation render through this one
builder, so they place the image **identically**. That is what makes the blur a
pure defocus of the same pixels rather than a ghosted second copy: the blurred
layer is literally the crisp layer with `filter: blur(...)` and a feather mask on
top. Drawing the crisp layer full-card (rather than clipped at the band) means
there is no clip line for the dark base to show through at the seam.

The builder applies the watermark `clip-path` (see below).

## Layer stack (current implementation)

`ArtLayers` renders, back to front:

1. **Base** — a solid dark fill (`ART_EXTENSION_BASE_COLOR`, or the sampled art
   color once known) so any sliver an edge does not reach reads as dark, never as
   page background.
2. **Crisp art** — `artImageStyleExtended` image, drawn full-card and
   watermark-clipped (no band clip), so it backs the feather with real pixels.
3. **Blurred continuation** — a second `artImageStyleExtended` image, `filter:
   blur(...) brightness(...)`, inside a wrapper carrying the **feather mask**.
4. **Color tint** — a vertical gradient in the art's darkened bottom color.

The chrome (name bar, type label, rules box, orbs) draws on top of all of this
with its own `z-index`.

## The fill technique, and why it is what it is

The fill is a **blurred defocus of the artwork's genuine downward continuation**,
darkened and tinted toward the art's own bottom color. Each word was chosen
against a failure mode (see Pitfalls):

- **Defocus, not a flat color bar** — keeps texture so the band does not look
  synthetic.
- **Genuine continuation, not a mirror reflection** — a mirror folds the image
  about the seam, and the fold line is an axis of symmetry the eye locks onto as
  a seam. The continuation has no symmetry.
- **Color-matched + darkened** — a neutral blur reads as a distracting light-gray
  bar that clashes with the art. Tinting toward a darkened version of the art's
  bottom color makes the band on-palette and dark.
- **Brightness-reduced blur** — the source below the crop is often *lighter* than
  the art at the seam (e.g. dark rocks over a hazy sky), so the raw continuation
  can be lighter than the connecting art. A `brightness()` multiplier pulls light
  regions down proportionally while leaving already-dark bands dark.

## Color sampling

`sampleBottomColor(image)` draws a band of the source into a `1 × 1` canvas to
average it in one step. It samples the band **just above the watermark strip**
(`[usableBottom - strip, usableBottom]`), never the strip itself, or the tint
goes white. Card images are same-origin, so the canvas is not tainted; any
failure returns `null` and the band falls back to the neutral dark base.

The sampled color is multiplied by `ART_EXTENSION_TINT_DARKEN` and used for both
the base fill and the tint gradient.

## Watermark crop

`ART_SOURCE_BOTTOM_CROP = 21 / 280` is applied as `clip-path: inset(0 0 7.5% 0)`
on **both** art images (crisp and blurred). Because each image renders the source
1:1 along its own height, insetting the bottom by that fraction removes exactly
the strip; the clipped sliver falls behind the fill/box. The sampler excludes the
same fraction. This is the one fix that must survive any rewrite — without it,
pushing the art up exposes the watermark.

## Sizing the band per card

The band is sized per card so it is **smaller on simple cards (one line of rules
text) and larger on wordy cards, without ever showing a visible seam.** This is
the genuinely difficult part of the feature, and the design below is shaped
entirely by the constraints and pitfalls that follow. Read them before changing
the sizing — almost every simpler approach reintroduces a seam.

### How it works now

A `ResizeObserver` measures the rules text box's top edge relative to the card
and stores it as `boxTopFrac = (boxTop - cardTop) / cardHeight`. `ArtLayers`
turns that into `bandTopPct`, clamps it to
`[ART_BAND_MIN_TOP_PCT, ART_BAND_MAX_TOP_PCT]` (`bandTop`), and derives the band:

- The **feather start** sits `ART_EXTENSION_FEATHER_ABOVE_PCT` *above* `bandTop`,
  so the blur eases in from the crisp art over a long, gentle ramp with no hard
  line where it shows beside the box.
- The **fully-blurred seam** sits `ART_EXTENSION_FEATHER_BELOW_PCT` *below*
  `bandTop` — a small offset, so the solid dark band stays thin.
- The **tint** begins its lead-in `ART_EXTENSION_TINT_ABOVE_PCT` above `bandTop`,
  reaches its seam alpha at the seam, and grounds nearly solid at the card bottom.

Because the band is anchored to the measured box top rather than a fixed card
position, a one-line box (low on the card) yields a small band and a wordy box (a
tall box, higher up) yields a larger one. The long upward feather is what
dissolves the seam; it reads as a soft defocus rather than a line. Before the box
is measured (and for cards with no rules box) the band falls back to
`ART_BAND_DEFAULT_TOP_PCT`, the `ART_EXTENSION_FRACTION` baseline. The band draws
behind the box and never changes the box's size, so writing the band from a box
measurement cannot loop; a small dead-band (`< 0.002`) absorbs observer jitter.

### The two parts of the band

Think of the band as two distinct things:

- The **fully-blurred seam** — the line where the blur mask reaches full opacity
  and the darkening begins. This is the part that, if visible, reads as a hard
  cut.
- The **feather** — the gradual ramp from crisp to fully blurred. Smoothness is
  entirely a function of how long this ramp is.

### The constraints

1. **The band must at least cover the text box.** Its purpose is to back the text
   with calm fill. So the *minimum* band height is the text-box height. This
   scales fine; it is not the problem.

2. **The fully-blurred seam must stay hidden behind the text box.** If you anchor
   the seam to the box's *top edge*, the seam lands exactly where crisp art meets
   the box and becomes the most visible line on the card. The seam must sit a
   sliver *below* the box top (tucked behind the box), or deep near the card
   bottom — never at the box top.

3. **A feather pinned to a fixed card position does not scale.** A feather fixed
   at one card-height position is hidden behind a tall three-line box but spills
   *above* a short one-line box (which covers less of it), so blur bleeds onto the
   artwork above the box. Anchoring the feather *start* to the measured box top
   instead keeps it tucked at the box on every card, so a single fixed feather
   length stays smooth without spilling.

4. **The blur must back the crisp art at the seam.** If the crisp art is clipped
   at the band's top and the blur mask is *transparent* there (e.g. a feather that
   ramps in going downward from the seam), the dark base shows through the 1px gap
   between "crisp art ends" and "blur begins" — a thin hard line. The crisp art is
   therefore drawn **full-card and unclipped**, so it backs the ramp and there is
   no gap to expose.

### The design (anchor the band to the box top)

The combination that satisfies all four constraints is:

- Draw the **crisp art full-card and unclipped** (`artImageStyleExtended`, no band
  clip) so there is never a clip-gap line. The blurred layer sits on top of it.
- Anchor the **feather start** to the measured text-box top, so the ramp tracks
  the box and never spills onto the crisp art above a short box.
- Place the **fully-blurred seam** a fixed small distance *below* the feather
  start (`ART_EXTENSION_FEATHER_BELOW_PCT`), tucked behind the box's top edge, so
  the seam line is hidden regardless of box size.
- Ramp the **tint** in just above the seam, so darkening stays at/below the box
  top and never reaches the crisp art above the box.

The text box (not the whole bottom chrome) is measured with a `ResizeObserver`,
converting `(boxTop - cardTop) / cardHeight` into the band top, clamped to a sane
min/max. Measuring the **box**, not the chrome, matters: the chrome includes the
floating type label, which adds a fixed offset that over-sizes every band and
hides the per-line differences.

There is no feedback loop to fear here: the box's size depends on its text, not
on the band, so writing the band fraction from a box measurement is stable. Add a
small dead-band (e.g. ignore deltas < 0.002) to avoid observer jitter.

## Pitfalls catalogue

Each of these was hit during development. The symptom, root cause, and the rule
that avoids it:

### Mirror reflection fold
- **Symptom:** an upside-down duplicate of the art's bottom appears in the band,
  with a crease line at the fold.
- **Cause:** filling the band by reflecting the art about the seam. A reflection
  is symmetric about the fold, and the eye reads the symmetry axis as a seam even
  when heavily blurred.
- **Rule:** fill with the *continuation* (extend the same crop past the seam),
  never a reflection.

### Light-gray neutral band
- **Symptom:** the band is a pale gray bar that does not match the art.
- **Cause:** blurring/darkening toward neutral black/gray, plus an `overlay`-blend
  noise layer that grays mid-tones.
- **Rule:** tint the band toward a *darkened sample of the art's own bottom
  color*; drop neutral noise overlays.

### Band lighter than the connecting art
- **Symptom:** even color-matched, the band glows lighter than the art at the
  seam.
- **Cause:** the source below the crop window is genuinely brighter than the art
  at the seam.
- **Rule:** apply a `brightness()` < 1 multiplier to the blurred layer; it pulls
  light areas down proportionally and leaves dark bands dark.

### Seam from anchoring the band to the box top
- **Symptom:** a visible horizontal line right at the text box's top edge.
- **Cause:** the fully-blurred seam (and tint onset) was placed *at* the box top.
- **Rule:** keep the seam tucked *behind* the box; never at its top edge.

### Blur spilling above short text boxes
- **Symptom:** one-line cards show blur creeping up onto the crisp artwork above
  the box; three-line cards look fine.
- **Cause:** a fixed feather length; a short box covers less of it.
- **Rule:** scale the feather with the box, and/or keep it behind the box.

### Clip-gap hard line (the sneaky one)
- **Symptom:** a thin dark line at the seam even though the blur "ramps in."
- **Cause:** the crisp art is clipped at the seam while the blur mask is
  transparent there, so the dark base shows through the gap.
- **Rule:** the blur must be opaque at the clip line, **or** render the crisp art
  full-card/unclipped so it backs the ramp.

### Watermark strip reappears
- **Symptom:** a bright/white strip across the band on some cards.
- **Cause:** pushing the art up raises the source's bottom (the watermark) into
  view; the default zoom no longer hides it.
- **Rule:** crop the strip with `clip-path` on both images and exclude it from the
  color sample.

### Feather ghosting
- **Symptom:** the feather looks like a double exposure rather than a defocus.
- **Cause:** the crisp and blurred layers use different crop math, so they are
  slightly misaligned where they overlap.
- **Rule:** crisp and blurred layers must use the *same* crop placement; the blur
  is literally the same image blurred.

### Measuring the chrome instead of the text box
- **Symptom:** dynamic bands are all large and barely differ between one- and
  three-line cards.
- **Cause:** measuring the whole bottom chrome (type label + gap + box) adds a
  fixed baseline.
- **Rule:** measure the rules box element specifically.

## Tunable constants (current)

In `card-aspect.ts`:
- `ART_EXTENSION_FRACTION` (`0.1`) — the band-sizing seed: it fixes the art
  region's aspect and is the default band top until the rules box is measured.
- `ART_REGION_ASPECT_RATIO_VALUE` — derived wider aspect of the art region.

In `CardView.tsx`:
- `ART_SOURCE_BOTTOM_CROP` (`21/280`) — watermark strip crop fraction.
- `ART_BAND_DEFAULT_TOP_PCT` (`(1 - ART_EXTENSION_FRACTION) * 100`) — band top
  used before the rules box is measured / when there is no box.
- `ART_BAND_MIN_TOP_PCT` (`55`) / `ART_BAND_MAX_TOP_PCT` (`94`) — clamp on the
  measured box-top %, bounding the tallest and smallest band.
- `ART_EXTENSION_FEATHER_ABOVE_PCT` (`7`) — card-height % the blur ramp begins
  above the box top (the long lead-in that dissolves the seam).
- `ART_EXTENSION_FEATHER_BELOW_PCT` (`3`) — card-height % from the box top down to
  the fully-blurred seam (kept small so the solid dark band stays thin).
- `ART_EXTENSION_TINT_ABOVE_PCT` (`3`) — card-height % above the box top where the
  tint begins its lead-in.
- `ART_EXTENSION_BLUR_RATIO` (`0.06`) — blur radius as a fraction of card width.
- `ART_EXTENSION_BLUR_BRIGHTNESS` (`0.6`) — brightness multiplier on the blur.
- `ART_BOTTOM_SAMPLE_FRACTION` (`0.3`) — source band height averaged for the tint.
- `ART_EXTENSION_TINT_DARKEN` (`0.4`) — multiplier darkening the sampled color.
- `ART_EXTENSION_TINT_SEAM_ALPHA` (`0.5`) / `ART_EXTENSION_TINT_EDGE_ALPHA`
  (`0.92`) — tint alpha at the seam and the bottom edge.
- `ART_EXTENSION_BASE_COLOR` (`#0b0b0d`) — neutral dark base before sampling.

## QA recipe

Run the full checks (`npm run lint`, `npm run typecheck`, `npm test`), then do
browser QA in the card editor against `cards_v2`:

```
http://localhost:<port>/editor?toml=cards_v2.toml&size=large
```

Validate at both `medium` and `large` sizes. For close inspection, pin a single
card large and screenshot it; to inspect the raw band, hide the chrome (set
`visibility: hidden` on the card's `z-index`-bearing children) so the transition
is not covered by the text box.

Always test on the three line counts together — they exercise the band-sizing
behavior that everything else trades against:

- **One line** (e.g. *Blade of Unity*, *Blazepath Traveler*) — the hardest case;
  watch for blur above the box and for a seam at the box top.
- **Two lines** (e.g. *Heroic Rescue*, *A New Adventure*).
- **Three lines** (e.g. *Abomination of Memory*).

Also confirm: no watermark strip on bright-bottomed art (e.g. *Abyssal
Enforcer*); the band color matches the art's palette across warm, cool, and
purple cards; and the captured error buffer is clean (no render exceptions).
