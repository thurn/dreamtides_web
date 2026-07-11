# Task 6 implementation report

## Status

Complete. The compatibility APIs and independent reveal engine are deleted, the public boundary is lint-enforced, the deterministic conformance page is registered at `?demo=entity-reveals`, automated verification is green, and the browser matrix completed with task-owned resources cleaned up.

## RED / GREEN record

- RED: `npx vitest run eslint-rules/no-entity-reveal-escape-hatches.test.ts` failed because `no-entity-reveal-escape-hatches.js` did not exist.
- GREEN: the lint-rule suite passes 12 cases covering internal imports, InfoCard interaction statics, generic wrappers, arbitrary ReactNode/spec APIs, direct reveal portals, mechanical props, controlled state, named components, and internal implementation/tests.
- RED: `npx vitest run src/tango/screens/devtools/EntityRevealConformanceDemo.test.tsx` failed because `EntityRevealConformanceDemo.tsx` did not exist.
- GREEN: both demo tests pass. The end-to-end test opens a real named GameCard source, compares logged source/final rectangles with rendered DOM rectangles, verifies shown/dropped counts and all fallback flags, verifies desktop circle-clearance absence, then verifies resize dismissal and `activationOutcome: "none"`.
- Existing Draft preview tests failed after the retired wrapper was deleted. They drove the strict named `CompactGameCardRow`, which preserves the compact row while deriving the canonical GameCard primary and glossary secondaries from UUID-backed card data.

## Boundary and deletion inventory

- `InfoCard` exports strict visual variants, `INFO_CARD_WIDTH`, and viewport-derived visual sizing helpers. Its interaction statics, anchor/portal types and helpers, reveal delay state, fixed reveal constants, direct portal, and pointer engine are absent.
- Deleted `HoverPopover.tsx`, its placement engine/test, catalog demo/reference, registry entry, and container exemption.
- Deleted the retired `CardHoverPreview` visual/geometry helper and test.
- Migrated product consumers:
  - editor tide card source uses `GameCard`;
  - HUD overflow renders every clipped item as a named `Dreamsign` source;
  - QuestStart aggregate help is static explanatory copy;
  - CardSource aggregate tide help is static explanatory copy;
  - Draft compact deck rows use strict `CompactGameCardRow` semantics.
- Retired-symbol source audit is empty after the stale DeckViewer test comment cleanup.
- Imports from `src/tango/internal/reveal` outside `TangoRoot`, the internal directory, and named Tango components: empty.
- Reveal portal ownership: `src/tango/internal/reveal/RevealOverlay.tsx`. Other `createPortal` matches are unrelated Select, BattleContextMenu, and SignatureDecks visualization portals.

## ESLint rule

`tango/no-entity-reveal-escape-hatches` is registered for `src/**/*.{ts,tsx}` and `docs/**/*.{ts,tsx}`. It rejects:

- product imports from the internal reveal package;
- InfoCard interaction statics;
- HoverPopover and generic reveal wrappers;
- arbitrary ReactNode reveal slots and public RevealSpec APIs;
- reveal portals created outside the coordinator;
- anchor, portal, timing, side, gap, and other mechanical props;
- caller-controlled open/shown state on named reveal components.

Internal coordinator files/tests and the named Tango component layer are the explicit implementation boundary. Compatibility APIs have no baseline. Numeric-prop allowances for retired press wrappers were deleted.

## Conformance demo and diagnostics

`?demo=entity-reveals` uses fixed UUID/domain fixtures for:

- popup and press-in-place GameCard;
- unavailable GameCard;
- strict InfoCard with and without a second card;
- inline GlossaryTerm;
- AtlasNode;
- battle-labelled canonical GameCard.

Seven semantic scenario selectors arrange above, side-fallback, top-edge, truncation, best-effort, simulated safe-area, and reduced-motion review states. The safe-area selector publishes a 52px simulated physical inset at the document root so the coordinator portal reads it. No production mechanical props/specs are exposed.

The end-to-end diagnostic assertion validates the actual source rectangle, rendered primary/secondary rectangles, viewport snapshot, shown/dropped counts, fallback flags, circle-clearance applicability, dismissal reason, and activation outcome.

## Regeneration and automated verification

- `scripts/regenerate-assets.sh`: passed all 12 stages.
- Tango metadata: 37 components, 202 props.
- Tango docs: 30 component references, stale HoverPopover reference swept.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm test`: 391 files passed, 1 skipped; 4,217 tests passed, 4 skipped.
- `git diff --check`: pass.

## Browser matrix

Runtime: `http://localhost:5174`, unique session `q6-entity-5174`, device scale 2 for every capture. URL and `window.innerWidth` were asserted before every screenshot. Error, unhandled-rejection, and console-error buffers stayed empty in every recorded state.

