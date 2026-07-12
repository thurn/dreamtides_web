# Cumulus Tango Glass MVP

## Shop glass demo

Open `Assets/Scenes/TangoShopGlassDemo.unity` for the minimal web-parity study.
It places one centered square of the shared `SceneGlass` material over the
Tumbleleaf Village image used by the web Card Shop. The image uses the same
centered cover crop as the web screen; an orthographic 16:9 camera and a warm,
angled directional light provide a stable view of the blur, rim, and sheen.
The scene intentionally contains no cards, guide, HUD, buttons, labels, or
other interface elements.

The `Tango Glass Panel` object includes a `TangoPanelShadowToggle` component.
Its `Cast Shadow` checkbox controls a rounded shadow-only proxy against the
directional-light-aware backdrop material.

Rebuild it from `Tango MVP > Rebuild Shop Glass Demo`. The builder also exposes
`TangoMvp.Editor.TangoShopGlassDemoBuilder.CaptureBatch` for a deterministic
1920 x 1080 review capture.

## Glass blur architecture

`TangoGlassRendererFeature` records one camera-level blur pyramid before
transparent geometry. Four locally filtered downsample passes reduce the scene
color to one-sixteenth resolution, then three filtered upsample passes
reconstruct a half-resolution texture for every scene-glass pane to share. The
geometric reduction keeps total texture sampling bounded while the pyramid
provides 22 output pixels of continuous low-pass support for the CSS glass
token. Each scale filters adjacent texels, so detailed backgrounds remain
smooth under glass without imposing pane-specific render work.

The renderer publishes the pyramid level count, calibrated support, output
dimensions, and active render-graph mode when it initializes. Per-frame GPU
evidence records four downsample passes, three upsample passes, and one shared
graph record independently of the number of panes and on-glass controls.

## Point-light authoring

`Assets/TangoMvp/Materials/TangoGlassLightingProfile.asset` is the shared editor
surface for `SceneGlass` and `OnGlass` lighting. It exposes edge-reflection and
interior-reflection strength, roughness, light-color response, and a soft HDR
ceiling for each role. It also declares the bounded desktop and mobile
additional-light budgets. Individual panels use the shared material library and
have no lighting overrides.

Open `Assets/Scenes/TangoGlassLab.unity` to inspect a blue point light orbiting
the generated rounded panels. The modeled bevel carries the narrow moving glint;
the face carries the broader colored reflection. The desktop path evaluates at
most four URP additional lights with supported shadows. The mobile shader path
evaluates at most one additional light without sampling its shadow.

From the repository root, an autonomous agent verifies this proof of concept with one command:

```bash
bash cumulus/scripts/verify-tango-mvp.sh
```

Exit `0` is the only passing result. It means every stage below passed and `cumulus/Artifacts/TangoMvpVerification/summary.json` has `"overall": "passed"` for the clean Git commit recorded in `gitCommit`. Any nonzero exit, missing evidence, stale or malformed evidence, dirty working tree, changed `HEAD`, timeout, test failure, shader error, build failure, or failed metric is a failure. Do not infer success from a Unity process exit code or from screenshots alone.

## Prerequisites

- Run on macOS from the root of a clean checkout of this repository. The README command is the supported invocation contract.
- Install the exact Unity editor in `cumulus/ProjectSettings/ProjectVersion.txt` at the Unity Hub path `/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity`. A `UNITY` executable override is accepted only when `UNITY -version` reports that exact version.
- Provide a graphics-capable Metal device for the PlayMode render tests and standalone macOS build. A null graphics device fails the GPU test.
- Install Node dependencies at the repository root with `npm install` when `node_modules` is absent.
- Make `bash`, `python3`, `git`, `shasum`, and the repository's npm toolchain available.
- Keep `master` available locally, or set `TANGO_SCOPE_BASE` to the intended base commit for the static scope comparison.
- Commit every intended input before starting. The authoritative no-argument command has no dirty-tree override.

The gate deletes `cumulus/Library` to force a clean import and replaces the ignored verification directory. Each Unity process has a 1,800-second timeout. On timeout, the harness sends `SIGTERM` to the entire process group, waits 10 seconds, then sends `SIGKILL`; timeout evidence is rejected and the gate exits nonzero.

