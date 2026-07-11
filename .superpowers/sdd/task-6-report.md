# Task 6 implementation report

## Status

Complete. The compatibility APIs and independent reveal engine are deleted, the public boundary is lint-enforced, the deterministic conformance page is registered at `?demo=entity-reveals`, automated verification is green, and the browser matrix completed with task-owned resources cleaned up.

## RED / GREEN record

- RED: `npx vitest run eslint-rules/no-entity-reveal-escape-hatches.test.ts` failed because `no-entity-reveal-escape-hatches.js` did not exist.
- GREEN: the lint-rule suite passes 22 cases covering exact internal-import ownership, aliased InfoCard statics, structural generic wrappers, arbitrary ReactNode/spec APIs, aliased and namespace reveal portals, mechanical props, controlled state, named components, and internal implementation/tests.
- RED: `npx vitest run src/tango/screens/devtools/EntityRevealConformanceDemo.test.tsx` failed because `EntityRevealConformanceDemo.tsx` did not exist.
- GREEN: all three demo tests pass. The end-to-end tests compare exact logged viewport/source/final rectangles, shown/dropped counts, fallback flags, circle clearance, one open/close lifecycle, dismissal reason, and activation outcome on desktop and mobile touch paths.
- Existing Draft preview tests failed after the retired wrapper was deleted. They drove the strict named `CompactGameCardRow`, which preserves the compact row while deriving the canonical GameCard primary and glossary secondaries from UUID-backed card data.

## Boundary and deletion inventory

- `InfoCard` exports strict visual variants, `INFO_CARD_WIDTH`, and viewport-derived visual sizing helpers. Its interaction statics, anchor/portal types and helpers, reveal delay state, fixed reveal constants, direct portal, and pointer engine are absent.
- Deleted `HoverPopover.tsx`, its placement engine/test, catalog demo/reference, registry entry, and container exemption.
- Deleted the retired `CardHoverPreview` visual/geometry helper and test.
- Migrated product consumers:
  - editor tide card source uses `GameCard`;
  - HUD overflow renders every clipped item as a named `Dreamsign` source;
  - QuestStart aggregate help is static explanatory copy;
  - CardSource aggregate tide help is static explanatory copy;
  - Draft compact deck rows use strict `CompactGameCardRow` semantics.
- Retired-symbol source audit is empty after the stale DeckViewer test comment cleanup.
- Imports from `src/tango/internal/reveal` outside `TangoRoot`, the internal directory, and named Tango components: empty.
- Reveal portal ownership: `src/tango/internal/reveal/RevealOverlay.tsx`. Other `createPortal` matches are unrelated Select, BattleContextMenu, and SignatureDecks visualization portals.

## ESLint rule

`tango/no-entity-reveal-escape-hatches` is registered for `src/**/*.{ts,tsx}` and `docs/**/*.{ts,tsx}`. It rejects:

- product imports from the internal reveal package;
- InfoCard interaction statics;
- HoverPopover and generic reveal wrappers;
- arbitrary ReactNode reveal slots and public RevealSpec APIs;
- reveal portals created outside the coordinator;
- anchor, portal, timing, side, gap, and other mechanical props;
- caller-controlled open/shown state on named reveal components.

Internal coordinator files/tests and the named Tango component layer are the explicit implementation boundary. Compatibility APIs have no baseline. Numeric-prop allowances for retired press wrappers were deleted.

## Conformance demo and diagnostics

`?demo=entity-reveals` uses fixed UUID/domain fixtures for:

- popup and press-in-place GameCard;
- unavailable GameCard;
- strict standalone InfoCard visual content;
- DreamcallerPortrait full-bleed primary with ordered Bane, Discover, and
  Ephemeral text secondaries;
- inline GlossaryTerm;
- AtlasNode;
- battle-labelled canonical GameCard.

Seven semantic scenario selectors arrange above, side-fallback, top-edge, truncation, best-effort, simulated safe-area, and reduced-motion review states. The safe-area selector publishes a 52px simulated physical inset at the document root so the coordinator portal reads it. No production mechanical props/specs are exposed.

The end-to-end diagnostic assertion validates the actual source rectangle, rendered primary/secondary rectangles, viewport snapshot, shown/dropped counts, fallback flags, circle-clearance applicability, dismissal reason, and activation outcome.

## Regeneration and automated verification

- `scripts/regenerate-assets.sh`: passed all 12 stages.
- Tango metadata: 37 components, 202 props.
- Tango docs: 30 component references, stale HoverPopover reference swept.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm test`: 392 files passed, 1 skipped; 4,254 tests passed, 4 skipped.
- `git diff --check`: pass.

## Browser matrix

Runtime: `http://localhost:5174`, unique session `q6-entity-5174`, device scale 2 for every capture. URL and `window.innerWidth` were asserted before every screenshot. Error, unhandled-rejection, and console-error buffers stayed empty in every recorded state.

