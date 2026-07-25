# Quest Prototype

A standalone web prototype of Dreamtides Quest Mode living in this repository
(`~/quest_prototype/`). It reflects the hidden-tides package-based quest flow:
the player chooses from 3 Dreamcallers, the selected Dreamcaller resolves a
fixed package once at quest start, and the run proceeds through draft sites,
Dreamsign surfaces, playable battles, and atlas progression. All state is
derived from a Firebase room event log, so connected clients share the same
quest, battle, and front-door flow and a reload replays the room to the same
state.

## Running The Prototype

```bash
cd ~/quest_prototype
npm install          # required; node_modules is not committed
npm run dev          # runs setup-assets.mjs then starts Vite
```

`npm run dev` invokes `scripts/setup-assets.mjs` automatically before starting
Vite. The setup script is idempotent and:

1. Parses `cards_v2.toml` into `public/card-data.json`.
2. Parses `dreamcallers_v2.toml` into `public/dreamcallers-v2-data.json`.
3. Symlinks `public/cards/{cardNumber}.webp` into the local image cache at
   `~/Library/Caches/io.github.dreamtides.tv/image_cache/`.
4. Copies the tide PNGs into `public/tides/`.

The generated `public/cards/`, `public/tides/`, `public/card-data.json`, and
`public/dreamcallers-v2-data.json` paths are gitignored.

Other commands:

```bash
npm run review       # diff-aware pre-commit validation
npm test -- path     # focused Vitest file
npm run review:full  # exhaustive CI/release validation
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

The authoritative room value is an append-only sequence of player intents.
`src/rules/reducer.ts` folds that sequence into one `FoldState` with three
slices: shared front-door/tutorial progress, quest state, and an optional active
battle. React renders the displayed fold and owns presentation-local state such
as hover, open dialogs, and draft input.

```text
screen intent
  -> CoopQuestProvider / useActions
  -> LogClient.submit
  -> appendEvent transaction at rooms/<roomId>/log
  -> subscribeToLog
  -> deterministic rules fold
  -> useGameState
  -> quest and battle presentation
```

The important ownership boundaries are:

- `src/eventlog/` is the game-agnostic room engine: encoded room nodes,
  transactional append, subscription decoding, deterministic folding,
  compaction, optimistic echo, and reconciliation.
- `src/rules/` defines `FoldState`, the event union, and the pure Dreamtides
  reducer. Time and randomness enter through the event context, keyed by the
  room seed and committed sequence number.
- `src/coop/RoomGate.tsx` creates or joins a room, validates its reducer build
  and fold-relevant content configuration, writes presence, and installs the
  room quest-log sink.
- `src/coop/hooks.ts` mounts one `LogClient` per ready room. `useGameState()`
  exposes the confirmed fold plus optimistic local intents; `useAppend()` and
  `useActions()` are the write surfaces.
- `src/coop/actions.ts` maps named player actions to one intent event apiece.
  Payloads carry UUIDs, entry ids, indices, and node ids.
- `src/state/coop-quest-context.tsx` adapts the folded quest slice and action
  facade to the `QuestContextValue` interface used by quest screens.
- `src/App.tsx` mounts `RoomGate`, `CoopProvider`, `CoopQuestProvider`, and the
  routed quest UI in that order.

`LogClient` keeps a confirmed fold and an ordered pending-intent queue. A local
intent is optimistically folded for immediate feedback, then reconciled by its
nonce or logical `intentKey` when Firebase confirms the committed event. A
conflicting or invalid event is recorded as a deterministic bounce; displayed
state is recomputed from the confirmed fold plus the pending queue.

The room log carries quest and battle transitions in one sequence. Battle
commands, undo/redo gestures, rewards, and the return to the atlas therefore
share the same ordering and conflict rules as quest navigation and site
choices. Anything both players must agree on is an event; component-local
interaction state stays in the presenting client.

The hidden package stays out of normal player UI. Debug surfaces can show the
resolved package, selected optional subset, draft pool size, and the remaining
and spent Dreamsign pools.

### Tutorial authoring

The standalone tutorial is an ordered action sequence authored in
`data/tabula/tutorial.toml`. `scripts/setup-assets.mjs` validates that source
and generates the browser-readable `public/tutorial-data.json` snapshot. The
Tutorial Editor reads and writes the same action model during development.

Every tutorial beat, including instructional messages, is represented by a
typed `TutorialAction`. Player-facing copy belongs on the authored action so it
can be revised without changing a Cumulus screen. The shared event-log cursor
advances through `beginTutorial` and `completeTutorialAction` in
`src/coop/actions.ts`; local animation completion may determine when an action
becomes visible, while completing the action remains a shared intent.

Every character-led message uses the same `speechBubble` model. A standalone
`display-speech-bubble` action requires one, while actions such as card reveal
and end turn may attach one. The model configures speaker, text, visible
duration, desktop width, and vertical offset. The Tutorial Editor presents one
shared control set for that model in every parent action.

When a tutorial request adds a new kind of beat, extend the action type,
runtime and build-time validators, Tutorial Editor controls, view-model
mapping, and presentation tests together.

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
player resolves character rules text by hand through the debug rail. Static
Support spark is automated. Dreamwell cards retain their independent effect
automation. The Challenge resolver also applies the four sanctioned resolution
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
and Dawn auto-advances after its triggers resolve.

### Structural automation

Basic Automation is always enabled. It rewrites the gestures it understands
into the ordered edits the rules require:

- **Playing a card costs energy.** Moving a card from hand into play reduces the
  controller's current ● by the card's energy cost; an event resolves to the
  void instead of staying in play.
- **The energy ramp and Dreamwell.** At the start of a turn the incoming side's
  max ● ramps on a configurable per-turn schedule (capped at `maxEnergyCap`) and
  current ● refills to max.
- **Draw.** The incoming side draws a card, skipped on the very first turn.
- **Ending clears exhaustion.** Every in-play character loses the exhausted
  status before control passes to the opponent.
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
battle into a sandbox where both sides are driven by hand while structural
automation continues to resolve routine bookkeeping. The battle is the default
entry; pair `?goto=battle` with `?ai=0` as needed (see
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
