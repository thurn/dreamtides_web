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
    /// Authors three UUID-backed quest Dreamsigns as lit world-space meshes
    /// floating immediately above the shared Cumulus shop glass.
    /// </summary>
    public static class CumulusDreamsignGlassDemoBuilder
    {
        public const string ScenePath = "Assets/Scenes/CumulusDreamsignGlassDemo.unity";
        public const string CapturePath =
            "Artifacts/CumulusDreamsignGlassDemo/dreamsign-glass-demo.png";

        private const string ArtFolder = "Assets/CumulusMvp/Demo/Art/Dreamsigns";
        private const string MaterialFolder = "Assets/CumulusMvp/Materials/Dreamsigns";
        private const string ButtonMeshPath =
            "Assets/CumulusMvp/Meshes/CumulusDreamsignGlassButton.asset";
        private const string MaterialLibraryPath =
            "Assets/CumulusMvp/Materials/CumulusMaterialLibrary.asset";
        private const string DefaultTmpFontPath =
            "Assets/TextMesh Pro/Resources/Fonts & Materials/LiberationSans SDF.asset";
        private const string ButtonRootName = "Default Glass Button";
        private const string ButtonLabel = "Sort";
        // Chromium measurement of the production GlassButton demo's default
        // 15 px medium-weight "Sort" state at 1920 x 1080. The scene's camera
        // maps these output pixels into world units without rounding.
        private const float CameraHalfHeight = 5f;
        private const int ReferenceCaptureHeight = 1080;
        private const float WebButtonWidthPixels = 59.921875f;
        private const float WebButtonHeightPixels = 42f;
        private const float WebButtonCornerRadiusPixels = 14f;
        private const float ButtonFontSize = 2f;
        private const float DreamsignDepth = -0.34f;
        private const float DreamsignScale = 1.3f;

        private static readonly DreamsignSpec[] Dreamsigns =
        {
            new DreamsignSpec(
                "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
                new Vector3(-1.48f, 0f, DreamsignDepth),
                Quaternion.Euler(-2f, -8f, -3f)),
            new DreamsignSpec(
                "EDE46F71-AA77-4B12-9824-0D3706DA6A22",
                new Vector3(0f, 0.04f, DreamsignDepth - 0.04f),
                Quaternion.Euler(3f, 0f, 2f)),
            new DreamsignSpec(
                "A98F468B-5E76-4041-83EE-69C0871A6BF0",
                new Vector3(1.48f, 0f, DreamsignDepth),
                Quaternion.Euler(-2f, 8f, -2f)),
        };

        [MenuItem("Cumulus MVP/Rebuild Dreamsign Glass Demo")]
        public static void Rebuild()
        {
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            EnsureAssetFolder(MaterialFolder);
            CumulusShopGlassDemoBuilder.Rebuild();
            Mesh buttonMesh = ReconcileButtonMesh();
            CumulusMaterialLibrary materialLibrary =
                RequireAsset<CumulusMaterialLibrary>(MaterialLibraryPath);
            materialLibrary.Validate();
            TMP_FontAsset textFont = RequireAsset<TMP_FontAsset>(DefaultTmpFontPath);

            Scene scene;
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null)
            {
                Scene shopScene = EditorSceneManager.OpenScene(
                    CumulusShopGlassDemoBuilder.ScenePath,
                    OpenSceneMode.Single);
                if (!EditorSceneManager.SaveScene(shopScene, ScenePath, true))
                {
                    throw new InvalidOperationException($"Could not create scene at {ScenePath}.");
                }

                scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            }
            else
            {
                scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            }

            ReconcileDirectionalLight(scene);
            ReconcilePointLight(
                scene,
                "Dreamsign Violet Point Light",
                new Vector3(-2.1f, 1.5f, -2.5f),
                new Color(0.92f, 0.22f, 1f, 1f),
                11f,
                7f);
            ReconcilePointLight(
                scene,
                "Dreamsign Cyan Point Light",
                new Vector3(2.2f, -1.3f, -2.2f),
                new Color(0.18f, 0.84f, 1f, 1f),
                8f,
                6.5f);
            ReconcileCameraInteraction(scene);
            ReconcileDefaultGlassButton(
                scene,
                buttonMesh,
                materialLibrary.Resolve(CumulusMaterialRole.SceneGlass),
                textFont);

            var retainedRoots = new HashSet<string>(StringComparer.Ordinal)
            {
                "Main Camera",
                "Directional Light",
                "Tumbleleaf Village Backdrop",
                "Cumulus Glass Panel",
                "Dreamsign Violet Point Light",
                "Dreamsign Cyan Point Light",
                ButtonRootName,
            };

            foreach (DreamsignSpec spec in Dreamsigns)
            {
                retainedRoots.Add(spec.RootName);
                Texture2D texture = ReconcileTextureImport(spec.TexturePath);
                Material material = ReconcileMaterial(spec.MaterialPath, texture);
                ReconcileDreamsign(scene, spec, material);
            }

            RemoveUnexpectedRoots(scene, retainedRoots);
            EditorSceneManager.SaveScene(scene, ScenePath);
            AssetDatabase.SaveAssets();
            NormalizeSerializedWhitespace(
                new[] { ScenePath, ButtonMeshPath }
                    .Concat(Dreamsigns.Select(spec => spec.MaterialPath))
                    .ToArray());
        }

        /// <summary>Batch entry point that authors and captures the demo at 1920 x 1080.</summary>
        public static void CaptureBatch()
        {
            Rebuild();
            Scene scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            Camera camera = scene.GetRootGameObjects()
                .Single(root => root.name == "Main Camera")
                .GetComponent<Camera>();
            Capture(camera, CapturePath);
        }

        private static void ReconcileDirectionalLight(Scene scene)
        {
            GameObject root = EnsureRoot(scene, "Directional Light");
            KeepOnlyComponents(root, typeof(Transform), typeof(Light));
            RemoveChildren(root.transform);
            SetTransform(
                root.transform,
                Vector3.zero,
                Quaternion.Euler(24f, -25f, -12f),
                Vector3.one);

            Light light = EnsureComponent<Light>(root);
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.81f, 0.68f, 1f);
            light.intensity = 1.25f;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.78f;
        }

        private static void ReconcilePointLight(
            Scene scene,
            string name,
            Vector3 position,
            Color color,
            float intensity,
            float range)
        {
            GameObject root = EnsureRoot(scene, name);
            KeepOnlyComponents(root, typeof(Transform), typeof(Light));
            RemoveChildren(root.transform);
            SetTransform(root.transform, position, Quaternion.identity, Vector3.one);

            Light light = EnsureComponent<Light>(root);
            light.type = LightType.Point;
            light.color = color;
            light.intensity = intensity;
            light.range = range;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.65f;
        }

        private static void ReconcileDreamsign(
            Scene scene,
            DreamsignSpec spec,
            Material material)
        {
            GameObject root = EnsureRoot(scene, spec.RootName);
            KeepOnlyComponents(root, typeof(Transform), typeof(MeshFilter), typeof(MeshRenderer));
            RemoveChildren(root.transform);

            MeshFilter filter = EnsureComponent<MeshFilter>(root);
            if (filter.sharedMesh == null || filter.sharedMesh.name != "Quad")
            {
                GameObject primitive = GameObject.CreatePrimitive(PrimitiveType.Quad);
                filter.sharedMesh = primitive.GetComponent<MeshFilter>().sharedMesh;
                UnityEngine.Object.DestroyImmediate(primitive);
            }

            MeshRenderer renderer = EnsureComponent<MeshRenderer>(root);
            renderer.sharedMaterial = material;
            renderer.enabled = true;
            renderer.shadowCastingMode = ShadowCastingMode.On;
            renderer.receiveShadows = true;
            renderer.lightProbeUsage = LightProbeUsage.Off;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
            renderer.motionVectorGenerationMode = MotionVectorGenerationMode.ForceNoMotion;
            SetTransform(
                root.transform,
                spec.Position,
                spec.Rotation,
                new Vector3(DreamsignScale, DreamsignScale, 1f));
        }

        private static Mesh ReconcileButtonMesh()
        {
            const float depth = 0.02f;
            const int cornerSegments = 8;
            float worldUnitsPerPixel = CameraHalfHeight * 2f / ReferenceCaptureHeight;
            Mesh canonical = CumulusRoundedPanelMesh.Create(
                WebButtonWidthPixels * worldUnitsPerPixel,
                WebButtonHeightPixels * worldUnitsPerPixel,
                depth,
                WebButtonCornerRadiusPixels * worldUnitsPerPixel,
                cornerSegments);
            canonical.name = "CumulusDreamsignGlassButton";

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

        private static void ReconcileCameraInteraction(Scene scene)
        {
            GameObject cameraRoot = scene.GetRootGameObjects()
                .Single(root => root.name == "Main Camera");
            Camera camera = cameraRoot.GetComponent<Camera>();
            CumulusPointerInteractor interactor = EnsureComponent<CumulusPointerInteractor>(cameraRoot);
            SetObjectReference(interactor, "interactionCamera", camera);
            interactor.enabled = true;
        }

        private static void ReconcileDefaultGlassButton(
            Scene scene,
            Mesh mesh,
            Material material,
            TMP_FontAsset font)
        {
            float worldUnitsPerPixel = CameraHalfHeight * 2f / ReferenceCaptureHeight;
            float width = WebButtonWidthPixels * worldUnitsPerPixel;
            float height = WebButtonHeightPixels * worldUnitsPerPixel;

            GameObject root = EnsureRoot(scene, ButtonRootName);
            KeepOnlyComponents(
                root,
                typeof(Transform),
                typeof(BoxCollider),
                typeof(CumulusPressable));
            RemoveUnexpectedChildren(root.transform, "Default Glass Button Visual");
            SetTransform(
                root.transform,
                new Vector3(0f, -4.1f, DreamsignDepth),
                Quaternion.identity,
                Vector3.one);

            BoxCollider collider = EnsureComponent<BoxCollider>(root);
            collider.enabled = true;
            collider.center = Vector3.zero;
            collider.size = new Vector3(width, height, 0.12f);
            collider.isTrigger = false;

            GameObject visual = EnsureChild(root.transform, "Default Glass Button Visual");
            KeepOnlyComponents(visual, typeof(Transform), typeof(MeshFilter), typeof(MeshRenderer));
            EnsureComponent<MeshFilter>(visual).sharedMesh = mesh;
            MeshRenderer renderer = EnsureComponent<MeshRenderer>(visual);
            renderer.sharedMaterials = Enumerable.Repeat(material, mesh.subMeshCount).ToArray();
            ConfigureRenderer(renderer, ShadowCastingMode.On, true);
            SetLocalTransform(visual.transform, Vector3.zero, Quaternion.identity, Vector3.one);
            RemoveUnexpectedChildren(visual.transform, "Button Label");

            GameObject label = EnsureChild(visual.transform, "Button Label");
            KeepOnlyComponents(
                label,
                typeof(Transform),
                typeof(RectTransform),
                typeof(TextMeshPro),
                typeof(MeshRenderer));
            TextMeshPro textMesh = EnsureComponent<TextMeshPro>(label);
            textMesh.font = font;
            textMesh.fontSharedMaterial = font.material;
            textMesh.text = ButtonLabel;
            textMesh.alignment = TextAlignmentOptions.Center;
            textMesh.fontSize = ButtonFontSize;
            textMesh.fontWeight = FontWeight.Medium;
            textMesh.fontStyle = FontStyles.Normal;
            textMesh.color = new Color32(255, 248, 236, 255);
            textMesh.richText = false;
            textMesh.textWrappingMode = TextWrappingModes.NoWrap;
            textMesh.overflowMode = TextOverflowModes.Overflow;
            textMesh.rectTransform.sizeDelta = new Vector2(width, height);
            ConfigureRenderer(textMesh.renderer, ShadowCastingMode.Off, false);
            SetLocalTransform(
                label.transform,
                new Vector3(0f, 0f, -0.03f),
                Quaternion.identity,
                Vector3.one);

            CumulusPressable pressable = EnsureComponent<CumulusPressable>(root);
            SetObjectReference(pressable, "hitCollider", collider);
            SetObjectReference(pressable, "visual", visual.transform);
            SetString(pressable, "semanticId", "dreamsign-default-glass-button");
            pressable.enabled = true;
        }

        private static Texture2D ReconcileTextureImport(string path)
        {
            TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null)
            {
                throw new InvalidOperationException($"Missing quest Dreamsign texture at {path}.");
            }

            bool changed =
                importer.textureType != TextureImporterType.Default ||
                importer.alphaSource != TextureImporterAlphaSource.FromInput ||
                !importer.alphaIsTransparency ||
                importer.npotScale != TextureImporterNPOTScale.None ||
                importer.maxTextureSize != 256 ||
                importer.wrapMode != TextureWrapMode.Clamp ||
                importer.mipmapEnabled ||
                !importer.sRGBTexture ||
                importer.textureCompression != TextureImporterCompression.Uncompressed;

            importer.textureType = TextureImporterType.Default;
            importer.alphaSource = TextureImporterAlphaSource.FromInput;
            importer.alphaIsTransparency = true;
            importer.npotScale = TextureImporterNPOTScale.None;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.mipmapEnabled = false;
            importer.sRGBTexture = true;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.maxTextureSize = 256;
            if (changed)
            {
                importer.SaveAndReimport();
            }

            return RequireAsset<Texture2D>(path);
        }

        private static Material ReconcileMaterial(string path, Texture2D texture)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
            {
                throw new InvalidOperationException("Missing URP Lit shader for physical Dreamsigns.");
            }

            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(shader)
                {
                    name = Path.GetFileNameWithoutExtension(path),
                };
                AssetDatabase.CreateAsset(material, path);
            }
            else
            {
                material.shader = shader;
            }

            material.SetTexture("_BaseMap", texture);
            material.SetColor("_BaseColor", Color.white);
            material.SetFloat("_Surface", 0f);
            material.SetFloat("_AlphaClip", 1f);
            material.SetFloat("_Cutoff", 0.08f);
            material.SetFloat("_Metallic", 0f);
            material.SetFloat("_Smoothness", 0.48f);
            material.SetFloat("_Cull", (float)CullMode.Off);
            material.SetFloat("_ZWrite", 1f);
            material.SetOverrideTag("RenderType", "TransparentCutout");
            material.EnableKeyword("_ALPHATEST_ON");
            material.DisableKeyword("_RECEIVE_SHADOWS_OFF");
            material.DisableKeyword("_SURFACE_TYPE_TRANSPARENT");
            material.renderQueue = (int)RenderQueue.AlphaTest;
            EditorUtility.SetDirty(material);
            return material;
        }

        private static void Capture(Camera camera, string capturePath)
        {
            const int width = 1920;
            const int height = 1080;
            var renderTexture = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32)
            {
                name = "Cumulus Dreamsign Glass Demo Capture",
                antiAliasing = 1,
            };
            var output = new Texture2D(width, height, TextureFormat.RGBA32, false);
            RenderTexture previousActive = RenderTexture.active;
            RenderTexture previousTarget = camera.targetTexture;
            try
            {
                renderTexture.Create();
                camera.targetTexture = renderTexture;
                camera.Render();
                RenderTexture.active = renderTexture;
                output.ReadPixels(new Rect(0f, 0f, width, height), 0, 0);
                output.Apply(false, false);

                string projectRoot = Path.GetDirectoryName(Application.dataPath);
                string absolutePath = Path.Combine(projectRoot, capturePath);
                Directory.CreateDirectory(Path.GetDirectoryName(absolutePath));
                File.WriteAllBytes(absolutePath, output.EncodeToPNG());
                Debug.Log($"CUMULUS_DREAMSIGN_GLASS_CAPTURE:{absolutePath}");
            }
            finally
            {
                camera.targetTexture = previousTarget;
                RenderTexture.active = previousActive;
                UnityEngine.Object.DestroyImmediate(output);
                renderTexture.Release();
                UnityEngine.Object.DestroyImmediate(renderTexture);
            }
        }

        private static void EnsureAssetFolder(string path)
        {
            string current = "Assets";
            foreach (string segment in path.Split('/').Skip(1))
            {
                string next = current + "/" + segment;
                if (!AssetDatabase.IsValidFolder(next))
                {
                    AssetDatabase.CreateFolder(current, segment);
                }

                current = next;
            }
        }

        private static T RequireAsset<T>(string path) where T : UnityEngine.Object
        {
            T asset = AssetDatabase.LoadAssetAtPath<T>(path);
            return asset != null
                ? asset
                : throw new InvalidOperationException($"Missing required asset at {path}.");
        }

        private static GameObject EnsureRoot(Scene scene, string name)
        {
            GameObject retained = null;
            foreach (GameObject root in scene.GetRootGameObjects().Where(root => root.name == name).ToArray())
            {
                if (retained == null)
                {
                    retained = root;
                }
                else
                {
                    UnityEngine.Object.DestroyImmediate(root);
                }
            }

            if (retained == null)
            {
                retained = new GameObject(name);
                SceneManager.MoveGameObjectToScene(retained, scene);
            }

            retained.SetActive(true);
            return retained;
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
            params string[] expectedNames)
        {
            var expected = new HashSet<string>(expectedNames, StringComparer.Ordinal);
            for (int index = parent.childCount - 1; index >= 0; index--)
            {
                Transform child = parent.GetChild(index);
                if (!expected.Contains(child.name))
                {
                    UnityEngine.Object.DestroyImmediate(child.gameObject);
                }
            }
        }

        private static void RemoveUnexpectedRoots(Scene scene, HashSet<string> retainedNames)
        {
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                if (!retainedNames.Contains(root.name))
                {
                    UnityEngine.Object.DestroyImmediate(root);
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

        private static void SetObjectReference(
            UnityEngine.Object owner,
            string propertyName,
            UnityEngine.Object value)
        {
            var serialized = new SerializedObject(owner);
            SerializedProperty property = serialized.FindProperty(propertyName);
            if (property == null)
            {
                throw new InvalidOperationException(
                    $"Missing serialized property {propertyName} on {owner.GetType().Name}.");
            }

            property.objectReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetString(
            UnityEngine.Object owner,
            string propertyName,
            string value)
        {
            var serialized = new SerializedObject(owner);
            SerializedProperty property = serialized.FindProperty(propertyName);
            if (property == null)
            {
                throw new InvalidOperationException(
                    $"Missing serialized property {propertyName} on {owner.GetType().Name}.");
            }

            property.stringValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetTransform(
            Transform target,
            Vector3 position,
            Quaternion rotation,
            Vector3 scale)
        {
            target.SetPositionAndRotation(position, rotation);
            target.localScale = scale;
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

        private readonly struct DreamsignSpec
        {
            public DreamsignSpec(string id, Vector3 position, Quaternion rotation)
            {
                Id = id;
                Position = position;
                Rotation = rotation;
            }

            public string Id { get; }
            public Vector3 Position { get; }
            public Quaternion Rotation { get; }
            public string RootName => "Dreamsign " + Id;
            public string TexturePath => ArtFolder + "/" + Id + ".png";
            public string MaterialPath => MaterialFolder + "/" + Id + ".mat";
        }
    }
}
