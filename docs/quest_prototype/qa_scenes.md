# QA Scenes (`?goto=`)

QA scenes are named jump points to screens that are otherwise reachable only by
playing a quest forward through battles. Appending `?goto=<scene>` to the dev URL
boots a fresh room straight onto the target screen, so a surface like the Dream
Atlas boss preview or a site screen can be opened for browser QA without playing
up to it.

```
http://localhost:5174/?goto=atlas
http://localhost:5174/?goto=duplication-enhanced
```

The scene id is trimmed and matched case-insensitively. An empty value
(`?goto=`) is ignored.

## How it works

1. `parseRuntimeConfig` reads `?goto=` into `runtimeConfig.gotoScene`
   (`src/runtime/runtime-config.ts`).
2. When `gotoScene` is set and no `?game=` room id is present,
   `MultiplayerRoomGate` auto-creates and joins a fresh room, skipping the manual
   "Create Game" gate — the same auto-create path `?loadQuest=` uses
   (`src/multiplayer/MultiplayerRoomGate.tsx`, `src/App.tsx`).
3. On the freshly created (empty) room, `bootstrapQaScene` builds a complete,
   valid `QuestState` for the scene from live quest content — the same generators
   the real quest uses, never hand-faked fixtures — and parks the run on the
   target screen (`src/runtime/qa-scenes.ts`).

Each load writes a `debug_qa_scene_loaded` event to `logs/quest-log.jsonl`,
stamped with the room `gameId`.

The bootstrap guards on `dreamcaller === null`, so it only fires on a brand-new
empty room. Once the room exists (the URL gains `&game=<id>`), reloading resumes
that room rather than rebuilding the scene. An unknown id, or a scene whose
required content is missing, leaves the room on the normal Dreamcaller selection
screen and logs the outcome (`unknown_scene` or `build_failed`).

Site scenes retype one of the starter dreamscape's non-battle sites to the target
site type and park the run on it; the site's per-screen runtime (offers, choices)
is created on entry by the screen itself, exactly as in normal play. An
`-enhanced` variant marks the site `isEnhanced`, surfacing its enhanced behavior
(for example, the Duplication site offering the whole deck instead of a small
random hand).

## Atlas layers

`?goto=atlasN` opens the Dream Atlas resting screen the UI labels **"Layer N"** —
the screen where the player is choosing among the column-N dreamscapes. The atlas
is a fixed 7-layer graph whose columns the UI numbers I–VII (1-indexed); column I
is the starter dreamscape the player begins inside and never rests on, so the
numbered scenes run **`atlas2` … `atlas7`** (`atlas7` is the boss-only frontier).
Because the columns are 1-indexed, "Layer N" is the 0-indexed frontier layer
`N - 1`, reached after completing `N - 1` dreamscapes (the "Battles won" counter
reads `N - 1`).

The state is built by replaying those real dreamscape completions through
`regenerateAtlasForProgress` — the same generate-then-`advanceAtlas` code path a
battle victory drives, and the same one the in-atlas debug "regenerate" button
uses. The run is then parked exactly as `battle-completion-bridge` leaves it after
a win: `screen: atlas`, `currentDreamscape: null`, and `completionLevel` matching
the depth. Because each advance runs for real, the reveal-two-layers-ahead rule
fires on every step, so the frontier always shows one layer ahead — the scene
never reproduces an impossible resting view where the next layer is still an
unseen dream. Node ids, dreamscape assignments, and the boss incarnation are
freshly generated each load (pair with `?seed=` for a fixed layout).

Plain `?goto=atlas` is the first real resting screen ("Layer II", reached after
completing the starter dreamscape) — the same screen as `atlas2` — and is the
natural entry point for boss-preview QA, since the boss node is revealed from that
depth onward.

## Battle layers

`?goto=battleN` opens the Battle site inside the dreamscape on atlas **Layer N**,
for **`battle1` … `battle7`**. Like the `atlasN` scenes, the URL uses the UI's
one-indexed layer number while quest state stores the zero-indexed run depth:
`battle5` therefore enters a Layer V battle at `completionLevel: 4`.

Each scene builds its atlas by replaying the preceding real dreamscape
completions, enters an available dreamscape on the requested layer, marks its
non-Battle sites visited, and opens the Battle site. The route constructs the
opponent with the normal battle generator for that completion level, including
the layer-based deck tuning, Dreamcaller ability, Legendary access, and
Dreamsign schedule. This makes later scenes materially stronger; for example,
the Layer V opponent has an active ability and an active Dreamsign.

Every battle scene stops on the **Battle Start** screen that previews the
opposing Dreamcaller, ability, Dreamsigns, and signature cards. Select **Begin
Battle** to enter the playable board. Plain `?goto=battle` is the same Layer I
entry point as `battle1`.

`?goto=battle-playable` mounts the Layer I playable board directly for layout
and interaction QA.

## Draft site

`?goto=draft` retypes a starter-dreamscape site to the `Draft` type and parks the
run on it. The QA foundation seeds a valid `draftState`, so on entry the draft
screen rolls its first offer and paints a real card pack over the starter
dreamscape, with the floating `Draft (n/total)` pick counter beneath it. The
Cumulus layout is a 2×2 pack on mobile and a four-card row on desktop. Picking a
card mints and paints the next offer and advances the counter; exhausting the
pack completes the site and returns to the dreamscape overview.

Open this scene with `&ui=cumulus` to see the Cumulus pack. Pair with
`&deviceFrame=iphone16` to render the phone chrome for framed mobile QA, e.g.:

```
http://localhost:5174/?goto=draft&ui=cumulus&deviceFrame=iphone16
```

## Registered scenes

