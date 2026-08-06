---
name: cumulus
description: Use when writing or changing any journey prototype UI — building screens, using or adding Cumulus design-system components, styling, spacing, colors, icons, or reviewing UI code. Triggers on cumulus, design system, UI component, component API, Pressable, Button, GlassPanel, InfoCard, GameCard, tokens, spacing, styling, /cumulus.
---

# Cumulus Design System

Cumulus (`src/cumulus/`) is the design system every screen in the journey prototype
is built from: one small, strict catalog of components with tightly typed
APIs. All UI work starts here — first find the Cumulus component that does the
job, then compose it. Writing bespoke UI is the last resort, and customizing a
component past its typed surface is not an available move at all (see
"Customization" below).

## Where the component documentation lives

- **Per-component reference** (generated): `components/<id>.md` in this skill
  directory — blurb, usage guidance, full props table with types and
  defaults, nested model shapes, and real usage snippets. Read the file for
  each component you touch; they are short.
- **Component index** (generated): the table below — use it to pick the right
  component before writing any UI.
- **Design tokens** (generated): [tokens.md](tokens.md) — every semantic
  token, grouped by role, with values and notes. Usage rules are in the
  "Tokens" section below.
- **Materials** (hand-written): [materials.md](materials.md) — the one
  liquid-glass material (who wears it, its `--glass-*` tokens, the
  `--glass-fill-popover` reveal tint, and the blur-preservation constraint) and
  the solid alternatives that are deliberately _not_ glass.
- **UI systems** (hand-written, live): `src/cumulus/docs/systems/` —
  cross-component behavior with its own lifecycle, coordination, placement, or
  invariants. Live routes use `/cumulus#/systems/<id>`; start with the
  [Entity Reveal Coordinator](../../../src/cumulus/docs/systems/entity-reveal-coordinator.tsx).
- **Live doc site**: `/cumulus` on the dev server (e.g.
  `http://localhost:5173/cumulus`), with `/cumulus#/<id>` per component —
  interactive demos and the same props tables, useful during browser QA.
- **Design philosophy in depth**:
  [docs/journey_prototype/cumulus_design_system.md](../../../docs/journey_prototype/cumulus_design_system.md).
- **Screen composition current state**:
  [docs/journey_prototype/cumulus_screen_composition.md](../../../docs/journey_prototype/cumulus_screen_composition.md).

The reference files and the index are projections of the component sources
(prop JSDoc via `npm run cumulus-metadata`, prose via the demo entries in
`src/cumulus/docs/demos/`). Regenerate with `npm run cumulus-docs` (included in
`npm run regenerate-assets`); edit the sources, never the generated files.

Component documentation describes reusable visual roles, typed props, and
component-local constraints. UI-system documentation describes contracts that
coordinate several components or the application host. Component pages link to
their governing systems so interaction and placement rules are documented once
at the correct architectural level. Never designate a particular product screen
as a component's owner or product owner: those claims become stale as
compositions change. A screen may appear as a nonexclusive usage example when
that context is useful.

## Requested content only

Do not add unrequested visible text elements to a design. Treat the supplied
headings, labels, captions, instructions, and body copy as the complete visible
content brief. Accessibility-only names and descriptions remain required; if
missing visible copy would make the requested interaction unusable, pause and
surface the content decision instead of inventing prose.

## Required screen chrome

Registered Cumulus product screens receive shared journey chrome from the
router-owned `CumulusJourneyChrome` wrapper, with route-specific end-state and
battle-shell exceptions:

- a top-right gear icon on desktop;
- a top-left hamburger menu icon on mobile;
- the `JourneyStatusBar` bottom HUD on active-run screens, replacing any legacy
  status bar on the screen.

Terminal journey-result screens keep the utility menu and omit the status bar
because their screen-owned summaries carry the final run or battle readout.
Journey start has no selected run inventory, and the playable battle uses its
battle-specific shell.

Pure screen files and their view models do not import, render, or carry data for
this chrome. Registration applies it automatically, and the screen-chrome
contract test rejects local `JourneyStatusBar` or journey-menu rendering under
`src/cumulus/screens/`.

## Component index

