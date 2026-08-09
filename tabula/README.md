# Tabula

Tabula is a Tauri v2 developer tool for editing canonical Dreamtides RON catalogs. The proof of concept supports `data/affiliations.ron` with staged, revision-checked semantic saves, inline validation, and undo/redo.

Run `npm install` in this directory, then `npm run tauri dev`. The app discovers the enclosing Dreamtides repository; **Open repository** can select a different checkout. `npm run dev -- --port 5185` runs browser UI review. `http://localhost:5185/?real=1` loads the current generated affiliation and card catalogs while keeping edits in memory, and `http://localhost:5185/?demo=1` provides a deterministic synthetic fixture for component development. The native Tauri app reads and writes the canonical RON source through semantic edit operations.

## Editor architecture

The frontend communicates through the closed `EditorSnapshot`, `AffiliationDraft`, `EditorOperation`, and `EditorTransport` contracts in `src/editor.ts`. `editorRegistry` is the extension point for another custom catalog editor. Each editor owns its typed snapshot, draft validation, semantic operation builder, and presentation while sharing transport behavior and Cumulus components.

The Tauri backend loads typed RON plus the generated card catalog and delegates each explicit save as one operation batch to `scripts/game-data-pipeline.mjs edit`. That pipeline checks the source revision, applies operation-sized RON patches in the Rust game-data editor, validates and compiles the complete staged data tree, and publishes atomically. Tabula logs operation counts, kinds, and outcomes to `logs/tabula-log.jsonl` without logging field contents.

Run all proof-of-concept checks from the repository root with `npm run tabula:check`.
