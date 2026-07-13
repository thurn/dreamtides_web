---
name: tango
description: Use when writing or changing any quest prototype UI — building screens, using or adding Tango design-system components, styling, spacing, colors, icons, or reviewing UI code. Triggers on tango, design system, UI component, component API, Pressable, Button, GroupPanel, InfoCard, GameCard, tokens, spacing, styling, /tango.
---

# Tango Design System

Tango (`src/tango/`) is the design system every screen in the quest prototype
is built from: one small, strict catalog of components with tightly typed
APIs. All UI work starts here — first find the Tango component that does the
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
  the solid alternatives that are deliberately *not* glass.
- **Live doc site**: `/tango` on the dev server (e.g.
  `http://localhost:5173/tango`), with `/tango#/<id>` per component —
  interactive demos and the same props tables, useful during browser QA.
- **Design philosophy in depth**:
  [docs/quest_prototype/tango_design_system.md](../../../docs/quest_prototype/tango_design_system.md).
- **Screen composition current state**:
  [docs/quest_prototype/tango_screen_composition.md](../../../docs/quest_prototype/tango_screen_composition.md).

The reference files and the index are projections of the component sources
(prop JSDoc via `npm run tango-metadata`, prose via the demo entries in
`src/tango/docs/demos/`). Regenerate with `npm run tango-docs` (included in
`npm run regenerate-assets`); edit the sources, never the generated files.

## Required screen chrome

Every registered Tango product screen receives shared quest chrome from the
router-owned `TangoQuestChrome` wrapper unless the route is an explicit
pre-quest or battle-shell exception:

- a top-right gear icon on desktop;
- a top-left hamburger menu icon on mobile;
- the `QuestStatusBar` bottom HUD, replacing any legacy status bar on the
  screen.

Pure screen files and their view models do not import, render, or carry data for
this chrome. Registration applies it automatically, and the screen-chrome
contract test rejects local `QuestStatusBar` or quest-menu rendering under
`src/tango/screens/`.

## Component index

