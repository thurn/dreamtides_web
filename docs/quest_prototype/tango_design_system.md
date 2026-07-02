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

Tango generalizes the source system (authored mobile-only, 390×844) to **any
screen**. Components are token-scaled and responsive; the mockup pages render
full-screen against the real viewport (sized via browser DevTools device
emulation), not inside an in-app device frame.

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
  `.tango` root class, holding the imported custom properties.
- **Typed mirror:** a generated `src/tango/primitives/tokens.ts` of typed
  constants for TS/inline-style use and for the demo harness. Generation is
  wired into `scripts/regenerate-assets.sh`.

Token groups documented in the Primitives section:

- **Color** — the base ramps (void / plum / violet / gold / energy / spark /
  ember / sap) and the semantic aliases (`--accent`, `--surface-*`, `--text-*`,
  resource roles, category colors). The Shared Canonical Layer (`--text`,
  `--surface`, `--line`, `--gold`, `--font-*`) is shown as the one set surfaces
  converge on.
- **Typography** — EB Garamond (serif titles/names), Inter (functional), Fira
  Sans Condensed (rules text), Anton (stat-orb numerals), JetBrains Mono
  (eyebrows), plus the wordmark treatment.
- **Corner radius** — `--r-xs … --r-2xl`, `--r-pill`, `--r-card`, `--r-popover`.
- **Spacing** — the spacing scale + touch-floor tokens (`--safe-*`, 44pt floor).
- **Iconography** — Boxicons v3.0.8 **filled** (`bxf bx-*`) is the set, already
  self-hosted in the app; the game's resource marks; and the two pinned
  fallbacks (`fa-solid fa-hammer`, already present, and `ph-fill ph-cards`, the
  one new glyph — self-host the single Phosphor fill face).
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

---

## 6. Page structure

Table of contents, then:

1. **Introduction / Design Philosophy** — condensed from the design's governing
   principles: *material continuity* (objects persist and travel, never fade in;
   the four entities — cards, dreamsigns, essence, Dreamcallers — always obey
   it), *the legibility ladder* (render on the media with `.hud-outline`; group
   related info in a `GroupPanel`; never a scrim/wash/vignette), the *popup rule
   R-17* (touch-down reveals, release dismisses, no close button, no scrim,
   anchored to the pointer), and the content voice (second-person, literary;
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

### Interaction model (input-adaptive press-reveal)

The design's engine is touch-first; Tango generalizes it to any input:

- **Desktop / fine pointer:** hover reveals the `InfoCard`; mouse-down applies
  the `Pressable` scale-down (0.94). Nothing reveals on press.
- **Touch / coarse pointer:** touch-down reveals the `InfoCard` (and scales);
  release dismisses (design rule R-17: no long-press, no close button, no
  scrim, anchored to the touch).

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

- `npm run lint` (including the new fail-closed boundary rule), `npm run
  typecheck`, and `npm test` stay green.
- Unit tests for the non-visual machinery: the docgen metadata extractor and the
  hash router.
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
- `CLAUDE.md` currently states "Tides no longer exist"; tides are an active
  concept again (hence `TidePill` keeps its name). Reconciling that doc is
  tracked separately from this plan.
