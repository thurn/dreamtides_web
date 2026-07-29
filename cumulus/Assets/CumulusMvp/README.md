# Cumulus Cumulus Glass MVP

## Shop glass demo

Open `Assets/Scenes/CumulusShopGlassDemo.unity` for the minimal web-parity study.
It places one centered square of the shared `SceneGlass` material over the
Tumbleleaf Village image used by the web Card Shop. The image uses the same
centered cover crop as the web screen; an orthographic 16:9 camera and a warm,
angled directional light provide a stable view of the blur, rim, and sheen.
The scene intentionally contains no cards, guide, HUD, buttons, labels, or
other interface elements.

Rebuild it from `Cumulus MVP > Rebuild Shop Glass Demo`. The builder also exposes
`CumulusMvp.Editor.CumulusShopGlassDemoBuilder.CaptureBatch` for a deterministic
1920 x 1080 review capture.

## Dreamsign glass demo

Open `Assets/Scenes/CumulusDreamsignGlassDemo.unity` to inspect three journey
Dreamsigns as alpha-cut world-space meshes over the shared blurred glass. The
`CumulusMvp/Dreamsign` shader anchors each production UUID image to the web
brightness and saturation transform, then applies bounded directional and
additional-light brightness, tint, and shadow modulation. Each Dreamsign writes
depth, receives scene shadows, and casts its image silhouette into shadow maps.
Two colored point lights make the local-light response visible on both the
Dreamsigns and the Cumulus glass. A centered `Sort` Glass Button at the bottom
uses the web default's measured 59.921875 by 42 pixel proportions, 14-pixel
control radius, nested on-glass material, and a TextMesh Pro label.

Rebuild it from `Cumulus MVP > Rebuild Dreamsign Glass Demo` or invoke
`CumulusMvp.Editor.CumulusDreamsignGlassDemoBuilder.CaptureBatch` for a
deterministic 1920 x 1080 review capture.

## Glass blur architecture

`CumulusGlassRendererFeature` records one camera-level blur pyramid before
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

`Assets/CumulusMvp/Materials/CumulusGlassLightingProfile.asset` is the shared editor
surface for `SceneGlass` and `OnGlass` lighting. It exposes edge-reflection and
interior-reflection strength, roughness, light-color response, and a soft HDR
ceiling for each role. It also declares the bounded desktop and mobile
additional-light budgets. Individual panels use the shared material library and
have no lighting overrides.

Open `Assets/Scenes/CumulusGlassLab.unity` to inspect a blue point light orbiting
the generated rounded panels. The modeled bevel carries the narrow moving glint;
the face carries the broader colored reflection. The desktop path evaluates at
most four URP additional lights with supported shadows. The mobile shader path
evaluates at most one additional light without sampling its shadow.

From the repository root, an autonomous agent verifies this proof of concept with one command:

```bash
bash cumulus/scripts/verify-cumulus-mvp.sh
```

Exit `0` is the passing automated result. It means every stage below passed and
`cumulus/Artifacts/CumulusMvpVerification/summary.json` has `"overall":
"passed"` for the clean Git commit recorded in `gitCommit`. Visual completion
also requires reviewing same-scene on/off evidence and the holistic final
frame.

## Prerequisites

- Run on macOS from the root of a clean checkout of this repository. The README command is the supported invocation contract.
- Install the exact Unity editor in `cumulus/ProjectSettings/ProjectVersion.txt` at the Unity Hub path `/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity`. A `UNITY` executable override is accepted only when `UNITY -version` reports that exact version.
- Provide a graphics-capable Metal device for batch captures and the standalone macOS build.
- Install Node dependencies at the repository root with `npm install` when `node_modules` is absent.
- Make `bash`, `python3`, `git`, `shasum`, and the repository's npm toolchain available.
- Keep `master` available locally, or set `CUMULUS_SCOPE_BASE` to the intended base commit for the static scope comparison.
- Commit every intended input before starting. The authoritative no-argument command has no dirty-tree override.

