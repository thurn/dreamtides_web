# Migrating a quest screen to Tango — the checklist

This is the step-by-step recipe for converting one screen to the Tango design
system. The architecture and its rationale live in the `/tango` skill
(`.llms/skills/tango/SKILL.md`) and
[tango_design_system.md](tango_design_system.md); this document is the ordered
checklist plus the working idioms the pilot screens established. Work the steps
in order — registration (step 6) launches the screen to production, so it comes
after tests and before browser QA only because `?ui=legacy` remains available
as the rollback.

Every convention here that can be machine-checked is enforced by the `tango/*`
ESLint rules and the contract tests in `scripts/`; when lint blocks you, the
fix is described in the rule's message, and disabling the rule is never the
answer.

## 0. Before writing code

- Read the legacy screen top to bottom and split every line into one of three
  buckets: **presentation** (→ Tango screen), **mapping from domain data to
  what's shown** (→ view-model builder), **state/effects/navigation wiring**
  (→ adapter). A domain rule that other systems also need belongs in
  `src/data/` instead of the builder.
- Check the component index in the skill for every UI element the screen
  needs. If something has no Tango component, stop and raise it (rung 3/4 of
  the customization ladder) rather than hand-rolling it in the screen.

## 1. The Tango screen — `src/tango/screens/FooScreen.tsx`

Pure presentation: renders from a view-model, reports events through
callbacks. No `useQuest()`, no mutations, no navigation, no logging. Local UI
state (hover, selection, animation phase) lives here.

- The screen **owns and exports its view types** (`FooView`,
  `FooScreenProps`). Callbacks carry **ids**, not domain objects
  (`onPick(dreamcallerId: string)`); the adapter re-resolves the id.
- The root element carries `className="tango"` — the design tokens are scoped
  to that class — plus `minHeight: "100vh"` and its own layout styles. This is
  the only `className` in the file; all other styling is token-valued inline
  style objects (`token("--space-6")`, `token("--surface-card")`).
- Type is applied one voice at a time: `font: token("--t-body")`. A `--t-*`
  token is a complete font shorthand; never compose weight or face around it
  (lint: `tango/no-composed-type-voice`). `fontStyle: "italic"` may be layered
  as its own property.
- Interactions go through `Pressable`/`Button`/`SegmentedControl`; reveal
  popups go through `InfoCard`. A `<div onClick>` is a lint error
  (`tango/no-raw-interactive-elements`).
- Give every element a test will need to find a `data-*` attribute keyed by
  the entity's **id** (`data-dreamcaller-tide={`${dreamcallerId}:${tideId}`}`),
  matching the pilot's pattern.
- The screen may import only Tango code plus the allowlisted non-UI
  infrastructure (`src/data`, `src/types`, `src/logging`, `src/runtime`) —
  the boundary is lint-enforced.

## 2. The view-model builder — `src/screens/tango_adapters/foo-view-model.ts`

Pure, exported, React-free functions mapping domain data to the screen's view
types: `buildFooViewModel(...)`. Every mapping rule — capping, suppression,
display-copy fallbacks, color→variant tables — lives here, deterministic in
its arguments. Lint bans `react` and `src/state` imports; the file must be
`.ts`, not `.tsx` (lint: `tango/screen-file-taxonomy`).

Export every non-trivial helper individually so the test can hit it directly.

## 3. Builder tests — `src/screens/tango_adapters/foo-view-model.test.ts`

Plain-fixture vitest unit tests beside the builder (see
`quest-start-view-model.test.ts` for the style). Build fixtures by hand or
derive them from live content; per AGENTS.md, never assert specific
production TOML values.

## 4. The adapter — `src/screens/tango_adapters/FooScreenAdapter.tsx`

Wiring only, ≤120 lines (lint-enforced): acquire state with `useQuest()`,
call the builder inside `useMemo` keyed on exactly its arguments, wire
callbacks to mutations, render the screen. `tango/thin-adapters` bans
module-level helpers, extra exports, intrinsic JSX elements, and any import
outside the wiring set (state/data/types/runtime/logging, the sibling
view-model, the Tango screen). If adapter code feels worth testing, it
belongs in the builder.

Established idioms:

- **Per-mount randomness** (offers, seeds) is minted with a lazily
  initialized `useRef`, *not* `useMemo`/`useState` — StrictMode may re-run a
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

## 5. Screen tests — `src/tango/screens/FooScreen.test.tsx`

Rendered with `createRoot` + `act` and asserted via the `data-*` hooks (no
testing-library). Two required incantations, copied from
`QuestStartScreen.test.tsx`:

- `IS_REACT_ACT_ENVIRONMENT = true` on `globalThis`.
- A `window.matchMedia` stub — jsdom lacks it and `Pressable` reads the
  reduced-motion query; without the stub the mount crashes opaquely.

## 6. Registration — and registration is launch

- Add the case to `tangoScreenFor` (or `tangoSiteScreenFor`, which receives
  the `SiteState` and passes it to the adapter as a prop) in
  `src/screens/tango_adapters/registry.tsx`.
- Update `src/screens/tango_adapters/registry.test.tsx`: the migrated screen moves
  from the asserted-null list to an asserted-non-null case. This test breaks
  on every migration **by design** — it is the reminder that a registry entry
  ships the screen.
- `?ui=tango` is the default variant: the moment the registry entry lands,
  every player gets the Tango screen. `?ui=legacy` is the player-side
  rollback. QA to the production bar *before* committing the registration.

## 7. Browser QA

- If the screen has no `?goto=` scene in `src/runtime/qa-scenes.ts`, add one —
  screens reachable only by playing forward don't get QA'd. The scene doubles
  as legacy-comparison QA via `?ui=legacy`.
- Run the standard agent-browser pass (AGENTS.md "Verification"): boot the
  dev server on a non-default port, drive the normal player workflow, check
  the error buffer, and confirm layout/visibility/coherence. Compare against
  the legacy screen side by side.

## 8. Final checks

```bash
npm run lint
npm run typecheck
npm test
```

`npm test` includes the Tango contract tests: strict component APIs
(`tango-strict-api.contract.test.mjs`, which also scans
`src/tango/screens/`) and generated-docs freshness
(`tango-generated-docs-drift.test.mjs` — if you touched a component, a demo
entry, or the token stylesheet, run `npm run tango-metadata && npm run
tango-docs` / `npm run tango-tokens` and commit the regenerated artifacts).

Commit with a detailed description and push (AGENTS.md).
