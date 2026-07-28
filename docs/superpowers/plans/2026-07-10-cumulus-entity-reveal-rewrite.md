# Cumulus Entity Reveal Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every Cumulus entity hover, focus, and press reveal with one
root-owned coordinator and strict self-revealing entity components.

**Architecture:** One coordinator per Cumulus application root owns the input
state machine, immutable geometry snapshot, measurement, placement, overlay,
accessibility, and diagnostics. Named entity components register semantic
models through a private adapter; temporary internal compatibility adapters
keep the application testable while GameCard, InfoCard entities, and Atlas move
onto the new system.

**Tech Stack:** React 19, TypeScript 5.8, Vitest, jsdom, Vite, custom ESLint
rules, `/opt/homebrew/bin/agent-browser`.

**Design references:**

- [Approved design](../specs/2026-07-10-cumulus-entity-reveal-rewrite-design.md)
- [Normative interaction contract](../../cumulus/entity-reveal-interactions.md)
- [Browser QA tooling](../../journey_prototype/qa_tooling.md)
- [Registered QA scenes](../../journey_prototype/qa_scenes.md)

## Global constraints

- Install exactly one reveal coordinator per mounted Cumulus application root.
- Keep reveal models, source bindings, geometry, and overlay rendering under a
  Cumulus-internal import boundary. Product screens cannot import them.
- Identify every card by UUID. Card names are display text only.
- Below the 900px breakpoint, every popup card is exactly 45% of the visual
  viewport width.
- Touch uses a 30ms intent filter, an inclusive 300ms hold boundary, 10px
  movement slop, and one 48px-diameter protected circle.
- Desktop small GameCards converge on a 340px reading copy. The only reveal
  motion is the approximately 160ms return-to-source transition.
- Reveal groups are pointer-transparent, top-aligned, globally exclusive within
  their root, and rendered above every other application layer.
- Secondary cards render as the longest complete leading priority prefix that
  fits. Accessible descriptions retain every secondary.
- Existing Cumulus consumers include production journey screens, battle, Atlas,
  HUD, draft, deck and shop surfaces, docs, mockups, debug tools, and
  transitional screens that directly render Cumulus components.
- New tests use fixed UUID-backed fixtures and cannot depend on mutable
  production TOML content or default algorithm choices.
- Run `scripts/regenerate-assets.sh` after implementation changes and commit its
  tracked output.
- Each task ends with its focused tests, `npm run lint`, `npm run typecheck`,
  `npm test`, a detailed commit, and an immediate push.

## Planned file structure

The implementation should create these focused internal units rather than add
more responsibilities to the 1,500-line `InfoCard.tsx` or 1,800-line
`CardView.tsx` files:

- `src/cumulus/internal/reveal/model.ts`: semantic reveal models and UUID-backed
  source identity.
- `src/cumulus/internal/reveal/state-machine.ts`: pure coordinator state and event
  transitions.
- `src/cumulus/internal/reveal/geometry.ts`: immutable geometry inputs, candidate
  generation, scoring, and secondary-prefix fitting.
- `src/cumulus/internal/reveal/viewport.ts`: visual-viewport and safe-area
  snapshots.
- `src/cumulus/internal/reveal/feedback.ts`: size-aware press and hover scale
  calculations.
- `src/cumulus/internal/reveal/logging.ts`: typed open and close diagnostic
  payloads.
- `src/cumulus/internal/reveal/context.tsx`: root coordinator, registration, and
  private source binding.
- `src/cumulus/internal/reveal/RevealOverlay.tsx`: measurement and the one
  pointer-transparent portal.
- `src/cumulus/internal/reveal/render-reveal-card.tsx`: exhaustive rendering of
  `GameCard` and strict `InfoCardModel` variants.
- `src/cumulus/CumulusRoot.tsx`: the public application-root shell; it exposes no
  reveal controls.
- `src/cumulus/internal/reveal/test-utils.tsx`: deterministic clocks, viewport
  fixtures, and a Cumulus-root render helper for component tests.

The key internal contract is intentionally small:

```ts
type RevealCardModel =
  | { kind: "gameCard"; cardId: CardId }
  | { kind: "infoCard"; card: InfoCardModel };

interface RevealSpec {
  primary: RevealCardModel;
  secondaries: readonly InfoCardModel[];
}
```

The private source binding consumes semantic identity, content, activation, and
availability. It returns root props/ref plus read-only active feedback state;
it does not accept placement, pixels, timing, portal, or controlled-open input.

---

### Task 1: Establish the coordinator contract and interaction state machine

**Files:**

- Create: `src/cumulus/internal/reveal/model.ts`
- Create: `src/cumulus/internal/reveal/state-machine.ts`
- Create: `src/cumulus/internal/reveal/state-machine.test.ts`
- Create: `src/cumulus/internal/reveal/logging.ts`
- Create: `src/cumulus/internal/reveal/logging.test.ts`
- Create: `src/cumulus/internal/reveal/context.tsx`
- Create: `src/cumulus/internal/reveal/context.test.tsx`
- Create: `src/cumulus/internal/reveal/test-utils.tsx`
- Create: `src/cumulus/CumulusRoot.tsx`
- Modify: `src/main.tsx`