The gate deletes `cumulus/Library` to force a clean import and replaces the ignored verification directory. Each Unity process has a 1,800-second timeout. On timeout, the harness sends `SIGTERM` to the entire process group, waits 10 seconds, then sends `SIGKILL`; timeout evidence is rejected and the gate exits nonzero.

`bash cumulus/scripts/verify-cumulus-mvp.sh --self-test` runs only the negative-control suites. It is useful while changing the harness, but it is not an acceptance gate. Any other argument prints usage and exits `2`.

## What the command proves

The six required stages appear in `summary.json.stages` in this exact order:

1. `shell-harness-self-tests` exercises stale/missing/malformed Unity evidence, wrong-version overrides, a real timeout with spawned-child process-group termination, provenance, evidence validation, PNG decoding, and scope-guard negative controls.
2. `clean-unity-import` deletes `cumulus/Library`, imports with the committed Unity version, and scans the complete log.
3. `deterministic-builder` rebuilds the scene twice and requires identical SHA-256 manifests for 12 authoritative assets.
4. `shader-inspection-and-build` requires zero `ShaderUtil.GetShaderMessages` errors for the four required shaders and a nonempty successful `StandaloneOSX` player.
5. `repository-checks` runs `npm run lint`, `npm run typecheck`, and `npm test` in order.
6. `static-scope-guard` compares against `CUMULUS_SCOPE_BASE` or `merge-base HEAD master`, verifies Unity `.meta` pairing, and rejects mechanically detectable deferred systems.

After all stages, provenance is checked again. A commit change or any tracked/untracked change prevents a passing summary.

The Unity harness writes to these exact stage directories:
`stages/clean-import/` for clean import, `stages/builder-first/` and
`stages/builder-second/` for deterministic rebuilds, and
`stages/shader-build/` for shader inspection and the player build.

## Evidence and schemas

All evidence is ignored by Git and is replaced at the start of a run:

- `cumulus/Artifacts/CumulusMvpVerification/summary.json`: authoritative aggregate verdict.
- `stages/<stage>/unity.log`, `launcher.log`, and `exit-code`: per-Unity-process evidence.
- `shader-report.json`: shader discovery and compiler messages.
- `build-report.json`: macOS player result.
- `asset-hashes-first.txt` and `asset-hashes-second.txt`: deterministic builder manifests.
- `stages/npm-*.log` and the self-test/scope logs: repository and harness diagnostics.
- `cumulus/Builds/CumulusMvpVerification/CumulusCumulusMvp.app`: ignored standalone player.

A passing summary has schema version `1` and these fields: `overall: "passed"`;
`failedStage: null`; exact `unityVersion` and `urpVersion`; clean `gitCommit`;
exactly six passing stage records; `shaderErrorCount`; build result, size,
warnings, and output path; the deterministic asset-hash manifest; and artifact
paths. Failure summaries identify the failed stage and completed stages.

`shader-report.json` records `unityVersion`, `shaderCount: 4`, `errorCount: 0`, and ordered records for `CumulusMvp/SceneGlass`, `CumulusMvp/OnGlass`, `CumulusMvp/Dreamsign`, and `Hidden/CumulusMvp/SeparableBlur`, each with `found: true` and a `messages` array. `build-report.json` records `result: "Succeeded"`, exact output `Builds/CumulusMvpVerification/CumulusCumulusMvp.app`, `platform: "StandaloneOSX"`, `totalErrors: 0`, positive integer `totalSize`, `totalWarnings`, and `totalTimeSeconds`.

## Failure signatures and diagnosis

