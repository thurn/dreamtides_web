# Cumulus Tango Glass MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one deterministic Unity lab scene that proves live shared Tango frost, tangible mesh controls, stable pointer interaction, and material-continuity motion.

**Architecture:** A URP Render Graph renderer feature downsamples and separably blurs the opaque camera color once per game camera immediately before transparent rendering, then publishes that texture globally for every scene-glass mesh. Strict scene-glass, on-glass, and solid-chrome roles render on procedural shallow geometry; a collider-owning pressable and a separate visual child keep hit volumes stable while hover, press, and panel travel animate the visible object.

**Tech Stack:** Unity 6000.5.3f1, URP 17.5.0, Render Graph, Input System 1.19.0, NUnit/Unity Test Framework 1.7.0, HLSL, C#.

## Global Constraints

- Do all implementation in an isolated `wt` worktree created from `master`; never edit the primary checkout.
- Run `scripts/regenerate-assets.sh` from the repository root immediately after creating the implementation worktree and retain any tracked output in the implementation commits.
- Use Unity 6000.5.3f1 and the committed URP 17.5.0 package with Render Graph enabled; Compatibility Mode is outside this MVP.
- Target the committed PC renderer only. Mobile live glass, Tile-Only Mode, XR, camera stacking, dynamic resolution, and thermal adaptation are outside this MVP.
- Capture opaque scene color and publish the blur at `RenderPassEvent.BeforeRenderingTransparents`. The design document's after-post-processing Tango pass, transparent capture membership, TAA integration, and depth-owner pass are later production work.
- Perform exactly one two-pass shared blur per participating game camera per frame; panes and nested controls never request private cameras, render textures, or blur passes.
- Use half-width and half-height blur textures, one horizontal pass, one vertical pass, `msaaSamples = 1`, and no depth buffer.
- Keep the three material roles closed: `SceneGlass`, `OnGlass`, and `SolidChrome`. Scene instances may select a role but may not supply blur, tint, rim, sheen, saturation, or motion values.
- Use the Tango reference values for the MVP: scene fill `(0.055, 0.055, 0.063, 0.54)`, saturation `1.5`, sheen alpha `0.07`, rim alpha `0.14`, and travel duration `0.42` seconds with cubic Bézier `(0.16, 1, 0.3, 1)`.
- Render labels as world-space mesh text, never through a Canvas, uGUI control, or UI Toolkit panel. The MVP uses Unity `TextMesh` to avoid importing the full TextMesh Pro resource bundle.
- Keep interaction colliders on stable roots. Hover, press, and travel affect visual children and never resize or replace the collider.
- Use shared materials plus `MaterialPropertyBlock` or transforms for runtime state; do not instantiate or clone materials during interaction.
- Do not add refraction, recursive glass, pane crossing, translucent shadow dithering, controller navigation, touch, accessibility, diagnostics UI, token generation, or a general-purpose component catalog.
- New runtime code logs scene initialization, active glass mode, and panel activation so a play session can be reconstructed from the Unity log.
- Each task ends in a detailed commit followed immediately by `git push`; use `git push -u origin HEAD` for the first task and `git push` thereafter.

---

## File Structure

### Runtime and rendering

- `cumulus/Assets/TangoMvp/Runtime/TangoMvp.Runtime.asmdef` — isolated runtime assembly and Input System/URP references.
- `cumulus/Assets/TangoMvp/Runtime/Materials/TangoMaterialRole.cs` — closed semantic role enum.
- `cumulus/Assets/TangoMvp/Runtime/Materials/TangoMaterialLibrary.cs` — role-to-shared-material lookup with exhaustive validation.
- `cumulus/Assets/TangoMvp/Runtime/Geometry/TangoRoundedPanelMesh.cs` — deterministic shallow rounded-panel mesh construction.
- `cumulus/Assets/TangoMvp/Runtime/Rendering/TangoGlassShaderIds.cs` — the only C# definitions of global glass shader property IDs.
- `cumulus/Assets/TangoMvp/Runtime/Rendering/TangoGlassBlurDescriptor.cs` — pure half-resolution descriptor transformation.
- `cumulus/Assets/TangoMvp/Runtime/Rendering/TangoGlassRendererFeature.cs` — renderer feature and Render Graph pass ownership.
- `cumulus/Assets/TangoMvp/Runtime/Interaction/TangoPressable.cs` — semantic hover/press/activate state machine.
- `cumulus/Assets/TangoMvp/Runtime/Interaction/TangoPointerInteractor.cs` — mouse-to-world raycast routing.
- `cumulus/Assets/TangoMvp/Runtime/Motion/TangoCubicBezier.cs` — fixed easing evaluator.
- `cumulus/Assets/TangoMvp/Runtime/Motion/TangoPanelTravel.cs` — interruptible two-anchor object travel.
- `cumulus/Assets/TangoMvp/Runtime/Demo/TangoSpinner.cs` — continuously moving high-contrast backdrop object.
- `cumulus/Assets/TangoMvp/Runtime/Demo/TangoLightOrbit.cs` — continuously moving directional light.

