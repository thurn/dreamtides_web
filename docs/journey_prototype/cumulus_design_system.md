# Cumulus Design System

`localhost/cumulus` is a self-contained documentation endpoint for **Cumulus**, the
ground-up redesign of the journey-prototype UI. It combines the redesigned system
authored in Claude Design
(`claude.ai/design/p/10fa84a8-cdc2-4e83-80af-47df24d1c247`) with the components
the code already ships, and presents them as one browseable, interactive
reference.

This document records the shipped architecture. The Cumulus integrity checks,
typecheck, and test suite maintain the boundary on every change.

---

## 1. Goals

- A `/cumulus` route that documents the Cumulus system: a table of contents, an
  Introduction / Design Philosophy section, a Primitives section, and a
  Components section.
- Every component gets: an **interactive demo**, a **programmatic props table**
  (never hand-maintained), and a click-through **full-screen mockup** detail
  page showing the component in a realistic UI.
- Cumulus becomes the _home_ of the shared UI component library. Reused
  components (game card, rules text, atlas pieces) move into `src/cumulus/`, and
  the rest of the app imports them from there.
- Real content is shown wherever it exists (real card UUIDs, real atlas
  fixtures), not faked placeholders.
- **Strict, controlled component APIs.** Every component exposes a small,
  strongly-typed surface — enumerated variants, sizes, and named content slots
  — and nothing else. Components never accept a raw `className`, an inline
  `style` object, or an arbitrary corner radius / padding / color / filter /
  scale token override. A prop that carries a value which is not free-form text
  takes a _named_ value, not a string: a color is a `CumulusColor` (a palette
  role, or a `` `#${string}` `` hex for a genuinely data-driven one), a glyph is
  a `Glyph` from the icon registry, a piece of art is an `ArtRef` the component
  resolves to a URL itself, and a media filter / image crop
  is a named union. These value types live in `src/cumulus/primitives/`
  (`color.ts`, `glyph.ts`, `art.ts`, `media.ts`). **Adding arbitrary token
  customization to a component is never acceptable** — those escape hatches let
  a caller silently drift from the system. When a screen needs to size or
  position a component, it wraps the
  component in its own element (layout is the caller's concern; the component's
  fixed appearance is the system's). Adding a _new strict prop_ — one more
  enumerated variant — is fine when you are confident no existing variant can
  express the need; widening an existing prop into an open value is not. When in
  doubt, match how the other screens solve it rather than inventing a knob.
- **Component forks do not ship.** A screen may prototype a local rendering
  while a design is being worked out, but production UI must converge on the
  Cumulus catalog before merge. Copying an existing component's material, type
  scale, media treatment, interaction engine, or authored geometry into a
  screen-local component creates a parallel design-system component. The
  acceptable production outcomes are the customization ladder: use the component
  as-is, wrap it for layout, add a strict variant, or propose a genuinely new
  component. `pre-existing-issues.txt` records unrelated debt found during a
  task; it is not a parking lot for a component fork created by that task.

Cumulus works on **any screen**. Components are token-scaled and responsive; the
mockup pages render full-screen against the real viewport (sized via browser
DevTools device emulation), not inside an in-app device frame.

---

## 2. Architecture & the isolation boundary

All Cumulus code lives under `src/cumulus/`:

```
src/cumulus/
  primitives/     tokens, Pressable, icon helper
  components/     every documented component
  assets/         bundled UI art (one Phosphor font face)
  docs/           the /cumulus page: shell, router, sections, per-component demos + mockups
  metadata/       generated cumulus-metadata.json (docgen output)
```

**The boundary rule.** Code under `src/cumulus/` may reference only:

- other code under `src/cumulus/`,
- `node_modules`,
- an explicit allowlist of **non-UI** infrastructure: `src/data`, `src/types`,
  `src/logging`, `src/runtime` (extended only as specific non-UI modules prove
  necessary).

Cumulus may **never** import UI code from elsewhere in the project. The dependency
is inverted: Cumulus is a leaf that everything else depends on for UI, and depends
on nobody for UI.

**Enforcement (fail-closed allowlist).** An ESLint import zone
(`import/no-restricted-paths`, or `eslint-plugin-boundaries`) declares that files
in `src/cumulus/**` may resolve imports only to `src/cumulus/**` plus the allowlist
above; every other path under `src/` is denied **by default**. A future UI
directory can never silently leak in — it fails closed. This rule runs on
changed UI files as part of `npm run review`, so the architecture is a lint
gate, not a convention.

### Outer UI ownership

Every production TSX and CSS file outside `src/cumulus/` has one checked role
in `eslint-rules/ui-boundary-roles.js`: app shell/controller, state adapter,
operator tool, Cumulus devtool or conformance fixture, emergency fallback, or
vendor asset. The boundary test discovers files recursively and rejects an
unclassified file. App-shell files wire state and route Cumulus presentation;
operator tools keep their UI beneath a named tool owner; `ErrorBoundary` is the
documented emergency fallback. `src/index.css` owns only the application entry
reset, cursor defaults, and inherited color bridge. Reusable visual components
and their authored CSS live in the Cumulus closure.

**Moving components in.** When a production component is reused, it and its
component-specific helper closure physically **move** into `src/cumulus/`, and
external call sites re-point their imports to Cumulus. Component-specific `.ts`
helpers that live in UI directories today (`card-text`, `card-display-scale`,
`dreamscape-scatter`, `atlas-display`, `GlowIcon`, `PipBadge`, …) move in with
their component; only genuinely cross-cutting infrastructure (types, data,
logging, runtime) stays external and allowlisted. Borderline modules are judged
case-by-case in the phase that touches them (e.g. `transfiguration-logic` — game
logic + a type consumed by the card — is allowlisted if it stays shared game
logic, moved if it is UI-coupled).

Measured closures (small enough to move incrementally, typechecking between
moves):

- `CardView` → `card-text`, `card-display-scale`, `GlowIcon`, `CardStatOrb`,
  `RulesText`, `PipBadge`, `useFitText`.
- `RulesText` → `card-text`, `PipBadge`.
- `AtlasNode` → `atlas-display`.
- `DreamscapeSiteNode` → `dreamscape-scatter`.

### Catalog lifecycle

Consumer count is an audit signal, not a reuse target. A component may have one
production consumer when it owns a named game object, scene action, or workflow
whose semantics and interaction contract belong in Cumulus. `AtlasMap`,
`BattleStatusDisplay`, `MainMenuButton`, and `CardOrderEditor` are examples of
deliberately narrow roles: their value is one canonical implementation and a
strict typed API, even when the product has one place to render that concept.

Every health sweep assigns each one-consumer component one disposition:

- **Retain as a narrow role** when the component owns a coherent semantic
  object or workflow and its public API prevents the consumer from authoring a
  parallel treatment.
- **Fold into its containing component or screen** when the public API only
  exposes an implementation detail of that one composition.
- **Delete** when the production consumer disappears or the same job is fully
  expressed by another catalog component.

This is a review decision recorded by the sweep, rather than a permanent source
exemption. A general-purpose-looking component with one consumer must either
gain evidence that its abstraction is useful or be folded into its owner.

Zero-consumer components are permitted only with the visible `incubating`
catalog status and a named adoption role. Incubation lasts through one
subsequent health sweep: a component that still has no production consumer at
the following sweep is adopted or deleted. `CardTermDefinitions` is currently
the incubating normal-flow consolidated glossary card intended for definitions placed
beside or beneath rules text; entity-reveal glossary cards are a separate
coordinator-owned surface and do not count as its adoption.

### Product screens

Every gameplay screen uses Cumulus and splits into **three roles** — a pure
screen, a pure view-model builder, and a thin adapter.
The bulk of a screen's code lives in the first two, which are both
plain-data-in / plain-data-out and trivially unit-testable; the adapter is
deliberately skeletal, because it is the one layer hooks make hard to test.

- A **Cumulus screen** (`src/cumulus/screens/*.tsx`) is pure: it renders from a
  view-model and reports events through callbacks, importing only Cumulus and the
  allowlisted infra. It holds no `useJourney()`, no mutations, no navigation. It
  **owns and exports its view-model types** (`DreamAvatarOfferView`, …) — the
  consumer defines the contract, and the builder maps into it. Purity does not
  mean logic-free: layout, conditional rendering, formatting, and _local UI
  state_ (hover, selection-in-progress, pan/zoom, animation phase) are all
  screen code, because none of it touches journey state. Its root carries
  `className="cumulus"` so the design tokens resolve (the adapter mounts it
  outside any other `.cumulus` subtree). Screens inherit every strict rule —
  named design tokens rather than hardcoded visual values, no raw interactive
  elements, and no escape-hatch props — so `npm run review` is what proves a
  migrated screen conforms.
- A **view-model builder** (`src/screens/cumulus_adapters/*-view-model.ts`) is a module of
  pure, exported, unit-tested functions mapping domain data to the screen's
  view types (e.g. `buildDreamAvatarOfferViews` in
  `journey-start-view-model.ts`). Every non-trivial mapping rule — capping,
  suppression, display-copy resolution, color→variant tables — lives here, in
  functions tested with plain fixtures. Builders are deterministic in their
  arguments: randomness (offers, seeds) is minted by the adapter and passed in.
  A lint block bans `react` and `src/state` imports in builder modules, so a
  builder can never quietly become a component or acquire state itself. A
  mapping rule that is genuinely a _domain_ rule rather than a display rule
  belongs one level lower, in `src/data/` — which is on Cumulus's allowlist, so
  both the builder and Cumulus itself may use it.
- An **adapter** (`src/screens/cumulus_adapters/*Adapter.tsx`, _outside_ Cumulus) is
  **wiring only**: it acquires state (`useJourney()`), mints any per-mount
  randomness, calls the builder, wires callbacks to mutations, and renders the
  Cumulus screen — nothing else. The `thin-adapters` lint rule enforces this
  structurally (see §9): the only Cumulus import an adapter may hold is its
  screen, the only export is the single `*Adapter` component, and module-level
  helpers, mapping tables, and exported types are errors pointing at the
  view-model module. The moment adapter code is worth testing, it belongs in
  the builder — that is the convention the rule encodes.

Deciding where a piece of code goes reduces to one question each: does it read
live state or perform an effect (adapter)? Does it transform domain data into
view shape (builder — or `src/data` if it is a domain rule)? Does it decide how
things look and behave on screen (screen)?

#### Big screens (Atlas, Dreamscape)

The same three roles scale to the largest screens; what changes is how the
view-model is plumbed and built:

- **One view-model at the root, context below it.** The adapter still hands the
  screen a single view-model. When the screen's component tree is deep (the
  Atlas node/edge tree), the screen re-exposes that view-model — plain data and
  callbacks received via props — through a screen-scoped React context defined
  inside `src/cumulus/screens/`, so mid-tree components read it without
  prop-drilling. That context is still pure: it carries the view-model, never
  state hooks.
