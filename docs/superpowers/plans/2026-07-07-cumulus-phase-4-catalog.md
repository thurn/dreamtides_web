# Cumulus Revisions Phase 4: Deletions and Catalog Honesty — Implementation Plan

> **REQUIRED SUB-SKILL:** Execute this plan with **`superpowers:subagent-driven-development`**.
> Before starting, load that skill and drive each task through a fresh implementation
> subagent + review pass. Track progress with the checkboxes below.
>
> - [ ] Sub-skill `superpowers:subagent-driven-development` loaded and in use for every task

## Goal

Phase 4 is the final phase of the Cumulus system-revisions program. It makes the
catalog honest: it deletes the two components that render nowhere in production
(`StatTile`, `TidePill`) and the unreachable `SiteNode` visited state and the
dead `AtlasNode` eyebrow surface; repairs the atlas / tide-disc / site-node demos
so they show the shapes production actually renders and mount the production
integration surface; documents the ten undocumented workhorse modules that are
the real load-bearing system; documents the InfoCard mobile-scale + above-only
placement contract, the draft-screen idiom, the device-frame QA hook, and the
deck-viewer platform divergence; refreshes stale doctrine comments; and closes
the corresponding open items in `pre-existing-issues.txt`.

At the end of this phase the whole program (Phases 0–4) is complete: every §7
lint / integrity rule is enabled, the `no-ghost-components` baseline is empty,
and the audit-follow-up entries in `pre-existing-issues.txt` are resolved.

## Architecture

The Cumulus doc catalog is **generated**, not hand-written. This is the single
most important fact for this phase:

- **Component reference pages** (`.llms/skills/cumulus/components/<id>.md`) are
  produced by `scripts/generate-cumulus-docs.mjs` from three sources:
  `src/cumulus/docs/registry.ts` (the `CUMULUS_COMPONENTS` array + its imports, in
  catalog order), `src/cumulus/docs/demos/<id>.tsx` (the authored prose: `id`,
  `title`, `blurb`, optional `callout`, `group`, `docName`, `usage[]`), and
  `src/cumulus/metadata/cumulus-metadata.json` (the docgen `PropMeta[]`, keyed by
  `docName`). The generator **owns** the `components/` directory: it deletes any
  `.md` it did not just write, so removing a registry entry auto-sweeps its
  reference page. **Never hand-edit a `components/*.md`** — edit the demo file and
  regenerate. Doc prose fields must be plain string / substitution-free template
  literals (the generator extracts them statically via the TS AST).
- **Metadata** (`cumulus-metadata.json`) is produced by
  `scripts/generate-cumulus-metadata.mjs`, which globs **all** `.tsx` under
  `src/cumulus/components/` and `src/cumulus/primitives/` (skipping `__*__`) and runs
  react-docgen-typescript. A `docName` used by a demo MUST resolve to a
  PascalCase component export in one of those two roots. Deleting a component
  file drops its metadata key on the next regen.
- **Full-screen mockups** are a separate wiring: `src/cumulus/docs/mockups/<id>.tsx`
  registered in `src/cumulus/docs/mockups/registry.ts` (`MOCKUPS` map + import).
  Mockups are NOT swept by the docs generator — deleting a mockup requires editing
  `mockups/registry.ts` by hand.
- **Regeneration:** `npm run regenerate-assets` runs metadata + docs (among
  others). Two drift tests — `scripts/generate-cumulus-metadata.test.mjs` /
  `scripts/cumulus-generated-docs-drift.test.mjs` — fail the build if the committed
  outputs don't match the live sources, so every task that touches a component,
  demo, or registry MUST regenerate and commit the drift.
- **Adding a workhorse to the catalog** = write `demos/<id>.tsx` (with real API
  prose) + append it to `registry.ts` + confirm its `docName` is already in the
  generated metadata (all ten workhorses are `.tsx` components/primitives, so
  they already appear) + regenerate. The Phase-0 `no-ghost-components` check
  requires ≥1 real consumer; every workhorse has consumers, so no `incubating`
  status is needed.

The Cumulus isolation boundary (`eslint-rules/no-external-ui-imports.js`) is
fail-closed: `src/cumulus/**` may import only from `src/cumulus/`, `src/data/`,
`src/types/`, `src/runtime/`, bare packages, and `src/logging`. **It may NOT
import from `src/screens/`.** The `ATLAS_LAYOUT_*` node-size constants live in
`src/screens/cumulus_adapters/atlas-view-model.ts`; the atlas demo (under
`src/cumulus/docs/`) therefore cannot import them directly — Phase 4 relocates the
node-size constants into the in-Cumulus `atlas-display.ts` so both the adapter and
the demo read one source.

## Tech Stack

TypeScript / React (Vite), ESLint flat config with custom `cumulus/*` rules,
Vitest, react-docgen-typescript. Node ESM scripts under `scripts/`. Docs are
Markdown generated into `.llms/skills/cumulus/`. Browser QA via `agent-browser`
against a local Vite dev server on a non-default port.

## Global Constraints

Apply to **every** task:

- **Green at every commit:** `npm run lint`, `npm run typecheck`, `npm test`
  all pass before the commit. In a fresh worktree run `npm install` first.
- **Regenerate + commit drift:** any task touching a Cumulus component, demo,
  registry, or token runs `npm run regenerate-assets` and commits the generated
  output in the same commit (the drift tests enforce this).
- **Conventional commits, pushed immediately** after each task
  (`git push` right after `git commit`, per repo `AGENTS.md`). Do not create
  branches. End commit messages with the `Claude-Session:` trailer.
- **Docs describe the current system only.** Never write removed-state phrasing
  ("no longer", "used to", "we removed", "unlike before"). Describe what exists.
- **Demos mount production integration surfaces and import production constants.**
  A demo that fakes a boolean where production wires a real engine, or re-types a
  number production exports, is a bug to fix, not a pattern to copy.
- **Browser QA for visual demo/screen changes** via the doc catalog route
  (`/cumulus#/<id>` for a component page, `/cumulus#/<id>/mockup` for a full-screen
  mockup) and the affected screens. Start the dev server on a non-default port
  (`npm run dev -- --port 5174`), isolate each `agent-browser` run with a unique
  `--session`, assert `location.href` + `window.innerWidth` before each
  screenshot, and tear down only your own server (match
  `dev-with-emulator.mjs --port 5174`, never a broad `pkill -f vite`). Inspect the
  captured error buffer for render errors / console errors.
- **Identify cards by UUID, never by name.** (No card work here, but the
  demo fixtures use dreamscape ids / art refs, not names — keep it that way.)

---

## Task 1 — Delete StatTile

**Files**
- `src/cumulus/components/controls/StatTile.tsx` (delete)
- `src/cumulus/docs/demos/stat-tile.tsx` (delete)
- `src/cumulus/docs/mockups/stat-tile.tsx` (delete)
- `src/cumulus/docs/registry.ts` (remove the `statTileDemo` import + its `CUMULUS_COMPONENTS` entry)
- `src/cumulus/docs/mockups/registry.ts` (remove the `StatTileMockup` import + its `MOCKUPS` entry)
- `src/cumulus/primitives/color.ts` (comment referencing StatTile)
- `src/cumulus/components/controls/SegmentedControl.tsx` (comment referencing StatTile)
- `scripts/cumulus-ghost-components.test.mjs` (remove `"StatTile"` from the exported `BASELINE`)
- Generated (auto): `src/cumulus/metadata/cumulus-metadata.json` (StatTile key drops), `.llms/skills/cumulus/components/stat-tile.md` (swept)

**Interfaces:** none changed. StatTile has zero production consumers — its only
importers are its own demo + mockup, both deleted here.

**IMPORTANT — do NOT touch `src/debug/OpponentDebugApp.tsx`.** It defines a
LOCAL function named `StatTile` that is unrelated to the Cumulus component; leave it
entirely alone. The only `StatTile` being deleted is
`src/cumulus/components/controls/StatTile.tsx` and its docs wiring.

**Steps**
- [ ] Delete the component, demo, and mockup files; remove the `statTileDemo`
      import + entry from `registry.ts` and the `StatTileMockup` import + entry
      from `mockups/registry.ts`.