`bash cumulus/scripts/verify-tango-mvp.sh --self-test` runs only the negative-control suites. It is useful while changing the harness, but it is not an acceptance gate. Any other argument prints usage and exits `2`.

## What the command proves

The eight required stages appear in `summary.json.stages` in this exact order:

1. `shell-harness-self-tests` exercises stale/missing/malformed Unity evidence, wrong-version overrides, a real timeout with spawned-child process-group termination, provenance, exact GPU evidence, PNG decoding, and scope-guard negative controls.
2. `clean-unity-import` deletes `cumulus/Library`, imports with the committed Unity version, and scans the complete log.
3. `deterministic-builder` rebuilds the scene twice and requires identical SHA-256 manifests for 14 authoritative assets.
4. `editmode-tests` requires validated passing NUnit XML with at least one test and internally consistent counts.
5. `gpu-playmode-tests` requires validated passing graphics-enabled NUnit XML, the exact 29-metric contract, and the exact 20 decodable `512 x 288` RGBA PNG captures.
6. `shader-inspection-and-build` requires zero `ShaderUtil.GetShaderMessages` errors for the three required shaders and a nonempty successful `StandaloneOSX` player.
7. `repository-checks` runs `npm run lint`, `npm run typecheck`, and `npm test` in order.
8. `static-scope-guard` compares against `TANGO_SCOPE_BASE` or `merge-base HEAD master`, verifies Unity `.meta` pairing, and rejects mechanically detectable deferred systems.

After all stages, provenance is checked again. A commit change or any tracked/untracked change prevents a passing summary.

The Unity harness writes to these exact stage directories: `stages/clean-import/` for clean import; `stages/builder-first/` and `stages/builder-second/` for deterministic rebuilds; `stages/full-editmode/` for EditMode tests; `stages/full-playmode/` for graphics-enabled PlayMode tests; and `stages/shader-build/` for shader inspection and the player build. Each contains `unity.log`, `launcher.log`, and `exit-code`; the two test directories also contain `results.xml`.

## Evidence and schemas

All evidence is ignored by Git and is replaced at the start of a run:

- `cumulus/Artifacts/TangoMvpVerification/summary.json`: authoritative aggregate verdict.
- `stages/<stage>/unity.log`, `launcher.log`, and `exit-code`: per-Unity-process evidence.
- `stages/full-editmode/results.xml` and `stages/full-playmode/results.xml`: NUnit results.
- `render-metrics.json`: GPU measurements; sibling PNG files are the metric inputs.
- `shader-report.json`: shader discovery and compiler messages.
- `build-report.json`: macOS player result.
- `asset-hashes-first.txt` and `asset-hashes-second.txt`: deterministic builder manifests.
- `stages/npm-*.log` and the self-test/scope logs: repository and harness diagnostics.
- `cumulus/Builds/TangoMvpVerification/CumulusTangoMvp.app`: ignored standalone player.

A passing summary has schema version `1` and these fields: `overall: "passed"`; `failedStage: null`; exact `unityVersion` and `urpVersion`; nonempty `graphicsApi` and `graphicsDevice`; clean `gitCommit`; exactly eight passing stage records (`name`, `status`, `durationSeconds`); `tests.editMode` and `tests.playMode` counts (`total`, `passed`, `failed`, `errors`, `inconclusive`, `skipped`, `warnings`); `shaderErrorCount`; build (`result`, `sizeBytes`, `warnings`, `outputPath`); all `renderMetrics`; `assetHashManifest`; 13 `assetHashes` (`sha256`, `path`); and artifact paths. A failure summary has schema version `1`, `overall: "failed"`, `failedStage`, `processExit` when a stage ran, `gitCommit`, and completed `stages`. Provenance failures instead include `reason` and `dirtyPaths`.

`render-metrics.json` has exactly `{"schemaVersion": 1, "metrics": [...]}`. It must contain each of the 29 names below exactly once and no other names. Every metric record has exactly: `metricName`, finite numeric `measuredValue`, equivalent string `measuredValueText`, `measuredValueFinite: true`, committed `comparison`, committed numeric `threshold`, recomputed `passed: true`, nonempty `phaseA`, `phaseB`, `graphicsApi`, and `deviceName`. The validator recomputes the verdict rather than trusting `passed`.

