#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GUARD="$SCRIPT_DIR/cumulus-scope-guard.py"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/cumulus-scope-guard.XXXXXX")"
trap 'rm -rf "$TEST_ROOT"' EXIT

PASS_COUNT=0
FAIL_COUNT=0

write_source() {
  local fixture="$1"
  local source="$2"
  local body="$3"
  mkdir -p "$fixture/$(dirname "$source")"
  printf '%s\n' "$body" > "$fixture/$source"
  printf 'fileFormatVersion: 2\nguid: 11111111111111111111111111111111\n' > "$fixture/$source.meta"
}

expect_accept() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS: accepted $description"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: rejected $description" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

expect_reject_with() {
  local description="$1"
  local signature="$2"
  shift 2
  local output
  if output="$("$@" 2>&1)"; then
    echo "FAIL: accepted $description" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  elif grep -Fq "$signature" <<< "$output"; then
    echo "PASS: rejected $description"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: rejected $description without signature '$signature': $output" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

allowed="$TEST_ROOT/allowed"
write_source "$allowed" "cumulus/Assets/CumulusMvp/Runtime/Allowed.cs" \
  'using UnityEngine; public sealed class Allowed : MonoBehaviour { void Inspect(Camera input) { Camera camera = input; } }'
expect_accept "allowed runtime source with meta" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$allowed"

allowed_interactor="$TEST_ROOT/allowed-interactor"
write_source "$allowed_interactor" "cumulus/Assets/CumulusMvp/Runtime/Interaction/CumulusPointerInteractor.cs" \
  'using UnityEngine; public sealed class CumulusPointerInteractor : MonoBehaviour { private Camera interactionCamera; void Inspect(Camera input) { Camera localCamera = input; } }'
expect_accept "intentional interactor camera field plus camera parameter and local" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$allowed_interactor"

forbidden_path="$TEST_ROOT/forbidden-path"
mkdir -p "$forbidden_path/cumulus/Assets/Settings"
printf 'fixture\n' > "$forbidden_path/cumulus/Assets/Settings/Mobile_Renderer.asset"
printf 'fileFormatVersion: 2\n' > "$forbidden_path/cumulus/Assets/Settings/Mobile_Renderer.asset.meta"
expect_reject_with "Mobile renderer mutation" "protected asset a" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$forbidden_path"

allocation="$TEST_ROOT/allocation"
write_source "$allocation" "cumulus/Assets/CumulusMvp/Runtime/BadAllocation.cs" \
  'using UnityEngine; public sealed class BadAllocation { Material Create(Shader shader) { return new Material(shader); } }'
expect_reject_with "runtime Material allocation" "runtime material allocation" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$allocation"

qualified_allocation="$TEST_ROOT/qualified-allocation"
write_source "$qualified_allocation" "cumulus/Assets/CumulusMvp/Runtime/QualifiedAllocation.cs" \
  'public sealed class QualifiedAllocation { object Create(UnityEngine.Shader shader) { return new UnityEngine.Material ( shader ); } }'
expect_reject_with "qualified runtime Material allocation with whitespace" "runtime material allocation" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$qualified_allocation"

per_pane="$TEST_ROOT/per-pane"
write_source "$per_pane" "cumulus/Assets/CumulusMvp/Runtime/BadPane.cs" \
  'using UnityEngine; public sealed class BadPane : MonoBehaviour { [SerializeField] private Camera paneCamera; }'
expect_reject_with "per-pane camera field" "per-pane camera/render-texture field" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$per_pane"

default_private="$TEST_ROOT/default-private"
write_source "$default_private" "cumulus/Assets/CumulusMvp/Runtime/DefaultPrivatePane.cs" \
  'using UnityEngine; public sealed class DefaultPrivatePane : MonoBehaviour { Camera paneCamera; }'
expect_reject_with "default-private per-pane camera field" "per-pane camera/render-texture field" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$default_private"

fully_qualified_collection="$TEST_ROOT/fully-qualified-collection"
write_source "$fully_qualified_collection" "cumulus/Assets/CumulusMvp/Runtime/FullyQualifiedCollection.cs" \
  'public sealed class FullyQualifiedCollection { private System.Collections.Generic.List<UnityEngine.Camera> paneCameras; }'
expect_reject_with "fully qualified generic per-pane camera field" "per-pane camera/render-texture field" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$fully_qualified_collection"

dictionary_field="$TEST_ROOT/dictionary-field"
write_source "$dictionary_field" "cumulus/Assets/CumulusMvp/Runtime/DictionaryField.cs" \
  'using System.Collections.Generic; using UnityEngine; public sealed class DictionaryField { private Dictionary<string, RenderTexture> paneTargets; }'
expect_reject_with "dictionary containing a render-texture field" "per-pane camera/render-texture field" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$dictionary_field"

nested_custom_fields="$TEST_ROOT/nested-custom-fields"
write_source "$nested_custom_fields" "cumulus/Assets/CumulusMvp/Runtime/NestedCustomFields.cs" \
  'using UnityEngine; using UnityEngine.Rendering; public sealed class NestedCustomFields { private PaneCache<Bucket<Camera>> cameras; private PaneCache<Bucket<RTHandle>> handles; }'
expect_reject_with "custom nested generic camera and RTHandle fields" "per-pane camera/render-texture field" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$nested_custom_fields"

comma_fields="$TEST_ROOT/comma-fields"
write_source "$comma_fields" "cumulus/Assets/CumulusMvp/Runtime/CommaFields.cs" \
  'using UnityEngine; public sealed class CommaFields { private Camera primary, secondary; }'
expect_reject_with "comma-separated camera fields" "per-pane camera/render-texture field" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$comma_fields"

generic_comma_fields="$TEST_ROOT/generic-comma-fields"
write_source "$generic_comma_fields" "cumulus/Assets/CumulusMvp/Runtime/GenericCommaFields.cs" \
  'using System.Collections.Generic; using UnityEngine; public sealed class GenericCommaFields { private Dictionary<string, RenderTexture> primary, secondary; }'
expect_reject_with "comma-separated generic render-texture fields" "per-pane camera/render-texture field" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$generic_comma_fields"

collections="$TEST_ROOT/collections"
write_source "$collections" "cumulus/Assets/CumulusMvp/Runtime/BadCollections.cs" \
  'using System.Collections.Generic; using UnityEngine; using UnityEngine.Rendering; public sealed class BadCollections { [SerializeField] Camera?[,] cameras; protected List<RenderTexture?> targets; internal IReadOnlyCollection<RTHandle> handles; }'
expect_reject_with "array and generic camera/render target fields" "per-pane camera/render-texture field" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$collections"

production_root_allocation="$TEST_ROOT/production-root-allocation"
write_source "$production_root_allocation" "cumulus/Assets/CumulusMvp/Bypass.cs" \
  'public sealed class Bypass { object Create(UnityEngine.Shader shader) { return new UnityEngine.Material(shader); } }'
expect_reject_with "production Material allocation outside Runtime directory" "runtime material allocation" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$production_root_allocation"

nonproduction_allocations="$TEST_ROOT/nonproduction-allocations"
write_source "$nonproduction_allocations" "cumulus/Assets/CumulusMvp/Editor/EditorFactory.cs" \
  'public sealed class EditorFactory { object Create(UnityEngine.Shader shader) { return new UnityEngine.Material(shader); } }'
write_source "$nonproduction_allocations" "cumulus/Assets/CumulusMvp/Tests/EditMode/TestFactory.cs" \
  'public sealed class TestFactory { object Create(UnityEngine.Shader shader) { return new UnityEngine.Material(shader); } }'
expect_accept "Editor and test Material allocations" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$nonproduction_allocations"

material_access="$TEST_ROOT/material-access"
write_source "$material_access" "cumulus/Assets/CumulusMvp/Runtime/BadMaterialAccess.cs" \
  'using UnityEngine; public sealed class BadMaterialAccess : MonoBehaviour { void Start() { Material clone = GetComponent<Renderer>().material; } }'
expect_reject_with "production per-instance Renderer.material access" "runtime per-instance material access" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$material_access"

materials_access="$TEST_ROOT/materials-access"
write_source "$materials_access" "cumulus/Assets/CumulusMvp/Runtime/BadMaterialsAccess.cs" \
  'using UnityEngine; public sealed class BadMaterialsAccess : MonoBehaviour { Material[] Read(Renderer renderer) { return renderer.materials; } }'
expect_reject_with "production per-instance Renderer.materials access" "runtime per-instance material access" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$materials_access"

allowed_shared_material="$TEST_ROOT/allowed-shared-material"
write_source "$allowed_shared_material" "cumulus/Assets/CumulusMvp/Runtime/AllowedSharedMaterial.cs" \
  'using UnityEngine; public sealed class AllowedSharedMaterial : MonoBehaviour { Material Read(Renderer renderer) { return renderer.sharedMaterial; } }'
expect_accept "production sharedMaterial access" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$allowed_shared_material"

controller="$TEST_ROOT/controller"
write_source "$controller" "cumulus/Assets/CumulusMvp/Runtime/BadController.cs" \
  'using UnityEngine.InputSystem; public sealed class BadController { bool Read() { return Gamepad.current != null; } }'
expect_reject_with "production controller API" "deferred controller/touch API" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$controller"

touch="$TEST_ROOT/touch"
write_source "$touch" "cumulus/Assets/CumulusMvp/Runtime/BadTouch.cs" \
  'using UnityEngine.InputSystem; public sealed class BadTouch { bool Read() { return Touchscreen.current != null; } }'
expect_reject_with "production touch API" "deferred controller/touch API" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$touch"

enhanced_touch="$TEST_ROOT/enhanced-touch"
write_source "$enhanced_touch" "cumulus/Assets/CumulusMvp/Runtime/BadEnhancedTouch.cs" \
  'using UnityEngine.InputSystem.EnhancedTouch; public sealed class BadEnhancedTouch { int Read() { return Touch.activeTouches.Count; } }'
expect_reject_with "production EnhancedTouch activeTouches API" "deferred controller/touch API" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$enhanced_touch"

legacy_touches="$TEST_ROOT/legacy-touches"
write_source "$legacy_touches" "cumulus/Assets/CumulusMvp/Runtime/BadLegacyTouches.cs" \
  'using UnityEngine; public sealed class BadLegacyTouches { Touch[] Read() { return Input.touches; } }'
expect_reject_with "production legacy Input.touches API" "deferred controller/touch API" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$legacy_touches"

token_generator="$TEST_ROOT/token-generator"
write_source "$token_generator" "cumulus/Assets/CumulusMvp/Runtime/ProductionTokenGenerator.cs" \
  'public sealed class ProductionTokenGenerator { public string Mint() { return "token"; } }'
expect_reject_with "production token generator path" "deferred production token generator" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$token_generator"

token_generator_type="$TEST_ROOT/token-generator-type"
write_source "$token_generator_type" "cumulus/Assets/CumulusMvp/Runtime/Tokens.cs" \
  'public sealed class ProductionTokenGenerator { public string Mint() { return "token"; } }'
expect_reject_with "production token generator type" "deferred production token generator source" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$token_generator_type"

bare_token_generator_type="$TEST_ROOT/bare-token-generator-type"
write_source "$bare_token_generator_type" "cumulus/Assets/CumulusMvp/Runtime/Tokens.cs" \
  'public sealed class TokenGenerator { public string Mint() { return "token"; } }'
expect_reject_with "bare production TokenGenerator type" "deferred production token generator source" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$bare_token_generator_type"

editor_token_generator="$TEST_ROOT/editor-token-generator"
write_source "$editor_token_generator" "cumulus/Assets/CumulusMvp/Editor/TokenGeneratorFixture.cs" \
  'public sealed class TokenGeneratorFixture { public string Mint() { return "fixture"; } }'
expect_accept "Editor token generator fixture" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$editor_token_generator"

refraction="$TEST_ROOT/refraction"
mkdir -p "$refraction/cumulus/Assets/CumulusMvp/Shaders"
printf 'Shader "CumulusMvp/BadRefraction" { SubShader { GrabPass { } } }\n' > "$refraction/cumulus/Assets/CumulusMvp/Shaders/BadRefraction.shader"
printf 'fileFormatVersion: 2\nguid: 22222222222222222222222222222222\n' > "$refraction/cumulus/Assets/CumulusMvp/Shaders/BadRefraction.shader.meta"
expect_reject_with "production refraction shader source" "deferred refraction source" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$refraction"

opaque_refraction="$TEST_ROOT/opaque-refraction"
mkdir -p "$opaque_refraction/cumulus/Assets/CumulusMvp/Shaders"
printf 'Shader "CumulusMvp/BadOpaqueRefraction" { SubShader { HLSLPROGRAM TEXTURE2D_X(_CameraOpaqueTexture); ENDHLSL } }\n' > "$opaque_refraction/cumulus/Assets/CumulusMvp/Shaders/BadOpaqueRefraction.shader"
printf 'fileFormatVersion: 2\nguid: 33333333333333333333333333333333\n' > "$opaque_refraction/cumulus/Assets/CumulusMvp/Shaders/BadOpaqueRefraction.shader.meta"
expect_reject_with "camera-texture refraction shader source" "deferred refraction source" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$opaque_refraction"

named_refraction="$TEST_ROOT/named-refraction"
mkdir -p "$named_refraction/cumulus/Assets/CumulusMvp/Shaders"
printf 'Shader "CumulusMvp/NamedRefraction" { SubShader { HLSLPROGRAM float refractionStrength; float RefractionOffset; ENDHLSL } }\n' > "$named_refraction/cumulus/Assets/CumulusMvp/Shaders/NamedRefraction.shader"
printf 'fileFormatVersion: 2\nguid: 44444444444444444444444444444444\n' > "$named_refraction/cumulus/Assets/CumulusMvp/Shaders/NamedRefraction.shader.meta"
expect_reject_with "refraction-named shader identifiers" "deferred refraction source" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$named_refraction"

ui_import="$TEST_ROOT/ui-import"
write_source "$ui_import" "cumulus/Assets/CumulusMvp/Runtime/BadUi.cs" \
  'using UnityEngine.UIElements; public sealed class BadUi { }'
expect_reject_with "UI Toolkit import" "forbidden UI namespace import" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$ui_import"

for import_case in \
  "ugui|using UnityEngine.UI; public sealed class BadUi { }" \
  "aliased-ugui|using UI = UnityEngine.UI; public sealed class BadAliasedUi { }" \
  "global-elements|using Elements = global::UnityEngine.UIElements; public sealed class BadGlobalElements { }" \
  "aliased-ugui-descendant|using Button = UnityEngine.UI.Button; public sealed class BadAliasedButton { }" \
  "global-elements-descendant|using Visual = global::UnityEngine.UIElements.VisualElement; public sealed class BadAliasedVisual { }"; do
  import_name="${import_case%%|*}"; import_body="${import_case#*|}"; fixture="$TEST_ROOT/$import_name"
  write_source "$fixture" "cumulus/Assets/CumulusMvp/Runtime/Bad${import_name}.cs" "$import_body"
  expect_reject_with "$import_name import" "forbidden UI namespace import" python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$fixture"
done

tmp_import="$TEST_ROOT/tmp-import"
write_source "$tmp_import" "cumulus/Assets/CumulusMvp/Editor/TmpLabelBuilder.cs" \
  'using TMPro; public sealed class TmpLabelBuilder { public TextMeshPro Build() => null; }'
expect_accept "TextMesh Pro import" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$tmp_import"

tmp_resource="$TEST_ROOT/tmp-resource"
mkdir -p "$tmp_resource/cumulus/Assets/TextMesh Pro/Resources"
printf 'fixture\n' > "$tmp_resource/cumulus/Assets/TextMesh Pro/Resources/Font.asset"
printf 'fileFormatVersion: 2\nguid: 1234567890abcdef1234567890abcdef\n' \
  > "$tmp_resource/cumulus/Assets/TextMesh Pro/Resources/Font.asset.meta"
expect_accept "TextMesh Pro resource" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$tmp_resource"

missing_meta="$TEST_ROOT/missing-meta"
mkdir -p "$missing_meta/cumulus/Assets/CumulusMvp"
printf 'fixture\n' > "$missing_meta/cumulus/Assets/CumulusMvp/NoMeta.asset"
expect_reject_with "missing Unity meta partner" "missing Unity meta partner" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$missing_meta"

deletion="$TEST_ROOT/deletion"
mkdir -p "$deletion/cumulus/Assets/Settings"
expect_reject_with "protected Mobile renderer deletion" "protected asset d" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$deletion" --fixture-deleted "cumulus/Assets/Settings/Mobile_Renderer.asset"

meta_delete="$TEST_ROOT/meta-delete"
mkdir -p "$meta_delete/cumulus/Assets/CumulusMvp"
printf 'fixture\n' > "$meta_delete/cumulus/Assets/CumulusMvp/Kept.asset"
expect_reject_with "meta deletion while asset remains" "missing Unity meta partner" \
  python3 "$GUARD" --repo-root "$REPO_ROOT" --fixture-root "$meta_delete" --fixture-deleted "cumulus/Assets/CumulusMvp/Kept.asset.meta"

echo "$PASS_COUNT scope-guard checks passed; $FAIL_COUNT failed"
(( FAIL_COUNT == 0 ))
