# Quest Prototype

A standalone web prototype of Dreamtides Quest Mode living in this repository
(`~/quest_prototype/`). It reflects the hidden-tides package-based quest flow:
the player chooses from 3 Dreamcallers, the selected Dreamcaller resolves a
fixed package once at quest start, and the run proceeds through draft sites,
Dreamsign surfaces, playable battles, and atlas progression. All state is
in memory and resets on page load.

## Running The Prototype

```bash
cd ~/quest_prototype
npm install          # required; node_modules is not committed
npm run dev          # runs setup-assets.mjs then starts Vite
```

`npm run dev` invokes `scripts/setup-assets.mjs` automatically before starting
Vite. The setup script is idempotent and:

1. Parses `rendered-cards.toml` into `public/card-data.json`.
2. Parses `dreamcallers_v2.toml` into `public/dreamcallers-v2-data.json`.
3. Symlinks `public/cards/{cardNumber}.webp` into the local image cache at
   `~/Library/Caches/io.github.dreamtides.tv/image_cache/`.
4. Copies the tide PNGs into `public/tides/`.

The generated `public/cards/`, `public/tides/`, `public/card-data.json`, and
`public/dreamcallers-v2-data.json` paths are gitignored.

Other commands:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/
npm test             # vitest run
npm run build        # production build
```

## Tech Stack

React 19, Vite 7, TypeScript 5.8 in strict mode. Tailwind CSS v4 via
`@tailwindcss/vite` and Framer Motion for animations. The prototype uses
browser-loaded JSON instead of a runtime TOML parser.

TypeScript is configured for bundler mode (`moduleResolution: "bundler"`), so
Node built-in modules are not available in type-checked code. Tests that need
file I/O should mock `fetch` or use Vitest's `node` environment.

## Architecture

All game state lives in one `QuestState` object provided by
`src/state/quest-context.tsx`. The current screen is stored in `state.screen`
and drives the router. The important runtime pieces are:

```text
src/
  data/            normalized quest content and synthetic data
  draft/           fixed-multiset draft engine
  screens/         one file per screen
  state/           quest context and mutations
  types/           quest, content, and draft types