### Shaders and authored assets

- `cumulus/Assets/TangoMvp/Shaders/TangoSeparableBlur.shader` — horizontal and vertical spatial blur passes.
- `cumulus/Assets/TangoMvp/Shaders/TangoSceneGlass.shader` — scene blur sampling, saturation, tint, rim, sheen, Fresnel, and main-light response.
- `cumulus/Assets/TangoMvp/Shaders/TangoOnGlass.shader` — nested tonal lens without backdrop sampling.
- `cumulus/Assets/TangoMvp/Materials/TangoSceneGlass.mat` — shared `SceneGlass` material.
- `cumulus/Assets/TangoMvp/Materials/TangoOnGlass.mat` — shared `OnGlass` material.
- `cumulus/Assets/TangoMvp/Materials/TangoSolidChrome.mat` — shared URP Lit frame and text-backing material.
- `cumulus/Assets/TangoMvp/Materials/TangoBlur.mat` — hidden renderer-feature blur material.
- `cumulus/Assets/TangoMvp/Materials/TangoMaterialLibrary.asset` — the committed role catalog.
- `cumulus/Assets/TangoMvp/Meshes/TangoPanel.asset` — generated reusable shallow rounded-panel mesh.
- `cumulus/Assets/TangoMvp/Prefabs/TangoGlassPanel.prefab` — panel root, stable collider, glass face, bevel, label, and nested button.
- `cumulus/Assets/Scenes/TangoGlassLab.unity` — deterministic playable proof scene.

### Editor tooling and project integration

- `cumulus/Assets/TangoMvp/Editor/TangoMvp.Editor.asmdef` — editor-only assembly.
- `cumulus/Assets/TangoMvp/Editor/TangoGlassLabBuilder.cs` — idempotently rebuilds materials, mesh, prefab, scene, renderer feature, and build settings.
- `cumulus/Assets/Settings/PC_Renderer.asset` — contains one configured `TangoGlassRendererFeature` alongside SSAO.
- `cumulus/ProjectSettings/EditorBuildSettings.asset` — makes `TangoGlassLab.unity` the enabled MVP scene.
- `cumulus/Assets/TangoMvp/README.md` — run instructions, inspection steps, acceptance checklist, and declared MVP boundary.

### Tests

- `cumulus/Assets/TangoMvp/Tests/EditMode/TangoMvp.EditModeTests.asmdef` — editor test assembly.
- `cumulus/Assets/TangoMvp/Tests/EditMode/TangoRoundedPanelMeshTests.cs` — mesh topology and bounds contracts.
- `cumulus/Assets/TangoMvp/Tests/EditMode/TangoGlassRenderingTests.cs` — blur descriptor, shader, material-role, and renderer-feature contracts.
- `cumulus/Assets/TangoMvp/Tests/EditMode/TangoCubicBezierTests.cs` — exact travel easing contracts.
- `cumulus/Assets/TangoMvp/Tests/EditMode/TangoGlassLabAssetTests.cs` — builder idempotence and committed asset wiring.
- `cumulus/Assets/TangoMvp/Tests/PlayMode/TangoMvp.PlayModeTests.asmdef` — play test assembly.
- `cumulus/Assets/TangoMvp/Tests/PlayMode/TangoPressableTests.cs` — pointer-state precedence, cancellation, and stable collider tests.
- `cumulus/Assets/TangoMvp/Tests/PlayMode/TangoPanelTravelTests.cs` — activation, interruption, and hierarchy-alignment tests.

---

### Task 1: Semantic Materials and Tangible Panel Geometry

**Files:**
- Create: `cumulus/Assets/TangoMvp/Runtime/TangoMvp.Runtime.asmdef`
- Create: `cumulus/Assets/TangoMvp/Runtime/Materials/TangoMaterialRole.cs`
- Create: `cumulus/Assets/TangoMvp/Runtime/Materials/TangoMaterialLibrary.cs`
- Create: `cumulus/Assets/TangoMvp/Runtime/Geometry/TangoRoundedPanelMesh.cs`
- Create: `cumulus/Assets/TangoMvp/Tests/EditMode/TangoMvp.EditModeTests.asmdef`
- Create: `cumulus/Assets/TangoMvp/Tests/EditMode/TangoRoundedPanelMeshTests.cs`
- Create all Unity `.meta` files generated for the new folders and assets.

