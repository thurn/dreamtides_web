# Dreamcaller Selection — mobile swipe carousel (Tango)

**Date:** 2026-07-04
**Status:** Approved design, ready for implementation plan
**Source design:** `claude.ai/design` project `fa1281a7-9765-4ae4-832d-6c5bd86d9f0e`,
file `01-dreamcaller-selection.html` (imported via the design connector).

## Goal

Replace the current Tango Dreamcaller-selection screen (a static row of pickable
cards) with the imported mobile design: a **full-bleed swipe carousel**, one
Dreamcaller per page. Focus on getting the mobile presentation right; a
desktop/wide layout is out of scope for this change.

The screen remains the quest's opening screen and keeps today's flow: choosing a
Dreamcaller starts the quest immediately.

## What the screen is

A horizontally swipeable carousel of the three offered Dreamcallers. Each page:

- A **full-bleed cinematic portrait** filling the viewport.
- Drifting **motes** over the portrait of the active page only.
- A screen header eyebrow — **"Choose Your Dreamcaller"** — pinned at the top,
  above the per-page content, that does not swipe.
- The serif **"{Name}, {Epithet}"** title floating near the top of the page,
  legible via on-media outline text (not a painted scrim).
- A frosted-glass **console** pinned to the bottom containing, top to bottom:
  1. **Ability text** (`RulesText`), press-to-reveal keyword definitions.
  2. A brand-tinted hairline **divider**.
  3. A **Tides row**: a collapsed cluster of overlapping colored glyph discs
     with a "Tides" label, and the **Starting Essence** value at the right of
     the same row. Tapping the tides cluster runs a container-transform: each
     disc flies out and morphs into its full named `TidePill`.
  4. A full-width **"Choose {Name}"** button.
- **Edge chevrons** (left/right) to page without swiping; shown only when a
  neighbor exists.

"Choose {Name}" calls `onPick(dreamcallerId)`. The adapter's `onPick` runs
`startQuest` exactly as today — no intermediate confirmation.

## Scope

**In scope**

- The carousel select screen only.
- Full container-transform fidelity for the tides disc→pill reveal, promoted to
  a reusable Tango component.
- A new full-bleed `DreamcallerPortrait` variant.

**Out of scope**

- The design's `ConfirmScreen` (detail view) and `BegunScreen` (essence
  count-up bootstrap). The design's live `App` renders neither; its "Choose"
  button is a no-op stub. We wire "Choose" straight to `startQuest`.
- A dedicated desktop/wide layout.
- Signature-card display. Per the decision below, non-tides4 runs hide the tides
  row rather than falling back to a signature-card list.

## Decisions

1. **Carousel only.** "Choose" → `onPick` → `startQuest`, matching today's flow.
2. **Full container-transform**, promoted to a Tango component (`TideCluster`).
3. **Hide the tides row when a run has no tides.** The screen assumes the
   documented `tides4` default (per `AGENTS.md`), under which tides always
   exist. Other draft algorithms produce no tides, and for them the row is
   simply omitted. The signature-card list the legacy screen showed for those
   runs is dropped from the new screen.

## Architecture — three files (per the tango-migrate checklist)

### 1. `src/tango/screens/QuestStartScreen.tsx` (rewritten, pure)

Pure presentation. Renders from the existing `DreamcallerOfferView[]`; reports
the chosen Dreamcaller through `onPick(dreamcallerId: string)`. No `useQuest()`,
no mutations, no navigation, no logging.

Local UI state lives here:

- `index` — the current carousel page.
- Drag state (`x0`, live `dx`) for swipe.
- `stageRef` — the screen root, passed to every `InfoCard.PressInfo` /
  `TidePill` / `TideCluster` reveal so popups anchor and clamp on-screen.

The exported view types are unchanged in shape from today
(`DreamcallerOfferView`, `DreamcallerTideView`, `QuestStartScreenProps`), except
that `signatureCards` is no longer read by the screen. Keep the field on the
type for now (the builder still populates it deterministically); the screen
ignores it. `onPick` still carries the Dreamcaller **id**, never a domain
object.