<!-- BEGIN GENERATED COMPONENT INDEX (npm run cumulus-docs) -->
| Component | Group | Consumers | Reference | What it is |
| --- | --- | --- | --- | --- |
| Pressable | Primitives | 32 | [components/pressable.md](components/pressable.md) | The one press-feedback primitive. |
| Essence Value | Components | 12 | [components/essence-value.md](components/essence-value.md) | The canonical Essence amount: a tight inline value for player-facing currency text, with a named solid reward badge for values placed over art. |
| Icon Button | Components | 19 | [components/icon-button.md](components/icon-button.md) | The compact glyph-only glass disc, with placement-aware recipes for scene media or an existing glass surface, and made fully round so it reads as one family with the filter/sort controls. |
| Main Menu Button | Components | 1 | [components/main-menu-button.md](components/main-menu-button.md) | The text-first action for the Dreamtides main menu: outlined white at rest, showing the shared Cumulus liquid-glass material on hover or focus. |
| Glass Button | Components | 32 | [components/glass-button.md](components/glass-button.md) | The labeled glass action — a bold text label with optional Essence cost or non-cost value on the shared liquid-glass surface, with neutral, danger, and purple accent treatments plus placement-aware recipes for media or an existing glass surface. |
| Offer Tile | Components | 2 | [components/offer-tile.md](components/offer-tile.md) | The circular symbolic Augury offer button in named 300×300 desktop and 240×240 mobile sizes: UUID-backed full-bleed card art, Dreamsigns and site glyphs over authored full-art fields, and centered operation marks inside the gold-and-feather frame. |
| Glass Panel | Components | 19 | [components/glass-panel.md](components/glass-panel.md) | The persistent, non-modal, content-hugging liquid-glass container: an optional structured header, a composed body, and an optional footer on the canonical floating material. |
| Glass Dialog | Components | 14 | [components/glass-dialog.md](components/glass-dialog.md) | The glass overlay shell: a modal dialog with a bounded desktop panel and a full-bleed mobile overlay by default, plus centered content-sized and companion-paired popup presentations. |
| Developer Rail | Components | 3 | [components/developer-rail.md](components/developer-rail.md) | The shared edge-attached shell for persistent developer tools, with canonical glass, header hierarchy, close action, scrolling body, and optional footer. |
| Command Menu | Components | 2 | [components/command-menu.md](components/command-menu.md) | The single command offering: one strict model renders fixed app-chrome commands or card and pointer actions through the same typed hierarchy. |
| Tutorial Feature Callout | Components | 1 | [components/tutorial-feature-callout.md](components/tutorial-feature-callout.md) | A compact speech-inspired glass label for teaching one semantic region of a full GameCard, with canonical energy and spark glyph treatments. |
| Speech Bubble | Components | 4 | [components/speech-bubble.md](components/speech-bubble.md) | A guide-dialog bubble for character-led screens: the same frosted information material as an InfoCard, with a strict left, top-left, or bottom-left pointer toward the speaker and shared tutorial instruction formatting backed by the canonical inline rules-glyph renderer. |
| Character Dialogue | Components | 8 | [components/character-dialogue.md](components/character-dialogue.md) | A character portrait in the canonical round frame, paired with SpeechBubble and presented as one fadeable guide-dialogue object in compact, wide, or prominent scale. |
| Segmented Control | Components | 6 | [components/segmented-control.md](components/segmented-control.md) | The compact tab and filter switch used for type filters, sort direction, and small mode toggles. |
| Select | Components | 10 | [components/select.md](components/select.md) | The compact dropdown control, and Cumulus's standard mobile filter/sort control: a button that shows a leading glyph and the current selection, and opens a menu on tap. |
| TextField | Components | 8 | [components/text-field.md](components/text-field.md) | The reusable labeled text and search input on Cumulus control chrome, with supporting and validation messaging. |
| Text Area | Components | 1 | [components/text-area.md](components/text-area.md) | The reusable multiline authoring field on Cumulus control chrome, with explicit draft and commit callbacks. |
| NumberStepper | Components | 7 | [components/number-stepper.md](components/number-stepper.md) | A labeled, accessible decrement/value/increment row with optional canonical resource notation. |
| DisclosureSection | Components | 5 | [components/disclosure-section.md](components/disclosure-section.md) | A controlled, surface-aware Cumulus section for progressively revealing dense secondary information. |
| CardOrderEditor | Components | 1 | [components/card-order-editor.md](components/card-order-editor.md) | A surface-aware, identity-safe drag-to-reorder control for the battle deck-order workflow, with arrow-key reordering on each drag handle. |
| Tide Disc | Components | 1 | [components/tide-disc.md](components/tide-disc.md) | The single semantic tide mark: a colored disc carrying the tide's glyph and its own strict tide reveal. |
| Tides Info Label | Components | 1 | [components/tides-info-label.md](components/tides-info-label.md) | The typographic Tides eyebrow: a filled one-em information glyph followed by uppercase copy, with one shared definition reveal across the complete label. |
| Transfiguration Button | Components | 1 | [components/transfiguration-button.md](components/transfiguration-button.md) | The canonical forge-form choice: compact and price-bearing controls with shared glyph, color, state, and accessibility behavior. |
| Transient Status Toast | Components | 3 | [components/transient-status-toast.md](components/transient-status-toast.md) | The fixed, safe-area-aware short-lived warning surface for structured player-facing status copy. |
| Radial Announcement | Components | 4 | [components/radial-announcement.md](components/radial-announcement.md) | The single orbiting circular status system for scene announcements, card scoring, merge targets, and terminal victory. |
| Motes | Components | 11 | [components/motes.md](components/motes.md) | The atmospheric particle layer — drifting dust that gives a surface its living shimmer. |
| Info Card | Components | 6 | [components/info-card.md](components/info-card.md) | The strict information-card presentation. |
| Inline Glyph | Primitives | 12 | [components/inline-glyph.md](components/inline-glyph.md) | The Boxicons renderer for flowing text: a one-em square whose midpoint follows the surrounding font's capital height at every type size. |
| Standalone Glyph | Primitives | 19 | [components/standalone-glyph.md](components/standalone-glyph.md) | The Boxicons renderer for controls, badges, overlays, and card marks: a centered one-em square whose surrounding layout owns its size and placement. |
| Journey Status Bar | Components | 6 | [components/journey-status-bar.md](components/journey-status-bar.md) | The persistent, transparent bottom HUD for journey screens. |
| Coop Presence Status | Components | 1 | [components/coop-presence-status.md](components/coop-presence-status.md) | The compact, non-interactive app chrome that reports connected room participants from an explicit view-model count. |
| Battle Status Display | Components | 1 | [components/battle-status-display.md](components/battle-status-display.md) | The glass status card for one battle participant: centered current and maximum energy at left, a head-focused DreamAvatar portrait or loading placeholder at center, and centered current and target points at right. |
| Dreamwell Card | Components | 5 | [components/dreamwell-card.md](components/dreamwell-card.md) | The static landscape card drawn from the Dreamwell: UUID-keyed art, energy grant, name, and complete rules text in one readable object. |
| DreamAvatar Ability Text | Components | 2 | [components/dream-avatar-ability-text.md](components/dream-avatar-ability-text.md) | The complete DreamAvatar rules-text source: hovering, focusing, or touch-holding anywhere in the ability reveals one compact title-free card containing every defined term in rules-text occurrence order, using DreamAvatar-specific exhaust guidance. |
| DreamAvatar Portrait | Components | 18 | [components/dream-avatar-portrait.md](components/dream-avatar-portrait.md) | The shared framed and stage-filling DreamAvatar art surface: the transparent full-body cutout in one of six fixed framings. |
| Entity Reference | Components | 3 | [components/entity-reference.md](components/entity-reference.md) | An inline, underlined card or Dreamsign name that reveals the canonical full entity on hover, keyboard focus, or touch hold through the shared coordinator. |
| Rich Text | Components | 14 | [components/rich-text.md](components/rich-text.md) | The design system's model for formatted copy. |
| Rules Text | Components | 17 | [components/rules-text.md](components/rules-text.md) | Renders Dreamtides rules copy from card data — resource pips, Unicode trigger markers, and glossary keywords styled in place — with definition cards adapted to the exact rules sentence. |
| Game Card | Components | 31 | [components/game-card.md](components/game-card.md) | The playable card object — art, cost, stats, and rules text — rendered at any size and always resolved by UUID, never by name. |
| Card Back | Components | 4 | [components/card-back.md](components/card-back.md) | The canonical face-down Dreamtides card object: the shipped card-back sprite on the shared 5:7 card geometry, with fixed crop, edge, and elevation. |
| Card Pile | Components | 1 | [components/card-pile.md](components/card-pile.md) | A physical deck or void stack built from structured, topmost-first card instances. |
| Card Choice Grid | Components | 3 | [components/card-choice-grid.md](components/card-choice-grid.md) | A frameless, responsive grid for presenting resolved GameCards as choices inside an existing site or panel surface. |
| Card Gallery Panel | Components | 10 | [components/card-gallery-panel.md](components/card-gallery-panel.md) | The shared card-browser surface: GlassPanel title and action chrome around a scrolling GameCard grid, framed as floating glass or a full-bleed alpha scrim. |
| Glossary Definition Card | Components | 1 | [components/glossary-definition-card.md](components/glossary-definition-card.md) | A renderable keyword-definition tile for normal document flow: one glossary entry in an InfoCard text card whose body is the keyword's rules text. |
| Card Stat Orb | Components | 3 | [components/card-stat-orb.md](components/card-stat-orb.md) | The card-corner resource stat: a fitted white numeral over the energy, spark, or Dreamwell-energy glyph, with an optional monochrome transfiguration badge. |
| Atlas Node | Components | 2 | [components/atlas-node.md](components/atlas-node.md) | One dreamscape node on the Dream Atlas, wired to the shared InfoCard press engine: a framed circular icon whose glow and badges track its state — including a frame-shaped violet outline that visibly widens and contracts around the next selectable dreamscape — and which reveals its scene / detail card on hover or press. |
| Atlas Edge | Components | 1 | [components/atlas-edge.md](components/atlas-edge.md) | The connector between two Atlas nodes, drawn inside the map's SVG. |
| Atlas Map | Components | 1 | [components/atlas-map.md](components/atlas-map.md) | The Dream Atlas map surface — the run graph of dreamscape nodes and their connectors, fitted into a fixed portrait design stage that uniformly scales to fit its container (letterboxed). |
| Dreamsign | Components | 13 | [components/dreamsign.md](components/dreamsign.md) | A dreamsign — a minor passive collectible — shown as its art floating on the scene. |
| Dreamsign Gallery Panel | Components | 1 | [components/dreamsign-gallery-panel.md](components/dreamsign-gallery-panel.md) | The liquid-glass purchase shelf for Dreamsign offers: UUID-keyed collectible art, essence captions, a close disc, and one bare-glyph end action. |
| Site Node | Components | 3 | [components/site-node.md](components/site-node.md) | The dreamscape site disc: a floating circular node carrying a glyph and accent ring. |
| Wager Prize Card | Components | 1 | [components/wager-prize-card.md](components/wager-prize-card.md) | The shared Gamble prize object: one playing-card superellipse with a draw target, an Essence reward with an optional Dreamsign, an optional whole-face Dreamsign reveal, and a committed-card reverse face. |
<!-- END GENERATED COMPONENT INDEX -->

