# Playwright MCP heap investigation — hv-umm2.756

The retained evidence establishes two JavaScript heap exhaustion crashes in the shared Playwright MCP Node process. The installed provider also retains request objects across raw-page navigations, a path used by the canonical QA runner. A bounded diagnostic confirms that collection behavior. Its contribution to either crash is unknown, and this investigation establishes no repository-owned cause of the 4 GB heap exhaustion. The deliverable is an upstream diagnosis; runtime source is unchanged.

## Source and custody

Repository base: `7db4bd4930d07612a5d84a6c8267c13f51d8cd06`. Incident source: `d3c94c8f7cae7a2d1fccf95c8a39a2383faa6130`. The five inspected canonical boundary files are byte-identical between those commits: `scripts/qa/card-sweep.mjs`, `run-scenario.mjs`, `prelude.mjs`, `scenarios/card-lab-play.mjs`, and `scripts/screenshot-runtime.mjs`. This qualification concerns those files, rather than the whole application or hv-umm2.278's subsequent lab source.

The original incident evidence remains under the primary checkout's ignored `artifacts/qa/hv-umm2.278/provider-recovery/`; native game evidence remains in that bead's `native-sink/`. The structured companion records original paths, byte sizes, hashes, read scopes, and immutable scratch copies. Hash custody of a complete sink does not claim a semantic read of every game.

| Evidence | Independently inspected observation |
| --- | --- |
| `provider-crash-v01.ips` | PID 98583, coalition `com.dthurn.codex.playwright-mcp`, launch 2026-10-15T10:07:23.8443Z, crash 17:59:38.0637Z, SIGABRT; faulting thread has `node::OOMErrorHandler` and V8 fatal OOM frames. |
| `provider-service-log-v01.txt` | Complete 279-line retained log: same PID's mark-compacts 4040.5→4028.7MB and4041.7→4031.6MB precede fatal JavaScript heap exhaustion. |
| Earlier `node-2026-10-15-030724.ips` | PID 73697, same coalition, launch 08:17:28.2513Z, crash 10:07:23.8460Z, SIGABRT with OOM frames; binds the earlier same-PID GC/fatal block in the retained log. Its workload and ownership are unknown. |
| Native owner comment `01a140be-f661-761e-821e-841937ad160d` | Acknowledged owner record reports sweep terminal 18:00:59.830597Z, exit 2/1355.847451s,143 effective passes/2 effective failures, one ineffective timeout recovered by native retry,319 of 464 cells unattempted. An independent raw shell wait receipt was not located. |
| Original failed report and game | CardUUID `4edf2d8d-61e4-4c3a-a388-4b52b2ebd005`, base/player, game `6ayjxj`; native lab load 17:59:32.505Z and last retained worker event 17:59:37.254Z. Parsed fallback report has null result/MCP-32001 timeout and empty log/Caps. The provider's final wire response is unavailable. |
| Recovery archive | Exact owner bytes retain runner 76158/slot 1/port 5274/session `189afb9e-a704-496c-b644-7fcffd3eaf22`, state `call-and-close-unconfirmed`. Two guarded 18:07:36Z snapshots establish old runner/provider absence, absent server record/free port and replacement-owned browser descendants. Exact old transport404 is historical evidence. Execution ended by crash; a successful browser-close response is not asserted. |

The archived owner SHA is `af8fefd10b1e0a1912c0c06327ff60a861c750e27f2c2f44262d87d5a588cd36`; the receipt preserves the original bytes and records zero shared service signals and peer-slot mutations. This investigation performed no new provider calls or custody mutations.

The preceding timeout/navigation failures have separate full parsed reports. Their initiators remain unknown here. The distinct PID 97409 MaxListeners warning and a Buffer ReferenceError in the retained service log also receive no OOM attribution. The controlled watcher diagnosis delivered by hv-kjgt remains the evidence for its specific ledger→Vite/Tailwind→client-reload boundary.

## Actual installed provider

Read-only inspection found `@playwright/mcp` 0.0.79, whose CLI delegates to `playwright-core` 1.63.0-alpha-2026-08-05. The actual bundled implementation is `node_modules/playwright-core/lib/coreBundle.js` beneath `/Users/dthurn/.local/share/codex-playwright-mcp/`, SHA256 `adf9246486a03bee08b2895db057ba470c62377911d291693fe783d91d6fec52`, 3449273 bytes. The structured record binds package metadata, entrypoint, config and launchagent hashes. These are post-incident installed bytes; matching stack paths and old modification times do not establish an exact historical package hash.

The complete config and launchagent specify isolated headless Chromium contexts, device scale 2, console warning, localhost 8931 and KeepAlive, with no custom heap flag or shared-context option. One read-only 18:26:40Z process snapshot observed replacement PID11452 with the same launch arguments/start and RSS 3916912 KiB. That single uncontrolled RSS value establishes neither retained JS heap, growth rate nor workload ownership.

## Request retention and canonical data flow

