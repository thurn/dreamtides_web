# Quests Doc Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the rewritten `docs/quests/quests.md` into the React/Vite quest prototype: fixed 7-layer Dream Atlas, 11 named dreamscapes with Dream Guides + home specialties, real IDF affiliation reweighting, site remap + three stubs, and economy tweaks.

**Architecture:** Additive type/data foundation first (Wave 0), then parallel subsystem rewrites that share those contracts (Wave 1), then the UI + battle + end-to-end integration layer (Wave 2). The atlas data model migrates from a radial tree to layered columns; the type switch is contained to Task 2 (generator + minimal compile-fix UI) with the visual rework in Task 8.

**Tech Stack:** TypeScript, React, Vite, framer-motion, Vitest (integration-style), TOML→JSON asset pipeline (`scripts/setup-assets.mjs`), `agent-browser` for manual QA.

**Source spec:** `docs/superpowers/specs/2026-06-17-quests-doc-overhaul-design.md`. Read it before starting; this plan does not restate its rationale.

---

## Manual QA Procedure (run in the QA step of EVERY task)

This is the operational procedure referenced by each task's QA step. Per `AGENTS.md`:

1. Start a QA Vite server on a non-default port and capture its PID:
   `npm run dev -- --port 5174` (the developer's own server may be on 5173 — never touch it).
2. Drive the browser with `/opt/homebrew/bin/agent-browser` (fallback `npx agent-browser`).
3. Reach quest screens via existing debug affordances: Create Game "Load Quest" dropdown / `?loadQuest=<name>`, the HUD "Load Quest" menu, and the atlas "Regenerate Atlas" debug button. Saved quests live in `saved-quests/`.
4. Exercise the task's feature through the normal player workflow.
5. Test at **landscape** (`agent-browser` desktop viewport, e.g. 1440×900) **and portrait** (e.g. 390×844).
6. Inspect the captured error buffer for render errors, unhandled rejections, and console errors. Zero tolerance: a task with console errors in its feature path is not done.
7. Verify the task's listed acceptance targets: controls usable, expected state changes occur, text/controls fully visible, spacing stable, no clipping/overlap, screen visually coherent at both viewports.
8. Capture a screenshot at each viewport and note what was verified.
9. Tear down **only** the server you started: kill the captured PID, or `pkill -f "vite --port 5174"`. **Never** run a bare `pkill -f vite`.

Each task below names its **QA targets** (what to drive + what to confirm). "Run the Manual QA Procedure" means execute steps 1–9 with those targets.

## Standard verification (run before every commit)

```bash
npm run lint && npm run typecheck && npm test
```

In a fresh worktree run `npm install` first (`node_modules` is not committed).

## Testing philosophy (applies to all tasks)

Integration tests against the real quest state-action / generator interface, mirroring battle mode. **No unit tests.** Tests must be resilient to TOML edits: derive fixtures from live loaded data (`buildTestCorpusCards`, `makeTestPoolContext` in `src/__test-helpers__/pool-context.ts`), never hardcode dreamscape/guide names, card UUIDs, or arbitrary content-size limits. Assert structural invariants and rules. Atlas tests follow the existing `src/atlas/atlas-generator.test.ts` style: loop a generator N times and assert the property holds every time.

---

# Wave 0 — Foundation (serial; must land before Wave 1)

## Task 1: Data + types foundation (additive only)

This task is **additive**: it adds new TOML, loaders, types, and `SiteType` members, but removes nothing (no `Cleanse`/`omens`/`DreamJourney` removal, no `DreamAtlas` reshape). That keeps every existing consumer compiling. The destructive switches happen in Tasks 2 and 5.

**Files:**
- Create: `data/tabula/dreamscapes.toml`, `data/tabula/dream_guides.toml`, `data/tabula/affiliations.toml`, `data/tabula/atlas_config.toml`
- Create: `src/data/dreamscapes.ts` (loader + types re-export), `src/data/atlas-config.ts` (loader)
- Modify: `scripts/setup-assets.mjs` (parse + transform + write the four new files; add params to `setupAssets({...})` mirroring `dreamsignTomlPath`)
- Modify: `src/types/quest.ts` (add `SiteType` members; add new content + atlas-v2 types as *new* interfaces)
- Modify: `src/types/content.ts` if dreamscape/guide/affiliation content types belong with other content types (follow existing placement)
- Test: `src/data/dreamscapes.test.ts`, `src/atlas/atlas-layout.test.ts` (types-only smoke is unnecessary; see steps)

- [ ] **Step 1: Author the four TOML files.**

Author placeholder-but-real content:
- `dreamscapes.toml`: 11 `[[dreamscapes]]` entries from the doc's dreamscape list (Firstlight Meadow + the 10 named ones). Fields per the spec §5: `id`, `name`, `aesthetic`, `guide-id` (omit/empty for Firstlight), `signature-site`, `affiliation-id` (omit/empty for Firstlight), `site-icon`. Firstlight carries `is-starter = true` and a `fixed-sites` list (`["Draft","Draft","DreamsignRevelation","Purge","Battle"]`).
- `dream_guides.toml`: 10 `[[guides]]` from the doc's Home Specialties table — `id`, `name`, `home-dreamscape-id`, `site-type`, `dialog` (one or two placeholder lines), `home-specialty` (a free-form description string sourced from the doc's enhancement column).
- `affiliations.toml`: one `[[affiliations]]` per distinct affiliation in the doc — `id`, `name`, `signature-cards` (a small curated list of 3–8 real card UUIDs from `data/tabula/cards_v2.toml` that fit the affiliation theme), `weight-strength` (default e.g. `2.0`), `opponent-bias-strength` (default e.g. `2.0`).
- `atlas_config.toml`: `layer-specs` (array of 7 entries, each `{min, max}` width: `1,2,3,{3,4},{3,5},{3,5},1`), `connection-average = 2.0`, `bonus-reveal = {min=0, max=2, mode=1}`, `repeat-discourage-strength`, and `[known-dreamsign] max-per-atlas = 2, eligible-layers = [3,4,5,6], placement-probability, early-reveal-bias`.