**Interfaces:**

- Produces `RevealSpec`, `RevealSourceIdentity`, `RevealCoordinatorState`,
  `RevealCoordinatorEvent`, `reduceRevealState`, `CumulusRoot`, and the private
  `useRevealSource` binding consumed by every later task.
- `RevealSourceIdentity` contains `entityType` and a UUID `entityId`.
- `RevealCoordinatorEvent` carries the initiating pointer type and timestamp;
  device-wide media queries never choose modality.

- [ ] **Step 1: Write state-machine tests before implementation.** Cover the
  initial idle state; one active source; immediate mouse and hover-capable-pen
  hover; keyboard focus; touch pending for 30ms; quick release before 300ms;
  hold release at exactly and after 300ms; movement at 10px and beyond 10px;
  scroll, drag, pointer cancel/leave, resize, orientation, blur, route change,
  and source-unmount dismissal; a source with no action; first-touch ownership;
  no pointer capture that blocks native scrolling; press-over-hover;
  hover-over-focus with focus restoration; and Escape suppression until the
  next focus visit.

- [ ] **Step 2: Run the focused tests and confirm the missing-module failure.**
  Run `npx vitest run src/cumulus/internal/reveal/state-machine.test.ts`. Expected:
  failure because `state-machine.ts` does not exist.

- [ ] **Step 3: Define the semantic model and pure state reducer.** Keep wall
  time, DOM rectangles, React state, and rendering outside the reducer. Make
  cancellation and dismissal reasons discriminated unions so every terminal
  path can be logged exhaustively. Represent the inclusive hold boundary with
  an explicit `elapsedMs >= 300` decision.

- [ ] **Step 4: Run the state-machine tests.** Expected: all cases pass with
  fake timers and explicit event timestamps.

- [ ] **Step 5: Write logging contract tests.** Assert an open payload contains
  source UUID/type, primary kind/variant, ordered secondaries, viewport class
  and dimensions, safe-area insets, modality/reason, source rectangle, optional
  touch coordinate, placement family/orientation, final rectangles, shown and
  dropped counts, fallback flags, and circle clearance. Assert the close payload
  contains dismissal reason and activation outcome.

- [ ] **Step 6: Implement typed diagnostic builders around `logEvent`.** Use
  stable event names `cumulus_entity_reveal_opened` and
  `cumulus_entity_reveal_closed`. The builders accept the same immutable geometry
  snapshot used for placement; do not re-read the DOM when logging.

- [ ] **Step 7: Write coordinator-root tests.** Prove one `CumulusRoot` provides a
  coordinator, a nested root throws a clear development/test error, registering
  a second source replaces the active source, source unmount dismisses, route
  change can be signaled centrally, and malformed semantic data suppresses only
  its reveal while reporting a diagnostic.

- [ ] **Step 8: Implement `CumulusRoot`, coordinator context, and private source
  registration.** `CumulusRoot` accepts children only. `useRevealSource` remains
  internal and exposes semantic registration plus root event/ref bindings; it
  cannot accept timing, placement, anchor, side, scale, portal, or open state.
  Render the complete noninteractive accessible description and associate its
  generated id with the source through `aria-describedby`.

- [ ] **Step 9: Install the root once for every application entry.** Wrap the
  `renderStrict` contents in `src/main.tsx` with `CumulusRoot`, which covers the
  journey app, battle, docs, mockups, editors, and debug entries that render Cumulus
  entities. Keep `CumulusApp`'s `.cumulus` styling root inside that shell. Update
  component tests through `test-utils.tsx` rather than adding providers ad hoc.

- [ ] **Step 10: Run task verification.** Run the three focused test files,
  then `npm run lint`, `npm run typecheck`, and `npm test`. Expected: all pass;
  existing reveal rendering remains unchanged because no consumer has migrated.

- [ ] **Step 11: Commit and push.** Commit the internal models, state machine,
  logging, root, tests, and entry wiring with message
  `feat(cumulus): add entity reveal coordinator foundation`, then immediately run
  `git push`.

---

### Task 2: Build geometry, measurement, feedback, and the shared overlay

**Files:**

- Create: `src/cumulus/internal/reveal/geometry.ts`
- Create: `src/cumulus/internal/reveal/geometry.test.ts`
- Create: `src/cumulus/internal/reveal/viewport.ts`
- Create: `src/cumulus/internal/reveal/viewport.test.ts`
- Create: `src/cumulus/internal/reveal/feedback.ts`
- Create: `src/cumulus/internal/reveal/feedback.test.ts`
- Create: `src/cumulus/internal/reveal/RevealOverlay.tsx`
- Create: `src/cumulus/internal/reveal/RevealOverlay.test.tsx`
- Create: `src/cumulus/internal/reveal/render-reveal-card.tsx`
- Modify: `src/cumulus/internal/reveal/context.tsx`
- Modify: `src/cumulus/internal/reveal/logging.ts`
- Modify: `src/cumulus/primitives/Pressable.tsx`
- Modify: `src/cumulus/primitives/Pressable.test.tsx`
- Modify: `src/cumulus/primitives/cumulus-base.css`
- Modify: `src/cumulus/primitives/cumulus-tokens.css`