`shader-report.json` records `unityVersion`, `shaderCount: 4`, `errorCount: 0`, and ordered records for `TangoMvp/SceneGlass`, `TangoMvp/OnGlass`, `TangoMvp/ShopBackdropShadowReceiver`, and `Hidden/TangoMvp/SeparableBlur`, each with `found: true` and a `messages` array. `build-report.json` records `result: "Succeeded"`, exact output `Builds/TangoMvpVerification/CumulusTangoMvp.app`, `platform: "StandaloneOSX"`, `totalErrors: 0`, positive integer `totalSize`, `totalWarnings`, and `totalTimeSeconds`.

## GPU metric contract

The thresholds are deliberately relational or broad proof-of-life bounds. They establish that the intended rendering mechanism is active and structurally shared; they are not a visual-polish specification.

| Metric | Requirement | Meaning and failure interpretation |
|---|---:|---|
| `liveBackdropDelta.LiveGlassA` | `>= 0.015` | Spinner motion changes pane A. Lower means stale/frozen/non-transmitting glass. |
| `liveBackdropDelta.LiveGlassB` | `>= 0.015` | The independent pane also transmits the moving scene. Lower means it is not live. |
| `surfaceContribution.LiveGlassA` | `>= 0.02` | Pane A changes its own pixels versus the identical frame with only that pane disabled. Lower means the surface is invisible or ineffectual. |
| `surfaceContribution.LiveGlassB` | `>= 0.02` | Pane B changes its own pixels versus the identical frame with only that pane disabled. Lower means the surface is invisible or ineffectual. |
| `blurEdgeEnergyRatioMaximum` | `<= 0.65` | The peak same-region luminance gradient with glass enabled is at most 65% of the glass-disabled edge. Higher means the surface did not soften its backdrop. |
| `blurEdgeEnergyRatioMinimum` | `>= 0.005` | The softened same-region gradient retains bounded structure. Lower indicates a flat or excessively blurred result. |
| `sharedGraphRecords.<phase>` | `== 1` | Exactly one graph record exists for each phase listed below. Any other value means the camera-level effect is missing or duplicated. |
| `downsamplePasses.<phase>` | `== 4` | Exactly four locally filtered pyramid downsample passes per camera phase. |
| `upsamplePasses.<phase>` | `== 3` | Exactly three filtered pyramid reconstruction passes per camera phase. |
| `onGlassAdditionalPasses` | `== 0` | Enabling the on-glass button creates no blur work. Nonzero means child UI is incorrectly driving the graph. |
| `onGlassBackdropDelta` | `>= 0.005` | Scene motion remains visible through the button region. Lower suggests a baked/opaque child. |
| `onGlassBackdropCorrelation` | `>= 0.5` | Button-region luminance changes follow its parent backdrop. Lower suggests unrelated or reversed scene response. |
| `bevelLightDelta` | `>= 0.02` | The solid bevel responds to the moving directional light. Lower means the lit shell is inert. |
| `transmissionLightDeltaRatio` | `<= 0.25` | Transmitted interior changes by no more than 25% of the bevel change. Higher suggests double-lighting of transmission. |
| `frameShadowDelta` | `>= 0.02` | Toggling frame shadow casting changes the receiver. Lower means the frame shadow is absent. |
| `labelContrast.bright` | `>= 4.5` | Warm-white mesh text reaches the contrast floor over the bright phase. |
| `labelContrast.gold` | `>= 4.5` | Warm-white mesh text reaches the contrast floor over the gold phase. |
| `labelContrast.dark` | `>= 4.5` | Warm-white mesh text reaches the contrast floor over the dark phase. |
| `fallbackInteriorLuminanceMinimum` | `>= 0.02` | Disabled shared blur still renders a visible finite fallback. Lower means black/invisible fallback. |
| `fallbackInteriorLuminanceMaximum` | `<= 0.8` | Fallback is bounded below whiteout. Higher means clipped/opaque fallback. |

