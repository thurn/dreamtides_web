# Quest Prototype V2 Overhaul — Design

## Goal

Switch **all real quest play** to the V2 content set and the `idf3` draft-pool
algorithm:

- Cards come from `data/tabula/cards_v2.toml` (→ `/cards_v2-data.json`).
- Dream Avatars come from `data/tabula/dream_avatars_v2.toml`
  (→ `/dream-avatars-v2-data.json`), all 32 offered.
- Draft pools are built by `idf3` (`generateIdf3`), steered by each
  Dream Avatar's `signature-cards` and sourced from the `docs/drafts_anon/`
  decklist corpus.
- Dreamsigns are drawn **purely at random** (no tide steering, no pool
  construction).

The `draft_test` harness already does all of this. This overhaul makes the
**runtime quest path** do the same, replacing the tide-based package machinery
it uses today. Dreamsign pool *construction* is explicitly out of scope.

## Background: current data flow (what changes)

| Concern | Today (runtime quest play) | After this overhaul |
|---|---|---|
| Cards | `loadCardDatabase` → `/card-data.json` (v1 `rendered-cards.toml`) | `/cards_v2-data.json` (v2) |
| Dream Avatars | `/dream-avatar-data.json` (v1, auto-tide-packaged) | `/dream-avatars-v2-data.json` (v2, signature cards) |
| Draft pool | `resolveDreamAvatarPackage` → `buildDraftPoolCopies` (tide overlap) | `generateIdf3` over `drafts_anon` corpus |
| Decklist corpus bundled | `docs/drafts_dt/` → `/decklists-data.json` | `docs/drafts_anon/` → `/decklists-data.json` |
| Dreamsign offer / reward / shop | tide-biased (`requiredTides` / `selectedPackageTides`) | random |
| Specialty shop | inventory restricted to a Dream Avatar mandatory tide | drawn from the run's chosen idf3 starter decklist |
| Battle enemy deck | tide-filtered slice of the card DB + removal-event guarantee | a `drafts_anon` decklist, idf3-steered by the enemy Dream Avatar |

V1 assets (`card-data.json`, `dreamAvatars.toml`, `dream-avatar-data.json`) and
their generation stay in place for non-quest consumers (e.g. the card editor).
The tide *registry*, biomes, and atlas theming are untouched — they do not
depend on Dream Avatar tides.

## Section 1 — Starter deck (data)

The runtime starter deck is the hardcoded `STARTER_CARD_NUMBERS` (v1 cards
711–720), which do not exist in V2 (cards run 1–509). The seven name matches in
V2 are **unrelated cards**, not the starter cards.

**Port all ten v1 starter cards into `cards_v2.toml`** as new entries, card
numbers **510–519**, each **renamed** to avoid colliding with the unrelated V2
cards (and with the `drafts_anon` corpus), and each with `rendered-text`
rewritten to `docs/cards2/style_guide.md` and `docs/battle_rules/battle_rules.md`.
`image-number` is left blank (identicon fallback, like other v2 cards).

Provisional ports (final names/text subject to review):

| # | v1 name → new name | type / subtype | ● | ✦ | v2 `rendered-text` |
|---|---|---|---|---|---|
| 510 | Nocturne Strummer → **Twilight Minstrel** | Character / Musician | 2 | 1 | `Support – Supported characters have +2✦.` |
| 511 | Ringwatcher → **Circlewatch Seer** | Character / Visionary | 3 | 1 | `▸Materialized: Foresee 1.` |
| 512 | Marked Direwolf → **Branded Direwolf** | Character / Spirit Animal | 4 | 4 | *(vanilla — empty)* |
| 513 | Runebound Champion → **Sigilsworn Champion** | Character / Warrior | 5 | 3 | `▸Dawn: Gain 1⍟.` |
| 514 | Final Witness → **Last Witness** | Character / Visitor | 3 | 2 | `▸Dissolved: Draw a card.` |
| 515 | Wildflower Colossus → **Meadowforged Colossus** | Character / Synth | 6 | 6 | `This character has +2✦ for each supporting ally.` |
| 516 | Flashpoint Detonation → **Flashpoint Blast** | Event | 2 | — | `Dissolve an enemy with cost 3● or less.` |
| 517 | Glimpse of What Was → **Glimpse of the Past** | Event | 1 | — | `Draw a card, then foresee 1.` |
| 518 | Sign of Arrival → **Herald's Sign** | Event | 2 | — | `Discover a character.` |
| 519 | Worlds Await → **Distant Worlds** | Event | 1 | — | `Give an ally +3✦.` |