**Interfaces:**
- Produces: `enum TangoMaterialRole { SceneGlass, OnGlass, SolidChrome }`.
- Produces: `Material TangoMaterialLibrary.Resolve(TangoMaterialRole role)` and `void TangoMaterialLibrary.Validate()`.
- Produces: `Mesh TangoRoundedPanelMesh.Create(float width, float height, float depth, float cornerRadius, int cornerSegments)`.
- Consumes: Unity `Mesh`, `Material`, and `ScriptableObject` only; rendering and interaction are not part of this task.

- [ ] **Step 1: Create the runtime and EditMode assembly definitions**

  Make `TangoMvp.Runtime` reference `Unity.InputSystem`, `Unity.RenderPipelines.Core.Runtime`, and `Unity.RenderPipelines.Universal.Runtime`. Make `TangoMvp.EditModeTests` editor-only, reference `TangoMvp.Runtime`, and enable `TestAssemblies`.

- [ ] **Step 2: Write failing mesh and material-role tests**

  Assert that a `4 × 2 × 0.12` panel with radius `0.24` and four corner segments has nonempty front, back, and bevel triangles; bounds equal the requested dimensions within `0.001`; every triangle index is valid; every normal is finite; and the mesh has no zero-area triangles. In the test, create three temporary materials with `Hidden/InternalErrorShader` and assign them through `SerializedObject`; assert all three enum values resolve to those three distinct shared materials and that clearing one assignment makes `Validate()` throw `InvalidOperationException` naming the missing role.

- [ ] **Step 3: Run the targeted EditMode tests and confirm the intended failure**

  Run from the repository root:

  ```bash
  UNITY=/Applications/Unity/Hub/Editor/6000.5.3f1/Unity.app/Contents/MacOS/Unity
  "$UNITY" -batchmode -nographics -projectPath "$PWD/cumulus" -runTests -testPlatform EditMode -testFilter TangoMvp.Tests.TangoRoundedPanelMeshTests -testResults /tmp/cumulus-tango-task1.xml -logFile /tmp/cumulus-tango-task1.log
  ```

  Expected: nonzero exit or failed tests because the runtime types are absent.

- [ ] **Step 4: Implement the closed material roles and deterministic panel mesh**

  Keep the serialized material fields private, expose only `Resolve(role)`, and implement the role switch exhaustively. Generate shared vertices per face where normals must differ, clockwise/counter-clockwise winding appropriate to Unity, UVs spanning the front face, and a shallow side bevel suitable for light response. Reject nonpositive dimensions, radius outside `(0, min(width,height)/2)`, depth greater than the radius, and fewer than two corner segments with `ArgumentOutOfRangeException` naming the invalid argument.

- [ ] **Step 5: Run the targeted tests and inspect the generated mesh in an editor test**

  Repeat the Task 1 Unity command. Expected: exit code `0`, all `TangoRoundedPanelMeshTests` pass, and `/tmp/cumulus-tango-task1.xml` reports zero failures.

- [ ] **Step 6: Commit and push**

  ```bash
  git add cumulus/Assets/TangoMvp
  git commit -m "feat(cumulus): establish Tango MVP material roles and panel geometry" -m "Define the closed three-role material vocabulary and a validated procedural rounded panel mesh, with EditMode coverage for bounds, topology, normals, and invalid authoring inputs."
  git push -u origin HEAD
  ```

---

### Task 2: One Shared Render Graph Blur per Camera

**Files:**
- Create: `cumulus/Assets/TangoMvp/Runtime/Rendering/TangoGlassShaderIds.cs`
- Create: `cumulus/Assets/TangoMvp/Runtime/Rendering/TangoGlassBlurDescriptor.cs`
- Create: `cumulus/Assets/TangoMvp/Runtime/Rendering/TangoGlassRendererFeature.cs`
- Create: `cumulus/Assets/TangoMvp/Shaders/TangoSeparableBlur.shader`
- Create: `cumulus/Assets/TangoMvp/Tests/EditMode/TangoGlassRenderingTests.cs`

**Interfaces:**
- Consumes: the active `UniversalResourceData.activeColorTexture` at `BeforeRenderingTransparents`.
- Produces: global texture ID `_TangoGlassBlurTexture`, texel-size ID `_TangoGlassBlurTexelSize`, and availability ID `_TangoGlassAvailable` from `TangoGlassShaderIds`.
- Produces: `RenderTextureDescriptor TangoGlassBlurDescriptor.Create(RenderTextureDescriptor source)`.
- Produces: `TangoGlassRendererFeature`, containing one pass that records exactly `Tango Glass Blur Horizontal` and `Tango Glass Blur Vertical`.

- [ ] **Step 1: Write failing descriptor and renderer-feature contract tests**

  For source sizes `2560 × 1440`, `2559 × 1439`, and `1 × 1`, assert destination sizes `1280 × 720`, `1280 × 720`, and `1 × 1` using ceiling division. Assert `msaaSamples == 1`, `depthBufferBits == 0`, and source graphics format preservation. Reflect the renderer feature and assert its pass event is `BeforeRenderingTransparents`, its shader property IDs match the three required names, and it owns one blur material reference rather than per-pane state.

