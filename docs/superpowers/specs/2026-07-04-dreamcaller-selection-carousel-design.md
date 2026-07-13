# Dreamcaller Selection — mobile swipe carousel (Cumulus)

**Date:** 2026-07-04
**Status:** Approved design, ready for implementation plan
**Source design:** `claude.ai/design` project `fa1281a7-9765-4ae4-832d-6c5bd86d9f0e`,
file `01-dreamcaller-selection.html` (imported via the design connector).

## Goal

Replace the current Cumulus Dreamcaller-selection screen (a static row of pickable
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
  a reusable Cumulus component.
- A screen-local full-bleed portrait component (`DreamcallerPortrait` is **not**
  modified).
- Evolving `CardTermDefinitions` in place to render `InfoCard` tiles (no new
  parallel component), which updates the new ability reveal **and** — because
  they already consume it — the Cumulus `Dreamsign` and `GameCard`/`CardView`
  reveals, plus the two shared legacy consumers, automatically (see "New
  design-system work → C").

**Out of scope**

- The design's `ConfirmScreen` (detail view) and `BegunScreen` (essence
  count-up bootstrap). The design's live `App` renders neither; its "Choose"
  button is a no-op stub. We wire "Choose" straight to `startQuest`.
- A dedicated desktop/wide layout.
- Signature-card display. Per the decision below, non-tides4 runs hide the tides
  row rather than falling back to a signature-card list.

## Decisions

1. **Carousel only.** "Choose" → `onPick` → `startQuest`, matching today's flow.
2. **Full container-transform**, promoted to a Cumulus component (`TideCluster`).
3. **Hide the tides row when a run has no tides.** The screen assumes the
   documented `tides4` default (per `AGENTS.md`), under which tides always
   exist. Other draft algorithms produce no tides, and for them the row is
   simply omitted. The signature-card list the legacy screen showed for those
   runs is dropped from the new screen.

## Architecture — three files (per the cumulus-migrate checklist)

### 1. `src/cumulus/screens/QuestStartScreen.tsx` (rewritten, pure)

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

Presentation composed from Cumulus:

| Design element | Cumulus |
| --- | --- |
| "Choose {Name}" button | `Button` `size="lg" full label={`Choose ${name}`}` |
| Ability text | `RulesText` |
| Ability keyword reveal (touch-down) | `InfoCard.PressInfo` with `card={<CardTermDefinitions text/>}` (see C) |
| Tide pills (expanded) | `TidePill` (`size="sm"`, `stageRef` reveal) |
| Starting essence value + mark | `ResourceChip kind="essence"`, wrapped in `InfoCard.PressInfo` |
| Frosted console surface | `GroupPanel` |
| Drifting motes | `Motes` `tint="warm"` on the active page |
| Full-bleed portrait | screen-local component (reuses `dreamcallerImageSrc`) |
| Tides disc→pill reveal | `TideCluster` (new) |
| Edge chevrons | `Pressable` |
| Carousel track / swipe / page index | screen-local layout + state (rung-2 wrapper) |

Layout wrappers use `--space-*`, `--gutter`, `--safe-top`, `--safe-bottom`,
`--touch-min` tokens. Type is applied one voice at a time (`font: token("--t-…")`).
The root carries `className="cumulus"` and `minHeight: "100vh"`.

**Legibility** (per the ladder): the serif title uses the Cumulus on-media outline
treatment; the dense console content sits in a `GroupPanel` glass pane. No
scrim/wash/vignette is painted over the portrait to fake legibility.

**`data-*` hooks**, keyed by Dreamcaller id, preserved / added for tests and QA:

- Per-page container: `data-dreamcaller-page={dreamcallerId}`.
- Choose button: `data-choose-dreamcaller={dreamcallerId}`.
- Essence value: `data-starting-essence-value={dreamcallerId}`.
- Tides cluster: `data-dreamcaller-tides={dreamcallerId}`.
- Each resting tide pill: `data-dreamcaller-tide={`${dreamcallerId}:${tideId}`}`.

### 2. `src/screens/cumulus_adapters/quest-start-view-model.ts` (nearly unchanged)

Already maps domain data to the screen's view types: `name`, `title` (the
epithet shown after the name), `renderedText` (ability), `startingEssence`, and
the `tides` capped by `largestTides`. No change required to its tide/essence
mapping.

