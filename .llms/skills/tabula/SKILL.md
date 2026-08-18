---
name: tabula
description: Build, modify, diagnose, or review the Tabula Tauri v2 editor for Dreamtides canonical RON catalogs. Use for work under tabula/, affiliation editing, custom RON editor extensions, Tabula Cumulus UI/UX, browser prototypes, native save/load behavior, WebdriverIO Tauri tests, or adversarial review of Tabula screenshots and workflows.
---

# Work on Tabula

Treat Tabula as an expert-facing source editor, not a form demo. Preserve canonical RON source, make dense catalogs fast to scan and manipulate, and prove native file editing before handoff.

## Load the relevant doctrine

- Read `.llms/skills/cumulus/SKILL.md` before changing or reviewing UI, styling, spacing, icons, or interaction components. Reuse Cumulus primitives, tokens, glyphs, and established behavior.
- Read `.llms/skills/build-ron-editor/SKILL.md` before changing a dataset model, editor operation, validation, load/save behavior, or canonical RON output.
- Read `tabula/README.md`, `tabula/src/editor.ts`, `tabula/src/App.tsx`, and `tabula/src-tauri/src/lib.rs` for the current contracts. Trace the real implementation instead of relying on historical assumptions.

## Preserve the architecture

Keep the frontend boundary explicit: `EditorSnapshot` supplies loaded state, `AffiliationDraft` supplies editable state, `EditorOperation` expresses semantic changes, and `EditorTransport` separates browser review from native IPC. Extend `editorRegistry` when adding another catalog editor rather than baking another dataset into shared transport behavior.

Identify records and cards by UUID. Never locate, compare, map, or test them by display name. Names are presentation only and are not unique.

Send closed semantic operations to the backend. Patch only the affected RON spans, require the expected source revision, validate staged typed data and generated outputs, and publish atomically. A valid scalar edit should normally change one source line without rewriting comments, ordering, literals, or unrelated records.

Keep the WebDriver server, temporary repository override, and frontend test bridge behind the explicit `e2e` build mode or Rust feature. Verify that an ordinary Tauri build still compiles without activating the test server.

## Choose the right test loop

Use the smallest loop that answers the current question, then escalate before handoff.

### Fast logic loop

From the repository root, run focused frontend tests while iterating:

```bash
npm --prefix tabula run test -- src/editor.test.ts
```

Add deterministic synthetic fixtures for operation building, validation, searches, undo/redo semantics, and transport adapters. Do not assert exact player-facing copy.

### Fast browser UI loop

Run Tabula's Vite app on a non-default port:

```bash
npm --prefix tabula run dev -- --port 5185
```

Use `http://localhost:5185/?real=1` for normal UI review against the current generated affiliation and card catalogs. This is the default review surface: it gives realistic names, card art, record counts, rule text, and layout density while keeping edits in memory. Use `?demo=1` only for deterministic component development or deliberately constructed edge cases.

Use the globally configured Playwright MCP tools for quick interaction checks and screenshots. The MCP client receives an isolated BrowserContext from the singleton service. Exercise the actual workflow: select a record, edit fields, undo/redo, inspect validation, open and search the signature-card picker, add/remove/reorder cards, and test narrow and desktop layouts. Inspect console errors and unhandled rejections.

Browser mode does not prove Tauri IPC, Rust serialization, filesystem publication, stale-revision behavior, packaged WKWebView asset loading, or persistence. Never present a browser-only pass as proof that saving works.

### Native end-to-end gate

Run this from the repository root:

```bash
npm run tabula:test:e2e
```

This builds the E2E frontend and native Tauri binary, starts WebdriverIO's embedded macOS driver, copies the real repository inputs into a temporary repository, edits a real affiliation through WKWebView, saves through Tauri IPC and the Rust data pipeline, verifies an operation-sized diff in `data/affiliations.ron`, and reloads the persisted result. It must never modify the worktree's canonical data. Review ignored artifacts under `tabula/e2e/artifacts/`.

Require the native gate for changes involving:

- save enablement, validation, serialization, IPC, repository discovery, revisions, or publication;
- native-only controls such as repository selection;
- Tauri configuration, capabilities, Rust features, Vite asset output, icon fonts, or packaged rendering;
- any handoff claiming that users can edit a RON file successfully.

### Broader gates

Run `npm run tabula:check` after the focused loop. Run repository-root `npm run review` before committing. Use `npm run review:full` for test infrastructure, cross-cutting architecture, or release-level validation.