- [ ] Rephrase the two stale comments so no comment names a deleted component:
      `color.ts` (the "role name, not a raw color" note → cite a live component
      such as `ResourceChip`/`TideDisc`) and `SegmentedControl.tsx` ("Sibling of
      TidePill and StatTile …" → name a live sibling such as `Select`). Keep the
      technical point; drop the dead reference.
- [ ] In `scripts/cumulus-ghost-components.test.mjs`, remove `"StatTile"` from the
      exported `BASELINE` (read the file to confirm the exact const name; leave
      `"TidePill"` — Task 2 removes it).
- [ ] `npm run regenerate-assets` — metadata drops StatTile; expect the output to
      report the sweep, e.g. `Wrote N component reference(s) … (swept 1 stale)`.
- [ ] `npm run lint && npm run typecheck && npm test` — all green.
- [ ] Grep guard — expect **empty**: `grep -rn "StatTile" src/cumulus/ .llms/skills/cumulus/`.
      Repo-wide, the ONLY surviving `StatTile` hit must be the unrelated local
      function in `src/debug/OpponentDebugApp.tsx`.
- [ ] Browser QA (catalog): dev server on 5174, isolated session; open
      `http://localhost:5174/cumulus#/` — the index no longer lists "Stat Tile", and
      `#/stat-tile` shows the graceful not-found note; no console errors.
- [ ] Commit: `refactor(cumulus): delete unused StatTile component and its catalog entry` + push.

---

## Task 2 — Delete TidePill (redirect the `Tide` type first) and empty the ghost baseline

**Files**
- `src/screens/cumulus_adapters/quest-start-view-model.ts:11` (redirect the `Tide` type import)
- `src/cumulus/components/hud/TidePill.tsx` (delete)
- `src/cumulus/docs/demos/tide-pill.tsx` (delete)
- `src/cumulus/docs/mockups/tide-pill.tsx` (delete)
- `src/cumulus/docs/registry.ts` (remove the `tidePillDemo` import + entry)
- `src/cumulus/docs/mockups/registry.ts` (remove the `TidePillMockup` import + entry)
- `src/cumulus/docs/demos/pressable.tsx` (prose string listing "TidePill" as an example)
- `src/cumulus/components/controls/SegmentedControl.tsx` (comment — if it still names TidePill after Task 1)
- `src/cumulus/components/overlay/InfoCard.tsx` (comment "TidePill, a HUD chip")
- `scripts/cumulus-ghost-components.test.mjs` (remove `"TidePill"` → BASELINE now `[]`)
- Generated (auto): `cumulus-metadata.json` (`TidePill` and `Tide` keys drop), `tide-pill.md` (swept)

**Interfaces / key finding:** the `Tide` type **already lives in
`src/cumulus/components/hud/tide-spec.ts`** (`export type Tide = …`). `TidePill.tsx`
merely re-exports it (`export { tideVisual, type Tide } from "./tide-spec";`).
So "move the `Tide` type into `tide-spec.ts`" is already done — the real work is
**repointing importers off `TidePill` onto `tide-spec`, then deleting TidePill.**
Enumerated importers of the `Tide` type from the `TidePill` module (grep-verified):
- `src/screens/cumulus_adapters/quest-start-view-model.ts:11` — production. **Redirect this one** to `../../cumulus/components/hud/tide-spec`.
- `src/cumulus/docs/demos/tide-pill.tsx`, `src/cumulus/docs/mockups/tide-pill.tsx` — both deleted here.

`InfoCard.tsx` and `quest-start-shared.tsx` already import `Tide` from
`tide-spec` — leave them. Dropping the `"Tide": []` metadata key is safe: no demo
uses `docName: "Tide"` (the tide-disc demo keys on `TideDisc`).

**Steps**
- [ ] Redirect `quest-start-view-model.ts:11` to import `Tide` from `tide-spec`
      (leave the `TIDE_BY_COLOR` map and the JSDoc `{@link Tide}` reference as-is).
- [ ] Delete the TidePill component, demo, and mockup files; remove the
      `tidePillDemo` import + entry from `registry.ts` and the `TidePillMockup`
      import + entry from `mockups/registry.ts`.
- [ ] `pressable.tsx` callout string: replace `TidePill` in the example list with a
      live component (e.g. `TideDisc`) so the prose cites only shipping components.
- [ ] Update the comments naming TidePill: `SegmentedControl.tsx` (name a live
      sibling) and `InfoCard.tsx` ("TidePill, a HUD chip" → e.g. "a HUD chip" /
      "a `ResourceChip`"); keep the `white-space: nowrap` reset point intact.
- [ ] `scripts/cumulus-ghost-components.test.mjs`: remove `"TidePill"` from
      `BASELINE`; it is now `[]`. Add a short test-file comment noting the baseline
      is empty because every registry entry has a real consumer (current-state
      phrasing; no removed-state wording).
- [ ] `npm run regenerate-assets` — expect `(swept 1 stale)` for `tide-pill.md`;
      metadata loses `TidePill` and `Tide`.
- [ ] `npm run lint && npm run typecheck && npm test` — green (the empty ghost
      baseline now asserts zero registered ghosts).
- [ ] Grep guard — expect **empty**: `grep -rn "TidePill" src/ .llms/skills/cumulus/`.
- [ ] Browser QA (catalog): index no longer lists "Tide Pill"; `#/tide-pill` shows
      the not-found note; `#/tide-disc` still renders; no console errors.
- [ ] Commit: `refactor(cumulus): delete TidePill, repoint Tide type onto tide-spec, empty ghost baseline` + push.

---

## Task 3 — Delete SiteNode's unreachable visited state + repair the site-node demo

**Files**
- `src/cumulus/components/dreamscape/SiteNode.tsx` (post-Phase-3 path; the visited branch of `siteRevealNote`, the visited `opacity`, the battle-pulse/badge visited guards, and the `data-site-visited` attribute)
- `src/cumulus/components/dreamscape/site-node.css` (the `.ds-node-badge.visited` rule)
- `src/cumulus/docs/demos/site-node.tsx` (delete the `s-visited` fixture; fix the `s-locked` blurb)
- `src/cumulus/docs/mockups/site-node.tsx` (delete the `s-draft` `isVisited: true` fixture)

> Phase 3 moved `SiteNode` / `site-node.css` / `dreamscape-scatter.ts` to
> `src/cumulus/components/dreamscape/`. Write these edits against that path. If a
> file is still under `components/atlas/` at execution time, Phase 3 has not
> landed — stop and resolve the phase ordering first.

**Interfaces:** none. Production filters visited sites out before `SiteNode`
mounts (`DreamscapeScreen.tsx` `.filter((model) => !model.site.isVisited)`,
asserted by `DreamscapeScreen.test.tsx` which expects the visited site's node
absent). **That filter and that test are the production contract — leave them.**
Inside `SiteNode`, `site.isVisited` is therefore never true; the visited-only
rendering is unreachable. `data-site-visited` is only ever `"false"` and nothing
reads it (grep-verified: the only occurrence is its own declaration).

**End state**
- [ ] `SiteNode.tsx` — after edits, `site.isVisited` is referenced nowhere: the
      `siteRevealNote` function returns only the lock note or `null` (the locked
      guard simplifies to `if (model.isLocked)`); the disc always renders at full
      opacity (the `opacity` const and its `nodeStyle` line are gone); the
      battle-pulse guard is `isBattle && !isLocked`; the locked-badge guard is
      `isLocked`; the visited badge block and the `data-site-visited` attribute are
      deleted. Update the component header comment to list only the states the disc
      actually shows (plain, guardian battle, locked guardian).
- [ ] `site-node.css` — the `.ds-node-badge.visited` rule is deleted;
      `.ds-node-badge` and `.ds-node-badge.locked` remain.
- [ ] `demos/site-node.tsx` — the `s-visited` fixture is deleted; the demo shows
      plain shop, plain reward, battle guardian, locked guardian. The file header's
      state list drops "a visited site".
- [ ] `demos/site-node.tsx` — the `s-locked` fixture's `blurb` currently
      near-duplicates the reveal's lock note; change it to a distinct mechanic
      description of the guarded battle (e.g. "The dreamscape's final guardian —
      defeat it to complete the dreamscape.") so the reveal shows a blurb line above
      the muted lock note.
- [ ] `mockups/site-node.tsx` — the `s-draft` (`isVisited: true`) fixture is
      deleted, so the scene shows only reachable/unvisited sites, matching production.

**Verify**
- [ ] `npm run regenerate-assets` (site-node demo prose feeds `site-node.md`).
- [ ] `npm run lint && npm run typecheck && npm test` — green (including
      `DreamscapeScreen.test.tsx`, unchanged).
- [ ] Grep guard — expect **empty**:
      `grep -rn "isVisited" src/cumulus/components/dreamscape/SiteNode.tsx` and
      `grep -rn "\.visited\b\|Already visited" src/cumulus/components/dreamscape/`.
- [ ] Browser QA: `/cumulus#/site-node` and `/cumulus#/site-node/mockup` at desktop +
      a mobile width — every disc reads active; press/hover a locked node and confirm
      the reveal shows the mechanic blurb line + exactly one muted lock note (no
      duplicate sentence); no visited check badge anywhere; no console errors.
- [ ] Commit: `refactor(cumulus): remove SiteNode's unreachable visited state and repair its demo fixtures` + push.

---

## Task 4 — Delete AtlasNode's dead eyebrow/meta surface; resolve forgone vs unreachable

**Files**
- `src/cumulus/components/atlas/AtlasNodeReveal.tsx` (the `AtlasNodeCard.eyebrow` field + the `meta={card.eyebrow ?? undefined}` wiring in `AtlasMainCard`)
- `src/screens/cumulus_adapters/atlas-view-model.ts` (the three `eyebrow: null,` lines in `buildNodeCard` — boss / unrevealed / revealed branches)
- `src/cumulus/components/atlas/AtlasNode.tsx` (the `node-forgone` fade coupling)
- `src/cumulus/components/atlas/atlas.css` (the shared `.node-forgone, .node-unreachable` fade rule + its paired `.node-glow` hide rule)

**Interfaces / trace (read before editing):** `buildNodeCard` sets `eyebrow: null`
in all three branches → `AtlasNodeCard.eyebrow` is always null → `AtlasMainCard`
passes `meta={card.eyebrow ?? undefined}` → InfoCard's `meta` receives `undefined`
on every atlas reveal. The wiring is dead.

**Do NOT delete InfoCard's `meta` prop** — it has live consumers: the info-card
demo (`meta="Tide"`) and the info-card mockup (`meta="Resource"`). Only the atlas
node's *path into* `meta` is dead. `AtlasNode.tsx` itself has no eyebrow prop.

**Forgone decision — DOCUMENT `forgone` AS DATA-ONLY; the display fade keys on
`isReachable`.** Rationale:
- `forgone` is a real generator node *state* (`atlas-generator.ts` sets passed-by
  siblings to `state: "forgone"`), part of the `DreamscapeNode["state"]` union in
  `src/types/quest.ts`, and asserted by generator + reachability tests
  (`atlas-generator.test.ts`, `atlas-reachability.test.ts`,
  `quest-flow.integration.test.ts`). It carries meaning distinct from generic
  unreachability ("a sibling the player chose to pass by"). Removing it from the
  data model would ripple into the generator and four test files — fragile and wrong.
- The DISPLAY, however, expresses "faded / can't reach" twice: the `node-forgone`
  state class AND the `node-unreachable` class (`view.isReachable === false`),
  which are always coincident in production and share one CSS rule. That is the
  duplication to collapse. `isReachable` is the display signal the view-model
  computes (`reachableAtlasNodeIds`); it already blanks the icon/badges of any
  unreachable node. So: **keep `forgone` as a data-only generator state; drive the
  visual fade solely off `isReachable === false` (`node-unreachable`); drop
  `node-forgone` from the display coupling.** One display concept, one data concept,
  no coincidence to maintain by hand.

(Grep confirms no display consumer needs `forgone` as a separate *visual* concept
beyond the shared fade; the atlas-node demo's forgone fixture is repaired in Task 5.)

**End state**
- [ ] `AtlasNodeReveal.tsx`: the `eyebrow` field (and its doc line) is gone from the
      `AtlasNodeCard` interface; the `meta={card.eyebrow ?? undefined}` line is gone
      from `AtlasMainCard`'s `fullBleed` InfoCard. (InfoCard keeps `meta` as an
      optional prop unused here.)
- [ ] `atlas-view-model.ts`: the three `eyebrow: null,` lines in `buildNodeCard` are
      gone.
- [ ] `atlas.css`: the shared fade selector (and the paired `.node-glow` hide rule)
      keys on `.node-unreachable` **only** — `node-forgone` no longer appears in any
      display CSS. Read `AtlasNode.tsx` first: if `node-unreachable` already gates
      the fade, no change is needed there; the fade must end up driven solely by the
      `view.isReachable === false` contribution. Update the CSS rule's comment to say
      the fade marks every node the player can no longer reach (`isReachable ===
      false`), without mentioning `forgone`.
- [ ] Add a one-line comment at the `forgone` state site (in `src/types/quest.ts`
      or the generator) documenting it as a **data-only** generator state (a
      passed-by sibling) whose display fade is delivered by the view-model's
      `isReachable` computation, so a future reader does not re-add a `node-forgone`
      visual rule. Current-state phrasing.

**Verify**
- [ ] `npm run regenerate-assets` (AtlasNodeReveal/AtlasNode metadata refreshes).
- [ ] `npm run lint && npm run typecheck && npm test` — green (atlas view-model and
      reachability tests unchanged and passing).
- [ ] Grep guard — expect **empty**:
      `grep -rn "eyebrow" src/cumulus/components/atlas/ src/screens/cumulus_adapters/atlas-view-model.ts`
      and `grep -rn "node-forgone" src/cumulus/components/atlas/atlas.css`.
- [ ] Browser QA: `/cumulus#/atlas-node/mockup` (or the atlas mockup after Task 7) at
      desktop + mobile — an unreachable node still fades (grayscale/dim) and drops
      its glow; a reachable node renders normally; no console errors.
- [ ] Commit: `refactor(cumulus): drop AtlasNode's dead eyebrow/meta wiring; fade unreachable nodes off isReachable` + push.

---

## Task 5 — Atlas demo repairs: production sizes, forced-blank forgone, unreachable row, badgeScale, mount AtlasNodeReveal

**Files**
- `src/cumulus/components/atlas/atlas-display.ts` (add exported node-size constants)
- `src/screens/cumulus_adapters/atlas-view-model.ts` (`ATLAS_LAYOUT_DESKTOP` / `ATLAS_LAYOUT_MOBILE` reference the new constants)
- `src/cumulus/docs/demos/atlas-node.tsx` (rewrite fixtures + mount `AtlasNodeReveal`)

**Interfaces / boundary constraint:** the atlas demo must (a) use the real node
sizes (132/150 desktop, 200/224 mobile) instead of the invented 96/112; (b) show
the forced-blank forgone production shape; (c) include an `isReachable: false`
row; (d) demo `badgeScale: 1.5` (the mobile default); (e) mount the production
integration surface `AtlasNodeReveal` (live press-reveal), not a faked `hovered`
boolean — modeled on the `site-node` demo, which already wires a live press-reveal.
The `ATLAS_LAYOUT_*` profiles live in `src/screens/cumulus_adapters/` and **cannot be
imported across the Cumulus boundary** (`src/cumulus` may not import `src/screens`), so
the size numbers move into the in-Cumulus `atlas-display.ts` as the single source
both sides read.

**Contract — the constants (names + values are load-bearing):**
```ts
// src/cumulus/components/atlas/atlas-display.ts
export const ATLAS_NODE_SIZE_DESKTOP = 132;
export const ATLAS_ANCHOR_NODE_SIZE_DESKTOP = 150;   // starter + boss anchor size
export const ATLAS_NODE_SIZE_MOBILE = 200;
export const ATLAS_ANCHOR_NODE_SIZE_MOBILE = 224;
export const ATLAS_BADGE_SCALE_MOBILE = 1.5;         // desktop keeps badges at 1
```

**End state**
- [ ] `atlas-view-model.ts` imports those constants: `ATLAS_LAYOUT_DESKTOP` uses
      `ATLAS_NODE_SIZE_DESKTOP` / `ATLAS_ANCHOR_NODE_SIZE_DESKTOP`;
      `ATLAS_LAYOUT_MOBILE` uses `ATLAS_NODE_SIZE_MOBILE` /
      `ATLAS_ANCHOR_NODE_SIZE_MOBILE` / `ATLAS_BADGE_SCALE_MOBILE`. `contentRect` and
      `edgeAnchorHorizontal` stay in the adapter (screen-layout concerns). Behaviour
      is unchanged (same numbers); `atlas-view-model.test.ts` still asserts 132/150
      and 200/224 via the constants.
- [ ] `demos/atlas-node.tsx` is rewritten to:
      - import the size constants from `../../components/atlas/atlas-display` and
        `AtlasNodeReveal` + `AtlasNodeRevealItem` from
        `../../components/atlas/AtlasNodeReveal`, and build an `AtlasNodeCard` per
        node (a compact "unseen dream" text card for unrevealed/unreachable, a
        `fullBleed` scene card for revealed nodes) using `richText`/`artRef` the way
        the view-model does — no `eyebrow` field (gone as of Task 4);
      - use `ATLAS_NODE_SIZE_DESKTOP` / `ATLAS_ANCHOR_NODE_SIZE_DESKTOP` in place of
        the removed local `size = 96` / `bossSize = 112`, and add an
        `AtlasNodeDemoArgs` control `mobileSizing?: boolean` (default false) that
        swaps in the mobile sizes + `ATLAS_BADGE_SCALE_MOBILE`;
      - carry a **forced-blank forgone fixture**: the `n-forgone` row matches what
        `buildAtlasMapNodes` produces for an unreachable node — `iconRef: null`,
        `siteBadgeGlyph: null`, `knownDreamsignRef: null`, `isReachable: false` (the
        dimmed empty frame); its old bright `grid_city` icon + badge are gone;
      - carry an explicit `isReachable: false` node beside a reachable one so the
        fade shows side by side;
      - **mount `AtlasNodeReveal`, not bare `AtlasNode` with a faked `hovered`** —
        following the `site-node` demo: the demo `Component` owns a `stageRef`, lays
        out `AtlasNodeRevealItem`s inside a `.dream-atlas .nodes` stage, and renders
        `<AtlasNodeReveal item={item} stageRef={stageRef} onEnterNode={() => undefined} />`
        per item; the `hovered` demo arg and the `DemoNode.hovered` field are gone;
      - the `usage[]` snippet and the file header show `AtlasNodeReveal` (the
        production surface), current-state phrasing.

**Verify**
- [ ] `npm run regenerate-assets`; `npm run lint && npm run typecheck && npm test` — green.
- [ ] Browser QA: `/cumulus#/atlas-node` at desktop + mobile — nodes render at
      production sizes; the forgone node is a dimmed empty frame; the
      `isReachable:false` node fades; toggling `mobileSizing` enlarges nodes + badges;
      **press/hover a node and confirm the real InfoCard reveal appears** (live press
      engine), not a static glow; no console errors.
- [ ] Commit: `refactor(cumulus): atlas demo mounts AtlasNodeReveal and uses production node sizes/forgone shape` + push.

---

## Task 6 — TideDisc demo: canonical disc-inside-reveal usage + fold in the tide-spec palette reference

**Files**
- `src/cumulus/docs/demos/tide-disc.tsx` (add the canonical `InfoCard.PressInfo` usage; document the `tide-spec` palette as TideDisc's source)

**Interfaces / decision:** production never renders a bare `TideDisc` — it always
renders one inside an `InfoCard.PressInfo` reveal (`quest-start-shared.tsx`: a
`TideDisc` is the trigger, its description reveals through `InfoCard.PressInfo`).
The demo should show the disc-with-reveal as canonical. `tide-spec.ts` is a
type-only palette module with no renderable component; its palette is exactly what
`TideDisc` renders, so **document `tide-spec` on the TideDisc page** (docName stays
`TideDisc`) rather than minting a fake component/registry entry — this keeps the
generator's `docName ∈ metadata` contract honest (`tide-spec` exposes no PascalCase
component the metadata generator could key a page on, and `TideDisc` is its
canonical renderer).

**End state**
- [ ] `demos/tide-disc.tsx` gains a `usage[]` entry (`label` + `note` + `code`)
      showing the canonical composition: a `TideDisc` as the trigger of an
      `InfoCard.PressInfo` reveal anchored to a `stageRef`, mirroring
      `quest-start-shared.tsx`. The `note` states that in production a tide disc
      always carries its tide's description through the shared reveal, never a bare
      disc. Representative snippet (shape to pin down):
      ```tsx
      <InfoCard.PressInfo stageRef={stageRef} card={<InfoCard variant="tide" tide="valor" … />}>
        <TideDisc tide="valor" id={tideDeckId} label="Tide: Valor" interactive />
      </InfoCard.PressInfo>
      ```
- [ ] The demo's `blurb` (or an added `callout`, plain string literal) names
      `tide-spec` as the palette's home: the five tides (Ember `#fb923c`, Valor
      `#facc15`, Vision `#60a5fa`, Wild `#4ade80`, Shadow `#c084fc`) and their fixed
      glyphs live in `src/cumulus/components/hud/tide-spec.ts` (`TIDES` / `tideVisual`
      / `tideAlignmentLabel`); `TideDisc`, InfoCard's tide variant, and any tide chip
      read that one table so a tide reads identically everywhere.
- [ ] If the live demo `Component` currently renders only bare discs, wire one disc
      through `InfoCard.PressInfo` with a `stageRef` (site-node pattern) so the
      catalog page shows the reveal live.

**Verify**
- [ ] `npm run regenerate-assets`; `npm run lint && npm run typecheck && npm test` — green.
- [ ] Browser QA: `/cumulus#/tide-disc` — the palette prose renders; press/hover a
      disc and the tide reveal appears; no console errors.
- [ ] Commit: `docs(cumulus): show canonical TideDisc-in-reveal usage and document the tide-spec palette` + push.

---

## Task 7 — Rebuild the atlas mockup on the real AtlasMap

**Files**
- `src/cumulus/docs/mockups/atlas-map.tsx` (`AtlasMapMockup` — rebuild to mount the real `AtlasMap`)
- (shared) a small in-demo fixture helper for `AtlasMapNode[]` / `AtlasMapEdge[]`, reusable by the atlas-node demo

**Decision — REBUILD from the real `AtlasMap` (not archive).** The mockup is stale
in orientation (horizontal; production is vertical bottom-up), chrome (a title
block the real screen omits), and math (its own scale-to-fit copy). Mounting the
real `AtlasMap` component *removes* the duplicated scale-to-fit math and the wrong
orientation rather than duplicating anything — so the "prefer archived if a rebuild
duplicates AtlasMap" guard does not apply (mounting ≠ duplicating). AtlasMap is now
a documented workhorse (Task 15); its full-screen mockup should mount the real
surface, and archiving would strand the atlas's one documentable scene.

**Interfaces:** `AtlasMap` takes `stageWidth`, `stageHeight`, `nodes:
AtlasMapNode[]`, `edges: AtlasMapEdge[]`, `onEnterNode`, `stageRef`. The view-model
builder (`buildAtlasMapNodes`) lives in `src/screens/` and is **out of reach**
across the boundary, so the mockup synthesizes representative `AtlasMapNode[]` /
`AtlasMapEdge[]` fixtures in-Cumulus (like the atlas-node demo builds `AtlasNodeView`s),
using `artRef`/`glyph` and the `ATLAS_NODE_SIZE_*` constants from Task 5.

**End state**
- [ ] `AtlasMapMockup` renders a full-bleed (100vw×100vh) `.dream-atlas` scene
      owning a `stageRef` and mounts the real `AtlasMap` with fixture nodes/edges and
      `onEnterNode={() => undefined}`. It uses the production stage dimensions from
      the exported stage constants (grep for `ATLAS_STAGE_WIDTH`/height — do not
      re-type literals). The fixtures form a vertical run graph (starter at bottom →
      boss at top) across the lifecycle states + one `isReachable:false` node, each
      with an `AtlasNodeCard` reveal and forward `AtlasMapEdge`s.
- [ ] The node-fixture logic is reused from the atlas-node demo where practical
      (extract a shared `__atlas-fixtures__` helper if it avoids a second copy — a
      `__*__` name is skipped by the metadata glob); node sizes are imported from
      `atlas-display.ts`, not re-typed.
- [ ] The mockup's hand-rolled scale-to-fit copy, horizontal layout, and title-block
      chrome are gone — `AtlasMap` owns the scale-to-fit and the vertical orientation.
      The mockup file header describes the current (real-AtlasMap) mockup.
- [ ] `mockups/registry.ts` maps `"atlas-node"` and `"atlas-edge"` (and, after Task
      15, `"atlas-map"`) to `AtlasMapMockup`.

**Verify**
- [ ] `npm run regenerate-assets`; `npm run lint && npm run typecheck && npm test` — green.
- [ ] Browser QA: `/cumulus#/atlas-node/mockup` (and `#/atlas-map/mockup` after Task
      15) at desktop + mobile — the map renders vertically, scales to fit
      (letterboxed), nodes reveal on press/hover through the real engine, no title
      block, no console errors.
- [ ] Commit: `refactor(cumulus): rebuild the atlas mockup on the real AtlasMap surface` + push.

---

## Workhorse documentation (Tasks 8–15)

Tasks 8–15 add the undocumented load-bearing modules to the catalog **in adoption
order**. Each task follows the same shape: write `demos/<id>.tsx` exporting a
`CumulusComponent`, append it to `CUMULUS_COMPONENTS` in `registry.ts` in its stated
`group`, confirm the `docName` already resolves in metadata (all are `.tsx`
components/primitives, so it does), regenerate, verify green, browser-QA the page,
commit. `no-ghost-components` passes for each (every module has real consumers).

For each: the **Interfaces** block below is the API + the one-line documented scope
the demo's prose must convey. The demo `blurb`/`callout`/`usage[]` must be plain
string literals (generator constraint), state the current system only, and cover
that scope — the executor writes the prose with the typechecker in the loop. Read
the real component's props before writing so the prose is accurate.

---

### Task 8 — Document DreamcallerPortrait (~19 consumers)

**Files:** `src/cumulus/docs/demos/dreamcaller-portrait.tsx` (new); `registry.ts` (import + append, Components group).

**Interfaces:** `DreamcallerPortrait({ dreamcaller: DreamcallerVisual, variant?:
"hero" | "panel" | "thumb", size?: number })`. `docName: "DreamcallerPortrait"`,
`id: "dreamcaller-portrait"`, `title: "Dreamcaller Portrait"`, `group: "Components"`.
Highest-adoption undocumented module — document first.

**One-line scope the prose must convey:** the ONE way to render a dreamcaller's
character art — the transparent full-body cutout on a tinted radial backdrop, in
one of three fixed framings (`hero` showcase / `panel` square for profile cards +
popovers / `thumb` square for HUD rows + resident lists); a 404 art asset falls
back to a tinted monogram disc.

**Demo must:** live `Component` renders the three variants side by side against a
real `DreamcallerVisual` (curated `imageNumber` + name/title; art from `public/`).
`callout`: no style/className escape hatch — pass a fixed pixel `size` (the portrait
then refuses to shrink in a flex row) or omit it to fill the container; for any
other layout, wrap the portrait. `usage[]`: one entry each for hero / panel-in-a-
profile-card / thumb-in-a-HUD-row with real prop shapes. `demo.defaultArgs: {
variant: "panel", size: 160 }`; `sampleContent` = the `dreamcaller` object.

**Verify:** regenerate; lint/typecheck/test green; Browser QA `/cumulus#/dreamcaller-portrait`
(three framings + monogram fallback if pointed at a missing `imageNumber`;
adoption count > 0; no console errors). Commit: `docs(cumulus): document DreamcallerPortrait` + push.

---

### Task 9 — Document HoverPopover (13 consumers) with the HoverPopover-vs-InfoCard decision rule

**Files:** `src/cumulus/docs/demos/hover-popover.tsx` (new); `registry.ts` (import + append).

**Interfaces:** `HoverPopover` (`overlay/HoverPopover.tsx`) — a reusable hover
popover primitive: renders `children` in a trigger wrapper (`triggerAs` `span`
default / `div`), and on hover/focus (after `delayMs`) portals `content` to
`document.body`, viewport-aware via `computePopoverPlacement` (flips top/left to
stay on-screen); `pointer-events: none` so it never eats clicks. Exports
`CARD_HOVER_PREVIEW_DELAY_MS` (300) and `CARD_HOVER_PREVIEW_WIDTH_PX` (240).
`docName: "HoverPopover"`, `id: "hover-popover"`, `title: "Hover Popover"`,
`group: "Primitives"`.

**One-line scope:** a lightweight hover/focus tooltip primitive that portals a small
content node to `document.body`, kept on-screen by a viewport-aware placement pass;
used for glossary-term definitions on rules text and full-card previews on compact
deck rows.

**Decision rule (LOAD-BEARING — the `callout`; resolves `pre-existing-issues.txt`
readiness-gap item 2). Grep both consumer sets before asserting it as fact and
adjust wording if a consumer contradicts it:**
- **`InfoCard` / `InfoCard.PressInfo`** — the canonical reveal for **object / entity
  cards** (a card, dreamcaller, dreamsign, tide, site): the input-adaptive press
  engine (fine-pointer hover OR touch press-down), pointer-anchored, clamped
  above/beside, no close button. This is the "Popup rule" in SKILL.md and covers
  every game-object reveal.
- **`HoverPopover`** — a lightweight **hover-only tooltip** for a small informational
  node beside a trigger (a glossary term definition on rules text, a full-card
  preview on a compact deck row, a pip-badge tooltip): hover/focus only (no
  touch-hold contract), simpler placement. Reach for it when the reveal is a passive
  tooltip rather than an object/entity card, on a fine-pointer (desktop) surface.

**Demo must:** live `Component` wraps trigger text and reveals a small content node
on hover. `usage[]`: an inline-trigger tooltip (`triggerAs` default) and a
block-trigger deck-row preview (`triggerAs="div"`), showing `delayMs` + `content`.
`demo.defaultArgs`: `{ delayMs: CARD_HOVER_PREVIEW_DELAY_MS }` (or inline `300`);
`content` via `sampleContent`.

**Verify:** regenerate; green; Browser QA `/cumulus#/hover-popover` (hover shows the
tooltip, stays on-screen near a viewport edge; no console errors). Commit:
`docs(cumulus): document HoverPopover with the InfoCard-vs-HoverPopover decision rule` + push.

---

### Task 10 — Document HoverZoomCard (8 consumers)

**Files:** `src/cumulus/docs/demos/hover-zoom-card.tsx` (new); `registry.ts` (import + append).

**Interfaces:** `HoverZoomCard` (`card/HoverZoomCard.tsx`) — wraps a medium card so
hovering grows it *in place* (portaled copy over the original footprint,
`pointer-events: none`, shrinks when the pointer leaves the *original* rect so a row
pops each in turn). No style/className escape hatch; set `fill` when a fixed-box
wrapper sizes it. Exports `MAX_SCALE` (1.5) and `TARGET_WIDTH_PX` (340). `docName:
"HoverZoomCard"`, `id: "hover-zoom-card"`, `title: "Hover Zoom Card"`, `group:
"Components"`.

**One-line scope:** wraps a medium card so hovering grows the card itself in place —
the enlarged copy pops out of the layout (above neighbours and any `overflow:
hidden`) while the original keeps its footprint and interactivity; growth capped at
`MAX_SCALE` 1.5× and a legible-rules-text target width.

**Demo must:** live `Component` lays out a small row of `HoverZoomCard`-wrapped cards
so neighbours pop in turn. `callout`: layout is the caller's (no escape hatch) —
set `fill` when the wrapper gives the card a fixed box to fill (e.g. a battle-hand
slot). `usage[]`: a plain wrap and a `fill` variant inside a fixed slot.
`demo.defaultArgs: { fill: false }`; card content via `sampleContent`.

**Verify:** regenerate; green; Browser QA `/cumulus#/hover-zoom-card` (hover grows the
card, neighbours pop in turn, no layout shift; no console errors). Commit:
`docs(cumulus): document HoverZoomCard` + push.

---

### Task 11 — Document GlowIcon (8 consumers)

**Files:** `src/cumulus/docs/demos/glow-icon.tsx` (new); `registry.ts` (import + append).

**Interfaces:** `GlowIcon` (`controls/GlowIcon.tsx`) — a Boxicons glyph for card
resource marks: paints via the element's text color (caller passes the resource
hue), with an optional content-protection shadow pinned to `font-size` and an
optional caller-supplied glow. Exports the canonical resource glyph/color constants
(`SPARK_ICON_COLOR`, `ENERGY_ICON_COLOR`, `SPARK_ICON_CLASS`, `ENERGY_ICON_CLASS`,
`BOLT_ICON_CLASS`, `SPARK_INLINE_ICON_CLASS`, `ICON_SHADOW_FILTER`). Read
`GlowIconProps` for the exact prop list before writing. `docName: "GlowIcon"`, `id:
"glow-icon"`, `title: "Glow Icon"`, `group: "Primitives"`.