## Customization: step back before adding any knob

The system's value is uniformity: a component reads identically on every
screen, so no call site can drift on its own. When a component seems to need
customizing, the correct response is to step back and think at the system
level — "what does this screen need?" is the wrong altitude; ask "how does the
system express this?" Work down this ladder and stop at the first rung that
fits:

1. **Use an existing component or variant as-is.** Check the index above and
   the component's reference file — the variant you want usually exists.
   Look at how other screens solve the same problem and match them.
2. **Wrap it for layout.** Size, position, spacing, and arrangement are the
   caller's concern: put the component inside your own wrapper element and
   style the wrapper. The component's internal appearance is the system's
   concern and stays fixed.
3. **Add a new strict variant.** One more enumerated option on an existing
   prop (or a new enumerated prop) is acceptable when you are confident no
   existing variant expresses the need. Update the demo entry and regenerate
   docs with it.
4. **Propose a new component.** If the need is genuinely new, a new strict
   component beats a loosened existing one. Flag it rather than improvising.

**Never** widen a prop into an open value or thread a raw value through. The
knobs that keep trying to sneak in each look harmless in isolation, and each
is a "no":

- A numeric `size`, `scale`, `gap`, `elevation`, `padding`, or `threshold` —
  a pixel measurement is layout; wrap and size your own element (rung 2).
