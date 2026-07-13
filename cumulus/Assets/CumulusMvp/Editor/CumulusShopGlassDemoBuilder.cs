using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using CumulusMvp.Demo;
using CumulusMvp.Geometry;
using CumulusMvp.Materials;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace CumulusMvp.Editor
{
    /// <summary>
    /// Authors the deliberately minimal Tumbleleaf Village glass study: the
    /// web Card Shop backdrop, one centered square of shared Cumulus glass, and
    /// only the scene camera and lighting needed to judge the material.
    /// </summary>
    public static class CumulusShopGlassDemoBuilder
    {
        public const string ScenePath = "Assets/Scenes/CumulusShopGlassDemo.unity";
        public const string BackdropTexturePath =
            "Assets/CumulusMvp/Demo/Art/tumbleleaf_village.png";
        public const string BackdropMaterialPath =
            "Assets/CumulusMvp/Materials/CumulusShopBackdrop.mat";
        public const string CapturePath =
            "Artifacts/CumulusShopGlassDemo/shop-glass-demo.png";
        public const string ShadowCapturePath =
            "Artifacts/CumulusShopGlassDemo/shop-glass-demo-shadow.png";

        private const string PanelMeshPath =
            "Assets/CumulusMvp/Meshes/CumulusShopGlassPanel.asset";
        private const string MaterialLibraryPath =
            "Assets/CumulusMvp/Materials/CumulusMaterialLibrary.asset";
        private const float CameraHalfHeight = 5f;
        private const float ReferenceAspect = 16f / 9f;
        private const float PanelSide = 4.6f;
        private const float PanelCornerRadiusPixels = 8f;
        private const int DefaultComparisonHeight = 2160;
        private const int PanelCornerSegments = 8;
        private const float BackdropDepth = 4f;

        [MenuItem("Cumulus MVP/Rebuild Shop Glass Demo")]
        public static void Rebuild()
        {
            EnsureCoreAssets();
            ReconcileBackdropTextureImport();

            Texture2D backdropTexture = RequireAsset<Texture2D>(BackdropTexturePath);
            Material backdropMaterial = ReconcileBackdropMaterial(backdropTexture);
            Mesh panelMesh = ReconcilePanelMesh();
            CumulusMaterialLibrary library = RequireAsset<CumulusMaterialLibrary>(MaterialLibraryPath);
            library.Validate();

            Scene scene = AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null
                ? EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single)
                : EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);

            RemoveUnexpectedRoots(
                scene,
                "Main Camera",
                "Directional Light",
                "Tumbleleaf Village Backdrop",
                "Cumulus Glass Panel");
            ReconcileCamera(scene);
            ReconcileDirectionalLight(scene);
            ReconcileBackdrop(scene, backdropTexture, backdropMaterial);
            ReconcileGlassPanel(
                scene,
                panelMesh,
                library.Resolve(CumulusMaterialRole.SceneGlass),
                library.Resolve(CumulusMaterialRole.SolidChrome));
            ConfigureEnvironment();

            EditorSceneManager.SaveScene(scene, ScenePath);
            AssetDatabase.SaveAssets();
            NormalizeSerializedWhitespace(ScenePath, BackdropMaterialPath);
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

        /// <summary>Batch entry point that captures the demo with panel shadow casting enabled.</summary>
        public static void CaptureShadowBatch()
        {
            Rebuild();
            Scene scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            Camera camera = scene.GetRootGameObjects()
                .Single(root => root.name == "Main Camera")
                .GetComponent<Camera>();
            CumulusPanelShadowToggle toggle = scene.GetRootGameObjects()
                .Single(root => root.name == "Cumulus Glass Panel")
                .GetComponent<CumulusPanelShadowToggle>();
            bool originalValue = toggle.CastShadow;
            try
            {
                toggle.CastShadow = true;
                Capture(camera, ShadowCapturePath);
            }
            finally
            {
                toggle.CastShadow = originalValue;
            }
        }

        private static void Capture(Camera camera, string capturePath)
        {
            const int width = 1920;
            const int height = 1080;
            var renderTexture = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32)
            {
                name = "Cumulus Shop Glass Demo Capture",
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
                Debug.Log($"CUMULUS_SHOP_GLASS_CAPTURE:{absolutePath}");
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

        private static void EnsureCoreAssets()
        {
            if (AssetDatabase.LoadAssetAtPath<CumulusMaterialLibrary>(MaterialLibraryPath) != null)
            {
                return;
            }

            CumulusGlassLabBuilder.Rebuild();
        }

        private static Mesh ReconcilePanelMesh()
        {
            int captureHeight = ResolveComparisonHeight();
            float worldUnitsPerPixel = CameraHalfHeight * 2f / captureHeight;
            float cornerRadius = PanelCornerRadiusPixels * worldUnitsPerPixel;
            float depth = Mathf.Min(0.02f, cornerRadius * 0.5f);
            Mesh canonical = CumulusRoundedPanelMesh.Create(
                PanelSide,
                PanelSide,
                depth,
                cornerRadius,
                PanelCornerSegments);
            canonical.name = "CumulusShopGlassPanel";

            Mesh mesh = AssetDatabase.LoadAssetAtPath<Mesh>(PanelMeshPath);
            if (mesh == null)
            {
                AssetDatabase.CreateAsset(canonical, PanelMeshPath);
                return canonical;
            }

            EditorUtility.CopySerialized(canonical, mesh);
            mesh.name = "CumulusShopGlassPanel";
            EditorUtility.SetDirty(mesh);
            UnityEngine.Object.DestroyImmediate(canonical);
            return mesh;
        }

        private static int ResolveComparisonHeight()
        {
            string[] arguments = Environment.GetCommandLineArgs();
            int index = Array.IndexOf(arguments, "-comparisonHeight");
            if (index >= 0 && index + 1 < arguments.Length &&
                int.TryParse(arguments[index + 1], out int height) && height > 0)
            {
                return height;
            }

            return DefaultComparisonHeight;
        }

        private static Material ReconcileBackdropMaterial(Texture2D texture)
        {
            Shader shader = Shader.Find("CumulusMvp/ShopBackdropShadowReceiver");
            if (shader == null)
            {
                throw new InvalidOperationException("Missing shop backdrop shadow receiver shader.");
            }

            Material material = AssetDatabase.LoadAssetAtPath<Material>(BackdropMaterialPath);
            if (material == null)
            {
                material = new Material(shader) { name = "CumulusShopBackdrop" };
                AssetDatabase.CreateAsset(material, BackdropMaterialPath);
            }
            else
            {
                material.shader = shader;
            }

            float sourceAspect = (float)texture.width / texture.height;
            float visibleVerticalFraction = sourceAspect / ReferenceAspect;
            material.SetTexture("_BaseMap", texture);
            material.SetTextureScale("_BaseMap", new Vector2(1f, visibleVerticalFraction));
            material.SetTextureOffset(
                "_BaseMap",
                new Vector2(0f, (1f - visibleVerticalFraction) * 0.5f));
            material.SetColor("_BaseColor", Color.white);
            material.SetFloat("_Surface", 0f);
            material.SetFloat("_Cull", (float)CullMode.Back);
            material.SetFloat("_ZWrite", 1f);
            material.SetOverrideTag("RenderType", "Opaque");
            material.renderQueue = (int)RenderQueue.Geometry;
            EditorUtility.SetDirty(material);
            return material;
        }

        private static void ReconcileBackdropTextureImport()
        {
            TextureImporter importer = AssetImporter.GetAtPath(BackdropTexturePath) as TextureImporter;
            if (importer == null)
            {
                throw new InvalidOperationException(
                    $"Missing texture importer for {BackdropTexturePath}.");
            }

            bool changed =
                importer.npotScale != TextureImporterNPOTScale.None ||
                importer.maxTextureSize != 4096 ||
                importer.wrapMode != TextureWrapMode.Clamp ||
                importer.mipmapEnabled ||
                importer.textureCompression != TextureImporterCompression.Uncompressed;
            importer.npotScale = TextureImporterNPOTScale.None;
            importer.maxTextureSize = 4096;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.mipmapEnabled = false;
            importer.sRGBTexture = true;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            if (changed)
            {
                importer.SaveAndReimport();
            }
        }

        private static void ReconcileCamera(Scene scene)
        {
            GameObject root = EnsureRoot(scene, "Main Camera");
            KeepOnlyComponents(root, typeof(Transform), typeof(Camera), typeof(UniversalAdditionalCameraData));
            RemoveChildren(root.transform);
            root.tag = "MainCamera";
            SetTransform(root.transform, new Vector3(0f, 0f, -10f), Quaternion.identity, Vector3.one);

            Camera camera = EnsureComponent<Camera>(root);
            camera.orthographic = true;
            camera.orthographicSize = CameraHalfHeight;
            camera.aspect = ReferenceAspect;
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 50f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.045f, 0.025f, 0.07f, 1f);
            camera.allowHDR = true;
            camera.allowMSAA = false;
            EnsureComponent<UniversalAdditionalCameraData>(root).renderPostProcessing = false;
        }

        private static void ReconcileDirectionalLight(Scene scene)
        {
            GameObject root = EnsureRoot(scene, "Directional Light");
            KeepOnlyComponents(root, typeof(Transform), typeof(Light));
            RemoveChildren(root.transform);
            SetTransform(
                root.transform,
                Vector3.zero,
                Quaternion.Euler(25f, -20f, -14f),
                Vector3.one);

            Light light = EnsureComponent<Light>(root);
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.86f, 0.7f, 1f);
            light.intensity = 1.8f;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.72f;
        }

        private static void ReconcileBackdrop(
            Scene scene,
            Texture2D texture,
            Material material)
        {
            GameObject root = EnsureRoot(scene, "Tumbleleaf Village Backdrop");
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
            ConfigureRenderer(renderer, ShadowCastingMode.Off, true);
            SetTransform(
                root.transform,
                new Vector3(0f, 0f, BackdropDepth),
                Quaternion.identity,
                new Vector3(CameraHalfHeight * 2f * ReferenceAspect, CameraHalfHeight * 2f, 1f));

            // The material performs the same centered cover crop as the web
            // shop's object-fit: cover; this assertion guards accidental drift.
            float expectedFraction = ((float)texture.width / texture.height) / ReferenceAspect;
            if (Mathf.Abs(material.GetTextureScale("_BaseMap").y - expectedFraction) > 0.0001f)
            {
                throw new InvalidOperationException("Shop backdrop cover crop is out of sync.");
            }
        }

        private static void ReconcileGlassPanel(
            Scene scene,
            Mesh mesh,
            Material glassMaterial,
            Material casterMaterial)
        {
            GameObject root = EnsureRoot(scene, "Cumulus Glass Panel");
            KeepOnlyComponents(
                root,
                typeof(Transform),
                typeof(MeshFilter),
                typeof(MeshRenderer),
                typeof(CumulusPanelShadowToggle));
            EnsureComponent<MeshFilter>(root).sharedMesh = mesh;
            MeshRenderer renderer = EnsureComponent<MeshRenderer>(root);
            renderer.sharedMaterials = new[] { glassMaterial, glassMaterial, glassMaterial };
            ConfigureRenderer(renderer, ShadowCastingMode.Off, true);

            GameObject caster = EnsureChild(root.transform, "Rounded Shadow Caster");
            RemoveUnexpectedChildren(root.transform, caster.transform);
            KeepOnlyComponents(caster, typeof(Transform), typeof(MeshFilter), typeof(MeshRenderer));
            RemoveChildren(caster.transform);
            caster.transform.localPosition = Vector3.zero;
            caster.transform.localRotation = Quaternion.identity;
            caster.transform.localScale = Vector3.one;
            EnsureComponent<MeshFilter>(caster).sharedMesh = mesh;
            MeshRenderer casterRenderer = EnsureComponent<MeshRenderer>(caster);
            casterRenderer.sharedMaterials = new[] { casterMaterial, casterMaterial, casterMaterial };
            ConfigureRenderer(casterRenderer, ShadowCastingMode.ShadowsOnly, false);

            Vector3 meshSize = mesh.bounds.size;
            SetTransform(
                root.transform,
                Vector3.zero,
                Quaternion.identity,
                new Vector3(PanelSide / meshSize.x, PanelSide / meshSize.y, 1f));

            EnsureComponent<CumulusPanelShadowToggle>(root).Configure(casterRenderer);
        }

        private static void ConfigureEnvironment()
        {
            RenderSettings.skybox = null;
            RenderSettings.fog = false;
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.24f, 0.19f, 0.16f, 1f);
            RenderSettings.reflectionIntensity = 0f;
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

            if (retained != null)
            {
                retained.SetActive(true);
                return retained;
            }

            retained = new GameObject(name);
            SceneManager.MoveGameObjectToScene(retained, scene);
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

        private static void RemoveUnexpectedChildren(Transform parent, Transform retained)
        {
            for (int index = parent.childCount - 1; index >= 0; index--)
            {
                Transform child = parent.GetChild(index);
                if (child != retained)
                {
                    UnityEngine.Object.DestroyImmediate(child.gameObject);
                }
            }
        }

        private static void RemoveUnexpectedRoots(Scene scene, params string[] expectedNames)
        {
            var expected = new HashSet<string>(expectedNames, StringComparer.Ordinal);
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                if (!expected.Contains(root.name))
                {
                    UnityEngine.Object.DestroyImmediate(root);
                }
            }
        }

        private static T EnsureComponent<T>(GameObject target) where T : Component
        {
            T retained = target.GetComponent<T>();
            return retained != null ? retained : target.AddComponent<T>();
        }

        private static void KeepOnlyComponents(GameObject target, params Type[] expectedTypes)
        {
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

        private static void ConfigureRenderer(
            Renderer renderer,
            ShadowCastingMode shadowCasting,
            bool receiveShadows)
        {
            renderer.enabled = true;
            renderer.shadowCastingMode = shadowCasting;
            renderer.receiveShadows = receiveShadows;
            renderer.lightProbeUsage = LightProbeUsage.Off;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
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
    }
}