`<phase>` expands to all four exact suffixes: `bothPanesEnabled`, `mainPaneDisabled`, `independentPaneDisabled`, and `onGlassButtonDisabled`. This produces 12 exact graph/pass records and 29 total metrics.

The exact capture set is `spinner-a.png`, `spinner-b.png`, `spinner-c.png`, `main-pane-disabled.png`, `independent-pane-disabled.png`, `button-parent-a.png`, `button-parent-b.png`, `button-a.png`, `button-b.png`, `light-a.png`, `light-b.png`, `shadow-on.png`, `shadow-off.png`, `label-bright-backdrop.png`, `label-bright.png`, `label-gold-backdrop.png`, `label-gold.png`, `label-dark-backdrop.png`, `label-dark.png`, and `fallback.png`. The validator checks the exact set, PNG signature and chunk order, CRCs, IHDR format, IDAT decompression, scanlines, and exact `512 x 288`, 8-bit RGBA non-interlaced dimensions.

## Failure signatures and diagnosis

For every Unity stage, the harness requires process exit `0`, a fresh log inside that stage's directory, and an exact completion line: `Exiting batchmode successfully now!` or, for tests, `Test run completed. Exiting with code 0 (Ok). Run completed.` A test stage additionally requires a fresh, passing NUnit `test-run` root with nonzero and internally consistent counts.

The Unity log scan is case-insensitive and rejects these signatures: `error CS<digits>`, `Shader error`, `Compilation failed`, `Scripts have compiler errors`, `Unhandled Exception`, `Unhandled exception`, `NullReferenceException`, `MissingReferenceException`, `Assertion failed`, `AssertionException`, a Unity Editor crash line, `Crash!!!`, `Fatal Error`, `Received signal`, `Segmentation fault`, `Aborting batchmode due to failure`, or a line beginning with a qualified exception type and followed by `:` or end-of-line. Inspect the failed stage's `unity.log` and `launcher.log`; compilation errors therefore fail during clean import rather than relying on later human inspection.

Other fail-closed messages identify the contract directly:

- `tango-provenance:`: dirty tree or changed `HEAD`; inspect `summary.json.reason` and `dirtyPaths`.
- `unity-run:`: wrong/missing Unity version, invalid harness argument, stale/missing log, nonzero/malformed exit evidence, rejected NUnit XML, timeout, or missing completion marker.
- `tango-evidence:`: malformed/extraneous/duplicate/missing metric, threshold/operator mismatch, nonfinite value, forged verdict, GPU identity/phase omission, capture-set mismatch, or invalid PNG.
- `scope-guard:`: protected mobile/UI asset change, missing/orphaned `.meta`, runtime material allocation or per-instance `.material` access, per-pane camera/render-texture field, forbidden uGUI/UI Toolkit/TextMesh Pro import, named controller/touch API, production token-generator source/path, or refraction-source signature.
- `summary stage evidence is incomplete`, `invalid passing NUnit root`, `invalid NUnit counts`, `missing exact Unity version`, `missing exact URP version`, `summary found failed or missing render metrics`, or `asset hash manifest is malformed/empty`: aggregate evidence is incomplete.
- `shader report has an invalid count or nonzero errors`, `shader report does not contain the exact required shaders`, or `shader report has missing or malformed shader records`: shader inspection failed.
- `standalone build did not succeed for macOS`, `standalone build output path is not exact`, `standalone build summary is malformed`, or `standalone player output is missing or empty`: player build evidence failed.
- A failed npm stage is diagnosed from `stages/npm-lint.log`, `npm-typecheck.log`, or `npm-test.log`; a builder mismatch is diagnosed by diffing the two asset hash manifests.

## Acceptance-to-evidence map

This is the complete automated completion contract. Optional inspection is not part of any verdict.