| Source at the bound epochs | Behavior relevant to this diagnosis |
| --- | --- |
| `card-sweep.mjs:172–193,209–292` | A session/page serves successive cells until contention causes a card-boundary yield, the session becomes non-runnable, or the sweep ends. Every raw attempt is persisted immediately. Summary state holds verdict counters rather than all successful reports. |
| `run-scenario.mjs:171–185,519–780` | Each cell sends the prelude and scenario through `browser_run_code_unsafe`. Settled RPC promises leave `activeCalls`. Cleanup drains calls, records actual browser completion before local transport close, preserves quarantine on uncertainty, and settles owned servers/locks. |
| `card-lab-play.mjs:60–61`; `prelude.mjs:783–904,1195–1215` | Each cell uses `qa.open`, whose navigation uses raw `page.goto`. Navigation listeners are removed in `finally`. |
| `prelude.mjs:1102–1185,1372–1416,1487–1505` | Native export reads full requested-game JSONL and closes the IndexedDB handle. Finish removes its console observer. Captures save files and return paths/geometry. Canonical sweep calls do not enable finish-time `exportGameLog`; judged scenarios can use the log helpers. |
| `screenshot-runtime.mjs:18–142` | Actual provider error responses retain their cause. Successful responses are parsed as complete text results. Normal close observes browser response, runs its receipt callback and closes the local transport while preserving all failures. |
| Installed bundle `67030–67074` | The supported unsafe tool passes `tab.page` into a VM and explicitly allows arbitrary page interactions. Submitted code and JSON result are serialized in the response; this handler registers no image result. |
| Installed bundle `64312–64701` | `Tab` listens for every page request and appends request objects to `_requests` without count or size eviction. `_initialize` can seed completed requests. `Tab.navigate` clears collected artifacts before `page.goto`; raw page navigation does not invoke that method. Snapshot drains recent event entries but retains `_requests`. Page close clears the collection. |
| Installed bundle `66748–66825` | The public network tool describes requests since loading the page and reads that collection. The explicit clear tool is marked `skillOnly`; it is not a presumed MCP repair API. |
| Installed bundle `64763–64771,65519–65570,73108–73125` | Context/backend disposal removes tab listeners/collections and closes the isolated browser context. HTTP heartbeat cleanup and the repository SDK 1.29.0 response-handler/timeout cleanup have source-visible paths; missing explicit `terminateSession` alone does not establish a retention defect. |

The supported unsafe API permits the runner's raw-page usage. The provider's collection reset covers its separate navigation tool while requests from the supported unsafe path remain in its request history across loads. This is a concrete external retention candidate; it does not identify the crash's dominant retaining graph. Request/response body sizes, VM lifetime, protocol object retention and contributions from other clients are unknown. A large serialized response or echoed code alone is not evidence of a retained-heap leak.

The prelude adds an init script per call, as its source comment states. Registration accumulation is another source-visible candidate whose memory contribution is unmeasured. It does not establish a repository-owned cause of this OOM or justify a substitute repair.

## Bounded diagnostic

After native finite ACK01, the parent executed the exact 77-line scratch diagnostic once, with an isolated owned child and 30-second containment. It imported Node built-ins and extracted the complete installed `Tab` class verbatim from the frozen bundle; SHA256 `c463f64b374a3f3b6cd4adc1b7353b577fb5b664effcaaa5c3c0fb302b0c348a`. Page/EventEmitter/log/event-waiter dependencies were in-memory doubles. No Playwright/provider module, browser, network, server, timer, profile or shared-service operation was invoked.

Exactly three tiny synthetic requests, each followed by a raw-page navigation/snapshot cycle, produced retained-request counts 1,2,3; the first object's identity remained retained. A provider `Tab.navigate` then left one request; page close left zero; dispose left zero page listeners. The actual result was exit 0 in 0.060680209s, PID/process group 96601 reaped and absent, with all 5820 tracked source hashes unchanged. The raw receipt/output hashes and complete before/after source-map references are in the companion JSON.

This is actual method behavior under dependency doubles. It is not a shared-provider reproduction, browser integration test, historical-package assertion, body-size or heap measurement, leak-rate estimate, or before/after performance result. It stays outside CI because it inspects an installed private implementation. No permanent test or production change is introduced.

## Ownership, limits and follow-through

No repository-owned cause of either heap exhaustion is demonstrated. The responsible upstream owner can investigate navigation-aware request-history retention for the supported unsafe path, preserving network diagnostics, then evaluate retaining paths under isolated representative load and comparable source-qualified before/after runs. Heap captures, installed-provider edits, service flags/restarts, context closure, response truncation and external issue/message submission are outside this bead's effects.

The incident provider had nearly 7h52m uptime before the later crash. Its cumulative clients/workload are unknown. This investigation makes no claim that one sweep owns the 4 GB, that the earlier crash shares a retaining mechanism, that historical navigation failures share either OOM, or that memory/performance has improved. Full actual verdict/error/source/game provenance, two native browser slots, fairness, retry/deadline semantics and ownership quarantine remain current contracts.

Ordinary review passed in 0.247022s (the applicable friction-schema check; 1000 records). Knip passed in 5.517200s, including normal asset preparation/restoration. Its 260 stderr lines are temporary missing-art warnings; complete before/after maps show all 5823 tracked and unignored files unchanged. Final JSON/schema/whitespace receipts and the actual normal Git tail are retained in the scratch handoff; the companion JSON records the immediate precommit cutoff and completed checks. There is no browser or heavy validation effect for this evidence-only scope. Source read coverage uses 45 independently verified bounded ranges; early clipped inventories are excluded and three mandatory-document gaps have separate complete repair receipts. Initial read-command PIDs/timestamps remain UNKNOWN.
