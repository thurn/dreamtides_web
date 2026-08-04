# Card Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-subagent-driven-development (recommended) or super-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `/editor` card editor that loads every source card from `data/tabula/rendered-cards.toml`, edits supported fields inline, and writes confirmed edits back to TOML by UUID.

**Architecture:** Add focused Node-side editor helpers and Vite middleware for TOML reading, targeted patching, validation, and focused `public/card-data.json` refresh. Add a React editor route that bypasses the journey runtime, reuses shared card rendering primitives with the normal journey card UI, keeps display state in URL query parameters, and performs optimistic per-field saves.

**Tech Stack:** React 19, TypeScript, Vite middleware, Vitest, `smol-toml`, existing `CardDisplay`/`RulesText`/`PipBadge` card UI, `/opt/homebrew/bin/agent-browser` manual QA.

---

## Source Spec

Implement against `docs/superpowers/specs/2026-05-28-card-editor-design.md`.

Hard requirements from the spec:

- Card editor route is `/editor`.
- Editor card identity and save paths use the TOML `id` UUID, not `card-number`.
- Editable fields are `energy-cost`, `subtype`, `name`, `spark`, and `rendered-text`.
- `card-type` is display-only and is not editable.
- Enter is the only save action; Escape discards; blur does not save.
- TOML patching preserves unrelated file bytes and field order.
- Normal journey card surfaces and editor card surfaces share one maintained rendering path.
- Every UI slice has a separate `agent-browser` QA subagent checkpoint before the next UI slice proceeds.

## File Structure

Create or modify these files:

- Create `scripts/card-editor-data.mjs`: Node-only helpers for loading source cards, normalizing editor records, validating edits, locating card blocks by UUID, targeted TOML field patching, and focused `card-data.json` refresh.
- Create `scripts/card-editor-data.d.ts`: Type declarations for `vite.config.ts` imports.
- Create `scripts/card-editor-data.test.mjs`: Node tests for TOML identity, validation, patching, and focused JSON refresh.
- Create `scripts/card-editor-api.mjs`: Vite middleware request handler for `GET /api/editor/cards` and `PATCH /api/editor/cards/:cardId`.
- Create `scripts/card-editor-api.d.ts`: Type declarations for `vite.config.ts` imports.
- Create `scripts/card-editor-api.test.mjs`: Node tests for API request/response contracts.
- Modify `vite.config.ts`: register the editor API middleware before the existing generated-card-data drift middleware.
- Create `src/editor/types.ts`: browser-safe editor data contracts.
- Create `src/editor/editor-url-state.ts`: URL parse/serialize/replace helpers for editor display state.
- Create `src/editor/editor-url-state.test.ts`: URL state contract tests.
- Create `src/editor/editor-api.ts`: browser API client for editor card loading and field saves.
- Create `src/editor/CardEditorApp.tsx`: route shell, load/error state, source card state, derived filtered/sorted cards, and save orchestration.
- Create `src/editor/CardEditorApp.test.tsx`: React tests for load state, error state, query syncing, optimistic saves, rollback, and route behavior.
- Create `src/editor/CardEditorToolbar.tsx`: search, filters, sort controls, direction controls, and size controls.
- Create `src/editor/CardEditorToolbar.test.tsx`: toolbar interaction tests.
- Create `src/editor/CardEditorGrid.tsx`: scrollable grid and card-size layout.
- Create `src/editor/EditableCard.tsx`: editor card wrapper that supplies editable slots to shared card rendering.
- Create `src/editor/EditableField.tsx`: inline input/textarea behavior for Enter, Escape, blur, validation messages, and save status.
- Create `src/editor/save-state.ts`: small reducer/helpers for field-level save state and stale response guards.
- Create `src/editor/save-state.test.ts`: save-state invariants.
- Create `src/components/CardView.tsx`: shared card rendering primitive extracted from `CardDisplay`.
- Modify `src/components/CardDisplay.tsx`: thin compatibility wrapper around `CardView`.
- Modify `src/components/CardDisplay.test.tsx`: preserve existing card-rendering behavior and add slot/refactor coverage.
- Modify `src/main.tsx`: mount `CardEditorApp` when `window.location.pathname === "/editor"`.
- Modify `docs/journey_prototype/url_parameters.md`: document `/editor` query parameters as current behavior.

## QA Gate Protocol For UI Tasks

Every task that creates or changes `/editor` UI includes a QA subagent step. The subagent must use `/opt/homebrew/bin/agent-browser`; use `npx agent-browser` only if the Homebrew binary is unavailable.

Each QA subagent must:

1. Start or reuse a local Vite server and read the actual URL from stdout.
2. Open `/editor` at that URL.
3. Install error hooks before interacting:

```bash
/opt/homebrew/bin/agent-browser eval "
window.__caps = { errors: [], rejections: [], consoleErrors: [] };
window.addEventListener('error', e => window.__caps.errors.push({
  msg: String(e.message),
  src: e.filename + ':' + e.lineno + ':' + e.colno,
}));
window.addEventListener('unhandledrejection', e =>
  window.__caps.rejections.push(String(e.reason?.stack || e.reason).slice(0, 1500)));
const oce = console.error;
console.error = (...a) => {
  window.__caps.consoleErrors.push(a.map(x => x?.stack || String(x)).join(' | ').slice(0, 1500));
  oce.apply(console, a);
};
'hooks installed'
"
```