**Interfaces:**

- Consumes the semantic models, state reducer, coordinator context, and logging
  builders from Task 1.
- Produces `captureVisualViewport`, `selectRevealPlacement`,
  `fitSecondaryPrefix`, `pressScaleForRect`, `hoverScaleForRect`, and the single
  `RevealOverlay` mounted by the coordinator.
- `selectRevealPlacement` is pure: one immutable snapshot in, one placement
  decision with final card rectangles and flags out.

- [ ] **Step 1: Write viewport and geometry tests first.** Use table-driven
  sweeps around 899px/900px, safe-area edges, center and corner touches, lone
  InfoCards, InfoCards with secondaries, GameCards with and without secondaries,
  empty secondary columns, right/left desktop fallback, priority-prefix fitting,
  press-in-place thresholds, and impossible placements. Assert GameCard primary
  placement is identical whether secondaries exist.

- [ ] **Step 2: Add property-style invariants over deterministic grids.** Sweep
  supported viewport dimensions and touch points. Assert cards remain 45vw on
  mobile, primary and secondary columns never overlap, complete cards remain
  inside safe areas when feasible, touch popups never move below the touch, and
  best-effort output always chooses an on-screen top corner.

- [ ] **Step 3: Run the geometry tests and confirm missing exports.** Run
  `npx vitest run src/cumulus/internal/reveal/geometry.test.ts src/cumulus/internal/reveal/viewport.test.ts`.
  Expected: failure on unresolved modules/functions.

- [ ] **Step 4: Implement viewport snapshots and pure candidate selection.**
  Read `window.visualViewport` offsets and dimensions, resolve physical
  safe-area custom properties once, and freeze the snapshot. Implement the
  documented mobile upward-first and desktop above-first candidate families,
  10px inter-card gaps, 14px desktop source gap, 24px touch radius, secondary
  prefix fitting, and text-weighted best-effort overlap score.

- [ ] **Step 5: Add keyboard-placement cases.** Below 900px, focus uses 45vw
  cards without a protected touch circle, prefers the complete pair above the
  focused source, and pins to the safe-area top with the primary closest to the
  source when above placement is impossible. At or above 900px it uses the
  desktop hover placement families.

- [ ] **Step 6: Write and implement feedback tests.** Assert
  `clamp(1 - 6/minDimension, 0.90, 0.98)` for press and
  `clamp(1 + 4/minDimension, 1.01, 1.03)` for hover, with the measured value
  stable for an interaction. Add a stationary variant for inline text. Update
  `Pressable` to consume coordinator feedback when used as a reveal source while
  preserving ordinary Pressable behavior.

- [ ] **Step 7: Write overlay tests before rendering implementation.** Assert a
  single `document.body` portal, highest application layer, `pointer-events:
  none` throughout, hidden measurement before placement, top alignment,
  complete-prefix omission, no opacity/scale/travel animation, focus-safe
  descriptions, and one-frame removal. Cover reduced motion and the 160ms
  GameCard return state separately.

- [ ] **Step 8: Implement the two-pass overlay.** Render strict card models into
  an invisible measurement layer, capture actual sizes, select placement, and
  render the chosen group once. Keep the source or reading copy visually unique
  during desktop GameCard entry and return. Ensure the overlay never becomes a
  hover bridge or consumes the source's release/click.

- [ ] **Step 9: Connect measurement, placement, feedback, lifecycle dismissal,
  and diagnostics to the coordinator.** An active interaction uses one captured
  viewport/source/touch snapshot. Resize and orientation dismiss; they do not
  continuously reposition. Emit one open decision after placement and one close
  decision at the terminal transition.

- [ ] **Step 10: Run task verification.** Run all new reveal tests and
  `src/cumulus/primitives/Pressable.test.tsx`, then `npm run lint`,
  `npm run typecheck`, and `npm test`. Expected: all pass with existing consumers
  still using compatibility paths.

- [ ] **Step 11: Commit and push.** Commit with message
  `feat(cumulus): add shared reveal geometry and overlay`, then immediately run
  `git push`.

---

### Task 3: Converge GameCard, deck, draft, shop, and battle reveals

**Files:**

