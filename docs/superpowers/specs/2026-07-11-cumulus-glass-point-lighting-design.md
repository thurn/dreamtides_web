# Cumulus Cumulus Glass Point Lighting — Design

**Status:** Approved for implementation planning

**Target:** Cumulus Unity 6.5 project, URP 17.5

**Material roles:** `SceneGlass` and `OnGlass`

## Summary

Cumulus Cumulus glass will respond to Unity scene lights through a bounded native
URP light loop. Moving point lights will produce colored highlights that travel
around the modeled edge of Cumulus rounded panels and a broader, softer colored
reflection across their interiors. The lit result may be substantially more
expressive than the browser material. With no contributing scene light, the
current web-calibrated glass composition remains unchanged.

The feature applies to Cumulus's generated rounded-panel meshes and the shared
`SceneGlass` and `OnGlass` material roles. It does not support arbitrary meshes
or per-panel appearance overrides. Desktop evaluates a small bounded set of
additional lights with point-light shadow attenuation. Mobile evaluates at most
one unshadowed additional light per glass pixel.

## Context

`CumulusSceneGlass.shader` currently samples the shared blurred scene color and
adds main-light specular, Fresnel, rim, sheen, and interior washes. It calls
`GetMainLight` but does not compile or iterate URP additional lights, so point
lights do not affect the material. `CumulusOnGlass.shader` has a static local
highlight and view Fresnel but no scene-light response.

The generated `CumulusRoundedPanelMesh` already supplies world-space-transformable
face, bevel, and side normals. The PC renderer uses Forward+ and permits four
additional lights per object. The mobile renderer uses Forward and permits four,
but the Cumulus mobile material policy budgets only one additional light per
pixel. The implementation should use those existing URP paths instead of
introducing a separate light registry.

## Goals

- Make moving Unity point lights affect glass every rendered frame without
  per-panel scripts or material instances.
- Produce a colored, view-dependent glint that moves around the physical bevel
  as the light or viewer moves.
- Produce a separately configurable, broader colored reflection on the glass
  interior.
- Preserve light position, range, intensity, color, layer eligibility, and URP
  attenuation semantics.
- Keep the no-light result visually equivalent to the current calibrated
  `SceneGlass` and `OnGlass` output.
- Expose coherent role-level editor controls with expressive but stable defaults.
- Bound desktop and mobile shader work explicitly and retain one shared blur
  operation per camera.
- Make the active quality policy and evaluated-light budget diagnosable.

## Non-goals

- Supporting arbitrary meshes, flat quads without a Cumulus bevel, or imported
  meshes with unknown vertex contracts.
- Per-object or per-instance lighting appearance overrides.
- Refraction, recursive glass, caustics, ray tracing, planar reflections, or
  screen-space reflections.
- Making the captured backdrop behave as diffuse albedo. Scene color behind the
  glass remains transmission and is not lit a second time.
- Adding point-light shadow sampling to the mobile glass path.
- Changing `SolidChrome` or unrelated Cumulus material roles.
- Matching the web material while scene lights actively illuminate the glass.

## Visual Model

Lighting is added to the existing glass composition as two reflections.

### Edge reflection

The edge response is a narrow colored specular lobe evaluated with the actual
bevel and side normals. Its highlight therefore migrates around the rounded
silhouette as a point light moves. A Fresnel factor strengthens the glint toward
grazing view angles. The existing output-pixel face rim remains the stable Cumulus
hairline; local light may brighten the rim near the illuminated bevel but does
not widen it.

The generated mesh will carry an explicit shell-region value in its secondary
UV channel. Face vertices use zero and bevel/side vertices use one. The shader
uses this authored value rather than guessing the region from UV layout or
object scale. Back-face behavior follows the same closed-shell convention but
remains subject to back-face culling in the current materials.

### Interior reflection