4. Exercise the normal workflow for the UI piece implemented in that task.
5. Capture screenshots for each relevant state.
6. Inspect live browser state and `window.__caps`.
7. Analyze screenshots for broken spacing or alignment consistency, inconsistent button states or interaction feedback, tap/click targets that are too small or hard to hit, confusing visual hierarchy, misaligned labels/helper text/validation messages, unexpected scrolling or clipped content, and poor color contrast.
8. Restore any card data changed during QA before returning.

If QA finds a UI issue, fix it in the same task and repeat that task's QA subagent step before moving on.

## Task 1: Node Card Editor Data Helpers

**Files:**
- Create: `scripts/card-editor-data.mjs`
- Create: `scripts/card-editor-data.d.ts`
- Create: `scripts/card-editor-data.test.mjs`

- [ ] **Step 1: Write failing data-helper tests**

In `scripts/card-editor-data.test.mjs`, cover these bug classes:

- Source catalog loading returns every `[[cards]]` record, including a `Special` record that runtime JSON would filter out.
- Editor records expose `id` UUID as identity and retain `cardNumber` only as content metadata.
- Cost validation accepts non-negative integers and `X`/`*`, and rejects negative, fractional, and non-numeric values.
- Spark validation accepts non-negative integers, `X`/`*`, and blank, and rejects negative, fractional, and non-numeric values.
- Name validation rejects empty names after trimming surrounding input whitespace.
- The TOML block locator finds by UUID, not by `card-number`.
- A field patch changes only the target UUID block and leaves unrelated blocks byte-for-byte identical.
- A multiline `rendered-text` patch emits parseable TOML and preserves the edited newline content.
- Focused `card-data.json` refresh applies the same runtime filtering and `transformCard` normalization as `scripts/setup-assets.mjs`.

Run:

```bash
npm test -- scripts/card-editor-data.test.mjs
```

Expected: FAIL because `scripts/card-editor-data.mjs` does not exist.

- [ ] **Step 2: Implement `scripts/card-editor-data.mjs` contracts**

Export focused helpers with this public contract:

```js
export const EDITABLE_CARD_FIELDS = new Set([
  "energy-cost",
  "subtype",
  "name",
  "spark",
  "rendered-text",
]);

export function readEditorCards({ rootDir } = {}) {}
export function validateCardEdit(field, rawValue) {}
export function patchRenderedCardsToml(source, { cardId, field, value }) {}
export function refreshCardDataJson({ rootDir } = {}) {}
```

Implementation requirements:

- `readEditorCards` reads `data/tabula/rendered-cards.toml`, parses with `smol-toml`, and returns all source cards in TOML order.
- Returned editor records include raw TOML-facing editable fields and a preview `CardData` produced by `transformCard`.
- `validateCardEdit` returns structured success or failure, not thrown validation errors.
- `patchRenderedCardsToml` locates the `[[cards]]` block by exact `id` UUID and replaces one editable field.
- `patchRenderedCardsToml` reparses the full patched TOML before returning.
- `refreshCardDataJson` uses `NIGHTMARE_CARD_NAME` and `transformCard` from `scripts/setup-assets.mjs` and writes only `public/card-data.json`.

- [ ] **Step 3: Add TypeScript declarations**

In `scripts/card-editor-data.d.ts`, declare the exported functions well enough for `vite.config.ts` to import them without implicit `any`. Keep declarations minimal and aligned with the JavaScript exports.

- [ ] **Step 4: Run the data-helper tests**

Run:

```bash
npm test -- scripts/card-editor-data.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add scripts/card-editor-data.mjs scripts/card-editor-data.d.ts scripts/card-editor-data.test.mjs
git commit -m "Add card editor data helpers" -m "Add UUID-based source card loading, validation, targeted TOML patching, and focused card-data JSON refresh helpers for the card editor."
git push
```

## Task 2: Vite Editor API Middleware

**Files:**
- Create: `scripts/card-editor-api.mjs`
- Create: `scripts/card-editor-api.d.ts`
- Create: `scripts/card-editor-api.test.mjs`
- Modify: `vite.config.ts`

- [ ] **Step 1: Write failing API contract tests**

In `scripts/card-editor-api.test.mjs`, cover these bug classes:

- `GET /api/editor/cards` returns JSON with all source cards and UUID ids.
- `PATCH /api/editor/cards/:cardId` applies one valid field edit to a temp TOML file and refreshes temp `public/card-data.json`.
- A PATCH where the route UUID and body `id` differ returns 400 and does not write files.
- A PATCH for `card-type` returns 400 because card type is not editable.
- Invalid JSON returns 400 with a structured error body.
- Unknown UUID returns 404 and does not write files.
- Unsupported methods under `/api/editor/cards` return 405.

Run:

```bash
npm test -- scripts/card-editor-api.test.mjs
```

Expected: FAIL because the API handler does not exist.

- [ ] **Step 2: Implement the middleware request handler**

In `scripts/card-editor-api.mjs`, export:

```js
export function createCardEditorApiMiddleware({ rootDir } = {}) {}
```

Implementation requirements:

- The middleware handles only paths beginning with `/api/editor/cards`.
- It writes JSON responses with explicit status codes.
- It calls `next()` for unrelated paths.
- It never accepts a card number as route identity.
- It includes save timing metadata from the patch/refresh path in successful PATCH responses.
- It does not run full `setupAssets()`.

- [ ] **Step 3: Add TypeScript declarations**

