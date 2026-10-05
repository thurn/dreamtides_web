---
name: cumulus
description: Use when writing or changing any Dreamtides UI — building screens, using or adding Cumulus design-system components, styling, spacing, colors, icons, or reviewing UI code. Triggers on cumulus, design system, UI component, screen adapter, view model, Pressable, GlassPanel, InfoCard, GameCard, tokens, spacing, styling, /cumulus.
---

# Cumulus

Cumulus (`src/cumulus/`) is the design system every screen is built from: a
small catalog of strictly typed components plus one token vocabulary. Start
every UI change by finding the component that already does the job.

- Components: `src/cumulus/components/<area>/` (atlas, battle, card, controls,
  dreamscape, hud, layout, overlay, status, typography); primitives such as
  `Pressable`, glyphs, art refs, and media crops in `src/cumulus/primitives/`.
  Prop JSDoc is the API documentation; read it for every component you touch.
- Tokens: `src/cumulus/primitives/cumulus-tokens.css`, the canonical
  vocabulary with role notes. Tokens are scoped to the `.cumulus` subtree.
- Screens: `src/cumulus/screens/`; adapters and view-model builders:
  `src/screens/cumulus_adapters/`.

## Customization ladder

Uniformity is the point: a component reads the same on every screen. When a
component seems to need customizing, stop at the first rung that fits:

1. Use an existing component or variant as-is; match how other screens solve
   the same problem.
2. Wrap it for layout: size, position, and spacing belong to a wrapper you
   own. The component's appearance stays fixed.
3. Add one new enumerated variant when no existing one expresses the need.
4. Propose a new strict component.

Never widen a prop into an open value: no numeric `size`/`gap`/`padding`,
per-instance `color`, `className`, `style`, or `CSSProperties` props, and no
one-screen decorative toggles. Components decide state-dependent looks from
their semantic model. ESLint (`no-escape-hatch-props`) and API contract tests
enforce this; never disable them. A local copy of a component's material,
type scale, or geometry is a fork and does not ship.

## Values and models

- Props take named value types, never bare strings: `CumulusColor` (palette
  role, or `#hex` only for data-driven color), `Glyph` from `glyph.ts`,
  `ArtRef` from `art.ts`, crops from `media.ts`.
- Components take structured models (`GameCard` takes a card model,
  `AtlasNode` an `AtlasNodeModel`, rules text a `RichText` body), not
  arbitrary JSX. Only documented slots (`Pressable` children, `GlassPanel`
  content) accept ReactNode.
- The primary action callback is `onPress`; item callbacks keep the
  convention (`onCardPress`). Controlled values use `onChange`-style names.
- Add no unrequested visible text. Accessibility names remain required.

## Tokens

- In TS/TSX use `token("--space-l")` (typed; returns `var(--space-l)`); in
  CSS use `var(--space-l)`.
- Pick tokens by role, never by resolved value: `--text-secondary` because
  the text is secondary. Scale families: `--space-*` (4px grid from `xs`;
  `xxs` for tight optical gaps), `--radius-*`, `--t-*`, `--dur-*`/`--ease-*`,
  `--shadow-*`/`--glow-*`. Layout constants: `--gutter`, `--touch-min`,
  `--hud-h`, `--safe-top`.
- Type is one voice at a time: `font: token("--t-body")`. Never compose
  face or weight around a `--t-*` token.
- A missing role means a new named token in `cumulus-tokens.css`, never a raw
  px or hex literal. Lint enforces this (`no-hardcoded-values`,
  `no-untokenized-lengths`, `no-composed-type-voice`,
  `valid-token-references`). Box measures (width, height, min/max) are the
  caller's numbers; keep them as commented module constants.

## Materials

- **Liquid glass** is the one translucent material: a blurred, tinted fill
  with sheen, rim, and shadow, defined once by `glassSurfaceStyle()` in
  `src/cumulus/internal/glass-surface.ts` from the `--glass-*` tokens. Use it
  only for surfaces floating over scene art: `GlassPanel`, `GlassDialog`,
  `InfoCard` (with the warmer `--glass-fill-popover`), status displays,
  galleries, speech bubbles, and glass controls. Controls nested on glass use
  their `onGlass` placement.