## Design for an expert user

Reason deeply about the whole editing job before arranging controls. Optimize information architecture and repeated workflows, not just the appearance of an isolated screen.

Keep these layers legible:

1. Persistent file identity, repository context, save state, validation state, and global actions.
2. A searchable catalog navigator that supports rapid switching and communicates dirty or invalid records.
3. A focused inspector with compact, predictable field grouping and errors beside the responsible control.
4. Signature-card visualization that combines ordered card art, name, type/subtype, useful rules text, UUID, and obvious reorder/remove actions.
5. A card-finding workflow that supports name, rules text, subtype, and UUID search; useful filters; current/selected states; multi-add; keyboard focus; and a clear return to the edited record.

Favor compact scanning, stable spatial positions, preserved selection and scroll context, keyboard access, explicit system state, and fast recovery from mistakes. Make UUIDs discoverable and copyable without letting them dominate the hierarchy. Test realistic density, long text, unresolved references, empty results, validation failures, narrow windows, and large catalogs.

Never leave a disabled primary action unexplained. If Save is blocked, expose the validation cause where the user can act on it and include a visible aggregate state. Verify a freshly loaded valid catalog has zero invalid controls and that one valid edit enables Save.

Use Cumulus as the visual and behavioral language. Prefer existing `GlassButton`, `IconButton`, `TextField`, `Select`, `GlassPanel`, `Pressable`, tokens, typography, and glyph registry entries. Do not imitate Cumulus with one-off CSS or substitute generic dashboard patterns. A polished surface with weak hierarchy or broken editing flow is still a failed design.

## Request adversarial UI review

After the representative workflow works and before final visual sign-off, request one adversarial review from a `gpt-5.6-sol` subagent at high or xhigh reasoning. Give it raw desktop, narrow, picker-open, dirty, validation, and saved-state screenshots that exist; include the review URL or relevant UI files when useful. Do not give it your own suspected problems or desired verdict.

Use a prompt in this form:

> Adversarially review this expert-facing Tabula RON editor from the supplied screenshots and workflow. Identify choices that are confusing, inefficient, inaccessible, visually incoherent, misleading about system state, or likely to break real catalog editing. Evaluate information architecture, hierarchy, density, terminology, discoverability, error recovery, card search/selection, and save confidence. Rank findings by user impact and cite concrete visual or interaction evidence. Be blunt; do not propose cosmetic churn without a user problem.

Verify every finding against the live implementation. Fix confirmed material problems, not reviewer taste. Then perform a separate cold final visual pass without the earlier diagnosis in view.

## Remember the failure modes

- Browser fixtures can hide contract mismatches. A Rust snapshot once serialized catalog defaults as camelCase while TypeScript expected canonical snake_case; two hidden validation errors permanently disabled Save. Test backend JSON field names, initial validation state, Save enablement, disk publication, and reload together.
- A passing DOM test can miss packaged rendering. WKWebView exposed icon-font mojibake because CSS minification emitted literal private-use glyphs. Keep CSS icon escapes compatible with native loading, wait for `document.fonts`, assert an icon resolves to one glyph, and inspect the native screenshot.
- Fake data is useful for targeted edge cases, not acceptance. Review realistic catalog density and card art with `?real=1`, then use the temporary-real-repository native test for persistence.
- Display names are unstable test selectors. Expose stable UUID-backed attributes where automation needs identity.
- A click on Save is not evidence of saving. Assert enabled state, saved status, exact disk content, operation-sized source diff, and persistence after reload.
- Test tooling can accidentally compromise production builds. Compile both explicit E2E features and an ordinary custom-protocol Tauri build.
- Screenshots are evidence, not decoration. Inspect them at full size for clipping, overlap, hierarchy, legibility, incorrect glyphs, misleading disabled states, and whether the user can tell what file and record they are editing.

## Finish only with evidence

Before declaring a functional or visual Tabula change complete, require:

- focused tests and `npm run tabula:check`;
- the realistic browser workflow for UI changes;
- the native E2E gate for any persistence or native-risk change;
- an inspected native screenshot when packaged rendering is in scope;
- an operation-sized canonical RON diff for a representative save;
- adversarial review and verified remediation for substantial UI work;
- repository `npm run review` at minimum;
- no surviving test server, WebDriver listener, or browser session owned by the task.