In `scripts/card-editor-api.d.ts`, declare `createCardEditorApiMiddleware` so `vite.config.ts` can import it cleanly.

- [ ] **Step 4: Register the middleware in Vite**

Modify `vite.config.ts`:

- Import `createCardEditorApiMiddleware`.
- Add a `cardEditorApiPlugin()` next to `journeyLogPlugin()`.
- Register the middleware in `configureServer`.
- Include `cardEditorApiPlugin()` in the plugin list before `generatedCardDataDriftPlugin()` so a successful edit refreshes `public/card-data.json` before the drift guard reacts to file changes.

- [ ] **Step 5: Run API tests and Vite config typecheck**

Run:

```bash
npm test -- scripts/card-editor-api.test.mjs scripts/card-editor-data.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit and push**

Run:

```bash
git add scripts/card-editor-api.mjs scripts/card-editor-api.d.ts scripts/card-editor-api.test.mjs vite.config.ts
git commit -m "Add card editor Vite API" -m "Expose local development API endpoints for loading source cards and saving UUID-addressed field edits through the focused TOML patching path."
git push
```

## Task 3: Editor Route Shell And URL State

**Files:**
- Create: `src/editor/types.ts`
- Create: `src/editor/editor-url-state.ts`
- Create: `src/editor/editor-url-state.test.ts`
- Create: `src/editor/editor-api.ts`
- Create: `src/editor/CardEditorApp.tsx`
- Create: `src/editor/CardEditorApp.test.tsx`
- Modify: `src/main.tsx`
- Modify: `docs/journey_prototype/url_parameters.md`

- [ ] **Step 1: Write failing URL state tests**

In `src/editor/editor-url-state.test.ts`, cover these bug classes:

- Invalid query values fall back to the default editor display state.
- Search text round-trips through `q`.
- `type`, `cost`, `subtype`, `sort`, `dir`, and `size` serialize into stable query params.
- Empty/default values are omitted where the spec says they should be omitted.
- Updating state uses `history.replaceState` rather than pushing a new entry.

Run:

```bash
npm test -- src/editor/editor-url-state.test.ts
```

Expected: FAIL because the URL state module does not exist.

- [ ] **Step 2: Implement editor types and URL state**

In `src/editor/types.ts`, define browser contracts for editor records, editable fields, display state, save state, and API responses. Use UUID `id` as the record identity. Keep `cardNumber` present for art and sorting.

In `src/editor/editor-url-state.ts`, implement parser/serializer helpers for the query params listed in the spec.

- [ ] **Step 3: Write failing route shell tests**

In `src/editor/CardEditorApp.test.tsx`, cover these bug classes:

- The route shell renders a loading state while cards load.
- A successful load renders the editor title and total source-card count.
- A failed load renders a retryable error state.
- The editor route does not require Firebase, journey providers, or `App`.

Use an injectable API client prop or module mock so tests do not hit real Vite middleware.

Run:

```bash
npm test -- src/editor/CardEditorApp.test.tsx
```

Expected: FAIL because the route shell does not exist.

- [ ] **Step 4: Implement the route shell and API client**

In `src/editor/editor-api.ts`, implement `loadEditorCards()` and `saveEditorCardField()` wrappers around the Vite API.

In `src/editor/CardEditorApp.tsx`, implement loading, loaded count, retryable error state, and initial URL state parsing.

Modify `src/main.tsx` so `/editor` mounts `CardEditorApp` before normal runtime config and `App` setup.

- [ ] **Step 5: Document `/editor` query parameters**

Update `docs/journey_prototype/url_parameters.md` with a current-state section for `/editor` query parameters. Mention that these parameters are live editor display state and are updated with `replaceState`.

- [ ] **Step 6: Run route shell tests**

Run:

```bash
npm test -- src/editor/editor-url-state.test.ts src/editor/CardEditorApp.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Run QA subagent for route shell**

Dispatch a separate QA subagent using the QA Gate Protocol. The subagent must verify:

- `/editor` opens without creating or joining a journey room.
- The loading state is visible before data resolves when network delay is simulated.
- The loaded shell shows the editor title and source-card count.
- The route does not show Firebase setup, Create Game, Dream Avatar selection, HUD, or room presence UI.
- At 1280x800 and 1440x900, the header text is visible and not clipped.
- `window.__caps` has empty `errors`, `rejections`, and `consoleErrors`.

Required screenshots:

- `/tmp/card-editor-route-shell-1280.png`
- `/tmp/card-editor-route-shell-1440.png`

- [ ] **Step 8: Commit and push**

Run:

```bash
git add src/editor/types.ts src/editor/editor-url-state.ts src/editor/editor-url-state.test.ts src/editor/editor-api.ts src/editor/CardEditorApp.tsx src/editor/CardEditorApp.test.tsx src/main.tsx docs/journey_prototype/url_parameters.md
git commit -m "Add card editor route shell" -m "Mount the standalone /editor route with URL display state parsing, local API loading, and route-shell documentation."
git push
```

## Task 4: Toolbar, Filtering, Sorting, And URL Sync

**Files:**
- Create: `src/editor/CardEditorToolbar.tsx`
- Create: `src/editor/CardEditorToolbar.test.tsx`
- Modify: `src/editor/CardEditorApp.tsx`
- Modify: `src/editor/CardEditorApp.test.tsx`
- Modify: `src/editor/editor-url-state.ts`
- Modify: `src/editor/editor-url-state.test.ts`

