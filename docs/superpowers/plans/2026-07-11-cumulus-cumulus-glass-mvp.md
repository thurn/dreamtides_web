# Cumulus Cumulus Glass MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one deterministic Unity lab scene that proves live shared Cumulus frost, tangible mesh controls, stable pointer interaction, and material-continuity motion.

**Architecture:** A URP Render Graph renderer feature downsamples and separably blurs the opaque camera color once per game camera immediately before transparent rendering, then publishes that texture globally for every scene-glass mesh. Strict scene-glass, on-glass, and solid-chrome roles render on procedural shallow geometry; a collider-owning pressable and a separate visual child keep hit volumes stable while hover, press, and panel travel animate the visible object. A single non-interactive verification command compiles and imports the project, rejects shader errors, runs structural and GPU-backed behavior tests, builds a standalone player, scans every Unity log, and emits machine-readable evidence.

**Tech Stack:** Unity 6000.5.3f1, URP 17.5.0, Render Graph, Input System 1.19.0, NUnit/Unity Test Framework 1.7.0, HLSL, C#.

## Global Constraints

- Do all implementation in an isolated `wt` worktree created from `master`; never edit the primary checkout.
- Run `scripts/regenerate-assets.sh` from the repository root immediately after creating the implementation worktree and retain any tracked output in the implementation commits.
- Use Unity 6000.5.3f1 and the committed URP 17.5.0 package with Render Graph enabled; Compatibility Mode is outside this MVP.
- Target the committed PC renderer only. Mobile live glass, Tile-Only Mode, XR, camera stacking, dynamic resolution, and thermal adaptation are outside this MVP.
- Capture opaque scene color and publish the blur at `RenderPassEvent.BeforeRenderingTransparents`. The design document's after-post-processing Cumulus pass, transparent capture membership, TAA integration, and depth-owner pass are later production work.
- Perform exactly one two-pass shared blur per participating game camera per frame; panes and nested controls never request private cameras, render textures, or blur passes.
- Use half-width and half-height blur textures, one horizontal pass, one vertical pass, `msaaSamples = 1`, and no depth buffer.
- Keep the three material roles closed: `SceneGlass`, `OnGlass`, and `SolidChrome`. Scene instances may select a role but may not supply blur, tint, rim, sheen, saturation, or motion values.
- Use the Cumulus reference values for the MVP: scene fill `(0.055, 0.055, 0.063, 0.54)`, saturation `1.5`, sheen alpha `0.07`, rim alpha `0.14`, and travel duration `0.42` seconds with cubic Bézier `(0.16, 1, 0.3, 1)`.
- Render labels as world-space mesh text, never through a Canvas, uGUI control, or UI Toolkit panel. The MVP uses Unity `TextMesh` to avoid importing the full TextMesh Pro resource bundle.
- Keep interaction colliders on stable roots. Hover, press, and travel affect visual children and never resize or replace the collider.
- Use shared materials plus `MaterialPropertyBlock` or transforms for runtime state; do not instantiate or clone materials during interaction.
- Do not add refraction, recursive glass, pane crossing, translucent shadow dithering, controller navigation, touch, accessibility, diagnostics UI, token generation, or a general-purpose component catalog.
- New runtime code logs scene initialization, active glass mode, and panel activation so a play session can be reconstructed from the Unity log.
- `cumulus/scripts/verify-cumulus-mvp.sh` is the authoritative completion gate. It must run without an open Unity Editor or human input and return nonzero for any failed stage, malformed/missing result, compiler error, shader error, unexpected exception, or failed acceptance metric.
- Automated rendering checks use relational metrics from deterministic images rather than exact golden pixels, so minor driver differences do not invalidate the proof. Every threshold is committed, named, reported with its measured value, and tested on both sides of the boundary.
- After Task 0, every Unity invocation in every task runs through `run_unity_stage`; a raw Unity exit code is never accepted as compilation or test evidence.
- Manual Play Mode review and screenshots are optional review evidence. No required acceptance criterion may depend solely on a human looking at the scene, Frame Debugger, Render Graph Viewer, or an image.
- Each task ends in a detailed commit followed immediately by `git push`; use `git push -u origin HEAD` for the first task and `git push` thereafter.

---

## File Structure

### Runtime and rendering

- `cumulus/Assets/CumulusMvp/Runtime/CumulusMvp.Runtime.asmdef` — isolated runtime assembly and Input System/URP references.
- `cumulus/Assets/CumulusMvp/Runtime/Materials/CumulusMaterialRole.cs` — closed semantic role enum.
- `cumulus/Assets/CumulusMvp/Runtime/Materials/CumulusMaterialLibrary.cs` — role-to-shared-material lookup with exhaustive validation.
- `cumulus/Assets/CumulusMvp/Runtime/Geometry/CumulusRoundedPanelMesh.cs` — deterministic shallow rounded-panel mesh construction.
- `cumulus/Assets/CumulusMvp/Runtime/Rendering/CumulusGlassShaderIds.cs` — the only C# definitions of global glass shader property IDs.
- `cumulus/Assets/CumulusMvp/Runtime/Rendering/CumulusGlassBlurDescriptor.cs` — pure half-resolution descriptor transformation.
- `cumulus/Assets/CumulusMvp/Runtime/Rendering/CumulusGlassRendererFeature.cs` — renderer feature and Render Graph pass ownership.
- `cumulus/Assets/CumulusMvp/Runtime/Diagnostics/CumulusGlassDiagnostics.cs` — per-camera, per-frame render facts exposed to tests and development tooling.
- `cumulus/Assets/CumulusMvp/Runtime/Interaction/CumulusPressable.cs` — semantic hover/press/activate state machine.
- `cumulus/Assets/CumulusMvp/Runtime/Interaction/CumulusPointerInteractor.cs` — mouse-to-world raycast routing.
- `cumulus/Assets/CumulusMvp/Runtime/Motion/CumulusCubicBezier.cs` — fixed easing evaluator.
- `cumulus/Assets/CumulusMvp/Runtime/Motion/CumulusPanelTravel.cs` — interruptible two-anchor object travel.
- `cumulus/Assets/CumulusMvp/Runtime/Demo/CumulusSpinner.cs` — continuously moving high-contrast backdrop object.
- `cumulus/Assets/CumulusMvp/Runtime/Demo/CumulusLightOrbit.cs` — continuously moving directional light.
- `cumulus/Assets/CumulusMvp/Runtime/Demo/CumulusVerificationMarkers.cs` — named world-space regions used to derive GPU-test pixel bounds.

### Shaders and authored assets

