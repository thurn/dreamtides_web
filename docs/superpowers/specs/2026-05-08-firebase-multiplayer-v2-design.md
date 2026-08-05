# Firebase Multiplayer V2 Design

## Purpose

The V2 journey prototype is a two-player remote prototyping experience. Both
players co-pilot one shared journey run through Firebase Realtime Database and
Firebase Hosting. A player can make a shared decision, such as picking a card,
and the connected partner sees the resulting state and animation from the same
shared run.

The rewrite prioritizes setup speed and iteration over security hardening. Room
data is throwaway prototype data, and open Realtime Database rules are acceptable
for this project.

Battle-mode Firebase support is future work. The journey-mode architecture should
keep reusable room, presence, and action-log boundaries so battle mode can adopt
the same multiplayer patterns later.

## Goals

- Support share-link multiplayer rooms through `?game=<roomId>`.
- Use Firebase Realtime Database as the canonical journey-mode store.
- Deploy the app through Firebase Hosting with Vite's `dist/` output.
- Preserve a co-pilot model where either connected player can take shared
  actions.
- Keep browser-local overlays and transient UI controls local to each player.
- Preserve independent concurrent writes to different parts of journey state.
- Store enough action history to debug recent shared actions without making the
  action log the source of truth.
- Keep multiplayer UI minimal: create game, loading/error states, connection
  status, and compact presence.

## Non-Goals

- Secure room ownership, private room permissions, authenticated accounts, or
  malicious-user protection.
- Player seats, roles, private hands, turn ownership, cursors, names, lobbies, or
  rich collaboration UI.
- Full replay from an event stream.
- Firebase-backed battle mode in this V2 journey rewrite.

## User Flow

Opening the app without `?game=` shows a small create-game screen. The primary
button generates a short room id, creates the Firebase room, and navigates to
the share URL.

Opening the app with `?game=<roomId>` subscribes to `/rooms/<roomId>`. The app
shows a loading state until the first room snapshot arrives. Missing rooms show
a compact game-not-found state with a create-new-game action.

Rooms persist until a shared reset or manual deletion. A refreshed browser
resubscribes to the same room and renders the latest stored journey state.

## Architecture

Firebase Realtime Database is the canonical journey-mode store. The React app boots
through a room gate, then renders the journey experience from the subscribed room
state.

The main runtime boundary is a Firebase-backed journey provider that preserves the
existing `useJourney()` consumer shape as much as practical:

- `state`
- `mutations`
- `cardDatabase`
- `journeyContent`

Journey screens should keep using the journey context and should not import Firebase
directly. Shared behavior lives in provider/domain modules. Browser-local UI
state stays in React components, including deck viewer visibility, debug panels,
card inspection overlays, hover state, animation phases, and pending local
button state.

The Firebase layer should be split into three focused areas:

- `firebase/app-config`: initializes Firebase from Vite environment variables
  and exports the Realtime Database instance.
- `multiplayer/room`: handles room id generation, room references,
  create/join bootstrapping, schema version checks, presence, and subscription
  status.
- `state/multiplayer-journey-context`: owns Firebase-backed journey state and
  mutations while preserving the journey context API for screens.

## Firebase Room Shape

Each room stores shared journey state, metadata, presence, and recent action
history.

```text
rooms/<roomId>
  metadata
    schemaVersion
    createdAt
    updatedAt
  journeyState
    ...JourneyState fields or null before journey start
  presence
    <clientId>
      connected
      lastSeenAt
  actionLog
    <actionId>
      timestamp
      actorId
      action
      source
      summary
```

`journeyState` starts as `null`. When either player picks a Dream Avatar, that
browser builds the initial run and commits the first shared `JourneyState`.

The action log stores the last N shared actions for diagnostics. `journeyState`
remains the source of truth for rendering and refresh recovery.

## Journey State And Site Runtime

The current top-level `JourneyState` remains the shared model. V2 should add a
typed shared site-runtime map keyed by site id:

```text
journeyState.siteRuntime[siteId]
```

`siteRuntime` stores generated one-time reveal data and per-site shared progress
that every player must see the same way. This is preferred over broad use of
`SiteState.data` because it keeps atlas site definitions stable while giving
runtime data typed homes.

Examples of shared site runtime:

- Shop inventory, purchased slots, reroll count, and revealed Dreamsign pool
  changes.
- Reward site result and whether it has been accepted.
- Dreamsign offering options and purge/accept progress.
- Transfiguration candidates and accepted entries.
- Duplication candidates and generated copy counts.
- Essence site roll.
- Dream Journey and Random Site revealed options/outcomes.

Draft offers already live in `draftState.currentOffer`, so draft flow can keep
using `DraftState` for the current offer and fixed-pool progress.

## Data Flow

Room creation writes an empty room with `journeyState: null`, metadata, and schema
version.

Journey start is a race-safe composed action. Either player can choose a
Dream Avatar. The initiating browser resolves the Dream Avatar package, adds the
starter cards, initializes draft state, generates the atlas, sets the first
screen, and commits the initialized `JourneyState`.

Shared controls update Firebase through centralized mutations. Simple actions can
patch focused paths. Grouped flows should commit one coherent update per user
action so connected clients observe complete transitions.

