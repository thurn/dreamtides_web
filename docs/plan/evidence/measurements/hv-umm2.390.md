# hv-umm2.390 measurements

The development battle observer retains genuine constructor publications
against the final loaded init, then groups them under the matching
LOAD_STATE intent's durable sequence. Live batches use each applied intent's
sequence. Engine action-log sequence numbers are a separate namespace.
The existing eager presentation callback feeds the observer; it adds neither
another subscription nor another engine fold. An init-scoped ref keeps
debug observations only. The authoritative game remains the event-log fold.

The collector is scoped to the mounted battle. Constructor retention is a
DEV-guarded WeakMap keyed by final init objects. Production tree shaking
excludes the collector, QA scenes, and lazy panel; the additive P7 module
assertion covers the collector. Reloaded init objects begin a fresh live
history. The panel deletes its own published probe during cleanup.

Cumulus rung 1: existing debug rail, controls, and appearance. The change
adds observation wiring and preserves existing presentation enqueueing,
player interactions, AI scheduling, event logging, and rules.

## Checks

| Check | Exit | Wrapper seconds |
| --- | --- | --- |
| focused | 0 | 3.258 |
| review | 0 | 11.595 |
| knip | 0 | 2.999 |
| full | 0 | 62.092 |
| review-final | 0 | 14.172 |
| knip-final | 0 | 2.605 |

Focused: 9 cases in 2 files. The new pure collector contract adds
3 synthetic cases in one Node test file; physical instances come from
boardState/testCatalog. Existing presentation tests retain their bodies
and change only the probeEvents import. Full: 3303 cases in 324 files,
Vitest 39.98 s; P7 reports that the production bundle holds no development-only
module. The full check ran under artifacts/heavy.lock; its prepare and
local-asset restoration finished before browser startup.

The first review caught two raw InstanceId casts in a synthetic fixture;
existing boardState minting replaced them. A subsequent review caught the
fixture's missing active/phase fields; the setup now supplies both.
The failed reviews and successful focused runs are retained outside the
worktree. Final production code was covered by full validation. A later
tracked-scenario-only refinement added an explicit earlier-live retention
check after another committed pass, followed by final review and knip.

## Tracked browser verification

One card-lab-stage run used --arg probeHistory=1 and source printing UUID
e83014d3-9d35-4e80-a1b3-9b25360ad2af, plain as=enemy, on desktop and mobile.
Report: card-lab-stage.result.json; SHA256 9f09470fea17b0c8d600b74d879d87ca33dfe22e2772547e0da9daf3252cbfc5.
Both observed real constructor cardPlayed, enemy physical i10, at LOAD_STATE
seq 1/index 1. The live response produced resolved/materialized at seq 2,
indices 0/1, and subsequent phase batches at seq 3. Another actual pass
produced seq 4/5. All 17 unique keys, from 1:0 through 5:8, were retained
and matched a complete read when paged one event at a time. An empty tail
preserved cursor 5:8. The earlier live records survived later committed
intents and presentation rerenders.

The existing debug opener was 40×40, desktop (1388,12), mobile (338,12),
inside each viewport with a centre hit. Both final caps assertions passed;
the report's error-document list is empty. This is an observation and
interaction contract; it makes no settled-card visual claim.

Browser lease wait 40 ms, serve
1263 ms, scenario 15387 ms, total
16713 ms; wrapper
22.008 s.
Host load 4.3193359375. Port 5174, own server process group 31862.
The runner closed its context, drained RPC/provider responses and SDK
transport, stopped its owned server, and released its lease. A fresh process
query found group 31862 absent; the port was free and the exact owner record
was absent. No peer resources were touched.

No executable source or preparation changed during the browser run.
Frozen source hashes matched after cleanup:

- src/battle/components/engine-probe-events.test.ts: 40632c2a3d05f1e480b216d83b53f4c36afea7ce8ec6bf59ef9b77970dfc20b1
- src/battle/components/engine-probe-events.ts: 8af0d58e24c4ac04f3f69f4de7abc15d8243da5bd77eb7750dbe534a528dd3f0
- scripts/qa/prelude.mjs: 5034edc3661fac1aabd10c2ff23d8f6f4c841684902caaec5e35cf26bb0486c5
- scripts/qa/scenarios/card-lab-stage.mjs: a30cdf2af46ef9301752102461ee4acb0c64d07e50ab813ffbb1d9afa411dffb
- src/battle/components/EngineBattleScreen.tsx: 67ecd563fc05c090ae0a9819332a65c686cb1bc4b9b3f8c66db3e8fae97cef38
- src/battle/components/EngineDebugPanel.tsx: 2ae51c3046ab59edf9cc666abdfb991b5e6e544752e8ef286c50a5c42ae45fbb
- src/battle/components/battle-presentation.test.tsx: 0c58aa103d11bc033a842464b6d40480360751ec9026a9088ebc4aeb43bdf611
- src/runtime/qa-scenes.ts: 268da0ddb4e53070ddfacde0911b210e0bc4713cfa68dabaad366698ba7dbf6f
- vite.config.ts: 38dd41f8c01b6f76aef055b5e40a636a4bb7c458dca45e9318caf5e185bcfca2