<!-- BEGIN GENERATED COMPONENT INDEX (npm run tango-docs) -->
| Component | Group | Consumers | Reference | What it is |
| --- | --- | --- | --- | --- |
| Pressable | Primitives | 24 | [components/pressable.md](components/pressable.md) | The one press-feedback primitive. |
| Resource Chip | Components | 3 | [components/resource-chip.md](components/resource-chip.md) | The sized, self-contained value-and-mark chip for the game economy. |
| Essence Value | Components | 14 | [components/essence-value.md](components/essence-value.md) | The tight inline essence amount: a tabular number glued to the filled essence glyph, for player-facing currency text outside rules copy. |
| Button | Components | 3 | [components/button.md](components/button.md) | Rung 1 of Tango's four-rung button suite — the beveled purple sprite, the primary/commit action, scaled to any label and to a taller commit height. |
| Icon Button | Components | 14 | [components/icon-button.md](components/icon-button.md) | The compact glyph-only glass disc — a corner chrome action with placement-aware recipes for scene media or an existing glass surface, made fully round so it reads as one family with the filter/sort controls. |
| Glass Button | Components | 4 | [components/glass-button.md](components/glass-button.md) | The labeled glass action — a text label in the control typography on the shared liquid-glass surface, with neutral, danger, and purple accent treatments plus placement-aware recipes for media or an existing glass surface. |
| Glass Dialog | Components | 0 | [components/glass-dialog.md](components/glass-dialog.md) | The glass overlay shell: a modal dialog with a bounded, centered glass panel on desktop and a full-bleed frosted overlay on mobile, with a hairline-closed header (title, optional subtitle, and a glass close disc) over a scrolling body. |
| Speech Bubble | Components | 2 | [components/speech-bubble.md](components/speech-bubble.md) | A guide-dialog bubble for character-led site screens: the same frosted information material as an InfoCard, with a strict left-or-right arrow that points back to the speaker. |
| Segmented Control | Components | 1 | [components/segmented-control.md](components/segmented-control.md) | The compact tab and filter switch used for type filters, sort direction, and small mode toggles. |
| Select | Components | 2 | [components/select.md](components/select.md) | The compact dropdown control, and Tango's standard mobile filter/sort control: a button that shows a leading glyph and the current selection, and opens a menu on tap. |
| Tide Disc | Components | 2 | [components/tide-disc.md](components/tide-disc.md) | The single semantic tide mark: a colored disc carrying the tide's glyph and its own strict tide reveal, sized 'sm' or 'lg'. |
| Transfiguration Form Button | Components | 1 | [components/transfiguration-form-button.md](components/transfiguration-form-button.md) | The compact forge-form choice: a colored transfiguration glyph and form name in one touch-sized control, with the cost and effect revealed through InfoCard. |
| Motes | Components | 8 | [components/motes.md](components/motes.md) | The atmospheric particle layer — drifting dust that gives a surface its living shimmer. |
| Info Card | Components | 6 | [components/info-card.md](components/info-card.md) | The one press-to-reveal information card. |
| Group Panel | Components | 2 | [components/group-panel.md](components/group-panel.md) | The information-grouping card: a flat, solid deep-plum card that collects dense, related values into one unit. |
| Glow Icon | Primitives | 11 | [components/glow-icon.md](components/glow-icon.md) | The resource-glyph renderer for card marks: a Boxicons glyph that paints in the caller's resource hue, with an optional content-protection shadow and an optional emitted-light glow pinned to its own font-size so both scale with the mark. |
| Pip Badge | Components | 2 | [components/pip-badge.md](components/pip-badge.md) | The circled number on a colored disc for card stats: a spark value or an energy cost, and the inline spark reference inside rules text. |
| Quest Status Bar | Components | 5 | [components/quest-status-bar.md](components/quest-status-bar.md) | The persistent, transparent bottom HUD for quest screens. |
| Battle Status Display | Components | 1 | [components/battle-status-display.md](components/battle-status-display.md) | The solid physical status card for one battle participant: current and maximum energy at left, a head-focused Dreamcaller portrait at center, and current points at right. |
| Dreamcaller Portrait | Components | 23 | [components/dreamcaller-portrait.md](components/dreamcaller-portrait.md) | The one way to render a dreamcaller's character art: the transparent full-body cutout in one of six fixed framings. |
| Rich Text | Components | 16 | [components/rich-text.md](components/rich-text.md) | The design system's model for a run of formatted copy. |
| Rules Text | Components | 18 | [components/rules-text.md](components/rules-text.md) | Renders Dreamtides rules copy from card data — resource pips, ability carets, and glossary keywords styled in place — so ability text reads the same everywhere it appears. |
| Game Card | Components | 28 | [components/game-card.md](components/game-card.md) | The playable card object — art, cost, stats, and rules text — rendered at any size and always resolved by UUID, never by name. |
| Card Back | Components | 2 | [components/card-back.md](components/card-back.md) | The canonical face-down Dreamtides card object: the shipped card-back sprite on the shared 5:7 card geometry, with fixed crop, edge, and elevation. |
| Card Pile | Components | 1 | [components/card-pile.md](components/card-pile.md) | A physical deck or void stack built from structured, topmost-first card instances. |
| Card Gallery Panel | Components | 4 | [components/card-gallery-panel.md](components/card-gallery-panel.md) | The shared card-browser surface: a left-aligned title and subtitle, optional header and centered footer actions, and a scrolling GameCard grid, framed as floating glass or a full-bleed alpha scrim. |
| Card Term Definitions | Components | 0 | [components/card-term-definitions.md](components/card-term-definitions.md) | A reading-order, de-duped stack of Glossary Definition Cards for every gameplay term in a stretch of rules text, rendered beside or beneath a card so the player reads what every highlighted keyword means without inline tooltips. |
| Glossary Definition Card | Components | 4 | [components/glossary-definition-card.md](components/glossary-definition-card.md) | The one keyword-definition tile: a single glossary entry rendered as an InfoCard text card whose headline is the keyword and whose body is the keyword's rules text. |
| Card Stat Orb | Components | 2 | [components/card-stat-orb.md](components/card-stat-orb.md) | The card-corner resource stat: a fitted white numeral over the energy, spark, or Dreamwell-energy glyph, with an optional monochrome transfiguration badge. |
| Atlas Node | Components | 3 | [components/atlas-node.md](components/atlas-node.md) | One dreamscape node on the Dream Atlas, wired to the shared InfoCard press engine: a framed circular icon whose glow and badges track its state — revealed, known, visited, completed, forgone, or a looming boss — and which reveals its scene / detail card on hover or press. |
| Atlas Edge | Components | 2 | [components/atlas-edge.md](components/atlas-edge.md) | The connector between two Atlas nodes, drawn inside the map's SVG. |
| Atlas Map | Components | 1 | [components/atlas-map.md](components/atlas-map.md) | The Dream Atlas map surface — the run graph of dreamscape nodes and their connectors, fitted into a fixed portrait design stage that uniformly scales to fit its container (letterboxed). |
| Dreamsign | Components | 12 | [components/dreamsign.md](components/dreamsign.md) | A dreamsign — a minor passive collectible — shown as its art floating on the scene. |
| Dreamsign Gallery Panel | Components | 1 | [components/dreamsign-gallery-panel.md](components/dreamsign-gallery-panel.md) | The liquid-glass purchase shelf for Dreamsign offers: UUID-keyed collectible art, essence captions, a close disc, and one bare-glyph end action. |
| Site Node | Components | 2 | [components/site-node.md](components/site-node.md) | The dreamscape site disc: a floating circular node over scene art carrying a glyph and accent ring. |
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
  node dimmed) are decided *inside* the component from its semantic model,
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
rendering copies an existing Tango component's material, type scale, media
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
[docs/postmortems/2026-07-05-desktop-dreamcaller-select.md](../../../docs/postmortems/2026-07-05-desktop-dreamcaller-select.md),
which reached three independent declarations of the same diameter across
three files.

