# Cumulus Tango Glass Point Lighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution preference:** One inline agent using `superpowers:executing-plans`; do not dispatch subagents for this task.

**Goal:** Make Cumulus `SceneGlass` and `OnGlass` respond to moving Unity point lights with colored physical-edge glints and broad interior reflections while retaining the current no-light appearance and a one-additional-light mobile path.

**Architecture:** Both shaders call one bounded URP 17.5 lighting include that evaluates a dielectric GGX response from current world-space light data. Tango's generated rounded-panel mesh supplies an explicit face-versus-shell channel, and one shared `TangoGlassLightingProfile` asset authors role strengths and desktop/mobile budgets that the deterministic builder copies into shared materials. A camera-level reporter publishes stable lighting configuration facts; no panel owns a script, material clone, light list, or per-frame light update.

**Tech Stack:** Unity 6000.5.3f1, URP 17.5, HLSL, C# runtime/editor assemblies, Unity Test Framework EditMode and graphics-enabled PlayMode tests, Python evidence validation, Bash verification harness.

## Global Constraints

- Work only in `/Users/dthurn/quest_prototype/.worktrees/cumulus-glass-point-lighting-design` on `wt/cumulus-glass-point-lighting-design`; continue using this worktree for follow-up work.
- Treat [the approved design](../specs/2026-07-11-cumulus-glass-point-lighting-design.md) as the behavior source of truth.
- Limit the feature to Tango-generated rounded-panel meshes and the shared `SceneGlass` and `OnGlass` roles; do not add arbitrary-mesh support or per-panel overrides.
- Use Unity's current URP light data every frame; do not add a parallel light registry, per-panel CPU update, per-pane camera, render texture, or runtime material clone.
- The no-contributing-light result must stay within the established web-parity tolerances; active local lights may be physically expressive.
- Desktop evaluates at most four additional lights and may sample their shadows. Mobile evaluates zero or one additional light and never samples additional-light shadows.
- Preserve one shared blur record and exactly one horizontal plus one vertical blur pass per participating camera.
- Use half precision for fragment color/scalars where GPU evidence remains stable; retain sufficient precision for world position and moving highlight placement.
- Keep production Unity asset/`.meta` pairs complete, deterministic, and GUID-stable. Run the builder after source changes and commit its generated assets.
- New diagnostics log configuration changes, not per-light or per-frame records.
- Do not mutate `Assets/Settings/Mobile_Renderer.asset`; the existing scope guard treats it as immutable.
- After every commit, immediately `git push` the current branch.
- The final authoritative verification is `bash cumulus/scripts/verify-tango-mvp.sh` from a clean committed HEAD.

---

## File Structure

### Create

- `cumulus/Assets/TangoMvp/Runtime/Materials/TangoGlassLightingProfile.cs` — serializable role settings, desktop/mobile budgets, sanitization, validation, versioning, and quality selection.
- `cumulus/Assets/TangoMvp/Runtime/Materials/TangoGlassLightingProfile.cs.meta` — Unity metadata.
- `cumulus/Assets/TangoMvp/Runtime/Diagnostics/TangoGlassLightingReporter.cs` — one camera-level configuration publisher; it never discovers or updates lights.
- `cumulus/Assets/TangoMvp/Runtime/Diagnostics/TangoGlassLightingReporter.cs.meta` — Unity metadata.
- `cumulus/Assets/TangoMvp/Shaders/TangoGlassLighting.hlsl` — shared dielectric GGX evaluation, bounded Forward/Forward+ loops, mobile shadow exclusion, and luminance shoulder.
- `cumulus/Assets/TangoMvp/Shaders/TangoGlassLighting.hlsl.meta` — Unity metadata.
- `cumulus/Assets/TangoMvp/Materials/TangoGlassLightingProfile.asset` — shared authored defaults from the approved design.
- `cumulus/Assets/TangoMvp/Materials/TangoGlassLightingProfile.asset.meta` — stable Unity metadata.