Composed shared actions should include:

- `startJourney`
- `pickDraftCard`
- `completeSite`
- `buyShopSlot`
- `rerollShop`
- `acceptReward`
- `acceptDreamsign`
- `transfigureCard`
- `duplicateCard`
- `resetJourney`

The exact mutation surface can remain close to the current interface during the
transition, but multi-step screen flows should move toward domain-level composed
mutations.

## Random Choices

Random choices are generated by the initiating player's browser, then committed
to Firebase as shared state. Every client renders the stored result.

One-time reveals use a first-successful-reveal-wins rule. A client checks whether
the shared reveal exists, generates and writes it only when absent, and renders
the stored result afterward. This applies to shops, rewards, Dreamsign surfaces,
transfiguration candidates, duplication candidates, essence rolls, Dream Journey
outcomes, and Random Site outcomes.

This keeps generation client-side while preventing two connected players from
seeing different offers for the same site.

## Write Semantics And Conflict Behavior

Conflict behavior is field-scoped. Independent updates from both players should
compose.

Routine mutations should avoid writing a whole `journeyState` object from a stale
local snapshot. Instead, they should use:

- Path updates for independent fields such as `journeyState/essence`,
  `journeyState/screen`, `journeyState/currentDreamscape`, and
  `presence/<clientId>`.
- Multi-location updates for one user action that touches several fields, such
  as a draft pick updating `deck`, `draftState`, metadata, and `actionLog`.
- Transactions when the next value depends on the latest shared value, such as
  increasing essence, spending essence, first-successful random reveals, draft
  picks from the current offer, reset, and journey-start race protection.

Last-write behavior is acceptable for same-field conflicts where stale state does
not break the run. Transactions are required where accepting stale state can
duplicate rewards, overspend essence, reinitialize a room, or resolve a pick from
an outdated offer.

## Local UI State

The following state remains browser-local:

- Deck viewer open/closed state.
- Card inspection overlays.
- Debug screen and card-source overlay visibility.
- Hover state, selected display tabs, sort/filter controls, and card size.
- Framer Motion animation phase and timing state.
- Temporary pending-write indicators.
- Pan/drag state on the atlas.

Local UI can react to shared state changes. For example, a remote draft pick can
trigger a local card movement or deck highlight, but the animation itself does
not need to be stored in Firebase.

## Error Handling And UX

The multiplayer shell should keep UI minimal:

- Missing `?game=` shows a create-game screen.
- Creating a game writes the room and navigates to the share link.
- Joining a room shows loading until the first Firebase snapshot arrives.
- Missing room shows a game-not-found state with create-new-game.
- Firebase config or permission failures show a setup/error panel with the
  Firebase error message and required environment variable names.
- Disconnected state shows a small persistent connection indicator while keeping
  the last received journey state visible.
- Presence shows a compact connected-player count or dots.

Presence should use Firebase connection state and `onDisconnect` cleanup where
available. Presence is informational only and does not control permissions.

## Firebase Setup

The app should read Firebase config from Vite environment variables. The exact
names should be documented with the implementation, and should cover the
Firebase app config plus Realtime Database URL.

The prototype can use permissive Realtime Database rules for easy setup. A
minimal throwaway rule set can allow read and write access to room data.

Firebase Hosting serves the Vite production build from `dist/`. Hosting should
use an SPA fallback so share links like `/?game=<roomId>` load `index.html`.

## Testing

Testing should focus on the synchronization boundary and shared state helpers.

- Unit-test pure state transition helpers for composed actions: start journey,
  draft pick, shop purchase, site completion, reward accept, and reset.
- Unit-test room path/update builders so independent field updates do not
  overwrite unrelated state.
- Mock Firebase in provider tests for loading, missing room, subscribed room,
  pending write, permission failure, and disconnect indicator states.
- Preserve existing journey screen tests by keeping `useJourney()` as the primary
  consumer API.
- Add manual two-window QA for shared start, shared draft pick, shared deck
  update, concurrent essence/draft updates, refresh recovery, and reset.

## Rollout Plan

1. Add Firebase config, Hosting files, and the room gate.
2. Add Firebase-backed journey state subscription and room metadata handling.
3. Convert journey start and simple shared mutations.
4. Convert draft flow to composed writes and shared draft offers.
5. Convert remaining random reveal site flows to `siteRuntime`.
6. Add action log, presence, and connection UI.
7. Run typecheck, tests, production build, and two-window manual QA.

## Acceptance Criteria

- Opening the app without `?game=` creates a share-link path through the UI.
- Two browser windows on the same `?game=` render the same journey start state.
- Either player can choose the Dream Avatar for an empty room.
- A draft pick in one browser updates the other browser's offer, deck, and draft
  progress.
- Independent writes to different shared fields compose, such as one player
  changing essence while the other picks a draft card.
- One-time random reveals are shared by all connected players for the same site.
- Refreshing either browser reloads the latest room state.
- Reset clears the shared run for every connected browser.
- Firebase config, missing-room, permission, and disconnect states have visible
  minimal UI.
- Firebase Hosting serves share links through the SPA fallback.
