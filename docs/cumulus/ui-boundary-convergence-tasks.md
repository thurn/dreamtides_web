# Cumulus UI Boundary Convergence Tasks

**Date:** 2026-07-17  
**Status:** implementation backlog  
**Scope:** production and operator UI outside `src/cumulus/`, its ownership,
reachability, convergence onto the Cumulus component catalog, and enforcement
that keeps the boundary healthy.

## Why this program exists

Cumulus is the presentation system for the quest prototype. Its public
components have strict typed APIs, its product screens render from plain view
models, and lint rules enforce semantic tokens, named glyphs, canonical
interaction behavior, and the absence of per-call styling escape hatches.

The production screen registry is exhaustive. Every non-site quest screen is a
Cumulus screen behind an adapter, and every site type resolves to a Cumulus
screen, the battle route, or an interaction rendered inline by the Cumulus
Dreamscape screen. The remaining UI outside `src/cumulus/` is therefore not a
second production-screen router.

The remaining surface is mixed:

- permanent state and effect wiring that belongs outside the design system;
- standalone editor and diagnostic applications with their own tool-specific
  needs;
- player-facing shell, bootstrap, coop, overlay, and battle presentation that
  is active but is outside the strict Cumulus lint scope;
- local component implementations that overlap the Cumulus catalog;
- Cumulus-owned CSS stored in a global stylesheet; and
- a small amount of unreachable source and obsolete CSS.

A static import-graph walk from `src/main.tsx`, including literal dynamic
imports, found 100 of 102 non-test TSX modules outside `src/cumulus/` reachable
from a shipped entry path. Most outer UI is active code. The solution is an
ownership program, not a bulk directory move.

## Target architecture

Use the following ownership test for every file touched by this program.

| Responsibility | Owner |
| --- | --- |
| Reusable visual component, material, interaction engine, or authored component CSS | `src/cumulus/components/`, `src/cumulus/primitives/`, or `src/cumulus/internal/` as appropriate |
| Pure gameplay, overlay, bootstrap, or gate presentation built from a plain view model and callbacks | `src/cumulus/screens/` |
| Mapping domain data into a screen-owned view model | a pure builder outside Cumulus, normally beside its adapter or controller |
| Reading live quest, coop, Firebase, URL, or battle state; performing effects; dispatching actions | adapter/controller outside Cumulus |
| Application routing and shared stateful chrome wiring | app shell outside Cumulus, composing public Cumulus components |
| Standalone editor, image viewer, or algorithm diagnostic route | explicit operator-tool directory outside Cumulus |
| Minimal fallback that must render when the design system itself fails | an explicit emergency-fallback exemption outside Cumulus |

Moving a stateful file wholesale into `src/cumulus/` is not a valid migration.
Split it at the view-model and callback boundary. Conversely, leaving pure
rendering outside because its controller needs state is not a valid reason for
an exception.

The existing Cumulus customization ladder applies throughout:

1. Use an existing component as-is.
2. Wrap it for layout owned by the screen.
3. Add a strict named variant when the need recurs across the system.
4. Add a new strict semantic component when the role is genuinely new.

Do not move an existing fork into Cumulus unchanged. Converge it onto the
catalog or define a strict replacement. Public Cumulus APIs do not accept
`className`, `style`, `CSSProperties`, raw icon strings, arbitrary appearance
numbers, generic `ReactNode` content where a structured model is possible, or
caller-owned reveal mechanics.

## Current inventory

The baseline at the start of this program is:

| Area | Production TSX | Approximate source lines | Current role |
| --- | ---: | ---: | --- |
| `src/screens/cumulus_adapters/` | 20 | 1,645 | permanent adapters and registry |
| `src/editor/` | 33 | 13,622 | standalone operator tools |
| `src/components/`, including `card-browser/` | 16 | 4,955 | mixed app shell, tool UI, forks, and dead code |
| `src/battle/components/` | 11 | 4,069 | mixed controller, adapters, and operator overlays |
| `src/coop/` | 6 | 1,148 | mixed controller, player gates, and diagnostics |
| `src/debug/` | 4 | 2,337 | standalone diagnostic tools |
| `src/image_viewer/` | 3 | 891 | standalone operator tool |
| other `src/screens/` and screen devtools | 5 | 2,782 | in-game diagnostics and conformance fixture |
| app/bootstrap/state TSX | 4 | 1,809 | application wiring and bootstrap presentation |

Five CSS files sit outside Cumulus: `src/index.css`, `src/battle/battle.css`,
the unreferenced `src/atlas/atlas.css`, and the two vendored Boxicons sheets.
Vendor styles are an explicit external asset. The other three require the
dispositions described below.

## Program rules