- **Builders split per region.** A big screen's builder module exports several
  functions (`buildAtlasNodeViews`, `buildAtlasEdgeViews`, …) and the adapter
  memoizes each against its own inputs, so one journey-state change rebuilds only
  the affected slice of the view-model rather than the world.
- **Local UI state stays in the screen.** Pan/zoom, the hovered node, an open
  preview — anything that resets harmlessly on remount is screen state. Only
  facts that must survive the screen (or the session) travel through the
  adapter to journey state.

#### Production registry

`ScreenRouter` consults `src/screens/cumulus_adapters/registry.tsx`. `screenFor`
resolves every non-site `Screen` to a Cumulus adapter. `siteDispositionFor`
classifies every `SiteType` as a Cumulus screen, the Battle route, or a
Dreamscape-inline Essence/Reward interaction. Both switches are exhaustive and
non-null. Adding a `Screen` or `SiteType` therefore requires an explicit
production disposition in the same change. The adapters, view-model builders,
and registry are the app's permanent state-wiring layer.

---

## 3. Routing

`/cumulus` is a new pathname branch in `src/main.tsx`, matching the existing
standalone-route pattern (`/editor`, `/dreamsigns`, `/images`): it lazy-imports
`CumulusApp` and renders it.

Navigation **inside** `/cumulus` uses a tiny custom **hash router** (no new
dependency, no server rewrite config):

