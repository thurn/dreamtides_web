# Dream Journey Port: Design

Status: approved spec, ready for implementation planning.
Author: brainstorming session, 2026-05-15.

## Goal

Replace the existing Dream Journey system in the quest prototype with a port of
the `~/journeys` CLI tool's plugin-based generator. The port preserves the
CLI's plugin architecture (shape plugins, predicates, costs, rewards, value
model, manifest contract), rewrites only the Node-specific seams for the
browser, and renders the resulting manifest as 1–3 circular images in a row.

Clicking Enter Dream advances decision-tree state for tree shapes, or closes
the journey screen for flat shapes. None of the manifest's mechanical effects
(deck changes, resource changes, dreamsign gains, bane gains, etc.) are
applied — closing returns the player to the dreamscape with their state
untouched. Journey generation does, however, query the live quest state to
determine which options are eligible to show and which are unaffordable.

## Non-goals

- Applying effect payloads to deck, resources, dreamsigns, or banes.
- Porting the CLI's `--debug`, `--json`, or `--seed` flags. The journey module
  has no CLI surface.
- Porting the CLI's terminal renderers (`human.ts`, `json.ts`, dream-art
  iTerm2 image escapes). The browser UI replaces them. See the note under
  "Where rendered text comes from" for what English-text logic does and
  doesn't port from those files.
- Porting the atomic state writer, the dormant `pick`/`new`/`state` commands,
  or the shape-distribution Monte Carlo script.
- Landing real Dreamwell card content. Stubbed empty until Dreamwell content
  lands.

## Architecture

All journey code lives under `src/journeys/`. The rest of the quest prototype
imports exactly two things from it:

1. `<JourneyScreen site={...} onClose={...} />` — the React entry point that
   the dreamscape site router renders.
2. `journeySeedForSite(site, questState)` — a pure helper that derives the
   deterministic generation seed.

Inside `src/journeys/`:

```
src/journeys/
├── index.ts                # public surface
├── adapter/                # the only directory allowed to import from src/types or src/state
│   ├── buildContext.ts
│   ├── content-bridge.ts
│   └── seed.ts
├── ui/                     # the only directory containing JSX
│   ├── JourneyScreen.tsx
│   ├── JourneyOptionCircle.tsx
│   ├── JourneyHoverCard.tsx
│   ├── CloseButton.tsx
│   └── dreamArt.ts
├── journey/                # ported verbatim from the CLI's src/journey/
│   ├── assembly.ts
│   ├── effects.ts
│   ├── generate.ts
│   ├── manifest.ts         # extended with locked: boolean
│   ├── operationBuilders.ts
│   ├── rewardArtTypes.ts
│   ├── symbols.ts
│   ├── value.ts
│   ├── shared/
│   │   ├── cec.ts
│   │   ├── content.ts
│   │   ├── costs.ts
│   │   ├── dreamwell.ts    # stub for Dreamwell card lists
│   │   ├── predicates.ts
│   │   ├── rewards.ts
│   │   ├── text.ts
│   │   ├── types.ts
│   │   └── viability.ts    # new: shared viability predicates
│   ├── shapes/             # one directory per shape plugin
│   │   ├── registry.ts
│   │   ├── scoreWeights.ts
│   │   ├── shared.ts
│   │   ├── types.ts
│   │   └── <shape_id>/
│   └── validate/
├── content/
│   ├── keywords.ts
│   └── types.ts
├── util/
│   ├── rng.ts              # labeled-hash RNG using a pure-JS SHA-256
│   ├── stableJson.ts
│   └── tree.ts             # traverses precommitted random/automatic branches
└── data/
    └── reward-art-matches.toml
```

### Isolation contract

- Nothing under `src/journeys/journey/`, `src/journeys/content/`,
  `src/journeys/ui/`, or `src/journeys/util/` may import from outside
  `src/journeys/`. The only directory permitted to import from `src/types/` or
  `src/state/` is `src/journeys/adapter/`.
