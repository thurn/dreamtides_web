# Phase 5 retrospective — hv-umm2.672

The audit covers the 26 uncovered Phase 5 friction records in the census at `2026-10-14T03:40:00.826Z`, anchored to `406d79b7beebf5f37e4177e92cfaf99fe6a9f5b3`. A fresh read-only sage inspected all 55 frozen inputs, the 26 native bead snapshots, metrics, trigger dispositions, review and QA records, and targeted delivery evidence. The parent independently matched the input hashes, coverage, candidate statistics and confirmed finding. Later landings are outside this coverage.

## Confirmed improvement

`hv-umm2.673` owns the bounded repair of the normal Claude review recipe in `docs/plan/workflow.md`. The recipe enables Read/Grep/Glob with `dontAsk` while its explicit grants list only Bash Git patterns. The first normal reviews of `hv-umm2.232` and `.658` returned limited or absent review because required reads were denied. Both sessions completed the required reviews with explicit read-only grants and required input directories. The bounded repair follows this retrospective and precedes gate `.46`; it preserves cold context, normal model routing, narrow nonmutating Git permissions and user-configured denies. Its acceptance checks actual required reads and diff access. It changes no global settings or other repository.

This is a verified recurrence with two witnesses, rather than a new three-bead tag trigger. Project-wide dedupe inspected 985 native rows including closed work; a fresh filing check found no matching canonical duty. The original limited `.232` review lasted 211.94 s; its corrected full review took 120.260 s. Different workloads prevent a controlled speed comparison. The first denied `.658` duration is unknown. Required scope completion is the improvement's observable outcome.

## Measurements and limits

| Observation | Population | Result |
| --- | --- | --- |
| Native candidate outcomes | 36 targeted status records | 26 promoted and cleaned; 7 merge-conflicts; 3 canceled |
| Gate buildset elapsed | 26 promoted candidates | Median 106.511 s; range 17.238–132.835 s |
| Gate step durations summed | Same 26 candidates | Median 106.3545 s; range 17.161–132.721 s |
| Passing release step durations summed | 17 observed recent runs | Median 292.416 s; range 267.750–344.436 s |
| Default 200-game fuzz step | Same observed passing releases | Median 163.215 s; range 149.204–186.415 s |
| Release failures | Bounded recent history | Three fuzz timeouts around 1,800 s |

The targeted candidate set proves a promoted candidate for each covered bead, but it is not a complete inventory of every historical attempt. An additional exact `.652` lookup augments the initial 35-record/25-promoted population; those earlier statistics remain qualified in the audit custody. The 500-event Tollgate history spans sequence 26203–26702, approximately 00:11–03:39 UTC on October 14, and does not cover the entire retrospective interval. Missing history is unknown, not zero. Native `.658` was in progress in the frozen bead snapshot; its later targeted candidate status proves promotion and cleanup, not native closure at the census.

Broker loads are unknown. The monitored gate and release budgets are exceeded in this sample, without proof of a controlled regression or three consecutive comparable-load overruns. Ordinary review is scope-dependent: observed documentation runs take 0.181–0.338 s, small journey/UI repairs 15.396–28.543 s, and broad engine/content checks 50.919–76.018 s. Some host-load fields sample completion or evidence preparation rather than command start; their normalization records remain authoritative. Multi-file focused checks are not compared to the single-file 10 s budget.

The direct configured-glob census reports 380 test entrypoints and 83 jsdom entrypoints as informational counts. Two files above roughly 500 lines retain the documented `.572`/`.573` exceptions. The raw covered test delta of +10 files/+3,297 lines includes plain contract support and is not a direct Vitest entrypoint delta. This audit performs no fresh full-suite or controlled low-load budget certification. Existing `.526` performance evidence and gate `.46` retain their roles; no duplicate performance/test-cut task or budget revision is justified by this evidence.

## Dispositions and coverage

Canonical `.654` supplies the human-authorized finite event-copy source repair; `hv-wmtb` retains the exact seed-164 and default unweighted-200 verification join. The release snapshot is pending with lag 3, no pause and no hold. A timeout is not a completed throughput measurement. Intentional release-lag waiting is not a reason to label unrelated candidates as release fixes.