- `cumulus/Assets/CumulusMvp/Shaders/CumulusSeparableBlur.shader` — horizontal and vertical spatial blur passes.
- `cumulus/Assets/CumulusMvp/Shaders/CumulusSceneGlass.shader` — scene blur sampling, saturation, tint, rim, sheen, Fresnel, and main-light response.
- `cumulus/Assets/CumulusMvp/Shaders/CumulusOnGlass.shader` — nested tonal lens without backdrop sampling.
- `cumulus/Assets/CumulusMvp/Materials/CumulusSceneGlass.mat` — shared `SceneGlass` material.
- `cumulus/Assets/CumulusMvp/Materials/CumulusOnGlass.mat` — shared `OnGlass` material.
- `cumulus/Assets/CumulusMvp/Materials/CumulusSolidChrome.mat` — shared URP Lit frame and text-backing material.
- `cumulus/Assets/CumulusMvp/Materials/CumulusBlur.mat` — hidden renderer-feature blur material.
- `cumulus/Assets/CumulusMvp/Materials/CumulusMaterialLibrary.asset` — the committed role catalog.
- `cumulus/Assets/CumulusMvp/Meshes/CumulusPanel.asset` — generated reusable shallow rounded-panel mesh.
- `cumulus/Assets/CumulusMvp/Prefabs/CumulusGlassPanel.prefab` — panel root, stable collider, glass face, bevel, label, and nested button.
- `cumulus/Assets/Scenes/CumulusGlassLab.unity` — deterministic playable proof scene.

### Editor tooling and project integration

- `cumulus/Assets/CumulusMvp/Editor/CumulusMvp.Editor.asmdef` — editor-only assembly.
- `cumulus/Assets/CumulusMvp/Editor/CumulusGlassLabBuilder.cs` — idempotently rebuilds materials, mesh, prefab, scene, renderer feature, and build settings.
- `cumulus/Assets/CumulusMvp/Editor/CumulusMvpBatchVerification.cs` — shader inspection, deterministic player build, and batch exit-code ownership.
- `cumulus/Assets/Settings/PC_Renderer.asset` — contains one configured `CumulusGlassRendererFeature` alongside SSAO.
- `cumulus/ProjectSettings/EditorBuildSettings.asset` — makes `CumulusGlassLab.unity` the enabled MVP scene.
- `cumulus/Assets/CumulusMvp/README.md` — run instructions, inspection steps, acceptance checklist, and declared MVP boundary.

### Tests

- `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusMvp.EditModeTests.asmdef` — editor test assembly.
- `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusRoundedPanelMeshTests.cs` — mesh topology and bounds contracts.
- `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusGlassRenderingTests.cs` — blur descriptor, shader, material-role, and renderer-feature contracts.
- `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusCubicBezierTests.cs` — exact travel easing contracts.
- `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusGlassLabAssetTests.cs` — builder idempotence and committed asset wiring.
- `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusImageMetricsTests.cs` — boundary and negative-control tests for every GPU acceptance metric.
- `cumulus/Assets/CumulusMvp/Tests/Support/CumulusMvp.TestSupport.asmdef` — test-only shared image-analysis assembly.
- `cumulus/Assets/CumulusMvp/Tests/Support/CumulusImageMetrics.cs` — deterministic region readback, luminance, edge-energy, contrast, and image-difference functions.
- `cumulus/Assets/CumulusMvp/Tests/Support/CumulusGpuAcceptance.cs` — named relational thresholds and JSON result model.
- `cumulus/Assets/CumulusMvp/Tests/PlayMode/CumulusMvp.PlayModeTests.asmdef` — play test assembly.
- `cumulus/Assets/CumulusMvp/Tests/PlayMode/CumulusPressableTests.cs` — pointer-state precedence, cancellation, and stable collider tests.
- `cumulus/Assets/CumulusMvp/Tests/PlayMode/CumulusPanelTravelTests.cs` — activation, interruption, and hierarchy-alignment tests.
- `cumulus/Assets/CumulusMvp/Tests/PlayMode/CumulusGlassGpuTests.cs` — deterministic render readback and relational material assertions.

### Agent verification infrastructure

- `cumulus/scripts/verify-cumulus-mvp.sh` — one-command autonomous verification orchestrator.
- `cumulus/scripts/lib/unity-run.sh` — exact Unity resolution, process execution, timeout, result validation, and strict log classification.
- `cumulus/scripts/test-unity-run.sh` — shell-level regression tests using synthetic pass/fail logs and NUnit XML.
- `cumulus/.gitignore` — ignores `/Artifacts/CumulusMvpVerification/` and `/Builds/CumulusMvpVerification/`.
- `cumulus/Artifacts/CumulusMvpVerification/summary.json` — ignored aggregate verdict and stage evidence.
- `cumulus/Artifacts/CumulusMvpVerification/render-metrics.json` — ignored GPU measurements and threshold verdicts.
- `cumulus/Artifacts/CumulusMvpVerification/*.png` — ignored deterministic captures for optional agent or human inspection.

---

### Task 0: Fail-Closed Unity Command Harness

**Files:**
- Create: `cumulus/scripts/lib/unity-run.sh`
- Create: `cumulus/scripts/test-unity-run.sh`
- Modify: `cumulus/.gitignore`

**Interfaces:**
- Produces: `run_unity_stage <stage-name> <graphics|nographics> <unity arguments...>`, which owns the exact editor executable, project path, log path, timeout, process exit, and strict log scan.
- Produces: `validate_unity_result <stage-name> <log-path> [nunit-xml-path]`, which accepts a Unity stage only when its exit status, log, completion marker, and optional NUnit root/counts all agree.
- Produces: ignored `cumulus/Artifacts/CumulusMvpVerification/stages/<stage-name>/` directories for logs and result XML.

- [ ] **Step 1: Write failing validator self-tests**

  Create synthetic process results, logs, and NUnit XML for one valid stage plus every failure signature listed in Step 3. The test script must prove missing/malformed evidence is rejected, not merely prove valid evidence is accepted.

- [ ] **Step 2: Run the self-tests and confirm the intended failure**

  ```bash
  bash cumulus/scripts/test-unity-run.sh
  ```

  Expected: nonzero because `unity-run.sh` is absent.

- [ ] **Step 3: Implement Unity version resolution, timeout, and validation**

  Read the exact committed editor version, validate an optional `UNITY` override, launch Unity in its own process group, terminate that group after 15 minutes, and store all evidence beneath the stage directory. Reject nonzero exit; `error CS`; `Shader error`; `Compilation failed`; `Scripts have compiler errors`; unhandled/null/missing-reference exceptions; assertion failures; crash markers; missing completion marker; absent/malformed NUnit XML; failed NUnit result; or nonzero failed/error counts. Add `/Artifacts/CumulusMvpVerification/` and `/Builds/CumulusMvpVerification/` to `cumulus/.gitignore` before the first harness run.

- [ ] **Step 4: Run validator self-tests**

  ```bash
  bash cumulus/scripts/test-unity-run.sh
  ```

  Expected: exit `0`, with every invalid fixture explicitly reported as rejected.