- `/cumulus` — overview + table of contents.
- `/cumulus#/<component>` — a component page (demo + props table).
- `/cumulus#/<component>/mockup` — the full-screen mockup detail page.

Hashes are deep-linkable and the browser back button works. This deliberately
avoids path sub-routes, which would require Vite `historyApiFallback` and
Firebase Hosting rewrites.

---

## 4. Token pipeline

The design ships tokens as CSS custom properties (`tokens/colors.css`,
`effects.css`, `spacing.css`, `typography.css`, `fonts.css`, `base.css`). Cumulus
adopts these values verbatim.

- **Source of truth:** a `src/cumulus/primitives/cumulus-tokens.css` scoped under a
  `.cumulus` root class, holding the custom properties.
- **Typed mirror:** a generated `src/cumulus/primitives/tokens.ts` of typed
  constants for TS/inline-style use and for the demo harness. Generation is
  wired into `scripts/regenerate-assets.sh`.

### One public vocabulary

Every token in the sheet is part of the vocabulary UI code may reference. A
role token describes what a value is for: `--surface-card`, `--text-primary`,
`--accent`, `--radius-control`, and `--font-ui`. Sanctioned scales cover spacing
(`--space-*`), corner radius (`--radius-*`), type (`--t-*`), motion, and
elevation. Each declaration owns its resolved CSS value directly, making the
token contract readable without a second lookup layer.