**One-line scope:** a Boxicons glyph for the card resource marks (spark, energy,
activated-ability bolt) that paints in the caller's resource hue with an optional
content-protection shadow pinned to its own font-size; the spark/energy hues + glyph
classes are exported here as the single source of truth so a corner orb and an
inline rules-text reference read as the same resource.

**Demo must:** live `Component` renders the spark/energy/bolt marks at a couple of
sizes, with and without glow. `usage[]`: a corner spark mark, an inline energy mark,
an activated-ability bolt. `demo.defaultArgs`: seed from `GlowIconProps` (real glyph
+ color + size).

**Verify:** regenerate; green; Browser QA `/cumulus#/glow-icon` (marks render in the
resource hues with shadow/glow; no console errors). Commit: `docs(cumulus): document GlowIcon` + push.

---

### Task 12 — Document rich-text (8 consumers)

**Files:** `src/cumulus/docs/demos/rich-text.tsx` (new); `registry.ts` (import + append).

**Interfaces:** the `rich-text` module (`card/rich-text.tsx`) exports the `RichText`
model (`plain` | `rules` | `note` | `stack`), the `richText` constructors,
`renderRichText`, and the `RichTextView` component. Copy slots (`InfoCard.body`)
take a `RichText`, never a `ReactNode`. The renderable is `RichTextView({ value:
RichText })` → **`docName: "RichTextView"`** (present in metadata). Distinct from the
existing `rules-text` demo (`RulesText`, the raw parser): rich-text is the
design-system *model* a caller states declaratively. `id: "rich-text"`, `title:
"Rich Text"`, `group: "Components"`.

