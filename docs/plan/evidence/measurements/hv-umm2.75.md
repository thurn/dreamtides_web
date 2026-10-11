# hv-umm2.75 implementation evidence

- Base: `ca3b8a628c753cd4688c3b81594b63859cd651fb`. Native scope: zero catalog entities; one new primitive; one plain synthetic contract module; nine new cases. No scenario module, entity authoring, content fuzz, sweep, or judged-content verdict.
- API: `abandon(chooser: PlayerRef = "you", predicate: Omit<CharacterSelector, "controller"> = {})`. The actual chooser selects one controlled character during resolution. The choice is public and does not target. Empty/unmatched eligibility returns quietly. The shared `abandonCharacter` rule owns movement and replacements.
- Rules decision: `RD-hv-umm2.75-1`; exact prototype base and read-only Rust reference OID are recorded there.
- Additive registration: primitive export/getter; `abandon` prompt role; Greedy loss ranking; existing UI copy; one hand-play prompt-lab fixture; exhaustive role expectation. Generic prompt-host routing and mechanics remain source-owned by their existing modules.

## Validation

| Command | Exit | Wall seconds | Host load (1 min) |
| --- | ---: | ---: | ---: |
| `npm test -- src/engine/effects/primitives/contracts.test.ts` | 0 | 2.805 | 4.69 |
| `npm test -- src/engine/testing/tooling.test.ts src/screens/cumulus_adapters/engine-battle-view-model.test.ts src/engine/content-gates.test.ts` | 0 | 2.714 | 4.64 |
| `npm run typecheck` | 0 | 2.389 | 4.64 |
| `npm run review` | 0 | 34.127 | 4.67 |
| `npm run knip` | 0 | 3.325 | 4.69 |
| Native browser runner, desktop/mobile | 0 | 23.511 | 4.18 |

- Every test/check uses two Vitest workers. Commands run outside the heavy slot. `review` passed 158 related files / 2,430 cases; the explicit primitive runner passed 312 cases, and lab/view-model/coverage passed 79 cases. No `review:full` or fuzz command ran.
- Required post-prepare fallout compile listing:
  - `npx tsc --noEmit --pretty false -p tsconfig.json`: exit 0, 6.919 s, diagnostic files `[]`.
  - `npx tsc --noEmit --pretty false -p tsconfig.node.json`: exit 0, 2.589 s, diagnostic files `[]`.
- Mechanical fallout outside additive registration hubs: none. New `Effect` union derives from exports; existing `PromptRole` importers typecheck without further edits.
- Authoring corrections: first contract visibility assertion confused the played public stack source with the hidden hand; a resumed-event suffix was compared to a complete state transition; borrowed fixture assigned a readonly owner directly. Assertions/fixture construction were corrected. These were test authoring mistakes, not product regressions.
- Missing-API baseline is a new exported-form/import gap. The contracts do not claim an existing abandonment-mechanics bug.

## Failure and recovery contracts

| Path | Public contract |
| --- | --- |
| Error after movement / partial writes | Synthetic throw after selection preserves committed state, zero trigger awards, no new published events, cleared in-flight record |
| Reload/restart during choice | JSON-serialized slice reconstructs the identical prompt and produces identical committed result |
| Invalid/stale/foreign input | Empty, too many, duplicate, noncandidate, wrong side, and old-attempt answers bounce without changing committed state |
| Concurrent actors / duplicate acceptance | Top-level action bounces while choice is in flight; resolution cannot cancel; valid answer commits once and repeated answer finds no pending prompt |
| Empty/unmatched choice | No prompt, no abandonment/dissolve, no false target-failure event, trailing score effect succeeds |
| Replacement/ownership boundaries | Both chooser sides, duplicate printing UUIDs distinguished by instance ID, source/another and X, borrowed ownership, Veil/untargetability, created/reclaimed replacements and dissolved/abandoned triggers |

## Mutation proof

Five temporary changes to the new primitive each failed an observable contract (exit 1). All were restored before final validation and browser QA. No mutation machinery is committed.

| Boundary | Failing contract pattern | Exit | Wall seconds |
| --- | --- | ---: | ---: |
| ownership | `physical instance` | 1 | 1.713 |
| non-targetability | `borrowed Veil` | 1 | 1.522 |
| veil | `borrowed Veil` | 1 | 1.506 |
| empty | `empty or unmatched` | 1 | 1.536 |
| announcement | `borrowed Veil` | 1 | 1.531 |

Restored primitive SHA-256: `b257e7c702b1dff324661c7f6c5a951cd22c137dfaf975610f694c58d161b7f7`.

## Interaction QA