Choose tokens by role rather than by resolved value. Use `--text-secondary`
because the text is secondary and `--radius-control` because the object is a
control. Add a named role to `cumulus-tokens.css` when the vocabulary does not
express a product need; product screens do not author incidental colors,
spacing, type voices, radii, shadows, or motion values at their call sites.

### Glass text tokens

Blurred glass is a special contrast environment because it samples live scene
art behind the glyphs. Text on the liquid-glass material uses
`--text-on-glass` for primary labels, names, titles, and spoken copy, and
`--text-on-glass-muted` for secondary copy. Accent, essence, points, and
production-bridge violet tokens are not text colors on glass. Purple remains a
valid object glow, border, economy mark, and primary-action surface; glyphs on
blurred glass stay white or warm near-white.

### Material stacking on glass

Grouped content sits directly inside GlassPanel, GlassDialog, InfoCard, or
another liquid-glass surface. It uses spacing wrappers, subtle dividers, and
glass text tokens; nested controls use their named `onGlass` treatment.
Tangible game objects such as `GameCard` may rest there as distinct objects
without an additional container behind them.

### Token groups documented in the Tokens section

The `/cumulus` Tokens section renders every token as a specimen, grouped by kind
and name-prefix family.

- **Color** — surface / text / accent / resource / status / category
  roles (`--surface-*`, `--text-*`, `--accent`, `--energy`, `--danger`,
  `--tide-earthy`, `--scrim`, …). The Dream Atlas material is the `--atlas-*`
  family: journey field, edges, node halos, and badges. Atlas components consume
  that family directly. CardView's component-owned `--cv-*` variables carry its
  frame geometry and material as one local rendering contract.
- **Typography** — the type scale (`--t-*`) and font roles (`--font-ui` = Inter,
  `--font-title` = EB Garamond, `--font-rules-text` = Fira Sans Condensed,
  `--font-numeral` = Anton, `--font-meta` = JetBrains Mono).
- **Corner radius** — five canonical roles: `--radius-compact` (8px),
  `--radius-control` (14px), `--radius-panel` (18px), `--radius-large` (24px),
  and `--radius-pill` (fully round).
- **Spacing** — the `--space-*` scale + touch-floor tokens (`--safe-*`, 44pt
  floor), used directly.
- **Iconography** — Boxicons v3.0.8 **filled** (`bxf bx-*`) is the set, already
  self-hosted in the app; the game's resource marks; and the two pinned
  fallbacks (`fa-solid fa-hammer`, already present, and `ph-fill ph-cards`, the
  one self-hosted Phosphor fill face).
- **Motion** — `--ease-dream / -out / -in-out`, `--dur-fast/base/slow`,
  `--press-scale` (0.9), and the `--motion-object-travel`
  material-continuity token.
- **Glow** — `--glow-accent / -soft / -strong`, `--glow-gold`, `--glow-danger`,
  `--glow-text`, plus the cool purple-black elevation shadows and insets.

---

## 5. Docgen + demo harness (the core engine)

The programmatic props table and the interactive controls are driven by **one**
metadata source.