**One-line scope:** the design system's model for a run of formatted copy — the
caller describes WHAT text is (`plain` / `rules` with glossary-keyword emphasis +
inline resource glyphs / muted `note` / `stack`) and the renderer owns HOW it looks;
copy slots take a `RichText`, never an arbitrary node.

**Demo must:** live `Component` is `RichTextView` (assign it to the `Component` slot;
seed a `RichText` via `sampleContent.value`). `callout`: build values with the
`richText` constructors (`.plain`, `.rules`, `.note`, `.stack`) and pass them to a
copy slot; render a standalone value with `RichTextView`. `usage[]`: a
`richText.rules(...)` into an `InfoCard.body`; a `richText.stack(richText.plain(...),
richText.note(...))` for a blurb + status note. `demo.defaultArgs: {}`;
`sampleContent.value` = a `richText.rules(...)`.

**Verify:** regenerate; green; Browser QA `/cumulus#/rich-text` (the four kinds render
— keyword emphasis + inline glyphs on `rules`, muted italic on `note`; no console
errors). Commit: `docs(cumulus): document the rich-text model (RichTextView)` + push.

---

### Task 13 — Document GlossaryDefinitionCard (6) and CardTermDefinitions (5)

**Files:** `src/cumulus/docs/demos/glossary-definition-card.tsx` (new);
`src/cumulus/docs/demos/card-term-definitions.tsx` (new); `registry.ts` (import +
append both, adjacent in the Components group).