## Values are named, not stringly typed

A prop that carries anything other than free-form display text takes a
*named* value type from `src/tango/primitives/`, never a bare string:

- A color is a `TangoColor` — a palette role, or a `#hex` literal only for
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
`src/tango/primitives/tango-tokens.css`. The full generated reference, grouped
by role with values and notes, is [tokens.md](tokens.md); the live specimen
view is the Primitives section of `/tango`.

**How to reference a token.** In Tango TS/TSX, call `token("--space-6")` from
`src/tango/primitives/tokens.ts` — it is typed against the real token names
and returns the `var(--space-6)` string for inline styles. In CSS, write
`var(--space-6)`. Tokens are scoped to the `.tango` subtree.

**Two tiers — use the semantic one.** `--primitive-*` names a raw value (a
color-ramp step, a radius step, a font face) and is the internal material the
semantic layer is built from; the `no-primitive-tokens` ESLint rule errors on
any `--primitive-*` reference outside `src/tango/primitives/` and
`src/tango/components/`. Everything else is a semantic token that names a
*use* — `--surface-card`, `--text-secondary`, `--radius-control` — and is
what all UI code writes against. This split is what lets the whole system
re-skin by editing the primitive layer alone.

**When you use tokens directly.** Mostly in rung-2 layout wrappers (see the
customization ladder): the wrapper you put around a Tango component to size,
place, and space it uses `--space-*` for margins/padding/gaps, and layout
constants like `--gutter`, `--touch-min`, `--hud-h`, `--safe-top`. When
authoring inside `src/tango/` itself: type is applied one voice at a time
(`font: token("--t-body")` — a `--t-*` token bundles face, weight, and
size/line-height; composing those by hand is drift), elevation comes from
`--shadow-*`/`--glow-*`, and every transition's timing comes from the motion
tokens (`--dur-*`, `--ease-*`, `--motion-object-travel`,
`--motion-container-transform`).