- Create: `src/cumulus/components/card/GameCardReveal.test.tsx`
- Create: `src/battle/components/BattleGameCard.tsx`
- Create: `src/battle/components/BattleGameCard.test.tsx`
- Modify: `src/cumulus/components/card/CardView.tsx`
- Modify: `src/cumulus/components/card/CardView.hover-zoom.test.tsx`
- Modify: `src/cumulus/components/card/CardGalleryPanel.tsx`
- Modify: `src/cumulus/components/card/CardGalleryPanel.test.tsx`
- Modify: `src/cumulus/screens/DraftScreen.tsx`
- Modify: `src/cumulus/screens/DesktopDeckViewer.tsx`
- Modify: `src/cumulus/screens/MobileDeckViewer.tsx`
- Modify: `src/cumulus/screens/MobileDeckViewer.test.tsx`
- Modify: `src/cumulus/screens/StartingDeckOverlay.tsx`
- Modify: `src/cumulus/screens/StartingDeckOverlay.test.tsx`
- Modify: `src/cumulus/screens/CardShopSiteScreen.tsx`
- Modify: `src/cumulus/screens/CardShopSiteScreen.test.tsx`
- Modify: `src/cumulus/screens/PurgeSiteScreen.tsx`
- Modify: `src/cumulus/screens/PurgeSiteScreen.test.tsx`
- Modify: `src/screens/cumulus_adapters/mobile-deck-view-model.ts`
- Modify: `src/screens/cumulus_adapters/desktop-deck-view-model.ts`
- Modify: `src/screens/cumulus_adapters/starting-deck-view-model.ts`
- Modify: `src/screens/cumulus_adapters/draft-view-model.ts`
- Modify: `src/screens/cumulus_adapters/card-shop-view-model.ts`
- Modify: `src/screens/cumulus_adapters/purge-view-model.ts`
- Modify: `src/battle/components/BattleCardView.tsx`
- Modify: `src/battle/components/BattlefieldGrid.tsx`
- Modify: `src/battle/components/BattleHandTray.tsx`
- Modify: `src/battle/components/BattleZoneBrowser.tsx`
- Modify: `src/battle/components/PlayableBattleScreen.tsx`
- Modify: `src/battle/components/BattleCardPickerOverlay.tsx`
- Modify: `src/battle/components/BattleForeseeOverlay.tsx`
- Modify: `src/battle/components/BattleStartScreen.tsx`
- Modify: `src/cumulus/docs/demos/game-card.tsx`
- Modify: `src/cumulus/docs/mockups/game-card.tsx`
- Modify: `src/debug/SignatureDecksApp.tsx`
- Delete after migration: `src/cumulus/components/card/MobileCardPeek.tsx`
- Delete after migration: `src/cumulus/components/card/MobileCardPeek.test.tsx`
- Delete after migration: `src/cumulus/components/card/mobile-card-peek-geometry.ts`
- Delete after migration: `src/cumulus/components/card/mobile-card-peek-geometry.test.ts`
- Delete after migration: `src/cumulus/components/card/useCardTermPopover.tsx`

**Interfaces:**

- Consumes `useRevealSource`, GameCard overlay rendering, geometry, feedback,
  focus, drag, and activation behavior from Tasks 1–2.
- Produces a strict `GameCardModel` containing a canonical `CardId`, resolved
  display snapshot, and optional transfiguration display. Public `GameCard`
  accepts that semantic model and `onActivate`; mechanical reveal props are not
  part of its API.
- Produces `BattleGameCard`, which accepts a `BattleCardInstance` plus battle
  interaction callbacks and adapts it internally to the canonical UUID-backed
  model.

- [ ] **Step 1: Write GameCard contract tests.** Cover a source below and above
  340px, hover/focus reading, pointer-down during reading, source-copy
  deduplication, exact return to the captured source rectangle, reduced motion,
  glossary secondary derivation, hidden-rules popup requirement, automatic
  press-in-place at 90% of 45vw, quick activation, hold suppression, unavailable
  but informative focus, ambient-motion pause, and drag dismissal/suppression.

- [ ] **Step 2: Run the focused GameCard tests and preserve the expected
  failure.** Run
  `npx vitest run src/cumulus/components/card/GameCardReveal.test.tsx src/cumulus/components/card/CardView.hover-zoom.test.tsx`.
  Expected: new contract cases fail against the local hover-zoom and term
  popover implementation.

- [ ] **Step 3: Refactor GameCard around the strict model and private source
  binding.** Keep visual card rendering in a focused surface function. Move
  reading-copy, popup, secondaries, focus, press-in-place, activation, and drag
  behavior to the coordinator. Resolve glossary terms internally from rendered
  rules text. Remove `termDefinitions`, `enableHoverZoom`,
  `enableTermPopover`, caller-owned handlers, and arbitrary reveal composition.

- [ ] **Step 4: Migrate gallery and journey-screen consumers.** Replace
  `useMobileCardPeek`, grid-owned pointer tracking, and rendered peek portals
  with ordinary `GameCard` instances. Preserve selection, purchase, purge,
  drafting, sorting, scrolling, and close behavior. Ensure every view model
  carries UUID-backed `GameCardModel` data and never keys or compares by name.