- A per-instance `color` or `accent` so "this one instance" reads differently
  — states that legitimately differ (a boss node looming larger, a locked
  node dimmed) are decided _inside_ the component from its semantic model,
  never handed in as a raw value.
- `className`, `style`, or a `CSSProperties` prop — these are escape hatches
  that let a call site silently leave the system.
- A decorative badge, wash, or filter toggle added for one screen.

If you find yourself reaching for one of these, the component is being asked
to do the caller's job — stop and wrap it instead. This is enforced, not just
documented: the `no-escape-hatch-props` ESLint rule and API contract tests
fail the build on escape hatches. When lint blocks you, the design is telling
you to use a variant or wrap — do not disable the rule.

### Component forks do not ship

A screen may prototype a local rendering while the design is still being
worked out, but a stabilized push must converge it before merge. If the local
rendering copies an existing Cumulus component's material, type scale, media
treatment, interaction engine, or authored geometry, it is a component fork and
is not acceptable as production code. The production shape is one of the
customization ladder outcomes: use the existing component as-is, wrap it for
layout, add a strict variant to that component, or propose a genuinely new
component.

`pre-existing-issues.txt` is for issues found outside the current task, not a
parking lot for a fork created by the current change. A component fork that is
already present in the tree must be treated as debt to drain: promote it into
the component family or replace it with an existing component before clearing
the issue. The case study is the collapsed tide disc in
[docs/postmortems/2026-07-05-desktop-dream-avatar-select.md](../../../docs/postmortems/2026-07-05-desktop-dream-avatar-select.md),
which reached three independent declarations of the same diameter across
three files.

