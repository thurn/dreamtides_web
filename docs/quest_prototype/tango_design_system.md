# Tango Design System — Implementation Plan

`localhost/tango` is a self-contained documentation endpoint for **Tango**, the
ground-up redesign of the quest-prototype UI. It combines the redesigned system
authored in Claude Design
(`claude.ai/design/p/10fa84a8-cdc2-4e83-80af-47df24d1c247`) with the components
the code already ships, and presents them as one browseable, interactive
reference.

This document is the plan. It is written to be built in phases; each phase ends
green on `npm run lint`, `npm run typecheck`, and `npm test`.

---

## 1. Goals

- A `/tango` route that documents the Tango system: a table of contents, an
  Introduction / Design Philosophy section, a Primitives section, and a
  Components section.
- Every component gets: an **interactive demo**, a **programmatic props table**
  (never hand-maintained), and a click-through **full-screen mockup** detail
  page showing the component in a realistic UI.
- Tango becomes the *home* of the shared UI component library. Reused
  components (game card, rules text, atlas pieces) move into `src/tango/`, and
  the rest of the app imports them from there.
- Real content is shown wherever it exists (real card UUIDs, real atlas
  fixtures), not faked placeholders.
- **Strict, controlled component APIs.** Every component exposes a small,
  strongly-typed surface — enumerated variants, sizes, and named content slots
  — and nothing else. Components never accept a raw `className`, an inline
  `style` object, or an arbitrary corner radius / padding / color / filter /
  scale token override. A prop that carries a value which is not free-form text
  takes a *named* value, not a string: a color is a `TangoColor` (a palette
  role, or a `` `#${string}` `` hex for a genuinely data-driven one), a glyph is
  a `Glyph` from the icon registry, a piece of art is an `ArtRef` the component
  resolves to a URL itself, and a media filter / image crop
  is a named union. These value types live in `src/tango/primitives/`
  (`color.ts`, `glyph.ts`, `art.ts`, `media.ts`). **Adding arbitrary token
  customization to a component is never acceptable** — those escape hatches let
  a caller silently drift from the system. When a screen needs to size or
  position a component, it wraps the
  component in its own element (layout is the caller's concern; the component's
  fixed appearance is the system's). Adding a *new strict prop* — one more
  enumerated variant — is fine when you are confident no existing variant can
  express the need; widening an existing prop into an open value is not. When in
  doubt, match how the other screens solve it rather than inventing a knob.

Tango works on **any screen**. Components are token-scaled and responsive; the
mockup pages render full-screen against the real viewport (sized via browser
DevTools device emulation), not inside an in-app device frame.

---

## 2. Architecture & the isolation boundary

All Tango code lives under `src/tango/`:

```
src/tango/
  primitives/     tokens, Pressable, icon helper
  components/     every documented component
  assets/         bundled UI art (button sprite, one Phosphor font face)
  docs/           the /tango page: shell, router, sections, per-component demos + mockups
  metadata/       generated tango-metadata.json (docgen output)
```

**The boundary rule.** Code under `src/tango/` may reference only:

- other code under `src/tango/`,
- `node_modules`,
- an explicit allowlist of **non-UI** infrastructure: `src/data`, `src/types`,
  `src/logging`, `src/runtime` (extended only as specific non-UI modules prove
  necessary).

Tango may **never** import UI code from elsewhere in the project. The dependency
is inverted: Tango is a leaf that everything else depends on for UI, and depends
on nobody for UI.

**Enforcement (fail-closed allowlist).** An ESLint import zone
(`import/no-restricted-paths`, or `eslint-plugin-boundaries`) declares that files
in `src/tango/**` may resolve imports only to `src/tango/**` plus the allowlist
above; every other path under `src/` is denied **by default**. A future UI
directory can never silently leak in — it fails closed. This rule runs as part
of `npm run lint`, so the architecture is a lint gate, not a convention.

**Moving components in.** When a production component is reused, it and its
component-specific helper closure physically **move** into `src/tango/`, and
external call sites re-point their imports to Tango. Component-specific `.ts`
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
  `RulesText`, `PipBadge`, `useCardTermPopover`, `useFitText`.
- `RulesText` → `card-text`, `PipBadge`.
- `AtlasNode` → `atlas-display`.
- `DreamscapeSiteNode` → `dreamscape-scatter`.

### Product screens & the `?ui=` migration toggle

The quest app's screens migrate into Tango one at a time behind a `?ui=` toggle
(`runtimeConfig.uiVariant`, default `tango`). Two roles keep the isolation
boundary intact while a screen owns live quest state:

- A **Tango screen** (`src/tango/screens/*.tsx`) is pure: it renders from a
  view-model and reports events through callbacks, importing only Tango and the
  allowlisted infra. It holds no `useQuest()`, no mutations, no navigation. Its
  root carries `className="tango"` so the semantic tokens resolve (the adapter
  mounts it outside any other `.tango` subtree). Screens inherit every strict
  rule — semantic tokens only (they are absent from the `no-primitive-tokens` and
  `no-hardcoded-values` exemptions), no raw interactive elements, no escape-hatch
  props — so `npm run lint` is what proves a migrated screen conforms.
- An **adapter** (`src/screens/tango/*Adapter.tsx`, *outside* Tango) owns
  `useQuest()`, builds the view-model, wires callbacks to mutations, and renders
  the Tango screen. External→Tango imports are allowed, so the adapter freely
  imports both.

`ScreenRouter` consults `src/screens/tango/registry.tsx` (`tangoScreenFor` /
`tangoSiteScreenFor`): under `?ui=tango` it renders the registered adapter for a
migrated screen and falls back to the legacy screen when the resolver returns
null, so the app stays fully navigable throughout the migration. `?ui=legacy`
forces the legacy screen everywhere. The end state registers every screen, then
deletes the legacy `src/screens/` tree. The first migrated screen is Dreamcaller
selection (`QuestStartScreen`).

---

## 3. Routing

`/tango` is a new pathname branch in `src/main.tsx`, matching the existing
standalone-route pattern (`/editor`, `/dreamsigns`, `/images`): it lazy-imports
`TangoApp` and renders it.

Navigation **inside** `/tango` uses a tiny custom **hash router** (no new
dependency, no server rewrite config):

- `/tango` — overview + table of contents.
- `/tango#/<component>` — a component page (demo + props table).
- `/tango#/<component>/mockup` — the full-screen mockup detail page.

Hashes are deep-linkable and the browser back button works. This deliberately
avoids path sub-routes, which would require Vite `historyApiFallback` and
Firebase Hosting rewrites.

---

## 4. Token pipeline

The design ships tokens as CSS custom properties (`tokens/colors.css`,
`effects.css`, `spacing.css`, `typography.css`, `fonts.css`, `base.css`). Tango
adopts these values verbatim.

- **Source of truth:** a `src/tango/primitives/tango-tokens.css` scoped under a
  `.tango` root class, holding the custom properties.
- **Typed mirror:** a generated `src/tango/primitives/tokens.ts` of typed
  constants for TS/inline-style use and for the demo harness. Generation is
  wired into `scripts/regenerate-assets.sh`.

### Two tiers: primitive and semantic

The token sheet is organized into two tiers, and this distinction governs what
UI code is allowed to reference.

- **Primitives — `--primitive-*`.** A primitive names a raw *value*: a point on
  a color ramp (`--primitive-violet-500`), a step on the radius scale
  (`--primitive-radius-lg`), a font face (`--primitive-font-sans`), a weight.
  Primitives are the raw material the semantic layer is built from.
- **Semantic tokens — everything else.** A semantic token names a *use*:
  `--surface-card`, `--text-primary`, `--accent`, `--radius-control`,
  `--font-ui`. Each resolves through a primitive (or a literal where no ramp step
  fits), so the whole system re-skins by editing the primitive layer alone.

**Write UI code against semantic tokens — never a primitive.** A semantic token
describes what it is *for*, not what its value *is*; that indirection is the
entire point of the token system. Primitives may be referenced **only** inside
`src/tango/primitives/` (where the semantic layer is defined) and
`src/tango/components/` (leaf components that occasionally need a raw ramp step
with no semantic role, e.g. a specific tide-tone). Referencing a `--primitive-*`
token anywhere else — a doc page, a demo, a mockup, any future product screen —
is a lint error (see the `no-primitive-tokens` rule in §9). No exceptions.

The spacing scale (`--space-*`), the layout constants, the type scale (`--t-*`),
the motion tokens, and the elevation/glow shadows carry no `--primitive-` prefix:
they are sanctioned semantic scales, role/intent named, and UI code uses them
directly.

### Token groups documented in the Tokens section

The `/tango` Tokens section renders every token as a specimen, split into a
**Semantic Tokens** tier (shown first, the vocabulary UI code writes against) and
a **Primitives** tier below it, each grouped by kind and name-prefix family.

- **Color** — semantic surface / text / accent / resource / status / category
  roles (`--surface-*`, `--text-*`, `--accent`, `--energy`, `--danger`,
  `--tide-earthy`, `--scrim`, …) over the primitive ramps (void / plum / violet /
  gold / energy / spark / ember / sap / …). The Shared Canonical Layer (`--text`,
  `--surface`, `--line`, `--gold`) and the production bridge (`--dt-*`,
  `--color-*`, `--cv-*`) are semantic re-exports.
- **Typography** — the type scale (`--t-*`) and font roles (`--font-ui` = Inter,
  `--font-title` = EB Garamond, `--font-rules-text` = Fira Sans Condensed,
  `--font-numeral` = Anton, `--font-meta` = JetBrains Mono) over the primitive
  font faces (`--primitive-font-*`) and weights (`--primitive-weight-*`).
- **Corner radius** — semantic roles `--radius-inset / -control / -card / -panel
  / -sheet / -hero / -pill / -popover` over the primitive scale
  (`--primitive-radius-xs … -2xl`, `-pill`, `-card`, `-popover`).
- **Spacing** — the `--space-*` scale + touch-floor tokens (`--safe-*`, 44pt
  floor), used directly.
- **Iconography** — Boxicons v3.0.8 **filled** (`bxf bx-*`) is the set, already
  self-hosted in the app; the game's resource marks; and the two pinned
  fallbacks (`fa-solid fa-hammer`, already present, and `ph-fill ph-cards`, the
  one self-hosted Phosphor fill face).
- **Motion** — `--ease-dream / -out / -in-out`, `--dur-fast/base/slow`,
  `--press-scale` (0.94), and the two material-continuity tokens
  (`--motion-object-travel`, `--motion-container-transform`).
- **Glow** — `--glow-accent / -soft / -strong`, `--glow-gold`, `--glow-danger`,
  `--glow-text`, plus the cool purple-black elevation shadows and insets.

---

## 5. Docgen + demo harness (the core engine)

The programmatic props table and the interactive controls are driven by **one**
metadata source.

- A build/dev script (and optional dev Vite plugin) runs
  **`react-docgen-typescript`** over `src/tango/components/**` and
  `src/tango/primitives/**`, emitting `src/tango/metadata/tango-metadata.json`:
  per prop, its name, type, union members, default, required flag, and JSDoc
  description.
- The **props table** renders from that JSON — never hand-edited.
- The **interactive controls** are auto-generated from the same type info:
  `boolean → toggle`, string-union → segmented control / select, `number →
  slider`, `string → text field`, with per-component demo files supplying only
  sample values / default args and any content the types can't infer.
- Regeneration is wired into `scripts/regenerate-assets.sh`.

The design's own `.d.ts` files already carry rich JSDoc (see the prop surfaces
for `Button`, `InfoCard`, `TidePill`, `Motes`), so the Tango `.tsx` ports carry
the same doc comments and the tables come out populated.