### Modify runtime and shaders

- `cumulus/Assets/TangoMvp/Runtime/Materials/TangoMaterialLibrary.cs` — reference and validate the lighting profile.
- `cumulus/Assets/TangoMvp/Runtime/Geometry/TangoRoundedPanelMesh.cs` — emit secondary-UV shell-region values.
- `cumulus/Assets/TangoMvp/Runtime/Diagnostics/TangoGlassDiagnostics.cs` — retain camera lighting facts independently of frame-scoped blur facts.
- `cumulus/Assets/TangoMvp/Runtime/Demo/TangoLightOrbit.cs` — support a positional point-light orbit while preserving directional-light behavior.
- `cumulus/Assets/TangoMvp/Runtime/Demo/TangoVerificationMarkers.cs` — expose point-light measurement regions and include lighting facts in initialization diagnostics.
- `cumulus/Assets/TangoMvp/Shaders/TangoSceneGlass.shader` — preserve transmission composition and add shared main/additional-light reflection.
- `cumulus/Assets/TangoMvp/Shaders/TangoOnGlass.shader` — preserve the tonal lens and add the gentler shared reflection.

### Modify editor, assets, and docs

- `cumulus/Assets/TangoMvp/Editor/TangoGlassLabBuilder.cs` — create/synchronize the profile, materials, mesh stream, point-light lab objects, reporter, and verification markers deterministically.
- `cumulus/Assets/TangoMvp/Editor/TangoMvpBatchVerification.cs` — include the shared HLSL dependency and required variants in shader/build inspection evidence without changing the three top-level shader names.
- `cumulus/Assets/TangoMvp/Materials/TangoSceneGlass.mat` — generated role values.
- `cumulus/Assets/TangoMvp/Materials/TangoOnGlass.mat` — generated role values.
- `cumulus/Assets/TangoMvp/Materials/TangoMaterialLibrary.asset` — generated profile reference.
- `cumulus/Assets/TangoMvp/Meshes/TangoPanel.asset` — generated secondary UV stream.
- `cumulus/Assets/TangoMvp/Prefabs/TangoGlassPanel.prefab` — regenerated canonical prefab if builder serialization changes.
- `cumulus/Assets/Scenes/TangoGlassLab.unity` — moving colored point light, reporter, occlusion arrangement, and measurement markers.
- `cumulus/Assets/TangoMvp/README.md` — profile authoring, point-light demo, exact expanded evidence contract, and corrected metric count.
- `docs/tango/unity-3d-ui.md` — record the implemented role controls and bounded light policy as current behavior.
- `cumulus/scripts/verify-tango-mvp.sh` — add the profile asset to the deterministic manifest and summary count.
- `pre-existing-issues.txt` — retain the discovered README count discrepancy record; the implementation commit fixes the referenced prose.

### Modify tests and evidence

- `cumulus/Assets/TangoMvp/Tests/EditMode/TangoRoundedPanelMeshTests.cs` — shell-region stream contract.
- `cumulus/Assets/TangoMvp/Tests/EditMode/TangoGlassRenderingTests.cs` — profile, library, hidden properties, HLSL inclusion, bounded loops, no-double-lighting, and diagnostics contracts.
- `cumulus/Assets/TangoMvp/Tests/EditMode/TangoGlassLabAssetTests.cs` — deterministic profile, moving point light, camera reporter, markers, and regenerated assets.
- `cumulus/Assets/TangoMvp/Tests/EditMode/TangoImageMetricsTests.cs` — exact acceptance-boundary tests for each new numeric metric.
- `cumulus/Assets/TangoMvp/Tests/Support/TangoGpuAcceptance.cs` — names for the new point-light metrics.
- `cumulus/Assets/TangoMvp/Tests/PlayMode/TangoGlassGpuTests.cs` — controlled light-position/color/shadow/mobile-quality captures and measurements.
- `cumulus/scripts/tango_evidence.py` — exact metric/capture schema.
- `cumulus/scripts/test-tango-evidence.py` — negative controls for missing, extra, malformed, and boundary-crossing point-light evidence.

