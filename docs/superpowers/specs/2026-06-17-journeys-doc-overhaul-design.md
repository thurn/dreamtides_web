# Journeys Doc Overhaul → Prototype Implementation Spec

**Date:** 2026-06-17
**Source of truth:** `docs/journeys/journeys.md` (rewritten 2026-06-17)
**Mode:** Full doc in one pass. Subagent execution in a dedicated git worktree.

This spec adapts the rewritten journeys design doc into the existing React/Vite
journey prototype. It is *not* a greenfield build: most sites, the draft engine,
purge, essence, dreamsigns, save/load, and logging already exist. The work is to
replace the atlas model, introduce the named-dreamscape / Dream Guide /
affiliation layer, remap a few sites, add stubs for three brand-new sites, and
tune the economy.

---

## 1. Goals

1. Replace the radial binary-tree atlas with the doc's **fixed 7-layer** atlas.
2. Replace procedural biomes with **11 named dreamscapes** (Firstlight Meadow +
   10) carrying Dream Guides and affiliations.
3. Implement **Dream Guides** (10 NPCs tied to site types) and **Home
   Specialties** (enhanced-in-home behavior).
4. Implement **affiliations** as real IDF similarity-weighted reweighting of all
   random card/dreamsign draws plus opponent-deck bias.
5. Remap existing sites to doc names; build the three doc sites that map cleanly
   onto existing code (Dreamsign Bazaar, Dreamsign Revelation, Augury);
   stub the three genuinely new sites (Random Site, Gamble, Exploration).
6. Apply economy tweaks (starting essence 200, purge `30 + 5·N·(N+1)`, single
   currency, Nightmare folded into Purge).
7. Keep everything tunable via TOML per the Golden Rule.

## 2. Locked decisions

- **Full doc in one pass.**
- **Affiliations use real IDF similarity** now, reusing the tides4 /
  `tides-similarity` machinery.
- **Three sites map to existing code** and are built properly: Dreamsign Bazaar
  (Shop variant), Dreamsign Revelation (existing dreamsign offering), Augury
  (renamed Dream Journey).
- **Three sites are stubs** this pass: Random Site, Gamble, Exploration —
  registered as site types with guides + atlas icons + a minimal placeholder
  screen so the atlas/dreamscape system is complete.
- **Currency consolidation:** fold the existing "Omens" currency into **essence**
  (single currency per the doc). Dreamsign Bazaar and shop restocks cost essence.
- **Nightmare:** retire the separate "Cleanse" site; Purge selects and removes Nightmare
  (cheaply / free) alongside ordinary cards.
- **Dream Avatar selection:** only change is **starting essence default → 200**
  (keep the per-Dream Avatar `startingEssence` override). **Do not modify pool
  construction in any other way.** Signature cards remain defined in data but are
  not shown in the selection UI (current behavior).
- **Placeholder assets:** game-icons.net glyphs (already referenced in the doc) +
  simple 2D framing and basic CSS/framer-motion transitions. **No 3D models or
  animation choreography.** The doc's elaborate 3D "UI" descriptions are
  aspirational and out of scope.
- **QA tooling:** this is a React/Vite prototype, so manual QA uses
  `agent-browser` against a local Vite server (not Unity/`abu`). The doc's
  Unity/`abu` QA section is aspirational for the shipping game.

## 3. Current-state gap summary

Already implemented and reused as-is: Dream Avatar selection (3 offered, tides4
preview, seed mint), essence economy + cap, draft pool (`draftPoolCopiesByCard`
/ `remainingCopiesByCard`), Purge + pricing, Essence site, Card Shop,
Transfiguration, Duplication, Dreamsign offering/draft/reward, battle
integration, save/load (`saved-journeys/`), logging (`src/logging.ts`), screen
routing (`src/components/ScreenRouter.tsx`).

Major gaps this spec closes:

| System | Current | Target |
| --- | --- | --- |
| Atlas | radial binary tree, procedural biomes, 3 node states | fixed 7-layer columns, non-crossing connections, 5 node states, reveal-by-layer |
| Dreamscapes | procedural biome names | 11 named dreamscapes with guide and affiliation |
| Dream Guides | none | 10 named NPCs + dialog + home specialties |
| Affiliations | none | IDF similarity reweighting on all draws + opponent bias |
| Sites | DreamJourney/Cleanse/Omens | Augury rename, Dreamsign Bazaar, Nightmare→Purge, single currency, 3 stubs |
| Economy | essence 250, purge `30+8N(N+1)` | essence 200, purge `30+5N(N+1)` |

## 4. Key file map (anchors)

- Types: `src/types/journey.ts`, `src/types/content.ts`
- Atlas gen: `src/atlas/atlas-generator.ts`; biomes `src/data/biomes.ts`
- Atlas UI: `src/screens/AtlasScreen.tsx`, `src/components/AtlasNode.tsx`,
  `src/screens/DreamscapeScreen.tsx`, `src/components/SiteCard.tsx`
- State: `src/state/journey-context.tsx`, `src/state/journey-state-actions.ts`,
  `src/state/saved-journeys.ts`
- Routing: `src/components/ScreenRouter.tsx`
- Draft: `src/draft/draft-engine.ts`, `src/draft/pool/`
- Purge: `src/purge/purge-pricing.ts`
- Dreamsigns: `src/dreamsign/dreamsign-pool.ts`
- Sites screens: `src/screens/*Screen.tsx`, `src/journey_v2/`
- Selection: `src/screens/JourneyStartScreen.tsx`,
  `src/data/dream-avatar-selection.ts`
- Asset pipeline: `scripts/setup-assets.mjs`
- Data: `data/*.toml`

## 5. New TOML data (configured per the Golden Rule)

All new files compile to JSON via `scripts/setup-assets.mjs` (kebab→camel) and
load through `fetch()` like existing assets.

- `data/dreamscapes.toml` — 11 dreamscapes. Fields: `id`, `name`,
  `guide-id` (null for Firstlight), `signature-site`,
  `affiliation-id` (null for Firstlight). Firstlight Meadow is
  flagged as the fixed starter with an explicit fixed-site list.
- `data/dream_guides.toml` — 10 guides. Fields: `id`, `name`,
  `home-dreamscape-id`, `site-type`, `dialog` (per-event lines),
  `home-specialty` (structured enhancement config).
- `data/affiliations.toml` — affiliations. Fields: `id`, `name`,
  `signature-cards` (UUID list — small curated sets authored so the IDF math is
  real), `weight-strength` (reweighting strength), `opponent-bias-strength`.
- `data/atlas.toml` — `layer-specs` (per-layer width or width
  range), `connection-average`, `bonus-reveal-distribution` (0–2 weights),
  `repeat-discourage-strength`, `known-dreamsign` config (`max-per-atlas` = 2,
  `eligible-layers` = 3–6, `placement-probability`, early-reveal bias).
- Optional `data/sites.toml` if per-site counts/prices are not already
  inline (shop item counts, restock cost 50, market item count 3, etc.).

> All numeric values above are TOML-tunable and treated as subject to change.
> Tests must derive fixtures from live data, never hardcode dreamscape/guide
> names or assert arbitrary content limits.

## 6. Workstreams and tasks

Each task below is sized for a single subagent. **Every task ends with a manual
QA pass** (§7) plus `npm run lint && npm run typecheck && npm test`. A task is
not "done" until its QA screenshots are captured and inspected for the listed
acceptance criteria.

### Wave 0 — Foundation (serial; one agent owns shared contracts)

**T0.1 — Data + types foundation.**
- Author all new TOML files (§5) with placeholder-but-real content for 11
  dreamscapes, 10 guides, affiliations (curated UUID signature sets),
  atlas.