- Keep the tree green at every task boundary. Run `npm run lint`,
  `npm run typecheck`, and `npm test` before each commit.
- When a task changes a component, its demo, or the token sheet, regenerate the
  Cumulus metadata and documentation and commit the generated output.
- Preserve existing logging when moving a view. A controller continues to log
  the same domain action; a pure Cumulus view reports semantic callbacks.
- Identify cards by UUID or a stable instance/entry ID derived from a UUID.
  Translate to a legacy numeric identifier only at a domain boundary that still
  requires it. Do not key, compare, deduplicate, or resolve cards by name.
- Do not make production tests depend on mutable TOML values or default
  algorithm choices.
- Run browser QA for every visually observable migration. Exercise the normal
  player workflow, responsive branches, interaction states, and the captured
  error buffer. Use DOM measurements for layout assertions.
- Delete temporary baselines and migration adapters in the task that makes
  them stale. A successful program leaves enforcement stricter than its
  starting point.

## Execution order

| Order | Task | Depends on |
| ---: | --- | --- |
| 1 | CUM-OUT-01: classify every outer UI file and install enforcement rails | — |
| 2 | CUM-OUT-02: delete confirmed unreachable UI and obsolete global CSS | CUM-OUT-01 |
| 3 | CUM-OUT-03: move GameCard implementation CSS into its Cumulus closure | CUM-OUT-01 |
| 4 | CUM-OUT-04: converge Dreamwell card rendering | CUM-OUT-01 |
| 5 | CUM-OUT-05: add strict Cumulus command-menu offerings | CUM-OUT-01 |
| 6 | CUM-OUT-06: migrate the quest utility menu presentation | CUM-OUT-05 |
| 7 | CUM-OUT-07: migrate bootstrap, coop gate, and transient status presentation | CUM-OUT-01 |
| 8 | CUM-OUT-08: rebuild Pool Viewer as a Cumulus overlay screen | CUM-OUT-03 |
| 9 | CUM-OUT-09: migrate in-game diagnostic overlays or gate them as operator tools | CUM-OUT-05, CUM-OUT-07 |
| 10 | CUM-OUT-10: converge retained battle overlay presentation | CUM-OUT-04, CUM-OUT-05 |
| 11 | CUM-OUT-11: relocate tool-only UI and tighten the app-shell boundary | CUM-OUT-06 through CUM-OUT-10 |
| 12 | CUM-OUT-12: remove migration baselines and perform final conformance QA | all prior tasks |

Tasks 2, 3, and 4 can run independently after the enforcement rails land.
Tasks 7 and 8 can also run independently. Integration should preserve the
order above so shared offerings land before their consumers and cleanup runs
after consumer migrations.

## CUM-OUT-01: Classify outer UI and install enforcement rails

### Goal

Make every TSX and CSS file outside `src/cumulus/` an intentional part of the
architecture. New unclassified UI must fail CI, and active player presentation
must receive appropriate Cumulus policy checks even while it is waiting for a
physical move.

### Context

The principal visual ESLint block currently targets `src/cumulus/**` and
`src/screens/cumulus_adapters/**`. Several rule implementations also inspect
the filename and return no visitors for other paths. Extending the ESLint glob
alone therefore does not extend protection.

The existing UI-boundary test pins the immediate TSX filenames under
`src/components/`. It does not classify nested component directories, inspect
the content of those files, or cover `src/coop`, `src/battle`, `src/screens`,
and bootstrap UI. Its allowlist also contains confirmed dead files.

### Work

1. Add one checked source of truth for outer UI roles. It may be a test-owned
   manifest or a small data module, but it must classify files recursively and
   fail when a new non-test TSX or non-vendor CSS file appears without a role.
2. Support at least these roles:
   - state adapter or view-model builder;
   - app-shell/controller;
   - pending Cumulus presentation migration;
   - standalone operator tool;
   - Cumulus devtool or conformance fixture;
   - emergency fallback; and
   - vendor asset.
3. Keep the existing exhaustive registry and private-internals assertions.
   Replace or extend the flat `src/components` filename pin so nested modules
   cannot bypass classification.
4. Refactor applicable Cumulus ESLint rules so scope comes from configuration
   or shared role helpers rather than a hard-coded `src/cumulus/` prefix.
5. Apply consumer-safe invariants broadly to product and operator UI where
   their semantics are universal:
   - private Cumulus internals stay private;
   - raw safe-area environment reads stay in the token source;
   - raw Cumulus icon classes do not appear in product presentation;
   - card identity is UUID- or stable-entry-based;
   - token references resolve; and
   - inline copies of Cumulus glass material are rejected.