Presentation composed from Tango:

| Design element | Tango |
| --- | --- |
| "Choose {Name}" button | `Button` `size="lg" full label={`Choose ${name}`}` |
| Ability text | `RulesText` |
| Ability keyword reveal (touch-down) | `InfoCard.PressInfo` anchored to `stageRef` |
| Tide pills (expanded) | `TidePill` (`size="sm"`, `stageRef` reveal) |
| Starting essence value + mark | `ResourceChip kind="essence"`, wrapped in `InfoCard.PressInfo` |
| Frosted console surface | `GroupPanel` |
| Drifting motes | `Motes` `tint="warm"` on the active page |
| Full-bleed portrait | `DreamcallerPortrait variant="cover"` (new) |
| Tides disc→pill reveal | `TideCluster` (new) |
| Edge chevrons | `Pressable` |
| Carousel track / swipe / page index | screen-local layout + state (rung-2 wrapper) |

Layout wrappers use `--space-*`, `--gutter`, `--safe-top`, `--safe-bottom`,
`--touch-min` tokens. Type is applied one voice at a time (`font: token("--t-…")`).
The root carries `className="tango"` and `minHeight: "100vh"`.

**Legibility** (per the ladder): the serif title uses the Tango on-media outline
treatment; the dense console content sits in a `GroupPanel` glass pane. No
scrim/wash/vignette is painted over the portrait to fake legibility.

**`data-*` hooks**, keyed by Dreamcaller id, preserved / added for tests and QA:

- Per-page container: `data-dreamcaller-page={dreamcallerId}`.
- Choose button: `data-choose-dreamcaller={dreamcallerId}`.
- Essence value: `data-starting-essence-value={dreamcallerId}`.
- Tides cluster: `data-dreamcaller-tides={dreamcallerId}`.
- Each resting tide pill: `data-dreamcaller-tide={`${dreamcallerId}:${tideId}`}`.

### 2. `src/screens/tango_adapters/quest-start-view-model.ts` (nearly unchanged)

Already maps domain data to the screen's view types: `name`, `title` (the
epithet shown after the name), `renderedText` (ability), `startingEssence`, and
the `tides` capped by `largestTides`. No change required to its tide/essence
mapping.

The screen ignoring `signatureCards` needs no builder change — the builder still
produces the field deterministically and its existing unit tests still hold. (If
review prefers, a follow-up can drop the field, but that is not required for this
change and would ripple into the shared screen view types.)

### 3. `src/screens/tango_adapters/QuestStartScreenAdapter.tsx` (unchanged)

Still mints the offer + run seed once per mount (`useRef` lazy-init), builds the
view-model in `useMemo`, and wires `onPick` → `startQuest(dreamcaller, seed)`.
No change needed unless a mount-log (`site_entered`-style) is added; if so it
follows the StrictMode-guarded-ref idiom.

## New design-system work

### A. `DreamcallerPortrait` — new `variant="cover"`

A frameless, full-bleed cinematic framing that fills its container's width **and**
height with `object-fit: cover` and a cinematic crop (roughly `50% 10%`
object-position, a modest upscale). No border, no radius, no sunken backing, no
shadow — the caller's container defines the bounds (the screen gives it an
absolute `inset: 0` page). The `size` prop does not apply to `cover` (it fills).
The existing `hero` / `panel` / `thumb` variants are untouched.

Deliverables: the variant in `frameStyle`/`imageStyle`, its JSDoc, and — because
the demo/docs are generated from source — an updated demo entry
(`src/tango/docs/demos/dreamcaller-portrait.tsx` if present, else the relevant
demo) plus regenerated `tango-metadata` / `tango-docs`.

### B. `TideCluster` — new component (`src/tango/components/hud/TideCluster.tsx`)

