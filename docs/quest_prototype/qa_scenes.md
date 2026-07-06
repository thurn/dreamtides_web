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
   "Create Game" gate — the same auto-create path `?startInBattle=` and
   `?loadQuest=` use (`src/multiplayer/MultiplayerRoomGate.tsx`,
   `src/App.tsx`).
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

## Registered scenes

The source of truth is `QA_SCENES` in `src/runtime/qa-scenes.ts`.

| `?goto=` id              | Screen                                                            |
| ------------------------ | ---------------------------------------------------------------- |
| `dreamcaller-select`     | Choose-your-Dreamcaller screen a run opens on (`questStart`), without the lobby |
| `atlas`                  | Dream Atlas resting screen with a generated boss node and Apollyon incarnation (boss-preview QA) |
| `deckviewer`             | Deck viewer overlay opened over the starter dreamscape (deck grid + press-and-hold zoom) |
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
| `tempting`               | Tempting Offer site                                             |
| `tempting-enhanced`      | Tempting Offer site, enhanced (Enhanced badge)                  |
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
