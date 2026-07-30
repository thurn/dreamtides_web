# Journey Prototype

A standalone web prototype of Dreamtides Journey Mode living in this repository
(`~/quest_prototype/`). It reflects the hidden-tides package-based journey flow:
the player chooses from 3 Dream Avatars, the selected Dream Avatar resolves a
fixed package once at journey start, and the run proceeds through draft sites,
Dreamsign surfaces, playable battles, and atlas progression. All state is
derived from a Firebase room event log, so connected clients share the same
journey, battle, and front-door flow and a reload replays the room to the same
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
2. Parses `dream_avatars_v2.toml` into `public/dream-avatars-v2-data.json`.
3. Symlinks `public/cards/{cardNumber}.webp` into the local image cache at
   `~/Library/Caches/io.github.dreamtides.tv/image_cache/`.
4. Copies the tide PNGs into `public/tides/`.

The generated `public/cards/`, `public/tides/`, `public/card-data.json`, and
`public/dream-avatars-v2-data.json` paths are gitignored.

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
`src/rules/reducer.ts` folds that sequence into one `FoldState` containing the
shared experience phase, playtest controller, journey state, and optional active
battle. React renders the displayed fold and owns presentation-local state such
as hover, open dialogs, and draft input.

```text
screen intent
  -> CoopJourneyProvider / useActions
  -> LogClient.submit
  -> appendEvent transaction at rooms/<roomId>/log
  -> subscribeToLog
  -> deterministic rules fold
  -> useGameState
  -> journey and battle presentation
```

The important ownership boundaries are:

- `src/eventlog/` is the game-agnostic room engine: encoded room nodes,
  transactional append, subscription decoding, deterministic folding,
  compaction, optimistic echo, and reconciliation.
- `src/rules/` defines `FoldState`, the event union, and the pure Dreamtides
  reducer. Time and randomness enter through the event context, keyed by the
  room seed and committed sequence number.
- `src/coop/RoomGate.tsx` creates or joins a room, restores the tab's
  room-scoped session identity, validates its reducer protocol and fold-relevant
  content configuration, writes presence, and installs the room journey-log
  sink.
- `src/coop/hooks.ts` mounts one `LogClient` per ready room. `useGameState()`
  exposes the confirmed fold plus optimistic local intents; `useAppend()` and
  `useActions()` are the write surfaces.
- `src/coop/actions.ts` maps named player actions to one intent event apiece.
  Payloads carry UUIDs, entry ids, indices, and node ids. Prices, rewards,
  outcomes, progression, and generated content are derived in the reducer.
- `src/state/coop-journey-context.tsx` adapts the folded journey slice and action
  facade to the `JourneyContextValue` interface used by journey screens.
- `src/App.tsx` loads content and mounts one `RoomGate`, `CoopProvider`,
  `CoopJourneyProvider`, and shared experience router for main, loading,
  tutorial, live battle, victory, and journey.

`LogClient` keeps a confirmed fold and an ordered pending-intent queue. A local
intent is optimistically folded for immediate feedback, then reconciled by its
nonce or by an applied event with the same logical `intentKey` when Firebase
confirms the committed event. A conflicting or invalid event is recorded as a
deterministic bounce and leaves its logical key available for a valid retry;
displayed state is recomputed from the confirmed fold plus the pending queue.
The client fingerprints the folded live prefix; a corrected, replaced, or
missing event at an observed sequence triggers an authoritative refold and
diagnostic record.

The room log carries journey and battle transitions in one sequence. Battle
commands, undo/redo gestures, rewards, and the return to the atlas therefore
share the same ordering and conflict rules as journey navigation and site
choices. Anything both players must agree on is an event; component-local
interaction state stays in the presenting client.

Cross-domain and terminal events commit their complete handoff in one fold.
`END_BATTLE`, for example, derives the result from the terminal board and
atomically commits the reward, Battle-site completion, completion level, Atlas
expansion, route, modifier expiry, deck cleanup, and battle teardown. Applied
events pass the shared fold invariants before their state is exposed. See
[Authoritative Transitions](authoritative_transitions.md).

The hidden package stays out of normal player UI. Debug surfaces can show the
resolved package, selected optional subset, draft pool size, and the remaining
and spent Dreamsign pools.

### Journey save files

The journey utility menu can download the current `JourneyState` as a versioned
JSON file and load that file into the active room later. Loading submits the
snapshot through the room's `LOAD_STATE` event, so every connected client folds
the same imported journey. The room seed is applied during import and the
rules-layer structural validator checks the snapshot before it becomes shared
state.

Journey save files capture journey progression outside an active battle. A load
clears the room's battle slice and resumes the imported journey screen.

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
and end turn may attach one. The model configures speaker, text, appearance
delay, visible duration, desktop width, and placement offsets. One-context
bubbles author a scalar delay; reusable triggers author delays by triggering
event. The Tutorial Editor presents one shared control set for that model in
every parent action.

The `journeyStart`, `dreamscape`, and `atlas` tables author delayed persistent
Mira guidance for the tutorial journey handoff. The first dreamscape begins its
authored delay when the player dismisses the starting-deck modal. The Atlas
guidance begins when the player reaches the Atlas after completing the starter
dream.