- A build/dev script (and optional dev Vite plugin) runs
  **`react-docgen-typescript`** over `src/cumulus/components/**` and
  `src/cumulus/primitives/**`, emitting `src/cumulus/metadata/cumulus-metadata.json`:
  per prop, its name, type, union members, default, required flag, and JSDoc
  description.
- The **props table** renders from that JSON — never hand-edited.
- The **interactive controls** are auto-generated from the same type info:
  `boolean → toggle`, string-union → segmented control / select, `number →
slider`, `string → text field`, with per-component demo files supplying only
  sample values / default args and any content the types can't infer.
- Regeneration is wired into `scripts/regenerate-assets.sh`.

The design's own `.d.ts` files already carry rich JSDoc (see the prop surfaces
for `GlassButton`, `InfoCard`, `Motes`, and the overlay controls), so the Cumulus
`.tsx` ports carry the same doc comments and the tables come out populated.

### The agent-facing reference (`.llms/skills/cumulus/`)

The [Cumulus helper reference](cumulus_helpers.md) documents the shared art,
atlas-display, card-aspect, and color modules used by product screens and
component adapters.

The same sources project into a second, markdown renderer for coding agents:
`scripts/generate-cumulus-docs.mjs` (`npm run cumulus-docs`, wired into
`regenerate-assets.sh` right after `cumulus-metadata`) statically extracts each
registry entry's prose (blurb, callout, usage snippets — the demo files keep
these as plain string literals so no module execution is needed) and joins it
with the docgen props to write one reference file per component to
`.llms/skills/cumulus/components/<id>.md`, plus a component index spliced into
`.llms/skills/cumulus/SKILL.md` between its GENERATED COMPONENT INDEX markers.
It also renders `.llms/skills/cumulus/tokens.md`, the token reference:
cumulus-tokens.css is parsed with the shared `parseCssTokens` library, deduped
last-wins, and grouped by role family with each declaration's trailing
same-line comment carried through as its note.
The generator sweeps stale `.md` files from the components output directory,
so a renamed or unregistered component's reference disappears with it.
SKILL.md itself is hand-authored (design philosophy, customization rules,
token-usage policy, pointers); everything factual about a component or token
flows from the generator.

---

## 6. Page structure

Table of contents, then:

1. **Introduction / Design Philosophy** — condensed from the design's governing
   principles: _material continuity_ (objects persist and travel, never fade in;
   the four entities — cards, dreamsigns, essence, Dream Avatars — always obey
   it), _the legibility ladder_ (render on the media with `.hud-outline`; group
   related info in a `GlassPanel`; never a scrim/wash/vignette), _always in
   motion_ (tangible entities float; readout chrome may rest), the _popup rule_
   (named semantic sources register strict content with the one
   `CumulusRoot` coordinator; hover/focus reveal on desktop and touch intent
   reveals on mobile; the group is pointer-transparent), and the content voice
   (second-person, literary;
   Title Case titles, uppercase-mono eyebrows; no emoji). The verbose README
   framing is cut.
2. **Primitives** — color, typography, corner radius, spacing, iconography,
   motion, glow (§4).
3. **Components** — each with interactive demo, programmatic props table, and a
   full-screen mockup detail page (§7).

The documentation chrome itself dogfoods Cumulus tokens (color, type, spacing,
radius) but stays deliberately restrained so the components are the focus.

---

## 7. Component roster & per-component strategy

