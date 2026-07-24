---
name: cumulus-migrate
description: Use when building or changing a quest screen in the Cumulus design system — the ordered screen/builder/adapter checklist plus the working idioms (adapter randomness minting, screen-test incantations, exhaustive registry + QA steps). Companion to the cumulus skill. Triggers on Cumulus screen, screen builder adapter, view-model builder, FooScreenAdapter, screenFor, siteDispositionFor, registry launch.
---

# Migrating a quest screen to Cumulus — the checklist

This is the step-by-step recipe for building a screen in the Cumulus design
system. The architecture and its rationale live in the companion
[cumulus](../cumulus/SKILL.md) skill and
[cumulus_design_system.md](../../../docs/quest_prototype/cumulus_design_system.md);
this skill is the ordered checklist plus the working idioms the pilot screens
established. Work the steps in order; registration (step 6) adds the route to
the exhaustive production resolver.

Every convention here that can be machine-checked is enforced by the `cumulus/*`
ESLint rules and the contract tests in `scripts/`; when lint blocks you, the
fix is described in the rule's message, and disabling the rule is never the
answer.

## 0. Before writing code

- Split the product behavior into one of three
  buckets: **presentation** (→ Cumulus screen), **mapping from domain data to
  what's shown** (→ view-model builder), **state/effects/navigation wiring**
  (→ adapter). A domain rule that other systems also need belongs in
  `src/data/` instead of the builder.
- Check the component index in the [cumulus](../cumulus/SKILL.md) skill for every
  UI element the screen needs. If something has no Cumulus component, stop and
  raise it (rung 3/4 of the customization ladder) rather than hand-rolling it
  in the screen.

## 1. The Cumulus screen — `src/cumulus/screens/FooScreen.tsx`

Pure presentation: renders from a view-model, reports events through
callbacks. No `useQuest()`, no mutations, no navigation, no logging. Local UI
state (hover, selection, animation phase) lives here.

- The screen **owns and exports its view types** (`FooView`,
  `FooScreenProps`). Callbacks carry **ids**, not domain objects
  (`onPick(dreamcallerId: string)`); the adapter re-resolves the id.
- The root element carries `className="cumulus"` — the design tokens are scoped
  to that class — plus `minHeight: "100vh"` and its own layout styles. This is
  the only `className` in the file; all other styling is token-valued inline
  style objects (`token("--space-6")`, `token("--surface-card")`).
- Type is applied one voice at a time: `font: token("--t-body")`. A `--t-*`
  token is a complete font shorthand; never compose weight or face around it
  (lint: `cumulus/no-composed-type-voice`). `fontStyle: "italic"` may be layered
  as its own property.
- Interactions go through `Pressable`/`Button`/`SegmentedControl`; reveal
  popups go through `InfoCard`. A `<div onClick>` is a lint error
  (`cumulus/no-raw-interactive-elements`).
- Give every element a test will need to find a `data-*` attribute keyed by
  the entity's **id** (`data-dreamcaller-tide={`${dreamcallerId}:${tideId}`}`),
  matching the pilot's pattern.
- The screen may import only Cumulus code plus the allowlisted non-UI
  infrastructure (`src/data`, `src/types`, `src/logging`, `src/runtime`) —
  the boundary is lint-enforced.

Established idioms:

- **Floating pick counter** — for a "progress-through-a-sequence" screen,
  copy `DraftScreen.tsx`'s floating `Draft (n/total)` counter: a small,
  screen-anchored HUD element (`data-draft-pick-counter`) that floats over the
  pack grid, painted directly on the scene with the on-media text outline
  (`--text-outline-media`) — no scrim, wash, or container. Its column reserves
  a top band of `max(var(--safe-area-inset-top), --safe-top, max(var(--safe-area-inset-top), MENU_EDGE_INSET_MOBILE_PX) + MENU_BUTTON_PX)`,
  so the safe-area floor holds the counter and pack clear of the app-shell
  hamburger, whose disc is measured from the exported menu-geometry constants
  `MENU_BUTTON_PX` / `MENU_EDGE_INSET_MOBILE_PX` in
  [`chrome-geometry.ts`](../../../src/cumulus/screens/chrome-geometry.ts). QA the
  screen through its `?goto=draft` scene (registered in `qa-scenes.ts`; see
  [qa_scenes.md](../../../docs/quest_prototype/qa_scenes.md)).

## 2. The view-model builder — `src/screens/cumulus_adapters/foo-view-model.ts`