## Values are named, not stringly typed

A prop that carries anything other than free-form display text takes a
_named_ value type from `src/cumulus/primitives/`, never a bare string:

- A color is a `CumulusColor` — a palette role, or a `#hex` literal only for
  genuinely data-driven color. Never a CSS color string or class name.
- A glyph is a `Glyph` from the icon registry (`glyph.ts`). Never an icon
  name string or inline SVG.
- A piece of art is an `ArtRef` the component resolves to a URL itself
  (`art.ts`). Never a raw URL or path string.
- A media filter or image crop is a named union from `media.ts`.

Spacing, type, radius, shadow, color, and motion values come from the token
system — see "Tokens" below.

## Tokens: how and when

Every visual value you write in UI code — a margin, a color, a font, a corner
radius, a shadow, an animation duration — comes from the token vocabulary in
`src/cumulus/primitives/cumulus-tokens.css`. The full generated reference, grouped
by role with values and notes, is [tokens.md](tokens.md); the live specimen
view is the Design Tokens section of `/cumulus`.

**How to reference a token.** In Cumulus TS/TSX, call `token("--space-l")` from
`src/cumulus/primitives/tokens.ts` — it is typed against the real token names
and returns the `var(--space-l)` string for inline styles. In CSS, write
`var(--space-l)`. Tokens are scoped to the `.cumulus` subtree.

**One public vocabulary.** Every token is available to UI code and names a
visual role or a sanctioned scale. Role tokens such as `--surface-card`,
`--text-secondary`, and `--radius-control` say what a value is for. Scale
families such as `--space-*`, `--radius-*`, `--t-*`, `--dur-*`, and
`--shadow-*` provide the approved steps for layout, corner shape, typography,
motion, and elevation. Each declaration owns its resolved value directly in
`cumulus-tokens.css`.

**When you use tokens directly.** Mostly in rung-2 layout wrappers (see the
customization ladder): the wrapper you put around a Cumulus component to size,
place, and space it uses `--space-*` for margins/padding/gaps, and layout
constants like `--gutter`, `--touch-min`, `--hud-h`, `--safe-top`. When
authoring inside `src/cumulus/` itself: type is applied one voice at a time
(`font: token("--t-body")` — a `--t-*` token bundles face, weight, and
size/line-height; composing those by hand is drift), elevation comes from
`--shadow-*`/`--glow-*`, and every transition's timing comes from the motion
tokens (`--dur-*`, `--ease-*`, `--motion-object-travel`,
`--motion-container-transform`).