---

### Task 1: Implement and verify the complete point-lit glass contract

This is intentionally one reviewer-sized task for one agent. The profile,
generated mesh channel, two shaders, demo scene, and evidence schema are one
coupled deliverable: none is independently shippable under the deterministic
Unity gate.

**Interfaces:**

- `TangoGlassLightingRoleSettings` exposes read-only `EdgeStrength`, `EdgeRoughness`, `InteriorStrength`, `InteriorRoughness`, `LightColorResponse`, and `ReflectionLuminanceCeiling` properties plus `Sanitized()` and `Validate(string roleName)`.
- `TangoGlassLightingQualitySettings` exposes read-only `AdditionalLightLimit` and `AdditionalLightShadows` properties.
- `TangoGlassLightingProfile` exposes `SettingsVersion == 1`, `SceneGlass`, `OnGlass`, `DesktopAdditionalLightLimit`, `MobileAdditionalLightLimit`, `DesktopAdditionalLightShadows`, `TangoGlassLightingQualitySettings ForQuality(TangoGlassQuality quality)`, and `Validate()`.
- `TangoGlassQuality` has exactly `Desktop` and `Mobile`; `TangoGlassRendererMode` has exactly `Forward` and `ForwardPlus`.
- `TangoMaterialLibrary.LightingProfile` returns the required shared profile; `Validate()` checks it and all three existing materials.
- `TangoGlassLightingReporter.Configure(TangoMaterialLibrary library, TangoGlassQuality quality, TangoGlassRendererMode rendererMode)` is the builder/test seam. At runtime it publishes only when the derived fact value changes.
- `TangoGlassDiagnostics.TryGetLightingFacts(int cameraKey, out TangoGlassLightingFacts facts)` returns the latest stable configuration independently of `Time.frameCount`.
- `TangoLightOrbit.ConfigurePointOrbit(Vector3 center, float radius, float height, float normalizedPhase)` configures deterministic point motion; `SetPhase(float)` remains the capture seam.
- UV channel 1 stores `shellRegion` in `.x`: face vertices `0`, bevel/side vertices `1`.
- Both shaders declare the same hidden `_TangoEdgeStrength`, `_TangoEdgeRoughness`, `_TangoInteriorStrength`, `_TangoInteriorRoughness`, `_TangoLightColorResponse`, `_TangoReflectionCeiling`, `_TangoDesktopAdditionalLightLimit`, and `_TangoMobileAdditionalLightLimit` properties.
- The HLSL include provides `half3 EvaluateTangoGlassLighting(float3 positionWS, half3 normalWS, half3 viewDirectionWS, half shellRegion, TangoGlassLightingParameters parameters)`; the parameter struct carries the eight shared material values, and the return value is additive reflected RGB only.
- `_TANGO_GLASS_MOBILE_QUALITY` is a local test/preview keyword. It selects the same one-light, no-additional-shadow code as `SHADER_API_MOBILE` so the mobile contract is GPU-testable on the macOS verification device.

- [ ] **Step 1: Establish the clean execution baseline**

Run:

```bash
cd /Users/dthurn/quest_prototype/.worktrees/cumulus-glass-point-lighting-design
git status --short --branch
git log -3 --oneline
```

Expected: the branch tracks `origin/wt/cumulus-glass-point-lighting-design`; only the committed design/plan work is present before implementation begins. Do not overwrite unrelated user changes if this expectation is false.

- [ ] **Step 2: Write failing EditMode tests for the profile, material library, and mesh channel**

Add focused assertions before production code:

- Profile defaults match the six approved role values, desktop cap `4`, mobile cap `1`, desktop shadows enabled, and settings version `1`.
- `Validate()` rejects NaN/infinity, negative strengths, roughness outside `(0, 1]`, a desktop cap outside `0..4`, and a mobile cap outside `0..1`.
- `Sanitized()` returns finite range-clamped preview values without mutating the asset's authored values.
- `TangoMaterialLibrary.Validate()` rejects a missing lighting profile, and `LightingProfile` returns the assigned asset.
- The generated mesh has UV channel 1 for every vertex; face center/rings are `0`, bevel/side rings are `1`, and all values are finite within `[0, 1]`.
- Existing vertex count, normals, UV0, three-submesh topology, and bounds assertions remain intact.

Use representative assertions such as:

```csharp
mesh.GetUVs(1, shellRegions);
Assert.That(shellRegions, Has.Count.EqualTo(mesh.vertexCount));
Assert.That(shellRegions[frontCenter].x, Is.Zero);
Assert.That(shellRegions[firstFrontBevel].x, Is.EqualTo(1f));
Assert.Throws<InvalidOperationException>(() => profile.Validate());
```

- [ ] **Step 3: Run the focused EditMode fixtures and confirm the red state**

Run from the repository root:

```bash
UNITY=/Applications/Unity/Hub/Editor/6000.5.3f1/Unity.app/Contents/MacOS/Unity
"$UNITY" -batchmode -nographics -projectPath "$PWD/cumulus" -runTests -testPlatform EditMode -testFilter 'TangoMvp.Tests.TangoRoundedPanelMeshTests;TangoMvp.Tests.TangoGlassRenderingTests' -testResults /tmp/cumulus-point-light-editmode.xml -logFile /tmp/cumulus-point-light-editmode.log
```

Expected: nonzero exit with failures for the missing profile/interface and UV1 contract, not unrelated compiler failures.

- [ ] **Step 4: Implement the profile, material-library reference, and mesh stream**

Create the profile types and metadata, then modify the mesh generator and library. Keep the public contract limited to the signatures above. Use Unity serialization attributes to show strengths first and an `Advanced` header for roughness, color response, and ceiling. The approved default values are:

```text
SceneGlass: edge 0.65, edge roughness 0.14, interior 0.14,
            interior roughness 0.42, color response 1.0, ceiling 1.25
OnGlass:    edge 0.42, edge roughness 0.20, interior 0.08,
            interior roughness 0.52, color response 0.85, ceiling 0.75
Quality:    desktop 4 + shadows, mobile 1 + no additional-light shadows
```

Build `shellRegions` alongside vertices and call `mesh.SetUVs(1, shellRegions)`. Do not derive shell identity in the shader from UV0, scale, or normal thresholds.

- [ ] **Step 5: Teach the deterministic builder to create and synchronize the profile**

Add `LightingProfilePath`, create the asset with stable defaults when absent, assign it to `TangoMaterialLibrary`, validate before saving, and copy sanitized role values into the two shared materials. Keep the shader properties hidden and set both desktop/mobile caps on each material. Extend stable asset path tests and the verification manifest from 13 to 14 authoritative assets.

Run the builder twice:

```bash
"$UNITY" -batchmode -nographics -quit -projectPath "$PWD/cumulus" -executeMethod TangoMvp.Editor.TangoGlassLabBuilder.Rebuild -logFile /tmp/cumulus-point-light-builder-1.log
shasum -a 256 cumulus/Assets/TangoMvp/Materials/TangoGlassLightingProfile.asset cumulus/Assets/TangoMvp/Meshes/TangoPanel.asset >/tmp/cumulus-point-light-hashes-1
"$UNITY" -batchmode -nographics -quit -projectPath "$PWD/cumulus" -executeMethod TangoMvp.Editor.TangoGlassLabBuilder.Rebuild -logFile /tmp/cumulus-point-light-builder-2.log
shasum -a 256 cumulus/Assets/TangoMvp/Materials/TangoGlassLightingProfile.asset cumulus/Assets/TangoMvp/Meshes/TangoPanel.asset >/tmp/cumulus-point-light-hashes-2
cmp /tmp/cumulus-point-light-hashes-1 /tmp/cumulus-point-light-hashes-2
```

