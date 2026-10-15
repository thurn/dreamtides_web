# hv-umm2.241 pre-existing observations

- `scripts/tournament/contracts.test.ts:153–166`: the real-worker resume/settlement contract exceeded its existing 15,000 ms timeout during the first review (9,128 other tests passed), then during its isolated entrypoint run (10 other tests passed). Its fixture uses an explicit synthetic catalog with no batch Dreamsigns. The raw `241-review.log` and `241-tournament-isolation.log` retain the actual failure and measured load. Canonical repair `hv-umm2.740` owns source-first investigation and a bounded lifecycle-contract fix. It is independently ready and does not change this batch's acceptance or prerequisites. This content partition has no tournament write authority. The single aggregate retry after correction of this bead's unused type import passed all 9,129 tests. This is a retained intermittent timeout observation, with no tournament repair or proven causal attribution.

- Parent dependency setup reported 17 dependency advisories (9 moderate, 7 high, 1 critical) in `241-install.log`. This bead makes no dependency or configuration changes.

- Mushroom's acquisition-identity reservation issue is separately filed as `hv-umm2.738`; its delivered Draft choice-count descriptor and this battle energy composition are independently usable. The canonical journey and battle scopes are preserved.