6. Apply strict composition invariants to player-facing presentation and
   pending-migration views:
   - no raw interactive elements where a Cumulus control exists;
   - no hardcoded visual colors;
   - no untokenized spacing/radius rhythm;
   - no composed type voices; and
   - no arbitrary `className` styling channel.
7. Add named baselines for current violations so the rail can land green.
   Baselines identify exact files and rules, carry a reason, fail when stale,
   and only shrink in later tasks.
8. Add CSS integrity coverage. At minimum validate Cumulus token references,
   raw color ownership, spacing/radius literals, inline glass, and forbidden
   ownership of Cumulus selectors in global styles. Component-authored box
   measures may use documented exceptions.

### Acceptance criteria

- Every production TSX and CSS file has exactly one checked role.
- Adding an unclassified file fails with a message that names the valid roles.
- Adding a new pending product view with a raw button, raw glyph class, or
  hardcoded color fails.
- Adding a `.card-view` implementation rule to `src/index.css` fails.
- Existing adapters continue to pass their thin-adapter and builder-purity
  rules.
- All baselines name current debt; stale entries fail.

### Verification

Add focused tests for role discovery, nested directories, rule scoping, stale
baselines, CSS ownership, and representative allowed/forbidden files. Run the
complete core checks before committing.

## CUM-OUT-02: Delete confirmed unreachable UI and obsolete global CSS

### Goal

Remove source that has no production importer and delete obsolete global rules
whose selectors have no source consumer.

### Work

1. Delete the 908-line `src/components/DeckViewer.tsx`. The live application
   renders `DesktopDeckViewerAdapter` or `MobileDeckViewerAdapter` from
   `src/App.tsx`.
2. Delete `src/components/DeckViewer.test.tsx`. Preserve any still-useful
   behavior assertions only when the equivalent Cumulus deck-viewer tests do
   not already cover them.
3. Delete `src/components/DreamcallerPopover.tsx` and its test. A future
   Dreamcaller reveal uses the canonical `DreamcallerPortrait` plus the shared
   entity-reveal system; it does not restore this custom popover shell.
4. Delete `src/components/deck-summary.ts` and its test after confirming the
   dead viewer remains its only production consumer.
5. Delete unimported `src/atlas/atlas.css`. Live Atlas presentation imports the
   stylesheet colocated with the Cumulus Atlas components.
6. Remove the following zero-consumer blocks from `src/index.css` after a fresh
   repository-wide selector search:
   - draft offer/grid selectors near the beginning of the file;
   - the `dj-*` animation family and reduced-motion selector; and
   - the draft rail, Dreamsign draft, guide-dock, and offering responsive rules
     near the end of the file.
7. Update the UI-boundary allowlist and any comments or generated descriptions
   that name the deleted compatibility UI.
8. Recheck nearby helpers before deleting them. `src/components/card-size.ts`
   remains used by editor and card-browser tooling and is not part of this
   deletion.

### Acceptance criteria

- No non-test import references any deleted module.
- The boundary manifest contains no deleted file.
- The generated bundle contains no deleted module or obsolete selector family.
- Cumulus deck-viewer, Dreamcaller reveal, and Atlas coverage stays green.

### Verification

Run focused deck-viewer, reveal, Atlas, and boundary tests, then the complete
core checks. This task is non-visual when the reachability claims hold, so
browser screenshots are not required.

## CUM-OUT-03: Move GameCard implementation CSS into its Cumulus closure

### Goal

Make the canonical GameCard component own every part of its presentation and
bring its CSS under Cumulus integrity checks.

### Context

`src/cumulus/components/card/CardView.tsx` emits `.card-view`, rarity,
figment, event, and related classes. Their principal implementation currently
lives in the globally imported `src/index.css`. This creates a CSS dependency
that the TypeScript isolation boundary cannot see.

### Work

1. Create a component-owned stylesheet beside `CardView.tsx` and import it from
   the component module.
2. Move the live card rules from `src/index.css` into that stylesheet:
   - legendary shimmer keyframes and reduced-motion treatment;
   - `.card-view` geometry and typography custom properties;
   - mobile card-frame overrides;
   - hover-entry animation;
   - figment frame treatment; and
   - event frame treatment.
3. Keep the editor-only `.figment-edit-affordance` under editor ownership,
   preferably in an editor stylesheet imported by the relevant editor entry.
4. Keep global reset, body, Tailwind entry, and genuinely application-global
   variables in the entry stylesheet.
5. Update comments in `CardView`, `RulesText`, tokens, component JSDoc, and
   generated documentation so they point to the component-owned source.
6. Extend the CSS ownership check from CUM-OUT-01 so all selectors and custom
   properties owned by GameCard remain in the component closure.