### Conformance page

- Desktop 1440×900, `/?demo=entity-reveals`: popup source 160×224 at (24,188.39); reading GameCard 340×476 at (0,62.39); three ordered secondaries at x=350 with 10px vertical gaps. One active group.
- Desktop keyboard focus: inline GlossaryTerm produced one 248×79.70 primary at (990.44,97.69). One active group.
- Mobile 390×844: popup cards measured 175.5px (45vw). Top-edge layout placed primary at x=214.5 and ordered secondary column at x=0. The impossible top-edge case used best-effort placement without horizontal document overflow (`scrollWidth === clientWidth === 390`).
- Mobile press-in-place: 360px complete source stayed visible, popup primary was omitted, and unavailable secondaries were truncated when the remaining clearance was impossible.
- Mobile release and nested non-bubbling scroll dismissed the touch reveal. Battle `dragstart` dismissed the active reading group after one event turn.
- Safe-area simulation: root inset measured 52px and every reveal rectangle started at y=52 or lower.
- Reduced motion: `matchMedia('(prefers-reduced-motion: reduce)').matches === true`; open card transition was exactly `none`, and return state disappeared without a motion transition.
- Fixed unavailable source remained focusable/informative and carried no activation callback.

### Normal workflows and entity spot checks

- Atlas: `/atlas?goto=atlas&ui=tango&seed=task6&game=f9ft3g`, 1440×900. Seventeen Atlas nodes. Available-node hover produced 248×294.08 primary plus two 248px top-aligned secondaries to its right.
- Draft: `/dreamscape/0-firstlight-meadow/draft?goto=draft&ui=tango&seed=task6&game=jespnf`, 1440×900. Four GameCards. Hover produced 340×476 primary plus three ordered secondaries.
- Shop: `/dreamscape/0-firstlight-meadow/shop?goto=shop&ui=tango&seed=task6&game=mysfdm`, 1440×900. Five GameCards. Hover produced a 340×476 reading copy and 248px secondary.
- Deck/HUD: `/dreamscape/0-firstlight-meadow?goto=deckviewer&ui=tango&seed=task6&game=ezty56`, 1440×900. Semantic-source inventory included site, dreamcaller, resource-essence, dreamsign, game-card, card-spark-stat, and card-energy-stat. Dreamsign hover produced a 248×239.30 reveal above the HUD.
- Battle: `/dreamscape/0-firstlight-meadow/battle?startInBattle=1&ui=tango&seed=task6&game=77esaw`, 1440×900 after **Begin Battle**. Five battle hand cards, all using named GameCard sources. Hover produced 340×476 primary plus a 248×120.30 Support secondary; drag dismissed it.
- Conformance/documentation coverage supplied GlossaryTerm, InfoCard variants, unavailable, Atlas, and battle-labelled canonical card spot checks; normal HUD supplied sites, Dreamcaller, resources, Dreamsigns, GameCards, and stat orbs.

### Screenshots

Stable path: `screenshots/entity-reveals/`

- `desktop-initial.png`
- `desktop-hover-popup.png`
- `desktop-focus-inline.png`
- `desktop-reduced-motion.png`
- `mobile-top-edge-initial.png`
- `mobile-touch-top-edge.png`
- `mobile-press-in-place.png`
- `mobile-safe-area.png`
- `workflow-atlas.png`
- `workflow-draft.png`
- `workflow-deck-hud-dreamsign.png`
- `workflow-battle.png`

## Cleanup

- Closed only session `q6-entity-5174`.
- Sent SIGINT to the recorded `npm run dev -- --port 5174` process tree and observed clean Vite/Firebase emulator shutdown.
- `lsof -iTCP:5174 -sTCP:LISTEN -n -P` returned no listener.
- Port 5173 and other browser sessions were untouched.

## Self-review and concerns

- Documentation wording scan found none of the prohibited historical-contrast phrases in the normative reveal or QA-scene docs.
- Card semantics use UUIDs. The Draft fixture was corrected to a valid UUID so fail-closed semantics are exercised in its screen test.
- The conformance battle representative uses the canonical GameCard source with a battle instance data hook; the normal playable-battle workflow separately verifies the full `BattleGameCard` adapter.
- Dream Merchant card-source debug publication is encounter-keyed, so applying
  the debug event through the coop fold does not retrigger publication or
  cleanup. The normal JourneyCard reveal route completes cleanly.