**Choosing a token.** Pick by role, never by resolved value — use
`--text-secondary` because the text is secondary, not because you like its
hex; use `--space-l` because the layout needs a large rhythm step, not because
16px looked right. Spacing from `--space-xs` upward sits on the 4px content
grid; reserve `--space-xxs` for tight optical separation. If no existing token expresses the role, that is a
token-system conversation (add a named token in `cumulus-tokens.css`, then run
`npm run cumulus-tokens`) — never a raw px/hex literal in product UI code. This is
lint-enforced in product UI: `no-hardcoded-values` catches raw colors,
`no-untokenized-lengths` catches raw px spacing and radii,
`no-composed-type-voice` catches hand-assembled font shorthands, and
`valid-token-references` catches `var(--…)` names that don't exist. Box
_measures_ (width/height/min/max constraints) are content-driven layout and
stay the caller's numbers.

**Glass text is a special role.** Text on the liquid-glass material uses
`--text-on-glass` or `--text-on-glass-muted`; authored `[purple]` tutorial
emphasis uses `--text-tutorial-highlight`. Do not use accent / essence / points
or violet production-bridge tokens for glass text. Blurred glass samples live
scene art, so the tutorial role resolves to a pale lavender lifted for contrast.
The `no-purple-text-on-glass` ESLint rule enforces this in files that import the
shared glass recipes.

CardView's component-owned `--cv-*` variables keep its frame geometry and
material together. Product and screen code use the semantic Cumulus names.

## Structured models, not arbitrary ReactNode

Components take structured model objects and named content slots, and decide
their own rendering from them — a `GameCard` takes a card model, an
`AtlasNode` takes an `AtlasNodeView`, rules text is a structured `RichText`
body. When you are tempted to pass JSX into a component so it "renders what I
built", check the component's reference file for the model it actually
accepts and build that instead. Passing an arbitrary ReactNode where a model
exists bypasses the component's rendering decisions and breaks the uniformity
the model encodes. The few genuine ReactNode slots (e.g. `Pressable`
children, `GlassPanel` content) are documented as such in the props tables.

## The isolation boundary

Code under `src/cumulus/` imports only other `src/cumulus/` code, `node_modules`,
and an explicit allowlist of non-UI infrastructure (`src/data`, `src/types`,
`src/logging`, `src/runtime`). Cumulus never imports UI from elsewhere; the
rest of the app imports its UI from Cumulus. The boundary is a lint gate
(fail-closed import allowlist) — when it blocks an import, move the code or
rethink the dependency; never widen the allowlist for UI code.

Outer production UI has a checked role in `eslint-rules/ui-boundary-roles.js`.
App-shell controllers wire state and Cumulus presentation; state adapters map
domain data; standalone operator UI stays beneath its named owner; and
`ErrorBoundary` is the emergency fallback. The boundary test discovers every
outer TSX/CSS file recursively, so a new presentation file requires an explicit
architectural disposition before it ships.

## Building a product screen: screen / builder / adapter

A journey screen is three files with strictly separated roles. Lint
enforces the split (`thin-adapters`, the builder-purity import block, and the
Cumulus boundary rules), so put each kind of code in its home from the start.
**When building a screen, follow the ordered checklist in the
companion [cumulus-migrate](../cumulus-migrate/SKILL.md) skill** — it carries the
working idioms (adapter randomness minting, screen-test incantations, the
registry/QA steps) that this overview compresses:

- **Cumulus screen** (`src/cumulus/screens/FooScreen.tsx`) — pure: renders from a
  view-model, reports events through callbacks. No `useJourney()`, no
  mutations, no navigation. The screen **owns and exports its view types**
  (`FooView`, `FooScreenProps`). Presentation logic and local UI state
  (hover, selection, pan/zoom, animation phase) belong here — most of the
  screen's code, by volume, is this file.
- **View-model builder** (`src/screens/cumulus_adapters/foo-view-model.ts`) — pure,
  exported, unit-tested functions mapping domain data to the screen's view
  types (`buildFooViewModel(...)`). Every mapping rule — capping,
  suppression, display-copy fallbacks, color→variant tables — lives here,
  tested with plain fixtures. Deterministic in its arguments; no `react`, no
  `src/state` (lint-enforced). A rule that is really a _domain_ rule belongs
  in `src/data/` instead, which both the builder and Cumulus may import.
