# Authoritative Transitions

The room event log is the sole authority for shared game state. Each committed
event is a player intent, and `src/rules/reducer.ts` derives the complete state
transition from the preceding fold, pinned content, the event sequence, and its
deterministic random stream.

## Event contract

Production intent payloads carry selections and identities: a site UUID, a node
id, selected deck-entry UUIDs, a card UUID, or a battle command. Values that are
derivable from folded state stay out of the payload. This includes battle
results, rewards, prices, completion levels, site completion, legal routes, and
Atlas expansion.

An event that hands ownership from one domain or screen to another commits the
whole handoff atomically. The source state remains present until the reducer has
derived every destination field. A successful terminal transition cannot expose
an intermediate state to React or to another client.

| Intent | Authoritative validation | Atomic outputs |
| --- | --- | --- |
| `ENTER_SITE` | Current dreamscape, site membership, visit eligibility | Site screen and active site |
| `COMPLETE_SITE` | Matching active site and screen, visit eligibility | Visited site, updated Atlas site, dreamscape screen, cleared active site |
| `TRAVEL_TO_DREAMSCAPE` | Atlas screen, available node, forward edge | Current dreamscape, current Atlas node, visit scope, screen, modifier lifetime |
| `BEGIN_BATTLE` | Matching active Battle site, Battle-last rule, folded journey identity | Immutable battle init and mutable battle board |
| `END_BATTLE` | Terminal folded board and matching battle/journey identity | Result-derived route; victory also commits reward, Battle-site completion, completion level, Atlas expansion, modifier expiry, deck cleanup, and battle teardown |
| `REGENERATE_ATLAS` | Valid debug progress depth and registered content | Completion level, rebuilt Atlas, route, current node, visit scope |

Debug state bootstrapping uses `LOAD_STATE`, which validates the full snapshot
before admitting it. Resource editors use bounded events. Progress edits use
`REGENERATE_ATLAS` so the completion level and graph are rebuilt together.

## Fold invariants

Every applied ordinary event is checked before its result can leave the
reducer. The invariant set covers:

- essence within its folded cap;
- site screen, active site, and current-node membership agreement;
- completion level matching completed Atlas nodes;
- current-node existence, availability, and layer;
- an assigned, available Atlas frontier after each non-final victory;
- final-screen completion depth;
- journey battle identity, active site, dreamscape, and starting completion
  level.

An invariant violation is a programmer error. The event-log fold contains it in
production, keeps the last valid state, and emits `fold_error` with
machine-readable `invariantCodes`, event identity, and before/after hashes.
Successful victories emit `battle_victory_committed` with the reward,
completion delta, completed node, and assigned forward frontier.

## Test contract

Reducer tests assert the full semantic delta of each terminal event. Replay
fixtures contain a terminal battle board followed by `END_BATTLE` and stamp the
resulting state hash. The coop fuzzer checks fold invariants on every canonical
result and runs a deterministic victory sentinel that requires reward, site,
Atlas, route, and teardown to agree.

Browser certification runs the built application with two clients. It wins a
battle through the visible inspector, continues to the Atlas, checks the full
victory handoff on both clients, reloads both tabs, and checks the same state
again.

## Change checklist

For every new terminal or cross-domain event:

1. Define the player choice carried by the event.
2. Derive prices, rewards, outcomes, and generated content from folded state.
3. List every source and destination field in one reducer case.
4. Add an invariant that rejects the most damaging partial state.
5. Add a reducer test for the complete state delta and an early/stale bounce.
6. Add the transition to a replay, fuzz sentinel, or browser certification path
   according to its production risk.
7. Log enough identities and derived outputs to reconstruct the transition from
   a production room.
