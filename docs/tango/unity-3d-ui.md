# Tango 3D User Interface for Unity 6.5

## Summary

This document defines a world-space, mesh-based user interface for Unity 6.5
that carries Tango's visual language into a fully three-dimensional scene.
Panels, controls, cards, labels, and reveal surfaces are tangible scene
objects. They occupy depth, respond to scene lights, cast and receive shadows,
animate through space, and accept pointer, touch, keyboard, and controller
input.

The signature Tango liquid-glass surface is a hybrid material. Its shape,
bevel, highlights, lighting, occlusion, and shadows are spatial. Its frosted
view is screen-space because a pane must sample the camera image behind it to
blur live scene content. The result remains a genuine 3D object even though
one optical property is camera-dependent.

The target renderer is the Universal Render Pipeline (URP) in Unity 6.5. The
scene-color capture and blur use URP Render Graph. Every camera produces at
most one shared blur resource per frame, regardless of the number of visible
glass objects. Visible glass samples that resource and composites the current
scene behind its geometry.

Motion behind the glass is live. Moving characters, animated environments,
camera movement, and changing light remain visible as softened color and form.
The design does not treat the blur as a cached screenshot during normal
operation.

Desktop and high-end mobile devices use live backdrop frost. Mobile devices
that must preserve Unity 6.5 Tile-Only Mode use a lit, 72-percent-alpha Tango
interior without live backdrop sampling. Both modes preserve geometry, tint,
rim, sheen, typography, interaction, and motion; optical backdrop visibility
is the declared quality difference.

## Related Information

- [Tango design system](../quest_prototype/tango_design_system.md) defines the
  component, material, typography, motion, and interaction principles that the
  Unity system must preserve.
- [Tango material reference](../../.llms/skills/tango/materials.md) documents
  the canonical liquid-glass fills, blur, saturation, sheen, rim, shadow, and
  nested on-glass treatment.
- [Tango token source](../../src/tango/primitives/tango-tokens.css) is the
  authoritative visual vocabulary for the existing implementation.
- [Tango entity reveal interactions](entity-reveal-interactions.md) defines
  reveal ownership, anchoring, input modality, and material-continuity
  behavior.
