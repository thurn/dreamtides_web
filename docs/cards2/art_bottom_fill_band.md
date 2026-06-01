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
  crop-math helpers (`artCoverMetrics`, `artImageStyle`, `artImageStyleExtended`),
  the bottom-color sampler (`sampleBottomColor`), and the `ArtLayers` component
  that stacks the layers.
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

Two style builders consume it:

- `artImageStyle(art, imageAspect, frameAspect)` — centers the image in its
  parent box. Used for the **crisp art region**, whose parent is the top region
  (a `1 - ART_EXTENSION_FRACTION` tall box) and whose `frameAspect` is the wider
  `ART_REGION_ASPECT_RATIO_VALUE`.
- `artImageStyleExtended(art, imageAspect)` — places the *same* crop inside a
  **full-card** container, centered on the art region's center (not the card's),
  so the image keeps its art-region size/position but is free to extend past the
  seam. Used for the **blurred continuation**.

Key identity: for a given crop, `artImageStyle` (in the region box) and
`artImageStyleExtended` (in the full-card box) place the image **identically** in
the overlapping region. That is what makes the blur a pure defocus of the same
pixels rather than a ghosted second copy. If you ever change one builder, change
the other to match, or the feather will ghost.

Both builders apply the watermark `clip-path` (see below).

## Layer stack (current implementation)

`ArtLayers` renders, back to front:

1. **Base** — a solid dark fill (`ART_EXTENSION_BASE_COLOR`, or the sampled art
   color once known) so any sliver an edge does not reach reads as dark, never as
   page background.
2. **Crisp art region** — `artImageStyle` image, clipped to the top
   `ART_REGION_HEIGHT_PCT`%.
3. **Blurred continuation** — `artImageStyleExtended` image, `filter: blur(...)
   brightness(...)`, inside a wrapper carrying the **feather mask**.
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

## The hard part: sizing the band per card

The recurring, genuinely difficult requirement is: **make the band smaller on
simple cards (one line of rules text) and larger on wordy cards, without ever
showing a visible seam.** The current committed implementation uses a *fixed*
band (afab16c behavior) because the dynamic version kept reintroducing a seam.
This section explains exactly why, so the next attempt gets it right.

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

3. **A fixed-length feather does not scale.** afab16c's `0.16` feather is hidden
   behind a tall three-line box but spills *above* a short one-line box (because
   the short box covers less of it), which looks like blur bleeding onto the
   artwork above the box. Shortening the feather to fit a small band makes the
   transition abrupt — a seam. The feather length must scale with the box.

4. **The blur must be opaque where the crisp art is clipped.** The crisp region
   is clipped at its bottom edge. If the blur mask is *transparent* at that line
   (e.g. a feather that ramps in going downward from the seam), the dark base
   shows through the 1px gap between "crisp art ends" and "blur begins" — a thin
   hard line. Either keep the blur fully opaque at the clip line, or render the
   crisp art **full-card and unclipped** so it backs the ramp and there is no gap
   to expose.

### The recommended design (decouple seam from feather)

The combination that satisfies all four constraints — and the one this thread
kept *almost* reaching — is:

- Draw the **crisp art full-card and unclipped** (`artImageStyleExtended` without
  the region clip) so there is never a clip-gap line. The blurred layer sits on
  top of it.
- Anchor the **fully-blurred seam** a fixed small distance *below the text box's
  top* (tucked behind the box), so it is always hidden regardless of box size.
- Let only the **feather start** scale with the box: start it near the box top so
  a one-line card gets a short feather (more crisp art preserved) and a wordy
  card a longer one. Ramp the feather *behind* the box.
- Keep the **tint** ramping in at/below the seam only, so darkening never reaches
  above the box (only soft blur may, and only if you choose to let the feather
  extend slightly above for extra smoothness).

Measure the text box (not the whole bottom chrome) with a `ResizeObserver` and
convert `(cardBottom - boxTop) / cardHeight` into the band fraction, clamped to a
sane min/max. Measuring the **box**, not the chrome, matters: the chrome includes
the floating type label, which adds a fixed offset that over-sizes every band and
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
- `ART_EXTENSION_FRACTION` (`0.1`) — band height as a fraction of card height
  (the fixed-band baseline; becomes a default/seed if band sizing is made
  dynamic).
- `ART_REGION_ASPECT_RATIO_VALUE` — derived wider aspect of the art region.

In `CardView.tsx`:
- `ART_SOURCE_BOTTOM_CROP` (`21/280`) — watermark strip crop fraction.
- `ART_EXTENSION_FEATHER_FRACTION` (`0.16`) — feather height above the seam.
- `ART_EXTENSION_BLUR_RATIO` (`0.05`) — blur radius as a fraction of card width.
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
- **Two lines** (e.g. *Blazeguard*, *A New Adventure*).
- **Three lines** (e.g. *Abomination of Memory*).

Also confirm: no watermark strip on bright-bottomed art (e.g. *Abyssal
Enforcer*); the band color matches the art's palette across warm, cool, and
purple cards; and the captured error buffer is clean (no render exceptions).