- [ ] **Step 5: Write battle adapter tests before migrating battle surfaces.**
  Prove `BattleGameCard` preserves the canonical definition UUID while applying
  effective spark, costs, transfigurations/status presentation, hidden enemy
  state, selection, playability, drag callbacks, and glossary content. Assert
  drag recognition dismisses and suppresses the reading reveal for that drag.

- [ ] **Step 6: Replace battle card reveal paths with `BattleGameCard`.** Migrate
  battlefield, hand, zone browser, card picker, Foresee, battle start, and any
  full-card reading surface. Preserve battle-instance identity separately from
  definition UUID: `battleCardId` addresses the instance; `cardId` addresses
  semantic card content. Update `BattleCardHoverPreview` or delete it if all of
  its behavior is subsumed by the coordinator.

- [ ] **Step 7: Migrate docs, mockups, debug, and transitional direct consumers.**
  Run `rg -l 'CardView|GameCard|MobileCardPeek|useCardTermPopover' src` and
  inspect every result. Convert every Cumulus entity consumer to the strict model;
  leave visual-only internal surface rendering private. Update examples to show
  semantic inputs and activation only.

- [ ] **Step 8: Delete the mobile peek and term-popover engines.** Remove their
  tests, exports, geometry analysis hooks, comments, and imports after the final
  consumer migrates. Update `scripts/deck-peek-clearance-analysis.mjs` to import
  the shared geometry sweep or delete it if the shared unit suite fully replaces
  its purpose.

- [ ] **Step 9: Run task verification.** Run the focused GameCard, gallery,
  deck, draft, shop, purge, and battle component tests; run the shared geometry
  tests; then run `npm run lint`, `npm run typecheck`, and `npm test`. Expected:
  all pass and `rg 'MobileCardPeek|useCardTermPopover|termDefinitions|enableHoverZoom|enableTermPopover' src`
  returns no production consumer.

- [ ] **Step 10: Commit and push.** Commit with message
  `refactor(cumulus): route every game card through reveal coordinator`, then
  immediately run `git push`.

---

### Task 4: Converge named InfoCard entities and inline semantics

**Files:**

- Create: `src/cumulus/components/card/GlossaryTerm.tsx`
- Create: `src/cumulus/components/card/GlossaryTerm.test.tsx`
- Modify: `src/cumulus/components/overlay/InfoCard.tsx`
- Modify: `src/cumulus/components/overlay/InfoCard.test.ts`
- Modify: `src/cumulus/components/hud/DreamAvatarPortrait.tsx`
- Modify: `src/cumulus/components/hud/DreamAvatarPortrait.test.tsx`
- Modify: `src/cumulus/components/hud/Dreamsign.tsx`
- Modify: `src/cumulus/components/hud/Dreamsign.test.tsx`
- Modify: `src/cumulus/components/hud/TideDisc.tsx`
- Modify: `src/cumulus/components/hud/ResourceChip.tsx`
- Modify: `src/cumulus/components/hud/EssenceValue.tsx`
- Modify: `src/cumulus/components/hud/JourneyStatusBar.tsx`
- Modify: `src/cumulus/components/card/CardStatOrb.tsx`
- Modify: `src/cumulus/components/controls/PipBadge.tsx`
- Modify: `src/cumulus/components/controls/PipBadge.test.tsx`
- Modify: `src/cumulus/components/dreamscape/SiteNode.tsx`
- Modify: `src/cumulus/screens/journey-start-shared.tsx`
- Modify: `src/cumulus/screens/DesktopDeckViewer.tsx`
- Modify: `src/cumulus/docs/demos/info-card.tsx`
- Modify: `src/cumulus/docs/demos/tide-disc.tsx`
- Modify: `src/cumulus/docs/mockups/info-card.tsx`
- Modify: `src/cumulus/docs/mockups/rules-text.tsx`
- Modify as found by inventory: `src/components/HudDreamsignRow.tsx`
- Modify as found by inventory: `src/editor/TideSourcePreview.tsx`
- Modify as found by inventory: `src/journey_v2/ui/JourneyDreamsignIcon.tsx`
- Modify as found by inventory: `src/screens/JourneyStartScreen.tsx`
- Modify as found by inventory: `src/screens/DreamsignRevelationScreen.tsx`
- Modify as found by inventory: `src/screens/ShopScreen.tsx`

**Interfaces:**

- Consumes the coordinator and strict `InfoCardModel` union from Tasks 1–2.
- Produces semantic, self-revealing Dream Avatar, Dreamsign, tide, site, resource,
  stat, ability, pip, and glossary components.
- `InfoCard` remains the visual renderer for strict variants. Its public surface
  contains content variants only; interaction statics are removed in Task 6
  after compatibility consumers reach zero.

- [ ] **Step 1: Write registration contract tests for each entity family.** For
  each named component, assert source UUID/type, strict primary variant,
  descending secondary order, activation availability, accessible description,
  and stationary versus measured feedback. Include unavailable SiteNode and HUD
  entities that remain focusable because their reveal explains state.

