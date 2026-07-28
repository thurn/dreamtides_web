# Card Editor: Design

Status: approved design, ready for implementation planning.
Author: brainstorming session, 2026-05-28.

## Goal

Create a standalone card editor for the journey prototype at `/editor`. The
editor reads all card records from `data/tabula/rendered-cards.toml`, displays
them in a full-card grid, and writes inline edits back to the TOML source as
soon as the user confirms an edit with Enter.

The editor is a development tool for fast card iteration. It must preserve the
existing TOML formatting as much as possible, keep typing and browsing
responsive, reflect display controls in URL query parameters, and reuse the
journey prototype's existing card visual language.

## Scope

The editor supports inline editing for these fields:

- Energy cost, stored as `energy-cost`
- Character type, stored as `subtype`
- Card name, stored as `name`
- Spark, stored as `spark`
- Rules text, stored as `rendered-text`

The editor displays every `[[cards]]` record in `rendered-cards.toml`,
including records that the runtime card JSON filters from normal play.

The editor supports:

- Search by card name and rules text
- Filtering by card type, cost, and subtype
- Sorting by card number, name, cost, card type, subtype, and spark
- Card size controls comparable to the deck viewer
- URL query parameters for display state
- Inline text entry by double-clicking an editable part of a card
- Enter to confirm and save
- Escape to discard and exit edit mode

## Non-goals

- Editing tides, rarity, starter flags, image numbers, art ownership, ids,
  card type, reclaim cost, or fast status.
- Editing dream avatars or dreamsigns.
- A mobile or tablet editor layout. Laptop and desktop resolutions are the
  supported manual QA target.
- A production file-writing backend. The file-writing API is a local Vite
  development surface.
- Batch editing multiple cards in one action.
- A separate export/apply workflow.

## Existing Context

The journey prototype currently loads cards from generated
`public/card-data.json` through `src/data/card-database.ts`. The source of that
generated JSON is `data/tabula/rendered-cards.toml`, transformed by
`scripts/setup-assets.mjs`.

The transform normalizes TOML fields into runtime `CardData`:

- `energy-cost = "*"` becomes `energyCost: null`
- `spark = ""` and `spark = "*"` become `spark: null`
- Missing `subtype` becomes an empty string
- TOML kebab-case keys become runtime camelCase keys
- most `Special` rarity records are filtered from runtime JSON

Card records are identified by their `id` UUID. `card-number` remains part of
the card content for art lookup, ordering, and compatibility with existing
runtime systems, but editor API paths and save operations use UUID identity.

The editor needs the TOML source as its authoritative dataset because the user
needs to edit all card records, preserve source formatting, and write changes
to `rendered-cards.toml`.

## Architecture

`/editor` is selected before the normal journey app mounts. The editor bypasses
Firebase setup, multiplayer room setup, journey state providers, and the normal
room gate. This keeps editor startup fast and lets the editor run without
journey runtime prerequisites.

Top-level routing:

- `/` mounts the existing journey prototype.
- `/editor` mounts the card editor.
- Existing `?demo=` component demos keep their current behavior.

The editor has three main layers:

- **Editor route and state**: React route shell, URL query state, card list
  state, optimistic save state, and error state.
- **Editor card UI**: a grid of editable card previews that reuse the journey
  prototype's card chrome, art, pips, type line, and rules text rendering.
- **Local editor API**: Vite dev-server middleware that reads and patches
  `data/tabula/rendered-cards.toml` and refreshes `public/card-data.json`
  through the focused card transform.

The browser never writes files directly. All disk writes go through the local
Vite middleware.

## Local Editor API

### `GET /api/editor/cards`

Reads `data/tabula/rendered-cards.toml`, parses the `[[cards]]` array, and
returns editor records ordered by TOML order.

Each returned record includes:

- `id`
- `cardNumber`
- the editable TOML-facing fields
- a preview-ready `CardData` value produced with the existing transform rules
- enough metadata for UI labels, filters, and validation messages

The endpoint returns all source records. It does not apply the runtime
`Special` rarity filter used by `public/card-data.json`.

### `PATCH /api/editor/cards/:cardId`

Accepts one field edit for one card:

```json
{
  "id": "56020364-cbe8-4500-900f-33510a95ff10",
  "field": "name",
  "value": "Moonlit Envoy",
  "clientRevision": 12
}
```

The endpoint:

1. Reads the current TOML file.
2. Locates the `[[cards]]` block whose `id` UUID matches the route parameter.
3. Validates the field and value.
4. Applies a targeted text patch to that field inside that card block.
5. Writes `data/tabula/rendered-cards.toml`.
6. Refreshes `public/card-data.json` through the focused card transform.
7. Returns the confirmed editor record and save timing metadata.

The endpoint accepts exactly one editable field per request. Multi-field saves
can be added later by composing the same lower-level patcher, but the first
version keeps saves narrow for simpler rollback and clearer UI status.

## TOML Patching