7. Do not translate authored card geometry into generic screen tokens merely
   to satisfy the move. Card-proportional `cqw` values and strict component
   geometry remain component implementation details.

### Acceptance criteria

- Rendering `GameCard` through every application route loads its CSS through
  the component rather than global selector coincidence.
- `src/index.css` contains no GameCard implementation selector.
- The card continues to render correctly in Cumulus screens, battle, editors,
  standalone card browsers, and reveal copies.
- CSS integrity tests inspect the relocated file.

### Verification

Run focused GameCard, RulesText, rarity, figment, battle-card, editor, and
entity-reveal tests. Browser-QA one normal GameCard collection, one battlefield
card state, and one editor preview because those prove the distinct style
loading contexts. Inspect mobile card typography at the responsive boundary.

## CUM-OUT-04: Converge Dreamwell card rendering

### Goal

Use `src/cumulus/components/battle/DreamwellCard.tsx` as the sole read-only
Dreamwell card presentation while keeping editor mutation affordances outside
Cumulus.

### Context

`src/components/DreamwellCardView.tsx` is a second complete Dreamwell card
renderer. Battle history uses it for read-only display, while the playable
Cumulus battle already uses the canonical `DreamwellCard`. The external
renderer also carries arbitrary slots and styling escape hatches required by
editor workflows.

### Work

1. Add a pure mapper from `DreamwellCardDefinition` to the canonical
   `DreamwellCardModel`. Preserve the card UUID as identity.
2. Migrate `BattleDreamwellHistoryDrawer` to the canonical component. The
   wrapper owns list position and repeated-draw entry identity; the component
   owns the card face.
3. Audit editor consumers. Prefer editor-owned hit-target or editing overlays
   around the canonical read-only card where that produces an accurate preview.
4. When an editing interaction genuinely cannot wrap the canonical component,
   move the editor renderer and its types into `src/editor/` and name it as an
   editor preview. Do not preserve a shared production-sounding component in
   `src/components/`.
5. Do not add arbitrary editor slots, `className`, or `style` props to
   `DreamwellCard`.
6. Delete `src/components/DreamwellCardView.tsx` once all consumers resolve to
   the canonical component or an explicitly editor-owned preview.
7. Update docs and generated consumer counts.

### Acceptance criteria

- Every read-only runtime Dreamwell card uses canonical `DreamwellCard`.
- Editor-specific rendering has explicit editor ownership.
- There is no shared external Dreamwell card renderer.
- UUID identity reaches the Cumulus component without a name-keyed lookup.

### Verification

Run focused Dreamwell card, battle history, and Dreamwell editor tests. Browser
QA the active battle Dreamwell card, opened history, and the editor preview.

## CUM-OUT-05: Add strict Cumulus command-menu offerings

### Goal

Give quest chrome and battle context actions catalog-owned menu surfaces so
consumers do not assemble glass panels, action rows, icon strings, focus
behavior, and submenus independently.

### Context

The quest utility dropdown and the desktop battle context menu are different
semantic surfaces, but both currently build command rows and nested menus
outside Cumulus. Treating either as an `InfoCard` reveal would violate the
pointer-transparent reveal contract. They need interactive command-menu
components.

### Work

1. Add a strict corner utility-menu component for app chrome. Its structured
   model includes stable action IDs, labels, typed `Glyph` values, active and
   disabled state, semantic accent, command callbacks, and nested action
   groups.
2. Add a strict context-action menu for pointer/card actions. It owns viewport
   clamping, keyboard navigation, focus, menu/submenu semantics, dismissal,
   material, row treatment, and the responsive switch to a dialog/sheet.
3. Share private action-row and hierarchical-menu machinery only where the two
   semantic components truly have the same behavior. Keep their public APIs
   named for their roles.
4. Neither public API accepts `className`, `style`, arbitrary JSX rows, raw icon
   class strings, material values, gaps, radii, or z-index.
5. The utility-menu trigger is a strict model rendered with `IconButton`; it is
   not a `renderTrigger` callback.
6. The context menu may accept the activation point or source rectangle needed
   for semantic anchoring. The component owns all padding, clamping, collision,
   and mobile presentation decisions.
7. Add demo entries, JSDoc, generated reference pages, accessibility tests, and
   interaction tests for root actions, submenus, disabled actions, escape,
   outside dismissal, and keyboard navigation.

### Acceptance criteria

- Quest and battle consumers can express all current action structures without
  appearance or DOM escape hatches.
- The menu family uses named glyphs and canonical glass/control treatments.
- Menus are interactive overlays and remain separate from entity reveals.
- The catalog documents when to use a corner utility menu, context-action menu,
  Select, DisclosureSection, and InfoCard.

### Verification

