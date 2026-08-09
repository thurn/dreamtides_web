# URL Structure

The journey prototype reflects the player's current location into the address-bar
path, so the URL shows where the player is at a glance — the Purge site of a
dreamscape, the Dream Atlas, a battle, the end screens. The path is derived from
journey state by `screenToJourneyPath` (`src/runtime/screen-url.ts`) and written on
every screen change by `useJourneyUrlSync` (`src/runtime/use-journey-url-sync.ts`),
mounted in `JourneyApp`.

## Path grammar

```
/                                  DreamAvatar selection (journeyStart)
/atlas                             Dream Atlas
/dreamscape/<layer>-<biome>        a dreamscape's site-selection screen
/dreamscape/<layer>-<biome>/<site> a specific site within a dreamscape
/complete                          journey victory
/failed                            journey defeat
```

`<layer>-<biome>` identifies the current dreamscape node: its layer index
(0 = starter … 6 = boss) followed by the slug of its biome name (`Ember Wood` →
`2-ember-wood`). Biome names repeat across the atlas, so the layer prefix
disambiguates them — and it is an exact locator, since the player occupies
exactly one node per layer. The biome falls back to the node id slug (e.g.
`3-dreamscape-4`) when the node has no biome name. `<site>` is the kebab-cased
site type, derived directly from the `SiteType` token so a new site type is
reflected automatically:

| `SiteType`           | `<site>` segment      |
| -------------------- | --------------------- |
| `Battle`             | `battle`              |
| `Draft`              | `draft`               |
| `Shop`               | `shop`                |
| `Purge`              | `purge`               |
| `Essence`            | `essence`             |
| `Transfiguration`    | `transfiguration`     |
| `Duplication`        | `duplication`         |
| `Reward`             | `reward`              |
| `Augury`             | `augury`             |
| `DreamsignMarket`    | `dreamsign-market`    |
| `DreamsignRevelation`| `dreamsign-revelation`|
| `RandomSite`         | `random-site`         |
| `Gamble`             | `gamble`              |
| `Exploration`       | `exploration`       |

Examples:

```
https://redacted-firebase-project.web.app/dreamscape/2-ember-wood/purge?game=r3f7vk
https://redacted-firebase-project.web.app/atlas?game=r3f7vk
http://localhost:5173/dreamscape/5-sunken-city/battle?game=journey42
```

## Reflection model

The path is a passive **reflection** of authoritative journey state, not a
navigable route:

- **State is the source of truth.** Journey state lives in the room's Realtime
  Database node and is synced across every client in the room. The path is
  computed from that state; it never drives it.
- **The room id is the resume key.** The query string carries `?game=<roomId>`
  (plus runtime flags like `?realtime=1`, `?goto=`, `?seed=`). A reload restores
  the run from the room, and the path is re-derived from the restored screen. A
  bookmarked or hand-edited path that no longer matches the run is harmlessly
  rewritten to the actual screen once the room loads.
- **`replaceState`, not `pushState`.** Screen changes rewrite the current
  history entry rather than pushing new ones, so the browser Back button does
  not walk backwards through screens (which would fight the synced, shared state
  a co-op room holds). The query string and hash are preserved on every rewrite.

Because the path is one-way, two clients in the same room independently reflect
the same screen, and the reflection never desyncs co-op state.

## Serving

Path-based URLs need every path to serve the app shell:

- **Production:** Firebase Hosting rewrites `**` → `/index.html` (`firebase.json`).
- **Dev:** Vite's SPA history fallback serves `index.html` for extensionless
  paths.

`src/main.tsx` dispatches on `window.location.pathname` for standalone routes.
`/main`, `/loading`, and `/tutorial` mount the Firebase room gate and the same
event-log provider as journey play. Their shared front-door fold drives the path:
`New Journey` moves both players through the menu exit, cinematic loading scene,
and tutorial. `/cards`, `/editor`, `/glossary`, `/cumulus`, `/dreamscapes`, and
the other authoring paths render their respective tools. Every other path —
including all journey paths above — renders the journey app. Journey paths are chosen not to collide
with those routes (note the journey `/dreamscape/<layer>-<biome>` is singular,
distinct from the `/dreamscapes` dreamscape editor).

## Logging

`useJourneyUrlSync` emits a `journey_url_synced` event to `logs/journey-log.jsonl` on
each path change, recording `path`, `screenType`, and `siteId`. One entry per
navigation makes a run's screen-by-screen path history reconstructable from the
log, stamped with the room `gameId` like every other entry.

## Relationship to query parameters

The path reflects *where the player is*; query parameters configure *how the run
boots and behaves* (room id, RNG seed, QA jumps). They compose
freely — a path always carries the run's query string alongside it. See
`url_parameters.md` for the full parameter reference, including `?goto=<scene>`,
the developer QA jump that boots a fresh room straight onto a target screen.