Affiliation→signature-card curation: pick UUIDs by reading `data/tabula/cards_v2.toml` for cards matching the theme (e.g. Warriors → cards whose text/subtype fit warriors). These are placeholder curations; the IDF math (Task 4) is what must be real.

- [ ] **Step 2: Write the failing loader/shape test.**

In `src/data/dreamscapes.test.ts`, assert the **structural contracts** a downstream task relies on (catches malformed data + a broken transform): every dreamscape has a non-empty `id` and `name`; exactly one dreamscape has `isStarter === true`; every non-starter dreamscape's `guideId` resolves to a guide in `dream_guides.toml`; every guide's `homeDreamscapeId` resolves to a dreamscape; every non-starter `affiliationId` resolves to an affiliation; every affiliation's `signatureCards` are non-empty and every UUID exists in the loaded card database. Load via the new loaders against the compiled JSON (run `npm run setup-assets` in the test's `beforeAll` or rely on the build step). Do **not** assert specific names or counts beyond "exactly one starter".

This is a referential-integrity test, not a table-mirror: it catches dangling guide/affiliation/card references introduced by future data edits.

- [ ] **Step 3: Run it; verify it fails** (loaders/JSON missing). `npm test -- src/data/dreamscapes.test.ts`. Expected: FAIL (module/JSON not found).

- [ ] **Step 4: Extend the asset pipeline.**

In `scripts/setup-assets.mjs`: add `dreamscapesTomlPath`, `dreamGuidesTomlPath`, `affiliationsTomlPath`, `atlasConfigTomlPath` params to `setupAssets({...})` (mirror `dreamsignTomlPath`), add `transformDreamscape`/`transformGuide`/`transformAffiliation`/`transformAtlasConfig` functions (kebab→camel via the existing `kebabToCamel`), and `writeFileSync` JSON bundles to `public/` (`dreamscapes-data.json`, `dream-guides-data.json`, `affiliations-data.json`, `atlas-config-data.json`). Follow the existing dreamsign write path exactly.

- [ ] **Step 5: Add loaders.**

In `src/data/dreamscapes.ts` and `src/data/atlas-config.ts`, add async `loadDreamscapes()`, `loadDreamGuides()`, `loadAffiliations()`, `loadAtlasConfig()` that `fetch()` the JSON and return typed data, mirroring `loadDreamsignTemplates()`.

- [ ] **Step 6: Add the shared types (additive).**

In `src/types/quest.ts`:
- Extend the `SiteType` union with the new members (keep all existing members for now):

```ts
export type SiteType =
  | "Battle" | "Draft" | "Shop" | "SpecialtyShop"
  | "DreamsignOffering" | "DreamsignDraft" | "DreamJourney"
  | "Purge" | "Essence" | "Transfiguration" | "Duplication"
  | "Reward" | "Cleanse"
  // Added this pass:
  | "DreamAugury" | "DreamsignMarket" | "DreamsignRevelation"
  | "TemptingOffer" | "Gamble" | "TemporalFork";
```

- Add the layered atlas node state and content types as **new** declarations (the live `DreamAtlas`/`DreamscapeNode` are reshaped in Task 2, not here):

```ts
export type AtlasNodeState =
  | "unrevealed" | "revealedLocked" | "available" | "completed" | "forgone";

export interface DreamscapeContent {
  id: string;
  name: string;
  aesthetic: string;
  guideId: string | null;
  signatureSite: SiteType;
  affiliationId: string | null;
  siteIcon: string;
  isStarter: boolean;
  fixedSites?: SiteType[];
}

export interface DreamGuideContent {
  id: string;
  name: string;
  homeDreamscapeId: string;
  siteType: SiteType;
  dialog: string[];
  homeSpecialty: string;
}

export interface AffiliationContent {
  id: string;
  name: string;
  signatureCards: string[];
  weightStrength: number;
  opponentBiasStrength: number;
}

export interface AtlasLayerSpec { min: number; max: number; }
export interface AtlasConfig {
  layerSpecs: AtlasLayerSpec[];
  connectionAverage: number;
  bonusReveal: { min: number; max: number; mode: number };
  repeatDiscourageStrength: number;
  knownDreamsign: {
    maxPerAtlas: number; eligibleLayers: number[];
    placementProbability: number; earlyRevealBias: number;
  };
}
```

