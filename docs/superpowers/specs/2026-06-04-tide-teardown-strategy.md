# Tide Teardown — Outstanding Uses & Strategy

Context: the V2 + idf3 overhaul replaced tide-based draft-pool construction. idf3
ignores all tide data. This catalogs every remaining tide use and a
removal/redesign strategy for each.

**Hard constraint:** the game/runtime must not depend on `CARDS_V2_POOL_METADATA`
(`src/data/cards-v2-metadata.ts`) — it is draft-pool *experiment* scaffolding for
the non-idf3 `?algo=` variants, not authored card data. V2 `cards_v2.toml` has
**zero** per-card tides; the ~451 `card.tides` values in `cards_v2-data.json` are
injected from that metadata at build time and must stop being injected.

## Two tide systems

- **System A — `card.tides`** (`PackageTideId[]` per card). On V2 it originates
  *only* from `CARDS_V2_POOL_METADATA`. Disallowed → must become empty/removed for
  the runtime.
- **System B — package/dream avatar tides** (`mandatoryTides`, `optionalTides`,
  `selectedTides`, `optionalSubset`, dreamsign `packageTides`,
  `resolvedPackagesByDreamAvatarId`). Dead since the cutover; always empty.

## Outstanding uses

### Data / build
| Location | System | State | Strategy |
|---|---|---|---|
| `src/data/cards-v2-metadata.ts` `CARDS_V2_POOL_METADATA` (`tides`/`core`/`colors`/`draftArchetypes`) | A | Disallowed in runtime; only non-idf3 variants + experiments read it | **Stop merging into `cards_v2-data.json`** (remove the merge in `setup-assets.mjs`). Then remove the file once its last consumers (non-idf3 variants, `generate-color-pool.mjs`) are retired. |
| `scripts/setup-assets.mjs` (V2 merge of `meta.tides`/etc.; `transformCard` `tides` default) | A | Injects tides into runtime JSON | Drop the metadata merge for the runtime card JSON. Keep a `tides: []`-free CardData (see types). |
| `data/tabula/cards_v2.tides.toml` (name→color registry) | A | Editor-only authoring registry | Keep or remove with the editor tide panel (separate decision; out of scope here). |

### Types
| Location | System | Strategy |
|---|---|---|
| `src/types/cards.ts` `CardData.tides` | A | Remove the field once runtime readers are redesigned (battle art, journeys). |
| `src/types/content.ts` `PackageTideId`, `DreamAvatarContent.{mandatoryTides,optionalTides}`, `ResolvedDreamAvatarPackage.{mandatoryTides,optionalSubset,selectedTides}`, `DreamsignTemplate.packageTides` | A+B | Remove all. `PackageTideId` goes last, after every consumer. |
| `src/battle/types.ts` `BattleDeckCardDefinition.tides`, `BattleEnemyDescriptor.packageTides` | A+B | Remove with their producers/readers. |

### System A runtime consumers (incidental — need redesign or removal)
| Location | What it does | Strategy |
|---|---|---|
| `src/battle/components/BattleCardView.tsx` `createArtStyle`/`tideHueForName` | Fallback card-art gradient hue from `tides[0]` (cosmetic) | **Redesign:** derive the hue from a stable non-tide key (card `id`/`name` hash, or `cardType`/`subtype`). Removes the only player-visible loss from dropping `card.tides`. |
| `src/journeys/journey/effects.ts` (`hasTideOverlap`, `tideOverlap`), `src/journeys/journey/assembly.ts` (`selectedCardTargets`/`selectedDreamsignTargets`), journey shapes using `tideOverlap` | Filters journey card/dreamsign targets by tide overlap; `"selected"` mode reads empty `selectedTides` | **Decide intent:** drop `tideOverlap` filtering entirely (targets = full pool), or re-base on a non-tide signal (e.g. card subtype, or membership in the chosen idf3 starter decklist). Audit `src/journeys/journey/shapes/` for which shapes rely on it. |
| `src/draft/draft-engine.ts` (`countByTide`, `cardTides` log field, `selectedPackageTides` log) | Logging only | Remove the tide logging fields. |
| `src/draft/pool/pool-data.ts` (`buildPoolData` reads `card.tides`) | Builds archLists for non-idf3 variants | Remove with the non-idf3 variants, or guard (idf3 ignores archLists). |
| `src/multiplayer/battle-normalize.ts` (`tides` default) | Threads tides through battle deck defs | Remove with `BattleDeckCardDefinition.tides`. |
| `src/battle/card-definition.ts`, `src/battle/state/create-initial-state.ts`, `src/battle/integration/create-battle-init.ts` (tide spreads) | Carry tides on battle deck cards | Remove with the field. |
| `src/journeys/ui/referencedCards.ts`, `src/journeys/adapter/buildContext.ts`, `src/journeys/adapter/content-bridge.ts` | Pass `card.tides` through journey adapters | Remove the passthrough. |