The collapsed overlapping glyph-discs → named-pills container-transform, at full
fidelity (the design's `TideReveal`: flying clones that fly each disc to its pill
slot and grow into the full chip, with a staggered timeline and the sheet height
animating in step; the reverse on collapse; reduced-motion collapses to an
instant open/close).

- **Model in, not markup:** takes a structured list of tides (each: stable
  `id`, `label`, `description`, and the `Tide` union member fixing icon+color) —
  the same data the screen already has from `DreamcallerTideView`. It renders
  the resting expanded state as `TidePill`s (so per-pill description reveals come
  from `TidePill`'s own InfoCard engine), and owns the collapsed discs + flying
  clones internally.
- **No escape hatches:** no `className`/`style`/raw color/size props. Colors come
  from the tide's semantic model (mirroring `TidePill`'s tone table via tokens);
  spacing/motion from tokens (`--dur-*`, `--ease-*`, `--space-*`, `--r-pill`).
- **`stageRef`** is threaded through to the `TidePill` reveals.
- Animation internals use refs + `useLayoutEffect` (measure discs and hidden
  pills in stage-local coordinates, spawn clones at the start pose, set the end
  pose imperatively before paint so CSS transitions tween, swap clones→real
  pills in one commit on land). Honors `prefers-reduced-motion`.

Deliverables: the component with per-prop JSDoc, a demo entry
(`src/tango/docs/demos/tide-cluster.tsx`) registered in
`src/tango/docs/registry.ts`, and regenerated docs. It must pass the strict-API
contract test and the isolation-boundary lint.

### Ability keyword reveal

Use `InfoCard.PressInfo` (the popup-rule-compliant path) to anchor the keyword
definitions beside the ability text on touch-down / hover, rather than the legacy
`HoverPopover` + `CardTermDefinitions` the current screen uses. The anchored card
lists the glossary terms present in the ability. If InfoCard's single title/body
shape cannot cleanly hold a multi-term list, the term list is rendered as the
anchored card content (still through the `InfoCard.PressInfo` engine and
`stageRef`), keeping every reveal on the InfoCard contract.

## Tests

- **Builder tests** (`quest-start-view-model.test.ts`): existing tests continue
  to hold; no production TOML values asserted (per `AGENTS.md`).
- **Screen tests** (`src/tango/screens/QuestStartScreen.test.tsx`): rewritten for
  the carousel with the two required incantations
  (`IS_REACT_ACT_ENVIRONMENT = true`; a `window.matchMedia` stub). Assert via the
  `data-*` id hooks: the active page renders, "Choose" fires `onPick` with the
  correct id, tides render when present and are absent when the offer has no
  tides, essence value is shown.
- **`TideCluster` component test** (`src/tango/components/hud/TideCluster.test.tsx`):
  renders the discs collapsed, toggles to pills, asserts the resting `TidePill`s
  appear. Animation timing is not asserted (reduced-motion path exercises the
  instant open/close).
- **Contract tests**: `tango-strict-api.contract.test.mjs` (scans
  `src/tango/screens/` and components) and `tango-generated-docs-drift.test.mjs`
  must pass after regenerating metadata/docs.

## Registration, QA, and rollback

- `?ui=tango` is already the default variant and the screen is already
  registered via `QuestStartScreenAdapter`; this change rewrites that screen in
  place, so no new registry entry is needed. `?ui=legacy` remains the rollback.
- QA scene: the screen is the quest opening screen; confirm it has (or add) a
  `?goto=` entry so the carousel can be reached directly. Run the standard
  agent-browser pass on a non-default port: drive swipe + chevrons, expand the
  tides cluster, press-reveal ability keywords and essence, press "Choose", and
  confirm the run starts. Check the error buffer; verify layout/visibility/
  coherence at mobile viewport sizes and that nothing clips or overlaps.

## Verification

```bash
npm run lint
npm run typecheck
npm test
```

Regenerate and commit generated artifacts after touching components/tokens:

```bash
npm run tango-metadata && npm run tango-docs
```

(or `npm run regenerate-assets`). Commit with a detailed description and push.