Formatting preservation is a hard requirement. The save path uses a targeted
text patcher instead of serializing the entire TOML object.

The patcher operates on one `[[cards]]` block:

- It finds the block by `id` UUID.
- It replaces only the line or multiline value for the requested field.
- It preserves all unrelated blocks and unrelated fields byte-for-byte.
- It preserves the current field order.
- It emits valid TOML syntax for edited strings, numbers, booleans, and
  supported special values.

Rules text needs special handling because current records use both single-line
strings and triple-quoted multiline strings. The patcher should use a
single-line string when the edited rules text is one line and a multiline
string when it contains line breaks. The patcher may convert that one field's
representation when needed, while preserving the rest of the file.

After patching, the server reparses the resulting TOML as a correctness check
before writing the final file. A parse failure aborts the write and returns a
save error to the UI.

## Validation

The server is authoritative. The UI may do immediate lightweight validation for
responsiveness, but the server response decides whether a save is confirmed.

Field rules:

- `energy-cost`: accepts non-negative integers and variable values entered as
  `X` or `*`. The TOML source stores variable cost as `"*"`.
- `spark`: accepts non-negative integers, variable values entered as `X` or
  `*`, and blank. The TOML source stores variable spark as `"*"` and blank
  spark as `""`.
- `subtype`: accepts a string. Blank is valid.
- `name`: accepts a non-empty string after trimming only surrounding editor
  input artifacts. Intentional internal spacing is preserved.
- `rendered-text`: accepts a string. Multiline text is valid and preserved.

Validation errors return a structured response with field id, message, and the
server-confirmed value.

## UI Model

The editor uses the approved grid-inline layout. The first screen is the
working editor, not a landing page.

Top-level regions:

- Header with title, card count, active save/error summary, and reload control.
- Toolbar with search, filters, sort, sort direction, and card size controls.
- Scrollable card grid.
- Inline save/validation status rendered on the affected card or field.

The grid shares the normal journey card rendering path:

- Card art from `public/cards/<cardNumber>.webp`
- Event and Character chrome
- Energy and spark pips
- Type line formatting
- Rules text rendering, including symbols and glossary formatting

Implementation should refactor `CardDisplay` into shared render primitives that
the normal journey surfaces and the editor both consume. The editor can wrap
editable regions around shared slots, but the visual card structure, chrome,
text scaling, pips, art handling, type line formatting, rarity treatment, and
rules text rendering should have one maintained implementation. This shared
render path is an acceptance criterion.

## Inline Editing

Editable regions:

- Cost pip
- Subtype text in the type line
- Name
- Spark pip or spark placeholder
- Rules text block

The card type portion of the type line is display-only. The editor does not
edit `card-type`.

Behavior:

- Double-click enters edit mode for the clicked region.
- The active region is replaced by an inline input or textarea sized to the
  region.
- Enter confirms the edit, exits edit mode, updates optimistic UI state, and
  starts a save request.
- Escape discards the draft and exits edit mode.
- Blur does not save.
- A save failure restores the server-confirmed value and shows a local error.
- A validation failure keeps the user in edit mode when practical and shows the
  validation message next to the field.

Rules text uses a textarea. Enter confirms the edit for consistency with the
feature request. If multiline editing needs a newline affordance, the plan can
reserve Shift+Enter for inserting a newline, but Enter remains the only save
shortcut.

## URL Query State

The editor reads its initial display state from `window.location.search` and
keeps the URL updated as controls change.

Suggested query parameters:

- `q`: search text
- `type`: `all`, `character`, or `event`
- `cost`: `all`, `0`, `1`, `2`, `3`, `4`, `5plus`, or `x`
- `subtype`: subtype string, empty omitted
- `sort`: `number`, `name`, `cost`, `type`, `subtype`, or `spark`
- `dir`: `asc` or `desc`
- `size`: `small`, `medium`, or `large`

Control changes use `history.replaceState` so typing in search and toggling
filters keeps the current editor view shareable without adding a browser
history entry for every keystroke.

Typing should echo immediately. Any debounce applies only to expensive derived
filter work, not to the controlled input value.

## Performance Requirements

The editor must be designed so typing, scrolling, and entering/exiting edit
mode stay responsive with the current card catalog size.

Requirements:

- Typing in an active editor is local React state and never waits for disk I/O.
- Enter submits one field save request and returns control to the UI
  immediately.
- Optimistic UI updates happen before the save request completes.
- Filtering and sorting are memoized derived data.
- Card components receive stable props where practical so one save does not
  remount the entire grid.
- Full asset setup is not run per edit.
- `public/card-data.json` refresh uses the focused card transform.
- The save endpoint measures and logs save duration.
- If JSON refresh cannot reliably stay under 100 ms, TOML write remains the
  synchronous confirmation step and JSON refresh moves to an asynchronous
  follow-up with visible sync state.
- If measured grid interactions lag on laptop viewports, add virtualization or
  incremental rendering before broadening the feature.