Run component tests, generated-doc checks, strict-API contracts, and browser QA
for desktop pointer menus and narrow/mobile dialog behavior.

## CUM-OUT-06: Migrate quest utility menu presentation

### Goal

Keep quest save/load/logging effects in the app shell while rendering all menu
presentation through the strict Cumulus utility-menu component.

### Context

`DreamscapeQuestMenu.tsx` correctly owns viewport choice and app-shell
callbacks, but it builds stringly typed actions and custom panel geometry.
`QuestUtilityMenu.tsx` mixes `useQuest`, persistence, timers, and logging with
an open visual API containing `CSSProperties`, `className`, arbitrary trigger
rendering, raw icon classes, and custom action rows.

### Work

1. Split menu state/effects from rendering. Keep saved-quest reads and writes,
   log downloads, build SHA reporting, quest mutations, and status timers in an
   outer controller or hook.
2. Build a plain utility-menu view model containing structured root actions,
   submenu actions, status text, loading/error state, and typed glyphs.
3. Render the model through the Cumulus utility-menu component from
   CUM-OUT-05.
4. Preserve responsive trigger semantics: desktop gear at the top right and
   mobile menu at the top left, using shared chrome geometry and `IconButton`.
5. Preserve contextual actions supplied by the active route without allowing
   them to inject JSX, raw icons, or styles.
6. Preserve existing logging sources and saved-quest behavior.
7. Remove the external presentation component or reduce it to a clearly named
   controller with no rendered material of its own.
8. Delete its visual baseline entries.

### Acceptance criteria

- `QuestUtilityMenu` exposes no style, class, or render-prop customization.
- All action glyphs are `Glyph` values.
- Save, load, download-log, build-SHA, deck, pool, diagnostic, and contextual
  actions continue to satisfy their existing behavior contracts.
- Menu geometry, focus, interaction feedback, and material are Cumulus-owned.

### Verification

Test action construction and effects separately from the Cumulus component.
Browser-QA the desktop and mobile quest menu, saved-quest submenu, one
contextual site action, a status message, escape/outside dismissal, and the
mobile deck-viewer elevated state.

## CUM-OUT-07: Migrate bootstrap, coop gate, and transient status presentation

### Goal

Give every player-visible loading, room creation, compatibility gate, fatal
configuration, and transient coop status a Cumulus presentation while leaving
Firebase, URL, and room-log effects outside.

### Context

`App.tsx`, `RoomGate.tsx`, `ConfigGateScreen.tsx`,
`VersionGateScreen.tsx`, and `UnreadableRoomScreen.tsx` contain repeated raw
panels, gradients, buttons, loading spinners, error copy, and comparison rows.
`BounceToast.tsx` is a separate bespoke transient surface. These paths appear
before or around the main screen registry and are part of the player
experience.

### Work

1. Add a strict Cumulus application-state screen family. Use a discriminated
   model for loading, recoverable error, fatal configuration, room creation,
   version gate, content-config gate, unreadable room, and unreachable room
   states. Avoid a generic arbitrary-body screen.
2. Use `GlassPanel`, `GlassButton`, `GroupPanel`, canonical type voices, and
   structured comparison rows where they fit. Add strict variants only for
   roles the existing catalog cannot express.
3. Keep content loading, Firebase initialization, clipboard writes, room
   creation, URL rewriting, reloads, and state transitions in `App` or
   `src/coop` controllers. Pass plain copy, structured values, and callbacks to
   the Cumulus screen.
4. Consolidate the repeated Create/Start/Adopt call-to-action treatment onto
   `GlassButton` rather than another button implementation.
5. Add a strict transient status/toast component for `BounceToast` if no
   existing component expresses that role. Its API uses semantic variants and
   structured copy; placement, motion, duration presentation, and safe-area
   behavior are internal.
6. Route the battle-preview failure through the same application-state screen
   vocabulary rather than a raw centered paragraph.
7. Keep the `ErrorBoundary` mechanism and its minimal default fallback outside
   Cumulus as an explicit emergency-fallback role. It logs failures and must be
   able to render when Cumulus itself is the failing subsystem. Document and
   narrowly test this exemption instead of treating it as a normal product
   surface.
8. Replace the App-level injected `<style>` used to hide the presence pill with
   explicit chrome/view-model state.
9. Remove migrated Tailwind classes, literals, duplicate helpers, and baseline
   entries from the coop/app-shell files.

### Acceptance criteria

- Every normal bootstrap, loading, room, gate, and recoverable-error path
  renders a Cumulus screen or component.
- Controllers contain no authored panel/button presentation.
- The emergency ErrorBoundary fallback is the only declared player-visible
  rendering exemption and has no dependency on Cumulus.
- Coop agreement and event-log behavior remain unchanged.