**Interfaces:**
- `GlossaryDefinitionCard({ entry: GlossaryEntry })` — the one keyword-definition
  tile: a single glossary entry as an `InfoCard` (text variant), keyword as
  headline, rules text as a `richText.rules` body; establishes its own `.cumulus`
  token scope so it renders inside popovers portaled outside the Cumulus subtree;
  exposes `data-glossary-term`. `docName: "GlossaryDefinitionCard"`, `id:
  "glossary-definition-card"`, `title: "Glossary Definition Card"`, `group:
  "Components"`.
- `CardTermDefinitions({ text, testId?, side? })` — a vertical stack of
  `GlossaryDefinitionCard`s for every gameplay term in a stretch of rules text
  (reading order, de-duped); returns `null` when the text references no terms.
  `docName: "CardTermDefinitions"`, `id: "card-term-definitions"`, `title: "Card
  Term Definitions"`, `group: "Components"`.

**Fixture constraint (both demos):** derive the sample `GlossaryEntry` / term-bearing
text from **live glossary data** — do NOT hardcode a term string a data edit could
invalidate (pick the first entry / a real term-bearing string programmatically).

**Demos must:**
- glossary-definition-card: live `Component` renders one `GlossaryDefinitionCard`
  from a real entry. Scope prose: the one keyword-definition tile, rendered in the
  same glass shell / radius / type scale as every reveal beside it, re-establishing
  its own `.cumulus` scope so it works inside a portaled popover. `usage[]`: one entry
  rendering the card beside a card. Seed `entry` via `sampleContent`.