- [ ] **Step 1: Write failing toolbar and derived-list tests**

Cover these bug classes:

- Search filters by card name and rules text.
- Type filter filters by display-only card type without exposing card-type editing.
- Cost filter treats `null` preview cost as `x`.
- Subtype filter options are derived from source records and exclude blank subtypes from the option list.
- Sorting by number, name, cost, type, subtype, and spark is stable for equal keys.
- Control changes call `replaceState` and do not call `pushState`.
- Typing in the search input updates the input value immediately.

Run:

```bash
npm test -- src/editor/CardEditorToolbar.test.tsx src/editor/CardEditorApp.test.tsx src/editor/editor-url-state.test.ts
```

Expected: FAIL for missing toolbar behavior.

- [ ] **Step 2: Implement toolbar controls**

Implement `CardEditorToolbar` with:

- Search input.
- Segmented type filter: All, Characters, Events.
- Cost filter.
- Subtype select.
- Sort field select or menu.
- Sort direction toggle.
- Size segmented control: small, medium, large.
- Visible filtered count and total count.

Use accessible labels and keep controls at comfortable laptop click sizes.

- [ ] **Step 3: Wire derived filtering and sorting into `CardEditorApp`**

Keep raw API cards immutable in state. Compute filtered/sorted cards with memoized derived data from source cards and URL display state. Keep the controlled search input immediate; debounce only derived filtering if real measurement shows typing lag.

- [ ] **Step 4: Run toolbar tests**

Run:

```bash
npm test -- src/editor/CardEditorToolbar.test.tsx src/editor/CardEditorApp.test.tsx src/editor/editor-url-state.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Run QA subagent for toolbar/query controls**

Dispatch a separate QA subagent using the QA Gate Protocol. The subagent must verify:

- Search input echoes typed characters immediately.
- Search changes the visible count and updates `q` in the URL.
- Type, cost, subtype, sort, direction, and size controls update button/select states and URL params with `replaceState`.
- Browser Back does not step through every typed search character.
- Controls are visible and not clipped at 1280x800 and 1440x900.
- Button active states, hover/focus states, and disabled states are visually distinct.
- `window.__caps` has empty `errors`, `rejections`, and `consoleErrors`.

Required screenshots:

- `/tmp/card-editor-toolbar-default.png`
- `/tmp/card-editor-toolbar-filtered.png`
- `/tmp/card-editor-toolbar-sorted.png`

- [ ] **Step 6: Commit and push**

Run:

```bash
git add src/editor/CardEditorToolbar.tsx src/editor/CardEditorToolbar.test.tsx src/editor/CardEditorApp.tsx src/editor/CardEditorApp.test.tsx src/editor/editor-url-state.ts src/editor/editor-url-state.test.ts
git commit -m "Add card editor toolbar controls" -m "Add URL-backed search, filtering, sorting, direction, and card-size controls for the standalone card editor."
git push
```

## Task 5: Shared Card Rendering And Read-Only Editor Grid

**Files:**
- Create: `src/components/CardView.tsx`
- Modify: `src/components/CardDisplay.tsx`
- Modify: `src/components/CardDisplay.test.tsx`
- Create: `src/editor/CardEditorGrid.tsx`
- Create: `src/editor/EditableCard.tsx`
- Modify: `src/editor/CardEditorApp.tsx`
- Modify: `src/editor/CardEditorApp.test.tsx`

- [ ] **Step 1: Write failing card rendering refactor tests**

In `src/components/CardDisplay.test.tsx`, add coverage for these bug classes:

- `CardDisplay` still renders existing event/character chrome, energy pip, spark pip, rarity shimmer, type line, rules text, and image fallback after the refactor.
- Slot overrides can wrap name, cost, subtype/type line, spark, and rules text without duplicating card chrome.
- The shared card root preserves aspect ratio and `data-card-text-scale`.

Run:

```bash
npm test -- src/components/CardDisplay.test.tsx
```

Expected: FAIL for missing shared rendering primitive or slot override API.

- [ ] **Step 2: Extract shared card rendering primitive**

Create `src/components/CardView.tsx` by moving the visual card body from `CardDisplay`. Keep `CardDisplay` as a compatibility wrapper.

The shared primitive should expose slot overrides with this contract:

```ts
export interface CardViewSlotContext {
  card: CardData | FrozenCardData;
  large: boolean;
  textScale: number;
  typeLine: string;
}

export interface CardViewSlots {
  energy?: (context: CardViewSlotContext, defaultNode: React.ReactNode) => React.ReactNode;
  name?: (context: CardViewSlotContext, defaultNode: React.ReactNode) => React.ReactNode;
  typeLine?: (context: CardViewSlotContext, defaultNode: React.ReactNode) => React.ReactNode;
  rulesText?: (context: CardViewSlotContext, defaultNode: React.ReactNode) => React.ReactNode;
  spark?: (context: CardViewSlotContext, defaultNode: React.ReactNode) => React.ReactNode;
}
```

This interface is the important design decision: editor fields wrap shared slots, while normal journey cards keep the default slot nodes.

- [ ] **Step 3: Write failing grid tests**

In `src/editor/CardEditorApp.test.tsx`, cover these bug classes:

- Loaded editor cards render as a grid of shared card views.
- Size controls change the grid column sizing.
- `card-type` appears in the type line but is not an editable target.
- Each editor card root carries the UUID in a data attribute for QA and testing.

Run:

```bash
npm test -- src/editor/CardEditorApp.test.tsx src/components/CardDisplay.test.tsx
```

Expected: FAIL for missing grid.

- [ ] **Step 4: Implement read-only grid**

Implement `CardEditorGrid` and `EditableCard` in read-only mode first. Use `CardView` slots but do not enter edit mode in this task. Render the filtered/sorted cards from `CardEditorApp`.

Use stable grid dimensions based on the existing `SIZE_PRESETS` in `src/components/card-size.ts` or extract a shared card-size helper if needed.

- [ ] **Step 5: Run render and grid tests**

Run:

```bash
npm test -- src/components/CardDisplay.test.tsx src/editor/CardEditorApp.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Run QA subagent for card grid and scaling**