### Verification

Unit-test each discriminated view state and controller transition. Exercise
fresh room creation, join/loading, config mismatch, version mismatch,
unreadable/unreachable room, content-load failure, Firebase setup failure,
battle-preview failure, connected count, and bounce toast. Capture one desktop
and one narrow representative gate plus the transient toast state.

## CUM-OUT-08: Rebuild Pool Viewer as a Cumulus overlay screen

### Goal

Replace the active bespoke Pool Viewer and its local card-browser/reveal stack
with a pure Cumulus overlay screen backed by a deterministic view-model builder.

### Context

Pool Viewer is mounted from both `App.tsx` and the playable battle. It currently
owns custom segmented buttons, panel and header material, close control,
filter/search/size toolbar, source tabs, provenance sections, replay pick
history, card grid, count badges, drag handling, and a separate full-screen
card overlay. The Cumulus catalog already provides `CardGalleryPanel`,
`SegmentedControl`, `Select`, `TextField`, `IconButton`, `GameCard`, and the
shared entity-reveal system.

### Work

1. Define `PoolViewerScreen` under `src/cumulus/screens/`. Its exported view
   model contains plain resolved card entries, source options, filters, counts,
   provenance sections, replay history rows, empty/error states, and callbacks.
2. Add a pure builder outside Cumulus that maps draft, pool, replay, and
   provenance data into that view model. Keep algorithm registry access and
   mutable quest/battle integration outside the screen.
3. Use UUID-backed `GameCardModel` values and stable entry IDs. Do not use card
   names as keys. Translate drag payloads to a domain identifier only at the
   adapter boundary when an existing action still requires one.
4. Build the primary collection with `CardGalleryPanel`. Extend it only through
   strict structured variants justified by the Pool Viewer and another
   catalog-level use case.
5. Use canonical controls for search, source, sort, direction, type, subtype,
   cost, and density. Pool-specific source choices are structured options, not
   raw buttons or injected `ReactNode` controls.
6. Keep the two integration geometries as strict screen variants:
   - full-screen app overlay; and
   - floating battle diagnostic panel with drag behavior owned by an outer
     wrapper/controller.
7. Express copy counts and algorithm/provenance metadata through named badge,
   caption, GroupPanel, or DisclosureSection roles. Add a strict component only
   when the catalog has no suitable representation.
8. Use the automatic GameCard reveal for card reading. Delete
   `CardOverlay.tsx` after this becomes its final live consumer.
9. Repoint or delete `CardDisplay.tsx`. Update comments, token docs, and
   generated metadata that still name the compatibility wrapper.
10. Keep MTG-name inspection editor-only unless it is modeled as a legitimate
    ordered secondary in the shared reveal system. Do not carry the custom
    `MtgNameTooltip` into gameplay Cumulus presentation.
11. Preserve logging, source selection, replay diagnostics, drag-to-deck, and
    all current empty states.

### Acceptance criteria

- The app and battle integrations render the same pure Cumulus screen.
- Pool Viewer contains no raw controls, raw colors, Tailwind styling channel,
  local card preview portal, or name-keyed identity.
- `CardOverlay` and `CardDisplay` have no production consumer and are deleted.
- Tool-only card-browser modules remain available to editors until CUM-OUT-11
  gives them explicit ownership.

### Verification

Unit-test the builder across each source type, filters, replay history,
provenance visibility, empty states, duplicate entries, and UUID identity.
Browser-QA the full-screen desktop and mobile variants, floating battle panel,
filter/search interactions, one card reveal, source switching, replay history,
and drag-to-deck. Inspect the error buffer after each workflow.

## CUM-OUT-09: Migrate in-game diagnostic overlays or gate them as operator tools

### Goal

Resolve the ambiguous status of diagnostic UI mounted inside the shipped quest
application.

### Context

`DebugScreen`, `QuestDebugEditor`, `QuestDebugDeckSection`, and
`CardSourceOverlay` are production-entry reachable through the quest utility
menu. Their presentation is bespoke and outside the Cumulus visual rules. They
are not equivalent to standalone `/editor` or `/offers` routes because they
render inside the active game shell.

### Work

1. Make one explicit product decision for every in-game diagnostic overlay:
   - keep it shipped and migrate its pure presentation to Cumulus; or
   - make it development/operator-only through a real availability gate and
     classify it under the operator profile.
   The default disposition for the four currently reachable overlays is to
   keep and migrate them. Changing one to operator-only requires an explicit
   product decision in that overlay's implementation task.
2. Do not classify a surface as tool-only merely because its title says
   “debug.” Its runtime availability determines its role.