### The agent-facing reference (`.llms/skills/tango/`)

The same sources project into a second, markdown renderer for coding agents:
`scripts/generate-tango-docs.mjs` (`npm run tango-docs`, wired into
`regenerate-assets.sh` right after `tango-metadata`) statically extracts each
registry entry's prose (blurb, callout, usage snippets — the demo files keep
these as plain string literals so no module execution is needed) and joins it
with the docgen props to write one reference file per component to
`.llms/skills/tango/components/<id>.md`, plus a component index spliced into
`.llms/skills/tango/SKILL.md` between its GENERATED COMPONENT INDEX markers.
It also renders `.llms/skills/tango/tokens.md`, the semantic-token reference:
tango-tokens.css parsed with the shared `parseCssTokens` lib and deduped
last-wins, `--primitive-*` filtered out (that tier is tango-internal), the
rest grouped by role family with each declaration's trailing same-line
comment carried through as its note.
The generator sweeps stale `.md` files from the components output directory,
so a renamed or unregistered component's reference disappears with it.
SKILL.md itself is hand-authored (design philosophy, customization rules,
token-usage policy, pointers); everything factual about a component or token
flows from the generator.

---

## 6. Page structure

Table of contents, then:

1. **Introduction / Design Philosophy** — condensed from the design's governing
   principles: *material continuity* (objects persist and travel, never fade in;
   the four entities — cards, dreamsigns, essence, Dreamcallers — always obey
   it), *the legibility ladder* (render on the media with `.hud-outline`; group
   related info in a `GroupPanel`; never a scrim/wash/vignette), *always in
   motion* (tangible entities float; readout chrome may rest), the *popup rule*
   (one InfoCard contract — hover-to-reveal on a fine pointer, hold-to-reveal on
   touch — no close button, no scrim, anchored to the pointer or trigger), and
   the content voice (second-person, literary;
   Title Case titles, uppercase-mono eyebrows; no emoji). The verbose README
   framing is cut.