The `draft` and `dreamsignRevelation` tables author Mira guidance for the first
visit to each of those site types in a journey. Each begins its authored delay
when the site screen loads. Draft guidance retires with the first persisted pick;
Dreamsign Revelation guidance persists until the site is completed.
Completed-site state in the shared atlas determines eligibility across
dreamscape travel. Site guidance takes priority over supplemental glossary
triggers while active. Draft guidance is placed in measured free viewport
space around the four cards; Dreamsign Revelation uses the screen's reserved
guide region beside or above the offer. The Revelation composition presents
the Dream Guide character and resident guide line together with Mira's
first-visit message.

Supplemental tutorial triggers are shared first-occurrence explanations. Their
seen ids live in the room fold, so a keyword explained on a journey card is
already familiar when it later appears in battle. Draft screens submit the UUIDs
currently visible in display order; the reducer selects the first card with the
highest-priority unfamiliar `card-seen` trigger. The selected bubble begins the
delay authored for `card-seen`; the same trigger can remain immediate for
`card-play` and `dreamwell-resolve`. Each persisted four-card Draft offer may
present one explanation, so
subsequent Draft picks can each explain one unfamiliar keyword. Mira and her
speech bubble appear in available viewport space outside the visible cards
while every card remains in its screen position. The explanation stays visible
for the lifetime of that persisted Draft offer, and the action that advances
away from the offer retires it. Eligibility begins after the starting-deck popup
has been dismissed. The room fold owns both the consumed offer identity and the
active presentation, keeping reloads and connected clients aligned.

When a tutorial request adds a new kind of beat, extend the action type,
runtime and build-time validators, Tutorial Editor controls, view-model
mapping, and presentation tests together.

The playable tutorial battle can author one-shot AI decisions in
`battle.aiActionOverrides`. Each override has a stable id, a UUID-based state
trigger, and a semantic action. The first matching override takes priority in
source order. A playable override is consumed in the same room-log event that
commits the action. A blocked override yields to heuristic planning and records
its stable reason with the override id and both card UUIDs. Override cards must
have registered semantic battle automation, so authored rules resolve through
the ordinary play-card path. The initial trigger is `after-dreamwell`, and the
initial action is `play-card`; the tutorial uses these to make the enemy play
card `229ab3a1-3720-41a2-924c-8fe112188f8e` after resolving Dreamwell card
`51caf26d-83bf-45a9-bc80-010d353277db`. The committed battle transition records
the override id, trigger card UUID, action card UUID, and concrete battle-card
instance id.

Every card played by the automated tutorial opponent first animates to the
canonical full-card reading size. A card-play guidance journey uses that same
full-card reveal and its authored guidance duration supplies the two-second
minimum reading window. Cards without guidance use a dedicated two-second
dwell after the reveal animation becomes visible. The full-card object then
travels and scales into its committed board destination as the presentation
clears. AI character plays choose the empty back-rank slot nearest the
battlefield center, with a stable lower-index tie break.

The automated tutorial resolves Challenge lanes left to right through persisted
presentation checkpoints. A paired Challenge holds while each dissolved
character travels from its front-rank position to the void. An unpaired
character that scores holds on an animated points bubble attached directly to
that character's battlefield card; its value is paired with the canonical
filled points Boxicon. The controller-owned tutorial automation completes each
checkpoint after its full animation window, then the reducer resolves the next
lane or performs the turn handoff.

Rooms created from `/main`, `/loading`, or `/tutorial` are hosted playtests.
The first valid manual tutorial gameplay intent atomically records the room
controller. This can be a card play in the scripted segment or the first live
battle input when the scripted segment reaches battle before an input is
needed. That controller remains authoritative through the live battle, victory,
and fixed Dream Avatar selection. Connected viewers render those phases from
the same fold inside an inert shell. If presence shows the controller has
disconnected, a viewer can choose **Take Control**; the compare-and-swap control
event preserves the board, prompt, presentation checkpoint, terminal result,
and journey state.

Starting the authored tutorial journey atomically changes the room to
collaborative control. Every connected player can then take ordinary journey
and battle actions, including using the battle inspector's **Control Opponent**
perspective. The journey keeps its tutorial marker, authored Mira guidance,
shared first-occurrence trigger history, and tutorial battle guidance in the
same room event log.

## Hidden-Tides Behavior

- Dream Avatar selection is a journey-start choice, not a mid-run site.
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

Each side has a staggered play area: a **front rank** of 9 positions (`F0`–`F8`,
zone `frontRank`) and a **back rank** of 10 positions (`B0`–`B9`, zone
`backRank`). Only front-rank characters become challengers and blockers.
A character entering play materializes into the back rank, exhausted. Back-rank
position `Bi` supports front positions `F(i-1)` and `Fi` wherever they exist.

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
  front-rank lane (`F0`–`F8`) by spark: the lower-spark character dissolves to
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
used by both sides. It compares challenger and blocker spark lane by lane and
scans for the four sanctioned keywords: **Preeminence** wins spark ties,
**Vengeful** drags the winner down when its bearer loses, and **Unstoppable**
scores even when blocked. **Awakened** is detected only so keyword detection is
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

Journey battles are manual by default, with both sides driven by hand while
structural automation resolves routine bookkeeping. `?ai=1` enables the local
AI opponent for the enemy side. The standalone tutorial battle has a distinct
event-log-driven automated opponent that remains active independently of this
journey-battle setting (see `docs/journey_prototype/url_parameters.md`).

The full battle design lives in `docs/battle_rules/battle_rules.md`, and the AI
design lives in `docs/journey_prototype/battle_ai.md`.

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