Dispatch a separate QA subagent using the QA Gate Protocol. The subagent must verify:

- `/editor` shows real card art/chrome/pips/rules text in the grid.
- Small, medium, and large card sizes change the grid without clipped controls.
- Cards remain readable at 1280x800 and 1440x900.
- Event and Character cards retain distinct chrome.
- Type line is visible and display-only.
- Scrolling the grid does not shift the toolbar or produce unexpected page-level scrolling.
- `window.__caps` has empty `errors`, `rejections`, and `consoleErrors`.

Required screenshots:

- `/tmp/card-editor-grid-small.png`
- `/tmp/card-editor-grid-medium.png`
- `/tmp/card-editor-grid-large.png`

- [ ] **Step 7: Commit and push**

Run:

```bash
git add src/components/CardView.tsx src/components/CardDisplay.tsx src/components/CardDisplay.test.tsx src/editor/CardEditorGrid.tsx src/editor/EditableCard.tsx src/editor/CardEditorApp.tsx src/editor/CardEditorApp.test.tsx
git commit -m "Share card rendering with editor grid" -m "Extract shared card rendering primitives and use them for the read-only card editor grid while preserving normal CardDisplay behavior."
git push
```

## Task 6: Inline Editing Foundation And Name Saves

**Files:**
- Create: `src/editor/EditableField.tsx`
- Create: `src/editor/save-state.ts`
- Create: `src/editor/save-state.test.ts`
- Modify: `src/editor/EditableCard.tsx`
- Modify: `src/editor/CardEditorApp.tsx`
- Modify: `src/editor/CardEditorApp.test.tsx`

- [ ] **Step 1: Write failing save-state tests**

In `src/editor/save-state.test.ts`, cover these bug classes:

- Starting a save marks exactly one card UUID and field as saving.
- A success response updates only the matching card UUID and field.
- A stale success response with an older client revision is ignored.
- A failure response restores the server-confirmed value for the matching card UUID and field.
- Editing the same field again while a save is in flight keeps the latest draft visible.

Run:

```bash
npm test -- src/editor/save-state.test.ts
```

Expected: FAIL because save-state helpers do not exist.

- [ ] **Step 2: Implement save-state helpers**

Implement a small reducer or pure helpers in `src/editor/save-state.ts`. Keep the API focused on UUID, field, client revision, and status.

- [ ] **Step 3: Write failing inline name edit tests**

In `src/editor/CardEditorApp.test.tsx`, cover these bug classes:

- Double-clicking the name enters edit mode and focuses an input.
- Pressing Enter saves `field: "name"` to `/api/editor/cards/:uuid`.
- Pressing Escape restores the original visible name and does not call save.
- Blurring the input does not call save.
- A successful save leaves the optimistic name visible and clears saving state.
- A failed save restores the server-confirmed name and shows a local error.

Run:

```bash
npm test -- src/editor/CardEditorApp.test.tsx src/editor/save-state.test.ts
```

Expected: FAIL for missing inline edit behavior.

- [ ] **Step 4: Implement `EditableField` and name slot editing**

`EditableField` requirements:

- Double-click enters edit mode.
- Enter calls the provided commit handler.
- Escape calls the provided cancel handler.
- Blur never saves.
- It supports a single-line input for name, cost, spark, and subtype.
- It supports a textarea mode for rules text in a later task.
- It renders saving, saved, validation error, and save error affordances without resizing the card unexpectedly.

Wire only the name slot in this task.

- [ ] **Step 5: Run inline name edit tests**

Run:

```bash
npm test -- src/editor/CardEditorApp.test.tsx src/editor/save-state.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Run QA subagent for inline name editing**

Dispatch a separate QA subagent using the QA Gate Protocol. The subagent must verify:

- Double-clicking a card name opens an inline name input.
- Enter saves the new name and exits edit mode.
- Escape discards a draft name.
- Clicking away does not save.
- Saving state and saved state are visible without causing layout jump.
- The QA edit is restored to the original card name before the subagent exits.
- `git diff -- data/tabula/rendered-cards.toml` is clean after restoration.
- `node scripts/generated-card-data-drift.mjs` reports generated card data matches the TOML source after restoration.
- `window.__caps` has empty `errors`, `rejections`, and `consoleErrors`.

Required screenshots:

- `/tmp/card-editor-name-editing.png`
- `/tmp/card-editor-name-saving.png`
- `/tmp/card-editor-name-restored.png`

- [ ] **Step 7: Commit and push**

Run:

```bash
git add src/editor/EditableField.tsx src/editor/save-state.ts src/editor/save-state.test.ts src/editor/EditableCard.tsx src/editor/CardEditorApp.tsx src/editor/CardEditorApp.test.tsx
git commit -m "Add inline card name editing" -m "Add field-level editor save state and Enter/Escape inline name editing backed by UUID-addressed save requests."
git push
```

## Task 7: Inline Cost And Spark Editing

**Files:**
- Modify: `src/editor/EditableCard.tsx`
- Modify: `src/editor/EditableField.tsx`
- Modify: `src/editor/CardEditorApp.test.tsx`
- Modify: `scripts/card-editor-data.test.mjs`

- [ ] **Step 1: Write failing cost and spark UI tests**

In `src/editor/CardEditorApp.test.tsx`, cover these bug classes:

- Double-clicking the cost pip opens a single-line editor.
- Entering `X` or `*` for cost saves a variable cost and renders `X` in the preview.
- Entering an integer cost saves and renders that integer.
- Invalid cost shows validation feedback and does not write optimistic state as confirmed.
- Double-clicking the spark pip or spark placeholder opens a single-line editor.
- Blank spark saves as blank source spark and renders no spark pip.
- `X`/`*` spark saves as variable source spark and renders the variable preview consistently with existing card normalization.

Run:

```bash
npm test -- src/editor/CardEditorApp.test.tsx
```

Expected: FAIL because cost and spark slots are not editable.

- [ ] **Step 2: Tighten backend special-value tests if needed**

Update `scripts/card-editor-data.test.mjs` if the UI tests reveal ambiguity around the exact saved source value. The server remains authoritative: cost variable stores `"*"`, spark variable stores `"*"`, blank spark stores `""`.

- [ ] **Step 3: Implement cost and spark slot editing**

Wire the `energy` and `spark` `CardView` slots through `EditableField`.

Requirements:

- The editor accepts both `X` and `*` as variable input.
- The UI shows the server-confirmed preview after save.
- Validation messages appear near the edited pip and do not overlap neighboring card content.
- Cost and spark edits use UUID save paths.

- [ ] **Step 4: Run cost and spark tests**

Run:

```bash
npm test -- src/editor/CardEditorApp.test.tsx scripts/card-editor-data.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Run QA subagent for cost and spark editing**

Dispatch a separate QA subagent using the QA Gate Protocol. The subagent must verify:

- Cost integer edit saves and displays the new value.
- Cost `X` edit saves and displays variable cost.
- Spark integer edit saves and displays the new value.
- Blank spark edit saves and removes the spark pip.
- Invalid cost or spark shows readable validation feedback near the edited field.
- Each QA edit is restored to the original value before the subagent exits.
- `git diff -- data/tabula/rendered-cards.toml` is clean after restoration.
- `node scripts/generated-card-data-drift.mjs` reports generated card data matches the TOML source after restoration.
- Validation messages are not clipped inside the card at 1280x800 and 1440x900.
- `window.__caps` has empty `errors`, `rejections`, and `consoleErrors`.

Required screenshots:

- `/tmp/card-editor-cost-editing.png`
- `/tmp/card-editor-spark-editing.png`
- `/tmp/card-editor-numeric-validation.png`

- [ ] **Step 6: Commit and push**

Run:

```bash
git add src/editor/EditableCard.tsx src/editor/EditableField.tsx src/editor/CardEditorApp.test.tsx scripts/card-editor-data.test.mjs
git commit -m "Add inline cost and spark editing" -m "Support UUID-addressed inline cost and spark edits, including variable and blank special values with local validation feedback."
git push
```

## Task 8: Inline Subtype Editing

**Files:**
- Modify: `src/editor/EditableCard.tsx`
- Modify: `src/editor/CardEditorApp.test.tsx`
- Modify: `src/editor/CardEditorToolbar.tsx`
- Modify: `src/editor/CardEditorToolbar.test.tsx`

- [ ] **Step 1: Write failing subtype tests**

Cover these bug classes:

- Double-clicking the subtype portion of the type line opens an editor for `subtype`.
- Double-clicking the card type portion of the type line does not edit `card-type`.
- Blank subtype saves and updates subtype filter availability.
- Changing subtype updates the card preview type line and the toolbar subtype option list.
- Save requests use `field: "subtype"` and UUID identity.

Run:

```bash
npm test -- src/editor/CardEditorApp.test.tsx src/editor/CardEditorToolbar.test.tsx
```

Expected: FAIL because subtype is not editable.

- [ ] **Step 2: Implement subtype slot editing**

Adjust the type-line shared slot so card type and subtype can be rendered as separate spans while preserving the normal type-line appearance. Wrap only the subtype span in `EditableField`.

For Event cards with blank subtype, expose a visible but restrained subtype edit affordance that does not look like editable card type text.

- [ ] **Step 3: Run subtype tests**

Run:

```bash
npm test -- src/editor/CardEditorApp.test.tsx src/editor/CardEditorToolbar.test.tsx src/components/CardDisplay.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run QA subagent for subtype editing**

Dispatch a separate QA subagent using the QA Gate Protocol. The subagent must verify:

- Character subtype editing works from the type line.
- Blank subtype editing works on a card with no subtype.
- Card type text is display-only.
- Changing subtype updates toolbar subtype filters without a page reload.
- Each QA edit is restored to the original subtype before the subagent exits.
- `git diff -- data/tabula/rendered-cards.toml` is clean after restoration.
- `node scripts/generated-card-data-drift.mjs` reports generated card data matches the TOML source after restoration.
- Type-line labels and subtype validation messages are aligned and readable.
- `window.__caps` has empty `errors`, `rejections`, and `consoleErrors`.

Required screenshots:

- `/tmp/card-editor-subtype-editing.png`
- `/tmp/card-editor-subtype-filter-updated.png`

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/editor/EditableCard.tsx src/editor/CardEditorApp.test.tsx src/editor/CardEditorToolbar.tsx src/editor/CardEditorToolbar.test.tsx
git commit -m "Add inline subtype editing" -m "Make card subtype editable from the shared type-line slot while keeping card type display-only."
git push
```

