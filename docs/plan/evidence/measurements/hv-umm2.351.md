# hv-umm2.351 release repair evidence

The executor implements this prerequisite directly. Ownership and implementation start: 2026-10-11 08:44:15 UTC. Base: `79aceda652dad4febf6e94a6cf4d4ba5b66a0aab`. The final gross ownership-to-commit interval is recorded in the friction file.

## Cause and identity contract

The public prompt-lab definitions contain two cards with UUID `5e5e5e5e-0000-4000-8000-00000000030b`: `LAB.shuffleInto` and `LAB.choosePlayer`. The catalog's map keeps the later definition. A shuffle fixture consequently reaches a player choice, receives its scripted card-array answer as an illegal numeric choice, and the surface inventory lacks `shuffleInto`.

The linked `.348` integration proof reproduces the same three failures with its adapter correction and with the adapter restored to staging: 2.284s and 1.681s execution, respectively. Both checks used the external heavy lock, and its owned adapter was restored exactly. The retained candidate is terminal failed; `.348` stays claimed at clean integration checkpoint `899a60bac3cf102f025b42850a0ed60a692936c9`, behind this prerequisite.

The choose-player lab fixture uses synthetic namespace slot `0x360`, separate from the compact sequential fixture slots. The public registry contract requires a distinct UUID for each card definition before catalog construction. It measures identities, with no name-based keys, fixed card-count expectation, production content or UI-copy assertion. Fixture mechanics, prompt roles, ordinary runtime catalogs and player presentation are preserved.

## Reproduction and validation

One additional case in the existing tooling suite fails against the duplicate registry: 177 distinct IDs for 178 definitions. It passes after the identity correction, and the three affected suites pass 94 cases. This check protects registry uniqueness independently of any one fixture's answer recipe. Test delta is one case, five lines, zero entrypoint files and zero jsdom files.

All dependency preparation and checks use `lockf -k /Users/dthurn/dreamtides_web/artifacts/heavy.lock` and `JOURNEY_TEST_WORKERS=2`. Queue, execution and one-minute host load are separate. Exact check results are recorded below. Full review is required by the native CI-repair acceptance. Browser QA is proportional to runtime presentation changes; this repair changes a synthetic fixture identity and its contract only.

No browser, server, storage writer, review provider or implementation subagent is active for this bead. The root owns all native candidate, release-fix authorization, worktree updates and delivery. `.348` acceptance resumes in its same worktree after this repair lands. `.350` is the separate inherited-binding review follow-up.

## Aggregate outcome and certified fix-forward sequencing

Full review executes 216 files and 2,886 cases: 2,885 pass and one existing shuffle rollback contract fails because the new published-knowledge recovery retains `i3` at its committed deck position. The known issue belongs to peer repair `hv-umm2.353`, whose prerequisite is this fixture repair. The current lab/presentation failures pass. Full execution is 48.404s after 49.219s heavy queue, at one-minute load 3.742; the result is a failure, not a full pass.

Same-task justiciar recovery records the original agent-authored local aggregate-pass requirement and its replacement in native notes: own affected contracts/review/knip and the certified voting gate must pass; the known `.353` aggregate failure is tracked through fix-forward sequencing. The project's full release and phase-gate criteria remain required. There is no voting bypass, unchanged release rerun, deferred bead, source borrowing or peer prerequisite change. The attempted reverse dependency was rejected as a cycle without a native write.

| Check | Heavy queue s | Execution s | One-minute load | Result |
| --- | ---: | ---: | ---: | --- |
| uniqueness-red | 0.022 | 2.574 | 19.976 | expected duplicate-ID failure |
| focused | 0.021 | 4.071 | 7.770 | pass |
| review | 0.022 | 22.163 | 3.308 | pass |
| knip | 0.020 | 2.736 | 3.146 | pass |
| full | 49.219 | 48.404 | 3.742 | known baseline failure assigned to .353 |