| Acceptance criterion | Exact automated evidence |
|---|---|
| Two consecutive clean runs pass | Two invocations exit `0`; each resulting `summary.json.overall` is `passed` and `gitCommit` equals the invoked `HEAD`. Retain/copy the first summary externally if a durable two-run record is required because the gate replaces its evidence directory. |
| Clean import has no compile/shader/assertion/exception/crash signature | `clean-unity-import.status == "passed"` plus `stages/clean-import/unity.log`, validated by `validate_unity_result`. |
| Three MVP shaders have zero reported errors | `shader-inspection-and-build.status`, `shaderErrorCount == 0`, and exact records in `shader-report.json`. |
| Committed scene builds for macOS | `build.result == "Succeeded"`, positive `build.sizeBytes`, exact `build.outputPath`, and nonempty `.app`. `TangoGlassLabAssetTests.RendererAndBuildSettings_AreInstalledOnceWithoutRemovingSsao` proves the committed scene is the sole enabled build scene. |
| Moving opaque object stays live through both panes | Metrics `liveBackdropDelta.LiveGlassA` and `.LiveGlassB`; same-phase `surfaceContribution.LiveGlassA` and `.LiveGlassB` prove each pane actually changes its own pixels; `blurEdgeEnergyRatioMaximum` compares each edge against its glass-disabled counterpart; `TangoGlassGpuTests.GlassLab_RendersLiveSharedBlurAndFailClosedFallbackEvidence`. |
| One shared graph record and one seven-pass pyramid regardless of panes/button | All 12 `sharedGraphRecords.*`, `downsamplePasses.*`, and `upsamplePasses.*` records; `TangoGlassRenderingTests.BlurShader_HasExactlyDownsampleAndUpsamplePasses` and `RendererFeature_OwnsOneMaterialAndOneConfiguredPass`. |
| On-glass button adds no pass and retains parent signal | `onGlassAdditionalPasses`, `onGlassBackdropDelta`, and `onGlassBackdropCorrelation`; `TangoGlassRenderingTests.OnGlass_NeverDeclaresOrSamplesSharedBlur`. |
| Fixed tint, saturation, rim, sheen, and lit-shell roles | `TangoGlassRenderingTests.GlassShaders_ExposeOnlyHiddenFixedRoleProperties`, `SceneGlass_ConsumesSharedBlurOnceAndKeepsTransmissionOutOfDiffuseLighting`, `RebuildMaterials_CreatesStableSharedMaterialVocabulary`, and `TangoRoundedPanelMeshTests.MaterialLibrary_ResolvesEachRoleAndValidatesAssignments`. |
| Transmission avoids double-lighting | `bevelLightDelta` and `transmissionLightDeltaRatio <= 0.25`; the scene-glass shader contract test above. |
| Solid bevel responds and frame casts a ground shadow | `bevelLightDelta`, `frameShadowDelta`, and `TangoGlassLabAssetTests.FrameShadowReceiver_SitsInsideProjectedBottomRailShadowWithMargin`. |
| Labels reach 4.5:1 over bright, gold, and dark phases | `labelContrast.bright`, `.gold`, and `.dark`; `TangoImageMetricsTests.PercentileContrast_WithBackdropFindsGlyphAndItsOnePixelOutline`. |
| Stable root collider handles hover, press, cancel, activation | `TangoPressableTests.StateMachine_ScalesOnlyVisualAndPressWinsHover`, `StateMachine_CancelsAwayAndActivatesOnceOver`, `VirtualMouse_ActivatesThroughPointerInteractor`, and `VirtualMouse_DragOffCancelsOriginalPress`; `TangoGlassLabAssetTests.Scene_ReopensWithExactProofObjectsAndSharedMaterialRoles` proves one root collider and its serialized binding. |
| Travel is 420 ms, follows `(0.16, 1, 0.3, 1)`, and is interruptible | `TangoPanelTravelTests.ToggleDestination_ReachesBothExactAnchorsInReferenceDuration`, `ToggleDestination_InterruptsFromCurrentPoseWithoutSnap`, and all three `TangoCubicBezierTests` using those exact control points. |
| Panel, button, labels, collider, and sheen stay aligned | The scene/prefab hierarchy and bindings are asserted by `TangoGlassLabAssetTests.Scene_ReopensWithExactProofObjectsAndSharedMaterialRoles`; `ToggleDestination_ReachesBothExactAnchorsInReferenceDuration` moves the common panel root and `StateMachine_ScalesOnlyVisualAndPressWinsHover` proves interaction scaling leaves the root/collider unchanged. |
| Fallback is finite, visible, and interactive | `fallbackInteriorLuminanceMinimum` and `fallbackInteriorLuminanceMaximum`; `TangoGlassRenderingTests.SceneGlass_FallbackStraightAlphaPreservesShellAndLiveReplacesBackdrop`, `SceneGlass_AvailabilityBranchReturnsBeforeBlurSampling`, and `TangoGlassGpuTests.Fallback_RealSceneButtonSupportsHoverPressCancelAndTravelActivation`, which exercises the real scene button with the renderer feature inactive. |
| Unity and repository suites pass | `tests.editMode`, `tests.playMode`, `editmode-tests`, `gpu-playmode-tests`, and `repository-checks`; inspect the two XML files and three npm logs. |
| Negative controls reject known-bad evidence | `shell-harness-self-tests.status == "passed"`; its four logs cover shell harness, scope, evidence, and provenance fixtures. `TangoImageMetricsTests.AcceptanceThresholds_FlipImmediatelyAcrossEveryCommittedBoundary` checks every metric boundary. |
| Scope remains the bounded PC proof | `static-scope-guard.status == "passed"` and `stages/scope-guard.log`; the guard includes deletions and new/untracked files. It checks the exact static subset described below. Recursive glass is constrained by the exact one-record/two-pass metrics plus `OnGlass_NeverDeclaresOrSamplesSharedBlur`; refraction is rejected by the guard's shader-source signatures. |
| Builder is deterministic and authoritative | `deterministic-builder.status == "passed"`, identical hash manifests, `TangoGlassLabAssetTests.Rebuild_IsByteStableAndRetainsEveryAuthoredGuid`, and `Rebuild_RepairsMeshPrefabAndSceneDriftWithoutChangingGuids`. |
| GPU setup failure restores state and still emits evidence | `TangoGlassGpuTests.EarlyFailure_RestoresEverySeededNonDefaultState`. |