An exploratory benchmark on 2026-05-28 showed parse plus focused card-data
serialization in single-digit milliseconds on the current machine, with a max
of about 15 ms across 100 in-memory runs. Disk I/O and dev-server overhead must
still be measured during implementation.

## Save State And Concurrency

The UI tracks save state at field/card granularity:

- `idle`
- `editing`
- `saving`
- `saved`
- `validationError`
- `saveError`

Concurrent saves to different cards can proceed independently. Saves to the
same card and field are serialized or guarded with a client revision so a slow
response cannot overwrite a newer confirmed value.

If a save is in flight and the user edits the same field again, the UI should
keep the latest draft local and avoid applying stale confirmations over it.

## Error Handling

Load errors show a full-page editor error with retry.

Save errors:

- Mark the affected card and field.
- Restore the server-confirmed value.
- Keep the editor route usable.
- Provide a retry path by letting the user edit and press Enter again.

Validation errors:

- Stay next to the inline field.
- Avoid writing TOML.
- Preserve the user's draft until Escape or a corrected Enter save.

Unexpected API errors include a concise user-facing message and details in the
browser console for developer debugging.

## Automated Tests

Focused automated coverage should include:

- TOML block locator finds the correct card by `id` UUID.
- Save requests identify cards by UUID.
- Field patcher preserves unrelated bytes in the TOML file.
- Field patcher handles single-line and multiline `rendered-text`.
- Cost and spark validation accepts integer and special values.
- Invalid cost and spark values fail with structured errors.
- Focused card-data refresh matches the existing `transformCard` behavior.
- URL parser accepts valid editor params and falls back for invalid params.
- React tests for double-click edit mode, Enter commit, Escape revert, blur
  behavior, optimistic state, rollback after save failure, and query-state
  syncing.

Repository checks after implementation:

```bash
npm run lint
npm run typecheck
npm test
```

## Manual QA Requirement

Manual browser QA is a hard implementation constraint for this feature. It is
not a final-pass activity.

Every implemented UI piece must be followed by a separate QA subagent run using
`/opt/homebrew/bin/agent-browser` against a local Vite server. `npx
agent-browser` is acceptable only when the Homebrew-installed binary is
unavailable.

Each QA subagent must:

1. Open the actual `/editor` route.
2. Install browser hooks that capture render errors, unhandled rejections, and
   console errors.
3. Exercise the normal workflow for the UI piece that was just implemented.
4. Capture screenshots of each relevant UI state.
5. Inspect live browser state directly.
6. Analyze screenshots and browser state against the checklist below.
7. Report findings before development continues.

The implementation plan must place a QA subagent checkpoint after every UI
slice, including:

- Editor route shell and initial load state
- Toolbar/query controls
- Card grid and scale controls
- Inline name editing
- Inline cost and spark editing
- Subtype editing
- Rules-text editing
- Save states and validation errors
- Save failure rollback
- Final layout polish

A UI slice is complete only after the paired QA subagent has run the actual UI,
captured screenshots, analyzed them, and any reported issues have been fixed
and rechecked.

Screenshot and browser-state analysis must explicitly check for:

- Broken spacing or alignment consistency
- Inconsistent button states or interaction feedback
- Tap/click targets that are too small or hard to hit
- Confusing visual hierarchy, where the important action does not stand out
- Misaligned labels, helper text, or form validation messages
- Unexpected scrolling behavior or clipped content in containers
- Poor color contrast

Laptop and desktop viewports are the target. Representative viewport checks
should include 1280x800 and 1440x900. Mobile and tablet QA are outside this
feature's scope.

## Implementation Boundaries

Keep implementation units small:

- `src/editor/` owns editor React components, URL state, API client, and editor
  validation helpers that are safe for browser code.
- Vite middleware owns filesystem access and TOML patching.
- Shared card display extraction is expected so normal journey card surfaces and
  editor card surfaces use the same rendering primitives.
- Existing journey runtime state and multiplayer code should stay out of the
  editor.

## Acceptance Criteria

- `/editor` loads without Firebase or room setup.
- The editor displays all cards from `data/tabula/rendered-cards.toml`.
- Editor saves identify cards by UUID.
- Search, filters, sorting, sort direction, and scale controls work and update
  URL parameters via `replaceState`.
- Double-clicking each supported card field enters inline edit mode.
- Enter confirms and saves edits to `data/tabula/rendered-cards.toml`.
- Escape discards edits.
- Blur does not save.
- Cost and spark special values round-trip correctly.
- TOML saves preserve unrelated file formatting and content.
- `public/card-data.json` refreshes through the focused transform when it can
  stay within the responsiveness budget.
- Save and validation errors are visible, local, and recoverable.
- Editor cards and normal journey cards share one maintained rendering path.
- The full automated check suite passes.
- Every UI slice has a completed `agent-browser` QA subagent checkpoint with
  screenshots and analysis against the required visual checklist.