## Review remediation

- Migrated `src/journey_v2/ui/JourneyCard.tsx` from its independent
  `createPortal` / local zoom state / `CardView` path to the named `GameCard`
  semantic source. Its stable test id now sits on the same activation and
  reveal boundary. A focused test proves UUID identity, reveal activation, one
  click callback, and absence of the retired zoom node.
- Reworked `tango/no-entity-reveal-escape-hatches` around exact file/symbol
  allowlists. The rule follows aliased and namespace `react-dom` imports,
  variable indirection, aliased/destructured InfoCard statics, and structural
  wrapper contracts expressed through interfaces, type literals, JSX props,
  and destructured arrow parameters. Ordinary dialogs, stacks, ReactNode
  content, and local functions named `createPortal` remain valid.
- The conformance demo now uses a real `DreamcallerPortrait` group source with
  ordered Bane, Discover, and Ephemeral secondaries, and a 29-term card fixture
  that deterministically exercises truncation. Scenario controls materially
  position their named sources; top-edge, best-effort, and safe-area sources
  are viewport-fixed, and the centered best-effort source naturally records
  `bestEffortPrimaryOverlap: true` under a center touch.
- Diagnostics now assert exact desktop and mobile viewport snapshots, source
  and final rectangles, placement families/orientations, counts, fallback
  flags, circle clearance, and exactly one open/close lifecycle. The touch
  activation path records `activationOutcome: "fired"` for one quick tap.
- Updated `tango_screen_composition.md` and `tango_design_system.md` to describe
  the current single-coordinator architecture, named semantic source roster,
  visual-only InfoCard contract, gesture timing, lifecycle diagnostics, and
  one-active-group rule. Retired-symbol and historical-contrast scans are empty
  in both documents.
- Removed the stale DreamMerchant `CardHoverPreview` mock and updated its card
  module mock to preserve the named `GameCard` export. Updated the HUD
  Dreamsign comment to describe coordinator-owned reading detail.
- Review-remediation browser QA used `http://localhost:5175` and isolated
  session `q6-remediation-5175`, always at device scale 2. Desktop side fallback
  recorded five shown / 24 dropped secondaries and `sideFallback: true`; the
  real Dreamcaller source rendered one primary plus the three ordered glossary
  cards. Mobile best-effort recorded eight shown / 21 dropped,
  `bestEffortPrimaryOverlap: true`, and `circleClearance: -4.5`. Safe-area
  placement started exactly at y=52, reduced-motion transition was `none`, and
  quick touch activation produced one open, one close, and `fired`.
- The normal Dream Merchant route confirms migrated JourneyCard sources with
  matching `data-card-id` / `data-card-uuid` values and zero retired journey
  zoom nodes. Remediation 2 records the completed open/close lifecycle.
- Stable remediation captures live under
  `screenshots/entity-reveals-remediation/`. Session and server were closed;
  port 5175 has no listener.

## Review remediation 2

- Added RED adversarial lint cases for repository-absolute internal imports,
  inline and `const` JSX object spreads, computed namespace portal access, and
  transitive InfoCard binding aliases. The rule now resolves `src/` imports,
  extracts literal computed properties, propagates InfoCard aliases, and
  enumerates statically knowable object-spread properties. Benign named-source
  spreads, opaque visual aliases, and non-portal computed ReactDOM members stay
  legal. The focused rule suite passes 30 cases.
- The conformance Dreamcaller fixture uses fixed verified art key `0071`. Browser
  QA measured the loaded cutout at 1024×1536; no image fell back or failed.
- Authoritative side-fallback evidence uses stable keyboard focus at
  `http://localhost:5177/?demo=entity-reveals`, 1200×800, device scale 2, in
  isolated session `q6-remediation3-5177`. Immediately before capture, DOM and
  diagnostics reported one active group, one 340×476 primary, five visibly
  painted secondaries, 5 shown / 24 dropped, and `sideFallback: true`. Logged
  source, primary, and all five secondary rectangles matched the live DOM within
  0.05px. Direct pixel inspection of `side-fallback-desktop-active.png` confirms
  the reading card and five-card glossary stack are visibly painted. Every image
  had nonzero natural dimensions; page and console error buffers were empty.
- `JourneyCard` has one normal product surface, so the Dream Merchant route's
  card-source debug loop received a narrow fix rather than substituting a
  component harness. A RED ScreenRouter regression reproduced the coop fold
  with a replacement mutation object; encounter-keyed publication plus a
  latest-callback ref now keeps publication at one event.