- [Unity 6.5 release overview](https://docs.unity3d.com/6000.5/Documentation/Manual/WhatsNewUnity65.html)
  establishes the target engine version and relevant graphics changes.
- [Unity 6.5 upgrade guide](https://docs.unity3d.com/6000.5/Documentation/Manual/UpgradeGuideUnity65.html)
  is the compatibility reference for adopting the target engine.
- [URP Render Graph](https://docs.unity3d.com/6000.5/Documentation/Manual/urp/render-graph.html)
  is the supported custom-rendering path for Unity 6.
- [URP opaque texture settings](https://docs.unity3d.com/6000.5/Documentation/Manual/urp/universalrp-asset.html)
  describe the pre-transparency scene snapshot Unity provides for frost,
  refraction, and heat-haze effects.
- [Unity 6.5 on-tile rendering](https://docs.unity3d.com/6000.5/Documentation/Manual/on-tile-rendering.html)
  defines the mobile bandwidth path and the features that force camera targets
  into main memory.
- [Unity 6.5 on-tile post-processing](https://docs.unity3d.com/6000.5/Documentation/Manual/on-tile-post-processing.html)
  identifies the effects supported within tile memory.
- [URP motion vectors](https://docs.unity3d.com/6000.5/Documentation/Manual/urp/features/motion-vectors.html)
  establishes the Unity 6 behavior relevant to temporal anti-aliasing and
  transparent surfaces.
- [Unity 6.5 release announcement](https://discussions.unity.com/t/unity-6-5-is-now-available/1723176)
  summarizes new shader authoring, PSO tracing, lighting, and mobile rendering
  capabilities.
- [Unity 6.4 release announcement](https://discussions.unity.com/t/unity-6-4-is-now-available/1713245)
  records the current Adaptive Performance and Project Auditor foundation.
- [Unity 6.3 LTS release overview](https://unity.com/blog/unity-6-3-lts-is-now-available)
  provides the Render Graph, batching, mobile filtering, and profiling changes
  on which Unity 6.5 builds.

## Problem and Context

Tango currently expresses glass through a browser backdrop filter. The
surface samples painterly scene art, applies a 22-pixel blur and 1.5 saturation,
adds a dark translucent fill, then layers a directional sheen, bright rim,
interior highlights, and cool violet-black elevation shadow.

A Unity version must reproduce the same perceptual hierarchy while behaving as
part of a 3D world. A panel can rotate away from the camera, pass behind a
character, receive a moving spotlight, cast a shadow across a table, or travel
from one spatial anchor to another. Its visual treatment must remain
recognizably Tango through each of those states.

A conventional transparent Lit material cannot provide the complete result.
It can respond to lights and reflection probes, but it has no spatially blurred
view of the current camera color behind the object. A per-object camera or
render texture would provide that view at unacceptable scaling cost and would
make overlapping surfaces difficult to order.

The system therefore needs a rendering boundary shared across all Tango glass
objects. The scene is captured once, reduced and blurred once, and sampled by
any number of panes. Each pane retains its own geometry, lighting, semantic
material role, animation state, and interaction state.

Unity 6.5 makes several current-engine decisions relevant:

- URP Render Graph is the supported basis for new custom render passes.
- Built-In Render Pipeline is deprecated, so this design targets URP directly.
- URP's opaque texture is captured before transparent meshes and is explicitly
  intended for effects such as frosted glass and refraction.
- URP motion vectors cover opaque and alpha-clipped materials, while transparent
  materials require a separate temporal strategy.
- Tile-Only Mode rejects opaque texture, depth texture, temporal
  anti-aliasing, camera stacking, and other features that store camera targets
  outside tile memory.
- Unity 6.5 on-tile post-processing supports color grading, vignette,
  tonemapping, dithering, and film grain. Neighbor-sampling blur is outside
  that supported set.
- Additional-light shadow resolution tiers can be changed at runtime.
- Apple Adaptive Performance can expose native thermal state on iOS, tvOS,
  and visionOS.
- Pipeline State Object tracing and cache-miss tracing can identify and warm
  material variants before interaction.
- Shader Function Reflection can expose authored HLSL functions directly in
  Shader Graph while preserving HLSL as the behavior source.

## Goals

- Render Tango panels and controls as world-space meshes with meaningful
  position, depth, scale, orientation, and silhouette.
- Match the existing liquid-glass identity across tint, saturation, blur,
  sheen, rim, interior wash, shadow color, and nested on-glass controls.
- Show current-frame scene motion through live glass at the camera's rendered
  cadence.
- Let tangible interface geometry receive direct and indirect scene lighting.
- Let tangible interface geometry cast and receive art-directed shadows.
- Preserve Tango's semantic component and token discipline instead of exposing
  arbitrary per-instance appearance controls.
- Preserve material continuity: meaningful objects travel, rotate, or expand
  between states rather than being replaced through opacity fades.
- Keep text and primary controls crisp and readable against every scene
  background.
- Support mouse, pen, touch, keyboard, and controller interaction without
  depending on uGUI or UI Toolkit rendering.
- Scale from high-quality desktop presentation to thermally sustainable mobile
  presentation through explicit quality profiles.
- Make rendering cost, active quality decisions, and material behavior
  inspectable in development builds.
- Avoid work proportional to the number of glass objects when that work can be
  shared per camera.

## Design Principles

### Tangible geometry

Every visible surface is represented by renderable geometry. A pane has at
least a front surface and a shallow bevel or frame that catches light during
motion. Controls use authored mesh families for rounded panels, pills, discs,
cards, and inset selections.

Geometry communicates hierarchy. Raised controls sit forward of their parent
surface. Selected segments can occupy a shallow frosted well. Reveal panels
travel from the entity or anchor that caused them. Physical depth remains
subtle enough that the interface reads as one system rather than miniature
architecture.

Hit targets are stable semantic volumes. The interaction collider follows the
control's intended target area rather than every decorative bevel. Minor mesh
detail therefore cannot introduce pointer gaps or unstable hover boundaries.

### One material vocabulary

The Unity material catalog mirrors Tango's semantic roles:

- Scene glass is the standard live frosted material over scene media.
- Popover glass uses the warmer violet-black reveal tint.
- On-glass is a lighter tonal lens for a control resting on parent glass.
- Solid chrome is an opaque or near-opaque material for dense information.
- On-media content uses outline or physical backing appropriate to its role.

Callers choose one of these named roles. They do not supply arbitrary blur,
rim, shadow, saturation, or tint values. Platform quality changes alter how a
role is rendered globally while preserving its semantic identity.

The standard glass target begins with the existing Tango values:

- Fill: neutral near-black at 54 percent alpha.
- Popover fill: violet-black at 50 percent alpha.
- Backdrop blur: 22 output pixels at the reference presentation scale.
- Backdrop saturation: 1.5.
- Directional sheen: white at 7 percent, fading through 42 percent of the
  surface along the existing 150-degree direction.
- Rim role: a one-output-pixel white hairline whose rendered luminance matches
  the web's 14-percent rim under the reference output transform.
- Top inset highlight: white at 22 percent.
- Lower interior wash: white at 4 percent.
- Elevation color: cool purple-black rather than neutral gray.

These values are perceptual references. Renderer projections use calibrated
values appropriate to their compositing space and preserve the reference
appearance under the visual conformance scenes.

The reference presentation is a 2560 by 1440 display-linear capture. The pane
covers 40 percent of output height and its face remains within 15 degrees of
the camera plane. A black-and-white edge moving behind the pane must produce a
22-pixel plus or minus 2-pixel perceptual blur spread. Flat-region tint must
remain within a Delta E 2000 value of 3 from the browser reference after the
same output transform; interior sheen peak luminance must remain within 10
percent. The face rim remains at most two output pixels wide and contributes at
most 0.065 display-linear luminance above the fitted local interior. Primary
text targets 4.5:1 measured contrast against the composed glass result.

### Lighting without double-lighting

The captured scene color already contains scene lighting. The visible glass
shader must not light that sample a second time as though it were diffuse
albedo.

Scene lighting instead contributes to the pane through distinct physical
responses:

- Specular response on the front surface and bevel.
- Fresnel response at grazing angles.
- Reflection-probe or environment response.
- Light-dependent rim and edge emphasis.
- Controlled transmission tint modulation.
- Shadow attenuation affecting the physical shell and edge response.

The blurred background remains a view through the pane. Direct lighting is
mixed into the glass object around that view. This keeps the scene recognizable
and prevents bright lights from flattening the entire frosted interior.

The standard presentation accepts a main directional light and a bounded set
of additional lights. The desktop renderer may use Forward+ for scenes with
many local lights. Mobile profiles impose an explicit per-pixel light budget
even when the renderer can technically expose more.

### Art-directed shadow behavior

Every tangible Tango object has a defined shadow role:

- Solid frames, bevels, cards, icon discs, and opaque chrome cast normal
  geometry shadows.
- The translucent pane casts a faint, art-directed coverage shadow when that
  shadow improves spatial grounding.
- Fine text and decorative marks do not create noisy shadow silhouettes.
- Nested controls share the parent panel's shadow unless their physical
  separation is large enough to read as a distinct object.
- Hidden, disabled, or culled interface objects do not remain in shadow maps.

Transparent visible shading and shadow-map rendering are separate contracts.
The pane's visual alpha does not directly determine shadow darkness. Semantic
caster coverage at reference quality is:

- Solid frame, card, disc, and chrome: 100 percent.
- Standard and popover live pane: 20 percent.
- Mobile live pane: 12.5 percent.
- Tile-preserving pane: zero; its frame remains at 100 percent.
- On-glass child control: zero independent coverage; its parent owns the
  composite shadow.

Coverage means the fraction of pane samples admitted to the shadow map through
a fixed blue-noise pattern anchored in pane-local coordinates. The pattern seed
is stable across cameras, frames, resolution tiers, and motion. Shadow filtering
turns that coverage into a faint shadow. Measured admitted coverage may differ
from the role target by at most one percentage point over a 256 by 256 pane
sample. Quality profiles select named levels and never interpolate coverage per
instance. Mesh shadow bias follows the receiving light's authored URP bias
settings and receives a dedicated acne and separation QA sweep. The moving
shadow may not exhibit a temporally alternating dither pixel at reference
viewing distance.

Shadow color is produced by the receiving scene and lighting model. The Tango
violet-black elevation treatment remains a local contact or screen-space
accent where needed; it does not recolor every world shadow.

## Rendering Model

### Render pipeline

The target is Unity 6.5 URP with Render Graph enabled. Compatibility Mode is
not an implementation target. The rendering contract must be visible in Render
Graph Viewer and use named resources whose lifetime is bounded to the camera
frame.

The renderer uses one logical glass system per camera. Multiple visible panes
share capture, reduction, and blur products. A second camera incurs a second
glass cost only when it renders Tango glass.

The default frame ordering maps to Unity 6.5's After Rendering Post Processing
injection point:

1. Shadow casters, including tangible Tango geometry, render into applicable
   light shadow maps.
2. The opaque scene renders normally.
3. Camera-wide behind-glass transparent content renders into the scene color.
4. The normal URP post stack, including temporal anti-aliasing, motion blur,
   exposure, depth of field, bloom, color grading, and tone mapping, completes.
5. The post-processed scene color is reduced and spatially blurred.
6. A Tango depth-only pass writes the nearest visible panel silhouette.
7. Tango glass, controls, text, glyphs, and focus treatments render against
   that depth with bounded display-space lighting and manual backdrop
   composition.
8. Designated foreground world transparency that must cover Tango renders in
   the same display-linear space.
9. Unity performs the final output copy or display encoding.

The implementation may merge compatible work within Render Graph. The visible
ordering and ownership invariants above remain fixed.

### Scene capture membership

Opaque scene geometry is present in the live glass view by default.

Transparent objects participate through an explicit camera-wide
classification:

- Behind-glass transparency is included before the glass capture and must be
  physically behind every live pane rendered by that camera. Examples may
  include a distant atmospheric effect.
- Tango text, glyphs, motes, and highlights render with their owning Tango
  depth group. Foreground world transparency is reserved for camera-proximate
  effects that must cover both scene and interface.
- Other Tango glass uses the on-glass relationship when surfaces overlap.
  Recursive blur through an arbitrary stack of panes is not part of the
  compositing contract.

An opaque object that is physically in front of the pane wins through scene
depth. An opaque object behind the pane contributes to the blurred view. A
transparent object whose depth crosses different panes cannot join the
behind-glass class; it uses the foreground class or a content-specific opaque
representation. The classification is authored and diagnosable rather than
being inferred from transparent sort order.

### Live motion contract

The glass source updates every rendered camera frame while live glass is
visible. It is not movement-triggered and does not wait for a dirty-region
signal.

Consequently:

- An animated object behind stationary glass remains animated through the
  frost.
- A moving pane samples the scene at its new screen-space location in the same
  frame.
- Camera movement changes the view through the pane continuously.
- Moving light and shadow in the captured scene remain visible through the
  frost.
- Physical specular and Fresnel responses update from the pane's current
  transform and the current camera.
- The pane's cast shadow follows its current transform through the normal
  real-time shadow path.

Motion does not increase the blur pass cost. It prevents use of a persistent
cached image. The cost is governed by camera resolution, reduction scale,
filter work, glass screen coverage, overdraw, light count, and shadow work.

Quality profiles may reduce blur resolution during sustained GPU or thermal
pressure. They must continue to update it every rendered frame. A fluid
lower-resolution view is preferred to a sharper view refreshed at half rate.

### Blur resource

The blur resource is spatial and current-frame. It must not rely on temporal
accumulation because temporal history would trail moving silhouettes behind
the pane.

The renderer may select an appropriate separable, dual, or Kawase-style
spatial filter. The contract requires:

- Stable output during subpixel camera motion.
- A perceptual radius matching 22 output pixels at reference scale.
- Radius consistency under dynamic resolution and render scale.
- Edge handling that does not pull undefined color into the pane.
- Color handling matched to URP's post-processed display-linear source.
- A shared result suitable for all visible glass materials.

The system defines reduction in unambiguous linear dimensions. A half-width,
half-height target contains one quarter of the full-resolution pixels. A
quarter-width, quarter-height target contains one sixteenth.

Desktop quality begins from half-width, half-height. Mobile live quality may
use quarter-width, quarter-height. The chosen level is a global quality
decision, not a per-panel material override.

### Backdrop composition

The pane owns the composite of blurred scene, saturation, dark tint, physical
lighting response, sheen, rim, and interior wash. Standard alpha blending must
not blend an already composited backdrop over the same backdrop a second time.

The Tango depth pass uses depth writes with a less-than-or-equal test against
retained scene depth. It also records a stable panel-group owner for each Tango
pixel. Visible glass uses an equal-depth test without depth writes. Child text,
controls, motes, and highlights render only where their panel-group owner wins,
so offset content from a rear panel cannot punch through a front pane. Exact
coplanar ties use stable semantic layer followed by stable instance identifier.
Back faces do not claim ownership unless a component explicitly presents a
two-sided surface. The depth pass does not alter captured scene color.

Independent panes may cross during material-continuity motion, but they do not
interpenetrate at rest. One live pane contributes at each pixel. A nested
on-glass control belongs to its parent's depth group rather than competing as
another pane.

The diagonal sheen is anchored to the pane's authored surface coordinates so
it travels with the object. Fresnel and specular response are view- and
light-dependent. This combination makes the pane feel materially stable while
remaining responsive to movement.

The face rim is evaluated in output-pixel space. The shader converts authored
surface distance with screen-space derivatives, giving standard and on-glass
roles a stable hairline across pane dimensions, aspect ratios, render scales,
and perspective. The rim composites toward white at its calibrated opacity.
Physical bevel, specular, and Fresnel responses provide the spatial edge
behavior around that restrained face treatment.

Subtle refraction may offset the blur sample using the physical surface normal
or an authored normal field. Refraction remains subordinate to legibility. It
reduces toward zero during fast panel motion and on mobile quality profiles.

### Temporal anti-aliasing and post-processing

Unity 6.5 URP does not provide motion vectors for transparent materials. A
transparent pane's geometry motion and the independently moving content seen
through it therefore cannot be represented reliably by the standard motion
vector texture.

The required integration uses Unity 6.5's After Rendering Post Processing
injection point. Tango geometry and content remain outside temporal history and
sample the post-processed scene color. The shader receives current scene depth,
light direction/color, shadow attenuation, and exposure metadata, but maps its
lighting response into the same display-linear space as the post-processed
source. Tango token colors are authored for that space. The final platform
copy or HDR display encoding applies afterward.

Unity 6.5's URP motion-vector documentation states that transparent materials
do not receive motion-vector support. This ordering makes that engine limit
irrelevant to Tango geometry and keeps camera motion blur from smearing
typography or focus indicators. Scene TAA and motion blur may remain visible in
the captured scene before the glass blur. FXAA or SMAA may run within the
Tango visible pass as a spatial edge treatment.

Scene post-processing artifacts remain scene artifacts: the glass cannot
recover detail already ghosted by TAA. The reference camera path permits no
more than a two-output-pixel, one-frame residual trail at a moving black-white
edge before the spatial blur is applied. A scene profile that exceeds that
threshold uses its spatial anti-aliasing configuration.

Any platform that cannot preserve this ordering uses the tile-preserving
material. A reactive-mask or pre-temporal glass integration is outside the
conformance path.

### Multiple panes and nesting

Multiple non-overlapping panes sample the same blur resource at constant shared
blur cost. Their incremental cost is their shaded screen coverage, geometry,
lights, and shadows.

Overlapping glass follows these rules:

- Parent glass provides the live scene frost.
- A control or panel resting on parent glass uses the on-glass tonal lens.
- The nested surface adds its brighter rim, sheen, and tighter shadow without
  requesting another scene blur.
- Independent panes may overlap geometrically, but the visual result must use a
  deterministic layer and depth policy.
- Deep recursive transmission is not required for Tango conformance.

## 3D Component System

### Semantic component ownership

Unity components expose the same strict roles as Tango rather than becoming a
collection of freeform meshes and materials. A component owns its rendering,
interaction state, semantic content, and allowed variants.

Callers may place, orient, scale, and arrange a component. They may select a
documented semantic variant. They do not assign arbitrary materials, shader
keywords, colors, bevels, shadows, or animation curves.

The component catalog includes at least:

- Pressable surface.
- Primary button.
- Glass button.
- Icon button.
- Segmented control.
- Select control.
- Info card and reveal surface.
- Group panel.
- Speech bubble.
- Dialog surface.
- Game card.
- Resource and stat marks.
- Persistent status chrome.

Each family uses shared authored geometry and material roles. Screen-specific
copies of a component's mesh, material, or interaction behavior are component
forks and fail conformance review.

### Tokens and authoring

Unity consumes a generated or validated projection of Tango's semantic tokens.
Token identifiers and semantic roles are stable across implementations even
when a renderer-specific representation differs.

The projection covers:

- Material colors and opacity.
- Glass blur and saturation.
- Rim, sheen, inset, glow, and shadow roles.
- Typography voices and glass text colors.
- Spacing and corner-radius scales.
- Press and hover scales.
- Motion durations and easing curves.
- Platform quality policy.

Token changes must be reviewable as system-wide changes. Runtime instances do
not clone materials merely to hold ordinary state. Per-renderer state uses
batch-friendly channels where possible.

Unity 6.5's reflected HLSL Shader Graph nodes may expose shared lighting and
glass functions to technical artists. The shader pass contract, render state,
shadow behavior, and Render Graph integration remain governed by the renderer
rather than by ad hoc graph variants.

### Typography and legibility

Text is world-space geometry or a mesh-based text renderer placed with a small,
intentional separation from its supporting surface. It is not rasterized into
the glass capture.

Text on liquid glass uses the Tango on-glass primary and muted roles. Accent
purple is reserved for framing, glow, and semantic marks rather than paragraph
or label copy over live frost.

The system preserves readable angular size across supported camera distances.
Components may use an authored scale policy to maintain their intended
presentation, but scale changes preserve physical relationships between panel,
bevel, text, collider, and child controls.

At the supported interaction distance, body text renders at a minimum
16-output-pixel em size. Pointer targets subtend at least 44 output pixels on
desktop and 48 output pixels on touch profiles. Components that would fall
below either threshold become non-interactive or move to their authored closer
presentation instead of exposing an undersized target.

Text receives enough scene relationship to belong in the world without
allowing scene lights to destroy contrast. Primary glyph color remains stable;
subtle specular, occlusion, or emission can ground it physically.

### Interaction

World-space interaction is independent of uGUI and UI Toolkit. Input produces
semantic hover, focus, press, drag, hold, and activation events through stable
hit volumes and an explicit focus graph.

- Mouse and hover-capable pen use pointer hover and press.
- Touch uses direct press behavior and the Tango reveal contract.
- Keyboard and controller move focus through semantic neighbors.
- Gaze or XR rays may use the same pointer contract when an XR profile is
  enabled.
- Disabled controls remain discoverable to focus/accessibility systems only
  when their semantic state should be announced.

Visual press compresses the tangible object using Tango's shared press factor.
Hover uses the shared hover scale appropriate to the component family. Press
wins when hover and press are both active.

Focus is a first-class visible state, not a simulated mouse hover. It must
remain visible against bright and dark scene content and must follow moving
controls without lag.

### Accessibility semantics

Each tangible control exposes a semantic label, role, value, state, and
activation action independent of its mesh or text renderer. Navigation order
is semantic rather than derived from world hierarchy order.

The accessibility layer must be able to describe glass controls even when
their visual quality profile changes. A mobile fallback material therefore has
no effect on control identity or announcements.

Reduced-motion preference disables ambient drift and shortens spatial travel
while preserving material continuity and state comprehension. Important
objects still move between meaningful anchors when that motion communicates
identity.

## Motion Behavior

Tango's material-continuity rules apply in world space:

- Objects travel from source to destination.
- Containers expand or contract around persistent content.
- Cards, resources, and other tangible entities retain identity during state
  changes.
- Readout chrome may remain still.
- Ambient tangible objects may drift gently.
- State changes avoid opacity-only entrances and exits.

The reference object-travel timing is 420 milliseconds with cubic Bezier
control points (0.16, 1, 0.3, 1). The reference container transform is 320
milliseconds with control points (0.22, 0.61, 0.36, 1). Runtime animation
represents those curves directly and applies them across component families.

Glass motion preserves four distinct frames of reference:

- Geometry, authored sheen, text, and controls move with the object.
- Specular and Fresnel change with camera and lights.
- The blurred scene sample follows the pane's current screen-space footprint.
- Cast shadows follow the object's current world transform.

Fast movement may lower refraction strength to protect legibility. Blur radius,
tint, rim, and semantic material identity remain stable through the motion.

Refraction velocity is the maximum screen-space velocity of the projected pane
corners, measured in final output pixels and filtered over the current and
previous frame. It includes camera and object motion, is independent of render
scale, and is evaluated per eye in stereo. Refraction begins reducing above
600 pixels per second and reaches zero at 1200. It returns over 240 milliseconds
after speed remains below 500 pixels per second. Interrupted travel preserves
the current transform and velocity, then eases toward its new target.

Reduced-motion mode removes ambient drift and refraction. Object travel and
container transforms use the shared 140-millisecond fast duration with the same
curves, preserving spatial identity without prolonged movement.

## Platform Quality Policy

### Desktop quality

Desktop live glass uses:

- Current-frame scene capture.
- Half-width, half-height blur source by default.
- Full Tango blur, saturation, tint, sheen, and rim.
- Subtle refraction where it survives motion QA.
- Main light and a bounded additional-light set.
- Real-time shadow casting for tangible UI geometry.
- Reflection probes or the selected environment-lighting path.
- PSO tracing and warming for every shipped material variant.

Forward+ is appropriate when local-light density justifies its clustered light
selection. The material must implement the current Unity Forward and Forward+
light-loop contracts rather than assuming per-object Forward behavior.

The desktop glass shader evaluates one main light and at most four additional
lights per pixel. At most two additional lights cast shadows on Tango geometry.
Priority is directional key light, focused interaction light, nearest authored
accent light, then distance with stable instance identifier as the tie-breaker.

`SceneGlass` and `OnGlass` share a dielectric GGX lighting module. Tango's
generated rounded-panel mesh supplies an explicit face-versus-shell channel:
the shell uses a narrow colored lobe that travels around the modeled bevel, and
the face uses a broader, lower-energy colored reflection. The shared
`TangoGlassLightingProfile` authors both semantic roles; panel instances do not
override it. With no contributing light, both lobes contribute exact zero and
the calibrated transmission or tonal-lens composition remains unchanged.

Desktop reference budgets are measured at 2560 by 1440:

- At 60 frames per second, total Tango glass GPU cost targets 2.0 milliseconds
  or less in the reference stress scene.
- At 120 frames per second, the quality profile targets 1.25 milliseconds or
  less or selects a reduced blur profile.
- Glass CPU submission and quality management target 0.3 milliseconds or less
  on the reference desktop CPU.
- Interaction must not trigger a first-use shader compilation hitch.

These are acceptance budgets for the feature, not universal predictions for
all scenes or hardware.

### Mobile live-glass quality

High-end mobile may use live backdrop blur with these constraints:

- Current-frame blur at quarter-width, quarter-height by default.
- One shared blur resource per camera.
- One main per-pixel light and a small additional-light budget.
- One primary shadow-casting light for interface geometry.
- Reduced or disabled refraction.
- Half-precision fragment calculations where visual validation permits.
- Strict control of overlapping transparent screen coverage.
- Adaptive reduction of blur resolution and additional-light shadow tier.

Mobile live glass evaluates one main light and at most one unshadowed
additional light per pixel. The main light is the sole shadowed light affecting
Tango geometry.

Live backdrop sampling forces camera color out of tile memory. Unity 6.5
Tile-Only Mode therefore cannot be the active rendering contract for this
profile. The development build must report that decision explicitly instead of
silently losing on-tile behavior.

The high-end mobile target is a sustained 60 frames per second after thermal
stabilization. Tango glass targets 3.0 milliseconds or less of GPU time in the
mobile reference stress scene. A device that cannot sustain the target selects
a lower profile.

### Mobile tile-preserving quality

The tile-preserving profile keeps Unity 6.5 Tile-Only Mode valid. It uses:

- The same 3D meshes, bevels, tokens, typography, and interaction behavior.
- Scene lighting, reflection probes, Fresnel, tint, sheen, and rim.
- A 72-percent-alpha interior treatment without camera-color sampling.
- A simplified shadow policy and bounded light count.
- Unity's supported on-tile color grading, tonemapping, vignette, dithering,
  and film grain where the project uses them.

This profile is an intentional semantic rendering of Tango glass, not a frozen
scene image. Motion remains apparent through lighting and parallax around the
surface, while backdrop forms are not optically blurred through the pane.

Tile-preserving quality is the baseline for midrange and low-end mobile and may
be selected under sustained thermal pressure.

Profile capability is deterministic. A camera with Tile-Only Mode enabled uses
tile-preserving quality. A camera with Tile-Only Mode disabled may use live
quality only when the device profile declares Metal or Vulkan camera-texture
support and the measured budget remains satisfied. Unknown devices begin in
tile-preserving quality and earn live quality only after the benchmark probe
passes without a thermal warning.

When degrading to tile-preserving quality, the 240-millisecond visual
transition completes while the live capture remains valid. At the following
frame boundary the renderer releases the capture and enables Tile-Only Mode.
When upgrading, the renderer disables Tile-Only Mode, allocates and validates
the live capture, then begins the visual transition. Allocation or validation
failure leaves the fully initialized tile material active.

### Thermal and adaptive behavior

Quality changes are centralized and hysteretic. Degradation requires two
continuous seconds over the profile GPU budget or a serious thermal warning.
Recovery requires fifteen continuous seconds below 80 percent of the next
profile's budget with nominal thermal state. A profile remains active for at
least ten seconds unless a critical thermal warning requires immediate
degradation.

The scaler may adjust, in order of perceptual preference:

- Refraction strength.
- Blur source resolution.
- Blur filter work.
- Additional-light count affecting glass.
- Additional-light shadow resolution tier.
- Pane shadow coverage, selected directly from the named profile levels.
- Live-glass versus tile-preserving material mode.

Transitions between live and tile-preserving glass use the shared
240-millisecond base duration. The destination is initialized before the
transition begins. A transition interrupted by thermal escalation continues
from its current blend value toward the safer profile.

World-shadow coverage changes discretely at the frame boundary after the
visual transition. The on-glass "tighter shadow" is a local object-space
contact darkening authored into the control treatment; it does not add a world
shadow caster or sample camera depth. The treatment is available in Tile-Only
Mode.

Apple platforms use Unity 6.5 Adaptive Performance thermal information when
available. Android and other platforms use the active provider, frame timing,
and project quality policy.

## Performance Model

### Reference workload and measurement

All feature budgets use a committed deterministic stress scene with:

- Three live panes covering 40 percent of the output, with a peak overlap of
  two panes.
- Twenty on-glass controls, two reveal surfaces, and 200 visible glyphs.
- One animated skinned character, moving high-contrast props, and a panning
  camera behind the glass.
- One shadowed directional light, four eligible desktop additional lights, and
  the profile-specific shadow limits.
- HDR scene rendering, linear color, render scale 1.0, and the profile's
  declared anti-aliasing and post-processing path.

The workload uses fixed seed `0x54414E47` and a 20-second looping camera,
animation, light, and interaction recording. Forty percent is aggregate glass
coverage; the busiest frame has two overlapping panes across 15 percent of the
output. The recording, scene content, URP asset, post profile, and benchmark
manifest are versioned together so a result always identifies their revision.

"Total Tango glass" is the GPU and CPU delta between that scene and the same
deterministic run with Tango visible, depth, shadow-caster, capture, blur, and
interaction work disabled. The delta includes Tango's added shadow-map work.

Desktop reference configurations are a retail GeForce RTX 3060 12 GB or Radeon
RX 6600 8 GB with a retail Ryzen 5 5600, default power limits, Windows 11, and
Direct3D 12. Apple desktop validation uses a base M2 Mac mini and Metal. Mobile
live references are iPhone 15 Pro and Pixel 8 Pro using Metal and Vulkan.
Each configuration owns a separate baseline and budget result; results are not
compared across configurations.

Every capture records exact device SKU, OS build, graphics driver, Unity patch,
URP package, graphics API, player settings, clocks, power mode, battery charge,
and benchmark revision. Mobile starts unplugged at 90 to 100 percent charge
with low-power mode disabled. Ambient temperature is 22 degrees Celsius plus or
minus 1 degree. VSync is disabled. The synchronized Tango-enabled and disabled
runs occur in the same session, and a result is comparable only to a run whose
environment manifest matches.

Desktop release builds warm for 300 frames, then collect at least 1,000 frames.
The budget applies to the median and the 95th percentile may not exceed 1.5
times the budget. Mobile release builds run the stress camera for ten minutes
before collecting a five-minute sample. The mobile budget applies to the
median, the 95th percentile may not exceed 1.5 times the budget, and the active
profile must remain thermally stable throughout the sample. Stable means the
provider reports the same non-critical thermal state for the final two warmup
minutes and the full sample, with no frequency- or thermal-triggered profile
change. GPU timestamps and Unity ProfilerRecorder values are captured from a
non-development release build by the benchmark harness.

Device-specific product targets may add stricter budgets. They may not weaken
the reference workload or omit passes from the feature delta.

### Shared blur cost

Blur cost is primarily proportional to render target pixels, samples per pixel,
format bandwidth, and pass count. It is largely independent of whether the
captured scene pixels changed.

Motion behind the pane therefore adds normal scene animation cost but does not
add another blur. Ten panes and one pane share the same blur work when they are
rendered by the same camera.

At 2560 by 1440, a half-width, half-height RGBA16F target is approximately 7.4
MB. Two such transient targets are approximately 14.8 MB. A quarter-width,
quarter-height pair is approximately 3.7 MB.

At 3840 by 2160, a half-width, half-height RGBA16F pair is approximately 33.2
MB. A quarter-width, quarter-height pair is approximately 8.3 MB.

The Render Graph should alias transient resources where lifetimes allow and
avoid duplicate camera-color copies. Format selection must preserve the
post-processed source without visible banding while respecting mobile
bandwidth.

### Glass fill and overdraw

Visible glass cost is proportional to covered pixels, shader complexity,
lights, and transparent overlap. Large fullscreen panes may cost more than
hundreds of small controls.

The system tracks:

- Total visible glass screen coverage.
- Maximum glass overdraw depth.
- Number of visible lit panes.
- Number of lights evaluated across glass pixels.
- Number of shadow-casting Tango renderers.
- Blur source dimensions and format.
- Render Graph pass and store/load behavior.

Quality policy can reduce optical work, but screen composition should also
avoid stacking broad translucent panels when a single parent surface can own
the group.

### Lighting and shadows

Every additional per-pixel light adds fragment work over the glass footprint.
Every shadow-casting light adds shadow-map work for applicable Tango geometry.
Point lights are especially expensive because their shadow representation
requires multiple views.

Mobile profiles use a deliberate light-layer or equivalent membership policy
so decorative world lights do not all affect interface glass. Desktop scenes
may accept more lights through Forward+, but must still meet the feature budget.

Unity 6.5 runtime shadow-resolution tiers are part of adaptive quality for
additional lights. The main light's cascade and atlas settings remain project
quality decisions and are measured with interface casters present.

### CPU and batching

The system shares meshes and materials across component instances. Runtime
state should preserve SRP Batcher or instancing compatibility. Dynamic batching
is not a foundation because Unity 6.5 deprecates it.

Hover, focus, and press states must not instantiate materials. Semantic state
is supplied through batch-friendly per-renderer values, instance data, or a
shared state representation selected by the implementation.

Inactive panels are culled from visible, interaction, and shadow work. The
system avoids per-frame hierarchy rebuilding for ordinary animation and state
changes.

## Diagnostics and Observability

A development inspection surface must expose:

- Unity version, URP version, graphics API, and active rendering path.
- Active Tango quality profile and the reason it was selected.
- Whether live glass or tile-preserving glass is active.
- Blur input source, dimensions, format, radius, and pass count.
- Visible glass coverage and overdraw estimate.
- Active main and additional lights affecting glass.
- Tango shadow casters and active shadow resolution tiers.
- Whether temporal anti-aliasing, motion blur, dynamic resolution, XR, and
  camera stacking are active.
- Render Graph resource and pass names needed to inspect the frame.
- CPU and GPU timing for capture, blur, glass shading, controls, and shadows.
- Thermal state and adaptive scaler state where providers expose them.
- PSO cache misses involving Tango shaders.

Development builds log quality transitions with the previous profile, next
profile, triggering measurement, thermal state, and hysteresis decision. Logs
must be sufficient to reconstruct why a production device selected a given
material mode.

Render Graph Viewer, Frame Debugger, Rendering Debugger, Profiler, GPU vendor
tools, and the built-in Project Auditor are part of the validation workflow.

## Failure Behavior

If the blur resource is unavailable, invalid, or incompatible with the active
camera, glass renders with the tile-preserving semantic material. It never
samples undefined memory, flashes unblurred camera color, or becomes fully
transparent.

If a camera has no visible live-glass objects, the glass capture and blur are
culled from the Render Graph.

If a requested quality combination conflicts with Tile-Only Mode, development
builds report the conflict and choose the declared profile. Release builds use
the same deterministic policy without relying on validation exceptions.

If an additional light or shadow budget is exceeded, lower-priority lights are
excluded from glass using a stable semantic priority. Their inclusion must not
flicker as objects move near a threshold.

If temporal integration fails its motion-quality requirements, the renderer
selects the validated spatial anti-aliasing or post-temporal composition path.
Legible current-frame UI is preferred to temporally smoothed ghosting.

## Alternatives Considered

- Per-panel cameras or render textures duplicate culling, rendering, memory,
  and ordering as pane count grows; the shared per-camera blur bounds that work.
- Physically based transmission and refraction cannot reproduce Tango's broad,
  stable frost, but provide the foundation of the tile-preserving profile.
- Cached snapshots freeze animation and lighting and invalidate under camera or
  pane motion; live glass instead reduces spatial resolution under pressure.
- Per-pane kernels scale pass management with pane count and changing bounds;
  the shared resource better fits screens with many glass controls.
- Recursive transmission adds sorting and memory beyond Tango's need; nested
  controls use the on-glass treatment.
- Tile-only live blur is incompatible with Unity 6.5's camera-texture rules;
  the platform selects live frost or tile preservation explicitly.

## Compatibility Requirements

- The implementation targets Unity 6.5 and its corresponding URP packages.
- Render Graph remains enabled in supported configurations.
- The Built-In Render Pipeline is outside the renderer contract.
- Existing Tango token roles and component semantics remain authoritative.
- Quality profiles may change rendering technique but not semantic component
  identity, interaction, content, or accessibility.
- Desktop graphics APIs must support the selected post-process capture format
  and URP renderer path.
- Mobile live glass is validated separately on Metal and Vulkan devices.
- Mobile tile-preserving glass is validated with Tile-Only Mode checks enabled.
- Dynamic resolution must update blur dimensions, sampling, and perceptual
  radius correctly.
- XR support, when enabled, uses stereo-correct screen-space sampling and
  validates each eye independently under single-pass instanced rendering.
- Multiple cameras pay and own separate blur resources only when they render
  live Tango glass.
- Scene loads and quality changes prewarm required material variants or provide
  a hitch-free first presentation.

## Acceptance Criteria

### Visual material

- Standard and popover glass interiors match Tango reference captures for
  tint, saturation, blur, sheen, and cool elevation character.
- Standard and on-glass face rims satisfy the screen-space width and luminance
  restraint budgets independently of interior parity.
- On-glass controls preserve the parent scene color and read as a distinct
  nested object.
- Bevel and rim respond coherently to moving camera and scene lights.
- Blurred scene color is not visibly double-lit.
- Text remains legible over bright sky, white art, gold art, and dark scenes.
- Refraction, when enabled, does not disrupt reading during interaction or
  motion.

### Motion

- Opaque animated objects behind glass remain visibly animated at the current
  rendered cadence.
- Moving glass samples its current screen position without a frozen or delayed
  backdrop.
- Camera motion produces stable frost without edge shimmer or stale history.
- Pane, text, sheen, collider, focus, and shadow remain spatially aligned
  throughout object travel and container transforms.
- Fast motion does not produce TAA trails, smeared text, or swimming refraction.
- Quality changes do not flash, freeze, or reveal an uninitialized capture.

### Lighting and shadows

- Glass receives the main scene light and the profile's allowed additional
  lights.
- Tangible Tango geometry casts shadows at the intended semantic coverage.
- A moving panel's shadow follows its current transform.
- Shadowed and unshadowed glass preserve readable material identity.
- Light count and shadow tier changes are stable and diagnosable.

### Interaction

- Pointer hit regions remain stable across bevels, animation, and quality
  changes.
- Hover, press, focus, touch reveal, drag cancellation, and activation follow
  Tango's shared contracts.
- Keyboard and controller navigation remain deterministic as panels move.
- Focus and disabled state remain visible on every glass quality profile.
- Accessibility label, role, value, state, and action remain available
  independently of rendering mode.

### Performance

- One camera uses at most one shared live blur operation per frame.
- Blur work disappears when no live-glass object is visible.
- Material state changes preserve batching and avoid runtime material clones.
- Desktop and mobile reference scenes meet their declared sustained budgets.
- Mobile measurements include thermal stabilization rather than launch-only
  performance.
- Tile-preserving mode passes Unity 6.5 Tile-Only validation.
- Live-glass mode reports its off-tile bandwidth decision explicitly.
- First interaction with each shipped glass variant has no PSO compilation
  hitch.

## Manual QA

1. Open the reference scene with one standard pane, one popover pane, nested
   on-glass controls, solid chrome, text, and a moving light. Compare the
   materials with Tango reference captures on bright, dark, white, gold, and
   violet scene backgrounds.
   Confirm the face rim remains a hairline while the physical bevel responds
   to the scene light.
2. Move an opaque animated character behind stationary glass. Confirm current
   motion remains visible as blurred form and color without freezing, trails,
   or frame-rate stepping.
3. Move and rotate the pane across a detailed scene. Confirm the backdrop
   samples the current position while sheen, text, collider, specular response,
   and shadow remain attached to the object.
4. Cross two glass panels and exercise a nested control. Confirm deterministic
   depth and the on-glass tonal relationship without recursive darkening or a
   second blur.
5. Place opaque and transparent objects before and behind the pane. Confirm
   each transparent classification appears in the intended capture layer and
   that foreground depth wins.
6. Sweep the main light and several local lights around the pane. Confirm bevel,
   Fresnel, reflections, shadow attenuation, and cast shadows respond while the
   captured scene is not double-lit.
7. Exercise hover, press, focus, touch reveal, controller navigation, disabled
   state, drag cancellation, and reduced motion while panels are moving.
8. Enable the supported temporal and motion-blur configurations. Pan the camera
   and move high-contrast objects behind glass. Confirm labels remain crisp and
   there are no ghost silhouettes or delayed blur.
9. Inspect the frame in Render Graph Viewer and Frame Debugger. Confirm one
   shared blur per participating camera, expected transient resource sizes,
   declared pass ordering, and culling when glass is absent.
10. Profile the desktop stress scene at 2560 by 1440 at 60 and 120 frames per
    second. Record capture, blur, glass shading, control, shadow, CPU, memory,
    overdraw, and PSO measurements against the acceptance budgets.
11. Profile high-end mobile live glass on Metal and Vulkan after thermal
    stabilization. Confirm the active profile, blur resolution, light budget,
    shadow tier, GPU cost, and thermal transitions are logged.
12. Enable mobile tile-preserving quality and Unity 6.5 Tile-Only Mode. Confirm
    validation passes, the lit fallback remains recognizably Tango, and no
    camera color or depth texture is requested by the glass system.
13. Force blur allocation failure, camera incompatibility, and a quality
    transition. Confirm the deterministic fallback remains opaque enough to
    read, interaction continues, and diagnostics explain the decision.
14. If XR is enabled, validate both eyes with single-pass instanced rendering,
    head motion, controller rays, and overlapping panes. Confirm stereo-correct
    blur sampling, stable depth, and the platform performance budget.