3. For each retained shipped overlay, create a pure Cumulus screen using
   `GlassDialog`, `GlassPanel`, `GroupPanel`, `TextField`, `Select`,
   `NumberStepper`, `DisclosureSection`, `GameCard`, and canonical action
   controls as appropriate.
4. Keep quest mutations, saved-state I/O, algorithm reconstruction, provenance
   calculation, and clipboard/download effects in external adapters or
   controllers.
5. Use UUID-backed card models and stable action IDs throughout view models.
6. Preserve existing diagnostic logging and add logs for any newly introduced
   state transition required to reconstruct operator actions.
7. Remove the migrated raw visual implementations and shrink their enforcement
   baselines.

### Acceptance criteria

- Every in-game diagnostic is either Cumulus presentation or unavailable to
  the shipped player surface by an enforced gate.
- Standalone tools remain independently routable.
- No generic exemption covers all of `src/screens/` or all files with “Debug”
  in their name.

### Verification

Test the availability gate in production and development configurations. For
retained overlays, test view-model mapping and browser-QA opening, editing,
committing/canceling, scrolling dense content, card reveals, and error states
at desktop and narrow widths.

## CUM-OUT-10: Converge retained battle overlay presentation

### Goal

Keep the event-sourced battle controller outside Cumulus while moving stable
battle overlays and controls onto the Cumulus catalog.

### Context

`PlayableBattleScreen` correctly owns battle state, commands, automation, and
overlay orchestration, and it delegates the main battlefield to
`MobileBattleScreenAdapter`. Around that screen, retained operator overlays
still implement a parallel set of buttons, chips, dialogs, drawers, menus,
forms, and CSS.

### Work

1. Migrate desktop `BattleContextMenu` rendering to the context-action menu
   from CUM-OUT-05. Preserve action construction and battle commands outside
   Cumulus. Keep its responsive sheet behavior on the shared Cumulus dialog
   path.
2. Rebuild `BattleFigmentCreator` as a pure Cumulus dialog/form view using
   strict controls. Keep subtype rules, target validation, destination
   construction, timestamps, and command dispatch outside.
3. Rebuild `BattleCardNoteEditor` with canonical form and dialog components.
   Delete `src/battle/design-tokens.ts` if this migration removes its final
   consumer.
4. Rebuild `BattleLogDrawer` with `GlassDialog` or `GlassPanel`, canonical
   controls, and `DisclosureSection` for expandable details. Preserve log
   filtering and raw diagnostic text as structured view data.
5. Complete the Dreamwell history migration from CUM-OUT-04.
6. Audit `BattleDeckOrderPicker`, `CumulusBattleZoneBrowser`, and
   `CumulusBattleForeseeOverlay`. Keep thin state-to-Cumulus adapters outside;
   move any remaining authored visual treatment into their Cumulus screens.
7. Delete `src/battle/battle.css` when its `.btn`, `.chip`, `.ctx-*`, `.log-*`,
   and `.lg-*` consumers have migrated.
8. Treat `BattleGameCard` and `AutomationGearIcon` according to their actual
   consumer. If they only support the entity-reveal conformance fixture, move
   or replace them under Cumulus devtools rather than preserving them as
   production battle components.
9. Preserve the battle event-log architecture. UI state that both players must
   agree on remains an event; local dialog/menu state remains local.

### Acceptance criteria

- `PlayableBattleScreen` remains an outer controller and contains no stable
  custom material/control family.
- Retained overlays use Cumulus components or pure Cumulus screens.
- `src/battle/battle.css` and tool-only battle token modules are deleted when
  their final consumers migrate.
- Battle commands and event-log folding behavior are unchanged.

### Verification

Run focused battle reducer, command, overlay, and component tests, followed by
the complete core checks. Browser-QA the normal battle workflow plus context
menu/submenu, note editing, figment creation with disabled and valid targets,
deck ordering, log filtering/disclosure, Dreamwell history, Foresee, and zone
browsing. Cover pointer desktop and narrow/mobile interaction modes.

## CUM-OUT-11: Relocate tool-only UI and tighten the app-shell boundary

### Goal

Make generic directories express architectural ownership once production
presentation and tool-specific UI have their designated owners.

### Work

1. Recompute consumers for every module under `src/components/` and
   `src/components/card-browser/`.
2. Keep only named app-shell/controller modules at the generic shell boundary:
   routing, Cumulus quest chrome wiring, battle route wiring, and the emergency
   ErrorBoundary mechanism.
3. Move editor-only card-browser, size, tooltip, and preview utilities under an
   explicit editor or shared-operator directory. Their names and imports should
   make tool ownership visible.
4. Move any Dreamwell editing preview retained by CUM-OUT-04 under
   `src/editor/`.