```

Current quest state includes:

- `essence`
- `deck`
- `dreamcaller`
- `resolvedPackage`
- `remainingDreamsignPool`
- `dreamsigns`
- `completionLevel`
- `atlas`
- `currentDreamscape`
- `visitedSites`
- `draftState`
- `screen`
- `activeSiteId`

The hidden package stays out of normal player UI. Debug surfaces can show the
resolved package, selected optional subset, draft pool size, and the remaining
and spent Dreamsign pools.

## Hidden-Tides Behavior

- Dreamcaller selection is a quest-start choice, not a mid-run site.
- Draft sites reveal 4 unique cards when possible and consume the revealed cards
  from the fixed pool.
- Dreamsign-bearing surfaces spend from a shared pool as soon as a sign is
  shown.
- Shops, battle rewards, and similar generators prefer package-adjacent content
  but fall back to the broader pool if nothing overlaps.

## Battle Prototype Behavior

The playable battle screen (`src/battle/`) implements the Dreamtides battle
rules (`docs/battle_rules/battle_rules.md`). Structural automation runs the
deterministic bookkeeping the rules derive purely from board state, while the
player resolves the printed effect text of their own cards by hand through the
debug rail. The architecture invariant is that automation and the engine act
only on card structure and status fields, never on printed effect prose — the
sole exception being the Challenge resolver's scan for the four sanctioned
keywords (Unstoppable, Vengeful, Preeminence, Awakened).

### Board and ranks

Each side has a staggered play area: a **front rank** of 4 positions (`F0`–`F3`,
zone `frontRank`) and a **back rank** of 5 positions (`B0`–`B4`, zone
`backRank`). Only front-rank characters become challengers and defenders.
A character entering play materializes into the back rank, exhausted. The
back-rank-to-front-rank support map is `B0→F0`, `B1→F0,F1`, `B2→F1,F2`,
`B3→F2,F3`, `B4→F3`.

### Per-card status

Every in-play card carries a `BattleCardStatus`: `isExhausted`, counters,
`reclaimed`, `offering`, `ephemeral`, `veil`, and the granted keyword flags
`grantedUnstoppable`, `grantedVengeful`, `grantedPreeminence`, and
`grantedAwakened`. Figments are discrete entries (a `figments?: number[]` list)
drawn from a 14-type catalog; the Figment creator on the debug rail produces
them. Effective spark counts each figment on a character.

### Turn structure

A turn runs eight phases in order: `dreamwell`, `draw`, `dawn`, `day`, `dusk`,
`night`, `challenge`, `ending`. Five phases are surfaced in the UI (Dawn, Day,
Dusk, Night, Challenge), and four of those carry player actions (Day, Dusk,
Night, Challenge). The `dreamwell`, `draw`, and `ending` bookends auto-advance,
and Dawn auto-advances after its exhaust-clear.

### Structural automation

Basic Automation is on by default (`runtimeConfig.basicAutomation`; disable with
`?automation=0`). It rewrites the handful of gestures it understands into the
ordered edits the rules require:

- **Playing a card costs energy.** Moving a card from hand into play reduces the
  controller's current ● by the card's energy cost; an event resolves to the
  void instead of staying in play.
- **The energy ramp and Dreamwell.** At the start of a turn the incoming side's
  max ● ramps on a configurable per-turn schedule (capped at `maxEnergyCap`) and
  current ● refills to max.
- **Draw.** The incoming side draws a card, skipped on the very first turn.
- **Dawn clears exhaustion.** Each of the incoming side's in-play characters
  loses the exhausted status.
- **Challenge resolution.** Entering the `challenge` phase resolves each
  front-rank lane (`F0`–`F3`) by spark: the lower-spark character dissolves to
  the void, an unpaired challenger scores ⍟ equal to its spark, and the keyword
  rules apply.
- **Ending banish and Fatigue.** The outgoing side discards down to the ten-card
  hand limit, then banishes its ephemeral cards still in hand and offering cards
  still in play. Drawing from an empty deck triggers Fatigue: the opponent gains
  2^`fatigueCount` ⍟ (the doubling sequence: 1⍟, 2⍟, 4⍟, …) and the drawing
  side's `fatigueCount` increments. The Erode debug edit likewise triggers
  Fatigue for any shortfall when the deck cannot supply the requested cards.
- **Victory threshold.** When the Challenge scoring pushes a side to
  `scoreToWin`, the battle result is forced.

### The Challenge resolver

`engine/challenge.ts` `resolveChallenge` is the unified, keyword-aware resolver
used by both sides. It compares challenger and defender spark lane by lane and
scans for the four sanctioned keywords: **Preeminence** wins spark ties,
**Vengeful** drags the winner down when its bearer loses, and **Unstoppable**
scores even when defended. **Awakened** is detected only so keyword detection is
uniform across all four; the exhaust system, not the resolver, consumes it. The
resolver returns the score deltas and the dissolve-to-void edits that commit the
outcome.

### The debug rail

The debug rail is where the player resolves printed effects and drives manual
gestures the rules leave to the controller. It provides Status toggles (and the
☪ retreat control), Counters, Erode, the 14-type Figment creator, and
Abandon / Rematerialize / Dreamwell-draw actions. Cards drag between zones, and
every committed change flows through the `DEBUG_EDIT` command path so the battle
log, undo, and redo all keep working.

### URL parameters and the AI

The enemy is driven by a local AI opponent on by default; `?ai=0` switches the
battle into a fully manual sandbox where both sides are driven by hand.
`?automation=0` disables Basic Automation, leaving the player to advance phases
and resolve the Challenge by hand. The battle is the default entry; pair
`startInBattle=1` with these flags as needed (see
`docs/quest_prototype/url_parameters.md`).

The full battle design lives in `docs/battle_rules/battle_rules.md`, and the AI
design lives in `docs/quest_prototype/battle_ai.md`.

## Card Data Normalization

The TOML source has a few field variants that `setup-assets.mjs` normalizes to
JSON:

| Field         | TOML source values           | JSON output    |
| ------------- | ---------------------------- | -------------- |
| `spark`       | absent, `""`, `"*"`, integer | `null` or int  |
| `energy-cost` | `"*"`, integer               | `null` or int  |
| `subtype`     | absent, string               | `""` or string |

The `"*"` value appears on 4 "Abomination" cards for spark and 2 cards for
energy cost. The absent `spark` key appears on some Event cards. Normalize all
three variants to `null`.

Keys are converted from TOML kebab-case to camelCase in JSON output.