The screen ignoring `signatureCards` needs no builder change — the builder still
produces the field deterministically and its existing unit tests still hold. (If
review prefers, a follow-up can drop the field, but that is not required for this
change and would ripple into the shared screen view types.)

### 3. `src/screens/cumulus_adapters/QuestStartScreenAdapter.tsx` (unchanged)

Still mints the offer + run seed once per mount (`useRef` lazy-init), builds the
view-model in `useMemo`, and wires `onPick` → `startQuest(dreamcaller, seed)`.
No change needed unless a mount-log (`site_entered`-style) is added; if so it
follows the StrictMode-guarded-ref idiom.

## New design-system work

### A. Full-bleed portrait — a screen-local component (`DreamcallerPortrait` untouched)

`DreamcallerPortrait` is **not modified**. The carousel needs a frameless,
full-bleed cinematic portrait, which is screen-specific presentation, so it is a
**screen-local component** defined with the screen (in `QuestStartScreen.tsx`, or
a sibling module under `src/cumulus/screens/`), not a new shared variant on the
shared portrait.

- Renders an `<img>` filling its container (`position: absolute; inset: 0;
  width/height: 100%; object-fit: cover`) with a cinematic crop (roughly
  `50% 10%` object-position, a modest upscale), no frame/border/radius.
- **Reuses** the already-exported `dreamcallerImageSrc(imageNumber)` helper from
  `DreamcallerPortrait` for URL resolution (import only — no change to that
  file), and carries its own tinted-monogram fallback on image error, mirroring
  the shared portrait's fallback so a missing asset never leaves a hole.
- Box measures (100%/cover) are caller layout; any styling uses tokens.

No demo/docs changes (it is not a catalog component).

### B. `TideCluster` — new component (`src/cumulus/components/hud/TideCluster.tsx`)

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
(`src/cumulus/docs/demos/tide-cluster.tsx`) registered in
`src/cumulus/docs/registry.ts`, and regenerated docs. It must pass the strict-API
contract test and the isolation-boundary lint.

### C. `CardTermDefinitions` — evolve it in place to render `InfoCard` tiles

No new parallel component. The existing `CardTermDefinitions`
(`src/cumulus/components/card/CardTermDefinitions.tsx`) is **modified in place** to
render its stack as **individual `InfoCard` tiles** instead of the legacy
`GlossaryDefinitionCard` (which is styled with hardcoded colors + Tailwind,
outside the token system). Its name and prop surface (`text`, `testId`, `side`)
are preserved so no consumer signature changes; only the internal rendering
becomes InfoCard-vocabulary and fully tokenized.

- **The stack** becomes a token-styled flex column (`gap: --space-3`, keeping the
  current scroll cap as a box measure — `maxHeight` + `overflowY: auto`) of
  `InfoCard variant="text"` tiles, each `meta="Keyword"`, `title={entry.term}`,
  `body={richText.rules(entry.definition)}` (rules so definition glyphs render,
  matching today).
- **Term extraction** via `extractGlossaryTerms(text)` is unchanged (reading
  order, deduped); it still returns `null` for term-free text, so callers keep
  placing it unconditionally.
- After the swap the component is lint-clean (no `className`, no raw colors),
  and the `.cumulus` token scope resolves because each `InfoCard` re-establishes
  it (it already does for its portalled popover shell).

**Because the integration targets already consume `CardTermDefinitions`, their
adoption is automatic — no per-consumer rewrite:**