- Text on glass uses `--text-on-glass` or `--text-on-glass-muted`; authored
  `[purple]` tutorial emphasis uses `--text-tutorial-highlight`. Accent and
  resource tokens are not glass text colors (`no-purple-text-on-glass`).
- Surfaces that do not float over art use a solid material, not glass.

## Rendering rules

- Floating panels hug their content: no stretched slots, spacers, or
  decorative height. Cap overflow with `max-height` and scrolling.
- Meaningful objects travel or expand between states; nothing pops.
- Tangible game objects drift gently; review chrome holds still.
- On-media text uses the outline dilation (`--text-outline-media`); dense
  information goes in a `GlassPanel`. No scrims or washes over scene art.
- Every reveal-on-interaction popup renders through `InfoCard`:
  pointer-anchored, no close button, no scrim; hover on fine pointers,
  touch-hold on touch. Augury's `OfferTile` centering its InfoCard above the
  offer is the single exception.
- Variable-length sibling cards get natural height with cross-axis
  centering, not stretch-equalized heights.
- Voice: second person, literary; Title Case titles; no emoji.

## Isolation boundary

Code under `src/cumulus/` imports only `src/cumulus/`, `node_modules`, and
the non-UI allowlist (`src/data/`, `src/types/`, `src/runtime/`,
`src/logging.ts`). The rest of the app imports its UI from Cumulus. The lint
boundary is fail-closed; move code rather than widening it. Outer UI files
have checked roles in `eslint-rules/ui-boundary-roles.js`.

## Building a screen: screen, builder, adapter

1. **Screen** `src/cumulus/screens/FooScreen.tsx`: pure presentation from a
   view model, events out through callbacks carrying ids. No `useJourney()`,
   mutations, navigation, or logging. It owns and exports `FooView` and
   `FooScreenProps`. Local UI state (hover, selection, animation phase) lives
   here. Interactions go through `Pressable`-based components; a
   `<div onClick>` is a lint error. Give test targets `data-*` attributes
   keyed by entity id.
2. **Builder** `src/screens/cumulus_adapters/foo-view-model.ts`: pure,
   exported, React-free functions from domain data to view types, holding
   every mapping rule (caps, suppression, fallbacks). No `react` or
   `src/state` imports; `.ts` only. Domain rules other systems need belong in
   `src/data/`.
3. **Builder tests** beside it, with synthetic fixtures.
4. **Adapter** `FooScreenAdapter.tsx`: wiring only, at most 120 lines
   (`thin-adapters`): acquire state, call the builder in `useMemo`, wire
   callbacks to mutations, render the screen. Mint per-mount randomness with a
   lazily initialized `useRef`, not `useMemo`. Guard mount effects and logs
   against StrictMode double-firing with a ref. Resolve ids defensively.
5. **Screen tests** `FooScreen.test.tsx`: render with `renderInCumulus` from
   `src/cumulus/testing/render.tsx`, which mounts inside `CumulusRoot` and
   tears down after each test (the shared setup already provides the act
   environment and a `matchMedia` default). Assert through `data-*` hooks
   and roles, never product copy or restated token values.
6. **Register** the screen in `screenFor` or `siteDispositionFor`
   (`src/screens/cumulus_adapters/registry.tsx`) and update its table test.
   Registration wraps it in `CumulusJourneyChrome`, which supplies the
   desktop gear, mobile hamburger, and `JourneyStatusBar`; screens never
   render that chrome themselves.
7. **QA**: add a `?goto=` scene in `src/runtime/qa-scenes.ts` if the screen
   is otherwise reachable only by playing forward, then follow the README's
   Browser QA section.

Large screens keep one root view model, split the builder per region, and
memoize each region in the adapter.

## QA bar for UI changes

- Measure, don't adjectivize: spacing claims are `getBoundingClientRect()`
  numbers; a gap that is not a `--space-*` step is a finding.
- Sweep content variance: longest and shortest copy, collections at their
  cap, every toggle state.
- Exercise every new knob at its extremes.
- For new screens and redesigns, take one cold holistic look at the final
  composition: control scale per platform, hierarchy, rhythm.
- If you want to hedge in the summary, fix the doubt first.