2. **Primitives** — color, typography, corner radius, spacing, iconography,
   motion, glow (§4).
3. **Components** — each with interactive demo, programmatic props table, and a
   full-screen mockup detail page (§7).

The documentation chrome itself dogfoods Tango tokens (color, type, spacing,
radius) but stays deliberately restrained so the components are the focus.

---

## 7. Component roster & per-component strategy

| Component | Location | Strategy |
| --- | --- | --- |
| Design tokens | `primitives/` | Import values from Claude Design `tokens/*.css` → `tango-tokens.css` + generated `tokens.ts` |
| **Pressable** / `usePress` | `primitives/` | Import from Claude Design (the one press-feedback primitive; scale-down `--press-scale` 0.94) |
| **Button** | `components/` | Import from Claude Design; beveled purple 9-patch (`Button_Purple.png`), `border-image` 9-slice; sizes `sm/md/lg` (`lg` = taller commit); props `full`, `icon`, `cost`, `frameScale` |
| **ResourceChip** | `components/` | Import from Claude Design (value + filled-Boxicon mark, tight pairing) |
| **InfoCard** (+ press-reveal engine) | `components/` | Import from Claude Design; variants `object/hero/icon/text`; statics `PressPopover`, `PressInfo`, `usePressReveal`, `anchorRect`, `setRevealDelay`, `SITE_DISC` |
| **SegmentedControl** | `components/` | Import from Claude Design |
| **StatTile** | `components/` | Import from Claude Design |
| **TidePill** | `components/` | Import from Claude Design; **keep the name** (tides are an active concept) |
| **Motes** | `components/` | Import from Claude Design (atmospheric particle layer; `warm`/`violet` tint; the one sanctioned opacity animation) |
| **QuestStatusBar** | `components/` | Import from Claude Design (the transparent bottom HUD) |
| **GroupPanel** | `components/` | **Port the design's CSS-only** liquid-glass pane (`backdrop-filter` blur/saturate + specular gradient + inset rim/wash + drop shadow). No third-party library — the source ships no dependency |
| **GameCard** | `components/` | Move production `CardView` + its closure into Tango, clean up for reuse (the design's `GameCard` is itself a port of `CardView`) |
| **RulesText** | `components/` | Move production `RulesText` + `card-text` + `PipBadge` into Tango |
| **Dreamsign** | `components/` | Unify local (`DreamsignHoverCard` / `DreamsignArtTile`) with the design's `Dreamsign`; route its touch-down preview through `InfoCard` (`object` variant) |
| **SiteNode** | `components/` | Unify local `DreamscapeSiteNode` with the design's `SiteNode`; route its press-reveal through `InfoCard` |
| **Atlas Node / Edge / Defs** | `components/` | Port local `AtlasNode` + `atlas-display` (+ the edge connectors and their shared SVG `<defs>`: gradients / markers / flow). Clean up for reuse. Local atlas is authoritative, not the design's reconstruction |

### Interaction model (input-adaptive reveal)

One reveal contract, expressed through whichever gesture is native to the
device. Neither input is the primary one:

- **Desktop / fine pointer:** hover reveals the `InfoCard`; mouse-down applies
  the `Pressable` scale-down (0.94). Nothing reveals on press.
- **Touch / coarse pointer:** touch-down reveals the `InfoCard` (and scales);
  release dismisses. No long-press, no close button, no scrim, anchored to the
  touch.

### Demo & mockup content

Real content wherever it exists: Card / RulesText demos render from real card
UUIDs (a small curated, deterministic set); Atlas / SiteNode from the existing
`__test-helpers__/atlas-fixtures` generators; mockups compose Tango components
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
2. writes the Tango `.tsx` under `src/tango/components/` (or `primitives/`),
   preserving the JSDoc so docgen populates the table, and complying with the
   isolation allowlist;
3. writes the component's demo file (sample args + any mockup content).

Ports of production components (GameCard, RulesText, Atlas) and unifications
(Dreamsign, SiteNode) are done directly against the local source plus the design
reference, not by a from-scratch subagent rewrite.

---

## 9. Testing & verification

- `npm run lint` (including the fail-closed import-boundary rule
  `no-external-ui-imports`; the token-tier rule `no-primitive-tokens`, which
  errors on any `--primitive-*` reference outside `primitives/` + `components/`;
  and the strict-API rule `no-escape-hatch-props`, which errors when a
  `components/` `*Props` type re-opens an escape hatch — a `style`/`className`
  member, a `CSSProperties`-typed prop, a DOM-attribute `extends`/intersection,
  or an index signature), `npm run typecheck`, and `npm test` stay green.
- The strict-API contract is enforced twice: `no-escape-hatch-props` catches it
  in the styled `components/` source at authoring time, and
  `scripts/tango-strict-api.contract.test.mjs` re-derives the resolved public
  surface of both `components/` and `primitives/` via react-docgen and asserts
  no component exposes a `style`/`className`/`CSSProperties` prop of its own, and
  that no glyph / color / image / filter prop resolves to a bare `string`
  (each must be a named value type — `Glyph`, `TangoColor`, `ArtRef`,
  `MediaFilter`) — so a hatch that leaks in through an aliased type still fails
  the build.
  `primitives/` is excluded from the source rule because a mechanism like
  `Pressable` deliberately forwards every DOM prop; react-docgen filters those
  inherited props out, so the contract test still holds it to no *own* hatch.
- Unit tests for the non-visual machinery: the docgen metadata extractor, the
  hash router, and every Tango ESLint rule (`eslint-rules/*.test.ts`).
- Moved production components keep their existing tests (tests move with them —
  e.g. `CardView`, `RulesText`).
- No brittle snapshot or token-value tests on demos (tokens and design data
  change freely). Visual verification is browser QA via `agent-browser` against
  a dev server on a non-default port (e.g. `--port 5174`), including
  full-screen mockups at multiple emulated viewports.

---

## 10. Dependencies

- **Runtime:** none new. GroupPanel is CSS-only; icons reuse the self-hosted
  Boxicons 3 + Font Awesome; the only new asset is one self-hosted Phosphor fill
  face for `ph-cards` and the bundled `Button_Purple.png`.
- **Dev:** `react-docgen-typescript` for the docgen step.

---

## 11. Phasing

- **Phase 0 — Scaffold.** `/tango` route + `TangoApp` shell + hash router; token
  pipeline (`tango-tokens.css` + generated `tokens.ts`); the ESLint boundary
  zone; the docgen script skeleton; Introduction + Primitives sections.
- **Phase 1 — Simple primitives/components.** Pressable, ResourceChip, Button,
  SegmentedControl, StatTile, TidePill, Motes — one subagent each; interactive
  demos + auto props tables live.
- **Phase 2 — Press engine & surfaces.** InfoCard + `usePressReveal` (with the
  input-adaptive hover/press model), GroupPanel (CSS port), QuestStatusBar.
- **Phase 3 — Move production in.** RulesText (+ `card-text`, `PipBadge`) then
  GameCard (+ closure) into Tango; re-point external call sites; move their
  tests; typecheck between moves.
- **Phase 4 — Atlas & unifications.** Port AtlasNode / AtlasEdge / AtlasEdgeDefs
  / `atlas-display`; unify Dreamsign and SiteNode through InfoCard.
- **Phase 5 — Mockups & polish.** Full-screen mockup detail page per component;
  finalize docgen regeneration in `regenerate-assets.sh`; QA sweep.

---

## 12. Prerequisites & open items

- Design-system access is authorized via `/design-login`; the `claude_design`
  MCP `get_file` calls used in Phase 1+ require it to remain authorized.
- Tides are an active concept, so `TidePill` keeps its name.