### Conformance page

- Desktop 1440×900, `/?demo=entity-reveals`: popup source 160×224 at (24,188.39); reading GameCard 340×476 at (0,62.39); three ordered secondaries at x=350 with 10px vertical gaps. One active group.
- Desktop keyboard focus: inline GlossaryTerm produced one 248×79.70 primary at (990.44,97.69). One active group.
- Mobile 390×844: popup cards measured 175.5px (45vw). Top-edge layout placed primary at x=214.5 and ordered secondary column at x=0. The impossible top-edge case used best-effort placement without horizontal document overflow (`scrollWidth === clientWidth === 390`).
- Mobile press-in-place: 360px complete source stayed visible, popup primary was omitted, and unavailable secondaries were truncated when the remaining clearance was impossible.
- Mobile release and nested non-bubbling scroll dismissed the touch reveal. Battle `dragstart` dismissed the active reading group after one event turn.
- Safe-area simulation: root inset measured 52px and every reveal rectangle started at y=52 or lower.
- Reduced motion: `matchMedia('(prefers-reduced-motion: reduce)').matches === true`; open card transition was exactly `none`, and return state disappeared without a motion transition.
- Fixed unavailable source remained focusable/informative and carried no activation callback.

### Normal workflows and entity spot checks

- Atlas: `/atlas?goto=atlas&ui=tango&seed=task6&game=f9ft3g`, 1440×900. Seventeen Atlas nodes. Available-node hover produced 248×294.08 primary plus two 248px top-aligned secondaries to its right.
- Draft: `/dreamscape/0-firstlight-meadow/draft?goto=draft&ui=tango&seed=task6&game=jespnf`, 1440×900. Four GameCards. Hover produced 340×476 primary plus three ordered secondaries.
- Shop: `/dreamscape/0-firstlight-meadow/shop?goto=shop&ui=tango&seed=task6&game=mysfdm`, 1440×900. Five GameCards. Hover produced a 340×476 reading copy and 248px secondary.
- Deck/HUD: `/dreamscape/0-firstlight-meadow?goto=deckviewer&ui=tango&seed=task6&game=ezty56`, 1440×900. Semantic-source inventory included site, dreamcaller, resource-essence, dreamsign, game-card, card-spark-stat, and card-energy-stat. Dreamsign hover produced a 248×239.30 reveal above the HUD.
- Battle: `/dreamscape/0-firstlight-meadow/battle?startInBattle=1&ui=tango&seed=task6&game=77esaw`, 1440×900 after **Begin Battle**. Five battle hand cards, all using named GameCard sources. Hover produced 340×476 primary plus a 248×120.30 Support secondary; drag dismissed it.
- Conformance/documentation coverage supplied GlossaryTerm, InfoCard variants, unavailable, Atlas, and battle-labelled canonical card spot checks; normal HUD supplied sites, Dreamcaller, resources, Dreamsigns, GameCards, and stat orbs.

### Screenshots

Stable path: `screenshots/entity-reveals/`

- `desktop-initial.png`
- `desktop-hover-popup.png`
- `desktop-focus-inline.png`
- `desktop-reduced-motion.png`
- `mobile-top-edge-initial.png`
- `mobile-touch-top-edge.png`
- `mobile-press-in-place.png`
- `mobile-safe-area.png`
- `workflow-atlas.png`
- `workflow-draft.png`
- `workflow-deck-hud-dreamsign.png`
- `workflow-battle.png`

## Cleanup

- Closed only session `q6-entity-5174`.
- Sent SIGINT to the recorded `npm run dev -- --port 5174` process tree and observed clean Vite/Firebase emulator shutdown.
- `lsof -iTCP:5174 -sTCP:LISTEN -n -P` returned no listener.
- Port 5173 and other browser sessions were untouched.

## Self-review and concerns

- Documentation wording scan found none of the prohibited historical-contrast phrases in the normative reveal or QA-scene docs.
- Card semantics use UUIDs. The Draft fixture was corrected to a valid UUID so fail-closed semantics are exercised in its screen test.
- The conformance battle representative uses the canonical GameCard source with a battle instance data hook; the normal playable-battle workflow separately verifies the full `BattleGameCard` adapter.
- No pre-existing unrelated issue was encountered.

## Commit and push

- Commit message: `refactor(tango): enforce unified entity reveal system`.
- Branch: `wt/entity-reveal-rewrite-plan`.
- Push: completed immediately after the final amended commit.