The interior response is a wider, lower-energy specular lobe evaluated across
the front face. Because the light vector is computed from each fragment's world
position, the colored reflection moves continuously across a large panel as a
point light moves. This response is reflective rather than diffuse: it depends
on the surface normal, view direction, light direction, distance attenuation,
and configured roughness.

Both lobes retain the Unity light's linear HDR color. Their role strengths
control energy, while a color-response setting controls how strongly colored
lights tint the reflection. The accumulated addition is soft-limited to prevent
extreme HDR lights from destroying the pane's identity. The limiter acts only
on the new local-light addition and never alters the transmitted backdrop.

Both lobes use a dielectric GGX microfacet response with Schlick Fresnel and a
fixed uncolored normal-incidence reflectance of `0.04`. Edge and interior
roughness select different GGX lobe widths; the role strengths are art-direction
multipliers applied after the normalized response. There is no diffuse term.
After all lights are accumulated, the shader preserves RGB ratios while applying
a luminance soft ceiling from the role profile. Values below half the ceiling
remain linear; a smooth shoulder approaches the ceiling above that point.

`SceneGlass` adds both lobes after sampling and tinting the shared blur.
`OnGlass` adds them to its tonal lens without sampling the blur. The nested role
uses gentler defaults so it reads as a control resting on the parent glass
rather than a second equally strong pane.

## Architecture

### Shared shader lighting module

A focused HLSL include owns the common glass-light calculation. It accepts the
fragment's world position, normalized world normal, view direction, shell-region
value, role parameters, and a URP `Light`. It returns additive edge and interior
RGB contributions. It does not sample the blur, compose alpha, or know which
semantic material called it.

Both glass shaders compile URP's main- and additional-light variants and use the
supported Forward/Forward+ iteration macros for URP 17.5. The shaders evaluate
the main light and then a profile-bounded additional-light set. Light movement
requires no application-side updates because URP supplies current light data
each frame.

The light function uses half precision for color and scalar response where
validation shows no visible banding or instability. World position, light-vector
construction, and any operation whose precision affects highlight motion remain
at the precision required by the target platform.

### Generated mesh contract

`CumulusRoundedPanelMesh` adds a secondary UV stream containing the shell-region
mask. The contract is:

- Front and back face centers and rings: `0`.
- Front bevel, side wall, and back bevel rings: `1`.
- Interpolation across a bevel bridge is allowed and produces a smooth
  face-to-edge transition.

The mesh remains three submeshes with its existing normals, primary UVs, bounds,
and semantic material assignment. Existing generated mesh assets and deterministic
builders are regenerated to include the new stream.

### Lighting profile

`CumulusGlassLightingProfile` is a shared editor-authored asset referenced by
`CumulusMaterialLibrary`. It contains one settings group for `SceneGlass`, one for
`OnGlass`, and platform quality settings. Its primary controls are:

| Setting | `SceneGlass` default | `OnGlass` default | Meaning |
| --- | ---: | ---: | --- |
| Edge reflection strength | `0.65` | `0.42` | Energy of the bevel/side glint |
| Edge roughness | `0.14` | `0.20` | Width of the edge specular lobe |
| Interior reflection strength | `0.14` | `0.08` | Energy reflected across the face |
| Interior roughness | `0.42` | `0.52` | Width of the interior reflection |
| Light color response | `1.0` | `0.85` | Retention of the light's chroma |
| Reflection luminance ceiling | `1.25` | `0.75` | Soft upper bound for added HDR light |

The inspector presents strengths first and places roughness and color response
under advanced controls. Values have documented ranges and tooltips. Defaults
favor visible movement and recognizable light color while keeping the interior
subordinate to the illuminated edge under ordinary URP light intensities.

Quality settings default to four additional lights on desktop, one on mobile,
desktop additional-light shadows enabled, and mobile additional-light shadows
disabled. The mobile maximum is constrained to zero or one. The desktop maximum
is constrained to zero through four. These are feature budgets, not requests to
change the renderer asset's broader scene limits.

