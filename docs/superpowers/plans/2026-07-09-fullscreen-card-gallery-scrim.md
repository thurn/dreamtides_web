# Full-Screen Card Gallery Scrim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every full-screen card gallery use the standard alpha scrim without backdrop blur while bounded card galleries remain glass.

**Architecture:** `CardGalleryPanel` derives material and accessory placement from its existing `frame` value. `StartingDeckOverlay` selects `fullBleed` on mobile and `floating` on desktop, so the material rule follows geometry without a new appearance prop.

**Tech Stack:** React 19, TypeScript, Vitest, Cumulus semantic CSS tokens.

## Global Constraints

- `fullBleed` resolves through `--scrim-gallery` and emits no backdrop filter.
- `floating` retains the shared liquid-glass recipe.
- Deck viewer behavior remains unchanged.
- Starting Deck desktop remains a floating glass panel.
- Starting Deck mobile uses the full-screen scrim treatment.

---

### Task 1: Derive Card Gallery Material From Frame Geometry

**Files:**
- Modify: `src/cumulus/components/card/CardGalleryPanel.tsx`
- Modify: `src/cumulus/components/card/CardGalleryPanel.test.tsx`
- Modify: `src/cumulus/screens/StartingDeckOverlay.tsx`
- Modify: `src/cumulus/screens/StartingDeckOverlay.test.tsx`
- Modify: `src/cumulus/docs/demos/card-gallery-panel.tsx`
- Modify: `.llms/skills/cumulus/materials.md`
- Regenerate: `src/cumulus/metadata/cumulus-metadata.json`, `.llms/skills/cumulus/`

**Interfaces:**
- Consumes: `CardGalleryFrame = "floating" | "fullBleed"` and `--scrim-gallery`.
- Produces: a frame-derived gallery material with `onGlass` accessories for `floating` and `onMedia` accessories for `fullBleed`.

- [ ] **Step 1: Write failing component and responsive screen assertions**

Assert the full-bleed gallery background is `var(--scrim-gallery)`, its rendered style contains no `backdrop-filter`, and its accessory reports `data-glass-placement="onMedia"`. Assert the mobile Starting Deck has the same computed inline contract while desktop retains a glass backdrop.

- [ ] **Step 2: Run the focused tests and confirm the material assertions fail**

Run: `npx vitest run src/cumulus/components/card/CardGalleryPanel.test.tsx src/cumulus/screens/StartingDeckOverlay.test.tsx`

Expected: failures show the full-bleed gallery still uses the glass background/filter and `onGlass` accessory placement.

- [ ] **Step 3: Implement the frame-derived material**

Keep `glassSurfaceStyle()` and the popover glass fill for `floating`. For `fullBleed`, emit only `background: token("--scrim-gallery")` from the material branch and select `onMedia` for the accessory. Remove the redundant mobile `GlassBackdrop` from `StartingDeckOverlay`.

- [ ] **Step 4: Regenerate Cumulus metadata/docs and run verification**

Run the focused tests, `npm run cumulus-metadata && npm run cumulus-docs`, `npm run lint`, `npm run typecheck`, and `npm test`.

- [ ] **Step 5: Browser QA and delivery**

Verify `?goto=startingdeck` at 390×844 and 1440×900, and recheck `?goto=deckviewer` at both widths. Assert the relevant full-screen backgrounds resolve to the scrim with no backdrop filter, inspect error buffers, capture 2× screenshots, then commit and push the review branch.