- [ ] **Step 5: Verify the untouched Cumulus project compiles through the harness**

  ```bash
  source cumulus/scripts/lib/unity-run.sh
  run_unity_stage baseline-compile nographics -quit
  ```

  Expected: exit `0`; the stage log contains Unity's successful batch shutdown marker and none of the strict failure signatures. This establishes a trusted compilation path before feature code is introduced.

- [ ] **Step 6: Commit and push**

  ```bash
  git add cumulus/.gitignore cumulus/scripts
  git commit -m "test(cumulus): add fail-closed Unity command harness" -m "Resolve the committed editor exactly, bound Unity process lifetime, reject compiler and runtime error signatures, validate NUnit evidence, and self-test every negative path before feature work begins."
  git push -u origin HEAD
  ```

---

### Task 1: Semantic Materials and Tangible Panel Geometry

**Files:**
- Create: `cumulus/Assets/CumulusMvp/Runtime/CumulusMvp.Runtime.asmdef`
- Create: `cumulus/Assets/CumulusMvp/Runtime/Materials/CumulusMaterialRole.cs`
- Create: `cumulus/Assets/CumulusMvp/Runtime/Materials/CumulusMaterialLibrary.cs`
- Create: `cumulus/Assets/CumulusMvp/Runtime/Geometry/CumulusRoundedPanelMesh.cs`
- Create: `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusMvp.EditModeTests.asmdef`
- Create: `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusRoundedPanelMeshTests.cs`
- Create all Unity `.meta` files generated for the new folders and assets.

**Interfaces:**
- Produces: `enum CumulusMaterialRole { SceneGlass, OnGlass, SolidChrome }`.
- Produces: `Material CumulusMaterialLibrary.Resolve(CumulusMaterialRole role)` and `void CumulusMaterialLibrary.Validate()`.
- Produces: `Mesh CumulusRoundedPanelMesh.Create(float width, float height, float depth, float cornerRadius, int cornerSegments)`.
- Consumes: Unity `Mesh`, `Material`, and `ScriptableObject` only; rendering and interaction are not part of this task.

- [ ] **Step 1: Create the runtime and EditMode assembly definitions**

  Make `CumulusMvp.Runtime` reference `Unity.InputSystem`, `Unity.RenderPipelines.Core.Runtime`, and `Unity.RenderPipelines.Universal.Runtime`. Make `CumulusMvp.EditModeTests` editor-only, reference `CumulusMvp.Runtime`, and enable `TestAssemblies`.

- [ ] **Step 2: Write failing mesh and material-role tests**

  Assert that a `4 × 2 × 0.12` panel with radius `0.24` and four corner segments has nonempty front, back, and bevel triangles; bounds equal the requested dimensions within `0.001`; every triangle index is valid; every normal is finite; and the mesh has no zero-area triangles. In the test, create three temporary materials with `Hidden/InternalErrorShader` and assign them through `SerializedObject`; assert all three enum values resolve to those three distinct shared materials and that clearing one assignment makes `Validate()` throw `InvalidOperationException` naming the missing role.

- [ ] **Step 3: Run the targeted EditMode tests and confirm the intended failure**

  Run from the repository root:

  ```bash
  source cumulus/scripts/lib/unity-run.sh
  run_unity_stage task1-mesh-tests nographics -runTests -testPlatform EditMode -testFilter CumulusMvp.Tests.CumulusRoundedPanelMeshTests -testResults "$PWD/cumulus/Artifacts/CumulusMvpVerification/stages/task1-mesh-tests/results.xml"
  ```

  Expected: nonzero exit or failed tests because the runtime types are absent.

- [ ] **Step 4: Implement the closed material roles and deterministic panel mesh**

  Keep the serialized material fields private, expose only `Resolve(role)`, and implement the role switch exhaustively. Generate shared vertices per face where normals must differ, clockwise/counter-clockwise winding appropriate to Unity, UVs spanning the front face, and a shallow side bevel suitable for light response. Reject nonpositive dimensions, radius outside `(0, min(width,height)/2)`, depth greater than the radius, and fewer than two corner segments with `ArgumentOutOfRangeException` naming the invalid argument.

- [ ] **Step 5: Run the targeted tests and inspect the generated mesh in an editor test**

  Repeat the Task 1 harness command. Expected: exit code `0`, all `CumulusRoundedPanelMeshTests` pass, and the stage's validated NUnit XML reports zero failures.

- [ ] **Step 6: Commit and push**

  ```bash
  git add cumulus/Assets/CumulusMvp
  git commit -m "feat(cumulus): establish Cumulus MVP material roles and panel geometry" -m "Define the closed three-role material vocabulary and a validated procedural rounded panel mesh, with EditMode coverage for bounds, topology, normals, and invalid authoring inputs."
  git push -u origin HEAD
  ```

---

### Task 2: One Shared Render Graph Blur per Camera

**Files:**
- Create: `cumulus/Assets/CumulusMvp/Runtime/Rendering/CumulusGlassShaderIds.cs`
- Create: `cumulus/Assets/CumulusMvp/Runtime/Rendering/CumulusGlassBlurDescriptor.cs`
- Create: `cumulus/Assets/CumulusMvp/Runtime/Rendering/CumulusGlassRendererFeature.cs`
- Create: `cumulus/Assets/CumulusMvp/Runtime/Diagnostics/CumulusGlassDiagnostics.cs`
- Create: `cumulus/Assets/CumulusMvp/Shaders/CumulusSeparableBlur.shader`
- Create: `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusGlassRenderingTests.cs`

**Interfaces:**
- Consumes: the active `UniversalResourceData.activeColorTexture` at `BeforeRenderingTransparents`.
- Produces: global texture ID `_CumulusGlassBlurTexture`, texel-size ID `_CumulusGlassBlurTexelSize`, and availability ID `_CumulusGlassAvailable` from `CumulusGlassShaderIds`.
- Produces: `RenderTextureDescriptor CumulusGlassBlurDescriptor.Create(RenderTextureDescriptor source)`.
- Produces: `CumulusGlassRendererFeature`, containing one pass that records exactly `Cumulus Glass Blur Horizontal` and `Cumulus Glass Blur Vertical`.
- Produces: immutable `CumulusGlassFrameFacts` values from `CumulusGlassDiagnostics.TryGetFrameFacts(int cameraInstanceId, int frameCount, out CumulusGlassFrameFacts facts)` with input/output dimensions, graph-record count, horizontal-pass count, vertical-pass count, and availability.

- [ ] **Step 1: Write failing descriptor and renderer-feature contract tests**

  For source sizes `2560 × 1440`, `2559 × 1439`, and `1 × 1`, assert destination sizes `1280 × 720`, `1280 × 720`, and `1 × 1` using ceiling division. Assert `msaaSamples == 1`, `depthBufferBits == 0`, and source graphics format preservation. Reflect the renderer feature and assert its pass event is `BeforeRenderingTransparents`, its shader property IDs match the three required names, and it owns one blur material reference rather than per-pane state. Assert diagnostics reject stale frame numbers, overwrite rather than accumulate repeated facts for a camera/frame key, and reset all state between tests.

