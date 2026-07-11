using System;
using System.Collections.Generic;
using System.Linq;
using TangoMvp.Demo;
using TangoMvp.Geometry;
using TangoMvp.Interaction;
using TangoMvp.Materials;
using TangoMvp.Motion;
using TangoMvp.Rendering;
using UnityEditor;
using UnityEditor.Events;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace TangoMvp.Editor
{
    public static class TangoGlassLabBuilder
    {
        private const string MaterialsFolder = "Assets/TangoMvp/Materials";
        private const string SceneGlassPath = MaterialsFolder + "/TangoSceneGlass.mat";
        private const string OnGlassPath = MaterialsFolder + "/TangoOnGlass.mat";
        private const string SolidChromePath = MaterialsFolder + "/TangoSolidChrome.mat";
        private const string BlurPath = MaterialsFolder + "/TangoBlur.mat";
        private const string LibraryPath = MaterialsFolder + "/TangoMaterialLibrary.asset";
        private const string MeshesFolder = "Assets/TangoMvp/Meshes";
        private const string MeshPath = MeshesFolder + "/TangoPanel.asset";
        private const string PrefabsFolder = "Assets/TangoMvp/Prefabs";
        private const string PrefabPath = PrefabsFolder + "/TangoGlassPanel.prefab";
        private const string ScenesFolder = "Assets/Scenes";
        private const string ScenePath = ScenesFolder + "/TangoGlassLab.unity";
        private const string RendererPath = "Assets/Settings/PC_Renderer.asset";

        [MenuItem("Tango MVP/Rebuild Glass Lab")]
        public static void Rebuild()
        {
            RebuildMaterials();
            EnsureFolder(MeshesFolder);
            EnsureFolder(PrefabsFolder);
            EnsureFolder(ScenesFolder);

            Mesh panelMesh = GetOrCreatePanelMesh();
            TangoMaterialLibrary library = AssetDatabase.LoadAssetAtPath<TangoMaterialLibrary>(LibraryPath);
            library.Validate();
            GameObject panelPrefab = GetOrCreatePanelPrefab(panelMesh, library);
            GetOrCreateScene(panelMesh, panelPrefab, library);
            InstallRendererFeature();
            InstallBuildSettings();
            AssetDatabase.SaveAssets();
        }

        [MenuItem("Tango MVP/Rebuild Shared Materials")]
        public static void RebuildMaterials()
        {
            EnsureFolder(MaterialsFolder);

            Material sceneGlass = GetOrCreateMaterial(SceneGlassPath, RequireShader("TangoMvp/SceneGlass"));
            ConfigureSceneGlass(sceneGlass);

            Material onGlass = GetOrCreateMaterial(OnGlassPath, RequireShader("TangoMvp/OnGlass"));
            ConfigureOnGlass(onGlass);

            Material solidChrome = GetOrCreateMaterial(
                SolidChromePath,
                RequireShader("Universal Render Pipeline/Lit"));
            ConfigureSolidChrome(solidChrome);

            Material blur = GetOrCreateMaterial(BlurPath, RequireShader("TangoMvp/SeparableBlur"));
            ConfigureBlur(blur);

            TangoMaterialLibrary library = GetOrCreateLibrary();
            var serializedLibrary = new SerializedObject(library);
            serializedLibrary.FindProperty("sceneGlass").objectReferenceValue = sceneGlass;
            serializedLibrary.FindProperty("onGlass").objectReferenceValue = onGlass;
            serializedLibrary.FindProperty("solidChrome").objectReferenceValue = solidChrome;
            serializedLibrary.ApplyModifiedPropertiesWithoutUndo();
            library.Validate();
            EditorUtility.SetDirty(library);

            AssetDatabase.SaveAssets();

            // Let URP's material import validation normalize Lit serialization during this
            // rebuild, then reassert the closed role values before the final save.
            AssetDatabase.ImportAsset(SolidChromePath, ImportAssetOptions.ForceUpdate);
            ConfigureSolidChrome(solidChrome);
            AssetDatabase.SaveAssets();
        }

        private static Mesh GetOrCreatePanelMesh()
        {
            Mesh mesh = AssetDatabase.LoadAssetAtPath<Mesh>(MeshPath);
            if (mesh != null)
            {
                return mesh;
            }

            mesh = TangoRoundedPanelMesh.Create(4f, 2.4f, 0.12f, 0.28f, 6);
            mesh.name = "TangoPanel";
            AssetDatabase.CreateAsset(mesh, MeshPath);
            return mesh;
        }

        private static GameObject GetOrCreatePanelPrefab(
            Mesh panelMesh,
            TangoMaterialLibrary library)
        {
            GameObject existing = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            if (existing != null)
            {
                return existing;
            }

            GameObject root = new GameObject("Tango Glass Panel");
            try
            {
                TangoPanelTravel travel = root.AddComponent<TangoPanelTravel>();

                GameObject glassFace = CreateMeshObject(
                    "Glass Face",
                    root.transform,
                    panelMesh,
                    library.Resolve(TangoMaterialRole.SceneGlass));
                glassFace.transform.localPosition = Vector3.zero;
                ConfigureRenderer(glassFace.GetComponent<MeshRenderer>(), ShadowCastingMode.Off, true);

                CreateFrame(root.transform, library.Resolve(TangoMaterialRole.SolidChrome));
                CreateText(
                    "Primary Label",
                    root.transform,
                    "TANGO GLASS",
                    new Vector3(0f, 0.48f, -0.16f),
                    0.032f);

                GameObject buttonRoot = new GameObject("On Glass Button");
                buttonRoot.transform.SetParent(root.transform, false);
                buttonRoot.transform.localPosition = new Vector3(0f, -0.56f, -0.22f);
                var collider = buttonRoot.AddComponent<BoxCollider>();
                collider.size = new Vector3(1.48f, 0.54f, 0.22f);

                GameObject buttonVisual = CreateMeshObject(
                    "On Glass Button Visual",
                    buttonRoot.transform,
                    panelMesh,
                    library.Resolve(TangoMaterialRole.OnGlass));
                buttonVisual.transform.localScale = new Vector3(0.37f, 0.23f, 0.72f);
                ConfigureRenderer(buttonVisual.GetComponent<MeshRenderer>(), ShadowCastingMode.Off, true);
                CreateText(
                    "Button Label",
                    buttonVisual.transform,
                    "TRAVEL",
                    new Vector3(0f, 0f, -0.12f),
                    0.025f);

                TangoPressable pressable = buttonRoot.AddComponent<TangoPressable>();
                SetObjectReference(pressable, "hitCollider", collider);
                SetObjectReference(pressable, "visual", buttonVisual.transform);
                SetString(pressable, "semanticId", "glass-panel-travel");
                UnityEventTools.AddPersistentListener(pressable.Activated, travel.ToggleDestination);
                pressable.Activated.SetPersistentListenerState(
                    0,
                    UnityEngine.Events.UnityEventCallState.RuntimeOnly);

                PrefabUtility.SaveAsPrefabAsset(root, PrefabPath);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(root);
            }

            return AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
        }

        private static void CreateFrame(Transform parent, Material material)
        {
            CreateCube(
                "Solid Frame",
                parent,
                new Vector3(0f, 1.16f, -0.1f),
                new Vector3(3.66f, 0.12f, 0.16f),
                material);
            CreateCube(
                "Frame Bottom Rail",
                parent,
                new Vector3(0f, -1.16f, -0.1f),
                new Vector3(3.66f, 0.12f, 0.16f),
                material);
            CreateCube(
                "Frame Left Rail",
                parent,
                new Vector3(-1.94f, 0f, -0.1f),
                new Vector3(0.12f, 2.2f, 0.16f),
                material);
            CreateCube(
                "Frame Right Rail",
                parent,
                new Vector3(1.94f, 0f, -0.1f),
                new Vector3(0.12f, 2.2f, 0.16f),
                material);
        }

        private static GameObject CreateCube(
            string name,
            Transform parent,
            Vector3 localPosition,
            Vector3 localScale,
            Material material)
        {
            GameObject cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cube.name = name;
            cube.transform.SetParent(parent, false);
            cube.transform.localPosition = localPosition;
            cube.transform.localScale = localScale;
            UnityEngine.Object.DestroyImmediate(cube.GetComponent<Collider>());
            MeshRenderer renderer = cube.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            ConfigureRenderer(renderer, ShadowCastingMode.On, true);
            return cube;
        }

        private static GameObject CreateMeshObject(
            string name,
            Transform parent,
            Mesh mesh,
            Material material)
        {
            var result = new GameObject(name);
            result.transform.SetParent(parent, false);
            result.AddComponent<MeshFilter>().sharedMesh = mesh;
            result.AddComponent<MeshRenderer>().sharedMaterial = material;
            return result;
        }

        private static TextMesh CreateText(
            string name,
            Transform parent,
            string text,
            Vector3 localPosition,
            float characterSize)
        {
            var textObject = new GameObject(name);
            textObject.transform.SetParent(parent, false);
            textObject.transform.localPosition = localPosition;
            var textMesh = textObject.AddComponent<TextMesh>();
            textMesh.text = text;
            textMesh.anchor = TextAnchor.MiddleCenter;
            textMesh.alignment = TextAlignment.Center;
            textMesh.fontSize = 64;
            textMesh.characterSize = characterSize;
            textMesh.color = new Color(1f, 0.94f, 0.82f, 1f);
            textMesh.richText = false;
            MeshRenderer renderer = textMesh.GetComponent<MeshRenderer>();
            ConfigureRenderer(renderer, ShadowCastingMode.Off, false);
            return textMesh;
        }

        private static void GetOrCreateScene(
            Mesh panelMesh,
            GameObject panelPrefab,
            TangoMaterialLibrary library)
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) != null)
            {
                return;
            }

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            {
                Camera camera = CreateCamera();
                CreateLight();
                CreateBackground(library.Resolve(TangoMaterialRole.SolidChrome));
                CreateCube(
                    "Ground Shadow Receiver",
                    null,
                    new Vector3(0f, -3.65f, 2.8f),
                    new Vector3(16f, 1.5f, 0.2f),
                    library.Resolve(TangoMaterialRole.SolidChrome));

                Transform sourceAnchor = CreateAnchor("Panel Source Anchor", new Vector3(-3f, 1f, 0f));
                Transform destinationAnchor = CreateAnchor("Panel Destination Anchor", new Vector3(-1.4f, 2.7f, 0f));
                GameObject panel = (GameObject)PrefabUtility.InstantiatePrefab(panelPrefab, scene);
                panel.name = "Tango Glass Panel";
                panel.transform.SetPositionAndRotation(sourceAnchor.position, sourceAnchor.rotation);
                TangoPanelTravel travel = panel.GetComponent<TangoPanelTravel>();
                SetObjectReference(travel, "sourceAnchor", sourceAnchor);
                SetObjectReference(travel, "destinationAnchor", destinationAnchor);

                GameObject independentPane = CreateMeshObject(
                    "Independent Glass Pane",
                    null,
                    panelMesh,
                    library.Resolve(TangoMaterialRole.SceneGlass));
                independentPane.transform.position = new Vector3(3.25f, 1.35f, 0.35f);
                independentPane.transform.localScale = new Vector3(0.8f, 0.75f, 1f);
                ConfigureRenderer(independentPane.GetComponent<MeshRenderer>(), ShadowCastingMode.Off, true);

                TangoPointerInteractor interactor = camera.gameObject.AddComponent<TangoPointerInteractor>();
                SetObjectReference(interactor, "interactionCamera", camera);
                CreateVerificationMarkers(camera);

                RenderSettings.skybox = null;
                RenderSettings.fog = false;
                RenderSettings.ambientMode = AmbientMode.Flat;
                RenderSettings.ambientLight = new Color(0.18f, 0.15f, 0.22f, 1f);
                RenderSettings.reflectionIntensity = 0f;

                EditorSceneManager.SaveScene(scene, ScenePath);
            }
        }

        private static Camera CreateCamera()
        {
            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            cameraObject.transform.position = new Vector3(0f, 0f, -10f);
            var camera = cameraObject.AddComponent<Camera>();
            camera.orthographic = true;
            camera.orthographicSize = 5f;
            camera.aspect = 16f / 9f;
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 50f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.045f, 0.025f, 0.07f, 1f);
            camera.allowHDR = true;
            camera.allowMSAA = false;
            cameraObject.AddComponent<UniversalAdditionalCameraData>().renderPostProcessing = false;
            return camera;
        }

        private static void CreateLight()
        {
            var lightObject = new GameObject("Directional Light");
            var light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.82f, 0.6f, 1f);
            light.intensity = 2.2f;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.9f;
            lightObject.AddComponent<TangoLightOrbit>().SetPhase(0f);
        }

        private static void CreateBackground(Material material)
        {
            var root = new GameObject("Moving Striped Object");
            root.transform.position = new Vector3(0f, 0f, 4f);
            TangoSpinner spinner = root.AddComponent<TangoSpinner>();
            var renderers = new List<Renderer>();
            var colors = new List<Color>();
            Color[] palette =
            {
                new Color(0.95f, 0.88f, 0.67f, 1f),
                new Color(0.025f, 0.012f, 0.045f, 1f),
                new Color(0.95f, 0.53f, 0.12f, 1f),
            };
            for (int index = 0; index < 11; index++)
            {
                string name = index == 0
                    ? "Background Bright"
                    : index == 1
                        ? "Background Dark"
                        : index == 2
                            ? "Background Gold"
                            : $"Pattern Stripe {index:00}";
                GameObject stripe = CreateCube(
                    name,
                    root.transform,
                    new Vector3((index - 5) * 1.7f, 0f, 0f),
                    new Vector3(1.72f, 13f, 0.2f),
                    material);
                renderers.Add(stripe.GetComponent<Renderer>());
                colors.Add(palette[index % palette.Length]);
            }

            SetObjectReferenceArray(spinner, "coloredRenderers", renderers.Cast<UnityEngine.Object>().ToArray());
            SetColorArray(spinner, "colors", colors.ToArray());
            spinner.SetPhase(0.04f);
        }

        private static Transform CreateAnchor(string name, Vector3 position)
        {
            var anchor = new GameObject(name);
            anchor.transform.position = position;
            return anchor.transform;
        }

        private static void CreateVerificationMarkers(Camera camera)
        {
            var root = new GameObject("Tango Verification Markers");
            TangoVerificationMarkers markers = root.AddComponent<TangoVerificationMarkers>();
            AddMarker(markers, root.transform, "LiveGlassA", new Vector3(-3.85f, 0.98f, -0.5f), new Vector2(0.5f, 0.42f));
            AddMarker(markers, root.transform, "LiveGlassB", new Vector3(3.25f, 1.35f, -0.5f), new Vector2(0.72f, 0.58f));
            AddMarker(markers, root.transform, "UncoveredPattern", new Vector3(0.35f, -0.55f, 3.5f), new Vector2(0.62f, 0.54f));
            AddMarker(markers, root.transform, "OnGlassButton", new Vector3(-3f, 0.44f, -0.5f), new Vector2(0.86f, 0.3f));
            AddMarker(markers, root.transform, "SolidBevel", new Vector3(-4.93f, 1.72f, -0.5f), new Vector2(0.12f, 0.52f));
            AddMarker(markers, root.transform, "FrameShadowReceiver", new Vector3(-3f, -3.4f, 2.5f), new Vector2(0.7f, 0.42f));
            AddMarker(markers, root.transform, "PrimaryLabel", new Vector3(-3f, 1.48f, -0.5f), new Vector2(1.25f, 0.28f));

            foreach (TangoVerificationRegion region in Enum.GetValues(typeof(TangoVerificationRegion)))
            {
                Rect projected = markers.GetViewportRegion(region, camera);
                if (projected.xMin < 0f || projected.yMin < 0f || projected.xMax > 1f || projected.yMax > 1f)
                {
                    throw new InvalidOperationException($"Verification region {region} lies outside the camera.");
                }
            }
        }

        private static void AddMarker(
            TangoVerificationMarkers markers,
            Transform parent,
            string regionName,
            Vector3 position,
            Vector2 size)
        {
            var marker = new GameObject("Region " + regionName);
            marker.transform.SetParent(parent, false);
            marker.transform.position = position;
            marker.transform.localScale = new Vector3(size.x, size.y, 1f);
            string fieldName = char.ToLowerInvariant(regionName[0]) + regionName.Substring(1);
            SetObjectReference(markers, fieldName, marker.transform);
        }

        private static void InstallRendererFeature()
        {
            UniversalRendererData rendererData = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            if (rendererData == null)
            {
                throw new InvalidOperationException($"Missing renderer data at {RendererPath}.");
            }

            TangoGlassRendererFeature[] glassSubassets = AssetDatabase.LoadAllAssetsAtPath(RendererPath)
                .OfType<TangoGlassRendererFeature>()
                .ToArray();
            TangoGlassRendererFeature feature = glassSubassets.FirstOrDefault();
            if (feature == null)
            {
                feature = ScriptableObject.CreateInstance<TangoGlassRendererFeature>();
                feature.name = "TangoGlassRendererFeature";
                feature.hideFlags = HideFlags.HideInHierarchy;
                AssetDatabase.AddObjectToAsset(feature, rendererData);
                AssetDatabase.SaveAssets();
            }

            foreach (TangoGlassRendererFeature duplicate in glassSubassets.Skip(1))
            {
                rendererData.rendererFeatures.Remove(duplicate);
                UnityEngine.Object.DestroyImmediate(duplicate, true);
            }

            SetObjectReference(feature, "blurMaterial", AssetDatabase.LoadAssetAtPath<Material>(BlurPath));
            feature.SetActive(true);
            EditorUtility.SetDirty(feature);

            List<ScriptableRendererFeature> retained = rendererData.rendererFeatures
                .Where(candidate => candidate != null && !(candidate is TangoGlassRendererFeature))
                .ToList();
            retained.Add(feature);
            var serializedRenderer = new SerializedObject(rendererData);
            SerializedProperty featureList = serializedRenderer.FindProperty("m_RendererFeatures");
            SerializedProperty featureMap = serializedRenderer.FindProperty("m_RendererFeatureMap");
            featureList.arraySize = retained.Count;
            featureMap.arraySize = retained.Count;
            for (int index = 0; index < retained.Count; index++)
            {
                ScriptableRendererFeature retainedFeature = retained[index];
                featureList.GetArrayElementAtIndex(index).objectReferenceValue = retainedFeature;
                if (!AssetDatabase.TryGetGUIDAndLocalFileIdentifier(retainedFeature, out _, out long localId))
                {
                    throw new InvalidOperationException($"Renderer feature {retainedFeature.name} has no local file ID.");
                }

                featureMap.GetArrayElementAtIndex(index).longValue = localId;
            }

            serializedRenderer.ApplyModifiedPropertiesWithoutUndo();
            rendererData.SetDirty();
            EditorUtility.SetDirty(rendererData);
        }

        private static void InstallBuildSettings()
        {
            EditorBuildSettingsScene[] current = EditorBuildSettings.scenes;
            if (current.Length == 1 && current[0].enabled && current[0].path == ScenePath)
            {
                return;
            }

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        private static void ConfigureRenderer(
            Renderer renderer,
            ShadowCastingMode shadowCastingMode,
            bool receiveShadows)
        {
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
                throw new InvalidOperationException($"Missing serialized property {propertyName} on {owner.GetType().Name}.");
            }

            property.objectReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetString(UnityEngine.Object owner, string propertyName, string value)
        {
            var serialized = new SerializedObject(owner);
            serialized.FindProperty(propertyName).stringValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetObjectReferenceArray(
            UnityEngine.Object owner,
            string propertyName,
            UnityEngine.Object[] values)
        {
            var serialized = new SerializedObject(owner);
            SerializedProperty property = serialized.FindProperty(propertyName);
            property.arraySize = values.Length;
            for (int index = 0; index < values.Length; index++)
            {
                property.GetArrayElementAtIndex(index).objectReferenceValue = values[index];
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetColorArray(UnityEngine.Object owner, string propertyName, Color[] values)
        {
            var serialized = new SerializedObject(owner);
            SerializedProperty property = serialized.FindProperty(propertyName);
            property.arraySize = values.Length;
            for (int index = 0; index < values.Length; index++)
            {
                property.GetArrayElementAtIndex(index).colorValue = values[index];
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void ConfigureSceneGlass(Material material)
        {
            material.SetColor("_TangoFillColor", new Color(0.055f, 0.055f, 0.063f, 0.54f));
            material.SetFloat("_TangoSaturation", 1.5f);
            material.SetFloat("_TangoSheenAlpha", 0.07f);
            material.SetFloat("_TangoRimAlpha", 0.14f);
            material.SetFloat("_TangoFallbackAlpha", 0.72f);
            material.SetOverrideTag("RenderType", "Transparent");
            material.renderQueue = (int)RenderQueue.Transparent;
            EditorUtility.SetDirty(material);
        }

        private static void ConfigureOnGlass(Material material)
        {
            material.SetColor("_TangoLensColor", new Color(0.10f, 0.09f, 0.12f, 0.20f));
            material.SetFloat("_TangoRimAlpha", 0.22f);
            material.SetFloat("_TangoHighlightAlpha", 0.28f);
            material.SetOverrideTag("RenderType", "Transparent");
            material.renderQueue = (int)RenderQueue.Transparent + 10;
            EditorUtility.SetDirty(material);
        }

        private static void ConfigureSolidChrome(Material material)
        {
            material.SetColor("_BaseColor", new Color(0.025f, 0.014f, 0.040f, 1f));
            material.SetFloat("_Surface", 0f);
            material.SetFloat("_Blend", 0f);
            material.SetFloat("_AlphaClip", 0f);
            material.SetFloat("_Smoothness", 0.72f);
            material.SetFloat("_Metallic", 0.34f);
            material.SetFloat("_Cull", (float)CullMode.Back);
            material.SetFloat("_ZWrite", 1f);
            material.SetOverrideTag("RenderType", "Opaque");
            material.DisableKeyword("_SURFACE_TYPE_TRANSPARENT");
            material.DisableKeyword("_ALPHATEST_ON");
            material.SetShaderPassEnabled("ShadowCaster", true);
            material.renderQueue = (int)RenderQueue.Geometry;
            EditorUtility.SetDirty(material);
        }

        private static void ConfigureBlur(Material material)
        {
            material.renderQueue = -1;
            EditorUtility.SetDirty(material);
        }

        private static Material GetOrCreateMaterial(string path, Shader shader)
        {
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(shader)
                {
                    name = System.IO.Path.GetFileNameWithoutExtension(path),
                };
                AssetDatabase.CreateAsset(material, path);
            }
            else if (material.shader != shader)
            {
                material.shader = shader;
            }

            return material;
        }

        private static TangoMaterialLibrary GetOrCreateLibrary()
        {
            TangoMaterialLibrary library = AssetDatabase.LoadAssetAtPath<TangoMaterialLibrary>(LibraryPath);
            if (library == null)
            {
                library = ScriptableObject.CreateInstance<TangoMaterialLibrary>();
                library.name = "TangoMaterialLibrary";
                AssetDatabase.CreateAsset(library, LibraryPath);
            }

            return library;
        }

        private static Shader RequireShader(string name)
        {
            Shader shader = Shader.Find(name);
            if (shader == null)
            {
                throw new InvalidOperationException($"Required shader '{name}' was not imported.");
            }

            return shader;
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path))
            {
                return;
            }

            string parent = System.IO.Path.GetDirectoryName(path)?.Replace('\\', '/');
            string name = System.IO.Path.GetFileName(path);
            if (string.IsNullOrEmpty(parent) || string.IsNullOrEmpty(name))
            {
                throw new InvalidOperationException($"Cannot create asset folder '{path}'.");
            }

            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, name);
        }
    }
}