**Choosing a token.** Pick by role, never by resolved value — use
`--text-secondary` because the text is secondary, not because you like its
hex; `--space-6` because it is the scale step the neighboring UI uses, not
because 16px looked right. If no existing token expresses the role, that is a
token-system conversation (add a semantic token in `tango-tokens.css`,
resolving through a primitive, then `npm run tango-tokens`) — never a raw
px/hex literal in UI code, and never a reach into `--primitive-*`. This is
lint-enforced in product UI: `no-hardcoded-values` catches raw colors,
`no-untokenized-lengths` catches raw px spacing and radii,
`no-composed-type-voice` catches hand-assembled font shorthands, and
`valid-token-references` catches `var(--…)` names that don't exist. Box
*measures* (width/height/min/max constraints) are content-driven layout and
stay the caller's numbers.

**Glass text is a special role.** Text on the liquid-glass material uses
`--text-on-glass` or `--text-on-glass-muted`, never accent / essence / points
or any violet production-bridge token. Blurred glass samples live scene art;
purple text fails on bright sky, snow, gold, and white regions behind the
surface. The `no-purple-text-on-glass` ESLint rule enforces this in files that
import the shared glass recipes.

The `--dt-*` / `--color-*` / `--cv-*` families are a production bridge: the
same values re-exported under the production codebase's token names so shared
elements (above all the game card) resolve identically in either system. In
new Tango code prefer the semantic names.

## Structured models, not arbitrary ReactNode

Components take structured model objects and named content slots, and decide
their own rendering from them — a `GameCard` takes a card model, an
`AtlasNode` takes an `AtlasNodeView`, rules text is a structured `RichText`
body. When you are tempted to pass JSX into a component so it "renders what I
built", check the component's reference file for the model it actually
accepts and build that instead. Passing an arbitrary ReactNode where a model
exists bypasses the component's rendering decisions and breaks the uniformity
the model encodes. The few genuine ReactNode slots (e.g. `Pressable`
children, `GroupPanel` content) are documented as such in the props tables.

## The isolation boundary

Code under `src/tango/` imports only other `src/tango/` code, `node_modules`,
and an explicit allowlist of non-UI infrastructure (`src/data`, `src/types`,
`src/logging`, `src/runtime`). Tango never imports UI from elsewhere; the
rest of the app imports its UI from Tango. The boundary is a lint gate
(fail-closed import allowlist) — when it blocks an import, move the code or
rethink the dependency; never widen the allowlist for UI code.

## Building a product screen: screen / builder / adapter

A migrated quest screen is three files with strictly separated roles. Lint
enforces the split (`thin-adapters`, the builder-purity import block, and the
Tango boundary rules), so put each kind of code in its home from the start.
**When migrating or building a screen, follow the ordered checklist in the
companion [tango-migrate](../tango-migrate/SKILL.md) skill** — it carries the
working idioms (adapter randomness minting, screen-test incantations, the
registry/QA steps) that this overview compresses:

- **Tango screen** (`src/tango/screens/FooScreen.tsx`) — pure: renders from a
  view-model, reports events through callbacks. No `useQuest()`, no
  mutations, no navigation. The screen **owns and exports its view types**
  (`FooView`, `FooScreenProps`). Presentation logic and local UI state
  (hover, selection, pan/zoom, animation phase) belong here — most of the
  screen's code, by volume, is this file.
- **View-model builder** (`src/screens/tango_adapters/foo-view-model.ts`) — pure,
  exported, unit-tested functions mapping domain data to the screen's view
  types (`buildFooViewModel(...)`). Every mapping rule — capping,
  suppression, display-copy fallbacks, color→variant tables — lives here,
  tested with plain fixtures. Deterministic in its arguments; no `react`, no
  `src/state` (lint-enforced). A rule that is really a *domain* rule belongs
  in `src/data/` instead, which both the builder and Tango may import.