- [ ] **Step 2: Run the rendering tests and confirm the intended failure**

  Run the Task 1 command with `-testFilter CumulusMvp.Tests.CumulusGlassRenderingTests` and Task 2 result/log paths. Expected: failed compilation or tests because the rendering types do not exist.

- [ ] **Step 3: Implement the pure descriptor transform and shader ID registry**

  Preserve HDR graphics format, use ceiling division for odd dimensions, clamp both dimensions to at least one, disable MSAA, remove depth, disable mip maps, and name transient graph resources `Cumulus Glass Blur Ping` and `Cumulus Glass Blur`.

- [ ] **Step 4: Implement the Render Graph renderer feature**

  `Create()` constructs one `ScriptableRenderPass` with `requiresIntermediateTexture = true`. `AddRenderPasses()` enqueues it for `CameraType.Game` only when the blur material is assigned. `RecordRenderGraph()` reads the active color texture, creates two half-resolution transient textures, records horizontal and vertical `RenderGraphUtils.AddBlitPass` calls, and uses the returned vertical-pass builder's `SetGlobalTextureAfterPass` to bind `_CumulusGlassBlurTexture`. Set texel size and availability in the same graph-owned execution path; reset availability when the feature is disabled or disposed. Publish one immutable diagnostics snapshot for that camera and frame without retaining render textures or allocating after initialization. Log a single initialization line containing camera name, dimensions, and active mode rather than logging every frame.

- [ ] **Step 5: Implement the separable blur shader**

  Give the shader two fixed passes: horizontal samples in output-pixel X and vertical samples in output-pixel Y. Use one symmetric, normalized kernel shared by both passes, clamp UVs to half a texel inside the source, sample in linear HDR color, and make the radius a renderer-feature setting fixed to the 22-output-pixel reference at render scale `1.0`. Do not expose the radius on pane materials.

- [ ] **Step 6: Run the targeted tests and perform a Unity compile smoke test**

  ```bash
  source cumulus/scripts/lib/unity-run.sh
  run_unity_stage task2-rendering-tests nographics -runTests -testPlatform EditMode -testFilter CumulusMvp.Tests.CumulusGlassRenderingTests -testResults "$PWD/cumulus/Artifacts/CumulusMvpVerification/stages/task2-rendering-tests/results.xml"
  run_unity_stage task2-compile nographics -quit
  ```

  Expected: both stages exit `0`; NUnit reports zero failures; the strict compile-stage scan finds no C# compiler, shader compiler, exception, assertion, or crash signature.

- [ ] **Step 7: Commit and push**

  ```bash
  git add cumulus/Assets/CumulusMvp
  git commit -m "feat(cumulus): add shared Cumulus glass Render Graph blur" -m "Capture the active opaque scene once per game camera, generate half-resolution horizontal and vertical blur resources, and publish one global frost texture for all Cumulus panes."
  git push
  ```

---

### Task 3: Scene Glass, On-Glass, and Solid Chrome Rendering

**Files:**
- Create: `cumulus/Assets/CumulusMvp/Shaders/CumulusSceneGlass.shader`
- Create: `cumulus/Assets/CumulusMvp/Shaders/CumulusOnGlass.shader`
- Create: `cumulus/Assets/CumulusMvp/Editor/CumulusMvp.Editor.asmdef`
- Create: `cumulus/Assets/CumulusMvp/Editor/CumulusGlassLabBuilder.cs` with material-only build entry points in this task.
- Create: `cumulus/Assets/CumulusMvp/Materials/CumulusSceneGlass.mat`
- Create: `cumulus/Assets/CumulusMvp/Materials/CumulusOnGlass.mat`
- Create: `cumulus/Assets/CumulusMvp/Materials/CumulusSolidChrome.mat`
- Create: `cumulus/Assets/CumulusMvp/Materials/CumulusBlur.mat`
- Create: `cumulus/Assets/CumulusMvp/Materials/CumulusMaterialLibrary.asset`
- Modify: `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusGlassRenderingTests.cs`

**Interfaces:**
- Consumes: `_CumulusGlassBlurTexture`, `_CumulusGlassBlurTexelSize`, and `_CumulusGlassAvailable` from Task 2.
- Produces: menu/CLI method `CumulusMvp.Editor.CumulusGlassLabBuilder.RebuildMaterials()`.
- Produces: four shared materials and one validated `CumulusMaterialLibrary` asset at the exact paths above.

- [ ] **Step 1: Extend the rendering tests with failing shader and asset contracts**

  Assert `Shader.Find("CumulusMvp/SceneGlass")` and `Shader.Find("CumulusMvp/OnGlass")` are non-null. Assert the scene shader declares the shared blur texture and fixed Cumulus material properties; assert the on-glass shader does not declare or sample `_CumulusGlassBlurTexture`. After `RebuildMaterials()`, assert all four material paths exist, repeated rebuilds retain their GUIDs, the library resolves three distinct shared instances, and the scene material has render queue `Transparent`.

- [ ] **Step 2: Run the extended tests and confirm the intended failure**

  Run the Task 2 filtered test command. Expected: failures identifying missing shaders, builder, and material assets.

- [ ] **Step 3: Implement the scene-glass shader**

  Compose the blurred source exactly once: saturate around luminance by `1.5`, apply the fixed neutral near-black fill at alpha `0.54`, then add pane-UV anchored diagonal sheen, rim, top inset highlight, main-light specular, and Fresnel. The background sample is transmission and must not enter the direct diffuse-light calculation. When `_CumulusGlassAvailable < 0.5`, render the same lit shell over a deterministic 72%-alpha interior. Use transparent blending, depth test against the opaque scene, and no depth write for this MVP.

- [ ] **Step 4: Implement the on-glass shader and solid material role**

  On-glass uses a low-alpha neutral lens, brighter rim, and tighter local highlight without scene-color sampling. Solid chrome uses the committed URP Lit shader with an opaque deep-plum/black base and normal shadow casting. Keep label text warm white and unlit so moving scene light cannot destroy contrast.

- [ ] **Step 5: Implement idempotent material asset generation**

  The editor builder creates or updates assets in place, assigns shaders and fixed role values, assigns the existing material objects to `CumulusMaterialLibrary`, calls `Validate()`, saves assets, and never deletes/recreates an asset that already exists. Expose no per-scene material knobs.