Profile values are copied into the two shared material assets by the deterministic
editor builder and validated as part of the material library. Shader properties
remain hidden on the material assets so the profile is the single authoring
surface. Runtime renderers continue to use shared materials and never clone or
mutate a material per panel.

## Rendering Data Flow

For each visible glass fragment:

1. The material computes its existing baseline transmission or tonal lens.
2. The vertex-provided shell-region value separates face response from physical
   edge response.
3. The shader evaluates the current URP main light using its color, direction,
   attenuation, and supported shadow term.
4. The shader iterates no more than the active platform's additional-light cap.
5. For each eligible light, the shared function calculates edge and interior
   reflections from current world-space geometry, view, and light data.
6. Desktop multiplies additional-light response by URP shadow attenuation.
   Mobile omits additional-light shadow variants and uses distance and angular
   attenuation only.
7. The soft-limited accumulated reflection is added to the baseline.
8. Each role performs its existing rim and alpha composition.

The additional-light loop performs no texture sampling beyond shadow data on
the desktop shadowed path. It adds no render pass, camera capture, render target,
command buffer, per-light component callback, or per-panel CPU update.

## Quality and Performance Policy

### Desktop

- Use the existing Forward+ renderer contract while remaining compatible with
  URP Forward light-loop semantics.
- Evaluate at most four additional lights per fragment.
- Apply supported main- and additional-light shadow attenuation.
- Preserve the existing total Cumulus desktop target of at most 2.0 ms at
  2560 by 1440 and 60 frames per second in the reference stress scene.
- Avoid dynamic branches inside a light evaluation where arithmetic produces
  the same bounded result more predictably.

### Mobile

- Evaluate at most one additional light per fragment, selected through URP's
  normal per-object Forward light list.
- Do not compile or sample additional-light shadows for Cumulus glass.
- Use half precision where GPU captures show stable color and highlight motion.
- Preserve the existing high-end mobile total Cumulus target of at most 3.0 ms at
  a sustained 60 frames per second after thermal stabilization.
- Allow a zero-additional-light quality setting for devices that cannot sustain
  the one-light profile. The main-light response remains available.

The desktop and mobile caps are compile-time quality variants or otherwise
bounded loops that the target shader compiler can unroll or eliminate. A
runtime integer controlling an unbounded Forward+ loop is not acceptable.

## Shadows and Occlusion

Desktop point-light shadows attenuate both reflection lobes when URP reports an
additional-light shadow. An occluder can therefore interrupt the edge shine and
interior reflection. Shadow strength follows Unity's light and shadow settings;
the Cumulus profile controls reflection strength rather than inventing another
shadow-opacity control.

Mobile point lights do not sample shadow maps. Their response still falls off by
range, distance, light angle, and the material's view-dependent reflection.
This is an explicit quality difference and is reported by diagnostics.

The feature does not change how glass casts shadows. Existing semantic caster
coverage and solid-frame shadow behavior remain separate contracts.

## Validation and Failure Behavior

The profile validates finite values and declared ranges. Invalid authoring data
is clamped for editor preview and reported as a validation error that prevents a
passing deterministic build. A missing profile causes material-library validation
to fail; already serialized shared-material values remain renderable so the
editor scene does not turn pink or invisible while the reference is repaired.

If the active renderer disables additional lights, glass renders its main-light
and baseline behavior. If no light contributes after attenuation, both new
reflection lobes return exact zero. A missing or unavailable shared blur retains
the existing `SceneGlass` fallback behavior and still receives the active
platform's supported glass lighting.

Unsupported or stripped shader variants must be caught by shader inspection and
player-build verification. The implementation must not silently replace the
mobile one-light path with an unbounded desktop path.

## Diagnostics and Logging

`CumulusGlassDiagnostics` will expose and log a stable snapshot when a camera's
glass configuration becomes active or changes. The snapshot includes:

- Active glass quality profile.
- Active renderer mode: Forward or Forward+.
- Maximum evaluated additional lights.
- Whether additional-light shadow attenuation is compiled and active.
- Whether live blur or fallback composition is active.
- The lighting-profile asset identity and role-settings version.

Diagnostics do not emit one record per light or per frame. The information is
sufficient to reconstruct why a production capture could or could not respond
to point lights without introducing continuous logging overhead.

## Verification

### EditMode and contract tests

- The rounded-panel mesh supplies the specified secondary-UV shell-region values
  for faces, bevels, and sides without changing its submesh topology.
- Both shaders compile the required URP main/additional-light and Forward+
  variants and call the shared lighting module.
- `SceneGlass` continues to sample the shared blur exactly once; `OnGlass`
  continues to sample it zero times.
- Zero light contribution leaves the existing baseline composition path
  unchanged.
- Profile defaults, ranges, material synchronization, material-library
  validation, and deterministic rebuild behavior are covered.
- Production code continues to use shared materials and creates no runtime
  material clones.

### GPU PlayMode tests

- Moving a white point light between four reference positions moves the maximum
  measured edge response to the corresponding panel-edge region.
- Red, green, and blue point lights produce matching dominant chroma in both
  edge and interior measurements for `SceneGlass` and `OnGlass`.
- The interior response changes position continuously across the face rather
  than changing only as a uniform panel-wide wash.
- Moving a point light updates the measured response on the next rendered frame;
  no stale transform or cached light data is accepted.
- With all contributing lights disabled, captures remain within the existing
  baseline parity tolerances.
- A desktop shadow-casting occluder measurably suppresses the point-light
  response behind it.
- The mobile variant responds to one point light, ignores a lower-priority
  second additional light, and contains no additional-light shadow response.
- The existing fallback, live blur, text contrast, panel motion, and interaction
  evidence remains passing.

Tests will control light positions, colors, ranges, and intensities explicitly.
They will compare spatial regions and color channels rather than relying only on
whole-frame averages.

### Performance and visual QA

- Profile the existing desktop and mobile glass stress scenes with their maximum
  supported point-light counts and representative overlapping glass coverage.
- Record glass fragment cost separately from the unchanged shared blur cost.
- Confirm no new Render Graph pass or per-panel CPU work appears.
- Sweep a colored point light around large and small rounded panels while moving
  the camera. Confirm the bevel glint tracks smoothly around straight edges and
  rounded corners without seams, popping, or UV-shaped artifacts.
- Confirm `OnGlass` remains visually subordinate to its parent and does not read
  as an opaque illuminated badge.
- Test ordinary, very dim, and extreme HDR light intensities. Confirm ordinary
  lights are expressive, dim lights fade continuously, and the soft limit keeps
  extreme lights finite and readable.
- Inspect desktop occlusion and mobile unshadowed behavior side by side so the
  declared quality difference is intentional and stable.

The repository-level acceptance gate remains `bash cumulus/scripts/verify-cumulus-mvp.sh`,
including shader inspection, deterministic asset generation, EditMode and GPU
PlayMode tests, player build, repository checks, and scope verification.

## Acceptance Criteria

The design is implemented when all of the following are true:

- A moving Unity point light produces a moving, correctly colored highlight on
  the physical bevel of both shared glass roles without application scripts
  updating the panels.
- The same light produces a separately configurable broad colored interior
  reflection whose position changes across the face.
- With no contributing light, the current glass baseline remains within its
  established parity tolerances.
- Desktop supports at most four additional lights with point-shadow attenuation;
  mobile supports at most one without point-shadow sampling.
- All appearance controls live on the shared profile and individual panels have
  no lighting overrides.
- The implementation adds no blur pass, render target, per-panel material clone,
  or per-panel light-selection update.
- Diagnostics identify the active light cap, shadow policy, renderer path, and
  material profile.
- Automated verification and platform performance budgets pass with the new
  maximum supported light counts active.