Pure, exported, React-free functions mapping domain data to the screen's view
types: `buildFooViewModel(...)`. Every mapping rule — capping, suppression,
display-copy fallbacks, color→variant tables — lives here, deterministic in
its arguments. Lint bans `react` and `src/state` imports; the file must be
`.ts`, not `.tsx` (lint: `cumulus/screen-file-taxonomy`).

Export every non-trivial helper individually so the test can hit it directly.

## 3. Builder tests — `src/screens/cumulus_adapters/foo-view-model.test.ts`

Plain-fixture vitest unit tests beside the builder (see
`quest-start-view-model.test.ts` for the style). Build fixtures by hand or
derive them from live content; per AGENTS.md, never assert specific
production TOML values.

## 4. The adapter — `src/screens/cumulus_adapters/FooScreenAdapter.tsx`

Wiring only, ≤120 lines (lint-enforced): acquire state with `useQuest()`,
call the builder inside `useMemo` keyed on exactly its arguments, wire
callbacks to mutations, render the screen. `cumulus/thin-adapters` bans
module-level helpers, extra exports, intrinsic JSX elements, and any import
outside the wiring set (state/data/types/runtime/logging, the sibling
view-model, the Cumulus screen). If adapter code feels worth testing, it
belongs in the builder.

Established idioms:

- **Per-mount randomness** (offers, seeds) is minted with a lazily
  initialized `useRef`, _not_ `useMemo`/`useState` — StrictMode may re-run a
  memo, and the minted value must be the same one later handed to the
  mutation:

  ```tsx
  const seedRef = useRef<string | null>(null);
  if (seedRef.current === null) seedRef.current = generateQuestSeed();
  ```

- **Mount effects and logging** (`site_entered`, ensure-runtime calls) are
  the adapter's job, guarded against StrictMode double-fire with a ref, the
  way `ScreenRouter` guards its `screen_rendered` log.
- **Missing state**: resolve ids defensively and no-op (or return null)
  rather than throwing; the adapter runs against live, changing state.

## 5. Screen tests — `src/cumulus/screens/FooScreen.test.tsx`

Rendered with `createRoot` + `act` and asserted via the `data-*` hooks (no
testing-library). Two required incantations, copied from
`QuestStartScreen.test.tsx`:

- `IS_REACT_ACT_ENVIRONMENT = true` on `globalThis`.
- A `window.matchMedia` stub — jsdom lacks it and `Pressable` reads the
  reduced-motion query; without the stub the mount crashes opaquely.

## 6. Production registration

- Add the non-site case to `screenFor`, or add the site case to
  `siteDispositionFor`, in `src/screens/cumulus_adapters/registry.tsx`.
- Registration automatically wraps the screen in `CumulusQuestChrome`, which
  supplies the persistent `QuestStatusBar` and platform menu from live quest
  state. Do not add HUD data to the screen view-model or render persistent quest
  chrome inside the pure screen.
- Update `src/screens/cumulus_adapters/registry.test.tsx` so the table covers
  the new case and its production disposition. The permanent UI-boundary test
  also checks the exhaustive switches against the `Screen` and `SiteType`
  contracts.

## 7. Browser QA

- If the screen has no `?goto=` scene in `src/runtime/qa-scenes.ts`, add one so
  screens reachable only by playing forward have a direct QA route.
- Before registration and the full final check, capture one representative
  state and confirm the overall visual direction. Correct composition problems
  while the feedback loop is still small.
- Run the risk-tiered agent-browser pass in AGENTS.md "Verification": boot the
  dev server on a non-default port, drive the relevant normal player workflow,
  inspect `window.__caps`, and measure DOM geometry for clipping, overlap, and
  responsive-branch claims. For routine visual work, keep final screenshots to
  one representative desktop, one representative mobile, and one changed
  interaction state when those states are relevant.

## 8. Final checks

```bash
npm run review
```

Related tests selected by `npm run review` include the affected Cumulus
contract tests: strict component APIs
(`cumulus-strict-api.contract.test.mjs`, which also scans
`src/cumulus/screens/`) and generated-docs freshness
(`cumulus-generated-docs-drift.test.mjs` — if you touched a component, a demo
entry, or the token stylesheet, run `npm run cumulus-metadata && npm run
cumulus-docs` / `npm run cumulus-tokens` and commit the regenerated artifacts).

Commit with a detailed description and push (AGENTS.md).