- [ ] **Step 6: Rebuild assets and run the tests**

  ```bash
  source cumulus/scripts/lib/unity-run.sh
  run_unity_stage task3-build-materials nographics -quit -executeMethod CumulusMvp.Editor.CumulusGlassLabBuilder.RebuildMaterials
  find cumulus/Assets/CumulusMvp/Materials -type f -print0 | sort -z | xargs -0 shasum > /tmp/cumulus-cumulus-task3-before.sha
  run_unity_stage task3-rebuild-materials nographics -quit -executeMethod CumulusMvp.Editor.CumulusGlassLabBuilder.RebuildMaterials
  find cumulus/Assets/CumulusMvp/Materials -type f -print0 | sort -z | xargs -0 shasum > /tmp/cumulus-cumulus-task3-after.sha
  diff -u /tmp/cumulus-cumulus-task3-before.sha /tmp/cumulus-cumulus-task3-after.sha
  run_unity_stage task3-rendering-tests nographics -runTests -testPlatform EditMode -testFilter CumulusMvp.Tests.CumulusGlassRenderingTests -testResults "$PWD/cumulus/Artifacts/CumulusMvpVerification/stages/task3-rendering-tests/results.xml"
  ```

  Expected: all three Unity stages exit `0`; the hash manifests are identical; tests report zero failures.

- [ ] **Step 7: Commit and push**

  ```bash
  git add cumulus/Assets/CumulusMvp
  git commit -m "feat(cumulus): define Cumulus MVP glass material vocabulary" -m "Add fixed scene-glass, nested on-glass, and solid-chrome rendering roles with deterministic fallback behavior and idempotently generated shared material assets."
  git push
  ```

---

### Task 4: Stable World-Space Press Interaction and Object Travel

**Files:**
- Create: `cumulus/Assets/CumulusMvp/Runtime/Interaction/CumulusPressable.cs`
- Create: `cumulus/Assets/CumulusMvp/Runtime/Interaction/CumulusPointerInteractor.cs`
- Create: `cumulus/Assets/CumulusMvp/Runtime/Motion/CumulusCubicBezier.cs`
- Create: `cumulus/Assets/CumulusMvp/Runtime/Motion/CumulusPanelTravel.cs`
- Create: `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusCubicBezierTests.cs`
- Create: `cumulus/Assets/CumulusMvp/Tests/PlayMode/CumulusMvp.PlayModeTests.asmdef`
- Create: `cumulus/Assets/CumulusMvp/Tests/PlayMode/CumulusPressableTests.cs`
- Create: `cumulus/Assets/CumulusMvp/Tests/PlayMode/CumulusPanelTravelTests.cs`

**Interfaces:**
- Produces: `void CumulusPressable.SetHovered(bool hovered)`, `void CumulusPressable.BeginPress()`, and `bool CumulusPressable.EndPress(bool pointerStillOver)`; successful `EndPress` raises `Activated` once.
- Produces: `float CumulusCubicBezier.Evaluate(float progress, Vector2 control1, Vector2 control2)`.
- Produces: `void CumulusPanelTravel.ToggleDestination()` and read-only `bool IsTravelling`.
- Consumes: one stable root `Collider`, one visual child `Transform`, and two anchor `Transform`s.

- [ ] **Step 1: Write failing easing, press-state, and travel tests**

  Assert the Bézier evaluator maps `0 → 0` and `1 → 1`, is finite and monotonically increasing over 101 samples for `(0.16,1)` and `(0.3,1)`, and returns the same result for repeated inputs. In PlayMode, assert hover scales only the visual child, press scale wins over hover, releasing away cancels activation, releasing over raises one activation, the collider bounds never change, travel reaches each exact anchor in `0.42 ± 0.02` seconds, and interruption continues from the current transform without snapping. Use Input System test devices to move a virtual mouse onto the projected collider, press/release it, and verify the real `CumulusPointerInteractor` path raises one activation; move the virtual mouse off before release and verify cancellation.

- [ ] **Step 2: Run EditMode and PlayMode filters and confirm the intended failures**

  Run the EditMode command filtered to `CumulusCubicBezierTests`, then a PlayMode command filtered to `CumulusMvp.Tests.PlayMode`. Expected: missing-type compilation failures or failed tests.

- [ ] **Step 3: Implement the press state machine**

  Keep semantic state on the root and scale only the assigned visual child. Apply fixed Cumulus hover and press factors, with pressed state taking precedence. Treat a press that begins on the control and ends off it as cancellation. Log only successful activation with the control's stable semantic ID.

- [ ] **Step 4: Implement mouse raycast routing**

  Use `Mouse.current`, the assigned camera, and `Physics.Raycast` once per frame. Track one hovered and one pressed `CumulusPressable`; transition state only when the hit target changes; deliver release to the original pressed target with `pointerStillOver` computed from the current hit. Do not derive hit state from decorative child meshes.

- [ ] **Step 5: Implement fixed Bézier easing and interruptible travel**

  Solve cubic Bézier X for the normalized clock input and return Y; use bounded Newton iterations with bisection fallback. Travel position with `Vector3.LerpUnclamped` and rotation with `Quaternion.SlerpUnclamped`; preserve current position/rotation when a new destination is requested mid-flight; keep the panel root, label, button, sheen UVs, and collider in one moving hierarchy.

- [ ] **Step 6: Run targeted EditMode and PlayMode tests**

  ```bash
  source cumulus/scripts/lib/unity-run.sh
  run_unity_stage task4-edit-tests nographics -runTests -testPlatform EditMode -testFilter CumulusMvp.Tests.CumulusCubicBezierTests -testResults "$PWD/cumulus/Artifacts/CumulusMvpVerification/stages/task4-edit-tests/results.xml"
  run_unity_stage task4-play-tests graphics -runTests -testPlatform PlayMode -testFilter CumulusMvp.Tests.PlayMode -testResults "$PWD/cumulus/Artifacts/CumulusMvpVerification/stages/task4-play-tests/results.xml"
  ```

  Expected: both commands exit `0`; all targeted tests pass; logs contain no unhandled exceptions.

- [ ] **Step 7: Commit and push**

  ```bash
  git add cumulus/Assets/CumulusMvp
  git commit -m "feat(cumulus): add tangible Cumulus press and travel behavior" -m "Route mouse rays through stable semantic colliders, preserve press-over-hover precedence and cancellation, and move complete panel hierarchies between anchors on Cumulus's fixed object-travel curve."
  git push
  ```

---

### Task 5: Deterministic Cumulus Glass Lab Scene

**Files:**
- Create: `cumulus/Assets/CumulusMvp/Runtime/Demo/CumulusSpinner.cs`
- Create: `cumulus/Assets/CumulusMvp/Runtime/Demo/CumulusLightOrbit.cs`
- Create: `cumulus/Assets/CumulusMvp/Runtime/Demo/CumulusVerificationMarkers.cs`
- Modify: `cumulus/Assets/CumulusMvp/Editor/CumulusGlassLabBuilder.cs`
- Create: `cumulus/Assets/CumulusMvp/Meshes/CumulusPanel.asset`
- Create: `cumulus/Assets/CumulusMvp/Prefabs/CumulusGlassPanel.prefab`
- Create: `cumulus/Assets/Scenes/CumulusGlassLab.unity`
- Modify: `cumulus/Assets/Settings/PC_Renderer.asset`
- Modify: `cumulus/ProjectSettings/EditorBuildSettings.asset`
- Create: `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusGlassLabAssetTests.cs`

