# Task 6 Report: Autonomous Compilation, Runtime, GPU, and Build Gate

## Status

Implementation report. Authoritative acceptance comes only from two successful no-argument
`verify-tango-mvp.sh` runs started from the same clean committed HEAD. The retained
`cumulus/Artifacts/TangoMvpVerification/summary.json` is the machine-readable source of truth;
the historical measurements below do not substitute for clean-HEAD evidence.

Post-review hardening adds:

- start/end clean-tree and exact-HEAD provenance checks;
- exact metric, operator, threshold, verdict, capture-set, and decodable 512x288 PNG validation;
- negative controls for malformed or forged evidence;
- protected deletion and broader runtime allocation/field/import scope checks; and
- outer GPU state restoration with a forced-failure PlayMode regression.

Before the final committed runs, all 26 provenance/evidence/scope negative controls and the
two-test focused GPU PlayMode fixture passed.

## RED Evidence

The metric slice was introduced before its support assembly and implementation.

Command:

`run_unity_stage task6-metric-tests-red nographics -runTests -testPlatform EditMode -testFilter TangoMvp.Tests.TangoImageMetricsTests ...`

Observed result:

- Unity process exit: 1
- Harness result: rejected
- Compiler evidence:
  - `CS0234`: `TangoMvp.Tests.Support` did not exist
  - `CS0246`: `TangoComparison` did not exist
- Fresh passing NUnit evidence: absent

The first complete GPU run then produced a valid failing NUnit document, fresh `render-metrics.json`, and 16 PNG captures. It exposed sound rendering failures rather than missing evidence:

- `liveBackdropDelta.LiveGlassA = 0`
- `blurEdgeEnergyRatioMinimum = 0`
- `transmissionLightDeltaRatio = 5.219605`
- `frameShadowDelta = 0`
- bright/dark label contrast below 4.5

Those failures led to phase selection based on named scene regions, an unlit captured backdrop, a dedicated lit shadow receiver, outlined text, corrected shadow-caster selection, and a readable solid-chrome response. Thresholds were not weakened.

The orchestrator also exposed and rejected two integration defects during development:

- Full EditMode rejected an incorrect shadow/light geometry change; the inherited 52° authored light contract was restored and the bottom solid rail became the tested caster.
- Full PlayMode rejected lab scene leakage into a later virtual-mouse test; the GPU fixture now destroys lab roots and resets diagnostics in teardown.
- A shell `if`/errexit interaction initially allowed a composite stage to continue after Unity exit 2. Every composite substage now returns failures explicitly.

## GREEN Evidence

### Image metrics

Focused metrics fixture passed after implementation, including:

- constant colors, hard and softened edges;
- identical and different frames;
- explicit sRGB-to-linear conversion;
- known percentile contrast and label/backdrop contrast;
- matching/inverted correlation;
- empty and out-of-bounds regions;
- NaN viewport input;
- mismatched dimensions;
- PNG region encoding;
- inside/outside flips for every committed threshold;
- non-finite acceptance evidence serialization.

### Final GPU metric table

| Metric | Measured | Acceptance | Result |
| --- | ---: | --- | --- |
| `liveBackdropDelta.LiveGlassA` | 0.298887134 | `>= 0.015` | PASS |
| `liveBackdropDelta.LiveGlassB` | 0.06279289 | `>= 0.015` | PASS |
| `blurEdgeEnergyRatioMaximum` | 0.400247484 | `<= 0.65` | PASS |
| `blurEdgeEnergyRatioMinimum` | 0.400247484 | `>= 0.05` | PASS |
| `sharedGraphRecords.bothPanesEnabled` | 1 | `== 1` | PASS |
| `horizontalPasses.bothPanesEnabled` | 1 | `== 1` | PASS |
| `verticalPasses.bothPanesEnabled` | 1 | `== 1` | PASS |
| `sharedGraphRecords.mainPaneDisabled` | 1 | `== 1` | PASS |
| `horizontalPasses.mainPaneDisabled` | 1 | `== 1` | PASS |
| `verticalPasses.mainPaneDisabled` | 1 | `== 1` | PASS |
| `sharedGraphRecords.independentPaneDisabled` | 1 | `== 1` | PASS |
| `horizontalPasses.independentPaneDisabled` | 1 | `== 1` | PASS |
| `verticalPasses.independentPaneDisabled` | 1 | `== 1` | PASS |
| `sharedGraphRecords.onGlassButtonDisabled` | 1 | `== 1` | PASS |
| `horizontalPasses.onGlassButtonDisabled` | 1 | `== 1` | PASS |
| `verticalPasses.onGlassButtonDisabled` | 1 | `== 1` | PASS |
| `onGlassAdditionalPasses` | 0 | `== 0` | PASS |
| `onGlassBackdropDelta` | 0.129604518 | `>= 0.005` | PASS |
| `onGlassBackdropCorrelation` | 1 | `>= 0.5` | PASS |
| `bevelLightDelta` | 0.065852046 | `>= 0.02` | PASS |
| `transmissionLightDeltaRatio` | 0 | `<= 0.25` | PASS |
| `frameShadowDelta` | 0.0581966154 | `>= 0.02` | PASS |
| `labelContrast.bright` | 19.6117668 | `>= 4.5` | PASS |
| `labelContrast.gold` | 8.741981 | `>= 4.5` | PASS |
| `labelContrast.dark` | 19.5699 | `>= 4.5` | PASS |
| `fallbackInteriorLuminanceMinimum` | 0.7512884 | `>= 0.02` | PASS |
| `fallbackInteriorLuminanceMaximum` | 0.7512884 | `<= 0.8` | PASS |