- [ ] **Step 2: Run the rendering tests and confirm the intended failure**

  Run the Task 1 command with `-testFilter TangoMvp.Tests.TangoGlassRenderingTests` and Task 2 result/log paths. Expected: failed compilation or tests because the rendering types do not exist.

- [ ] **Step 3: Implement the pure descriptor transform and shader ID registry**

  Preserve HDR graphics format, use ceiling division for odd dimensions, clamp both dimensions to at least one, disable MSAA, remove depth, disable mip maps, and name transient graph resources `Tango Glass Blur Ping` and `Tango Glass Blur`.

- [ ] **Step 4: Implement the Render Graph renderer feature**

  `Create()` constructs one `ScriptableRenderPass` with `requiresIntermediateTexture = true`. `AddRenderPasses()` enqueues it for `CameraType.Game` only when the blur material is assigned. `RecordRenderGraph()` reads the active color texture, creates two half-resolution transient textures, records horizontal and vertical `RenderGraphUtils.AddBlitPass` calls, and uses the returned vertical-pass builder's `SetGlobalTextureAfterPass` to bind `_TangoGlassBlurTexture`. Set texel size and availability in the same graph-owned execution path; reset availability when the feature is disabled or disposed. Log a single initialization line containing camera name, dimensions, and active mode rather than logging every frame.

- [ ] **Step 5: Implement the separable blur shader**

  Give the shader two fixed passes: horizontal samples in output-pixel X and vertical samples in output-pixel Y. Use one symmetric, normalized kernel shared by both passes, clamp UVs to half a texel inside the source, sample in linear HDR color, and make the radius a renderer-feature setting fixed to the 22-output-pixel reference at render scale `1.0`. Do not expose the radius on pane materials.

- [ ] **Step 6: Run the targeted tests and perform a Unity compile smoke test**

  Run the Task 2 filtered tests, then:

  ```bash
  "$UNITY" -batchmode -nographics -quit -projectPath "$PWD/cumulus" -logFile /tmp/cumulus-tango-task2-compile.log
  rg -n "error CS|Shader error" /tmp/cumulus-tango-task2-compile.log
  ```

  Expected: tests exit `0`; compile exits `0`; `rg` returns no matches.

- [ ] **Step 7: Commit and push**

  ```bash
  git add cumulus/Assets/TangoMvp
  git commit -m "feat(cumulus): add shared Tango glass Render Graph blur" -m "Capture the active opaque scene once per game camera, generate half-resolution horizontal and vertical blur resources, and publish one global frost texture for all Tango panes."
  git push
  ```

---

### Task 3: Scene Glass, On-Glass, and Solid Chrome Rendering

**Files:**
- Create: `cumulus/Assets/TangoMvp/Shaders/TangoSceneGlass.shader`
- Create: `cumulus/Assets/TangoMvp/Shaders/TangoOnGlass.shader`
- Create: `cumulus/Assets/TangoMvp/Editor/TangoMvp.Editor.asmdef`
- Create: `cumulus/Assets/TangoMvp/Editor/TangoGlassLabBuilder.cs` with material-only build entry points in this task.
- Create: `cumulus/Assets/TangoMvp/Materials/TangoSceneGlass.mat`
- Create: `cumulus/Assets/TangoMvp/Materials/TangoOnGlass.mat`
- Create: `cumulus/Assets/TangoMvp/Materials/TangoSolidChrome.mat`
- Create: `cumulus/Assets/TangoMvp/Materials/TangoBlur.mat`
- Create: `cumulus/Assets/TangoMvp/Materials/TangoMaterialLibrary.asset`
- Modify: `cumulus/Assets/TangoMvp/Tests/EditMode/TangoGlassRenderingTests.cs`

**Interfaces:**
- Consumes: `_TangoGlassBlurTexture`, `_TangoGlassBlurTexelSize`, and `_TangoGlassAvailable` from Task 2.
- Produces: menu/CLI method `TangoMvp.Editor.TangoGlassLabBuilder.RebuildMaterials()`.
- Produces: four shared materials and one validated `TangoMaterialLibrary` asset at the exact paths above.

- [ ] **Step 1: Extend the rendering tests with failing shader and asset contracts**

  Assert `Shader.Find("TangoMvp/SceneGlass")` and `Shader.Find("TangoMvp/OnGlass")` are non-null. Assert the scene shader declares the shared blur texture and fixed Tango material properties; assert the on-glass shader does not declare or sample `_TangoGlassBlurTexture`. After `RebuildMaterials()`, assert all four material paths exist, repeated rebuilds retain their GUIDs, the library resolves three distinct shared instances, and the scene material has render queue `Transparent`.

- [ ] **Step 2: Run the extended tests and confirm the intended failure**

  Run the Task 2 filtered test command. Expected: failures identifying missing shaders, builder, and material assets.

