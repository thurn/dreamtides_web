# Firebase Multiplayer

The V2 quest prototype uses Firebase Realtime Database for shared quest rooms
and Firebase Hosting for deployed share links. Default URLs use the local
Realtime Database emulator with project `demo-quest-prototype`. Cloud RTDB
rooms use URLs that include `?realtime=1`.

## Environment

Cloud RTDB mode reads the Firebase web app values from `.env.local`:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

Emulator mode uses the demo project config built into
`src/firebase/app-config.ts`.

## Database Rules

The prototype uses open room data for low-friction remote testing:

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

## Room Schema

Each room lives at `rooms/<roomId>` with the following shape:

- `metadata`
  - `schemaVersion` — currently `2`.
  - `createdAt`, `updatedAt` — ISO timestamps.
- `questState` — the shared quest run, or `null` before quest start.
- `battleState` — the shared battle slice, or `null` between battles.
- `presence` — `clientId` -> `{ connected, lastSeenAt }`.
- `actionLog` — bounded recent action history for diagnostics.
- `logs` — bounded mirror of the room's quest log, for the `?viewLogs=` viewer.

### Battle Slot

`battleState` is `null` until a battle site is entered. While a battle runs:

- `battleState.init` — the frozen `BattleInit` (deck order, seed, reward
  options, enemy descriptor, dreamcaller summary, atlas snapshot). Written
  once per battle by the first client to enter via a race-safe transaction.
- `battleState.reducer`
  - `mutable` — the live `BattleMutableState`.
  - `history.past` / `history.future` — full undo/redo stack with
    before/after snapshots and per-entry metadata.
  - `lastTransition` — the most recent transition's data, used by clients
    to drive animations and judgment-pause overlays.
  - `commandSerial` — monotonic counter; each client deduplicates local
    effects (logging, judgment pause) by tracking the last serial it
    observed.

The slot clears to `null` after the post-victory hand-off, after the
failure route, and on quest reset.

### Action Log

Quest mutations and battle commands both append entries to the room's
shared `actionLog`. Battle entries use the action key `battle:<KIND>`
(for example `battle:PLAY_CARD`, `battle:UNDO`, `battle:RESET`,
`battle:CLEAR_FORCED_RESULT`). The log is capped at 50 entries and
pruned via a transaction.

### Quest Log Mirror

Every `logEvent` entry for a room (each already stamped with its `gameId`) is
mirrored into `rooms/<roomId>/logs` by the sink the room gate installs
(`createRoomLogSink` in `src/multiplayer/room-log-service.ts`). Each child is a
push-keyed, single-line JSON string of one entry; storing entries as strings
keeps arbitrary entry shapes safe from Realtime Database's forbidden-key,
dropped-empty, and numeric-array-coercion rules. Writes are batched and the node
is pruned to the newest `ROOM_LOG_LIMIT` (2000) entries. This persists a run's
log past the playing tab closing so `?viewLogs=<roomId>` can read it back; see
`docs/quest_prototype/url_parameters.md`.

## Local Testing

Run:

```bash
npm start
```

This starts the Realtime Database emulator on `127.0.0.1:9000`, the Emulator UI
on `127.0.0.1:4000`, refreshes generated assets, and serves Vite on
`http://localhost:5173/`. When an emulator port is occupied, `npm start`
selects the next available local ports and prints the selected database, UI,
hub, and logging ports before Vite starts. The selected database host and port
are passed to Vite as `VITE_FIREBASE_DATABASE_EMULATOR_HOST` and
`VITE_FIREBASE_DATABASE_EMULATOR_PORT`.

Open `http://localhost:5173/`, create a game, then open the generated
`?game=<roomId>` URL in a second browser window. Inspect the emulator room data
with:

```bash
curl "http://127.0.0.1:<database-port>/rooms.json?ns=demo-quest-prototype"
```

Use the Vite-only script to inspect the visible emulator connection error state:

```bash
npm run dev:vite
```

## Manual Two-Window QA

1. Run `npm start`.
2. Create a room in the first window.
3. Open the share URL in a second window.
4. Pick a Dreamcaller in either window and verify both windows enter the same
   dreamscape.
5. Open a draft site, pick a card in one window, and verify the other window
   shows the updated deck and next offer.
6. Trigger an essence-changing action in one window while taking a different
   shared action in the other window, then verify both changes are present.
7. Open a reward, shop, Dreamsign, or essence site and verify both windows show
   the same revealed result.
8. Refresh both windows and verify they reload the room state.
9. Reset the quest and verify both windows return to the shared start state.
10. Enter a Battle site from the atlas in either window. Confirm both windows
    show the same enemy, deck order, and reward options.
11. Play a card in one window. Confirm the other window renders the same
    play and animation within one round-trip.
12. Issue concurrent commands from both windows (e.g. play a card in window
    A while moving a card in window B). Confirm both apply without state
    corruption.
13. Press Undo in one window. Confirm both windows rewind together. Press
    Redo in either window. Confirm both windows advance together.
14. Press Reset Battle in one window. Confirm both windows reset history
    and return to the prepared initial state.
15. Win a battle, select a reward in either window. Confirm both windows
    apply the reward, return to the atlas, and clear the battle slot.
16. Lose or draw a battle, dismiss the result overlay. Confirm both windows
    surface the failed screen and clear the battle slot.
17. Trigger Reset Quest while a battle is active. Confirm both rooms clear
    `questState` and `battleState`.
18. Refresh either window mid-battle and confirm the same shared state
    reloads.

## Cloud Smoke QA

Open `http://localhost:5173/?realtime=1`, create a room, and confirm the URL
contains both `realtime=1` and `game=<roomId>`. Verify the room exists in the
configured cloud Realtime Database, then delete the smoke-test room.

## Deploy

Run:

```bash
npm run build
firebase deploy
```

Firebase Hosting serves `dist/` and rewrites all routes to `index.html`, so
share links with `?game=<roomId>` load the app shell. Hosted cloud RTDB rooms
use share links with `?realtime=1&game=<roomId>`.