- Clean normal-flow evidence used
  `http://localhost:5176/dreamscape/0-firstlight-meadow/dream-augury?goto=dreamaugury&journey=v2&seed=task6-remediation-2b&game=ayafqt`
  at 1200×800, device scale 2, in isolated session
  `q6-remediation2b-5176`. The route rendered five JourneyCard sources with
  matching UUID attributes, zero retired zoom nodes, zero pending reveal nodes,
  and zero broken images. Keyboard focus produced one measured primary and one
  active group; focus transfer to the ordinary offer action produced exactly
  one open and one close (`dismissalReason: "blur"`, activation `none`), then
  zero groups and portals. Error buffers were empty and a final DOM query proved
  the page remained responsive. Direct inspection of
  `journey-card-normal-open-close.png` confirms the reading card is visibly
  open over the merchant scene.
- Stable second-remediation captures live under
  `screenshots/entity-reveals-remediation-2/`.
- Closed the isolated browser sessions and cleanly stopped the task-owned Vite
  / Firebase process tree. Port 5176 has no listener.

## Review remediation 3

- Added RED adversarial lint cases for call-result and untyped-parameter JSX
  spreads on named reveal components, internal named/wildcard re-exports, and
  dynamic internal imports. Named reveal spreads now fail closed unless their
  properties are statically enumerable or the binding has the matching
  component-owned `FooProps` type (including `Omit<FooProps, ...>`). Opaque
  spreads on ordinary components, non-internal exports/imports, inline and
  `const` safe objects, and typed component-owned spreads remain valid. The
  focused rule suite passes 39 cases, including an opaque parameter that
  shadows an earlier safe binding.
- `ExportNamedDeclaration`, `ExportAllDeclaration`, and `ImportExpression` use
  the same normalized internal-boundary resolution as static imports, including
  repository-absolute `src/` paths.
- ScreenRouter tests set `IS_REACT_ACT_ENVIRONMENT`, provide an async fold
  re-render that flushes effects, and emit no act warnings. Actual StrictMode
  coverage verifies the Dream Merchant debug effect records exactly one initial
  publication with no hidden-state null write or republish. Cleanup uses a
  generation-guarded microtask: StrictMode's immediate setup replay cancels the
  pending cleanup, while a real unmount still clears the debug surface.
- Conformance fixtures use verified immutable art keys: card `485518048.webp`
  (390×280), Dreamsign `runes.png` (256×256), and Dreamcaller cutout `0071.png`
  (1024×1536). The demo test pins all three URLs. Browser QA found zero broken
  images before the authoritative capture.
- The authoritative side-fallback capture overwrites the misleading artifact at
  `screenshots/entity-reveals-remediation-2/side-fallback-desktop-active.png`.
  Stable focus kept the source active through the screenshot; direct visual
  inspection confirmed the large primary at the right edge and all five glossary
  cards stacked to its left.
- Remediation 3 ran regeneration 12/12, 54 focused tests, lint, typecheck, the
  full 4,248-test suite, and `git diff --check`. Session
  `q6-remediation3-5177` and the task-owned server were closed; port 5177 has no
  listener.

## Review remediation 4

- Added RED adversarial cases for an approved `GameCardProps` intersection that
  adds `anchorRect`, an approved-props union that adds `shown`, unrelated and
  local lookalike `GameCardProps`, and an alias with unknown composition.
- Typed-spread safety is provenance-based. The rule records only type-only
  imports of the exact props symbol from the approved component module
  (`GameCardProps` from `CardView`, and `QuestStatusBarProps` from
  `QuestStatusBar`). A parameter is safe only as that direct imported reference
  or one conservative `Omit`/`Pick` whose key argument is a string literal or a
  union of string literals. Intersections, unions, nested/unknown aliases,
  lookalike names, non-type imports, and unrelated modules remain opaque and are
  rejected on named reveal components.
- The real QuestStatusBar demo retains its safe
  `Omit<QuestStatusBarProps, "stageRef">` spread because both module provenance
  and literal omission are proven. Direct `GameCardProps` and literal-key
  `Pick<GameCardProps, ...>` have explicit negative-control coverage.
- The focused lint-rule suite passes 45 cases. Lint, typecheck, the full
  4,254-test suite, and `git diff --check` pass. The rule/test-only change does
  not affect generated Tango metadata or references, so regeneration was not
  required. No production/demo code changed, so browser QA was not rerun.

## Commit and push

- `f02a2d8e` — `refactor(tango): enforce unified entity reveal system`.
- `76bb98be` — `fix(tango): close entity reveal enforcement gaps`.
- `6748ef4c` — `fix(tango): harden entity reveal conformance`.
- `39ba1b40` — `fix(tango): close remaining reveal boundary gaps`.
- Remediation 4 commit subject: `fix(tango): require reveal props provenance`.
- Branch: `wt/entity-reveal-rewrite-plan`.
- Each completed remediation commit is pushed immediately.