- [ ] **Step 3: Implement the scene-glass shader**

  Compose the blurred source exactly once: saturate around luminance by `1.5`, apply the fixed neutral near-black fill at alpha `0.54`, then add pane-UV anchored diagonal sheen, rim, top inset highlight, main-light specular, and Fresnel. The background sample is transmission and must not enter the direct diffuse-light calculation. When `_TangoGlassAvailable < 0.5`, render the same lit shell over a deterministic 72%-alpha interior. Use transparent blending, depth test against the opaque scene, and no depth write for this MVP.

- [ ] **Step 4: Implement the on-glass shader and solid material role**

  On-glass uses a low-alpha neutral lens, brighter rim, and tighter local highlight without scene-color sampling. Solid chrome uses the committed URP Lit shader with an opaque deep-plum/black base and normal shadow casting. Keep label text warm white and unlit so moving scene light cannot destroy contrast.

- [ ] **Step 5: Implement idempotent material asset generation**

  The editor builder creates or updates assets in place, assigns shaders and fixed role values, assigns the existing material objects to `TangoMaterialLibrary`, calls `Validate()`, saves assets, and never deletes/recreates an asset that already exists. Expose no per-scene material knobs.

- [ ] **Step 6: Rebuild assets and run the tests**

  ```bash
  "$UNITY" -batchmode -nographics -quit -projectPath "$PWD/cumulus" -executeMethod TangoMvp.Editor.TangoGlassLabBuilder.RebuildMaterials -logFile /tmp/cumulus-tango-task3-build.log
  find cumulus/Assets/TangoMvp/Materials -type f -print0 | sort -z | xargs -0 shasum > /tmp/cumulus-tango-task3-before.sha
  "$UNITY" -batchmode -nographics -quit -projectPath "$PWD/cumulus" -executeMethod TangoMvp.Editor.TangoGlassLabBuilder.RebuildMaterials -logFile /tmp/cumulus-tango-task3-rebuild.log
  find cumulus/Assets/TangoMvp/Materials -type f -print0 | sort -z | xargs -0 shasum > /tmp/cumulus-tango-task3-after.sha
  diff -u /tmp/cumulus-tango-task3-before.sha /tmp/cumulus-tango-task3-after.sha
  "$UNITY" -batchmode -nographics -projectPath "$PWD/cumulus" -runTests -testPlatform EditMode -testFilter TangoMvp.Tests.TangoGlassRenderingTests -testResults /tmp/cumulus-tango-task3.xml -logFile /tmp/cumulus-tango-task3.log
  ```

  Expected: both commands exit `0`; repeated material rebuilding produces no Git diff; tests report zero failures.

- [ ] **Step 7: Commit and push**

  ```bash
  git add cumulus/Assets/TangoMvp
  git commit -m "feat(cumulus): define Tango MVP glass material vocabulary" -m "Add fixed scene-glass, nested on-glass, and solid-chrome rendering roles with deterministic fallback behavior and idempotently generated shared material assets."
  git push
  ```

---

### Task 4: Stable World-Space Press Interaction and Object Travel

**Files:**
- Create: `cumulus/Assets/TangoMvp/Runtime/Interaction/TangoPressable.cs`
- Create: `cumulus/Assets/TangoMvp/Runtime/Interaction/TangoPointerInteractor.cs`
- Create: `cumulus/Assets/TangoMvp/Runtime/Motion/TangoCubicBezier.cs`
- Create: `cumulus/Assets/TangoMvp/Runtime/Motion/TangoPanelTravel.cs`
- Create: `cumulus/Assets/TangoMvp/Tests/EditMode/TangoCubicBezierTests.cs`
- Create: `cumulus/Assets/TangoMvp/Tests/PlayMode/TangoMvp.PlayModeTests.asmdef`
- Create: `cumulus/Assets/TangoMvp/Tests/PlayMode/TangoPressableTests.cs`
- Create: `cumulus/Assets/TangoMvp/Tests/PlayMode/TangoPanelTravelTests.cs`

**Interfaces:**
- Produces: `void TangoPressable.SetHovered(bool hovered)`, `void TangoPressable.BeginPress()`, and `bool TangoPressable.EndPress(bool pointerStillOver)`; successful `EndPress` raises `Activated` once.
- Produces: `float TangoCubicBezier.Evaluate(float progress, Vector2 control1, Vector2 control2)`.
- Produces: `void TangoPanelTravel.ToggleDestination()` and read-only `bool IsTravelling`.
- Consumes: one stable root `Collider`, one visual child `Transform`, and two anchor `Transform`s.