- Extend `scripts/setup-assets.mjs` to compile them and add loaders mirroring
  existing `load*` helpers.
- Extend `src/types/journey.ts` and `src/types/content.ts` with all new shared
  types: layer-based `DreamAtlas` (layers, nodes, connections), 5-state node
  enum (`unrevealed | revealedLocked | available | completed | forgone`),
  dreamscape/guide/affiliation content types, known-dreamsign carrier fields,
  new `SiteType` members (`Augury`, `DreamsignBazaar`, `RandomSite`,
  `Gamble`, `Exploration`), retire `Cleanse`/Omens from the type surface.
- **Manual QA:** load the app, confirm it still boots to the Dream Avatar select
  screen with no console errors after the type/data changes (compile-only QA;
  behavior arrives in later tasks). Landscape + portrait.
- **Acceptance:** TOML compiles to JSON; loaders return typed data; `npm run
  typecheck` passes; app boots clean.

> Wave 0 is the collision bottleneck. No Wave 1 task starts until T0.1 lands so
> later agents share one type/data contract.

### Wave 1 — Parallel subsystems (depend on T0.1)

**T1.1 — Atlas generator rewrite.**
- Rewrite `src/atlas/atlas-generator.ts` to the fixed 7-layer model: roll layer
  widths from `atlas`, place nodes per column, wire non-crossing forward
  connections (monotonic backbone guaranteeing ≥1 forward and ≥1 backward edge
  per node, then random extra edges toward the average), assign named
  dreamscapes by weighted draw with adjacency-rejection (lazy per reveal),
  implement reveal logic (current + 2-ahead, boss always revealed, 0–2 bonus
  reveals from layers 5–6), and known-dreamsign carrier placement (≤2, layers
  3–6, biased toward an early-revealed node).
- Reconstruction-grade logging: log layer widths, every node assignment with
  weights, connection set, reveal events, known-dreamsign placement.