5. Move `EntityRevealConformanceDemo` into the existing Cumulus devtools area
   and express its fixtures through canonical semantic components. Eliminate
   battle-specific fixture adapters that have no gameplay consumer.
6. Keep standalone `/cards`, `/dreamsigns`, `/dreamcallers`, `/tides`,
   `/dreamscapes`, `/figments`, `/dreamwell`, `/images`, `/opponent`,
   `/sigdecks`, and `/offers` routes outside Cumulus. They may consume public
   Cumulus components but never Cumulus internals.
7. Apply the operator-tool lint profile from CUM-OUT-01. It may permit native
   form controls required by editing workflows, but it still enforces private
   boundaries, card identity, safe-area policy where applicable, and explicit
   ownership of shared visual components.
8. Tighten the boundary test so adding a reusable presentation export under
   generic `src/components/` fails with guidance to choose Cumulus or a named
   tool owner.

### Acceptance criteria

- `src/components/` contains only deliberate app-shell/controller files.
- Every standalone tool-local component sits under a named tool owner.
- No tool imports Cumulus internals or exposes a second shared production
  component library.
- The UI-role manifest has no `pending` entry whose migration is complete.

### Verification

Run route smoke tests for every standalone tool, boundary tests, editor tests,
and the complete core checks. Browser screenshots are needed only for routes
whose rendered ownership move changes stylesheet loading or presentation.

## CUM-OUT-12: Remove migration baselines and perform final conformance QA

### Goal

Finish with an enforceable, documented boundary rather than a successful set of
one-time migrations.

### Work

1. Remove every pending-migration role and every visual-rule baseline resolved
   by prior tasks. The stale-baseline tests must prove none can linger.
2. Re-run the reachability inventory. Investigate every remaining unreachable
   non-test UI module and either delete it or classify a deliberate fixture.
3. Re-run consumer counts for the Cumulus catalog. Delete or mark incubating any
   component whose migration plan changed its real consumer count.
4. Verify doctrine comments and generated blurbs against the current tree,
   especially claims about canonical cards, menus, dialogs, reveals, boot
   screens, and battle overlays.
5. Update:
   - the Cumulus design-system architecture document;
   - screen-composition documentation;
   - the Cumulus skill and relevant component demos;
   - QA-scene documentation for newly direct-addressable screens; and
   - the UI-role manifest documentation.
6. Add or update direct QA scenes for any migrated overlay whose normal workflow
   is expensive to reach. QA scenes supplement rather than replace the normal
   player workflow.
7. Run a final cold visual review of the player bootstrap, quest shell, Pool
   Viewer, retained diagnostics, and battle overlay suite. Reviewers receive
   screenshots and scene names, not the migration checklist.
8. Write a dated Cumulus sweep report recording the audited range, baseline
   delta, verified dispositions, and any remaining product-decision item.

### Final definition of done

- Every shipped gameplay, app-shell, bootstrap, coop, overlay, and battle
  presentation is rendered by a Cumulus component/screen, except the documented
  emergency ErrorBoundary fallback.
- Every outer TSX/CSS file has an enforced architectural role.
- Every reusable visual component and its authored CSS live in the Cumulus
  closure.
- Standalone tools have explicit ownership and cannot grow a competing shared
  production component library.
- Global styles contain only application-global reset/entry concerns and
  explicitly owned tool styles.
- No dead UI module, stale migration baseline, raw Cumulus-internal import,
  name-keyed card lookup, or unclassified UI file remains.
- `npm run lint`, `npm run typecheck`, and `npm test` pass.
- Normal player workflows and responsive browser QA pass with an empty captured
  error buffer.

## Key source references

- [Cumulus design-system architecture](../quest_prototype/cumulus_design_system.md)
- [Cumulus screen composition](../quest_prototype/cumulus_screen_composition.md)
- [Entity reveal interaction contract](entity-reveal-interactions.md)
- [Production screen registry](../../src/screens/cumulus_adapters/registry.tsx)
- [Application shell](../../src/App.tsx)
- [UI boundary integrity test](../../scripts/cumulus-ui-boundary.test.mjs)
- [ESLint configuration](../../eslint.config.js)
- [Global stylesheet](../../src/index.css)
- [Cumulus GameCard implementation](../../src/cumulus/components/card/CardView.tsx)
- [Quest utility menu controller/presentation](../../src/components/QuestUtilityMenu.tsx)
- [Pool Viewer screen](../../src/cumulus/screens/PoolViewerScreen.tsx)
- [Pool Viewer view-model builder](../../src/screens/cumulus_adapters/pool-viewer-view-model.ts)
- [Coop room gate](../../src/coop/RoomGate.tsx)
- [Playable battle controller](../../src/battle/components/PlayableBattleScreen.tsx)