- Runner `abandon-interaction.mjs`: PASS, desktop 8.715 s and mobile 6.464 s; browser lease wait 1.449 s; runner total 18.222 s.
- Both passes manually play source `i3` from hand, then choose `i2` from identical-printing candidates `i1` and `i2`. Only `i2` moves to its player owner’s void; `i1` remains in play. Exactly one `abandoned` and one `dissolved` event identify `i2` and side `player` (seq 3, indices 1 and 2). No prompt/in-flight operation or duplicate publication remains.
- Every offered candidate is a public board card; opponent hand/deck physical identities are absent from the player DOM. Error/rejection/console-error buffers are empty for both passes and all navigated documents.
- Desktop candidate boxes: 89.5 × 89.5 px. Mobile: 53.859375 × 53.859375 px. Both candidate centres hit their cards. Selected confirmation: 89.328125 × 42 px, centre hit true on both viewports.
- Captures: `abandon-picker-desktop.png` (1440×900), `abandon-picker-mobile.png` (390×844), `abandon-selected-desktop.png` (1440×900), verified with `file` and inspected. These runner captures use CSS pixel scale.
- QA report/server log: `abandon-interaction.result.json`, `abandon-interaction.server.log`. This is prompt interaction evidence, not a content sweep/judged verdict.

## Runtime ownership and provenance

- Browser runner PID 82150 exited 0. Owned strict-port server/process group 82251 on 5174 stopped; its process group has no remaining members. The runner confirms browser close, RPC drain, SDK closure, ownership-record cleanup, and owned server cleanup before releasing the native browser lease. All tool sessions returned terminal exits.
- The runner observed port 5174 free at its cleanup boundary. A later generic listener check observed another listener; it was neither inspected further nor killed. No peer browser context, server, or ownership marker was changed.
- Owned validation child PIDs: 80192, 80324, 80427, 80529, 81595; each awaited to its recorded terminal exit. Mutation subprocesses each awaited to exit 1; setup, compile, script wrappers, and QA wrappers terminated. No owned watcher/server/browser resource is retained.
- No complete pre-QA hash manifest was created. The manifest request arrived after the run. The honest post-QA hashes below were read after cleanup; each source mtime predates final checks and QA, and the primitive hash matches the mutation restoration hash. This does not constitute a cryptographic whole-source pre/post comparison.
- First-install timestamp 2026-10-11T12:04:14.970693+00:00 is the observed lower-bound time anchor for estimated `implementMin` (19.8 minutes). It excludes initial read-only setup and includes design/ACK waits. The exact dispatch time is unavailable.
- Helper has no candidate or queue entry and issued no Hive/Tollgate action. Queue/review/delivery remain the owning session’s responsibility.

| Post-QA path | SHA-256 | Mtime (Unix seconds) |
| --- | --- | ---: |
| `src/engine/effects/primitives/abandon.ts` | `b257e7c702b1dff324661c7f6c5a951cd22c137dfaf975610f694c58d161b7f7` | 1791720940.4601316 |
| `src/engine/effects/primitives/contracts/abandon.contracts.ts` | `bc751f02e24a9df176453d5bb1be7fffb719262231be611cf906fdd0e9591807` | 1791720932.626366 |
| `src/engine/effects/primitives/index.ts` | `d4c4ae28337a3b350fee69b31f462584a85efe760db607f280ca34928ecb31af` | 1791720630.2808857 |
| `src/engine/effects/registry.ts` | `8fb07399f3a2bd0e09502980ac7d220b396473d210063cc10928cbfb117beb57` | 1791720630.2813053 |
| `src/engine/policy/prompts.ts` | `3456cb60c632f8b110d8e8ba470e5ac65ae14f74d20763ba87573e80046bcbb4` | 1791720630.2820163 |
| `src/engine/prompts/types.ts` | `c0cb75d39f6331d1f2e79a42d41ea476f23cf6dfee03bd48754e0a9a330c5e5a` | 1791720630.2817392 |
| `src/engine/testing/prompt-lab.ts` | `50ad45716b981e5fbd1e44aa79d20e5af21472a064f6cfecbc13e784fec4357e` | 1791720660.1907096 |
| `src/runtime/battle-prompt-messages.ts` | `e378e371ae7fc60901951aac5598d3a46dc1a8f5967b8b69f9057e2a04adb091` | 1791720630.2823532 |
| `src/screens/cumulus_adapters/engine-battle-view-model.test.ts` | `bc9b64f94c7648c184aac61a8e096c9b25e6105d3e7697c63be708d6ffee57d6` | 1791720630.2834177 |
| `docs/rules.md` | `23882ede53456599b6b2f67e9fadfed3c87ffde968832d110ba77e953913ddf5` | 1791720630.284238 |
| `docs/plan/engine-design.md` | `8002912c247b622bd94c8927272749de72029bc16b2ee32888f76ef9c70d5004` | 1791720660.2430663 |
| `docs/plan/evidence/rules-decisions/RD-hv-umm2.75-1.md` | `23aee5a183034bc3147872c757fbaead012f14a7e79aa89b884258d0fca8a4ac` | 1791720660.2434607 |

The scratch directory retains raw checks, individual mutations, QA script/log/report metadata, explicit compile results, source manifests, artifact hashes, and final changed-file byte hashes.

Transient initial-install, shell/Python-wrapper, individual mutation-Vitest-child, and native lease-holder PID numbers were not recorded. Their tool sessions/subprocess awaits are terminal, and their lifecycle exits are retained in `runtime-ledger.json`; this records the limit rather than inventing process IDs. Final source manifest and artifact-byte hashes are retained in scratch.