- Retire `src/data/biomes.ts` usage.
- **Manual QA:** generate an atlas; verify 7 columns, boss node visible at start,
  0–2 bonus reveals, connections do not cross, no node assigned adjacent to a
  copy of itself across several regenerations (use the existing "Regenerate
  Atlas" debug button). Landscape + portrait.
- **Acceptance:** integration tests assert structural invariants (7 layers,
  reachability, non-adjacency, ≤2 known dreamsigns); QA screenshots show correct
  shape.

**T1.2 — Dreamscape site generation.**
- Update site-composition generation: mandatory sites (one Battle last; home
  guide's signature site **enhanced**; Purge in layers 2–3; Draft per the layer
  table), fill from the other 9 guides' signature sites + Essence with
  layer-varying weights, known-dreamsign node → **Dreamsign Reward** fill slot.
  Firstlight Meadow uses its fixed list (2 Draft, Dreamsign Revelation choice-of-3,
  Purge, Battle-to-10).
- Affiliation metadata attached to each generated dreamscape for downstream
  draws (consumed by T1.3).
- Logging of site composition per dreamscape with the layer + weights used.
- **Manual QA:** enter several dreamscapes across layers; confirm site mix
  matches the rules (battle last, purge in early layers, draft counts by layer),
  Firstlight matches its fixed list. Landscape + portrait.
- **Acceptance:** tests assert composition rules per layer; QA confirms in-app.

**T1.3 — Affiliations (real IDF).**
- Add `affiliationWeight(card, affiliation)` reusing the existing IDF /
  card-similarity analysis (`tides-similarity` / tides4 infra). Apply the
  reweighting to **every** random draw inside an affiliated dreamscape: draft
  offers, shop stock, dreamsign draws, transfiguration/duplication candidates,
  Augury reward cards.
- Bias the **opponent's deck** at a dreamscape's Battle toward the affiliation.
- Logging: for a sampled draw, log the affiliation, top weighted candidates, and
  resulting pick so behavior is reconstructable.
- **Manual QA:** in an affiliated dreamscape, open draft/shop and confirm
  affiliated cards visibly over-appear vs. a neutral dreamscape across rerolls;
  confirm any card can still appear. Landscape + portrait.
- **Acceptance:** test asserts reweighting shifts probabilities (statistical,
  data-derived, not hardcoded card names); does not change pool membership.

**T1.4 — Site remap, new sites, currency + Nightmare consolidation, economy.**
- Rename **Dream Journey → Augury** across types/state/screens/logging
  (two-reward choice, pure upside).
- **Dreamsign Bazaar**: Shop variant selling dreamsigns for essence (3 items +
  50-essence restock), reusing Shop component + dreamsign pool.
- **Dreamsign Revelation**: existing dreamsign offering (1 random or choice-of-3;
  home = always a choice).
- **Stubs:** Random Site, Gamble, Exploration — site type + guide + atlas
  icon + minimal placeholder screen (guide framing, a "coming soon" body, a
  close/continue that completes the site). Wired into generation and routing.
- **Currency:** fold Omens into essence everywhere (shop dreamsign purchase,
  restocks). Remove Omens from state/UI.
- **Nightmare:** retire Cleanse; extend Purge to select + remove Nightmare cheaply/free.
- **Economy:** starting essence default **200**; purge formula
  `30 + 5·N·(N+1)` in `src/purge/purge-pricing.ts`; restock 50; cap 500.
- **Manual QA:** visit Augury (renamed), Dreamsign Bazaar (buy with
  essence + restock), Dreamsign Revelation (single + choice), each stub screen,
  and Purge (remove an ordinary card + a Nightmare card, prices match new formula).
  Confirm no Omens UI remains. Landscape + portrait.
- **Acceptance:** per-site behavior verified in-app; purge pricing test matches
  the new formula; no Omens references remain.

**T1.5 — Economy/selection tweak: starting essence 200.**
- Set the default starting essence to 200 in the appropriate default
  (`createDefaultState` / dream avatar default), keeping per-Dream Avatar override.
- **Do not touch pool construction.**
- **Manual QA:** start a journey; confirm the selection screen shows 200 (or the
  Dream Avatar's override) and the run begins with that essence. Landscape +
  portrait.
- **Acceptance:** essence value correct on screen and in state. *(May be merged
  into T1.4 if the same agent owns economy; kept separate here for clarity.)*

### Wave 2 — Integration layer (depends on Wave 1)

**T2.1 — Atlas + dreamscape UI.**
- Update `AtlasScreen.tsx` / `AtlasNode.tsx` to render 7 columns, all 5 node
  states (incl. revealed-locked + forgone styling), always-visible connections,
  always-revealed boss, known-dreamsign corner badge, "You started here" on
  Firstlight, hover/preview showing guide + affiliation + home specialty.
- Update `DreamscapeScreen.tsx` to show the guide framing (top in portrait, side
  in landscape) and enhanced-site emphasis.
- **Manual QA:** full visual sweep of the atlas across reveal progression (start,
  after layer 1, mid-run): node states render distinctly, connections don't
  cross/overlap text, boss always shown, known-dreamsign badge visible, layout
  stable and uncluttered. Dreamscape screen shows guide + enhanced site.
  Landscape + portrait, both viewport sizes.
- **Acceptance:** all five states visually distinct; no clipping/overlap; QA
  screenshots attached.

**T2.2 — Battle opponent decks.**
- Build the opponent deck by simulating a journey with the opponent Dream Avatar's
  tides + the dreamscape affiliation bias to the equivalent progress point;
  opponents carry one dreamsign from the run midpoint onward.
- Logging of opponent-deck construction (dream avatar, sim depth, affiliation,
  resulting decklist summary).
- **Manual QA:** start battles at an early and a late dreamscape; confirm the
  pre-battle opponent display shows the dream avatar + (late only) a dreamsign,
  and the deck looks affiliation-leaning. Landscape + portrait.
- **Acceptance:** opponent strength scales with progress; midpoint+ opponents
  show a dreamsign; QA confirms pre-battle display.

**T2.3 — End-to-end integration tests + full QA sweep.**
- Integration tests against the real journey state-action / JourneyView interface
  covering: journey start → atlas → dreamscape → each site → battle → reward →
  next layer → final boss → victory/defeat. Match battle-mode integration
  philosophy; no unit tests.
- Full manual QA playthrough of a complete journey in both orientations; inspect
  the captured error buffer for render errors, unhandled rejections, console
  errors.
- **Acceptance:** green test suite; clean QA playthrough with screenshots at each
  screen; zero console errors in the buffer.

## 7. Manual QA protocol (applies to every task)

Run for **every** task, not only T2.3. Per AGENTS.md:

1. Start a QA Vite server on a non-default port:
   `npm run dev -- --port 5174` (capture the PID at launch).
2. Drive with `/opt/homebrew/bin/agent-browser` (fallback `npx agent-browser`).
3. Exercise the task's feature through the normal player workflow.
4. Test at **landscape/desktop** and **mobile/portrait** viewports.
5. Inspect the captured error buffer for render errors, unhandled rejections,
   console errors.
6. Verify: controls usable, expected state changes occur, text/controls fully
   visible, spacing stable, no clipping/overlap, screen visually coherent.
7. Tear down **only** the QA server you started (by PID, or
   `pkill -f "vite --port 5174"`). **Never** run a broad `pkill -f vite` — it
   kills the developer's 5173 server.

To reach journey screens for QA, use the existing debug affordances: the Create
Game "Load Journey" dropdown / `?loadJourney=...`, the HUD "Load Journey" menu, and the
atlas "Regenerate Atlas" debug button.

## 8. Logging requirements

Every generation/selection algorithm must log enough to answer "reconstruct what
this did in a given production game": atlas layer widths + node assignments +
weights + connections + reveals + known-dreamsign placement (T1.1), per-dreamscape
site composition + layer + weights (T1.2), affiliation reweighting samples
(T1.3), opponent-deck construction (T2.2). Logs go through `src/logging.ts`
(`logEvent`) and land in `logs/journey-log.jsonl`.

## 9. Testing philosophy

Integration tests against the real JourneyView / journey state-action interface,
mirroring battle mode. **No unit tests.** Tests must be resilient to TOML data
edits: derive fixtures from live loaded data, never hardcode dreamscape/guide
names, card UUIDs, or arbitrary content-size limits. Assert structural invariants
and rules, not specific data values.

## 10. Subagent execution plan (waves + dependencies)

```
Wave 0 (serial):      T0.1  data + types foundation
                        │
Wave 1 (parallel):    T1.1 atlas gen   T1.2 dreamscape gen   T1.3 affiliations
                      T1.4 sites/currency/economy   T1.5 starting essence
                        │ (T1.1–T1.5 are independent given T0.1's shared
                        │  types/data: T1.2 reads affiliation ids from
                        │  dreamscapes.toml; T1.3 builds the reweighting fn that
                        │  draw sites call. Coordinate only via T0.1 contracts.)
Wave 2 (parallel):    T2.1 atlas/dreamscape UI   T2.2 opponent decks
                        │
                      T2.3 integration tests + full QA sweep
```

All work happens in one git worktree created via the `/wt` flow. Each task
commits with a detailed message and pushes immediately per AGENTS.md.

## 11. Out of scope / explicitly deferred

- 3D models, character animations, and the doc's choreographed UI motion.
- Full mechanics for Random Site, Gamble, Exploration (stubs only).
- Final-boss unique abilities/cards beyond reusing the existing battle path
  (see `docs/journeys/bosses.md` for future work).
- Meta-progression unlocks (`docs/journeys/meta_progression.md`).
- Any pool-construction algorithm change beyond the essence default.
- Real art assets (placeholders only).
```