`STARTER_CARD_NUMBERS` becomes `[510, 511, 512, 513, 514, 515, 516, 517, 518,
519]`.

**Starters are ineligible to be drafted.** Each ported starter is marked
`rarity = "Starter"` (→ `isStarter = true` after transform). They are excluded
from draft-pool construction and from any draft offer. In practice `idf3` builds
the pool from `drafts_anon` decklist *names* and the renamed starters appear in
no decklist, so they never enter a pool; the exclusion is also enforced
explicitly — `resolvePool` / draft initialization drop any starter card number
defensively. The starting deck is the fixed 10-card `STARTER_CARD_NUMBERS` list
added at quest start.

## Section 2 — Relocate the pool library out of `draft_test`

The `idf3` implementation and V2 data loaders live under `src/draft_test/` but
are pure libraries, not tests. Runtime quest code must not import from a `_test`
directory. Move:

- `src/draft_test/color-pool/` → `src/draft/pool/` (all variants, `generate.ts`,
  `pool-data.ts`, `types.ts`).
- `src/draft_test/cards-v2-database.ts` → `src/data/cards-v2-database.ts`
  (`loadCardsV2Database`, `loadDecklists`, `loadMergedArchetypeLists`,
  `buildNameIndex`, `resolvePool`, `ResolvedPool`).
- `src/draft_test/dream-avatars-v2-database.ts` → `src/data/dream-avatars-v2-database.ts`
  (`loadDreamAvatarsV2`, `DREAM_AVATAR_ARCHETYPES`, themes).
- `src/draft_test/cards-v2-metadata.ts` → `src/data/cards-v2-metadata.ts`
  (consumed by `setup-assets.mjs` for the non-`idf3` variants).

Update all importers: `DraftTestApp.tsx`, the `color-pool-*` tests,
`scripts/setup-assets.mjs`, and any others surfaced by the type checker. This is
a mechanical move; no logic changes.

## Section 3 — Quest content loading (`src/data/quest-content.ts`)

`loadQuestContent` changes its inputs and drops tide-package resolution:

- **Cards**: `loadCardsV2Database()` (`/cards_v2-data.json`).
- **Dream Avatars**: `loadDreamAvatarsV2()` (`/dream-avatars-v2-data.json`),
  carrying `signatureCards`. All 32 are offered by `selectDreamAvatarOffer`.
- **Decklist corpus**: `loadDecklists()` (`/decklists-data.json`, now sourced
  from `docs/drafts_anon/`); build a `PoolData` (`buildPoolData`) and a
  card-name → card-number index (`buildNameIndex`). Store both on `QuestContent`
  for pool generation at quest start.
- **Dreamsign pool**: the run's dreamsign pool is **all** dreamsign IDs (random),
  not a tide-filtered subset.

`resolveDreamAvatarPackage`, `buildDraftPoolCopies`, `countPackageOverlap`, and
the `resolvedPackagesByDreamAvatarId` map are **removed**. The
`ResolvedDreamAvatarPackage`-shaped data that downstream code consumed is
replaced by data produced at quest start (Section 4). Tide fields
(`mandatoryTides`, `optionalTides`, `selectedTides`, `optionalSubset`) are
removed from the runtime Dream Avatar/package types and from quest-start logging.

## Section 4 — Pool generation at quest start (`src/state/quest-context.tsx`)

When the player selects a Dream Avatar, `startQuest` generates the pool instead of
reading a precomputed package:

1. Seed an RNG from the quest seed + Dream Avatar id (deterministic per run).
2. `const result = generateIdf3(rng, poolData, dreamAvatar.signatureCards, targetSize)`.
   - Signatureless Dream Avatars fall through `idf3`'s built-in path to an
     unsteered (diversity) draw — no special casing.
   - `targetSize` keeps the current pool sizing (~190–210; reuse the existing
     default).
3. `resolvePool(result, nameIndex)` → `draftPoolCopiesByCard` → `initializeDraftState`.
4. Add the fixed starter deck (`STARTER_CARD_NUMBERS`).

**Expose the chosen starter decklist.** `generateIdf3` already selects one
`drafts_anon` deck (`deck#startIdx`) as the pool seed. Extend its result with the
chosen deck's card names (e.g. `starterDeck: string[]`). At quest start, resolve
those names to V2 card numbers and store them on quest state as the run's
**starter decklist** (used by specialty shops, Section 5).

Quest-start logging drops the removed tide fields and logs the chosen
`startIdx`/pool size instead.