- [ ] **Step 1: Write failing easing, press-state, and travel tests**

  Assert the Bézier evaluator maps `0 → 0` and `1 → 1`, is finite and monotonically increasing over 101 samples for `(0.16,1)` and `(0.3,1)`, and returns the same result for repeated inputs. In PlayMode, assert hover scales only the visual child, press scale wins over hover, releasing away cancels activation, releasing over raises one activation, the collider bounds never change, travel reaches each exact anchor in `0.42 ± 0.02` seconds, and interruption continues from the current transform without snapping.

- [ ] **Step 2: Run EditMode and PlayMode filters and confirm the intended failures**

  Run the EditMode command filtered to `TangoCubicBezierTests`, then a PlayMode command filtered to `TangoMvp.Tests.PlayMode`. Expected: missing-type compilation failures or failed tests.

- [ ] **Step 3: Implement the press state machine**

  Keep semantic state on the root and scale only the assigned visual child. Apply fixed Tango hover and press factors, with pressed state taking precedence. Treat a press that begins on the control and ends off it as cancellation. Log only successful activation with the control's stable semantic ID.

- [ ] **Step 4: Implement mouse raycast routing**

  Use `Mouse.current`, the assigned camera, and `Physics.Raycast` once per frame. Track one hovered and one pressed `TangoPressable`; transition state only when the hit target changes; deliver release to the original pressed target with `pointerStillOver` computed from the current hit. Do not derive hit state from decorative child meshes.

- [ ] **Step 5: Implement fixed Bézier easing and interruptible travel**

  Solve cubic Bézier X for the normalized clock input and return Y; use bounded Newton iterations with bisection fallback. Travel position with `Vector3.LerpUnclamped` and rotation with `Quaternion.SlerpUnclamped`; preserve current position/rotation when a new destination is requested mid-flight; keep the panel root, label, button, sheen UVs, and collider in one moving hierarchy.

- [ ] **Step 6: Run targeted EditMode and PlayMode tests**

  ```bash
  "$UNITY" -batchmode -nographics -projectPath "$PWD/cumulus" -runTests -testPlatform EditMode -testFilter TangoMvp.Tests.TangoCubicBezierTests -testResults /tmp/cumulus-tango-task4-edit.xml -logFile /tmp/cumulus-tango-task4-edit.log
  "$UNITY" -batchmode -projectPath "$PWD/cumulus" -runTests -testPlatform PlayMode -testFilter TangoMvp.Tests.PlayMode -testResults /tmp/cumulus-tango-task4-play.xml -logFile /tmp/cumulus-tango-task4-play.log
  ```

  Expected: both commands exit `0`; all targeted tests pass; logs contain no unhandled exceptions.

- [ ] **Step 7: Commit and push**

  ```bash
  git add cumulus/Assets/TangoMvp
  git commit -m "feat(cumulus): add tangible Tango press and travel behavior" -m "Route mouse rays through stable semantic colliders, preserve press-over-hover precedence and cancellation, and move complete panel hierarchies between anchors on Tango's fixed object-travel curve."
  git push
  ```

---

### Task 5: Deterministic Tango Glass Lab Scene

**Files:**
- Create: `cumulus/Assets/TangoMvp/Runtime/Demo/TangoSpinner.cs`
- Create: `cumulus/Assets/TangoMvp/Runtime/Demo/TangoLightOrbit.cs`
- Modify: `cumulus/Assets/TangoMvp/Editor/TangoGlassLabBuilder.cs`
- Create: `cumulus/Assets/TangoMvp/Meshes/TangoPanel.asset`
- Create: `cumulus/Assets/TangoMvp/Prefabs/TangoGlassPanel.prefab`
- Create: `cumulus/Assets/Scenes/TangoGlassLab.unity`
- Modify: `cumulus/Assets/Settings/PC_Renderer.asset`
- Modify: `cumulus/ProjectSettings/EditorBuildSettings.asset`
- Create: `cumulus/Assets/TangoMvp/Tests/EditMode/TangoGlassLabAssetTests.cs`

**Interfaces:**
- Consumes: all Tasks 1–4 runtime contracts and shared assets.
- Produces: menu/CLI method `TangoMvp.Editor.TangoGlassLabBuilder.Rebuild()`.
- Produces: one scene containing exactly two independent scene-glass panes, one nested on-glass button, one moving high-contrast object, one moving directional light, and two panel anchors.

- [ ] **Step 1: Write failing lab-asset tests**

  Run `Rebuild()` twice and assert stable GUIDs for the mesh, four materials, library, prefab, and scene. Assert `PC_Renderer.asset` contains exactly one active `TangoGlassRendererFeature` with the shared blur material. Open the scene additively and assert exact object names and counts, two scene-glass renderers share the same material object, the nested button uses the on-glass material, both labels are `TextMesh` components outside any Canvas, every pressable has one stable root collider, and `EditorBuildSettings` enables only `Assets/Scenes/TangoGlassLab.unity` for the MVP.