- **Adapter** (`src/screens/cumulus_adapters/FooScreenAdapter.tsx`) — wiring only:
  acquire state, mint per-mount randomness (offers, seeds), call the builder
  inside `useMemo`, wire callbacks to mutations, render the screen. The
  `thin-adapters` rule errors on module-level helpers, mapping tables, extra
  exports, and any `src/cumulus/` import other than `src/cumulus/screens/`. If
  adapter code seems worth testing, it belongs in the builder.

Register the adapter in the exhaustive production resolver in
`src/screens/cumulus_adapters/registry.tsx`. Every non-site `Screen` resolves
through `screenFor`; every `SiteType` receives a screen, Battle, or inline
disposition through `siteDispositionFor`. Add or update the table-driven
registry test and QA the route to the production bar.

For big screens (Atlas-sized): keep one view-model at the root; when the tree
is deep, re-expose it through a screen-scoped React context defined inside
`src/cumulus/screens/` (still plain data + callbacks from props — never state
hooks). Split the builder into per-region functions
(`buildAtlasNodeViews`, `buildAtlasEdgeViews`, …) and memoize each in the
adapter against its own inputs. Full rationale:
[docs/journey_prototype/cumulus_design_system.md](../../../docs/journey_prototype/cumulus_design_system.md) §2.

## Core rendering rules

- **Panels hug content without exception**: a floating `GlassPanel` sizes to
  its header, body, and footer. Unassigned interior whitespace is invalid. A
  wrapper may constrain width and placement, but neither the panel nor its
  slots receive decorative height, flex growth, stretch equalization, or a
  spacer that separates content. Cap overflowing content with `max-height` and
  scrolling. Definite-height developer rails and full-bleed galleries use
  their named frame contracts instead of stretching a floating panel.
- **Material continuity**: meaningful objects travel or expand between
  states (object-travel / container-transform); nothing pops in or out.
- **Always in motion**: tangible game objects (cards, dreamsigns, resources)
  drift gently; review chrome (status bars, deck viewers) holds still.
- **Legibility ladder**: on-media text uses outline dilation; dense related
  info goes in a `GlassPanel`. A scrim, wash, or vignette painted over scene
  art to fake legibility is not on the ladder.
- **Glass text contrast**: text on blurred glass is white or warm near-white
  through `--text-on-glass` / `--text-on-glass-muted`; authored `[purple]`
  tutorial emphasis uses the pale-lavender `--text-tutorial-highlight`.
  Accent and resource text tokens are not legibility treatments on glass.
- **Glass surface stacking**: lay grouped content directly on a glass panel,
  dialog, or popover with spacing and subtle dividers. Nested controls use
  their named `onGlass` treatment.
- **Popup rule**: every reveal-on-interaction popup renders through
  `InfoCard` — pointer-anchored, no close button, no scrim; hover reveals on
  fine pointers, touch-hold on touch. Desktop InfoCards normally sit beside
  their source. Augury `OfferTile` is the single one-off exception: each
  offer's body-only InfoCard centers above that offer so the two choices remain
  visually legible. This exception is specific to Augury and is not a
  reusable placement pattern for other Cumulus surfaces.
- **Content voice**: second person, literary register; Title Case titles;
  uppercase monospaced eyebrows; no emoji anywhere.
- **Variable-content siblings**: side-by-side cards or columns whose copy
  varies in length (ability text, names) get natural height with cross-axis
  centering, plus at most a small commented min-height floor so the common
  case aligns. A fixed shared height, or stretch-equalization to the tallest
  sibling, parks the leftover space in whichever flex spacer is nearest — and
  that slack reads as a broken gap on every shorter sibling. If heights must
  match exactly, assign the slack to one deliberate region and measure the
  result (see the QA bar below).

## Verifying a screen: the visual QA bar

Browser QA (the repo-level verification instructions cover the server, ports,
`?goto=` mechanics, risk tiers, and screenshot budget) confirms much more than
"it renders". Walking the
request and confirming each asked-for element exists is necessary but never
sufficient — element presence is the floor, not the bar. A screen passes QA
when it clears all five bars below.