Expected: both Unity commands exit `0`; `cmp` exits `0`.

- [ ] **Step 6: Re-run focused EditMode tests and commit the authoring foundation**

Run the Step 3 command again. Expected: both focused fixtures pass.

Then commit and push:

```bash
git add cumulus/Assets/TangoMvp/Runtime/Materials cumulus/Assets/TangoMvp/Runtime/Geometry/TangoRoundedPanelMesh.cs cumulus/Assets/TangoMvp/Materials cumulus/Assets/TangoMvp/Meshes cumulus/Assets/TangoMvp/Editor/TangoGlassLabBuilder.cs cumulus/Assets/TangoMvp/Tests/EditMode/TangoRoundedPanelMeshTests.cs cumulus/Assets/TangoMvp/Tests/EditMode/TangoGlassRenderingTests.cs cumulus/Assets/TangoMvp/Tests/EditMode/TangoGlassLabAssetTests.cs cumulus/scripts/verify-tango-mvp.sh
git commit -m "feat(cumulus): author glass lighting profiles"
git push
```

- [ ] **Step 7: Write failing shader contract tests**

Extend `TangoGlassRenderingTests` to require:

- Both shaders include `TangoGlassLighting.hlsl`, compile `_ADDITIONAL_LIGHTS`, `_ADDITIONAL_LIGHT_SHADOWS`, Forward+, and `_TANGO_GLASS_MOBILE_QUALITY` variants, and declare the eight hidden profile properties.
- The include uses URP `Light`, `LIGHT_LOOP_BEGIN`/`LIGHT_LOOP_END`, current fragment world position, GGX, Schlick Fresnel with dielectric `F0 = 0.04`, distance attenuation, and desktop shadow attenuation.
- The additional-light loop is statically bounded to four desktop iterations and one mobile iteration; the mobile branch forces additional-light shadow contribution to `1` without sampling it.
- `SceneGlass` samples the blur exactly once and never passes transmission into lighting; `OnGlass` samples it zero times.
- The lighting function returns additive RGB and exact zero when all light attenuation/strength is zero.
- The luminance shoulder is linear below half the configured ceiling, preserves RGB ratios, stays finite, and approaches but does not exceed the ceiling.

Do not assert incidental whitespace or full function bodies. Assert required calls, property names, variant declarations, sample counts, and bounded constants.

- [ ] **Step 8: Run shader contract tests and confirm they fail for missing lighting behavior**

Run the Step 3 command with `-testFilter TangoMvp.Tests.TangoGlassRenderingTests`.

Expected: nonzero exit because the include, properties, variants, and calls do not exist.

- [ ] **Step 9: Implement the shared GGX include and integrate both shaders**

Implement one normalized dielectric microfacet function with no diffuse term. Blend edge and interior responses by the authored shell value:

```hlsl
half edgeWeight = saturate(shellRegion);
half interiorWeight = 1.0h - edgeWeight;
half3 reflected = edgeWeight * edgeLobe * edgeStrength;
reflected += interiorWeight * interiorLobe * interiorStrength;
```

Evaluate the main light and the bounded URP additional-light loop from current `positionWS`, `normalWS`, and view direction. Preserve light color through `LightColorResponse`, apply the role luminance shoulder after accumulating all lights, and add the result only after the existing transmission/lens baseline is computed. Retain existing rim width/composition, fallback behavior, blend state, culling, and render queues.

Define color response as `lerp(lightLuminance.xxx, light.color, saturate(LightColorResponse))`. Define the RGB-preserving ceiling for accumulated nonnegative reflection luminance `x` and ceiling `c` as:

```text
y = x                                      when x <= c / 2
y = c / 2 + (c / 2) * t / (t + c / 2)    when t = x - c / 2 > 0
rgb *= y / max(x, epsilon)
```

This is linear below half the ceiling, has matching value and slope at the join, preserves hue, and approaches `c` asymptotically.

