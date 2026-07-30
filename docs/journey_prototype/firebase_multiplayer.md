# Firebase Multiplayer

The journey prototype stores each shared game in Firebase Realtime Database.
Local URLs connect to the emulator for project `demo-journey-prototype`; URLs
with `?realtime=1` connect to the configured cloud database. Firebase Hosting
serves deployed share links.

## Environment

Cloud mode reads these Vite variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

The API key, auth domain, database URL, project id, and app id are required.
Emulator mode uses the built-in demo project configuration. `npm start`
passes the selected emulator host and port through
`VITE_FIREBASE_DATABASE_EMULATOR_HOST` and
`VITE_FIREBASE_DATABASE_EMULATOR_PORT`.

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

Each room lives at `rooms/<roomId>`:

```text
rooms/<roomId>/
  log/
    genesis
    baseSeq
    baseSnapshot
    head
    events/<seq>
    appliedIndex
    intentKeyIndex
    compactionError
  presence/<clientId>/
    connected
    lastSeenAt
  logs/<pushId>
```

`genesis`, `baseSnapshot`, each `events/<seq>` value, `appliedIndex`,
`intentKeyIndex`, and each `logs/<pushId>` value are JSON strings. Opaque
strings preserve empty arrays and objects and give fold hashes byte-stable
input across Realtime Database round trips.

### Genesis

`genesis` is written once when the room is created and contains:

- `seed` — the deterministic room seed.
- `reducerVersion` — the semantic reducer protocol required to fold the room.
- `createdAt` — epoch milliseconds used by stale-room eviction.
- `contentConfig` — the pinned pool variant, draft mode, and fresh-pack size.
- `frontDoorEntry` — an optional `main`, `loading`, or `tutorial` starting
  phase. Its presence marks a single-controller hosted playtest; rooms without
  it begin in collaborative journey mode.

`RoomGate` compares the room's reducer protocol and content configuration with
the joining client before mounting gameplay. Presentation and tooling patches
keep the same reducer protocol, so active rooms resume across those deploys.
An incompatible reducer protocol opens the version gate; a content mismatch
opens the configuration gate. Exact reviewed build identities in
`src/coop/reducer-version.ts` bridge rooms created before semantic protocol
versioning.

### Event log

`head` is the newest committed sequence number. `events` contains a dense
live window keyed by sequence number in `(baseSeq, head]`. Each decoded event
contains:

- `type` and a UUID/index-based `payload`.
- `actor` and a display-only `clientTimestamp`.
- `basedOnSeq`, the confirmed head the actor saw.
- `nonce`, used to reconcile the actor's optimistic echo.
- an optional logical `intentKey`, used to deduplicate automatic work across
  remounts and clients.
- an optional `stateHashAfter` divergence tripwire for a clean one-step
  prediction.

`appendEvent` runs one transaction on `rooms/<roomId>/log`. Realtime
Database serializes concurrent transactions, so the winning updater assigns
`head + 1` and writes the event at that sequence. A repeated nonce resolves to
its original sequence. A repeated logical intent key resolves to the original
applied event; a bounced event does not reserve the key, so a valid contender
can commit afterward. Transactions use `applyLocally: false`; the application
supplies its own optimistic echo and subscribers observe the authoritative
transaction result.

The pure rules reducer resolves every committed event as `applied` or
`bounced`. It receives deterministic time and random input through the event
context. The fold records only applied events in its intervening-event index,
so bounced intents do not create conflicts for later work.

### Compaction

When the live window grows past 200 events, the append transaction folds the
oldest events into `baseSnapshot`, advances `baseSeq`, and leaves 100 live
events. The same transaction writes `appliedIndex`, preserving the actor and
type of applied events below the snapshot horizon. `intentKeyIndex` preserves
logical deduplication across compacted history.

A compaction failure leaves the append committed, retains the live window, and
stores `compactionError`; the next append attempts compaction again. Folding
`baseSnapshot` plus the live window produces the same `FoldState` as folding
the complete event sequence from genesis.

### Presence

`RoomGate` restores a session-storage-backed, room-scoped client id and writes
`presence/<clientId> = { connected: true, lastSeenAt }` after the room is
ready. Reloading the tab in the same room retains its authority. The writer
arms `onDisconnect().remove()` and removes the entry during normal cleanup.
Connected counts are derived from entries whose `connected` field is true.

Room creation preserves rooms created within the last 24 hours and rooms with a
connected presence entry. A creation pass may evict older inactive rooms whose
genesis can be parsed safely.

### Journey log mirror

The diagnostic sink stores single-line JSON records under
`rooms/<roomId>/logs`. It batches writes, retains the newest 2,000 records,
and mirrors journey-generation diagnostics plus single-writer coop outcome
records. `?viewLogs=<roomId>` reads this node without joining the game.