**Interfaces:**
- Consumes: all Tasks 1–4 runtime contracts and shared assets.
- Produces: menu/CLI method `CumulusMvp.Editor.CumulusGlassLabBuilder.Rebuild()`.
- Produces: one scene containing exactly two independent scene-glass panes, one nested on-glass button, one moving high-contrast object, one moving directional light, and two panel anchors.
- Produces: deterministic `SetPhase(float normalizedPhase)` methods on the spinner and light plus named `Rect GetViewportRegion(CumulusVerificationRegion region, Camera camera)` probes for `LiveGlassA`, `LiveGlassB`, `UncoveredPattern`, `OnGlassButton`, `SolidBevel`, `FrameShadowReceiver`, and `PrimaryLabel`.

- [ ] **Step 1: Write failing lab-asset tests**

  Run `Rebuild()` twice and assert stable GUIDs for the mesh, four materials, library, prefab, and scene. Assert `PC_Renderer.asset` contains exactly one active `CumulusGlassRendererFeature` with the shared blur material. Open the scene additively and assert exact object names and counts, two scene-glass renderers share the same material object, the nested button uses the on-glass material, the solid frame uses an opaque material with `ShadowCastingMode.On`, both labels are `TextMesh` components outside any Canvas, every pressable has one stable root collider, all seven verification regions project inside the camera viewport without overlap, and `EditorBuildSettings` enables only `Assets/Scenes/CumulusGlassLab.unity` for the MVP.

- [ ] **Step 2: Run the lab-asset tests and confirm the intended failure**

  Run the EditMode command filtered to `CumulusMvp.Tests.CumulusGlassLabAssetTests`. Expected: failures for missing builder output and project wiring.

- [ ] **Step 3: Implement deterministic background motion and lighting**

  `CumulusSpinner` rotates a striped opaque object at a fixed angular velocity behind both panes. `CumulusLightOrbit` changes the directional light orientation on a fixed loop so bevel highlights visibly travel. Both expose deterministic normalized phase setters used by tests; ordinary Play Mode advances the same phase from elapsed time. Neither component uses randomness or allocates per frame.

- [ ] **Step 4: Complete the idempotent scene builder**

  Build a fixed camera, bright/dark/gold background geometry, ground receiver, moving striped object, directional light, source/destination anchors, main panel prefab instance, and second independent glass pane. The main panel hierarchy contains the shallow glass face, opaque bevel/frame, warm-white mesh label, raised on-glass button visual, stable button collider, pressable, and travel component. Wire button activation to `ToggleDestination()` in serialized scene data. Add one `CumulusPointerInteractor` to the camera, one `CumulusVerificationMarkers` object whose named regions are fully visible at `512 × 288`, including a clean ground patch receiving the frame shadow, and log Unity/URP versions plus `live-shared-blur` mode at scene start.

- [ ] **Step 5: Install exactly one renderer feature and update build settings**

  Add the feature as a serialized subasset of `PC_Renderer.asset`, retain SSAO, prevent duplicates by type, assign `CumulusBlur.mat`, and mark renderer data dirty. Set `CumulusGlassLab.unity` as the sole enabled build scene. Preserve the mobile renderer unchanged.

- [ ] **Step 6: Generate and validate committed assets**

  ```bash
  source cumulus/scripts/lib/unity-run.sh
  run_unity_stage task5-build-scene nographics -quit -executeMethod CumulusMvp.Editor.CumulusGlassLabBuilder.Rebuild
  find cumulus/Assets/CumulusMvp cumulus/Assets/Scenes/CumulusGlassLab.unity cumulus/Assets/Scenes/CumulusGlassLab.unity.meta cumulus/Assets/Settings/PC_Renderer.asset cumulus/ProjectSettings/EditorBuildSettings.asset -type f -print0 | sort -z | xargs -0 shasum > /tmp/cumulus-cumulus-task5-before.sha
  run_unity_stage task5-rebuild-scene nographics -quit -executeMethod CumulusMvp.Editor.CumulusGlassLabBuilder.Rebuild
  find cumulus/Assets/CumulusMvp cumulus/Assets/Scenes/CumulusGlassLab.unity cumulus/Assets/Scenes/CumulusGlassLab.unity.meta cumulus/Assets/Settings/PC_Renderer.asset cumulus/ProjectSettings/EditorBuildSettings.asset -type f -print0 | sort -z | xargs -0 shasum > /tmp/cumulus-cumulus-task5-after.sha
  diff -u /tmp/cumulus-cumulus-task5-before.sha /tmp/cumulus-cumulus-task5-after.sha
  run_unity_stage task5-asset-tests nographics -runTests -testPlatform EditMode -testFilter CumulusMvp.Tests.CumulusGlassLabAssetTests -testResults "$PWD/cumulus/Artifacts/CumulusMvpVerification/stages/task5-asset-tests/results.xml"
  ```

  Expected: rebuild exits `0`; a second rebuild creates no diff; tests exit `0` with zero failures.

- [ ] **Step 7: Commit and push**

  ```bash
  git add cumulus/Assets/CumulusMvp cumulus/Assets/Scenes/CumulusGlassLab.unity cumulus/Assets/Scenes/CumulusGlassLab.unity.meta cumulus/Assets/Settings/PC_Renderer.asset cumulus/ProjectSettings/EditorBuildSettings.asset
  git commit -m "feat(cumulus): assemble deterministic Cumulus glass lab" -m "Create the playable two-pane proof scene, shared-material panel prefab, moving opaque subject and light, renderer-feature wiring, and idempotent asset builder with structural coverage."
  git push
  ```

---

### Task 6: Autonomous Compilation, Runtime, GPU, and Build Gate

**Files:**
- Modify: `cumulus/scripts/lib/unity-run.sh`
- Modify: `cumulus/scripts/test-unity-run.sh`
- Create: `cumulus/scripts/verify-cumulus-mvp.sh`
- Modify: `cumulus/.gitignore`
- Create: `cumulus/Assets/CumulusMvp/Editor/CumulusMvpBatchVerification.cs`
- Create: `cumulus/Assets/CumulusMvp/Tests/Support/CumulusMvp.TestSupport.asmdef`
- Create: `cumulus/Assets/CumulusMvp/Tests/Support/CumulusImageMetrics.cs`
- Create: `cumulus/Assets/CumulusMvp/Tests/Support/CumulusGpuAcceptance.cs`
- Create: `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusImageMetricsTests.cs`
- Create: `cumulus/Assets/CumulusMvp/Tests/PlayMode/CumulusGlassGpuTests.cs`
- Modify: `cumulus/Assets/CumulusMvp/Tests/EditMode/CumulusMvp.EditModeTests.asmdef`
- Modify: `cumulus/Assets/CumulusMvp/Tests/PlayMode/CumulusMvp.PlayModeTests.asmdef`