- card-term-definitions: live `Component` renders `CardTermDefinitions` for a
  stretch of rules text referencing a couple of terms. Scope prose: a
  reading-order, de-duped stack of `GlossaryDefinitionCard`s for every gameplay term
  in the text, rendered beside/beneath a card so a player reads every highlighted
  keyword without inline tooltips; renders nothing when there are no terms, so
  callers place it unconditionally. `usage[]`: `<CardTermDefinitions
  text={card.rulesText} side="right" />`. Seed `text` via `defaultArgs` (a real
  term-bearing string) + `side`.

**Verify:** regenerate; green; Browser QA `/cumulus#/glossary-definition-card` and
`/cumulus#/card-term-definitions` (the tile and the stack render; no console errors).
Commit: `docs(cumulus): document GlossaryDefinitionCard and CardTermDefinitions` + push.

---

### Task 14 — Document PipBadge (3 consumers)

**Files:** `src/cumulus/docs/demos/pip-badge.tsx` (new); `registry.ts` (import + append).

**Interfaces:** `PipBadge({ variant: "spark" | "energy", value: string, size?: "sm"
| "md", scale?: number, ariaLabel?, tooltip? })` — a circular numeric badge for card
corner stats; white value with a thin outline; an optional `tooltip` wraps it in a
`HoverPopover` (a longer 1000ms delay so brushing past a corner doesn't fire).
Exports `SPARK_PIP_COLOR` (`#facc15`) / `ENERGY_PIP_COLOR` (`#0ea5e9`) as the
canonical resource fills. `docName: "PipBadge"`, `id: "pip-badge"`, `title: "Pip
Badge"`, `group: "Controls"` (or the group its siblings use).

**One-line scope:** a circular numeric badge for card corner stats (spark + energy
cost), white value + thin outline for legibility over a colored fill at small card
sizes; each variant owns its resource fill (the same tokens the inline rules-text
glyphs read, so a corner pip and an inline reference cannot drift); an optional
`tooltip` makes it a hover anchor on a longer delay tuned for card corners.

**Demo must:** live `Component` renders a spark and an energy pip at `sm`/`md`, one
with a `tooltip`. `usage[]`: a corner spark pip, an energy-cost pip with a `tooltip`.
`demo.defaultArgs: { variant: "spark", value: "3", size: "sm" }`.

**Verify:** regenerate; green; Browser QA `/cumulus#/pip-badge` (pips at both sizes;
tooltip on long hover; no console errors). Commit: `docs(cumulus): document PipBadge` + push.

---

### Task 15 — Document AtlasMap (the documentable atlas surface)

**Files:** `src/cumulus/docs/demos/atlas-map.tsx` (new); `registry.ts` (import +
append); `src/cumulus/docs/mockups/registry.ts` (add `"atlas-map": AtlasMapMockup`).

**Interfaces:** `AtlasMap` (`atlas/AtlasMap.tsx`) — the Dream Atlas map surface: the
run graph of nodes + edges fitted into a fixed design stage that scales to fit
(letterboxed); owns the `.dream-atlas` scope and the uniform scale-to-fit; each node
reveals through the shared InfoCard press engine (`AtlasNodeReveal`). Props:
`stageWidth`, `stageHeight`, `nodes: AtlasMapNode[]`, `edges: AtlasMapEdge[]`,
`onEnterNode`, `stageRef`. `docName: "AtlasMap"`, `id: "atlas-map"`, `title: "Atlas
Map"`, `group: "Components"`. This is the atlas's documentable surface (not the bare
node/edge). Reuse the Task-7 fixture helper for `nodes`/`edges`.