- [ ] **Step 7: Run the loader test; verify it passes.** Run `npm run setup-assets` then `npm test -- src/data/dreamscapes.test.ts`. Expected: PASS.

- [ ] **Step 8: Standard verification.** `npm run lint && npm run typecheck && npm test`. Expected: PASS (additive change breaks nothing).

- [ ] **Step 9: Manual QA.** QA targets: with no behavior change yet, confirm the app still boots to the Dream Avatar select screen and a quest loads from a saved quest with zero console errors after the type/data/pipeline changes. Run the Manual QA Procedure at both viewports.

- [ ] **Step 10: Commit.**

```bash
git add data/tabula scripts/setup-assets.mjs src/data/dreamscapes.ts src/data/atlas-config.ts src/types/quest.ts src/data/dreamscapes.test.ts public
git commit -m "feat(quests): add dreamscape/guide/affiliation/atlas-config data + types"
```

---

# Wave 1 — Parallel subsystems (each depends only on Task 1)

> Tasks 2–6 are independent given Task 1's contracts. If executed by parallel subagents in one worktree, serialize the commits and re-run standard verification after each merge.

## Task 2: Atlas generator rewrite (fixed 7-layer) + atlas-type migration

This task owns the `DreamAtlas`/`DreamscapeNode` reshape. It updates the generator, all non-UI consumers, and applies a **minimal** compile-fix to `AtlasScreen`/`AtlasNode` so the build stays green; the visual rework is Task 8.

**Files:**
- Modify: `src/types/quest.ts` (reshape `DreamscapeNode` + `DreamAtlas`)
- Rewrite: `src/atlas/atlas-generator.ts` (generation)
- Modify: `src/state/quest-state-actions.ts` (`startQuestFromDreamAvatar`, `updateQuestAtlas`, `completeQuestSite`, `canVisitSite` — atlas advance/reveal logic)
- Modify: `src/screens/AtlasScreen.tsx`, `src/components/AtlasNode.tsx` (compile-fix only)
- Modify: `src/data/biomes.ts` (demote to aesthetic flavor or remove usage)
- Test: `src/atlas/atlas-generator.test.ts` (rewrite invariants)

- [ ] **Step 1: Reshape the atlas types.**

In `src/types/quest.ts` replace `DreamscapeNode.status` with `state: AtlasNodeState` and add layer/connection/known-dreamsign fields; reshape `DreamAtlas` to be layer-oriented:

```ts
export interface DreamscapeNode {
  id: string;
  layer: number;            // 0..6
  indexInLayer: number;
  dreamscapeId: string | null;  // null while unrevealed
  biomeName: string;        // display name once revealed ("" while unrevealed)
  biomeColor: string;
  sites: SiteState[];
  position: { x: number; y: number };
  state: AtlasNodeState;
  enhancedSiteType: SiteType | null;
  forwardIds: string[];
  backwardIds: string[];
  knownDreamsignId: string | null;
}

export interface DreamAtlas {
  layers: string[][];       // node ids per layer, index 0..6
  nodes: Record<string, DreamscapeNode>;
  startingNodeId: string;
  bossNodeId: string;
  currentNodeId: string | null;
  knownDreamsignCarrierIds: string[];
}
```

`edges` is removed; connections derive from `forwardIds`. `position` stays (the layout computes column coordinates).

- [ ] **Step 2: Write the failing generator invariant tests.**

Rewrite `src/atlas/atlas-generator.test.ts` to assert, over 50+ generated atlases (loop + `resetAtlasGenerator()` each iteration), the **structural invariants** from the spec — each catches a distinct generation bug:
- **Layer shape:** exactly 7 layers; layer 0 width 1 (starter), layer 6 width 1 (boss); widths within `atlas_config` ranges. *(Catches off-by-one / wrong layer count.)*
- **Reachability:** every node (except boss) has ≥1 forward edge and every node (except starter) has ≥1 backward edge; the boss is reachable from the start via forward edges. *(Catches orphans/dead-ends from the backbone rule.)*
- **Non-crossing:** for any two forward edges within a layer gap, they do not cross given node ordering by `indexInLayer`. *(Catches the no-cross constraint — the core geometric rule. Encode the standard interval-crossing predicate: edges (a→b),(c→d) cross iff (a<c and b>d) or (a>c and b<d).)*
- **Non-adjacency:** no revealed node shares its `dreamscapeId` with a directly connected node. *(Catches the adjacency-rejection redraw.)*
- **Known dreamsigns:** ≤2 carriers; carriers only in layers 3–6; each carrier's `knownDreamsignId` is unique and drawn from the run dreamsign pool. *(Catches the hard cap + eligibility.)*
- **Reveal at start:** boss node revealed; starter revealed; bonus reveals between 0 and 2. *(Catches reveal-window bugs.)*