## Task 9: Inline Rules Text Editing

**Files:**
- Modify: `src/editor/EditableField.tsx`
- Modify: `src/editor/EditableCard.tsx`
- Modify: `src/editor/CardEditorApp.test.tsx`
- Modify: `scripts/card-editor-data.test.mjs`

- [ ] **Step 1: Write failing rules text tests**

Cover these bug classes:

- Double-clicking rules text opens a textarea.
- Enter commits and exits edit mode.
- Escape restores the original rules text.
- Blur does not save.
- Shift+Enter inserts a newline without saving.
- Multiline rules text saves as parseable TOML and renders with existing `RulesText` behavior after confirmation.
- Save requests use `field: "rendered-text"` and UUID identity.

Run:

```bash
npm test -- src/editor/CardEditorApp.test.tsx scripts/card-editor-data.test.mjs
```

Expected: FAIL because rules text editing is not wired.

- [ ] **Step 2: Implement textarea mode**

Extend `EditableField` textarea mode:

- Enter commits.
- Escape cancels.
- Blur does not save.
- Shift+Enter inserts a newline.
- Validation and save messages stay inside or directly adjacent to the rules-text region without covering the next card.

Wire the `rulesText` `CardView` slot through this mode.

- [ ] **Step 3: Run rules text tests**

Run:

```bash
npm test -- src/editor/CardEditorApp.test.tsx scripts/card-editor-data.test.mjs src/components/CardDisplay.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run QA subagent for rules text editing**

Dispatch a separate QA subagent using the QA Gate Protocol. The subagent must verify:

- Rules text double-click opens a textarea that is large enough to edit comfortably at laptop resolution.
- Enter saves and exits edit mode.
- Escape discards a draft.
- Shift+Enter inserts a newline.
- Saved multiline text renders correctly in the card.
- Each QA edit is restored to the original rules text before the subagent exits.
- `git diff -- data/tabula/rendered-cards.toml` is clean after restoration.
- `node scripts/generated-card-data-drift.mjs` reports generated card data matches the TOML source after restoration.
- Textarea, helper text, and validation messages are not clipped or overlapping at 1280x800 and 1440x900.
- `window.__caps` has empty `errors`, `rejections`, and `consoleErrors`.

Required screenshots:

- `/tmp/card-editor-rules-textarea.png`
- `/tmp/card-editor-rules-multiline-saved.png`
- `/tmp/card-editor-rules-restored.png`

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/editor/EditableField.tsx src/editor/EditableCard.tsx src/editor/CardEditorApp.test.tsx scripts/card-editor-data.test.mjs
git commit -m "Add inline rules text editing" -m "Support Enter-confirmed rules text editing with multiline TOML patching and shared card rules rendering."
git push
```

## Task 10: Save Errors, Validation States, And Stale Response Guards

**Files:**
- Modify: `src/editor/save-state.ts`
- Modify: `src/editor/save-state.test.ts`
- Modify: `src/editor/CardEditorApp.tsx`
- Modify: `src/editor/CardEditorApp.test.tsx`
- Modify: `src/editor/EditableField.tsx`
- Modify: `src/editor/EditableCard.tsx`

- [ ] **Step 1: Write failing error-state integration tests**

Cover these bug classes:

- A server validation error keeps the user's draft visible and shows the server message.
- A network failure restores the last confirmed value and shows a retryable save error.
- A slow response for an older edit cannot overwrite a newer confirmed edit.
- Saving one field does not mark other fields on the same card as saving.
- Saving one card does not mark other cards as saving.

Run:

```bash
npm test -- src/editor/save-state.test.ts src/editor/CardEditorApp.test.tsx
```

Expected: FAIL for incomplete error-state behavior.

- [ ] **Step 2: Implement robust save/error state**

Ensure `CardEditorApp` and `EditableField`:

- Preserve per-field save state.
- Render validation errors next to the active editor.
- Render save failures on the affected field/card.
- Ignore stale responses by client revision.
- Keep the grid usable after any save failure.

- [ ] **Step 3: Run error-state tests**

Run:

```bash
npm test -- src/editor/save-state.test.ts src/editor/CardEditorApp.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run QA subagent for save and validation errors**

Dispatch a separate QA subagent using the QA Gate Protocol. The subagent must verify:

- Invalid numeric input produces a visible validation error and does not write TOML.
- A forced PATCH failure produces a visible save error and restores the previous value.
- The grid remains scrollable and other cards remain interactive after a failure.
- Error messages are visually associated with the edited field.
- Error messages do not clip or overlap neighboring cards at 1280x800 and 1440x900.
- `git diff -- data/tabula/rendered-cards.toml` is clean after the subagent exits.
- `node scripts/generated-card-data-drift.mjs` reports generated card data matches the TOML source after the subagent exits.
- `window.__caps` has empty `errors`, `rejections`, and `consoleErrors` except for the intentionally forced failed request if it is surfaced by the browser; the subagent must distinguish intentional request failure from render/runtime errors.

Required screenshots:

- `/tmp/card-editor-validation-error.png`
- `/tmp/card-editor-save-failure.png`
- `/tmp/card-editor-recovered-after-error.png`

- [ ] **Step 5: Commit and push**

Run:

```bash
git add src/editor/save-state.ts src/editor/save-state.test.ts src/editor/CardEditorApp.tsx src/editor/CardEditorApp.test.tsx src/editor/EditableField.tsx src/editor/EditableCard.tsx
git commit -m "Harden card editor save states" -m "Add per-field validation, save failure recovery, and stale response guards for inline card editor saves."
git push
```

## Task 11: Performance And Layout Polish

**Files:**
- Modify: `src/editor/CardEditorApp.tsx`
- Modify: `src/editor/CardEditorToolbar.tsx`
- Modify: `src/editor/CardEditorGrid.tsx`
- Modify: `src/editor/EditableCard.tsx`
- Modify: `src/editor/EditableField.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Measure editor interaction performance**

Run the local Vite server and use browser performance marks or `agent-browser eval` to measure:

- Initial `/editor` load to card grid rendered.
- Search input echo latency while typing at least 10 characters.
- Filter/sort recalculation with all source cards loaded.
- Enter-to-optimistic-update latency for an inline edit.
- PATCH response timing metadata for at least one edit and restoration.

Record measurements in the task notes or commit message. If typing or optimistic update visibly lags, fix before continuing.

- [ ] **Step 2: Add virtualization or incremental rendering only if measured lag requires it**

If grid interactions lag with all source cards at 1280x800 or 1440x900, add a small virtualization or incremental rendering layer in `CardEditorGrid`. Keep keyboard and double-click targeting intact. Add tests that catch cards disappearing from the derived list or edit state being lost while scrolling.

- [ ] **Step 3: Polish layout issues found during performance testing**

Fix concrete issues found in screenshots or live interaction:

- Toolbar wrapping that hides controls.
- Card fields too small to double-click reliably.
- Validation or save status overlapping card text.
- Unexpected page scroll outside the grid.
- Poor active/disabled/hover/focus state contrast.

- [ ] **Step 4: Run QA subagent for final layout polish**

Dispatch a separate QA subagent using the QA Gate Protocol. The subagent must verify:

- Full editor workflow at 1280x800 and 1440x900: search, filter, sort, scale, edit name, edit cost, edit spark, edit subtype, edit rules text, validation error, and recovery.
- Screenshots pass the full visual checklist from the QA Gate Protocol.
- Controls remain usable through repeated interactions.
- Card grid scrolling is stable and does not clip active editors.
- All QA edits are restored before the subagent exits.
- `git diff -- data/tabula/rendered-cards.toml` is clean after restoration.
- `node scripts/generated-card-data-drift.mjs` reports generated card data matches the TOML source after restoration.
- `window.__caps` has empty `errors`, `rejections`, and `consoleErrors` except intentional failed-request noise from validation/failure checks.

Required screenshots:

- `/tmp/card-editor-final-1280.png`
- `/tmp/card-editor-final-1440.png`
- `/tmp/card-editor-final-editing.png`
- `/tmp/card-editor-final-validation.png`

- [ ] **Step 5: Run focused editor tests**

Run:

```bash
npm test -- scripts/card-editor-data.test.mjs scripts/card-editor-api.test.mjs src/editor/editor-url-state.test.ts src/editor/save-state.test.ts src/editor/CardEditorToolbar.test.tsx src/editor/CardEditorApp.test.tsx src/components/CardDisplay.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit and push if polish changed files**

If this task changed files, run:

```bash
git add src/editor src/components src/index.css
git commit -m "Polish card editor layout and performance" -m "Tune card editor responsiveness and desktop layout based on agent-browser QA findings."
git push
```

If no files changed, record the measurement and QA result in the implementation notes for the next task.

## Task 12: Full Verification

**Files:**
- Verify all files changed by prior tasks.

- [ ] **Step 1: Confirm working tree only contains intended implementation files**

Run:

```bash
git status --short
```

Expected: no unexpected tracked changes. If QA left edits in `data/tabula/rendered-cards.toml`, restore the original card values through the editor or the focused save path, then rerun this step.

- [ ] **Step 2: Confirm generated card data is synced**

Run:

```bash
node scripts/generated-card-data-drift.mjs
```

Expected: PASS with generated card data matching `rendered-cards.toml`.

- [ ] **Step 3: Run core checks**

Run from repository root:

```bash
npm run lint
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 4: Run final agent-browser smoke**

Dispatch a final QA subagent using the QA Gate Protocol. The subagent must open `/editor`, exercise the complete editor flow, capture final screenshots, confirm `window.__caps` is clean, and verify the working tree is clean after restoring QA edits.

Required screenshots:

- `/tmp/card-editor-smoke-default.png`
- `/tmp/card-editor-smoke-filtered.png`
- `/tmp/card-editor-smoke-inline-edit.png`

- [ ] **Step 5: Commit and push final verification fixes**

If verification required fixes, commit and push them:

```bash
git add -u
git commit -m "Fix card editor verification findings" -m "Address final automated check or agent-browser QA findings for the card editor."
git push
```

If no fixes were needed, ensure the branch tip is already pushed:

```bash
git push
```