The source of truth is `QA_SCENES` in `src/runtime/qa-scenes.ts`.

| `?goto=` id              | Screen                                                            |
| ------------------------ | ---------------------------------------------------------------- |
| `dreamcaller-select`     | Choose-your-Dreamcaller screen a run opens on (`questStart`), without the lobby |
| `atlas`                  | Dream Atlas resting screen at the first frontier the UI labels "Layer II" (one dreamscape completed), with a generated boss node and Apollyon incarnation (atlas UI + boss-preview QA); same screen as `atlas2` |
| `atlas2` … `atlas7`      | Dream Atlas resting screen the UI labels "Layer N", with the available frontier on column N (see "Atlas layers" below) |
| `battle`                 | Layer I Battle Start opponent preview; same scene depth as `battle1` |
| `battle-playable`        | Layer I playable battle board |
| `battle1` … `battle7`    | Battle Start opponent preview for the keeper battle on atlas Layer N, with layer-tuned opponent strength (see "Battle layers") |
| `dreamscape`             | Starter dreamscape overview with site nodes and the QuestStatusBar |
| `dreamscape-with-essence` | Starter dreamscape overview with an Essence site ready to enter (site-entry animation QA) |
| `deckviewer`             | Deck viewer overlay opened over the starter dreamscape (deck grid + press-and-hold zoom) |
| `startingdeck`           | Starting-deck reveal popup over the starter dreamscape (frosted-glass chrome QA) |
| `draft`                  | Draft site — the Cumulus draft screen with a rolled first offer and the floating `Draft (n/total)` pick counter (mobile-gated; see "Draft site" below) |
| `essence`                | Essence site                                                     |
| `transfiguration`        | Transfiguration site                                             |
| `transfiguration-enhanced` | Transfiguration site, enhanced                                |
| `duplication`            | Duplication site                                                |
| `duplication-enhanced`   | Duplication site, enhanced (whole deck offered)                 |
| `purge`                  | Purge site                                                       |
| `purge-enhanced`         | Purge site, enhanced (discounted removals)                      |
| `shop`                   | Shop site                                                        |
| `shop-enhanced`          | Shop site, enhanced (free restock, signature-tide cards)        |
| `dreamsignmarket`        | Dreamsign Market site                                           |
| `dreamsignmarket-enhanced` | Dreamsign Market site, enhanced (free restock)                |
| `dreamaugury`            | Dream Augury site                                               |
| `dreamaugury-enhanced`   | Dream Augury site, enhanced flag (same UI as regular)           |
| `reward`                 | Reward site                                                      |
| `tempting`               | Tempting Offer site                                             |
| `tempting-enhanced`      | Tempting Offer site, enhanced (Enhanced badge)                  |
| `gamble`                 | Gamble work-in-progress site                                    |
| `gamble-enhanced`        | Gamble work-in-progress site, enhanced                          |
| `temporal-fork`          | Temporal Fork work-in-progress site                             |
| `temporal-fork-enhanced` | Temporal Fork work-in-progress site, enhanced                   |
| `dreamsign-revelation`   | Dreamsign Revelation site                                       |
| `dreamsign-revelation-enhanced` | Dreamsign Revelation site, enhanced (four choices)        |
| `questcomplete`          | Quest victory end screen (completion stats + final-deck reveal) |
| `questfailed`            | Quest defeat end screen (failure summary)                       |

## Combining with other parameters

`?goto=` composes with the other runtime parameters documented in
`url_parameters.md` (read once at page load, not reactive). For example, pair it
with `?seed=` for a fixed RNG seed, or `?algo=` to select a draft-pool strategy
for the bootstrapped run.

## Adding a scene

Register a `QaScene` in `QA_SCENES` (`src/runtime/qa-scenes.ts`). For a site
screen, use the `siteScene(id, label, siteType, isEnhanced?)` helper. The URL
handling, auto-create, and bootstrap mutation are generic and need no further
changes — a new scene id becomes reachable at `?goto=<id>` immediately. Add a row
to the table above so the option is documented.

## Devtool demos (`?demo=`)

`?demo=<name>` is a parallel hook to `?goto=`: instead of bootstrapping a full
quest room and parking it on a screen, it mounts a standalone demo component in
place of `<App>`, bypassing the whole quest workflow. The dispatch lives in
`src/main.tsx` (`demoParam === "<name>"`), so a demo needs no room, no
`QuestState`, and no multiplayer gate.

`?demo=device-frame` mounts `DeviceFrameDemo`
(`src/cumulus/screens/devtools/DeviceFrameDemo.tsx`), the browser-QA page that
proves the device-frame safe-area injection end to end. It renders a title band
padded by `var(--safe-area-inset-top)` so the "Your Deck" title clears the
Dynamic Island, and a control parked to the right of the island from the
`--display-cutout-*` box, with dashed cyan guides tracing the injected safe-area
band and the cutout's bounding box — so a single screenshot shows the injected
metrics line up with the painted island. On a target with no cutout (for example
iPhone SE) the island guide and the island-relative control are omitted.

Capture it through the device-screenshot tool, which supplies the `deviceFrame`
metrics the demo reads:

```
node scripts/device-screenshots.mjs -d iphone-16 --query 'demo=device-frame'
```

`?demo=entity-reveals` mounts the deterministic entity-reveal conformance page.
It uses fixed UUID-backed fixtures and the public named Cumulus components for a
popup GameCard, press-in-place GameCard, strict InfoCard content, glossary term,
unavailable card, Atlas node, and battle card. Its semantic scenario controls
arrange top-edge, side-fallback, truncation, best-effort, reduced-motion, and
simulated-safe-area cases for browser QA while the coordinator continues to own
all placement and gesture mechanics.