| Component                    | Location      | Strategy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design tokens                | `primitives/` | Import values from Claude Design `tokens/*.css` → `cumulus-tokens.css` + generated `tokens.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Pressable** / `usePress`   | `primitives/` | Import from Claude Design (the one press-feedback primitive; scale-down `--press-scale` 0.9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **GlassButton**              | `components/` | The labeled liquid-glass action. `accent` serves primary and commit actions, `default` serves secondary actions, and `danger` serves destructive actions; `placement` selects the media or nested-glass recipe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **ResourceChip**             | `components/` | Import from Claude Design (value + filled-Boxicon mark, tight pairing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **InfoCard**                 | `components/` | Strict visual content variants (`object`, `fullBleed`, `atlasReveal`, `icon`, `tide`, `text`) rendered by named sources through the root coordinator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **SegmentedControl**         | `components/` | Import from Claude Design                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Motes**                    | `components/` | Import from Claude Design (atmospheric particle layer; `warm`/`violet`/`dreamscape` tint; sanctioned particle opacity animation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **JourneyStatusBar**         | `components/` | Import from Claude Design (the transparent bottom HUD)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **GlassPanel**               | `components/` | The content-sized persistent title/body/footer container over scene or atmospheric backgrounds. Its liquid-glass recipe (`backdrop-filter` blur/saturate + specular gradient + inset rim/wash + drop shadow) lives in `glassSurfaceStyle` (`src/cumulus/internal/glass-surface.ts`), shared by GlassPanel, InfoCard, GlassDialog, IconButton, GlassButton, and SpeechBubble. Floating panels always hug their rendered slots and cannot consume decorative height; edge rails and full-bleed gallery frames own their bounded height through the frame contract. CardGalleryPanel composes it. The deck viewer and GlassPanel's full-bleed gallery frame use the 80%-black `--scrim-gallery` alpha overlay; floating GlassPanels use glass. |
| **GameCard**                 | `components/` | UUID-backed card source deriving its reading copy and ordered glossary secondaries; activation remains available independently of reading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **RulesText**                | `components/` | Canonical rules renderer with inline named `GlossaryTerm` sources and `PipBadge` marks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Dreamsign**                | `components/` | UUID-backed collectible source deriving object/text primary content and glossary secondaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **SiteNode**                 | `components/` | UUID-backed site source deriving its icon InfoCard and activation availability                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Atlas Node / Edge / Defs** | `components/` | AtlasNode owns its placed source, strict scene primary, Dreamsign/site/affiliation secondaries, and activation; edges and shared SVG definitions compose the map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Interaction model (input-adaptive reveal)

One coordinator contract is expressed through whichever gesture is native to
the device. Named components supply semantic content; screens supply no reveal
mechanics:

- **Desktop / fine pointer:** hover and keyboard focus reveal immediately;
  mouse-down applies measured press feedback. `Escape` suppresses the current
  focus visit.
- **Touch / coarse pointer:** a 30ms intent filter reveals while the 300ms
  activation boundary distinguishes tap from hold. Scroll, drag, movement,
  release, route, resize, and orientation changes dismiss centrally.
- **All inputs:** one pointer-transparent group contains exactly one primary and
  a priority prefix of ordered secondaries. Visual-viewport, safe-area,
  truncation, press-in-place, accessibility, portal ownership, and diagnostics
  belong to `CumulusRoot`.

### Demo & mockup content

Real content wherever it exists: Card / RulesText demos render from real card
UUIDs (a small curated, deterministic set); Atlas / SiteNode from the existing
`__test-helpers__/atlas-fixtures` generators; mockups compose Cumulus components
around that real content and reuse production art already served from `public/`.
Baked sample fixtures are used only where no real source exists. Full-screen
mockups render at `100vw × 100vh`, responsive to the real viewport.

---

## 8. Build-phase subagent orchestration

Each **imported** component is built by its own subagent (per the request "run a
subagent to analyze the component in detail and write the local version"). Each
subagent:

1. reads the component's design source via the `claude_design` MCP
   (`DesignSync get_file`): the `.jsx`, the `.d.ts`, and the `.card.html`
   specimen (which carries inline usage notes);
2. writes the Cumulus `.tsx` under `src/cumulus/components/` (or `primitives/`),
   preserving the JSDoc so docgen populates the table, and complying with the
   isolation allowlist;
3. writes the component's demo file (sample args + any mockup content).

Ports of production components (GameCard, RulesText, Atlas) and unifications
(Dreamsign, SiteNode) are done directly against the local source plus the design
reference, not by a from-scratch subagent rewrite.

---

## 9. Testing & verification

- `npm run review` selects changed-file lint (including the fail-closed import-boundary rule
  `no-external-ui-imports`; the visual-value rules that require named tokens in
  product UI; and the strict-API rule `no-escape-hatch-props`, which errors when a
  `components/` `*Props` type re-opens an escape hatch — a `style`/`className`
  member, a `CSSProperties`-typed prop, a DOM-attribute `extends`/intersection,
  or an index signature), incremental typecheck when applicable, and related
  tests. `npm run review:full` supplies repository-wide CI and release
  validation.
- The screen wiring layer (§2) is lint-enforced too: the `thin-adapters` rule keeps
  `src/screens/cumulus_adapters/*Adapter.tsx` wiring-only (one exported `*Adapter`
  component, no module-level helpers/tables/exported types, Cumulus imports
  limited to `src/cumulus/screens/`), backed by a `max-lines` ceiling on adapter
  files as the tripwire against logic hiding inside the component body; and a
  `no-restricted-imports` block keeps `*-view-model.ts` builder modules pure
  (no `react`, no `src/state`). What lint cannot judge — whether a view-model
  is genuinely display-shaped, whether a mapping rule is semantically right —
  stays a review concern.
- The strict-API contract is enforced twice: `no-escape-hatch-props` catches it
  in the styled `components/` source at authoring time, and
  `scripts/cumulus-strict-api.contract.test.mjs` re-derives the resolved public
  surface of both `components/` and `primitives/` via react-docgen and asserts
  no component exposes a `style`/`className`/`CSSProperties` prop of its own, and
  that no glyph / color / image / filter prop resolves to a bare `string`
  (each must be a named value type — `Glyph`, `CumulusColor`, `ArtRef`,
  `MediaFilter`) — so a hatch that leaks in through an aliased type still fails
  the build.
  `primitives/` is excluded from the source rule because a mechanism like
  `Pressable` deliberately forwards every DOM prop; react-docgen filters those
  inherited props out, so the contract test still holds it to no _own_ hatch.
- Unit tests for the non-visual machinery: the docgen metadata extractor, the
  hash router, and every Cumulus ESLint rule (`eslint-rules/*.test.ts`).
- Moved production components keep their existing tests (tests move with them —
  e.g. `CardView`, `RulesText`).
- No brittle snapshot or token-value tests on demos (tokens and design data
  change freely). Visual verification is browser QA via `agent-browser` against
  a dev server on a non-default port (e.g. `--port 5174`), including
  representative full-screen evidence for the changed responsive branches and
  interaction states. Routine visual work uses the screenshot budget in
  `qa_tooling.md`; new screens, major redesigns, and high-risk rendering changes
  expand only for distinct risks and receive a final cold review. Isolate the
  `agent-browser` session (`--session <name>`), assert `location.href` +
  `window.innerWidth`, inspect `window.__caps`, and measure objective geometry
  before screenshots — see
  [qa_tooling.md](qa_tooling.md).

---

## 10. Dependencies

- **Runtime:** none new. Glass surfaces are CSS-only; icons reuse the self-hosted
  Boxicons 3 + Font Awesome, plus one self-hosted Phosphor fill face for
  `ph-cards`.
- **Dev:** `react-docgen-typescript` for the docgen step.

---

## 11. Phasing

- **Phase 0 — Scaffold.** `/cumulus` route + `CumulusApp` shell + hash router; token
  pipeline (`cumulus-tokens.css` + generated `tokens.ts`); the ESLint boundary
  zone; the docgen script skeleton; Introduction + Primitives sections.
- **Phase 1 — Simple primitives/components.** Pressable, ResourceChip, GlassButton,
  SegmentedControl, Motes, TideDisc, and the economy/spec helpers — one subagent
  each; interactive demos + auto props tables live.
- **Phase 2 — Surfaces and coordinator.** Strict InfoCard variants, GlassPanel,
  JourneyStatusBar, and the application-root entity-reveal coordinator.
- **Phase 3 — Move production in.** RulesText (+ `card-text`, `PipBadge`) then
  GameCard (+ closure) into Cumulus; re-point external call sites; move their
  tests; typecheck between moves.
- **Phase 4 — Atlas & unifications.** Port AtlasNode / AtlasEdge / AtlasEdgeDefs
  / `atlas-display`; unify Dreamsign and SiteNode through InfoCard.
- **Phase 5 — Mockups & polish.** Full-screen mockup detail page per component;
  finalize docgen regeneration in `regenerate-assets.sh`; QA sweep.

---

## 12. Prerequisites & open items

- Design-system access is authorized via `/design-login`; the `claude_design`
  MCP `get_file` calls used in Phase 1+ require it to remain authorized.
- Tide concepts use `tide-spec` for the palette/types and `TideDisc` for the
  circular reveal surface.