Use `SHADER_API_MOBILE || _TANGO_GLASS_MOBILE_QUALITY` to select the maximum-one-light branch and exclude additional-light shadow sampling. The desktop loop is a fixed maximum of four with an early stop at the profile cap and URP's available count; never iterate an unbounded Forward+ count.

- [ ] **Step 10: Compile, run shader tests, and inspect variants**

Run:

```bash
"$UNITY" -batchmode -nographics -quit -projectPath "$PWD/cumulus" -executeMethod TangoMvp.Editor.TangoMvpBatchVerification.InspectShadersAndBuildPlayer -logFile /tmp/cumulus-point-light-shaders.log
"$UNITY" -batchmode -nographics -projectPath "$PWD/cumulus" -runTests -testPlatform EditMode -testFilter TangoMvp.Tests.TangoGlassRenderingTests -testResults /tmp/cumulus-point-light-rendering.xml -logFile /tmp/cumulus-point-light-rendering.log
```

Expected: shader inspection/build reports zero shader errors; the focused fixture passes. Inspect `/tmp/cumulus-point-light-shaders.log` for variant stripping or unsupported Forward+ macro errors even when the process exits `0`.

- [ ] **Step 11: Commit and push the shared shader implementation**

```bash
git add cumulus/Assets/TangoMvp/Shaders cumulus/Assets/TangoMvp/Materials/TangoSceneGlass.mat cumulus/Assets/TangoMvp/Materials/TangoOnGlass.mat cumulus/Assets/TangoMvp/Editor/TangoMvpBatchVerification.cs cumulus/Assets/TangoMvp/Tests/EditMode/TangoGlassRenderingTests.cs
git commit -m "feat(cumulus): light Tango glass from URP point lights"
git push
```

- [ ] **Step 12: Write failing diagnostics and lab-asset tests**

Require a single camera reporter in `TangoGlassLab`, one moving colored point light with finite positive range/intensity and soft shadows, deterministic orbit settings, and marker regions for the four edges plus face interior. Test that:

- Stable lighting facts contain profile name, version, quality, renderer mode, additional-light cap, additional-shadow policy, and live-blur/fallback state.
- Re-publishing identical facts emits no new log; changing quality/profile publishes once.
- Reset clears blur and lighting maps.
- The reporter is camera-level and no glass panel/prefab owns it.
- `TangoLightOrbit.SetPhase(0, .25, .5, .75)` places a point light at four deterministic positions while directional mode retains its current rotation behavior.
- The builder repairs removed/drifted reporter, point light, profile reference, and markers without changing GUIDs or touching `Mobile_Renderer.asset`.

- [ ] **Step 13: Implement diagnostics, point orbit, and deterministic lab wiring**

Add the reporter and stable `TangoGlassLightingFacts` store. The reporter may compare a small immutable fact value each frame but logs/publishes only when that value changes; it must not enumerate lights. Configure the lab camera as `Desktop` + `ForwardPlus`, add one orbiting colored point light, retain the existing directional light for baseline coverage, and add marker regions without changing player interaction geometry.

Update the initialization log to include exact key/value fields:

```text
profile=<asset name>, settingsVersion=1, quality=Desktop,
renderer=ForwardPlus, additionalLights=4, additionalShadows=true,
glassMode=live-shared-blur
```

- [ ] **Step 14: Run the diagnostics/asset fixtures and commit the lab contract**

Run the Step 3 command with `-testFilter 'TangoMvp.Tests.TangoGlassRenderingTests;TangoMvp.Tests.TangoGlassLabAssetTests'`.

Expected: both fixtures pass and their teardown leaves no dirty tracked asset.

Commit and push:

```bash
git add cumulus/Assets/TangoMvp/Runtime/Diagnostics cumulus/Assets/TangoMvp/Runtime/Demo/TangoLightOrbit.cs cumulus/Assets/TangoMvp/Runtime/Demo/TangoVerificationMarkers.cs cumulus/Assets/TangoMvp/Editor/TangoGlassLabBuilder.cs cumulus/Assets/Scenes/TangoGlassLab.unity cumulus/Assets/TangoMvp/Prefabs/TangoGlassPanel.prefab cumulus/Assets/TangoMvp/Tests/EditMode
git commit -m "test(cumulus): add point-lit glass lab contract"
git push
```