**One-line scope:** the Dream Atlas map surface — the run graph fitted into a fixed
design stage that scales to fit its container (letterboxed); it owns the
`.dream-atlas` scope and the uniform scale-to-fit while the placed view models decide
the vertical layout (starter bottom, boss top); each node reveals its detail through
the shared InfoCard press engine (hover on desktop, press-down on touch).

**Demo must:** live `Component` mounts the real `AtlasMap` with the fixture
nodes/edges and a `stageRef` inside a bounded stage. `usage[]`: `<AtlasMap
stageWidth={…} stageHeight={…} nodes={nodes} edges={edges} onEnterNode={enterDreamscape}
stageRef={stageRef} />` with a note that the atlas screen composes it with
atmosphere/HUD and supplies the placed view models from the view-model builder. Seed
`nodes`/`edges` via `sampleContent`; `defaultArgs` carry the stage dims from the
exported stage constants.

**Verify:** regenerate; green; Browser QA `/cumulus#/atlas-map` and `/cumulus#/atlas-map/mockup`
at desktop + mobile (the map scales to fit, nodes reveal live; no console errors).
Commit: `docs(cumulus): document AtlasMap` + push.

---

## Task 16 — Document InfoCard's mobile scale + above-only placement contract

**Files**
- `src/cumulus/docs/demos/info-card.tsx` (add a `callout` + a usage entry — the generated `info-card.md` picks these up)

**Interfaces / facts to state truthfully (from `InfoCard.tsx`) — these constants are
contracts; keep them literal:**
- Every info card is `CARD_W = 248`px wide at native (`INFO_CARD_WIDTH`).
- On a narrow viewport the laid-out width is `MOBILE_WIDTH_FRACTION = 0.45` of the
  viewport, capped at `CARD_W` (`infoCardWidth(viewportWidth) = Math.min(248, 0.45 *
  viewportWidth)`), so desktop keeps the authored geometry; the implicit mobile
  cutoff is `CARD_W / 0.45 ≈ 551px`.
- Mobile cards use a smaller internal type scale `MOBILE_TEXT_SCALE = 0.666`
  (`infoCardTextScale`), so the overlaid glass text block covers less of an
  image-led reveal.
- **Placement (`computePopoverPosition`): the reveal sits ABOVE the pressed object
  and is NEVER placed below it.** In order: (1) fully above at the uniform gap,
  centered over the anchor; (2) pinned to the top screen inset at a reduced gap when
  it still clears the obstacle; (3) pinned to the top and shifted sideways (left/right,
  whichever half of the screen is emptier) to clear the press area and, on touch, a
  fingertip disc; when neither side fits, it stays centered at the top — still above.
  The obstacle folds in a `FINGER_RADIUS_PX` disc on a touch press so the reveal
  never covers the finger.

**End state**
- [ ] `infoCardDemo` gains a `callout` (plain string literal) stating the above-only
      placement contract: the reveal is always anchored ABOVE the pressed object and
      never drops below it — it prefers centered above at a uniform gap, falls back to
      pinning at the top inset, and finally shifts sideways to clear the press area
      (and, on touch, the finger), so a card too tall to fit above a low trigger pins
      to the top rather than covering the object under the finger.
- [ ] `infoCardDemo` gains a `usage[]` entry `label: "Mobile scale"` whose `note`
      states the width/type-scale contract (248px native, 45% of viewport capped at
      native, 0.666 mobile type scale, driven by viewport not a caller prop) and
      whose `code` shows the exported helpers:
      ```tsx
      import { infoCardWidth, infoCardTextScale, INFO_CARD_WIDTH } from "src/cumulus/components/overlay/InfoCard";
      const w = infoCardWidth(window.innerWidth);         // min(248, 0.45 * vw)
      const scale = infoCardTextScale(window.innerWidth); // 1 on desktop, 0.666 on mobile
      ```

**Verify**
- [ ] `npm run regenerate-assets` — `info-card.md` gains the Guidance callout and the
      Mobile-scale usage section.
- [ ] `npm run lint && npm run typecheck && npm test` — green.
- [ ] Commit: `docs(cumulus): document InfoCard's mobile scale and above-only placement` + push.

---

## Task 17 — Document the draft screen idiom and the device-frame QA hook

**Files**
- `.llms/skills/cumulus-migrate/SKILL.md` (add the floating pick-counter idiom + draft-screen note in the idioms section)
- `docs/quest_prototype/qa_scenes.md` (document `?demo=device-frame` and `DeviceFrameDemo`)

**Interfaces / facts:**
- The draft screen (`DraftScreen.tsx`) is the first post-audit screen: clean token
  usage, card aspect from exported constants, `cardNumber` identity end-to-end with
  names resolved only at the display edge, and a **floating "Draft (n/total)" pick
  counter**. Its `?goto=` scene was registered in Phase 3.
- `DeviceFrameDemo` (`src/cumulus/screens/devtools/DeviceFrameDemo.tsx`) is a
  browser-QA page mounted via `?demo=device-frame` (wired in `src/main.tsx`
  `demoParam === "device-frame"`). It proves the device-frame safe-area injection
  end to end: a title band padded by `var(--safe-area-inset-top)` clearing the
  Dynamic Island, and a control parked to the right of the island from the
  `--display-cutout-*` box, with dashed guides. Captured through
  `node scripts/device-screenshots.mjs -d iphone-16 --query 'demo=device-frame'`. It
  is registered in neither `qa-scenes.ts` nor `qa_scenes.md` today.