## Review remediation 5

- Added RED nested-scope cases proving that a typed inner `GameCardProps`
  parameter cannot make an opaque outer parameter safe, and an opaque inner
  parameter cannot erase an approved outer parameter. Line-specific assertions
  identify the rejected lexical binding. A generic type parameter shadow named
  `GameCardProps` also remains opaque.
- Approved prop provenance and spread safety are keyed by the TypeScript ESLint
  scope variable identity rather than identifier text. Imported prop types,
  generic type parameters, nested parameters, and local bindings therefore
  resolve according to their lexical declarations.
- Named reveal imports preserve canonical component identity through import
  aliases and straightforward local `const` aliases. Opaque spreads on those
  aliases are rejected, while unrelated local aliases remain outside the named
  reveal boundary and approved typed spreads remain legal.
- Static zero-expression template literals in dynamic imports use the same
  normalized internal-boundary resolution as string literals. Interpolated
  templates and static external-package templates remain legal.
- The focused lint-rule suite passes 54 cases. `npm run lint`, `npm run
  typecheck`, the full 4,263-test suite, and `git diff --check` pass. The
  rule/test-only patch changes no production or generated files, so regeneration
  and browser QA were not rerun.

## Final whole-branch review remediation

- Touch pending provides immediate source feedback while withholding the overlay and open diagnostic until 30ms. Quick taps emit no reveal lifecycle; elapsed interactions emit one paired lifecycle.
- Each hover, focus, or touch interaction captures one immutable source rectangle before feedback transforms. Placement, thresholds, return motion, and logging consume that snapshot. Tests cover 340px and 40.5vw exactly.
- Desktop above placement fits the longest complete leading secondary prefix against full group height and preserves the captured-source gap.
- Lifecycle tracking keys registration, reason, and interaction epoch. Paired open/close diagnostics carry the same interaction id/reason; focus-hover-focus and pre-measure dismissal cases prove exact pairing.
- Hover-capable pen interactions retain pen modality. `visualViewport.resize` dismisses with cleanup.
- Generated battle figments derive a deterministic UUID from `battleCardId`, independent of display name, and use `BattleGameCard`. Battle hover-preview callback APIs are deleted and lint rejects arbitrary hover/press handlers while preserving semantic activation.
- Dreamsign, SiteNode, AtlasNode, and QuestStatusBar sources allow pan scrolling; coordinator scroll cancellation remains authoritative.
- Atlas preview/clamp components, obsolete CSS, and orphaned Tango tokens are deleted. Current documentation describes coordinator ownership.
- The conformance integration renders canonical and generated `BattleGameCard` fixtures and actively installs deterministic reduced motion.
- Regeneration completed 12/12. Final verification: lint passed; typecheck passed; 392 files passed and 1 skipped; 4,273 tests passed and 4 skipped; `git diff --check` passed.
- Browser QA used `http://localhost:5188` and session `q7-whole-5188`: desktop group fit, reduced-motion immediate exit, mobile 0/20/40ms timing and scroll dismissal, canonical/generated battle cards, normal Atlas, and normal battle. Error buffers were empty. Session closed; port 5188 is free.

## Final re-review remediation

- Focus restoration is source-scoped. When hover temporarily takes precedence over a focused source, restoration recaptures the focused element's current rectangle, starts a fresh keyboard/focus lifecycle, and preserves exact open/close pairing. The integration test covers two independently positioned sources and the unmount-safe coordinator path.
- Desktop-above and mobile-focus placement derive horizontal group width from the visible secondary prefix. If no secondary fits, the primary is centered as a single card and placement metadata reports zero secondaries consistently.
- Desktop side fallback derives `bestEffortPrimaryOverlap` from the final primary rectangle and its source gap. Dropping an unfit secondary column therefore leaves a clear primary marked as non-overlapping.
- Deleted token aliases are absent from primitive token comments. Regeneration completed all 12 stages with no generated tracked-file drift.
- Focused verification passed 62 tests. `npm run lint`, `npm run typecheck`, and the full suite passed: 392 files passed and 1 skipped; 4,277 tests passed and 4 skipped. `git diff --check` passed.
- Browser QA used `http://localhost:5189/?demo=entity-reveals` and session `q8-focus-5189`. A focused GameCard survived temporary Dreamcaller hover precedence, reopened with keyboard/focus metadata and a fresh interaction id, and emitted paired lifecycle logs. The browser error buffer was empty. The session and task-owned server were closed; port 5189 is free.
