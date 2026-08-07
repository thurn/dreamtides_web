---
name: build-ron-editor
description: Create or migrate a high-quality source-preserving editor for a canonical typed RON catalog. Use when adding editor support for a .ron file, moving an existing TOML editor to typed RON, defining semantic edit operations, or fixing editor saves that rewrite unrelated RON source.
---

# Build a RON Editor

Treat the RON file as hand-authored source. A scalar edit to a format-clean file must produce the smallest possible diff—normally one changed line—while retaining unrelated comments, literals, ordering, and whitespace.

## Process

1. **Understand the complete save path.** Trace the UI field through its API, staging transaction, typed model, compiler, generated artifacts, hot reload, and tests. List every writable field and compound operation.

2. **Define a typed adapter.** Give the dataset a closed operation schema, stable record identity, typed validation, and explicit mappings from editor fields to RON fields or variants. Never locate records by display text.

3. **Reuse the shared source editor.** Keep RON token scanning, record/field span location, literal handling, replacement, formatting, revisions, and atomic publication generic. Add dataset-specific mutation and path mapping; do not create a separate text parser for each editor.

4. **Patch source, not the document.** Apply the operation to an in-memory typed clone, render only the changed value or subtree, and replace its span in the original RON. Do not serialize the complete catalog during an ordinary save.

5. **Format and prove equivalence.** Run the repository RON formatter on the staged source. Parse the result with the official RON/Serde model and require exact equality with the intended typed value before compiling or publishing.

6. **Publish transactionally.** Require the expected source revision, validate all generated compatibility/runtime artifacts in staging, publish atomically, and suppress writes and HMR for semantic no-ops.

7. **Preserve the editor contract.** Keep existing controls, validation messages, tag/registry behavior, cascades, generated-data refreshes, and normal user workflow unless the task explicitly changes them.

## Required Tests

- Use a synthetic format-clean fixture containing comments, raw strings, nested values, and an unrelated record.
- Assert a one-line scalar edit produces exactly one modified source line and still passes the formatter.
- Exercise every editable field shape and require typed round-trip equality.
- Assert unrelated source bytes and collection order remain unchanged.
- Cover absent optional fields, record insertion/deletion or cascades, semantic no-ops, stale revisions, invalid identities, and failed publication.
- Run the focused tests, repository diff-aware review, and the real browser editor workflow. After one representative save, inspect `git diff -- <file>` and verify the formatter check.

## Completion Standard

The editor is complete only when the normal UI save reaches canonical RON, produces an operation-sized diff, validates the full typed catalog and generated outputs, and leaves no unrelated source or runtime changes.