1. **`Dreamsign` (`DreamsignInfoCard`)** already stacks `CardTermDefinitions`
   under the object `InfoCard`; it now renders the InfoCard tiles for free. Whole
   reveal (object card + keyword cards) speaks one vocabulary.
2. **`GameCard`/`CardView`** already render `CardTermDefinitions` beside the card
   via `useCardTermPopover`; the side-placement (`computePopoverPlacement`, left
   preferred, flipping right near the edge) and the `pointer-events: none`
   informational-only contract are unchanged — only the tile look updates.
3. **The two shared legacy consumers** — `BattleCardHoverPreview` and the
   `?ui=legacy` `QuestStartScreen` — **inherit** the new InfoCard tiles too (a
   deliberate, confirmed side effect of the in-place swap). No edits to those
   files.

**The one piece of NEW wiring** — the Dreamcaller ability reveal (this screen):
the ability text is wrapped in `InfoCard.PressInfo` (the popup-rule-compliant
press/hover engine, anchored + clamped against `stageRef`) whose revealed `card`
is `<CardTermDefinitions text={dreamcaller.renderedText} />`. There is no object
card here — just the keyword stack. Because `CardTermDefinitions` returns `null`
for term-free ability text, the screen wraps in `InfoCard.PressInfo` only when
`extractGlossaryTerms(renderedText)` is non-empty; otherwise it renders the plain
`RulesText` with no reveal.

**Left unchanged:** `GlossaryDefinitionCard` itself and its remaining direct
consumers — Cumulus's `HoverZoomCard` and the legacy `CardHoverPreview`,
`GlossaryPopup`, `JourneyHoverCard`, `SignatureDecksApp` — keep the existing
tile; this change does not touch them.

**Deliverables:** the in-place `CardTermDefinitions` rewrite; updates to its
existing test and to `Dreamsign` / `CardView` tests where they assert the old
tile markup (behavior assertions kept); no new catalog component, so no new demo
entry (regenerate `cumulus-metadata` / `cumulus-docs` only if a touched component's
JSDoc/demo changed). Must pass the strict-API contract test and the
isolation-boundary lint.

## Tests

- **Builder tests** (`quest-start-view-model.test.ts`): existing tests continue
  to hold; no production TOML values asserted (per `AGENTS.md`).
- **Screen tests** (`src/cumulus/screens/QuestStartScreen.test.tsx`): rewritten for
  the carousel with the two required incantations
  (`IS_REACT_ACT_ENVIRONMENT = true`; a `window.matchMedia` stub). Assert via the
  `data-*` id hooks: the active page renders, "Choose" fires `onPick` with the
  correct id, tides render when present and are absent when the offer has no
  tides, essence value is shown.
- **`TideCluster` component test** (`src/cumulus/components/hud/TideCluster.test.tsx`):
  renders the discs collapsed, toggles to pills, asserts the resting `TidePill`s
  appear. Animation timing is not asserted (reduced-motion path exercises the
  instant open/close).
- **`CardTermDefinitions` test**: updated for the in-place swap — renders nothing
  for term-free text; renders one `InfoCard` tile per distinct glossary term in
  reading order for text with terms. Term fixtures derive from the live glossary,
  never hardcoded copy (per `AGENTS.md`).
- **`Dreamsign` / `CardView` tests**: update only where they assert the old
  `GlossaryDefinitionCard` markup (the definition content now renders as InfoCard
  tiles); keep the reveal-behavior assertions.
- **Contract tests**: `cumulus-strict-api.contract.test.mjs` (scans
  `src/cumulus/screens/` and components) and `cumulus-generated-docs-drift.test.mjs`
  must pass after regenerating metadata/docs.

## Registration, QA, and rollback

- `?ui=cumulus` is already the default variant and the screen is already
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
npm run cumulus-metadata && npm run cumulus-docs
```

(or `npm run regenerate-assets`). Commit with a detailed description and push.