### System B runtime consumers (dead — remove or redesign)
| Location | What it did | Strategy |
|---|---|---|
| `src/screens/JourneyStartScreen.tsx` (tide chips via `structural-tides.dreamAvatarTidesForDisplay`) | Showed a dream avatar's strategy as tide chips; now hidden (empty) | **Redesign:** show the dream avatar's `signatureCards` (or labels derived from them) as the strategy preview. |
| `src/screens/DreamsignSourceOverlay.tsx` (+ buttons in `DreamsignDraftScreen.tsx`, `DreamsignOfferingScreen.tsx`) | Explained why a dreamsign was offered (tide match) | **Remove** — dreamsigns are random now; there is no source to explain. Delete overlay + its launch buttons + props. |
| `src/debug/card-source-debug.ts`, `src/screens/CardSourceOverlay.tsx` | Showed why a draft card was in the pool (tide match → on-theme/fallback) | **Redesign (debug-only):** report idf3 provenance (e.g. whether the card is in the chosen starter decklist) instead of tide match, or remove. |
| `src/state/draft-engine.ts` / `journey-context.tsx` / `multiplayer-journey-context.tsx` `selectedTides`/`selectedPackageTides` references | Reward/concurrency/logging | Remove the references (already inert). |
| `src/screens/debug-helpers.ts`, `src/screens/DebugScreen.tsx` package-tide fields | Debug display | Remove the tide fields from `PackageDebugInfo`. |
| `src/multiplayer/room-service.ts` `normalizeResolvedPackage` | RTDB persist of package tide fields | Remove the tide fields from the normalized shape. |

### Tide-only modules
| Module | Consumers | Strategy |
|---|---|---|
| `src/data/tide-weights.ts` | **none** (non-test) | **Delete now** — already orphaned. |
| `src/data/structural-tides.ts` | `JourneyStartScreen`, `DreamsignSourceOverlay`, `card-source-debug` | Delete after those consumers are redesigned/removed (System B above). |
| `src/data/tide-docs.ts` + `src/components/TideDocumentationHover.tsx` + `tides/tides.md` | `DreamsignSourceOverlay`, `CardSourceOverlay`, `DebugScreen` | Delete after consumers are redesigned/removed. |

### Already-orphaned journey-pool tide code (safe to delete now)
- `src/data/journey-content.ts`: `resolveDreamAvatarPackage`, `buildDraftPoolCopies`,
  `enumeratePackageCandidates`, `buildCombinations`, `chooseBestCandidate`,
  `compareSubsetKeys`, the pool-size constants, the package-adjacency helpers
  (`countPackageOverlap`/`isPackageAdjacent`/`packageOverlapWeight`/`selectPackageAdjacent*`),
  `buildCardsByPackageTideIndex`/`cardsByPackageTide`, and `loadDreamAvatarContent`.
- `JourneyContent.resolvedPackagesByDreamAvatarId` (always empty) + its ~25 test mocks.

### Editor / experiment tooling (separate decision)
- Card editor tide panel (`src/editor/CardEditorApp.tsx`, `EditableCard.tsx`,
  `editor-api.ts`), `scripts/apply-archetype-tides.mjs`, `card-editor-tides`.
- Non-idf3 `?algo=` pool variants (`src/draft/pool/variant-{default,diverse,decklists,merged}.ts`)
  and `scripts/generate-color-pool.mjs` — the only consumers of
  `CARDS_V2_POOL_METADATA`. Retiring them lets `cards-v2-metadata.ts` be deleted.

## Suggested order

1. Delete already-orphaned code (`tide-weights.ts`, dead `journey-content.ts`
   functions, `resolvedPackagesByDreamAvatarId`).
2. Stop injecting `CARDS_V2_POOL_METADATA` tides into `cards_v2-data.json`;
   redesign battle-art hue off a non-tide key.
3. Decide journey `tideOverlap` fate; remove or re-base.
4. Remove System B UI: redesign JourneyStartScreen (signature cards), delete
   DreamsignSourceOverlay, simplify card-source debug.
5. Delete `structural-tides.ts`, `tide-docs.ts`, `TideDocumentationHover`.
6. Remove `card.tides`, then the System B fields, then `PackageTideId`.
7. (Separate) retire non-idf3 variants + `cards-v2-metadata.ts`; decide editor
   tide tooling.