Use live data via the test helpers; do not assert specific dreamscape names.

- [ ] **Step 3: Run; verify failure.** `npm test -- src/atlas/atlas-generator.test.ts`. Expected: FAIL (old generator shape).

- [ ] **Step 4: Rewrite the generator.**

Rewrite `src/atlas/atlas-generator.ts`:
- `generateInitialAtlas(...)`: roll layer widths from `AtlasConfig.layerSpecs`; create nodes per column with computed `position` (x by layer, y spread within column); wire non-crossing forward connections (monotonic backbone guaranteeing reachability, then add random non-crossing edges toward `connectionAverage`); place ≤2 known-dreamsign carriers (layers 3–6, biased so one lands among the start-reveal set); set initial `state` per node (starter `available`, boss + start-reveals `revealedLocked`/`revealed`, rest `unrevealed`).
- Dreamscape assignment is **lazy at reveal** (a `revealNodeDreamscape(node)` helper does the weighted draw with the repeat-discourage weight + adjacency rejection). Layer 0 is always the starter dreamscape; layer 6 always the boss.
- Replace `generateNewNodes`/`regenerateAtlasForProgress` semantics with reveal-by-layer: completing layer 1 reveals layers 2–3; completing layer N reveals layer N+2.
- Reconstruction logging via `logEvent` (spec §8): layer widths, each node assignment with the draw weights, connection set, reveal events, known-dreamsign placement.
- Keep `siteTypeIcon`/`siteTypeName`/`siteTypeDescription`/`enhancedSiteDescription` (extend their maps for new site types) and `previewSiteTypes`/`revealedAtlasSite` adapted to the new node shape.

`assignBiome` becomes aesthetic-only flavor or is removed; the visible dreamscape name now comes from `DreamscapeContent.name`.

- [ ] **Step 5: Update non-UI consumers.**

In `src/state/quest-state-actions.ts`, update `startQuestFromDreamAvatar` (build the atlas via the new generator), `updateQuestAtlas`, `completeQuestSite` (advance `currentNodeId`, mark completed node, set its forward targets `available`, mark sibling layer nodes `forgone`, trigger reveal of layer N+2), and `canVisitSite` to the new node shape.

- [ ] **Step 6: Minimal compile-fix to atlas UI.**

In `AtlasScreen.tsx`/`AtlasNode.tsx`, do the *smallest* change that compiles and renders without crashing against the new shape: render nodes by `position`, draw lines from `forwardIds`, map `state` to existing styling (treat `revealedLocked`/`forgone` as dimmed for now). No new visuals — Task 8 owns those.

- [ ] **Step 7: Run generator tests + standard verification.** Expected: PASS.

- [ ] **Step 8: Manual QA.** QA targets: load a quest, open the atlas, and use "Regenerate Atlas" 5+ times. Confirm 7 visible columns, a single boss node visible from the start, the starter node marked, connections render without crossing, and the app does not crash on regenerate or on completing a site (advance through one layer). Run the Manual QA Procedure at both viewports.

- [ ] **Step 9: Commit.**

```bash
git add src/types/quest.ts src/atlas src/state/quest-state-actions.ts src/screens/AtlasScreen.tsx src/components/AtlasNode.tsx src/data/biomes.ts
git commit -m "feat(quests): fixed 7-layer atlas generation with non-crossing connections + reveal-by-layer"
```

## Task 3: Dreamscape site generation (named dreamscapes, guides, mandatory/fill)

**Files:**
- Modify: `src/atlas/atlas-generator.ts` (`generateSiteComposition`, `additionalSiteTypesForLevel`)
- Modify: `src/data/dreamscapes.ts` (helpers mapping dreamscape→guide→signature site)
- Test: `src/atlas/atlas-generator.test.ts` (composition invariants — extend the file)

- [ ] **Step 1: Write failing composition invariant tests.**