- [ ] **Step 2: Write GlossaryTerm and rules-copy tests.** Assert inline text
  stays stationary, derives a text InfoCard from the glossary term, responds to
  hover/focus/touch through the coordinator, and preserves sentence layout.
  Assert rendered rich-text marks remain semantic content inside definitions.

- [ ] **Step 3: Run focused tests and confirm current wrapper failures.** Run
  `npx vitest run src/cumulus/components/card/GlossaryTerm.test.tsx src/cumulus/components/hud/DreamAvatarPortrait.test.tsx src/cumulus/components/hud/Dreamsign.test.tsx src/cumulus/components/controls/PipBadge.test.tsx`.
  Expected: new semantic-registration assertions fail while screens still build
  `InfoCard.PressInfo` or `HoverPopover` content.

- [ ] **Step 4: Make named entity components derive reveal data internally.**
  Add semantic model fields where domain context is required. Keep ordered
  secondaries inside the component. Replace local timers, refs, hover booleans,
  portal assembly, anchor calculations, and fixed feedback factors with the
  private source binding.

- [ ] **Step 5: Replace screen-owned wrappers with named components.** Migrate
  journey start ability/tide/essence rows, deck sidebar Dream Avatar and Dreamsigns,
  JourneyStatusBar, SiteNode, stat orbs, pips, resource marks, and inline terms.
  A screen supplies semantic data and `onActivate` only. If a bespoke source
  shape remains, create a narrowly named Cumulus component instead of a generic
  reveal wrapper.

- [ ] **Step 6: Inventory all auxiliary Cumulus consumers.** Run
  `rg -l 'PressInfo|usePressReveal|PressPopover|anchorRect|HoverPopover' src`.
  Inspect docs, mockups, debug, editor, and transitional screens. Convert every
  actual Cumulus entity source; do not broaden the project into unrelated legacy
  popovers that render no Cumulus entity.

- [ ] **Step 7: Test global competition and focus behavior across entity
  families.** Mount focusable GameCard, GlossaryTerm, Dreamsign, and SiteNode
  sources in one root. Assert only one group, hover replacement/restoration,
  Escape suppression, unavailable activation suppression, description retention
  after visual secondary truncation, and focus preservation on dismissal.

- [ ] **Step 8: Run task verification.** Run all modified entity and screen
  tests plus the coordinator suite, then `npm run lint`, `npm run typecheck`,
  and `npm test`. Expected: all pass and the inventory command finds only the
  temporary compatibility definitions scheduled for Task 6.

- [ ] **Step 9: Commit and push.** Commit with message
  `refactor(cumulus): make info entities own reveal semantics`, then immediately
  run `git push`.

---

### Task 5: Fold Atlas reveal behavior into AtlasNode

**Files:**

- Modify: `src/cumulus/components/atlas/AtlasNode.tsx`
- Create: `src/cumulus/components/atlas/AtlasNode.test.tsx`
- Modify: `src/cumulus/components/atlas/AtlasMap.tsx`
- Modify: `src/cumulus/components/atlas/AtlasHoverCard.tsx`
- Modify: `src/cumulus/components/atlas/AtlasHoverCard.test.ts`
- Modify: `src/cumulus/components/atlas/atlas-display.ts`
- Modify: `src/cumulus/components/atlas/atlas-preflight.ts`
- Modify: `src/cumulus/components/atlas/atlas.css`
- Modify: `src/screens/cumulus_adapters/atlas-view-model.ts`
- Modify: `src/screens/cumulus_adapters/atlas-view-model.test.ts`
- Modify: `src/cumulus/screens/AtlasScreen.tsx`
- Modify: `src/cumulus/screens/AtlasScreen.test.tsx`
- Modify: `src/cumulus/docs/__atlas-fixtures__.tsx`
- Modify: `src/cumulus/docs/demos/atlas-node.tsx`
- Modify: `src/cumulus/docs/demos/atlas-map.tsx`
- Delete after migration: `src/cumulus/components/atlas/AtlasNodeReveal.tsx`

**Interfaces:**

- Consumes `useRevealSource`, strict InfoCard variants, coordinator activation,
  feedback, and visual-viewport placement.
- Produces `AtlasNodeModel`, containing face/layout data plus semantic Atlas
  primary and related Dreamsign/site/affiliation inputs in priority order.
- `AtlasNode` accepts `model` and `onActivate`; `AtlasMap` does not accept a
  stage ref for reveals.

- [ ] **Step 1: Write AtlasNode contract tests.** Cover available, completed,
  unreachable, unrevealed, starter, known-Dreamsign, and boss nodes. Assert the
  primary variant, ordered related secondaries, availability/focus semantics,
  activation, hover/press feedback, ambient pause, and UUID identity.

