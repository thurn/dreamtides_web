# hv-umm2.378 — Developer opener during gallery prompts

Base: `9892a3ba250be559c46b775a6939c0c18cfbafc7`. UI source changes cover only the closed developer opener and its battle-screen visibility input. The debug component stays mounted so its hooks, probe and open rail retain their behavior. The existing gallery presentation determines closed-opener visibility. Cumulus uses the existing IconButton and its wrapper; component appearance and canonical layer tokens are unchanged.

## Baseline and source lineage

The native scenario runner measured the real Flotilla UUID `3e83cbe2-2b21-4804-9906-4b4735db9869` target prompt at mobile 390×844 and desktop 1440×900. Mobile Cancel was `(269.125,20.75,88.375,42)` and the opener `(338,12,40,40)`, intersecting 19.5×31.25 px. Cancel's center `(313.3125,41.75)` hit Cancel; its right edge `(354.5,41.75)` and overlap center `(347.75,36.375)` hit the developer opener. An asserted pointer click in the overlap refused that covering element after 1000 ms. Actual center-pointer cancellation preserved the committed battle state exactly, cleared the prompt, and logged `engine.promptCancelled`. Desktop Cancel `(826.625,20.75,88.375,42)` and opener `(1388,12,40,40)` were disjoint and center/edge hits worked.

The banner's layer 80 and gallery's layer 50 are nested inside an additional fixed-position stacking ancestor; the opener is a sibling outside that context at layer 59. Visibility coordination addresses the observed hit behavior without changing global stacking roles. Baseline captures: `debug-opener-baseline-mobile.png`, `debug-opener-baseline-desktop.png`. Baseline games `a7ro8q` and `bg58w4` include the actual persisted cancellation rows.

Baseline SHA-256: EngineDebugPanel `aab63b183095173670e6f4484527cba014a7fd90adced42ad5b97e2e4860522e`; EngineBattleScreen `a8b243340138de7ae60b8bf20050bdf8d3851a793e4dd417808301f73ead3634`; canonical tokens `f85e8c94a87d5a627fa8f790216d1e1ca9a5ae050b50f3d329f8bc68ac8d5152`. Complete tracked source/test/tool/token and task-script manifests were captured before and after every run: baseline 2431 entries, fixed runs 2432, read-only recovery 2433, mobile log proof 2434. Every paired manifest matched. Task-script revisions and original failed reports are retained separately in the implementation scratch directory.

## Accepted fixed workflows

Both viewports showed a fully readable Cancel with the closed developer opener absent and the probe live. Center, the previously covered right edge, and four interior quarter-grid samples hit Cancel. Clicking the right edge cancelled the play and left committed state exactly equal to its pre-play value. The opener returned and opened/closed the developer rail. Battle-log close passed the same painted-area hit checks and pointer close, preserving the hv-31uz surface. The normal second play selected physical targets `[i11,i10]`, then materialized `[i10,i11]` in source-zone order, charging 4 energy (9→5), exactly once each. Final card boxes were 53.859375 px square on mobile and 89.5 px square on desktop, opacity 1, transform none, and all measured hit samples worked. All error buffers were empty.

Captures use `debug-opener-fixed-{choice,rail,log,selected,resolved}-{mobile,desktop}.png`. Parent cold visual review accepted both choice captures and the mobile rail, log and resolved state. The original accepted fixed run's durable-log payload serialized as null; its UI, state and published-event proof remains attributed to that run, without claiming recovered desktop persisted rows.

The final new mobile log acceptance exports actual 45 persisted rows from game `qw5hyr` before context close, in `mobile-game-qw5hyr.jsonl`. The rows identify source `i1`, the Flotilla UUID, cancellation of prompt `0:1:0` (seq 30), new prompt `0:3:0` (seq 32), its answer `value: [i11,i10]` (seq 39), and the source play from hand with that answer (seq 40). Synchronous assertions checked the serialized rows after an explicit asynchronous DB read. Final captures use `debug-opener-logproof-final-{choice,selected,resolved}-mobile.png`. This supplies the missing mobile durable-log acceptance on a distinct game; desktop gameplay evidence stays on the original fixed run.

## Actual commands and resources

All times below are seconds. Validation used two workers outside the heavy lock; review and Knip ran sequentially. No local full suite or fuzz was required for bounded development chrome.

| Command/run | PID | Actual exit | Wrapper elapsed | Native scenario | Lease wait | Runner total | Host load |
| --- | --- | --- | --- | --- | --- | --- | --- |
| npm install, started 14:42:48 UTC | 14206 | 0 | 2.698 | — | — | — | — |
| Baseline, 14:44:13 UTC | 27440 | 0 | 24.381 | 9.960 | 6.342 | 19.095 | 6.73 |
| Fixed attempt 1, 14:47:26 UTC | 41936 | 1 | 12.497 | 4.491 | 0.060 | 7.051 | 4.59375 |
| Focused existing 19 cases/3 files | 42484 | 0 | 6.271 | — | — | — | 5.19* |
| Fixed attempt 2, 14:48:23 UTC | 43626 | 0 | 80.073 | 36.633 | 36.595 | 74.513 | 7.1455 |
| Review, 28 cases/5 files | 45830 | 0 | 21.552 | — | — | — | 20.77* |
| Knip | 55683 | 0 | 2.943 | — | — | — | 20.77* |
| Read-only fresh-context recovery | 73154 | 1 | 7.889 | 1.362 | — | 2.7 rounded | 14.35 |
| Mobile log proof attempt 1 | 75414 | 1 | 32.399 | 25.194 | 0.041 | 27.117 | 7.3618 |
| Mobile log proof attempt 2 | 77324 | 0 | 14.488 | 7.935 | 0.041 | 9.252 | 9.0728 |

`*` denotes an adjacent host-load observation, not a per-command measurement. Exact runtime JSONs and raw logs in the implementation scratch are authoritative. Wrapper minus runner total includes Python/CLI overhead and is not a pure queue measure.

Fixed attempt 1 failed a task-script assertion that rounded transparent bounding-box corners must hit a button. Its center and previously covered right edge already hit Cancel. The correction samples the actual interior; original failure and source freeze are retained. The accepted fixed attempt's asynchronous durable-row predicate yielded a null payload. The fresh read-only recovery found no `records` object store in its isolated context and exited with NotFoundError; it cannot recover the closed accepted context. The first mobile durable-log assertion used `answer` where the schema defines `value`; the corrected script exports raw rows before assertion, then checks `value`. These are QA harness errors, not product defects. All failed exits remain in the record.

Normal native cleanup closed browser contexts, drained RPCs, closed SDK transport, and stopped each owned server before releasing its lease. Server groups 28799, 41948, 52316, 73169, 75426 and 77336 served port 5174 and reported it free after stop. Final audit found all 10 recorded command PIDs and all six server groups absent. No peer process, marker or profile was accessed. Source changes are 11 additions and two deletions, with no new tests or test entrypoints.