## Optional visual review

Visual review is supporting evidence only. It cannot make a failed command pass and is not required for autonomous completion.

An agent may inspect the 20 generated PNGs for unintended aesthetic artifacts. It may also open `cumulus/Assets/Scenes/TangoGlassLab.unity`, select the PC renderer, set the Game view to `1920 x 1080`, enter Play Mode, hover/click/drag off the world-space button, and watch the panel travel and moving background. Record observations separately from `summary.json`; preference-level observations do not alter automated thresholds.

## Bounded MVP scope

This is a PC-only proof scene for shared screen-space frost, fixed material roles, world-space mesh text, one pointer-driven pressable, and one interruptible panel motion. Production work outside this contract includes mobile renderer changes, Canvas/uGUI, UI Toolkit, TextMesh Pro resources, per-pane cameras or render textures, runtime material clones, per-instance material tuning, refraction, recursive glass, controller/touch input, and a production token generator.

The static guard's exact mechanically detectable subset is: any mutation/deletion of the mobile renderer, TextMesh Pro tree, `.uxml`/`.uss`/`UIDocument` asset; any unpaired Unity asset or `.meta`; production `new Material(...)` or `Renderer.material`-style access while allowing `sharedMaterial` and Editor/test code; any production class-member field type containing `Camera`, `RenderTexture`, or `RTHandle`, including arrays and nested/custom generic containers, except the one declared pointer-interaction camera; uGUI, UI Toolkit, or TMPro namespace imports, including alias and `global::` forms; `Gamepad.current/all`, `Joystick.current/all`, `Touchscreen.current/all`, `Pen.current/all`, legacy `Input.touchCount/GetTouch`, or Enhanced Touch references; a production Tango MVP source path/type named as a token generator; and shader references to `GrabPass`, `refract(...)`, refraction-named identifiers, `_CameraOpaqueTexture`, or `_CameraDepthTexture`. Recursive glass is bounded dynamically by one shared graph record and exactly two camera passes across pane/button configurations, and statically by the on-glass shader's prohibition on shared-blur sampling. These checks define the automated scope claim; other architecture or aesthetic judgments remain optional review observations.