- [ ] **Step 2: Write viewport-placement integration tests.** Render Atlas in a
  scaled 1920x1080 stage and assert the coordinator measures the actual source
  rectangle in visual-viewport coordinates. Cover top-left/top-right mobile
  touches and desktop side fallback. Assert stage scale and stage clipping do
  not alter or constrain the overlay.

- [ ] **Step 3: Run focused Atlas tests and confirm failures.** Run
  `npx vitest run src/cumulus/components/atlas/AtlasNode.test.tsx src/cumulus/screens/AtlasScreen.test.tsx src/screens/cumulus_adapters/atlas-view-model.test.ts`.
  Expected: semantic and visual-viewport assertions fail against
  `AtlasNodeReveal` and `stageRef` anchoring.

- [ ] **Step 4: Strengthen the Atlas semantic model.** Move reveal-domain data
  from `AtlasNodeCard`/`AtlasNodeRevealItem` into `AtlasNodeModel`. Keep the
  adapter pure and UUID-based. The adapter supplies Dreamsign/site/affiliation
  domain values; `AtlasNode` selects strict InfoCard variants and priority.

- [ ] **Step 5: Absorb the wrapper into AtlasNode.** Let AtlasNode own its root,
  source feedback, focusability, activation, and private registration. Remove
  public pointer handlers, hover flags, root refs, `stageRef`, anchor
  calculation, portal rendering, and wrapper-owned tap/hold logic.

- [ ] **Step 6: Migrate AtlasMap, screen, docs, fixtures, and preflight.** Render
  AtlasNode directly from each `AtlasNodeModel`. Preload every art asset needed
  by the strict primary and secondaries without coupling preflight to overlay
  placement. Update examples to show the named component's semantic API.

- [ ] **Step 7: Delete AtlasNodeReveal and resolve all imports.** Run
  `rg 'AtlasNodeReveal|stageRef.*reveal|AtlasNodeCard|AtlasNodeRevealItem' src/cumulus src/screens/cumulus_adapters`.
  Expected: no production match after deletion and generated metadata refresh.

- [ ] **Step 8: Run task verification.** Run the focused Atlas suites and shared
  coordinator/geometry tests, then `npm run lint`, `npm run typecheck`, and
  `npm test`. Expected: all pass.

- [ ] **Step 9: Commit and push.** Commit with message
  `refactor(cumulus): make atlas nodes own entity reveals`, then immediately run
  `git push`.

---

### Task 6: Remove compatibility APIs, enforce the boundary, and prove conformance

**Files:**

- Create: `eslint-rules/no-entity-reveal-escape-hatches.js`
- Create: `eslint-rules/no-entity-reveal-escape-hatches.test.ts`
- Modify: `eslint.config.js`
- Modify: `src/cumulus/components/overlay/InfoCard.tsx`
- Modify: `src/cumulus/components/overlay/InfoCard.test.ts`
- Modify: `src/cumulus/internal/reveal/context.test.tsx`
- Create: `src/cumulus/screens/devtools/EntityRevealConformanceDemo.tsx`
- Create: `src/cumulus/screens/devtools/EntityRevealConformanceDemo.test.tsx`
- Modify: `src/main.tsx`
- Modify: `docs/journey_prototype/qa_scenes.md`
- Modify: `docs/cumulus/entity-reveal-interactions.md`
- Modify generated: `src/cumulus/metadata/cumulus-metadata.json`
- Modify generated: `.llms/skills/cumulus/SKILL.md`
- Modify generated: `.llms/skills/cumulus/components/game-card.md`
- Modify generated: `.llms/skills/cumulus/components/info-card.md`
- Modify generated: `.llms/skills/cumulus/components/atlas-map.md`
- Modify generated: `.llms/skills/cumulus/components/atlas-node.md`
- Modify generated: `.llms/skills/cumulus/components/card-stat-orb.md`
- Modify generated: `.llms/skills/cumulus/components/dream-avatar-portrait.md`
- Modify generated: `.llms/skills/cumulus/components/dreamsign.md`
- Modify generated: `.llms/skills/cumulus/components/pip-badge.md`
- Modify generated: `.llms/skills/cumulus/components/journey-status-bar.md`
- Modify generated: `.llms/skills/cumulus/components/resource-chip.md`
- Modify generated: `.llms/skills/cumulus/components/site-node.md`
- Modify generated: `.llms/skills/cumulus/components/tide-disc.md`
- Delete generated: `.llms/skills/cumulus/components/hover-popover.md`
- Delete: `src/cumulus/components/overlay/HoverPopover.tsx`
- Delete: `src/cumulus/components/overlay/hover-popover-placement.ts`
- Delete: `src/cumulus/components/overlay/hover-popover-placement.test.ts`
- Delete: `src/cumulus/docs/demos/hover-popover.tsx`

**Interfaces:**

- Consumes the fully migrated coordinator and named components from Tasks 1–5.
- Produces the final public vocabulary: `CumulusRoot`, visual `InfoCard` variants,
  `GameCard`, `AtlasNode`, and named semantic entity components. Coordinator
  hooks, reveal specs, geometry, portals, and mechanical options remain internal.