- The whole module is consumed as
  `import { JourneyScreen, journeySeedForSite } from "../journeys"` from
  quest prototype code.

### Plugin modularity

Adding a shape, predicate, cost template, reward template, or transfiguration
touches exactly one place:

- A new shape goes in `src/journeys/journey/shapes/<id>/`, registers itself in
  `registry.ts`, and adds a row to `scoreWeights.ts`.
- A new predicate goes in `shared/predicates.ts`.
- A new cost or reward template goes in `shared/costs.ts` or
  `shared/rewards.ts`.

There is no central switch on shape id outside the registry. Shape-specific
code is forbidden in `shared/` (the same rule the CLI's `AGENTS.md` enforces).

## Adapter and journey context

The adapter is the only seam between the quest prototype and the journey
module.

### Journey-internal projection

```ts
interface JourneyContext {
  readonly state: { quest: QuestStateProjection };
  readonly content: JourneyContentBundle;
  readonly contentVersion: string;
}

interface QuestStateProjection {
  readonly seed: string;
  readonly resources: {
    essence: number;
    maxEssence: number;
    omens: number;
    dreamscape: number;
  };
  readonly deck: readonly DeckEntry[];
  readonly activeDreamsigns: readonly Dreamsign[];
  readonly banes: readonly BaneEntry[];
  readonly draftPool: readonly Card[];
  readonly dreamsignPoolIds: readonly string[];
  readonly dreamAvatar: DreamAvatar;
  readonly resolvedPackage: ResolvedPackage;
}
```

Predicates and shape `fill` functions consume only this projection. The shape
matches the CLI's `JourneyContext`, with `pacingLedger` and `history` dropped
(neither participates in stateless generation).

### `buildContext`

`buildContext(questState, content, site)` performs four translations:

1. Reads card / dream avatar / dreamsign catalogs from the quest prototype's
   content layer (already loaded at app startup; no extra I/O).
2. Maps quest prototype types into journey-internal types via
   `content-bridge.ts`:
   - `CardData` → journey `Card`. Quest `id` becomes journey `id`. Tides pass
     through. Rarity normalizes: `"Legendary"` → `"Rare"`, `"Starter"` →
     `"Starter"`, otherwise → `"Uncommon"` (the CLI's default bucket).
     `cardNumber` is retained for image lookups.
   - `DreamAvatarContent` → journey `DreamAvatar`. Fields map 1:1; `awakening`
     defaults to 0 if absent.
   - `DreamsignTemplate` → journey `Dreamsign`. `kind` derives from
     `packageTides`: non-empty → `tidal`; empty → `neutral`. `orientation` is
     omitted.
3. Builds the `QuestStateProjection` from `QuestState`:
   - `deck`, `activeDreamsigns`, `banes` from the quest state, with banes
     derived from deck entries flagged as bane cards.
   - `dreamscape` from `state.currentDreamscape?.number ?? 0`.
   - `dreamsignPoolIds` from `state.remainingDreamsignPool`.
   - `draftPool` from `state.resolvedPackage.draftPoolCopiesByCard`.
4. Computes `contentVersion`: a stable hash over the catalog ids plus the
   journey's catalog-version constants (shape, effect, value, manifest).
   Quest content changes invalidate seeds.

### Seed derivation

`journeySeedForSite(site, questState)` returns:

```
sha256(questState.seed + ":" + questState.atlas.startingNodeId + ":" + site.id).slice(0, 16)
```

`questState.seed` is the per-quest random seed (a UUID string from
`crypto.randomUUID()`) generated once at quest start by
`startQuestFromDreamAvatar` and persisted on `QuestState`. It supplies the
per-game entropy axis: two fresh quests on the same atlas site land on
different shapes and dream art. The `startingNodeId` and `siteId` axes keep
seeds distinct across sites and across runs that share a seed in tests.

Stable per site for the life of a quest run; identical across page reloads
of the same quest room; distinct per site, per starting node, and per
quest.

### Decision-tree progress

For decision-tree shapes the journey UI keeps an in-memory `currentNodeId`
(defaulting to `tree.rootNodeId`). Reopening the journey screen rewinds to the
root, which is acceptable for the prototype (no effects apply). If
across-reload persistence is wanted later, only a single
`currentNodeId: string | null` field on the site runtime is needed.

## Generation pipeline

The pipeline ports `src/journey/generate.ts` essentially verbatim. The six
phases from the CLI's technical doc hold:

1. **Stage resolution.** Map `context.state.quest.resources.dreamscape` to
   `early` / `mid` / `late` via the CLI's threshold function.
2. **Tag derivation.** `desiredTagsFor(context, stage)` produces the
   contextual tag set (build / cleanup / reward / immediate plus
   essence-percentage and bane-load signals).
3. **Shape scoring.** `scoreShapes(context, stage, tags)` computes per-shape
   scores from a base of one plus tag overlap, target availability, and a
   deterministic jitter, multiplied by `scoreWeight`. The prior-shape history
   input is empty in the initial port; a follow-up may feed
   `visitedSites`-derived history in.
4. **Shape selection.** Highest-scoring plugin wins; jitter resolves ties.
5. **Assembly.** `buildJourneyForShape(plugin, context, drawContext, stage)`
   invokes `plugin.fill(...)` and combines with shape-agnostic metadata.
   Predicates resolve targets against the live deck; viability checks filter
   non-selectable options.
6. **Validation.** Per-shape, tree, precommit, and global validators run;
   failure throws with the failing rule id. No retry loop. The journey screen
   catches the throw and renders the fallback.

### Manifest extensions

- `JourneyOption.locked: boolean` — derived during cost rendering. True iff
  any cost on the option is unaffordable. The `[LOCKED]` text prefix is still
  emitted into `option.text`.
- `JourneyTreeBranch.locked: boolean` — same idea at branch level.

Both fields default to `false`; existing CLI logic that prepends `[LOCKED]`
remains untouched.

### Decision-tree advancement

`src/journeys/util/tree.ts` exports:

```ts
function advanceTree(
  tree: JourneyTree,
  fromBranchId: string,
  precommitted: PrecommittedOutcomes,
): {
  nextNode: JourneyTreeNode | null;
  terminal: JourneyTreeTerminal | null;
};
```

The function:

- Takes the chosen branch. If its target is a terminal, returns the terminal.
- If its target is a node whose branches are all `player_choice`, returns the
  node.
- Otherwise, follows random and automatic branches using
  `precommitted.random` until a player-choice node or a terminal is reached.

A companion helper `initializeTree(tree, precommitted)` performs the same
advance-until-player-choice traversal starting from `tree.rootNodeId`. If
the root node's branches are all `player_choice`, the helper returns the
root node directly; if the root has random or automatic branches, the
helper resolves them via the precommitted bundle before the screen first
renders. The `JourneyScreen` calls `initializeTree` once on mount.

This is the only place in the module that knows about decision trees as a
topology. Shape plugins do not branch on topology.

## UI and rendering

The journey UI is a small React surface in `src/journeys/ui/`.

### Screen state

```ts
const manifest = useMemo(() => generateNextJourney({ context }), [context]);
const [currentNodeId, setCurrentNodeId] = useState<string | null>(
  manifest.tree?.rootNodeId ?? null,
);
const [hoveredOptionId, setHoveredOptionId] = useState<string | null>(null);
```

The manifest is memoized over the context; reloading the screen re-runs
generation, and because the seed and content are stable, output is
byte-identical.

### Layout

```
┌──────────────────────────────────────────────────────────┐
│ [×]                                                      │
│                                                          │
│         ◯           ◯           ◯                        │
│       Dream A     Dream B     Dream C                    │
│     [Enter Dream] [Enter Dream] [Enter Dream]            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- 1–3 circular images in a horizontal row, each captioned with the dream
  name from the art ledger.
- Hover over a circle pops a `JourneyHoverCard` showing the option's full
  rendered text + dream name heading.
- A purple `Enter Dream` button below each circle. Disabled when
  `option.locked` (or `branch.locked` for tree nodes) is true; the
  rendered cost text still shows the `[LOCKED]` prefix so the player can
  read why.
- Close button (white × on red, top-left). Disabled when
  `manifest.shapeId === "choose_your_loss"`.

### Components

- **`JourneyScreen.tsx`** — owns the manifest and `currentNodeId` state.
  Renders `manifest.options` for flat-menu shapes; renders the current tree
  node's player-choice branches for tree shapes. On Enter Dream:
  - Flat menus / single-offer / random-commit / delayed-hook: call
    `onClose()`.
  - Decision tree, player-choice branch: call `advanceTree`. If terminal,
    call `onClose()`; otherwise update `currentNodeId`.
  - On Close (when enabled): call `onClose()`.
- **`JourneyOptionCircle.tsx`** — circular image + dream-name caption +
  Enter Dream button. Props: `imageUrl`, `dreamName`, `text`, `locked`,
  hover handlers, click handler.
- **`JourneyHoverCard.tsx`** — popover showing the option's full rendered
  text plus dream name heading; framer-motion fade in/out.
- **`CloseButton.tsx`** — white-on-red × button; disabled prop suppresses
  click and visually grays out for `choose_your_loss`.
- **`dreamArt.ts`** — browser port of the CLI's dream-art matcher:
  - Loads `src/journeys/data/reward-art-matches.toml` once via `smol-toml`
    (already a dev dep) and caches it.
  - `assignDreamArt(manifest)` runs the CLI's matcher: per option/branch,
    look up `rewardType` via `rewardTypeForTemplateId`, find an unused
    dream of that type, fall back to a cross-type borrow, fall back to a
    repeat. Deterministic against the manifest seed.
  - `imageUrlFor(imageId)` resolves `"/journeys/<imageId>.<ext>"`. The
    `scripts/setup-assets.mjs` build step copies dream-art image files
    into `public/journeys/` using the trailing-numeric-id naming
    convention (`*-<imageId>.<ext>`) the CLI ledger expects.

### Error and loading states

If `generateNextJourney` throws on the current quest state, the screen
renders:

> This dream eludes you. Press × to leave.

The close button is enabled in this fallback even on `choose_your_loss`, so
the player is never stuck. Defensive — expected to be unreachable in
practice.

### Logging

The existing `site_entered` / `site_completed` events with
`siteType: "DreamJourney"` are emitted from the new `JourneyScreen` (mount
and onClose respectively). Additional debug logging (selected shape id,
manifest seed, option count) is gated behind a future debug flag and not
required for the initial port.

### Where rendered text comes from

The CLI's `src/render/human.ts` is large (1,200+ lines, dozens of helpers
like `predicateSummary`, `resourcePayloadText`, `committedOutcomeText`,
`humanizeToken`, `pluralize`) and at first glance looks like a critical
text-formatting layer. The port skips all of it, because none of the
player-visible text actually originates there:

- **`option.text`, `branch.text`, `terminal.text`, reward-pool entry text.**
  Computed at fill time inside each shape's `fill()` function by calling
  the cost/reward template's own `render(params): string` function, which
  lives in `src/journey/shared/costs.ts` and `src/journey/shared/rewards.ts`.
  Each template owns its own English-rendering logic
  (`Gain 50 essence`, `Draft 1 of 4 characters`, `Apply Enduring to 'Card Name'`,
  etc.). These rendering functions are pure string builders that depend on
  `shared/text.ts` (`joinSnippets`, `withLockedPrefix`, `quoteName`),
  `shared/predicates.ts` (`predicate.text.plural` for English noun phrases),
  and the `quoteName` helper. **All of these are ported.**
- **`human.ts` exclusively serves terminal layout.** Its functions handle
  section orchestration (`Dream Journey` heading, resource lines, debug
  blocks), ANSI color, and the design-review-only "Outcomes:" section that
  humanizes precommitted random rolls (`committedOutcomeText` and friends).
  None of these surfaces exists in the player UI: the player only sees the
  per-option / per-branch / terminal text already on the manifest, and the
  consequences of advancing through random branches arrive as the next
  node's text rather than a "you rolled a 7" announcement.
- **The decision-tree traversal does not narrate.** When `advanceTree`
  walks through random or automatic branches via `precommitted.random`,
  the UI silently advances to the next player-choice node or terminal.
  No "you rolled X" text appears. The terminal's `text` is shown at the
  end if the journey terminates.

Concretely, the file-by-file picture:

| CLI file | Ported? | Why / why not |
|---|---|---|
| `src/journey/shared/text.ts` | yes | 3 helpers used everywhere. |
| `src/journey/shared/predicates.ts` | yes | Provides English `text.plural` for predicates. |
| `src/journey/shared/costs.ts` | yes | Per-template `render` produces cost text. |
| `src/journey/shared/rewards.ts` | yes | Per-template `render` produces reward text. |
| `src/journey/shapes/<id>/...` | yes | Per-shape `fill()` assembles option/branch text. |
| `src/render/human.ts` | **no** | Terminal layout, color, debug blocks, `committedOutcomeText`. Replaced by the React UI. |
| `src/render/json.ts` | **no** | JSON dump format for the CLI; not needed. |
| `src/render/dreamArt.ts` | partial | The matcher logic ports; the iTerm2 image escape rendering does not. |
| `src/render/theme.ts` | **no** | ANSI color theme; the React UI uses its own styles. |
| `src/render/errors.ts` | **no** | CLI error rendering with exit codes; the UI uses the in-screen fallback. |

If during the port we discover a player-visible text path that does call
into `human.ts` (the audit may surface one), the affected helper moves to
`src/journeys/journey/shared/text.ts` rather than getting pulled in
wholesale from the CLI's render layer.

## Eligibility and locking

The CLI ships bare-bones viability gating: some predicates and some
`viable()` checks exist, but many reward and cost templates fall through
without verifying that the player's deck or dreamsign pool supports them.
The port is the place where that gating gets fleshed out. The port treats
this as part of the same change set, not as a follow-up.

### Two concepts

- **Viability.** The option / cost / reward isn't possible at all in this
  context. The generator filters non-viable items out during shape fill so
  they never appear in the manifest.
- **Locking.** The cost is possible in kind but unaffordable in amount. The
  option appears in the manifest with `locked: true` and a `[LOCKED]`
  prefix on the rendered cost text. The Enter Dream button is disabled.

### Viability audit (part of the port)

Every cost and reward template in `shared/costs.ts` and `shared/rewards.ts`
gets a `viable(ctx): boolean` predicate. Templates that already have one
keep theirs. Templates that don't have one get one written.

Examples that must be enforced:

- "Purge a random Warrior" reward → deck must contain at least one Warrior.
- "Duplicate a card with a discard ability" reward → deck must contain at
  least one card whose `renderedText` contains the substring "discard"
  (case-insensitive). A tag-based predicate is a future refinement; the
  string match is acceptable for the port.
- "Transfigure a card to Enduring" (or any of Empowered, Amplified, Kindled,
  Inspired, Enduring, Resonant, Attuned, Perfected) → at least one deck entry must
  pass that transfiguration's eligibility filter. The port shares the
  existing `assignTransfiguration` helper from the quest prototype via the
  content bridge so the journey module does not reimplement eligibility.
- "Discard X cards" cost → `deck.size >= X`.
- "Sacrifice a Warrior" cost → `deck.contains(predicate: warrior)`.
- "Gain a dreamsign" reward → dreamsign pool non-empty.
- Tide-filtered dreamsign reward → pool contains at least one matching
  dreamsign.

A shape's `fill()` filters its candidate template pool through `viable`
before assembling options. If, after filtering, a shape's option count
drops below `rootOptionCount.min`, the validator throws; the journey screen
renders the fallback.

### Locking model

- "Lose X essence" cost → `viable: true`; `locked: amount > ctx.essence`.
- "Lose X omens" cost → `viable: true`; `locked: amount > ctx.omens`.
- Compound costs propagate locking: the combined-cost template strips any
  sub-cost's prefix, joins the segments, and re-prepends `[LOCKED]` when
  any sub-cost is locked. The `option.locked` flag is the structural
  signal; the prefix is the textual one.

### Shared viability helpers

`src/journeys/journey/shared/viability.ts` collects the reusable predicates
that cost and reward templates compose:

- `deckContainsCard(ctx, cardId)`
- `deckContainsPredicate(ctx, predicateId)`
- `deckHasMinSize(ctx, n)`
- `poolHasDreamsignWithTide(ctx, tide)`
- `transfigurationHasEligibleTarget(ctx, transfigurationId)`
- `canAffordEssence(ctx, amount)`
- `canAffordOmens(ctx, amount)`

Templates call these by name. New content reuses the same helpers.

### Dreamwell placeholder

Dreamwell card definitions are not landed. `shared/dreamwell.ts` exports
empty arrays for positive and negative dreamwell card lists. Templates that
consult dreamwell content treat the lists as "no eligible cards", which
flips `viable` to false and removes the option from manifests. When real
dreamwell content lands later, only `shared/dreamwell.ts` changes; no
shape plugin is touched.

## Testing strategy

Tests over 30 seconds get aggressively deleted; under 10 seconds is
preferred. Timing test execution is part of test authoring.

### Test categories

1. **Shape-plugin unit tests** at `src/journeys/journey/shapes/<id>/<id>.test.ts`.
   One file per shape, exercising the plugin's contract on a tiny fixture
   (5–10 cards). Target: <100 ms per test, <2 s per file.
2. **Shared-helper unit tests** at `src/journeys/journey/shared/*.test.ts`.
   Predicates, cost templates, reward templates, viability helpers. Pure.
   Target: <50 ms per test.
3. **Generation integration test** at `src/journeys/journey/generate.test.ts`.
   One golden test for a fixed seed plus one forced-shape test per shape.
   Target: <5 s total.
4. **Validator tests** at `src/journeys/journey/validate/*.test.ts`. Positive
   and negative cases per rule. Pure. Target: <50 ms each.
5. **Adapter tests** at `src/journeys/adapter/buildContext.test.ts`. Quest
   state → journey context translation; rarity normalization; dreamsign
   kind derivation; seed derivation. Pure. Target: <100 ms.
6. **UI tests** at `src/journeys/ui/JourneyScreen.test.tsx`. Six cases:
   - Renders manifest options as circles.
   - Disabled Enter Dream when `option.locked` is true.
   - Disabled Close when `shapeId === "choose_your_loss"`.
   - Decision-tree Enter Dream advances `currentNodeId`.
   - Decision-tree terminal Enter Dream calls `onClose`.
   - Error fallback renders "This dream eludes you" when generation throws.

   UI tests mock `generateNextJourney` to return a hand-built manifest.
   Target: <500 ms per test, <5 s per file.

### Hard rules

- No test loads the full quest prototype `card-data.json`,
  `dreamsign-data.json`, or `dream-avatar-data.json`. Fixture contexts are
  hand-built.
- No test uses fake timers or waits on time.
- No test waits on network or filesystem, with the single exception of
  `dreamArt.ts` parsing the TOML ledger once (fast, synchronous).
- Pure module tests stay in the node environment; only UI tests render to
  jsdom.
- Snapshot tests are out. Shape-distribution Monte Carlo tests are out.

### Tests deleted in the cutover

- `src/screens/DreamJourneyScreen.test.tsx`.
- Any quest-context test asserting on `ensureDreamJourneyRuntime` or
  `completeDreamJourneyOption` mutation flows; replace with a single test
  for `completeDreamJourneySite`.
- Any test asserting on `DREAM_JOURNEYS` contents.

## Migration

### Deleted outright

- `src/data/dream-journeys.ts` (data + `JourneyEffect` union).
- `src/screens/DreamJourneyScreen.tsx` and
  `src/screens/DreamJourneyScreen.test.tsx`.
- The `DreamJourneySiteRuntime` interface arm in `src/types/quest.ts`.
- The `applyDreamJourneyEffect`, `dreamJourneyOptionId`, and
  `findDreamJourneyOption` helpers in `src/state/quest-context.tsx`.
- The `ensureDreamJourneyRuntime` and `completeDreamJourneyOption`
  mutations in `quest-context.tsx` and `multiplayer-quest-context.tsx`.

### Replaced by

- `completeDreamJourneySite(siteId: string)` — marks the site visited and
  returns to the dreamscape. Lives alongside other `complete*Site`
  mutations.

### Retained

- The `"DreamJourney"` literal in the `SiteType` union.
- Atlas placement of Dream Journey sites.
- `site_entered` / `site_completed` logging events for
  `siteType: "DreamJourney"`.
- A minimal `siteRuntime` slot: `{ kind: "dreamJourney", completed: boolean }`.

### Added

- `src/journeys/` (the whole new module).
- `public/journeys/<imageId>.<ext>` dream-art assets. The implementation
  plan will pick the source-of-truth location for the raw image files; the
  candidates are committing them under `src/journeys/data/images/` (bundled
  with the repo) or pulling them from a sibling location during setup. The
  build step in `scripts/setup-assets.mjs` is extended to copy the chosen
  source directory into `public/journeys/` using the trailing-numeric-id
  naming convention the CLI's ledger expects (`*-<imageId>.<ext>`).
- One new dependency: a small pure-JS SHA-256 implementation (for example,
  `js-sha256`, ~3 KB minified, zero transitive deps) so the labeled-hash
  RNG stays synchronous. SubtleCrypto.digest is async, which would force
  every generator callsite to await; a pure-JS hash matches
  `crypto.createHash("sha256")` byte-for-byte and lets the CLI's
  deterministic outputs port across unchanged.
- One render-routing line in `ScreenRouter` (or the dreamscape site
  router): `case "DreamJourney": return <JourneyScreen site={site} onClose={completeDreamJourneySite} />`.

## Manual QA

The `agent-browser` CLI tool is the documented manual-validation surface.
Checklist:

- Open a Dream Journey site in each of the `early`, `mid`, and `late`
  dreamscape stages. Confirm 1–3 circles render with images, hover-cards,
  and Enter Dream buttons.
- Confirm the Close button is enabled on every shape except
  `choose_your_loss`.
- Force a low-essence quest state and confirm at least one option renders
  with a `[LOCKED]` prefix and a disabled Enter Dream button.
- Trigger a decision-tree shape (e.g., `push_your_luck`) and confirm Enter
  Dream advances to the next node and eventually closes the screen at a
  terminal.
- Confirm Enter Dream always returns to the dreamscape without modifying
  the deck, resources, dreamsigns, or banes.

## Open extension points (deferred)

- Prior-shape history fed from `visitedSites` into shape scoring.
- Decision-tree progress persisted across reloads via
  `currentNodeId` on the site runtime.
- Debug panel exposing `--shape`, `--stage`, and `--seed` overrides.
- Shape-distribution Monte Carlo dev script.
- Real Dreamwell card content in `shared/dreamwell.ts`.