- **Adapter** (`src/screens/tango_adapters/FooScreenAdapter.tsx`) — wiring only:
  acquire state, mint per-mount randomness (offers, seeds), call the builder
  inside `useMemo`, wire callbacks to mutations, render the screen. The
  `thin-adapters` rule errors on module-level helpers, mapping tables, extra
  exports, and any `src/tango/` import other than `src/tango/screens/`. If
  adapter code seems worth testing, it belongs in the builder.

Register the adapter in `src/screens/tango_adapters/registry.tsx`. **Registration is
launch**: `?ui=tango` is the default variant, so a registry entry serves the
screen to production immediately — QA to the production bar first
(`?ui=legacy` is the rollback flag).

For big screens (Atlas-sized): keep one view-model at the root; when the tree
is deep, re-expose it through a screen-scoped React context defined inside
`src/tango/screens/` (still plain data + callbacks from props — never state
hooks). Split the builder into per-region functions
(`buildAtlasNodeViews`, `buildAtlasEdgeViews`, …) and memoize each in the
adapter against its own inputs. Full rationale:
[docs/quest_prototype/tango_design_system.md](../../../docs/quest_prototype/tango_design_system.md) §2.

## Core rendering rules

- **Material continuity**: meaningful objects travel or expand between
  states (object-travel / container-transform); nothing pops in or out.
- **Always in motion**: tangible game objects (cards, dreamsigns, resources)
  drift gently; review chrome (status bars, deck viewers) holds still.
- **Legibility ladder**: on-media text uses outline dilation; dense related
  info goes in a `GroupPanel`. A scrim, wash, or vignette painted over scene
  art to fake legibility is not on the ladder.
- **Glass text contrast**: text on blurred glass is white or warm near-white
  through `--text-on-glass` / `--text-on-glass-muted`; violet/accent/resource
  text is not a legibility treatment on glass.
- **Popup rule**: every reveal-on-interaction popup renders through
  `InfoCard` — pointer-anchored, no close button, no scrim; hover reveals on
  fine pointers, touch-hold on touch.
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
and `?goto=` mechanics) confirms much more than "it renders". Walking the
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
   it to its limit and screenshot the limit. Verifying that the constraint's
   code path computes something is not the same as seeing what it renders.
3. **Exercise every knob.** A new prop, constant, or tunable must be
   demonstrated at its extremes during QA; a screenshot of the default
   proves nothing about the knob. This is what catches a knob wired to the
   wrong property — a "portrait height" that adds empty space above the art
   instead of scaling it reads fine until someone actually drags it.
4. **Take one holistic pass, separate from the checklist pass.** After the
   per-item checks, judge the composition cold: is the control scale right
   for the platform (desktop is its own idiom — denser, smaller controls
   than mobile, never mobile components stretched across a wide viewport)?
   Is visual weight spent where the hierarchy wants it? Is the spacing
   rhythm consistent? Is there anything you could remove without loss?
   Literal per-item fixes accumulate into noise that no individual check
   sees. A fresh-context subagent judging only the screenshot — without the
   change list — gives an unanchored read cheaply.
5. **A hedge is a stop sign.** If the pre-commit summary wants to say "but I
   can tighten it if you'd prefer", the doubt is real and the reader will
   agree with it. Resolve it before committing: measure it against bar 1,
   fix it, or put a side-by-side in front of the user and ask.

Case study for why these five exist:
[docs/postmortems/2026-07-05-desktop-dreamcaller-select.md](../../../docs/postmortems/2026-07-05-desktop-dreamcaller-select.md).

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

1. Component source lives in `src/tango/components/` (or `primitives/`).
   Document every prop with JSDoc — the props tables and reference files are
   generated from those comments, so the prop comment is the primary
   documentation surface.
2. Add or update the demo entry in `src/tango/docs/demos/<id>.tsx` (blurb,
   callout guidance, usage snippets) and register it in
   `src/tango/docs/registry.ts`. Keep doc fields as plain string literals —
   the docs generator extracts them statically.
3. Run `npm run tango-metadata && npm run tango-docs` (or
   `npm run regenerate-assets`) and commit the regenerated files with the
   change.