**Interfaces:**
- Produces: `cumulus/scripts/verify-cumulus-mvp.sh`, invoked from the repository root with no arguments and returning `0` only when every stage passes.
- Produces: `run_unity_stage <stage-name> <graphics|nographics> <unity arguments...>` and `validate_unity_result <stage-name> <log-path> [nunit-xml-path]` in `unity-run.sh`.
- Produces: `CumulusMvp.Editor.CumulusMvpBatchVerification.InspectShadersAndBuildPlayer()`; it exits Unity nonzero on any shader error or unsuccessful build.
- Produces: `CumulusImageMetrics` functions for mean absolute RGB difference, luminance edge energy, percentile contrast, and region PNG encoding.
- Produces: `CumulusGpuAcceptanceResult` records containing metric name, measured value, comparison, threshold, pass/fail, frame phases, graphics API, and device name.
- Produces ignored evidence under `cumulus/Artifacts/CumulusMvpVerification/` and ignored player output under `cumulus/Builds/CumulusMvpVerification/`.

- [ ] **Step 1: Write failing image-metric boundary tests**

  Test constant-color images, a single hard edge, a blurred edge, identical/different frames, percentile contrast with known luminances, image correlation, empty regions, out-of-bounds regions, NaN input, and images with mismatched dimensions. For each committed threshold, construct one result immediately inside and immediately outside the boundary and assert the verdict flips. Use these initial named thresholds: `liveBackdropDelta >= 0.015`, `blurEdgeEnergyRatio <= 0.65`, `blurEdgeEnergyRatio >= 0.05`, `sharedGraphRecords == 1`, `horizontalPasses == 1`, `verticalPasses == 1`, `onGlassAdditionalPasses == 0`, `onGlassBackdropDelta >= 0.005`, `onGlassBackdropCorrelation >= 0.5`, `bevelLightDelta >= 0.02`, `transmissionLightDeltaRatio <= 0.25`, `frameShadowDelta >= 0.02`, `labelContrast >= 4.5`, `fallbackInteriorLuminance >= 0.02`, and `fallbackInteriorLuminance <= 0.8`.

- [ ] **Step 2: Run the image-metric tests and confirm the intended failure**

  ```bash
  source cumulus/scripts/lib/unity-run.sh
  run_unity_stage task6-metric-tests-red nographics -runTests -testPlatform EditMode -testFilter CumulusMvp.Tests.CumulusImageMetricsTests -testResults "$PWD/cumulus/Artifacts/CumulusMvpVerification/stages/task6-metric-tests-red/results.xml"
  ```

  Expected: the harness returns nonzero because the test-support assembly and metrics are absent, and it identifies either compilation failure or failed NUnit evidence.

- [ ] **Step 3: Implement deterministic image metrics and JSON records**

  Operate on linear `Color32` buffers with explicit sRGB-to-linear conversion. Compute edge energy as the mean absolute horizontal and vertical luminance derivative inside a region; compute label contrast from the ratio between the 95th-percentile glyph luminance and the median one-pixel expanded border luminance; reject empty/non-finite inputs rather than returning a passing default. Serialize every measurement and threshold even when one assertion fails, so agents can distinguish a rendering regression from missing evidence.

- [ ] **Step 4: Write GPU-backed PlayMode acceptance tests**

  Load `CumulusGlassLab.unity`, target its camera at a `512 × 288` `ARGB32` render texture, set spinner/light phases explicitly, render, and read pixels back from the GPU. Use `CumulusVerificationMarkers` to derive regions rather than hard-coded pixel coordinates. Save phase captures and `render-metrics.json` even on failure. Assert:

  - both live-glass regions change by at least `0.015` mean absolute RGB when only the opaque spinner phase changes;
  - edge energy through glass is between `0.05` and `0.65` of the uncovered-pattern edge energy, proving the source is softened rather than frozen, missing, or simply copied;
  - `CumulusGlassDiagnostics` reports one graph record, one horizontal pass, and one vertical pass for a rendered camera frame with both panes enabled;
  - disabling either independent pane and separately disabling the on-glass button leaves those three pass counts unchanged, proving work is per camera rather than per surface;
  - the on-glass region changes by at least `0.005` and correlates with its parent backdrop at `0.5` or greater as the spinner moves, proving it preserves inherited scene color rather than becoming opaque or requesting recursive frost;
  - changing only light phase changes the solid bevel by at least `0.02` while the center transmission region changes by at most `0.25` of that amount, guarding against double-lighting the captured scene;
  - toggling only the solid frame's `shadowCastingMode` between `On` and `Off` changes the named ground receiver region by at least `0.02`, proving the authored frame shadow reaches the scene;
  - the primary-label region estimates at least `4.5:1` contrast over bright, gold, and dark background phases;
  - deactivating the renderer feature through `ScriptableRendererFeature.SetActive(false)` produces finite fallback pixels whose interior luminance stays between `0.02` and `0.8` while existing press/travel PlayMode tests still pass; restore the feature in `finally` so the committed asset remains active.

- [ ] **Step 5: Implement shader inspection and standalone build verification**

  `InspectShadersAndBuildPlayer()` loads `CumulusMvp/SceneGlass`, `CumulusMvp/OnGlass`, and `Hidden/CumulusMvp/SeparableBlur`, calls `ShaderUtil.GetShaderMessages`, writes every message to `shader-report.json`, and exits with code `21` if any message has error severity. It then builds the enabled scene for `BuildTarget.StandaloneOSX` into `cumulus/Builds/CumulusMvpVerification/CumulusCumulusMvp.app`, writes `BuildReport.summary` fields to `build-report.json`, and exits with code `22` unless the result is `Succeeded`. This player build is the platform shader/serialization/stripping compilation check; editor import alone is not sufficient.

- [ ] **Step 6: Implement the one-command orchestrator**

  `verify-cumulus-mvp.sh` removes and recreates the ignored artifact directory, installs a trap that always writes the failing stage to `summary.json`, and runs these stages in order:

  1. shell harness self-tests;
  2. clean Unity import/compilation with `-batchmode -nographics -quit`;
  3. `CumulusGlassLabBuilder.Rebuild` twice with a before/after hash-manifest equality check;
  4. full EditMode tests with NUnit XML validation;
  5. full graphics-enabled PlayMode tests with NUnit XML validation and required `render-metrics.json`/PNG existence checks;
  6. `CumulusMvpBatchVerification.InspectShadersAndBuildPlayer` with shader/build JSON validation;
  7. repository-root `npm run lint`, `npm run typecheck`, and `npm test` with captured logs;
  8. a static scope guard that rejects any diff to `Mobile_Renderer.asset`, tracked `Assets/TextMesh Pro` or UI document assets, missing Unity `.meta` partners, runtime `new Material(...)`, per-pane camera/render-texture fields, and imports from uGUI/UI Toolkit namespaces.

  Scan each Unity log immediately after its process exits. On success, write `summary.json` with `overall: "passed"`, exact Unity/URP versions, graphics API/device, Git commit, stage durations, test counts, shader error count, build result/size, render metrics, and artifact paths. The script prints only the final verdict and summary path after stage progress.

