using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using CumulusMvp.Geometry;
using CumulusMvp.Interaction;
using CumulusMvp.Materials;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace CumulusMvp.Editor
{
    /// <summary>
    /// Reconciles a camera-local Cumulus shop mockup into the licensed Viking
    /// scene without changing the scene camera's authored pose.
    /// </summary>
    public static class CumulusVikingShopMockupBuilder
    {
        public const string ScenePath =
            "Assets/ThirdParty/Synty/PolygonVikings2/Scenes/Cumulus.unity";

        private const string RootName = "Cumulus Shop Mockup";
        private const string PanelName = "Shop Glass Panel";
        private const string TitleRootName = "Shop Header";
        private const string TitleLabelName = "Shop Title";
        private const string ButtonName = "Reroll Button";
        private const string ButtonVisualName = "Reroll Button Visual";
        private const string ButtonLabelName = "Reroll Button Label";
        private const string DreamsignTravelVisualName = "Dreamsign Travel Visual";
        private const string DreamsignFeedbackVisualName = "Dreamsign Feedback Visual";
        private const string DreamsignArtName = "Dreamsign Art";
        private const string PanelMeshPath =
            "Assets/CumulusMvp/Meshes/CumulusShopGlassPanel.asset";
        private const string ButtonMeshPath =
            "Assets/CumulusMvp/Meshes/CumulusVikingShopRerollButton.asset";
        private const string MaterialLibraryPath =
            "Assets/CumulusMvp/Materials/CumulusMaterialLibrary.asset";
        private const string TmpFontPath =
            "Assets/TextMesh Pro/Resources/Fonts & Materials/LiberationSans SDF.asset";

        private const float LayoutDepth = 0.6f;
        private const float ReferenceAspect = 16f / 9f;
        private const float PanelViewportWidth = 0.36f;
        private const float PanelViewportHeight = 0.74f;
        private const float HorizontalViewportInset = 0.04f;
        private const float TitleViewportY = 0.255f;
        private const float DreamsignViewportY = 0.035f;
        private const float ButtonViewportY = -0.255f;
        private const float DreamsignViewportSize = 0.125f;
        private const float DreamsignViewportGap = 0.022f;
        private const float ButtonViewportWidth = 0.19f;
        private const float ButtonViewportHeight = 0.072f;
        private const float ContentDepth = -0.06f;
        private const float ButtonDepth = -0.08f;
        private const int ButtonCornerSegments = 8;
        private const float ButtonCornerRadiusFraction = 0.36f;
        private const float TitleFontSize = 1.8f * LayoutDepth / 4f;
        private const float ButtonFontSize = 0.12f;

        private static readonly string[] DreamsignIds =
        {
            "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
            "EDE46F71-AA77-4B12-9824-0D3706DA6A22",
            "A98F468B-5E76-4041-83EE-69C0871A6BF0",
        };

        [MenuItem("Cumulus MVP/Rebuild Viking Shop Mockup")]
        public static void Rebuild()
        {
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            Scene scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            Camera camera = scene.GetRootGameObjects()
                .Where(root => root.name == "Main Camera")
                .Select(root => root.GetComponent<Camera>())
                .Single(candidate => candidate != null);

            CumulusMaterialLibrary library =
                RequireAsset<CumulusMaterialLibrary>(MaterialLibraryPath);
            library.Validate();
            Mesh panelMesh = RequireAsset<Mesh>(PanelMeshPath);
            Mesh buttonMesh = ReconcileButtonMesh(camera);
            TMP_FontAsset font = RequireAsset<TMP_FontAsset>(TmpFontPath);

            float viewHeight = ViewHeightAtDepth(camera, LayoutDepth);
            float viewWidth = viewHeight * ReferenceAspect;
            float panelWidth = viewWidth * PanelViewportWidth;
            float panelHeight = viewHeight * PanelViewportHeight;
            float panelCenterX =
                viewWidth * 0.5f -
                viewWidth * HorizontalViewportInset -
                panelWidth * 0.5f;

            ReconcileCameraInteraction(camera);
            GameObject root = EnsureChild(camera.transform, RootName);
            KeepOnlyComponents(root, typeof(Transform));
            SetLocalTransform(
                root.transform,
                new Vector3(panelCenterX, 0f, LayoutDepth),
                Quaternion.identity,
                Vector3.one);

            ReconcilePanel(
                root.transform,
                panelMesh,
                library.Resolve(CumulusMaterialRole.SceneGlass),
                panelWidth,
                panelHeight);
            ReconcileTitle(
                root.transform,
                font,
                panelWidth,
                viewHeight);
            ReconcileDreamsigns(root.transform, camera, viewHeight);
            ReconcileButton(
                root.transform,
                buttonMesh,
                library.Resolve(CumulusMaterialRole.OnGlass),
                font,
                viewHeight);

            var expectedChildren = new HashSet<string>(StringComparer.Ordinal)
            {
                PanelName,
                TitleRootName,
                ButtonName,
            };
            foreach (string id in DreamsignIds)
            {
                expectedChildren.Add(DreamsignName(id));
            }
            RemoveUnexpectedChildren(root.transform, expectedChildren);

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
            {
                throw new InvalidOperationException($"Could not save scene at {ScenePath}.");
            }
            AssetDatabase.SaveAssets();
            NormalizeEmptyTmpNames(ScenePath);
            NormalizeSerializedWhitespace(ButtonMeshPath);
        }

        private static float ViewHeightAtDepth(Camera camera, float depth)
        {
            if (camera.orthographic)
            {
                return camera.orthographicSize * 2f;
            }

            return 2f * depth * Mathf.Tan(camera.fieldOfView * 0.5f * Mathf.Deg2Rad);
        }

        private static Mesh ReconcileButtonMesh(Camera camera)
        {
            float viewHeight = ViewHeightAtDepth(camera, LayoutDepth);
            float width = viewHeight * ButtonViewportWidth;
            float height = viewHeight * ButtonViewportHeight;
            Mesh canonical = CumulusRoundedPanelMesh.Create(
                width,
                height,
                Mathf.Min(0.02f, height * 0.08f),
                height * ButtonCornerRadiusFraction,
                ButtonCornerSegments);
            canonical.name = "CumulusVikingShopRerollButton";

            Mesh mesh = AssetDatabase.LoadAssetAtPath<Mesh>(ButtonMeshPath);
            if (mesh == null)
            {
                AssetDatabase.CreateAsset(canonical, ButtonMeshPath);
                return canonical;
            }

            EditorUtility.CopySerialized(canonical, mesh);
            mesh.name = canonical.name;
            EditorUtility.SetDirty(mesh);
            UnityEngine.Object.DestroyImmediate(canonical);
            return mesh;
        }

        private static void ReconcilePanel(
            Transform parent,
            Mesh mesh,
            Material material,
            float width,
            float height)
        {
            GameObject panel = EnsureChild(parent, PanelName);
            KeepOnlyComponents(panel, typeof(Transform), typeof(MeshFilter), typeof(MeshRenderer));
            RemoveChildren(panel.transform);
            EnsureComponent<MeshFilter>(panel).sharedMesh = mesh;
            MeshRenderer renderer = EnsureComponent<MeshRenderer>(panel);
            renderer.sharedMaterials = Enumerable.Repeat(material, mesh.subMeshCount).ToArray();
            ConfigureRenderer(renderer, ShadowCastingMode.Off, true);
            SetLocalTransform(
                panel.transform,
                Vector3.zero,
                Quaternion.identity,
                new Vector3(width / mesh.bounds.size.x, height / mesh.bounds.size.y, 1f));
        }

        private static void ReconcileCameraInteraction(Camera camera)
        {
            CumulusPointerInteractor interactor =
                EnsureComponent<CumulusPointerInteractor>(camera.gameObject);
            SetObjectReference(interactor, "interactionCamera", camera);
            interactor.enabled = true;
        }

        private static void ReconcileDreamsigns(
            Transform parent,
            Camera camera,
            float viewHeight)
        {
            Mesh quad = null;
            float size = viewHeight * DreamsignViewportSize;
            float gap = viewHeight * DreamsignViewportGap;
            float stride = size + gap;

            for (int index = 0; index < DreamsignIds.Length; index++)
            {
                string id = DreamsignIds[index];
                GameObject dreamsign = EnsureChild(parent, DreamsignName(id));
                KeepOnlyComponents(
                    dreamsign,
                    typeof(Transform),
                    typeof(BoxCollider),
                    typeof(CumulusPressable),
                    typeof(CumulusDreamsignAcquisitionMotion));

                float x = (index - 1) * stride;
                Quaternion rotation = index switch
                {
                    0 => Quaternion.Euler(-2f, -7f, -3f),
                    1 => Quaternion.Euler(2f, 0f, 2f),
                    _ => Quaternion.Euler(-2f, 7f, -2f),
                };
                SetLocalTransform(
                    dreamsign.transform,
                    new Vector3(x, viewHeight * DreamsignViewportY, ContentDepth),
                    rotation,
                    Vector3.one);

                BoxCollider collider = EnsureComponent<BoxCollider>(dreamsign);
                collider.enabled = true;
                collider.center = Vector3.zero;
                collider.size = new Vector3(size, size, 0.12f);
                collider.isTrigger = false;

                GameObject travelVisual = EnsureChild(
                    dreamsign.transform,
                    DreamsignTravelVisualName);
                KeepOnlyComponents(travelVisual, typeof(Transform));
                SetLocalTransform(
                    travelVisual.transform,
                    Vector3.zero,
                    Quaternion.identity,
                    Vector3.one);

                GameObject feedbackVisual = EnsureChild(
                    travelVisual.transform,
                    DreamsignFeedbackVisualName);
                KeepOnlyComponents(feedbackVisual, typeof(Transform));
                SetLocalTransform(
                    feedbackVisual.transform,
                    Vector3.zero,
                    Quaternion.identity,
                    Vector3.one);

                GameObject art = EnsureChild(feedbackVisual.transform, DreamsignArtName);
                KeepOnlyComponents(
                    art,
                    typeof(Transform),
                    typeof(MeshFilter),
                    typeof(MeshRenderer));
                RemoveChildren(art.transform);
                SetLocalTransform(
                    art.transform,
                    Vector3.zero,
                    Quaternion.identity,
                    new Vector3(size, size, 1f));

                MeshFilter filter = EnsureComponent<MeshFilter>(art);
                if (quad == null)
                {
                    quad = ResolveQuadMesh(filter.sharedMesh);
                }
                filter.sharedMesh = quad;

                MeshRenderer renderer = EnsureComponent<MeshRenderer>(art);
                renderer.sharedMaterial = RequireAsset<Material>(
                    $"Assets/CumulusMvp/Materials/Dreamsigns/{id}.mat");
                ConfigureRenderer(renderer, ShadowCastingMode.On, true);
                renderer.motionVectorGenerationMode =
                    MotionVectorGenerationMode.ForceNoMotion;

                RemoveUnexpectedChildren(
                    feedbackVisual.transform,
                    new HashSet<string>(StringComparer.Ordinal) { DreamsignArtName });
                RemoveUnexpectedChildren(
                    travelVisual.transform,
                    new HashSet<string>(StringComparer.Ordinal)
                    {
                        DreamsignFeedbackVisualName,
                    });
                RemoveUnexpectedChildren(
                    dreamsign.transform,
                    new HashSet<string>(StringComparer.Ordinal)
                    {
                        DreamsignTravelVisualName,
                    });

                CumulusPressable pressable = EnsureComponent<CumulusPressable>(dreamsign);
                SetString(pressable, "semanticId", "shop-dreamsign:" + id);
                SetObjectReference(pressable, "hitCollider", collider);
                SetObjectReference(pressable, "visual", feedbackVisual.transform);
                pressable.enabled = true;

                CumulusDreamsignAcquisitionMotion motion =
                    EnsureComponent<CumulusDreamsignAcquisitionMotion>(dreamsign);
                SetString(motion, "dreamsignId", id);
                SetObjectReference(motion, "targetCamera", camera);
                SetObjectReference(motion, "pressable", pressable);
                SetObjectReference(motion, "hitCollider", collider);
                SetObjectReference(motion, "travelVisual", travelVisual.transform);
                SetVector2(motion, "targetViewport", new Vector2(0.94f, 0.1f));
                motion.enabled = true;
            }
        }

        private static void ReconcileTitle(
            Transform parent,
            TMP_FontAsset font,
            float panelWidth,
            float viewHeight)
        {
            GameObject titleRoot = EnsureChild(parent, TitleRootName);
            KeepOnlyComponents(titleRoot, typeof(Transform));
            SetLocalTransform(
                titleRoot.transform,
                new Vector3(0f, viewHeight * TitleViewportY, ContentDepth),
                Quaternion.identity,
                Vector3.one);
            ReconcileLabel(
                titleRoot.transform,
                TitleLabelName,
                "Shop",
                font,
                Vector3.zero,
                new Vector2(panelWidth * 0.78f, viewHeight * 0.12f),
                TitleFontSize);
            RemoveUnexpectedChildren(
                titleRoot.transform,
                new HashSet<string>(StringComparer.Ordinal) { TitleLabelName });
        }

        private static Mesh ResolveQuadMesh(Mesh existing)
        {
            if (existing != null && existing.name == "Quad")
            {
                return existing;
            }

            GameObject primitive = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Mesh quad = primitive.GetComponent<MeshFilter>().sharedMesh;
            UnityEngine.Object.DestroyImmediate(primitive);
            return quad;
        }

        private static void ReconcileButton(
            Transform parent,
            Mesh mesh,
            Material material,
            TMP_FontAsset font,
            float viewHeight)
        {
            GameObject button = EnsureChild(parent, ButtonName);
            KeepOnlyComponents(button, typeof(Transform), typeof(BoxCollider));
            SetLocalTransform(
                button.transform,
                new Vector3(0f, viewHeight * ButtonViewportY, ButtonDepth),
                Quaternion.identity,
                Vector3.one);

            BoxCollider collider = EnsureComponent<BoxCollider>(button);
            collider.enabled = true;
            collider.center = Vector3.zero;
            collider.size = new Vector3(mesh.bounds.size.x, mesh.bounds.size.y, 0.12f);
            collider.isTrigger = false;

            GameObject visual = EnsureChild(button.transform, ButtonVisualName);
            KeepOnlyComponents(visual, typeof(Transform), typeof(MeshFilter), typeof(MeshRenderer));
            EnsureComponent<MeshFilter>(visual).sharedMesh = mesh;
            MeshRenderer renderer = EnsureComponent<MeshRenderer>(visual);
            renderer.sharedMaterials = Enumerable.Repeat(material, mesh.subMeshCount).ToArray();
            ConfigureRenderer(renderer, ShadowCastingMode.Off, true);
            SetLocalTransform(visual.transform, Vector3.zero, Quaternion.identity, Vector3.one);

            ReconcileLabel(
                visual.transform,
                ButtonLabelName,
                "Reroll",
                font,
                new Vector3(0f, 0f, -0.03f),
                new Vector2(mesh.bounds.size.x, mesh.bounds.size.y),
                ButtonFontSize);
            RemoveUnexpectedChildren(
                visual.transform,
                new HashSet<string>(StringComparer.Ordinal) { ButtonLabelName });
            RemoveUnexpectedChildren(
                button.transform,
                new HashSet<string>(StringComparer.Ordinal) { ButtonVisualName });
        }

        private static void ReconcileLabel(
            Transform parent,
            string name,
            string value,
            TMP_FontAsset font,
            Vector3 position,
            Vector2 size,
            float fontSize)
        {
            GameObject label = EnsureChild(parent, name);
            KeepOnlyComponents(
                label,
                typeof(Transform),
                typeof(RectTransform),
                typeof(TextMeshPro),
                typeof(MeshRenderer));
            RemoveChildren(label.transform);
            TextMeshPro textMesh = EnsureComponent<TextMeshPro>(label);
            textMesh.text = value;
            textMesh.alignment = TextAlignmentOptions.Center;
            textMesh.fontSize = fontSize;
            textMesh.fontWeight = FontWeight.Bold;
            textMesh.fontStyle = FontStyles.Bold;
            textMesh.color = new Color32(255, 248, 236, 255);
            textMesh.richText = false;
            textMesh.textWrappingMode = TextWrappingModes.NoWrap;
            textMesh.overflowMode = TextOverflowModes.Overflow;
            textMesh.rectTransform.sizeDelta = size;
            ConfigureRenderer(textMesh.renderer, ShadowCastingMode.Off, false);
            SetLocalTransform(label.transform, position, Quaternion.identity, Vector3.one);

            var serializedText = new SerializedObject(textMesh);
            serializedText.FindProperty("m_fontAsset").objectReferenceValue = font;
            serializedText.FindProperty("m_sharedMaterial").objectReferenceValue = font.material;
            serializedText.ApplyModifiedPropertiesWithoutUndo();
        }

        private static string DreamsignName(string id)
        {
            return "Shop Dreamsign " + id;
        }

        private static T RequireAsset<T>(string path) where T : UnityEngine.Object
        {
            T asset = AssetDatabase.LoadAssetAtPath<T>(path);
            return asset != null
                ? asset
                : throw new InvalidOperationException($"Missing required asset at {path}.");
        }

        private static GameObject EnsureChild(Transform parent, string name)
        {
            GameObject retained = null;
            for (int index = parent.childCount - 1; index >= 0; index--)
            {
                GameObject child = parent.GetChild(index).gameObject;
                if (child.name != name)
                {
                    continue;
                }

                if (retained == null)
                {
                    retained = child;
                }
                else
                {
                    UnityEngine.Object.DestroyImmediate(child);
                }
            }

            if (retained == null)
            {
                retained = new GameObject(name);
                retained.transform.SetParent(parent, false);
            }

            retained.SetActive(true);
            return retained;
        }

        private static T EnsureComponent<T>(GameObject target) where T : Component
        {
            T retained = target.GetComponent<T>();
            return retained != null ? retained : target.AddComponent<T>();
        }

        private static void SetObjectReference(
            UnityEngine.Object target,
            string propertyName,
            UnityEngine.Object value)
        {
            var serialized = new SerializedObject(target);
            serialized.FindProperty(propertyName).objectReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetString(
            UnityEngine.Object target,
            string propertyName,
            string value)
        {
            var serialized = new SerializedObject(target);
            serialized.FindProperty(propertyName).stringValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetVector2(
            UnityEngine.Object target,
            string propertyName,
            Vector2 value)
        {
            var serialized = new SerializedObject(target);
            serialized.FindProperty(propertyName).vector2Value = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void KeepOnlyComponents(GameObject target, params Type[] expectedTypes)
        {
            GameObjectUtility.RemoveMonoBehavioursWithMissingScript(target);
            var expected = new HashSet<Type>(expectedTypes);
            foreach (Component component in target.GetComponents<Component>().Reverse())
            {
                if (component != null && !expected.Contains(component.GetType()))
                {
                    UnityEngine.Object.DestroyImmediate(component);
                }
            }
        }

        private static void RemoveChildren(Transform parent)
        {
            for (int index = parent.childCount - 1; index >= 0; index--)
            {
                UnityEngine.Object.DestroyImmediate(parent.GetChild(index).gameObject);
            }
        }

        private static void RemoveUnexpectedChildren(
            Transform parent,
            HashSet<string> expectedNames)
        {
            for (int index = parent.childCount - 1; index >= 0; index--)
            {
                Transform child = parent.GetChild(index);
                if (!expectedNames.Contains(child.name))
                {
                    UnityEngine.Object.DestroyImmediate(child.gameObject);
                }
            }
        }

        private static void ConfigureRenderer(
            Renderer renderer,
            ShadowCastingMode shadowCastingMode,
            bool receiveShadows)
        {
            renderer.enabled = true;
            renderer.shadowCastingMode = shadowCastingMode;
            renderer.receiveShadows = receiveShadows;
            renderer.lightProbeUsage = LightProbeUsage.Off;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
        }

        private static void SetLocalTransform(
            Transform target,
            Vector3 position,
            Quaternion rotation,
            Vector3 scale)
        {
            target.localPosition = position;
            target.localRotation = rotation;
            target.localScale = scale;
        }

        private static void NormalizeSerializedWhitespace(params string[] assetPaths)
        {
            foreach (string assetPath in assetPaths)
            {
                string source = File.ReadAllText(assetPath);
                string normalized = Regex.Replace(
                    source,
                    @"[ \t]+(?=\r?$)",
                    string.Empty,
                    RegexOptions.Multiline);
                if (source == normalized)
                {
                    continue;
                }

                File.WriteAllText(assetPath, normalized, new UTF8Encoding(false));
                AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceSynchronousImport);
            }
        }

        private static void NormalizeEmptyTmpNames(string scenePath)
        {
            const string serializedTmpName =
                "  m_Name: \n" +
                "  m_EditorClassIdentifier: Unity.TextMeshPro::TMPro.TextMeshPro";
            const string normalizedTmpName =
                "  m_Name:\n" +
                "  m_EditorClassIdentifier: Unity.TextMeshPro::TMPro.TextMeshPro";
            string source = File.ReadAllText(scenePath);
            string normalized = source.Replace(serializedTmpName, normalizedTmpName);
            if (source == normalized)
            {
                return;
            }

            File.WriteAllText(scenePath, normalized, new UTF8Encoding(false));
            AssetDatabase.ImportAsset(scenePath, ImportAssetOptions.ForceSynchronousImport);
        }
    }
}
