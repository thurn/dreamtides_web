# hv-umm2.430 measurements

Base: 42a4862527815633492db2034384edb7fe29a691. The implementation and diagnostics run in the owned inventory-exported-capabilities worktree. All raw files named here are under `/Users/dthurn/dreamtides_web/artifacts/qa/hv-umm2.430`.

## Observable capability model

The 47 DSL descriptors name 16 dedicated callable builders and 31 exported type forms. A single TypeScript model resolves actual exports, aliases and type-only reexports without evaluating module code. Registered union members are identified by their semantic literal, independently of representation discriminator field names. Explicit semantic options remain required; play-from-void additionally requires the option type to admit the literal void. Broad builders cannot substitute for a missing registered option. Unknown/unresolved/never types, private declarations, noncallable values, missing modules/exports and never-valued options fail the resolver.

`current-descriptor-map.json` captures all 47 actual declaration entries. The ignored `export-map-probe.ts` invokes the exported resolver with those modules; `export-map-results.json` records 30 present and 17 pending descriptors. The pending set includes the absent atEndOfTurn export. This is observational current-table evidence, not a production-data CI assertion. Synthetic tests cover all seven descriptor shapes, aliases/inheritance, irrelevant field rename/reformat invariance, missing exports, wrong semantic option values and optional-form alternatives.

Primitive-file, extension-regex, prompt and journey classifications retain their existing detection behavior. Generic builder existence uses callable export resolution. The eager resolver has no engine-state or runtime presentation effects. No configuration, runner or dependency changes are required.

## Baseline and exhaustive differences

`before-cli-check.log` records the unchanged tracked projection failing --check. `before-cli-regenerate.log` and `inventory-before-current-generator.json` capture the unchanged generator on the actual base; original `inventory-before.json` bytes were restored identically in finally. `before-provenance.json` records source 22635f59b8d909692fc8a9ab82349a5719cfcbd0631fabbe81079cd8bc007b4d, tracked inventory d022ab7e32d4f4dceb6fc6fe73cebbb59d5ee82a185f207c255a06d76355fa31, refreshed old inventory 597809c4d626f37768a5a12118e31326c65511cc6342198cc76f24827c411281. The old-generator invocation took 5.22 s. Inherited staleness is chooseSubtype false→true; it is distinct from this resolver repair.

The resolver-driven existence differences are exactly:

| Capability | Old current | New current | Public authoring evidence |
| --- | --- | --- | --- |
| randomSelection | false | true | builders.randomIn callable export |
| whenDissolvedTrigger | false | true | triggers.whenDissolved callable export |
| firstTimeEachTurn | false | true | TriggeredAbility.oncePerTurn option |
| typeRemap | false | true | DeckMods.typeChange option |

`comparison.json` compares the normal public projection: 160 other used capabilities unchanged, no added/removed names. All 1209 entity fields apart from requiredPrimitives/routing are identical against the refreshed old generator: identities, catalog data, statuses, tags, kind, family and weights are preserved. 41 required-primitives partitions and 358 routing entries change; the planning projection has 225→224 beads. Prompt existence/usage stays identical; first-bead references may follow projection renumbering. Descriptor module/metadata and derived planning Areas identify their actual authoring exports. Filed native UUID Entities, Areas and graph remain authoritative; no native scope is refiled.

To include 25 unused capability entries, the existing public CLI was observed with only its output usage filter temporarily omitted for both source versions. This is a diagnostic output variant, not the committed CLI. `before-all-inventory.json`, `after-all-inventory.json` and `all-capability-provenance.json` record all 189 entries: 185 unchanged plus the same four differences. Old/new diagnostic invocations took 0.954 s/1.663 s. Source and generated inventory were restored byte-identically in finally. No probe, planner or engine source was changed for that diagnostic.

`final-cli-regenerate.log` and `final-cli-check.log` both exit 0 (1.772 s/1.701 s); `inventory-after.json` is the committed regenerated projection. The ignored evidence manifest records full source/artifact hashes. Generator SHA 8fe793360277cf1ce4e35dde8fccad298c7ee9e0db39b1d27528a8b84a0d0bac and inventory SHA d8d180d61070481f1d5465e5007a4900cc8e6d18ad779c0e104188c47007efd6 are identical before and after the diagnostic restoration.

## Verification and test accounting

The existing test entrypoint has six added synthetic cases (8→14), 76 added lines, 0 new files and 0 jsdom files. There are 0 new plain contract/scenario modules. `focused.log` and `focused-final.log` preserve both passing 14-case runs. Focused-final test execution is 3.5 s with 3.00 s Vitest duration; prepare and restoration are separate wrapper steps. Required review validates related tests, main/node typechecks, lint, import cycles and friction schema. Required Knip checks unused declarations. First green review passes 14/14 related cases and all static checks; its observed command wall is 8.937 s (test-related 7.3 s). First green Knip passes in 2.502 s (unused check 0.9 s). The earlier review/Knip also pass, with observed walls 12.573 s/3.987 s. Wrapper walls span log-file creation through final output, including prepare/asset restoration. Review-start load is 7.11474609375. Focused-final wrapper wall is 5.28 s. No step is a performance claim.