- [ ] **Step 7: Run the complete gate twice from a clean process state**

  ```bash
  bash cumulus/scripts/verify-cumulus-mvp.sh
  cp cumulus/Artifacts/CumulusMvpVerification/summary.json /tmp/cumulus-cumulus-first-summary.json
  bash cumulus/scripts/verify-cumulus-mvp.sh
  ```

  Expected: both runs exit `0`; both summaries report `overall: "passed"`; all tests have zero failures; shader error count is zero; build result is `Succeeded`; every GPU metric passes; and the second run reports the same metric verdicts and asset hash manifest as the first. Raw floating-point GPU values may differ, but neither run may cross a threshold.

- [ ] **Step 8: Prove the live gate rejects a controlled failure without modifying production files**

  Invoke the harness validator against one synthetic compiler-error log, invoke `CumulusGpuAcceptance` against one synthetic metric outside its threshold, and feed the scope guard a synthetic forbidden path/runtime allocation. Expected: all three return nonzero and identify the exact rejected signature, metric, or scope rule. Do not introduce and revert a compiler error in tracked Unity source; committed negative controls are the safe proof that the gate fails closed.

- [ ] **Step 9: Commit and push**

  ```bash
  git add cumulus/.gitignore cumulus/scripts cumulus/Assets/CumulusMvp
  git commit -m "test(cumulus): add autonomous Cumulus MVP verification gate" -m "Fail closed on Unity and shader compilation errors, validate NUnit outputs and strict logs, exercise deterministic GPU rendering metrics, build a standalone player, and emit machine-readable evidence through one agent-safe command."
  git push
  ```

---

### Task 7: Documentation, Optional Visual Review, and Promotion Handoff

**Files:**
- Create: `cumulus/Assets/CumulusMvp/README.md`
- Modify if findings require fixes: files created in Tasks 1–6.
- Modify if a pre-existing issue is discovered: `pre-existing-issues.txt`.

**Interfaces:**
- Consumes: `cumulus/scripts/verify-cumulus-mvp.sh` and its ignored evidence directory.
- Produces: a self-contained agent runbook whose required path is entirely non-interactive; manual inspection is labeled optional.

- [ ] **Step 1: Write the agent-first README**

  Put `bash cumulus/scripts/verify-cumulus-mvp.sh` first. Document prerequisites, exit semantics, timeout behavior, every failure signature, test/result locations, JSON schemas, GPU metric definitions, threshold rationale, how to interpret each failed metric, and the standalone build artifact. Then document optional scene/Render Graph inspection and the bounded PC MVP scope.

- [ ] **Step 2: Run the authoritative gate from the README command**

  ```bash
  bash cumulus/scripts/verify-cumulus-mvp.sh
  ```

  Expected: exit `0` and `cumulus/Artifacts/CumulusMvpVerification/summary.json` reports `overall: "passed"`. This command supersedes ad hoc compile/test commands for completion claims.

- [ ] **Step 3: Audit automated coverage against every acceptance criterion**

  For every item in the final checklist, cite the exact test name or verification-stage field that proves it. If an item has only manual evidence, add an automated assertion or reclassify it as optional presentation review before proceeding.

- [ ] **Step 4: Perform optional visual review and retain artifacts**

  An agent may inspect the generated phase PNGs and open `CumulusGlassLab.unity` at `1920 × 1080` to catch aesthetic issues outside the MVP gate. Record observations separately from the automated verdict. Do not convert an aesthetic preference into a passing result when an automated criterion failed.

- [ ] **Step 5: Review scope and tracked assets**

  Confirm the diff contains no mobile renderer changes, Canvas/uGUI controls, UI Toolkit assets, TextMesh Pro resource import, per-pane render textures, runtime material clones, per-instance material tuning, refraction, recursive glass, controller/touch code, or production token generator. Confirm all new tracked Unity assets have `.meta` files and verification/build artifacts are ignored.

- [ ] **Step 6: Commit and push**

  ```bash
  git add cumulus/Assets/CumulusMvp/README.md
  git add pre-existing-issues.txt 2>/dev/null || true
  git commit -m "docs(cumulus): document autonomous Cumulus MVP verification" -m "Lead with the fail-closed agent command, define evidence and threshold interpretation, map acceptance criteria to automated checks, and retain visual review as optional supporting evidence."
  git push
  ```

- [ ] **Step 7: Request review before promotion**

  Present the pushed branch, Unity scene path, `summary.json` verdict, test counts, shader/build results, GPU metric table, and optional generated images. Follow the `wt` promotion workflow: ask whether to replay the commits onto `master`; do not promote without explicit approval.

---

## Final Acceptance Checklist

- [ ] `verify-cumulus-mvp.sh` exits `0` twice consecutively and both summaries report `overall: "passed"`.
- [ ] Clean Unity import logs contain no C# compilation, shader compilation, assertion, exception, or crash signature.
- [ ] `ShaderUtil.GetShaderMessages` reports zero errors for all three MVP shaders.
- [ ] The standalone macOS player build reports `Succeeded` for the committed scene.
- [ ] GPU tests show a moving opaque object remains live through both independent frosted panes.
- [ ] Diagnostics report one graph record, one horizontal pass, and one vertical pass for the camera regardless of pane count.
- [ ] GPU tests show the on-glass button adds zero blur passes and retains the parent scene signal.
- [ ] Asset/shader contract tests prove fixed Cumulus tint, saturation, rim, sheen, and lit-shell roles.
- [ ] Relational light metrics keep transmission change at or below 25% of bevel change, guarding against double-lighting.
- [ ] GPU tests show the solid bevel responds to the moving light and the ground receiver changes when frame shadow casting is toggled.
- [ ] GPU tests estimate at least `4.5:1` contrast for warm-white world-space mesh text across bright, gold, and dark phases.
- [ ] PlayMode tests prove hover, press, cancellation, and activation use the stable root collider.
- [ ] PlayMode tests prove panel travel lasts 420 ms, follows `(0.16, 1, 0.3, 1)`, and remains smooth when interrupted.
- [ ] PlayMode tests prove panel, button, label, collider, and authored sheen stay spatially aligned during travel.
- [ ] GPU and behavior tests prove the deterministic fallback remains finite, visible, and interactive.
- [ ] EditMode tests, graphics-enabled PlayMode tests, `npm run lint`, `npm run typecheck`, and `npm test` all pass with validated result files.
- [ ] Shell and metric negative controls prove the verification gate rejects known-bad evidence.
- [ ] The static scope guard keeps the implementation confined to the PC proof scene and rejects tracked evidence of every mechanically detectable deferred production system.