Both final-code runs reported the same raw values and verdicts for all 27 records.

### Final second-run stages

| Stage | Duration (s) | Result |
| --- | ---: | --- |
| shell harness self-tests | 1.467 | PASS |
| clean Unity import | 28.145 | PASS |
| deterministic builder twice | 11.622 | PASS |
| full EditMode tests | 11.638 | PASS |
| full graphics PlayMode tests | 12.384 | PASS |
| shader inspection and macOS build | 35.474 | PASS |
| repository lint/typecheck/tests | 32.331 | PASS |
| static scope guard | 0.080 | PASS |

The final evidence-format run pair also asserted exact equality of the embedded 13-entry asset-hash manifests.

## Negative Controls

Shell self-tests passed 31 validator checks. They prove rejection of:

- synthetic compiler and shader errors;
- build failure exceptions;
- nonzero/missing/malformed process evidence;
- stale, absent, malformed, failed, or internally inconsistent NUnit XML;
- missing or near-match completion markers;
- NUnit output outside the named stage directory.

Scope-guard self-tests passed 6 checks. They prove acceptance of an allowed runtime fixture and rejection with an exact diagnostic of:

- `Mobile_Renderer.asset` mutation;
- runtime `new Material(...)`;
- a per-pane camera field;
- UI Toolkit imports;
- a missing Unity `.meta` partner.

The acceptance fixture constructs values immediately inside and outside every threshold. The controlled outside values return `passed: false`, including a named non-finite synthetic metric that still serializes complete evidence.

## Files

Verification infrastructure:

- `cumulus/scripts/verify-tango-mvp.sh`
- `cumulus/scripts/tango-scope-guard.py`
- `cumulus/scripts/test-tango-scope-guard.sh`
- `cumulus/scripts/test-unity-run.sh`
- `cumulus/Assets/TangoMvp/Editor/TangoMvpBatchVerification.cs`

Metric/GPU support and tests:

- `cumulus/Assets/TangoMvp/Tests/Support/TangoMvp.TestSupport.asmdef`
- `cumulus/Assets/TangoMvp/Tests/Support/TangoImageMetrics.cs`
- `cumulus/Assets/TangoMvp/Tests/Support/TangoGpuAcceptance.cs`
- `cumulus/Assets/TangoMvp/Tests/EditMode/TangoImageMetricsTests.cs`
- `cumulus/Assets/TangoMvp/Tests/PlayMode/TangoGlassGpuTests.cs`
- EditMode and PlayMode assembly definitions

Rendering regressions fixed under GPU evidence:

- builder, scene, prefab, and solid-chrome material;
- unlit backdrop, lit shadow receiver, and text-outline materials;
- `TangoTextOutline.shader`;
- separable blur hidden shader name and its existing test reference.

All new Unity files and folders have committed `.meta` partners. Artifacts and the exact macOS player remain ignored under the pre-existing `.gitignore` rules.

## Self-review

- All Unity processes used `run_unity_stage`; no direct Unity invocation was used.
- Renderer-feature active state, shadow-caster state, object active state, camera target, and render target are restored in `finally`.
- The GPU test writes all measured records before its aggregate assertion and writes fresh JSON from teardown if setup fails early.
- All GPU regions derive from `TangoVerificationMarkers`; no hard-coded pixel regions are used.
- Captures use a 512×288 ARGB32 sRGB render target, with explicit sRGB-to-linear metric conversion and no golden-pixel equality.
- The build verifier writes reports before exits 21/22 and builds exactly `Builds/TangoMvpVerification/CumulusTangoMvp.app`.
- The summary parser fails closed on malformed or incomplete NUnit, JSON, PNG, shader, build, GPU identity, stage, and asset-hash evidence.
- The exit trap writes a failed summary identifying the active stage, including failures during artifact setup.
- The scope guard scans both committed-branch differences and untracked files and has mechanically matched negative fixtures.
- Final shell syntax checks, Python compilation, and the production scope guard passed. Unity-authored YAML retains Unity's canonical empty scalar serialization.

## Concerns

- Unity 6 writes incidental serialization/prefilter state into unrelated tracked project-setting assets during clean import and standalone build. Those changes were excluded from the implementation and cleaned after the final evidence run; the gate evidence itself is unaffected.
- The successful standalone build reports one warning and zero errors. Unity's build summary does not expose that warning as a shader error; the separate exact shader report contains zero messages/errors.
- GPU acceptance was measured on Metal / Apple M5 Max. The tests are relational and avoid golden pixels, but a materially different graphics backend may produce different raw values and must still clear the same committed thresholds.