## Client Read And Write Flow

`RoomGate` subscribes to `rooms/<roomId>/log`, validates genesis, installs
presence and logging, then mounts one `CoopProvider`. The provider owns one
`LogClient`:

1. `subscribeToLog` decodes the room node.
2. `LogClient` folds the confirmed sequence into `FoldState`.
3. `useGameState()` publishes the confirmed fold plus optimistic local
   intents.
4. Screens call the named creators from `useActions()` or the journey-context
   adapter.
5. `LogClient.submit` stamps the event envelope, echoes the intent
   optimistically, and calls `appendEvent`.
6. Subscription confirmation reconciles the pending intent by nonce or
   `intentKey`; an invalid or conflicting intent surfaces as a bounce.

`FoldState` contains the shared experience phase, playtest controller, journey,
and active-battle slices. Journey navigation, site decisions, battle commands,
prompts, rewards, and battle completion therefore share one room ordering.
The live client fingerprints every folded event in the authoritative prefix. A
same-head replacement, gap, or correction rebuilds the fold from the room node,
reconciles pending intents, and records the observing client and first corrected
sequence. Equal intent keys with different type or payload contracts produce a
semantic-collision diagnostic.

Hosted observers cannot submit player decisions. Deterministic lifecycle
handoffs whose prerequisite is already fixed in the fold may be committed by
any client. These include bootstrapping the currently displayed site or Draft
offer, completing an exhausted Draft site, revealing the active side's
mandatory Dreamwell card, and entering Day after the first-turn reveal. Their
run-scoped intent keys make concurrent submissions one shared transition, and
the room controller remains unchanged.

The successful `START_JOURNEY` event for the authored tutorial journey changes
`playtestControl` to collaborative mode in the same fold transition. Both
clients can then submit normal journey decisions and manual actions for either
battle side. Tutorial journey state and shared trigger history remain in the
room fold.

## Local Testing

Run:

```bash
npm start
```

This starts the Realtime Database emulator, refreshes generated assets, and
serves Vite. The emulator usually starts at `127.0.0.1:9000` with its UI at
`127.0.0.1:4000`; occupied ports are replaced with available ports and the
selected values are printed.

Open the Vite URL, let the app create a room, then open the resulting
`?game=<roomId>` URL in a second browser window. Inspect the emulator with:

```bash
curl "http://127.0.0.1:<database-port>/rooms.json?ns=demo-journey-prototype"
```

Use `npm run dev:vite` when testing the visible emulator-connection error
state without starting Firebase.

## Manual Two-Window QA

1. Run `npm start` and open the printed Vite URL.
2. Confirm room creation adds `?game=<roomId>`.
3. Open that URL in a second browser session and confirm both clients show two
   connected participants.
4. Make the first tutorial gameplay move in one client. Confirm it becomes the
   controller and the second client remains on the shared screen with player
   interaction inert through the fixed Dream Avatar selection.
5. Select the tutorial Dream Avatar. Confirm both clients become interactive
   on the first dreamscape and retain the shared tutorial guidance.
6. Open a draft site, pick a card in one client, and confirm the other client
   advances to the same next offer and deck.
7. Trigger two valid actions from separate clients and confirm both appear in
   committed sequence order.
8. Trigger conflicting choices and confirm one applies while the other shows
   bounce feedback.
9. Enter a battle and confirm both clients render the same opponent, board,
   and battle phase.
10. Use **Control Opponent** in the second client and commit an enemy-side
    action; confirm the first client folds the result.
11. Commit a prompt resolution and debug gesture from either client; confirm
    the other client folds each result.
12. Complete the battle and confirm both clients apply the same reward and
    return to the same journey route.
13. Reload either client during journey play and battle; confirm the shared
    collaborative state is restored.
14. Before Dream Avatar selection, close the controller, confirm the observer
    shows **Player Disconnected**,
    choose **Take Control**, and continue from the same fold.
15. Open `?viewLogs=<roomId>` and confirm the persisted diagnostic records are
    readable.

The automated two-client certification workflow and its replay artifacts are
documented in [Cooperative Demo Fuzzing](coop_demo_fuzzing.md).

## Cloud Smoke QA

Open the local app with `?realtime=1`, create a room, and confirm the URL
preserves both `realtime=1` and `game=<roomId>`. Join from a second window,
exercise one shared action, verify the room under the configured cloud
database, and remove the smoke-test room afterward.

## Deploy

Run:

```bash
npm run deploy
```

The deploy script builds `dist/`, deploys Firebase Hosting, and uploads binary
art to the configured Storage bucket. Hosting rewrites app routes to
`index.html`, so share links with `?realtime=1&game=<roomId>` load the room
gate and replay the cloud event log.