`.232` retains source-qualified full/browser evidence at `731c8054` and weighted fuzz at `6a231b16`; its final `59d0c3a9` checks and review are separately recorded. Four Sol findings are repaired and its verified Claude P3 is resolved by `.657`. The first limited Claude review is not full-review proof. `.657` browser QA is a synthetic public-formatter diagnostic with four cases and empty Caps, without an authored payment/gameplay, geometry or persisted-game-log claim.

The `.235` unadmitted weighted run, journey-only zero-game runs, QA recipe/fixture failures, native conflict parking/update recoveries, provider settlement qualifications and waiting windows remain individually qualified. Additive conflicts use native integration recovery; filename-only serialization tightening is not supported. Existing browser `.308`/`.428`, claim `.651`, parallelism `hv-z9d1`/`.658`, and performance `.526` duties supply the relevant canonical dispositions. All fired census triggers are dispositioned; no new trigger row is required.

| Covered bead | Native status at census | Targeted promoted candidate |
| --- | --- | --- |
| hv-8ddd | closed | 01a137df-b5e1-74c0-973c-75df6fb79887 |
| hv-96xy | closed | 01a137d3-124f-7393-9c50-25743ebcc676 |
| hv-jln7 | closed | 01a137dc-2074-7590-a31c-2e0371e36d3f |
| hv-t55j | closed | 01a13849-3770-7892-b5dc-c9bab25b2b96 |
| hv-umm2.150 | closed | 01a137d6-ba07-7d01-a663-b53099d0f61c |
| hv-umm2.232 | closed | 01a13869-ffbb-7333-a857-084825ca1ee2 |
| hv-umm2.233 | closed | 01a137ad-b577-70e1-913c-f19ecd4b96f1 |
| hv-umm2.235 | closed | 01a137d8-7266-7011-81bf-69a496e4fdb1 |
| hv-umm2.264 | closed | 01a1372b-5db8-7ff0-9142-4dea913c3495 |
| hv-umm2.514 | closed | 01a1379a-fb34-7481-97c7-b726e35f260c |
| hv-umm2.583 | closed | 01a137a9-86fb-7ef1-b64c-90e58be29599 |
| hv-umm2.588 | closed | 01a137bf-509b-71b2-8ed3-5b562319378c |
| hv-umm2.649 | closed | 01a136d8-b817-7cc3-b970-2ba7424bcd3c |
| hv-umm2.650 | closed | 01a136d3-2728-7d10-9c25-7cf54925e153 |
| hv-umm2.651 | closed | 01a136eb-d827-7350-9ff7-3ecef4d8f8c4 |
| hv-umm2.652 | closed | 01a13791-4aad-7302-9b2f-be1806cfee79 |
| hv-umm2.653 | closed | 01a13791-8123-7c00-b397-7144a6017dfc |
| hv-umm2.654 | closed | 01a1384e-14c8-73f2-b2d5-ee31de59d17a |
| hv-umm2.655 | closed | 01a137a4-5afc-7ec1-a778-7f8c30942105 |
| hv-umm2.656 | closed | 01a137b8-9047-7b31-a866-65317d09ded6 |
| hv-umm2.657 | closed | 01a13878-d40e-73a2-89b1-ec64c657e66b |
| hv-umm2.658 | in_progress | 01a13849-0d90-7292-ae7f-ff365acd6a0b |
| hv-umm2.668 | closed | 01a13879-6f93-7e63-87dd-dc5b0f3f6588 |
| hv-umm2.97 | closed | 01a137c9-033e-7a33-a733-54190544249b |
| hv-wmtb | closed | 01a1385d-8a82-7f80-9a31-efd26d265f70 |
| hv-z9d1 | closed | 01a13788-6fb6-78d0-8b12-c641d4046e6a |

Unknown quantities include model sampling/productive editing CPU, complete historical prerequisite/queue/cap waits, broker loads, controlled current suite timing, and pure heavy-lock wait when only outer/inner clocks exist. Overlapping approval/release waits are not summed. The full read-only report, per-record qualifications, candidate and source snapshots, input hashes and query custody are retained in the ignored `artifacts/qa/hv-umm2.672/audit/` directory. The compact companion JSON records the exact populations and source anchors.