- [ ] **Step 1: Write lint-rule tests before the rule.** Reject product imports
  from `src/cumulus/internal/reveal`, `InfoCard.PressInfo`,
  `InfoCard.PressPopover`, `InfoCard.usePressReveal`, `anchorRect`, generic
  reveal wrappers, arbitrary reveal `ReactNode`, direct reveal portals,
  `HoverPopover`, mechanical props, and controlled open/shown state. Allow
  named Cumulus components and internal implementation/tests.

- [ ] **Step 2: Run the lint-rule test and confirm failure.** Run
  `npx vitest run eslint-rules/no-entity-reveal-escape-hatches.test.ts`.
  Expected: failure because the rule does not exist.

- [ ] **Step 3: Implement and enable the repository boundary.** Register the
  rule in `eslint.config.js` for Cumulus, adapters, battle, docs, debug, editor,
  and transitional consumers. Keep an empty or explicitly justified allowlist;
  compatibility APIs receive no baseline because this task deletes them.

- [ ] **Step 4: Remove compatibility and independent engines.** Strip
  interaction statics, delay setters, anchor helpers, portal types, and fixed
  reveal constants from `InfoCard`. Delete HoverPopover and its placement
  engine/demo. Remove obsolete CSS, exports, comments, tests, metadata entries,
  and numeric-prop lint exemptions.

- [ ] **Step 5: Run a repository convergence audit.** Run focused `rg` searches
  for every retired symbol and for direct `createPortal` usage adjacent to
  entity reveals. Inspect all matches. Expected: only the internal coordinator
  owns reveal portal creation, geometry, timing, and controlled state.

- [ ] **Step 6: Add a deterministic conformance demo and test.** Register
  `?demo=entity-reveals` with fixed UUID fixtures for GameCard popup,
  press-in-place GameCard, InfoCard with multiple secondaries, GlossaryTerm,
  unavailable entity, AtlasNode, and battle card. Add controls/data attributes
  to select safe-area, reduced-motion, top-edge, side-fallback, truncation, and
  best-effort cases without exposing production mechanical props.

- [ ] **Step 7: Assert diagnostics end to end.** In the conformance test, open
  and close representative reveals and inspect captured log entries. Assert the
  logged snapshot matches rendered rectangles, dropped counts, circle
  clearance, fallback flags, dismissal reason, and activation outcome.

- [ ] **Step 8: Regenerate and run full automated verification.** Run
  `scripts/regenerate-assets.sh`, `npm run lint`, `npm run typecheck`, and
  `npm test`. Expected: all pass. Review tracked regeneration output and include
  it in the commit.

- [ ] **Step 9: Run representative browser QA on a non-default port.** Start
  `npm run dev -- --port 5174` from the worktree and record its process tree.
  Use one unique `agent-browser --session` name. Before every capture, assert
  `location.href` and `window.innerWidth`; set a 2x device scale; inspect the
  error, rejection, and console-error buffers.

- [ ] **Step 10: Exercise the conformance matrix.** Cover desktop mouse hover
  and keyboard focus; mobile tap/hold/scroll/drag; GameCard popup and
  press-in-place; InfoCard with/without secondaries; Atlas, battle, HUD/inline,
  and unavailable representatives; above and side fallback; top-edge
  orientation; truncation; best-effort overlap; reduced motion; and one
  simulated physical safe area. Verify control usability, activation outcome,
  one active group, text visibility, stable spacing, and absence of clipping or
  overlap outside documented best effort.

- [ ] **Step 11: Spot-check every migrated entity type in its normal workflow.**
  Use registered `?goto=` scenes for Atlas, draft, shop/site, deck, and battle
  where available. Use `/cumulus` docs or the conformance demo for auxiliary
  components. Record URLs, viewport sizes, and observed pass/fail results in the
  implementation handoff rather than adding a transient QA log to product docs.

- [ ] **Step 12: Tear down only task-owned runtime resources.** Close the unique
  browser session, stop the recorded Vite/emulator process tree, and confirm
  port 5174 is free. Do not touch the developer's port 5173 server.

- [ ] **Step 13: Commit and push.** Commit enforcement, cleanup, regenerated
  metadata/docs, conformance demo, and QA-support code with message
  `refactor(cumulus): enforce unified entity reveal system`, then immediately run
  `git push`.

## Final acceptance

- `npm run lint`, `npm run typecheck`, and `npm test` pass from the repository
  root.
- Every retired symbol search is empty outside historical design context.
- Every named Cumulus entity derives its own primary and ordered secondaries.
- One root coordinator owns all gesture state, viewport measurement, placement,
  accessibility, portal rendering, and logging.
- Production logs reconstruct the complete open, placement, activation, and
  dismissal decision from one open and one close event.
- The representative browser matrix and every-entity spot-check pass without
  render errors, unhandled rejections, console errors, clipping, unintended
  overlap, or unusable controls.