1. **Measure, don't adjectivize.** Every spacing or size judgment in a QA
   conclusion is a number read from the DOM — `getBoundingClientRect()`
   deltas via the browser's eval — not an impression formed from a
   screenshot. State gaps in px. A gap that is not a `--space-*` step (or a
   deliberate, commented box measure) is a finding. "Tasteful",
   "comfortable", and "balanced" without an accompanying measurement are not
   QA conclusions.
2. **Sweep content variance.** Render the screen's worst cases, not whatever
   data the current mint happens to produce: the longest and shortest copy in
   every variable text slot (reload-mint until it appears, or inject it via
   DOM eval), collections at their display cap, and each toggleable state.
   Wherever a constraint exists — a cap, an auto-shrink, an overflow — drive
   it to its limit. Prove objective geometry with DOM measurements; add a
   screenshot when rendered pixels or composition are part of the risk.
3. **Exercise every knob.** A new prop, constant, or tunable must be
   demonstrated at its extremes during QA. Measure geometry-affecting knobs
   and screenshot rendering-affecting extremes; a screenshot of the default
   proves nothing about the knob. This is what catches a knob wired to the
   wrong property — a "portrait height" that adds empty space above the art
   instead of scaling it reads fine until someone actually drags it.
4. **Take one holistic pass, separate from the checklist pass.** For a new
   screen, major redesign, or other high-aesthetic-risk change, judge the final
   composition cold: is the control scale right
   for the platform (desktop is its own idiom — denser, smaller controls
   than mobile, never mobile components stretched across a wide viewport)?
   Is visual weight spent where the hierarchy wants it? Is the spacing
   rhythm consistent? Is there anything you could remove without loss?
   Literal per-item fixes accumulate into noise that no individual check
   sees. Reserve a fresh-context subagent judging only the screenshot — without
   the change list — for these high-risk changes. Routine component fixes use
   the canonical screenshot budget and do not need a separate reviewer.
5. **A hedge is a stop sign.** If the pre-commit summary wants to say "but I
   can tighten it if you'd prefer", the doubt is real and the reader will
   agree with it. Resolve it before committing: measure it against bar 1, fix
   it, or put an early side-by-side in front of the user before the full suite.

Case study for why these five exist:
[docs/postmortems/2026-07-05-desktop-dream-avatar-select.md](../../../docs/postmortems/2026-07-05-desktop-dream-avatar-select.md).

## Tuning taste values: the tweaks-panel loop

Box measures — column widths, portrait heights, overlaps, min-heights — are
caller numbers outside the token system, so lint cannot govern them; human
eyes settle their values. When a screen has more than one or two of these to
dial in, guessing a number, screenshotting, and asking is the slow path.
Build a dev-only tweaks panel and let the user tune the real screen live:

1. Define a schema object of the tunable values (numbers and booleans) with
   the current values as defaults.
2. Render a floating panel of sliders and toggles, gated on
   `import.meta.env.DEV`, wired to the schema through React state, with a
   live JSON readout of the current values for copy-paste.
3. The panel is scaffolding and may use raw native inputs and hand-styled
   markup: add its devtools path to the exemption lists in
   `no-raw-interactive-elements`, `no-hardcoded-values`, and
   `no-untokenized-lengths` for the duration.
4. The user tunes in the browser and pastes the JSON back; bake those values
   in as the new defaults and iterate until they stop moving.

**The cleanup contract.** The task is unfinished until the same push that
adopts the final values also:

- deletes the panel file and all plumbing that threads tweak values through
  the screen;
- reverts every lint exemption added for the panel;
- lands the final values as plain, commented module constants (box measures)
  — or as tokens, if a value turns out to be spacing/color/type-shaped with a
  genuine semantic role.

The baked-in result must read as if the values were always design constants;
the panel leaves no residue in the tree.

## Adding or changing a component

1. Component source lives in `src/cumulus/components/` (or `primitives/`).
   Document every prop with JSDoc — the props tables and reference files are
   generated from those comments, so the prop comment is the primary
   documentation surface.
2. Add or update the demo entry in `src/cumulus/docs/demos/<id>.tsx` (blurb,
   callout guidance, usage snippets) and register it in
   `src/cumulus/docs/registry.ts`. Keep doc fields as plain string literals —
   the docs generator extracts them statically.
3. Run `npm run cumulus-metadata && npm run cumulus-docs` (or
   `npm run regenerate-assets`) and commit the regenerated files with the
   change.