**End state**
- [ ] `.llms/skills/cumulus-migrate/SKILL.md` gains a short "Floating pick counter"
      idiom under the working-idioms section: the draft screen's floating
      `Draft (n/total)` counter — a small, screen-anchored HUD element floating over
      the pack grid, cleared of the app-shell hamburger via the exported
      menu-geometry constants (Phase 3's hamburger-clearance fix), reserved above by
      the safe-area floor — as the pattern to copy for a "progress-through-a-sequence"
      screen. Cross-reference the draft `?goto=` scene from Phase 3. Current-state
      phrasing only.
- [ ] `docs/quest_prototype/qa_scenes.md` gains a section documenting the `?demo=<name>`
      devtool hook alongside `?goto=`: `?demo=device-frame` mounts `DeviceFrameDemo`,
      what it proves (safe-area inset padding + cutout-box placement, with dashed
      guides), the capture command `node scripts/device-screenshots.mjs -d iphone-16
      --query 'demo=device-frame'`, and that `?demo=` bypasses the quest workflow
      (wired in `src/main.tsx`).

**Verify**
- [ ] `npm run lint && npm run typecheck && npm test` — green (docs-only, but run the
      drift tests in case `qa_scenes.md` is checked).
- [ ] Commit: `docs(quest): document the draft pick-counter idiom and the device-frame QA hook` + push.

---

## Task 18 — Deck-viewer platform divergence: add the mobile card count, write the filter decision

**Files**
- `src/cumulus/screens/MobileDeckViewer.tsx` (add the card count to the `TopBand`)
- `src/cumulus/screens/desktop-deck-filter.ts` / `src/cumulus/screens/mobile-deck-filter.ts` (a cross-referencing divergence comment, if not already present)

**Decision — ADD the count to the mobile header (parity fix), and record the
filter-model divergence as intentional.** Rationale:
- The desktop header shows "Your Deck" + "{count} Cards" (`DesktopDeckViewer.tsx`
  `Header`, `count={view.cards.length}`). The mobile `TopBand` renders only the "Your
  Deck" title — no count — yet the `MobileDeckViewer` file's own docstring *claims* a
  "count". The omission contradicts the file's own contract and "reads as an accident"
  (the audit's words). The count is already in hand (`view.cards.length`). So the
  honest resolution is to *remove the accident*: render the count in the mobile band,
  matching desktop — not to bless the gap.
- The **filter-model** divergence (desktop: separate type / subtype / sort-key /
  sort-direction axes; mobile: one combined type/subtype dropdown + fixed
  low-to-high order) is legitimate platform divergence — the desktop viewer has room
  the mobile band does not. It is already stated in both filter-module headers; add a
  one-line cross-reference so the decision is discoverable from either side.

**End state**
- [ ] `MobileDeckViewer.tsx`: the `TopBand` renders a card-count line under (or
      beside) the centered "Your Deck" title, styled as the shared eyebrow
      (`--t-eyebrow` / `--tracking-eyebrow`), reading `view.cards.length` with the
      same "{n} Card / Cards" pluralization desktop uses. Thread a `count` prop into
      `TopBand` (it already receives `onClose`/`controls`). The docstring's "count"
      claim is now true.
- [ ] Each deck-filter module header carries a one-line divergence note
      cross-referencing the other and stating the divergence is intentional (desktop
      spends its extra room on more granular filter axes; the low-to-high sort order
      is shared verbatim so a deck sorts identically on both). Add the reciprocal
      pointer only if missing.

**Verify**
- [ ] `npm run lint && npm run typecheck && npm test` — green.
- [ ] Browser QA (mobile viewport, e.g. iPhone width): the deck viewer band shows
      "Your Deck" + a card count matching the deck size; filtering does not change the
      total-count line (it reflects the whole deck, matching desktop); spacing stable,
      no clipping under the notch; no console errors. Compare against desktop at a
      wide width for parity.
- [ ] Commit: `feat(cumulus): show the card count in the mobile deck viewer header; document the deck-filter divergence` + push.

---

## Task 19 — Refresh stale doctrine comments (glass-surface consumer list; verify SITE_DISC)

**Files**
- `src/cumulus/internal/glass-surface.ts` (post-Phase-0 path; the doctrine comment's consumer list)
- `src/cumulus/components/overlay/InfoCard.tsx` (`SITE_DISC` comment — verify only)

**Interfaces / facts:** the `glass-surface.ts` doctrine comment enumerates who
spreads `glassSurfaceStyle()`. As of the audit it named only InfoCard +
MobileDeckViewer (stale — omitted DesktopDeckViewer + StartingDeckModal). Phases
0–3 changed consumers again (recipe moved to `src/cumulus/internal/`; `IconButton` /
`GlassButton` / `GlassDialog` now consume it; `GlassDialog` owns the shared backdrop
the deck viewers render through; StartingDeckModal migrated into the Cumulus tier).
The comment must state the **final, grepped truth**.

> If `glass-surface.ts` is still under `src/cumulus/components/controls/` at execution
> time, Phase 0 has not landed — resolve the phase ordering first.

**End state**
- [ ] Re-grep the real consumers: `grep -rn "glassSurfaceStyle(\|glassTrack" src/cumulus/`.
      The doctrine comment's consumer sentence is rewritten to the grepped list, in
      current-state phrasing (no "no longer"). Expected post-Phase-3 consumers: the
      InfoCard reveal shell, `IconButton`, `GlassButton`, `GlassDialog` (with
      `GlassDialog` owning the shared backdrop the deck viewers use). Keep the "ONE
      glass material" claim and the token-backed material description from Phase 1.
- [ ] The `SITE_DISC` comment in `InfoCard.tsx` is verified against Phase 1's
      `--badge-disc-gradient` reality: if already correct, make NO change; if a stale
      claim (SiteNode shares the gradient) survived, correct it to the shared-token
      reality.

**Verify**
- [ ] `npm run lint && npm run typecheck && npm test` — green.
- [ ] Grep guard: `grep -rn "no longer\|used to\|unlike before" src/cumulus/internal/glass-surface.ts` — expect **empty**.
- [ ] Commit: `docs(cumulus): refresh the glass-surface doctrine consumer list to the current tree` + push.

---

## Task 20 — Housekeeping: resolve the pre-existing-issues entries + final grep sweep

**Files**
- `pre-existing-issues.txt` (rewrite/delete the audit-follow-up and readiness-gap entries this program resolved)

**Facts:** the file documents **OPEN** issues; a resolved item is **deleted**, not
marked done. This is the final phase, so the whole audit program (Phases 0–4) is
complete at this commit.

- **"Cumulus design-system audit follow-ups (2026-07-06)"** — the entire prioritized
  action-item list is executed by this program → **delete the section**.
- **"Cumulus readiness gaps" item 2** (popup-rule conflict: bless HoverPopover or
  migrate) — resolved by Task 9's documented decision rule → **delete item 2**.
- **"Cumulus readiness gaps" item 1** (~9 undocumented components) — this phase
  documented DreamcallerPortrait, HoverPopover, HoverZoomCard, GlowIcon, rich-text,
  GlossaryDefinitionCard, CardTermDefinitions, PipBadge (and AtlasMap). It did NOT
  document EssenceValue (deferred to its `ResourceChip` migration — out of scope),
  LeaveSiteButton, or CardStatOrb. So **rewrite item 1** to name only the residual
  undocumented components (EssenceValue — pending the `ResourceChip`/`EssenceValue`
  migration; LeaveSiteButton; CardStatOrb), in current-state phrasing, rather than
  deleting it. Leave items 3–7 (and the other unrelated sections) untouched.

**Steps**
- [ ] Read `pre-existing-issues.txt` at execution time and reconcile with the above
      (Phases 0–3 may have added/removed entries). Delete the "Cumulus design-system
      audit follow-ups (2026-07-06)" section and readiness-gap item 2; rewrite item 1
      to the residual list. Do not touch unrelated sections (bx-refresh, QuestStart
      overflow, npm audit, deck-viewer logging, dev-with-emulator, setup-assets
      flakiness, spine-redundancy, tides4 annotations, dreamscape-redesign items).
- [ ] Final program-wide grep sweep — deleted components leave **zero** references
      (expect empty output for each, excluding the unrelated local `StatTile` in
      `src/debug/OpponentDebugApp.tsx`):
      ```
      grep -rn "StatTile"  src/cumulus/ src/screens/ .llms/skills/cumulus/
      grep -rn "TidePill"  src/ .llms/skills/cumulus/
      ```
      Confirm the only surviving `StatTile` hit repo-wide is the unrelated
      `OpponentDebugApp.tsx` local function.
- [ ] `npm run lint && npm run typecheck && npm test` — green.
- [ ] Commit: `docs: resolve the Cumulus audit-follow-up and readiness-gap items closed by the revisions program` + push.

---

## Task 21 — Phase boundary verification

**Files:** none (verification + any regeneration drift).

**Steps**
- [ ] `npm run regenerate-assets` — confirm no uncommitted drift remains (`git status`
      clean after commit); metadata no longer lists StatTile / TidePill (and `Tide`),
      the `components/` dir has no `stat-tile.md` / `tide-pill.md`, and the new
      workhorse `.md` files (`dreamcaller-portrait.md`, `hover-popover.md`,
      `hover-zoom-card.md`, `glow-icon.md`, `rich-text.md`,
      `glossary-definition-card.md`, `card-term-definitions.md`, `pip-badge.md`,
      `atlas-map.md`) exist. Commit any drift.
- [ ] `npm run lint && npm run typecheck && npm test` — all green, including:
      - `scripts/cumulus-ghost-components.test.mjs` with the **empty** `BASELINE`
        (every registry entry has a real consumer; no ghosts).
      - `scripts/cumulus-orphan-tokens.test.mjs` (no orphaned tokens introduced).
      - `scripts/generate-cumulus-metadata.test.mjs` / `cumulus-generated-docs-drift.test.mjs`
        (generated outputs match sources).
      - `DreamscapeScreen.test.tsx`, `atlas-view-model.test.ts`,
        `atlas-reachability.test.ts` (production contracts intact).
- [ ] Confirm the whole program's rule set is enabled (Phase 0 set + the five §7
      single-file rules assigned to Phases 1–3) — this phase adds no new rule but is
      the completion gate; if any assigned rule is missing, stop and resolve the
      owning phase.
- [ ] Final grep guard (repeat Task 20's sweep) — clean.
- [ ] `git push` — ensure every task's commit is pushed; the branch is ready.
- [ ] Commit (if drift only): `chore(cumulus): regenerate assets for Phase 4 boundary` + push.