The seven-shape representation test also covers literal-constrained options. Its final extension changes only synthetic assertions; final review collects all 14 cases. Negative controls are supplied exported-module contracts with missing callable/form/option/value inputs, not fabricated absent production APIs or regex mirrors. No full suite is warranted: this change is local inventory tooling, with no test infrastructure, repository configuration or cross-cutting architecture change. No browser, fuzz, lease, dev server or heavy-lock job is required.

## Collateral observation and runtime ledger

The parent-owned 409 public probe is retained as `409-review-banish-probe.ts`, `.json` and `409-review-banish-provenance.json`. It records a supported sibling filtered-top banish knowledge leak, outside 430 scope and tracked by hv-umm2.433 (shared proof work is hv-umm2.432). Probe process 35246 exited 0 and the parent verified interpreter/knowledge/banish/drawMatching bytes equal exact reviewed 409 source 72477a4a1fae93699834e092ea534bad1dbaa7d7. The source/probe hashes are recorded in that provenance and the evidence manifest; this bead changes none of those engine files. Parent review 78136 exited 0 and its snapshot/provider are settled.

All owned install, CLI/probe and validation commands exit before commit. No browser context, lease, server, background writer or persistent child is owned. The dependency advisory and initial stale-check observations are recorded in the bead's pre-existing file. No mandatory implementation work remains beyond parent-owned delivery and independent review of the frozen source.

## First green source stamps

- scripts/content-inventory.ts: `8fe793360277cf1ce4e35dde8fccad298c7ee9e0db39b1d27528a8b84a0d0bac`.
- scripts/content-inventory.test.ts: `cc39e084b6b837ad5474927d745efe39f5e502b9d0a95c7ae31484bdc79f4d35`.
- docs/plan/evidence/content-inventory.json: `d8d180d61070481f1d5465e5007a4900cc8e6d18ad779c0e104188c47007efd6`.

`first-green-evidence-manifest.json` SHA: `16c204c50768a316da513cfd69e33086c25064cf5571eb3476233a935dfbc85a`. It includes every raw artifact hash, including both collateral probe inputs and outputs.

## Pre-freeze unusable-form correction

The exported synthetic alias `Pending=never` exercises the public resolver without member/option constraints. On the first green generator SHA 8fe793360277cf1ce4e35dde8fccad298c7ee9e0db39b1d27528a8b84a0d0bac it incorrectly resolves true. `never-form-negative.log` retains the concrete 1-fail/13-pass result, and `never-form-negative-provenance.json` records exact source/test hashes. The correction rejects Never alongside Any/Unknown. It adds one assertion to the existing case, preserving 14 cases; the test-file delta is 76 lines.

`never-form-focused.log` passes 14/14. `unconstrained-forms-probe.ts` and `unconstrained-forms-results.json` observe current FunctionalZone and ZoneCardSpec: neither is never, unknown or any. These are the two unconstrained real descriptor forms, not a production-data CI gate. `never-form-cli-check.log` passes in 1.87 s; `never-form-cli-provenance.json` verifies the exact generated inventory bytes remain identical (SHA d8d180d61070481f1d5465e5007a4900cc8e6d18ad779c0e104188c47007efd6). Therefore the earlier exhaustive existence/projection comparison remains valid; no broad regeneration is needed. First green logs and manifest are preserved under their original names, including `first-green-evidence-manifest.json`. This correction adds no new runtime or infrastructure scope.

## Amended source and checks

Final corrected focused checks pass 14/14 with an observed wrapper wall of 6.442 s. Final corrected review passes all 14 related cases and static checks in 10.636 s; final Knip passes in 2.736 s. Review-start load is 12.7724609375. The prior negative is a pre-freeze implementation diagnostic, not an original-base defect. Readability edits change evidence prose only. All owned commands have exited; no persistent processes remain.

- scripts/content-inventory.ts: `0a8bd1e1fe9920cbc80fd5a446a92fcc4cfb787c62ba070457307964285fe71b`.
- scripts/content-inventory.test.ts: `d958b297ea697173db22ebdbd7ad32bc3bd589f9697c335b476b517f5242ca4b`.
- docs/plan/evidence/content-inventory.json: `d8d180d61070481f1d5465e5007a4900cc8e6d18ad779c0e104188c47007efd6`.

Final `evidence-manifest.json` SHA: `70aa1c6d1ca5436c8ad280c7cef8a190d79fa76fa4f127fa3754a383431996e4`. Prior raw results and the first green manifest remain available with their original names.