- [ ] **Step 15: Define failing GPU evidence for motion, color, shadows, baseline, and mobile quality**

Add these exact metrics and captures to `TangoGpuAcceptance`, `TangoGlassGpuTests`, `tango_evidence.py`, and its negative controls:

```text
pointEdgeTravel.top/right/bottom/left       >= 0.020
pointInteriorTravel                         >= 0.010
pointColorDominance.SceneGlass.red/green/blue >= 1.25
pointColorDominance.OnGlass.red/green/blue    >= 1.15
pointNextFrameDelta                         >= 0.010
pointShadowSuppression                      >= 0.020
pointNoLightBaselineDelta                   <= 0.005
pointAdditionalPasses                       == 0
mobileSingleLightDelta                      >= 0.010
mobileSecondLightDelta                      <= 0.005
mobileAdditionalShadowDelta                 <= 0.005
```

Capture names are exactly:

```text
point-top.png, point-right.png, point-bottom.png, point-left.png,
point-interior-a.png, point-interior-b.png,
point-red-scene.png, point-green-scene.png, point-blue-scene.png,
point-red-on-glass.png, point-green-on-glass.png, point-blue-on-glass.png,
point-shadowed.png, point-unshadowed.png, point-no-light.png,
mobile-one-light.png, mobile-two-lights.png,
mobile-shadowed.png, mobile-unshadowed.png
```

All captures remain `512 x 288` RGBA PNGs. Color dominance is the dominant linear RGB channel divided by the mean of the other two after subtracting the no-light capture. Edge travel compares the intended edge region against the mean of the other three regions. The mobile tests enable `_TANGO_GLASS_MOBILE_QUALITY` on test-owned material instances only.

- [ ] **Step 16: Run evidence self-tests and PlayMode once to establish the red state**

```bash
python3 cumulus/scripts/test-tango-evidence.py
"$UNITY" -batchmode -projectPath "$PWD/cumulus" -runTests -testPlatform PlayMode -testFilter TangoMvp.Tests.TangoGlassGpuTests -testResults /tmp/cumulus-point-light-playmode.xml -logFile /tmp/cumulus-point-light-playmode.log
```

Expected before completing the capture harness: the updated Python self-tests pass because their synthetic fixture matches the new exact schema; PlayMode fails because the new captures/metrics are absent. Any shader compiler error is a Step 9 defect and must be fixed there rather than hidden by looser evidence.

- [ ] **Step 17: Implement and calibrate deterministic GPU captures**

Extend the existing state-save/restore pattern so every created light, material keyword, renderer state, camera target, transform, and active render texture is restored in `finally`, including early failure. Drive point-light phases with `SetPhase`, render no-light subtraction captures, and calculate spatial/color metrics with `TangoImageMetrics` helpers. Add only focused helpers where the current test file would otherwise duplicate capture or region arithmetic.

For the mobile test, construct two point lights with controlled ranges so URP places the intended dominant light first; prove the first changes the pane and the lower-priority second stays below threshold. Toggle an occluder's shadow casting and prove the mobile-quality keyword produces no additional-shadow delta.

Tune profile defaults only if the approved starting values miss objective thresholds. Any tuning must update the profile asset, builder constants, material assets, design-aligned docs, and default tests together; do not weaken thresholds merely to accept invisible behavior.

- [ ] **Step 18: Run PlayMode, evidence, and metric-boundary tests until green**

Run:

```bash
"$UNITY" -batchmode -projectPath "$PWD/cumulus" -runTests -testPlatform PlayMode -testFilter TangoMvp.Tests.TangoGlassGpuTests -testResults /tmp/cumulus-point-light-playmode.xml -logFile /tmp/cumulus-point-light-playmode.log
python3 cumulus/scripts/tango_evidence.py cumulus/Artifacts/TangoMvpVerification/render-metrics.json cumulus/Artifacts/TangoMvpVerification
"$UNITY" -batchmode -nographics -projectPath "$PWD/cumulus" -runTests -testPlatform EditMode -testFilter TangoMvp.Tests.TangoImageMetricsTests -testResults /tmp/cumulus-point-light-metrics.xml -logFile /tmp/cumulus-point-light-metrics.log
```

Expected: all commands exit `0`; every new metric is finite and passes at its committed boundary; the exact expanded capture set validates.

- [ ] **Step 19: Update verification prose and contract tests**

Update the README's metric/capture totals from the actual Python sets rather than hand-copying stale counts, describe the profile controls and lab workflow, and extend its evidence table with edge travel, color, next-frame motion, desktop occlusion, no-light baseline, no-new-pass, and mobile one-light behavior. Update `docs/tango/unity-3d-ui.md` in present-tense system language. Preserve the pre-existing issue record explaining the count discrepancy that this work corrected.

Run:

```bash
bash cumulus/scripts/verify-tango-mvp.sh --self-test
npm run lint
npm run typecheck
npm test
```

Expected: all four commands exit `0`.

- [ ] **Step 20: Perform visual and performance QA before the clean verification commit**

Open `cumulus/Assets/Scenes/TangoGlassLab.unity` in Unity 6000.5.3f1 using the PC renderer. At the Game view reference resolution, verify:

- The colored glint travels smoothly around straight and rounded bevels at phases `0`, `.25`, `.5`, and `.75`.
- The interior reflection moves across the face and retains point-light color.
- `OnGlass` remains subordinate to its parent.
- Turning off contributing lights returns to the existing calibrated appearance.
- A desktop occluder suppresses both lobes; the mobile-quality keyword remains unshadowed.
- Frame Debugger shows no new pass, target, or per-panel draw beyond the existing material draws.
- Shader variant inspection shows fixed four-iteration desktop and one-iteration mobile loops; the mobile additional-light path has no shadow texture sample.

Use Unity Profiler after warm-up with four desktop point lights and overlapping panes. Record the glass draw GPU cost and confirm the whole Tango glass stack remains within the existing 2.0 ms desktop target at 2560×1440/60. If a supported modern mobile device is available, profile the one-light variant after thermal stabilization against the 3.0 ms total Tango target; absence of a device must be reported as unverified mobile hardware performance, not inferred from desktop timing.

- [ ] **Step 21: Commit and push the complete evidence contract**

Review `git status --short` and include every intended generated asset and `.meta` file. Do not include ignored `Library`, `Artifacts`, or `Builds` output.

```bash
git add cumulus docs/tango/unity-3d-ui.md pre-existing-issues.txt
git commit -m "test(cumulus): verify moving point-lit glass"
git push
```

- [ ] **Step 22: Run the authoritative clean gate**

```bash
git status --short
bash cumulus/scripts/verify-tango-mvp.sh
```

Expected: status is empty before the gate; the command exits `0`; `cumulus/Artifacts/TangoMvpVerification/summary.json` contains `"overall": "passed"` for the current commit and the expanded exact evidence contract.

If the gate fails, diagnose the first failed stage, add a focused regression test where needed, fix the defect, regenerate authoritative assets, commit with a detailed message, immediately push, and rerun the entire clean gate. Never claim success from a Unity process exit code or screenshots alone.

- [ ] **Step 23: Final single-agent handoff check**

```bash
git status --short --branch
git log --oneline origin/master..HEAD
git rev-parse HEAD
git rev-parse '@{upstream}'
```

Expected: clean tracked branch; local `HEAD` equals upstream; the implementation commits follow the approved design and all belong to this one task. Report the clean-gate result, exact summary path, desktop timing, and whether mobile hardware timing was measured. Do not promote or merge without a separate user request.