## Section 5 — Specialty shops (`src/shop/shop-generator.ts`)

A specialty shop draws its card slots from the **run's idf3 starter decklist**
(the `deck#startIdx` list captured in Section 4), resolved to V2 card numbers —
**not** from the depleting draft multiset a regular shop uses. This is a fixed
per-run list (~25 cards); the shop samples unique cards from it per visit and is
not tied to draft-pool depletion. Specialty pricing (`SPECIALTY_CARD_PRICE`) is
retained.

The tide-restriction path is removed: `pickSpecialtyTide`,
`eligibleCardNumbersForTide`, and `specialtyTides`/`restrictedTide` plumbing are
replaced by a `starterDecklistCardNumbers` input. Dreamsign slots draw randomly
(Section 6).

## Section 6 — Dreamsigns purely random

Remove tide steering at every draw site; each already falls back to a plain
shuffle when tides are absent, so this is mostly argument removal:

- `ensureDreamsignOfferRuntime` (`quest-context.tsx`): drop `requiredTides`.
- `generateRewardSiteData` (`reward-generator.ts`, the Dreamsign Reward Site):
  drop `selectedPackageTides`; plain random draw from the shared pool.
- Shop dreamsign slots (`shop-generator.ts`): drop the tide filter.

## Section 7 — Battle enemy decks (`src/battle/integration/create-battle-init.ts`)

`createEnemyDeckDefinition` is rewritten to choose a `drafts_anon` decklist
**steered by the enemy Dream Avatar**, mirroring the player's pool selection:

1. `createEnemyDescriptor` already picks a random V2 Dream Avatar for the enemy.
   Use that Dream Avatar's `signatureCards` to run `generateIdf3` (with a
   battle-seeded RNG) over the decklist corpus and take its chosen starter
   decklist (`starterDeck`). Signatureless enemy Dream Avatars fall through to a
   diversity pick — no special casing.
2. Resolve the chosen deck's card names to V2 card numbers against the V2 card
   database; drop unresolved names.
3. Pad up to the minimum battle deck size (reuse the existing whole-deck padding
   approach) if the resolved deck is short.

This requires threading the decklist corpus + name index into battle init. The
removal-event guarantee, `REMOVAL_TIDES`, `isRemovalEvent`, and `filterByPackage`
are removed. The enemy descriptor's `packageTides` field becomes an empty
constant (or is dropped where unused).

## Section 8 — Asset generation (`scripts/setup-assets.mjs`)

- Bundle `docs/drafts_anon/` (not `docs/drafts_dt/`) into `/decklists-data.json`
  and the merged-archetype build.
- Continue writing `/cards_v2-data.json` and `/dream-avatars-v2-data.json`; the
  new starter cards 510–519 flow through the existing v2 card serialization.
- Update the `DREAM_AVATAR_ARCHETYPES` / `cards-v2-metadata` imports to their new
  `src/data/` locations.

## Out of scope

- Dreamsign pool construction / steering (dreamsigns stay random).
- V1 assets and their generation (kept for the editor and other consumers).
- Tide registry, biomes, atlas theming (independent of Dream Avatar tides).
- Tuning `idf3` constants or `targetSize` beyond matching current pool sizes.

## Testing & verification

- **Unit**: quest-content V2 loading; pool generation at quest start
  (deterministic per seed; signatureless Dream Avatar → diversity pool);
  `resolvePool` over `drafts_anon`; specialty shop draws from the starter
  decklist; enemy deck resolves from an idf3-steered `drafts_anon` deck (and
  diversity-picks for a signatureless enemy); starter cards never appear in a
  draft pool/offer; dreamsign draws are unbiased. Update/relocate the existing
  `color-pool-*` tests.
- **Core checks**: `npm run lint`, `npm run typecheck`, `npm test` (run
  `npm install` first in a fresh worktree).
- **Browser QA** (per `AGENTS.md`): run setup-assets, start a scoped QA Vite
  server on a non-5173 port, play the normal workflow — pick a Dream Avatar,
  confirm the draft pool shows V2 cards, draft, enter a shop (regular +
  specialty), hit a Dreamsign reward, enter a battle and confirm the enemy uses
  V2 cards. Inspect the error buffer; tear down only the QA server by PID/port.

## Open risks

- Renamed starter card text must pass the style guide; final names/text are
  reviewed during implementation.
- `drafts_anon` card names must resolve well against the V2 name index;
  unresolved names are dropped (already handled by `resolvePool`), but a high
  drop rate would thin pools — verify during QA.