For every Unity stage, the harness requires process exit `0`, a fresh log
inside that stage's directory, and the exact completion line `Exiting batchmode
successfully now!`.

The Unity log scan is case-insensitive and rejects these signatures: `error CS<digits>`, `Shader error`, `Compilation failed`, `Scripts have compiler errors`, `Unhandled Exception`, `Unhandled exception`, `NullReferenceException`, `MissingReferenceException`, `Assertion failed`, `AssertionException`, a Unity Editor crash line, `Crash!!!`, `Fatal Error`, `Received signal`, `Segmentation fault`, `Aborting batchmode due to failure`, or a line beginning with a qualified exception type and followed by `:` or end-of-line. Inspect the failed stage's `unity.log` and `launcher.log`; compilation errors therefore fail during clean import rather than relying on later human inspection.

Other fail-closed messages identify the contract directly:

- `cumulus-provenance:`: dirty tree or changed `HEAD`; inspect `summary.json.reason` and `dirtyPaths`.
- `unity-run:`: wrong/missing Unity version, invalid harness argument, stale/missing log, nonzero/malformed exit evidence, timeout, or missing completion marker.
- `cumulus-evidence:`: malformed/extraneous/duplicate/missing metric, threshold/operator mismatch, nonfinite value, forged verdict, GPU identity/phase omission, capture-set mismatch, or invalid PNG.
- `scope-guard:`: protected mobile/UI asset change, missing/orphaned `.meta`, runtime material allocation or per-instance `.material` access, per-pane camera/render-texture field, forbidden uGUI/UI Toolkit import, named controller/touch API, production token-generator source/path, or refraction-source signature.
- `summary stage evidence is incomplete`, `missing exact Unity version`, `missing exact URP version`, or `asset hash manifest is malformed/empty`: aggregate evidence is incomplete.
- `shader report has an invalid count or nonzero errors`, `shader report does not contain the exact required shaders`, or `shader report has missing or malformed shader records`: shader inspection failed.
- `standalone build did not succeed for macOS`, `standalone build output path is not exact`, `standalone build summary is malformed`, or `standalone player output is missing or empty`: player build evidence failed.
- A failed npm stage is diagnosed from `stages/npm-lint.log`, `npm-typecheck.log`, or `npm-test.log`; a builder mismatch is diagnosed by diffing the two asset hash manifests.

## Visual review

Visual review is required for rendering completion. Use deterministic batch
captures and the web-to-Unity glass parity workflow for same-scene comparisons,
then finish with a cold review of the complete frame.

The scene can also be opened at `cumulus/Assets/Scenes/CumulusGlassLab.unity`:
select the PC renderer, set the Game view to `1920 x 1080`, enter Play Mode,
hover/click/drag off the world-space button, and watch the panel travel and
moving background. Record the visual conclusion separately from `summary.json`;
preference-level observations do not alter automated thresholds.

## Bounded MVP scope

This is a PC-only proof scene for shared screen-space frost, fixed material roles, world-space TextMesh Pro labels, one pointer-driven pressable, and one interruptible panel motion. Production work outside this contract includes mobile renderer changes, Canvas/uGUI, UI Toolkit, per-pane cameras or render textures, runtime material clones, per-instance material tuning, refraction, recursive glass, controller/touch input, and a production token generator.

The static guard's exact mechanically detectable subset is: any mutation/deletion of the mobile renderer or `.uxml`/`.uss`/`UIDocument` asset; any unpaired Unity asset or `.meta`; production `new Material(...)` or `Renderer.material`-style access while allowing `sharedMaterial` and Editor/test code; any production class-member field type containing `Camera`, `RenderTexture`, or `RTHandle`, including arrays and nested/custom generic containers, except the one declared pointer-interaction camera; uGUI or UI Toolkit namespace imports, including alias and `global::` forms; `Gamepad.current/all`, `Joystick.current/all`, `Touchscreen.current/all`, `Pen.current/all`, legacy `Input.touchCount/GetTouch`, or Enhanced Touch references; a production Cumulus MVP source path/type named as a token generator; and shader references to `GrabPass`, `refract(...)`, refraction-named identifiers, `_CameraOpaqueTexture`, or `_CameraDepthTexture`. Recursive glass is bounded dynamically by one shared graph record and exactly two camera passes across pane/button configurations, and statically by the on-glass shader's prohibition on shared-blur sampling. These checks define the automated scope claim; other architecture or aesthetic judgments remain optional review observations.