- [ ] **Step 2: Run the lab-asset tests and confirm the intended failure**

  Run the EditMode command filtered to `TangoMvp.Tests.TangoGlassLabAssetTests`. Expected: failures for missing builder output and project wiring.

- [ ] **Step 3: Implement deterministic background motion and lighting**

  `TangoSpinner` rotates a striped opaque object at a fixed angular velocity behind both panes. `TangoLightOrbit` changes the directional light orientation on a fixed loop so bevel highlights visibly travel. Neither component uses randomness or allocates per frame.

- [ ] **Step 4: Complete the idempotent scene builder**

  Build a fixed camera, bright/dark/gold background geometry, ground receiver, moving striped object, directional light, source/destination anchors, main panel prefab instance, and second independent glass pane. The main panel hierarchy contains the shallow glass face, opaque bevel/frame, warm-white mesh label, raised on-glass button visual, stable button collider, pressable, and travel component. Wire button activation to `ToggleDestination()` in serialized scene data. Add one `TangoPointerInteractor` to the camera and log Unity/URP versions plus `live-shared-blur` mode at scene start.

- [ ] **Step 5: Install exactly one renderer feature and update build settings**

  Add the feature as a serialized subasset of `PC_Renderer.asset`, retain SSAO, prevent duplicates by type, assign `TangoBlur.mat`, and mark renderer data dirty. Set `TangoGlassLab.unity` as the sole enabled build scene. Preserve the mobile renderer unchanged.

- [ ] **Step 6: Generate and validate committed assets**

  ```bash
  "$UNITY" -batchmode -nographics -quit -projectPath "$PWD/cumulus" -executeMethod TangoMvp.Editor.TangoGlassLabBuilder.Rebuild -logFile /tmp/cumulus-tango-task5-build.log
  find cumulus/Assets/TangoMvp cumulus/Assets/Scenes/TangoGlassLab.unity cumulus/Assets/Scenes/TangoGlassLab.unity.meta cumulus/Assets/Settings/PC_Renderer.asset cumulus/ProjectSettings/EditorBuildSettings.asset -type f -print0 | sort -z | xargs -0 shasum > /tmp/cumulus-tango-task5-before.sha
  "$UNITY" -batchmode -nographics -quit -projectPath "$PWD/cumulus" -executeMethod TangoMvp.Editor.TangoGlassLabBuilder.Rebuild -logFile /tmp/cumulus-tango-task5-rebuild.log
  find cumulus/Assets/TangoMvp cumulus/Assets/Scenes/TangoGlassLab.unity cumulus/Assets/Scenes/TangoGlassLab.unity.meta cumulus/Assets/Settings/PC_Renderer.asset cumulus/ProjectSettings/EditorBuildSettings.asset -type f -print0 | sort -z | xargs -0 shasum > /tmp/cumulus-tango-task5-after.sha
  diff -u /tmp/cumulus-tango-task5-before.sha /tmp/cumulus-tango-task5-after.sha
  "$UNITY" -batchmode -nographics -projectPath "$PWD/cumulus" -runTests -testPlatform EditMode -testFilter TangoMvp.Tests.TangoGlassLabAssetTests -testResults /tmp/cumulus-tango-task5.xml -logFile /tmp/cumulus-tango-task5.log
  ```

  Expected: rebuild exits `0`; a second rebuild creates no diff; tests exit `0` with zero failures.

- [ ] **Step 7: Commit and push**

  ```bash
  git add cumulus/Assets/TangoMvp cumulus/Assets/Scenes/TangoGlassLab.unity cumulus/Assets/Scenes/TangoGlassLab.unity.meta cumulus/Assets/Settings/PC_Renderer.asset cumulus/ProjectSettings/EditorBuildSettings.asset
  git commit -m "feat(cumulus): assemble deterministic Tango glass lab" -m "Create the playable two-pane proof scene, shared-material panel prefab, moving opaque subject and light, renderer-feature wiring, and idempotent asset builder with structural coverage."
  git push
  ```

---

### Task 6: End-to-End Verification and MVP Documentation

**Files:**
- Create: `cumulus/Assets/TangoMvp/README.md`
- Modify if findings require fixes: files created in Tasks 1–5.
- Modify if a pre-existing issue is discovered: `pre-existing-issues.txt`.

**Interfaces:**
- Consumes: the complete lab scene and all automated test assemblies.
- Produces: documented launch/inspection workflow and recorded evidence for the MVP acceptance criteria.

- [ ] **Step 1: Write the README acceptance and inspection workflow**

  Document the exact Unity version, scene path, Play Mode interaction, Frame Debugger checks, Render Graph Viewer pass/resource names, fallback check, automated commands, and MVP scope. Describe the current MVP directly: it captures opaque scene color before transparent rendering and targets the PC renderer.

