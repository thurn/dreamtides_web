# Firebase Multiplayer

The V2 quest prototype uses Firebase Realtime Database for shared quest rooms
and Firebase Hosting for deployed share links.

## Environment

Copy `.env.example` to `.env.local` and fill in the Firebase web app values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

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

## Local Testing

Run:

```bash
npm start
```

Open `http://localhost:5173/`, create a game, then open the generated
`?game=<roomId>` URL in a second browser window.

## Manual Two-Window QA

1. Create a room in the first window.
2. Open the share URL in a second window.
3. Pick a Dreamcaller in either window and verify both windows enter the same
   dreamscape.
4. Open a draft site, pick a card in one window, and verify the other window
   shows the updated deck and next offer.
5. Trigger an essence-changing action in one window while taking a different
   shared action in the other window, then verify both changes are present.
6. Open a reward, shop, Dreamsign, or essence site and verify both windows show
   the same revealed result.
7. Refresh both windows and verify they reload the room state.
8. Reset the quest and verify both windows return to the shared start state.
9. Enter a Battle site from the atlas in either window. Confirm both windows
   show the same enemy, deck order, and reward options.
10. Play a card in one window. Confirm the other window renders the same
    play and animation within one round-trip.
11. Issue concurrent commands from both windows (e.g. play a card in window
    A while moving a card in window B). Confirm both apply without state
    corruption.
12. Press Undo in one window. Confirm both windows rewind together. Press
    Redo in either window. Confirm both windows advance together.
13. Press Reset Battle in one window. Confirm both windows reset history
    and return to the prepared initial state.
14. Win a battle, select a reward in either window. Confirm both windows
    apply the reward, return to the atlas, and clear the battle slot.
15. Lose or draw a battle, dismiss the result overlay. Confirm both windows
    surface the failed screen and clear the battle slot.
16. Trigger Reset Quest while a battle is active. Confirm both rooms clear
    `questState` and `battleState`.
17. Refresh either window mid-battle and confirm the same shared state
    reloads.

## Deploy

Run:

```bash
npm run build
firebase deploy
```

Firebase Hosting serves `dist/` and rewrites all routes to `index.html`, so
share links with `?game=<roomId>` load the app shell.