Assert over many generations per layer (catches each composition rule):
- Exactly one `Battle` site and it is **last** in the ordering. *(Catches battle-placement/visit-order bug.)*
- The home guide's **signature site** is present and `isEnhanced === true`. *(Catches missing/unenhanced signature.)*
- `Purge` present in layers 1–2 (0-indexed: the doc's layers 2 & 3), absent-as-mandatory later but allowed in fill. *(Catches early-deck-thinning guarantee.)*
- Draft count by layer matches the doc table (2 for layers 1–2, 1 for 3–4, 0 for 5–6). *(Catches the draft-by-layer table.)*
- Total sites within 3–6; each non-Draft site type appears ≤1×, Draft ≤2×. *(Catches dedup + range.)*
- A known-dreamsign carrier node contains exactly one `DreamsignReward`/`Reward` fill site. *(Catches carrier→reward wiring.)*
- Firstlight Meadow yields exactly its fixed list, no enhancement, no fill. *(Catches the starter special-case.)*

Derive the per-layer expectations from `atlas-config`/doc constants loaded at test time, not hardcoded magic numbers where avoidable.

- [ ] **Step 2: Run; verify failure.** Expected: FAIL.

- [ ] **Step 3: Implement composition.**

Update `generateSiteComposition(layer, dreamscapeContent, context)` to: place mandatory sites (Battle last; home signature enhanced; Purge layers 0-indexed 1–2; Draft per layer table), then fill from the **other 9 guides' signature sites + Essence** with layer-varying weights (Transfiguration/Duplication weighted up later, per doc), respecting the ≤1×/Draft≤2× dedup and 3–6 total. If the node carries a known dreamsign, consume one fill slot with the Dreamsign Reward site. Firstlight returns its `fixedSites`. Log composition (layer, weights, chosen sites) per spec §8.

- [ ] **Step 4: Run tests; verify pass + standard verification.** Expected: PASS.

- [ ] **Step 5: Manual QA.** QA targets: enter dreamscapes across early/mid/late layers; confirm Battle is last, the home guide's signature site shows enhanced styling, Purge appears early, draft counts match the table, and Firstlight shows its fixed list. Run the Manual QA Procedure at both viewports.

- [ ] **Step 6: Commit.**

```bash
git add src/atlas/atlas-generator.ts src/data/dreamscapes.ts src/atlas/atlas-generator.test.ts
git commit -m "feat(quests): named-dreamscape site composition with mandatory + fill rules"
```

## Task 4: Affiliations (real IDF reweighting + opponent bias)

**Files:**
- Create: `src/affiliations/affiliation-weights.ts` (the reweighting function)
- Create: `src/affiliations/affiliation-weights.test.ts`
- Modify: draw sites to consult the weight: `src/draft/draft-engine.ts` (`drawAndSpendUniqueCards`), shop stock builder, `src/dreamsign/dreamsign-pool.ts`, transfiguration/duplication candidate pickers, Dream Augury card draw
- Modify: opponent deck builder entry point (battle opponent generation) for affiliation bias — coordinate with Task 9 (opponent bias hook lives here; Task 9 calls it)

- [ ] **Step 1: Write the failing weight-contract test.**

In `affiliation-weights.test.ts` assert the **contract**, using live card data + a real affiliation's signature set:
- `affiliationWeight(card, affiliation)` returns a positive finite number for every card. *(Catches NaN/zero weights that would zero-out the pool.)*
- Cards in the affiliation's signature set (or highly similar by IDF) receive a strictly higher weight than an average unrelated card. *(Catches an inverted/no-op similarity.)*
- Reweighting **never removes membership**: applying weights to a candidate list keeps every candidate selectable (no weight is 0). *(Catches the doc's "any card can still appear" rule.)*
- A statistical property: over many weighted draws from a fixed pool, affiliated cards appear strictly more often than in unweighted draws from the same pool/seed. *(Catches the reweighting not actually biasing draws.)*

Reuse the existing IDF/similarity machinery in `src/draft/pool/variant-idf*.ts` — do not write a new similarity metric. Find the exported similarity/IDF function there and build on it.

- [ ] **Step 2: Run; verify failure.** Expected: FAIL.

- [ ] **Step 3: Implement `affiliationWeight`** in `src/affiliations/affiliation-weights.ts`: compute each candidate's similarity to the affiliation signature set via the existing IDF analysis, map similarity → multiplicative weight using `affiliation.weightStrength`, floor the multiplier above 0. Export a `reweightCandidates(cards, affiliation)` helper returning weight-per-card.

- [ ] **Step 4: Wire the hook into every random draw in an affiliated dreamscape.**

At each draw site, when the current dreamscape has an `affiliationId`, multiply the existing per-card selection weights by `affiliationWeight`. Sites: draft offers (`draft-engine`), shop stock, dreamsign draws, transfiguration + duplication candidate selection, Dream Augury reward cards. Keep the change surgical — multiply into existing weighting, don't restructure the samplers. Add an `opponentAffiliationBias(deckCandidates, affiliation)` export for Task 9 to call.

- [ ] **Step 5: Reconstruction logging.** For a sampled draw, log affiliation id, top weighted candidates + weights, and the resulting pick (spec §8).

- [ ] **Step 6: Run tests + standard verification.** Expected: PASS.

- [ ] **Step 7: Manual QA.** QA targets: in an affiliated dreamscape, open a Draft and a Shop and reroll several times; confirm affiliated cards visibly over-appear vs. a neutral dreamscape, and that varied non-affiliated cards still appear. Run the Manual QA Procedure at both viewports.

- [ ] **Step 8: Commit.**

```bash
git add src/affiliations src/draft/draft-engine.ts src/dreamsign/dreamsign-pool.ts src/shop src/transfiguration src/journey_v2
git commit -m "feat(quests): IDF affiliation reweighting across all dreamscape card draws"
```

## Task 5: Site remap + new sites + currency/banes consolidation + economy

This task owns the destructive removals deferred from Task 1: `DreamJourney`→`DreamAugury` rename, `Cleanse` removal, `omens` removal.

**Files:**
- Modify: `src/types/quest.ts` (remove `Cleanse`, `omens`; rename `DreamJourney`→`DreamAugury` in `SiteType` + `DreamJourneySiteRuntime` discriminant if renamed), `src/types/content.ts`
- Modify: `src/components/ScreenRouter.tsx` (dispatch: rename DreamJourney case; add DreamsignMarket, DreamsignRevelation, and the three stub cases; remove Cleanse case)
- Modify: `src/state/quest-context.tsx` + `src/state/quest-state-actions.ts` (drop `omens`, default essence)
- Modify: `src/shop/*` (Dreamsign Market = essence-priced dreamsign variant; restock 50 essence; drop omen pricing), `src/journey_v2/*` (Dream Augury naming)
- Modify: `src/purge/purge-pricing.ts` (formula constant + doc table), Purge screen (bane selection — fold in Cleanse)
- Create: `src/screens/StubSiteScreen.tsx` (Tempting Offer / Gamble / Temporal Fork placeholder)
- Modify: `src/screens/QuestStartScreen.tsx` only if it reads `omens` (it does not currently)
- Test: `src/purge/purge-pricing.test.ts` (or wherever it lives), site-dispatch coverage in an integration test

- [ ] **Step 1: Purge formula — write the failing snapshot/anchor test.**

Update/author the purge pricing test to pin the doc's economy anchors as a small golden table (these are intentional design anchors, not arbitrary tuning): `purgeVisitCost(2) === 100` (one standard shop card) and `purgeVisitCost(5) === 500` (full default cap), and `purgeMarginalCost(1..5) === [40,60,90,130,180]`. *(Catches a wrong formula constant; the two anchors tie the curve to the economy.)* Run; expect FAIL against the current `8` constant.

- [ ] **Step 2: Change the constant.** In `src/purge/purge-pricing.ts` change `30 + 8 * cardIndex * (cardIndex + 1)` → `30 + 5 * cardIndex * (cardIndex + 1)` and update the doc-comment table to the doc's values (40/100/190/320/500/...). Run; expect PASS.

- [ ] **Step 3: Currency consolidation (omens → essence).** Remove `omens` from `QuestState`, `createDefaultState`, and any mutation; convert shop dreamsign purchases and rerolls to spend **essence** (restock 50 essence). Remove `upcomingOmenDiscounts` omen-specific handling or repoint it to essence per existing `ShopModifiers` semantics. Remove omen UI. `npm run typecheck` drives out every reference.

- [ ] **Step 4: Default essence → 200.** In `createDefaultState` set the default `essence` to 200; keep the per-Dream Avatar `startingEssence` override path intact. **Do not touch pool construction.**

- [ ] **Step 5: Banes into Purge; retire Cleanse.** Remove the `Cleanse` `SiteType` member and its `ScreenRouter` case and screen. Extend the Purge screen to also list bane deck entries (`DeckEntry.isBane`) as selectable for removal, priced cheaply/free per the doc. Anything that previously generated a Cleanse site now relies on Purge.

- [ ] **Step 6: Rename Dream Journey → Dream Augury.** Rename the `SiteType` member, the runtime discriminant/kind if it embeds the name, screen/route labels, and log event names. The underlying merchant/journey mechanics stay; only the name changes. Keep `src/journey_v2` internals; update player-facing strings + type names.

- [ ] **Step 7: Dreamsign Market + Dreamsign Revelation.** Dreamsign Market: a Shop variant that sells dreamsigns for essence (3 items + 50-essence restock) reusing `ShopScreen` + dreamsign pool. Dreamsign Revelation: route to the existing dreamsign offering screen (1 random, or choice-of-3; home dreamscape → always a choice). Add both `ScreenRouter` cases.

- [ ] **Step 8: Three stub sites.** Add `StubSiteScreen.tsx` rendering the guide framing + a short "coming soon" body + a Continue button that calls `completeQuestSite`. Add `ScreenRouter` cases for `TemptingOffer`, `Gamble`, `TemporalFork` → `StubSiteScreen`.

- [ ] **Step 9: Integration test for dispatch completeness.** Add/extend an integration test asserting that for **every** `SiteType` the screen router resolves a screen (no unhandled site type) and that completing each site type advances quest state. *(Catches an unrouted new/renamed site — a contract at the router boundary.)* Derive the site-type list from the `SiteType` union via a representative array maintained in one place; assert none falls through.

- [ ] **Step 10: Run tests + standard verification.** Expected: PASS. Confirm no `omens`/`Cleanse`/`DreamJourney` identifiers remain (`grep -rn "omens\|Cleanse\|DreamJourney" src/` returns only intentional history-free results, ideally none).

- [ ] **Step 11: Manual QA.** QA targets: visit Dream Augury (renamed, two-reward choice works), Dreamsign Market (buy a dreamsign with essence + restock for 50 essence), Dreamsign Revelation (single + choice-of-3), each of the three stub screens (renders + Continue completes the site), and Purge (remove an ordinary card and a bane; prices follow 40/100/190…). Confirm no Omens appears anywhere in the HUD. Run the Manual QA Procedure at both viewports.

- [ ] **Step 12: Commit.**

```bash
git add src
git commit -m "feat(quests): site remap (Dream Augury, Dreamsign Market/Revelation, stubs), single-currency essence, banes into Purge, purge 30+5N(N+1), essence 200"
```

## Task 6: Dream Guides + Home Specialties presentation

**Files:**
- Create: `src/components/DreamGuideFrame.tsx` (portrait=top / landscape=side framing + dialog)
- Modify: guide-bearing site screens to render the frame (Shop, Dreamsign Market, Dreamsign Revelation, Transfiguration, Duplication, Purge, Dream Augury, Tempting Offer, Gamble, Temporal Fork)
- Modify: enhancement application — where `isEnhanced` is set, surface the guide's `homeSpecialty` (the enhanced behavior already flows through `isEnhanced`; this task makes the guide identity + specialty visible and ensures each guide maps to its site)
- Test: extend an integration test asserting guide↔site mapping

- [ ] **Step 1: Failing guide-mapping test.** Assert (over the loaded data) that each non-starter dreamscape's signature site's guide matches `dream_guides.toml`, and that a site generated in its guide's **home** dreamscape is `isEnhanced` while the same site type elsewhere is not. *(Catches a broken guide↔site↔home wiring — the home-specialty trigger.)* Derive from live data.

- [ ] **Step 2: Run; verify failure.** Expected: FAIL.

- [ ] **Step 3: Implement `DreamGuideFrame`** (responsive: top frame portrait, side frame landscape, with placeholder portrait + dialog from `DreamGuideContent.dialog`). Render it in each guide-bearing site screen. Ensure enhancement (already keyed by `isEnhanced` from Task 3) shows the guide's `homeSpecialty` text when enhanced.

- [ ] **Step 4: Run tests + standard verification.** Expected: PASS.

- [ ] **Step 5: Manual QA.** QA targets: visit a guide's **home** dreamscape (guide present, site enhanced, specialty text shown) and the same site type in a **non-home** dreamscape (same guide, no enhancement). Confirm frame layout is correct in portrait (top) and landscape (side) with no clipping. Run the Manual QA Procedure at both viewports.

- [ ] **Step 6: Commit.**

```bash
git add src/components/DreamGuideFrame.tsx src/screens src/journey_v2 src/shop
git commit -m "feat(quests): Dream Guide framing + home-specialty presentation"
```

---

# Wave 2 — Integration layer (depends on Wave 1)

## Task 7: (reserved — merged) 

Economy starting-essence change is implemented in Task 5 Step 4; no separate task. *(Spec T1.5 folded into Task 5 as noted in the spec.)*

## Task 8: Atlas + dreamscape UI (5 states, reveal, known-dreamsign badge)

**Files:**
- Modify: `src/screens/AtlasScreen.tsx`, `src/components/AtlasNode.tsx`, `src/screens/DreamscapeScreen.tsx`, `src/components/SiteCard.tsx`

- [ ] **Step 1: Define the visual contract.** No new logic test (rendering is QA-verified), but add/adjust an integration assertion that the atlas exposes all five `AtlasNodeState` values reachably across a played-through quest (start → complete layers), so the UI has every state to render. *(Catches a state never being produced — which would hide a UI regression.)*

- [ ] **Step 2: Implement the atlas visuals.** Render 7 columns laid out by `position`; style all five states distinctly (unrevealed = gray empty circle; revealedLocked = shown but dim; available = highlighted/glow; completed = desaturated; forgone = dimmed). Connections **always** visible; boss node **always** revealed; "You started here" emphasis on Firstlight; known-dreamsign corner badge on carrier nodes; hover/long-press preview showing guide + affiliation + home specialty + (if present) the known dreamsign.

- [ ] **Step 3: Implement dreamscape-screen visuals.** Show the guide framing (reuse `DreamGuideFrame`) and emphasize the enhanced site.

- [ ] **Step 4: Standard verification.** Expected: PASS.

- [ ] **Step 5: Manual QA (the heaviest visual sweep).** QA targets: progress a quest through start → after layer 1 → mid-run and confirm each node state renders distinctly, connections don't cross or overlap text/labels, boss always shown, known-dreamsign badge visible, "You started here" present, hover preview shows guide+affiliation+specialty, and layout is stable/uncluttered. Dreamscape screen shows guide + enhanced site. Run the Manual QA Procedure at both viewports; attach screenshots of each reveal stage.

- [ ] **Step 6: Commit.**

```bash
git add src/screens/AtlasScreen.tsx src/components/AtlasNode.tsx src/screens/DreamscapeScreen.tsx src/components/SiteCard.tsx
git commit -m "feat(quests): atlas/dreamscape UI for 5 node states, reveal, known-dreamsign badge"
```

## Task 9: Battle opponent decks (simulated journey + affiliation bias + dreamsigns)

**Files:**
- Modify/Create: opponent deck builder used by the Battle site (locate via the battle entry that selects the enemy deck; likely `src/battle/ai/deck.ts` or a quest-side opponent builder) 
- Modify: pre-battle opponent display to show dream avatar + dreamsign (from midpoint)
- Test: opponent-deck integration test

- [ ] **Step 1: Failing opponent-deck invariant test.** Assert (data-derived): an opponent deck built at a later layer is at least as large / advanced as one built at an early layer (scaling with progress); opponents at/after the run midpoint carry exactly one dreamsign and earlier ones carry none; the deck leans toward the dreamscape affiliation when one is present (statistical — affiliated cards over-represented vs. an unbiased build, reusing `opponentAffiliationBias` from Task 4). *(Catches flat difficulty, missing midpoint dreamsign, and missing affiliation bias.)*

- [ ] **Step 2: Run; verify failure.** Expected: FAIL.

- [ ] **Step 3: Implement.** Build the opponent deck by simulating a quest with the opponent dream avatar's tides + dreamscape affiliation bias to the equivalent progress depth; attach one dreamsign from the midpoint onward. Log construction (dream avatar, sim depth, affiliation, decklist summary) per spec §8. Surface the dream avatar + dreamsign in the pre-battle display.

- [ ] **Step 4: Run tests + standard verification.** Expected: PASS.

- [ ] **Step 5: Manual QA.** QA targets: start a battle at an early dreamscape (opponent shown, no dreamsign) and a late dreamscape (opponent shown, one dreamsign; deck visibly stronger and affiliation-leaning). Run the Manual QA Procedure at both viewports.

- [ ] **Step 6: Commit.**

```bash
git add src/battle src/state
git commit -m "feat(quests): affiliation-biased, progress-scaled opponent decks with midpoint dreamsigns"
```

## Task 10: End-to-end integration tests + full QA playthrough

**Files:**
- Create/Modify: `src/state/quest-flow.integration.test.ts` (full-flow coverage)

- [ ] **Step 1: Write the end-to-end flow test.** Drive the real quest state actions through: quest start → atlas → enter dreamscape → complete each non-battle site → battle → reward → advance layer → … → final boss → victory; and a defeat branch ending the run. Assert flow-level invariants: the player visits exactly one node per layer; completed-layer siblings become `forgone`; the deck respects the 25-min / 50-max battle padding rules; a full 7-layer run reaches the boss. *(Catches navigation/advance regressions that unit-level tests miss — this is the battle-mode-style integration backbone.)* Derive content from live data/test helpers.

- [ ] **Step 2: Run; verify failure, then make it pass** by fixing any flow gaps the test surfaces. Expected eventually: PASS.

- [ ] **Step 3: Standard verification (full suite).** `npm run lint && npm run typecheck && npm test`. Expected: PASS.

- [ ] **Step 4: Full manual QA playthrough.** QA targets: play a complete quest start→boss in **landscape**, then in **portrait**; at every screen confirm coherence, usable controls, no clipping/overlap; inspect the captured error buffer across the whole run for any render error, unhandled rejection, or console error (must be zero). Run the Manual QA Procedure end-to-end at both viewports; capture a screenshot per screen.

- [ ] **Step 5: Commit.**

```bash
git add src/state/quest-flow.integration.test.ts
git commit -m "test(quests): end-to-end quest flow integration coverage"
```

---

## Final self-review gate (after Task 10)

- [ ] Re-read `docs/quests/quests.md` and confirm each system has a landing task: atlas (T2,T8), dreamscapes/composition (T3), guides/home specialties (T6), affiliations (T4), site remap + new + stubs (T5), currency/banes/economy (T5), opponent decks (T9), selection essence (T5), data/TOML (T1), integration (T10).
- [ ] `grep -rn "omens\|Cleanse\|DreamJourney" src/` is clean.
- [ ] All manual QA screenshots captured at both viewports with zero console errors.

---

## Coverage map (spec → task)

| Spec item | Task |
| --- | --- |
| New TOML + types foundation (§5, T0.1) | Task 1 |
| Fixed 7-layer atlas generation (§4, T1.1) | Task 2 |
| Dreamscape site composition (§5/§T1.2) | Task 3 |
| Affiliations real IDF (§7, T1.3) | Task 4 |
| Site remap, new sites, currency, banes, economy (§8/§9, T1.4/T1.5) | Task 5 |
| Dream Guides + home specialties (§6, T1.x) | Task 6 |
| Atlas/dreamscape UI 5 states (§T2.1) | Task 8 |
| Battle opponent decks (§10, T2.2) | Task 9 |
| End-to-end tests + QA sweep (§T2.3) | Task 10 |
| Manual QA per task (§7) | every task's QA step |