- [ ] **Step 2: Run the full Unity EditMode and PlayMode suites**

  ```bash
  "$UNITY" -batchmode -nographics -projectPath "$PWD/cumulus" -runTests -testPlatform EditMode -testResults /tmp/cumulus-tango-editmode.xml -logFile /tmp/cumulus-tango-editmode.log
  "$UNITY" -batchmode -projectPath "$PWD/cumulus" -runTests -testPlatform PlayMode -testResults /tmp/cumulus-tango-playmode.xml -logFile /tmp/cumulus-tango-playmode.log
  ```

  Expected: both commands exit `0`; both XML files report zero failures; both logs contain no `error CS`, shader error, unhandled exception, or failed assertion.

- [ ] **Step 3: Run the repository-wide required checks**

  From the repository root:

  ```bash
  npm run lint
  npm run typecheck
  npm test
  ```

  Expected: all three commands exit `0`. If a failure predates the worktree changes, verify it against `master`, record it in `pre-existing-issues.txt`, and include that file in the final commit.

- [ ] **Step 4: Perform Play Mode interaction and motion QA**

  Open `Assets/Scenes/TangoGlassLab.unity`, enter Play Mode at `1920 × 1080`, and verify: the striped object moves continuously through both frosted panes; the moving light changes the bevel highlight without changing label legibility; hover expands only the visual button; press compression wins over hover; drag-off release cancels; a successful click moves and rotates the entire panel hierarchy; clicking during travel reverses smoothly; label, button, collider, sheen, and panel remain aligned.

- [ ] **Step 5: Inspect the rendering proof**

  In Render Graph Viewer and Frame Debugger, confirm one `Tango Glass Blur Horizontal` and one `Tango Glass Blur Vertical` sequence for the game camera, with one half-resolution ping texture and one half-resolution final texture. Confirm both independent panes sample `_TangoGlassBlurTexture`, the on-glass button does not add a blur, the opaque frame casts a normal shadow, and the captured backdrop is not visibly lit a second time.

- [ ] **Step 6: Verify deterministic fallback**

  Disable `TangoGlassRendererFeature`, enter Play Mode from a fresh scene load, and verify both scene-glass panes render the lit 72%-alpha interior while hover, press, activation, travel, label rendering, and collider behavior remain functional. Re-enable the feature and save `PC_Renderer.asset` in the active configuration.

- [ ] **Step 7: Capture review evidence**

  Capture full Game view screenshots at `1920 × 1080`: one stationary view with the striped object crossing both panes, one pressed-button view, and one destination-anchor view. Capture one Render Graph Viewer image showing the named blur passes and resources. Store them under the implementation worktree's ignored `screenshots/cumulus-tango-glass-mvp/` directory for review; do not commit them unless requested.

- [ ] **Step 8: Review scope and remove accidental expansion**

  Confirm the diff contains no mobile renderer changes, Canvas/uGUI controls, UI Toolkit assets, TextMesh Pro resource import, per-pane render textures, runtime material clones, per-instance material tuning, refraction, recursive glass, controller/touch code, or production token generator. Confirm all new tracked Unity assets have `.meta` files.

- [ ] **Step 9: Commit and push**

  ```bash
  git add cumulus/Assets/TangoMvp/README.md
  git add pre-existing-issues.txt 2>/dev/null || true
  git commit -m "docs(cumulus): document and verify Tango glass MVP" -m "Record the deterministic lab workflow, Render Graph inspection contract, fallback behavior, automated verification, and the deliberately bounded PC proof-of-concept scope."
  git push
  ```

- [ ] **Step 10: Request review before promotion**

  Present the four screenshots from the worktree, the Unity scene path, the pushed branch name, and exact test outcomes. Follow the `wt` promotion workflow: ask whether to replay the commits onto `master`; do not promote without explicit approval.

---

## Final Acceptance Checklist

- [ ] A moving opaque object remains live through two independent frosted panes.
- [ ] Both panes share one per-camera horizontal/vertical blur sequence and one final global texture.
- [ ] A nested on-glass button adds no blur pass and retains the parent scene color.
- [ ] Scene glass uses fixed Tango tint, saturation, rim, sheen, and lit-shell roles.
- [ ] The background transmission is not visibly double-lit.
- [ ] The solid frame catches the moving light and casts a normal shadow.
- [ ] World-space mesh text remains crisp and warm white.
- [ ] Hover, press, cancellation, and activation use the stable root collider.
- [ ] Panel travel lasts 420 ms, follows `(0.16, 1, 0.3, 1)`, and remains smooth when interrupted.
- [ ] Panel, button, label, collider, and authored sheen stay spatially aligned during travel.
- [ ] Disabling the renderer feature produces a deterministic readable fallback without breaking interaction.
- [ ] EditMode tests, PlayMode tests, `npm run lint`, `npm run typecheck`, and `npm test` all pass.
- [ ] The implementation remains confined to the PC proof scene and contains none of the explicitly deferred production systems.
