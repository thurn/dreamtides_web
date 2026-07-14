using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using CumulusMvp.Demo;
using CumulusMvp.Diagnostics;
using CumulusMvp.Geometry;
using CumulusMvp.Interaction;
using CumulusMvp.Materials;
using CumulusMvp.Motion;
using CumulusMvp.Rendering;
using TMPro;
using UnityEditor;
using UnityEditor.Events;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace CumulusMvp.Editor
{
    public static class CumulusGlassLabBuilder
    {
        private const string MaterialsFolder = "Assets/CumulusMvp/Materials";
        private const string SceneGlassPath = MaterialsFolder + "/CumulusSceneGlass.mat";
        private const string OnGlassPath = MaterialsFolder + "/CumulusOnGlass.mat";
        private const string BackdropPath = MaterialsFolder + "/CumulusBackdropUnlit.mat";
        private const string BlurPath = MaterialsFolder + "/CumulusBlur.mat";
        private const string LibraryPath = MaterialsFolder + "/CumulusMaterialLibrary.asset";
        private const string LightingProfilePath = MaterialsFolder + "/CumulusGlassLightingProfile.asset";
        private const string MeshesFolder = "Assets/CumulusMvp/Meshes";
        private const string MeshPath = MeshesFolder + "/CumulusPanel.asset";
        private const string PrefabsFolder = "Assets/CumulusMvp/Prefabs";
        private const string PrefabPath = PrefabsFolder + "/CumulusGlassPanel.prefab";
        private const string ScenesFolder = "Assets/Scenes";
        private const string ScenePath = ScenesFolder + "/CumulusGlassLab.unity";
        private const string RendererPath = "Assets/Settings/PC_Renderer.asset";
        private const string DefaultTmpFontPath =
            "Assets/TextMesh Pro/Resources/Fonts & Materials/LiberationSans SDF.asset";

        [MenuItem("Cumulus MVP/Rebuild Glass Lab")]
        public static void Rebuild()
        {
            RebuildMaterials();
            EnsureFolder(MeshesFolder);
            EnsureFolder(PrefabsFolder);
            EnsureFolder(ScenesFolder);

            Mesh panelMesh = ReconcilePanelMesh();
            CumulusMaterialLibrary library = AssetDatabase.LoadAssetAtPath<CumulusMaterialLibrary>(LibraryPath);
            library.Validate();
            TMP_FontAsset textFont = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(DefaultTmpFontPath);
            if (textFont == null)
            {
                throw new InvalidOperationException($"Missing TextMesh Pro font asset at {DefaultTmpFontPath}.");
            }
            GameObject panelPrefab = ReconcilePanelPrefab(panelMesh, library, textFont);
            ReconcileScene(panelMesh, panelPrefab, library);
            InstallRendererFeature();
            InstallBuildSettings();
            AssetDatabase.SaveAssets();
            NormalizeSerializedWhitespace(MeshPath, PrefabPath, ScenePath);
        }

        [MenuItem("Cumulus MVP/Rebuild Shared Materials")]
        public static void RebuildMaterials()
        {
            EnsureFolder(MaterialsFolder);

            Material sceneGlass = GetOrCreateMaterial(SceneGlassPath, RequireShader("CumulusMvp/SceneGlass"));
            ConfigureSceneGlass(sceneGlass);

            Material onGlass = GetOrCreateMaterial(OnGlassPath, RequireShader("CumulusMvp/OnGlass"));
            ConfigureOnGlass(onGlass);

            Material backdrop = GetOrCreateMaterial(
                BackdropPath,
                RequireShader("Universal Render Pipeline/Unlit"));
            ConfigureBackdrop(backdrop);

            Material blur = GetOrCreateMaterial(BlurPath, RequireShader("Hidden/CumulusMvp/SeparableBlur"));
            ConfigureBlur(blur);

            CumulusMaterialLibrary library = GetOrCreateLibrary();
            CumulusGlassLightingProfile lightingProfile = GetOrCreateLightingProfile();
            ConfigureGlassLighting(sceneGlass, lightingProfile.SceneGlass.Sanitized(), lightingProfile);
            ConfigureGlassLighting(onGlass, lightingProfile.OnGlass.Sanitized(), lightingProfile);
            var serializedLibrary = new SerializedObject(library);
            serializedLibrary.FindProperty("sceneGlass").objectReferenceValue = sceneGlass;
            serializedLibrary.FindProperty("onGlass").objectReferenceValue = onGlass;
            serializedLibrary.FindProperty("lightingProfile").objectReferenceValue = lightingProfile;
            serializedLibrary.ApplyModifiedPropertiesWithoutUndo();
            library.Validate();
            EditorUtility.SetDirty(library);

            AssetDatabase.SaveAssets();
        }

        private static Mesh ReconcilePanelMesh()
        {
            Mesh mesh = AssetDatabase.LoadAssetAtPath<Mesh>(MeshPath);
            Mesh canonical = CumulusRoundedPanelMesh.Create(4f, 2.4f, 0.12f, 0.28f, 6);
            canonical.name = "CumulusPanel";
            if (mesh == null)
            {
                AssetDatabase.CreateAsset(canonical, MeshPath);
                return canonical;
            }

            EditorUtility.CopySerialized(canonical, mesh);
            mesh.name = "CumulusPanel";
            EditorUtility.SetDirty(mesh);
            UnityEngine.Object.DestroyImmediate(canonical);
            return mesh;
        }

        private static GameObject ReconcilePanelPrefab(
            Mesh panelMesh,
            CumulusMaterialLibrary library,
            TMP_FontAsset textFont)
        {
            GameObject existing = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            bool loadedContents = existing != null;
            GameObject root = loadedContents
                ? PrefabUtility.LoadPrefabContents(PrefabPath)
                : new GameObject("Cumulus Glass Panel");
            try
            {
                root.name = "Cumulus Glass Panel";
                root.SetActive(true);
                RemoveUnexpectedComponents(root, typeof(Transform), typeof(CumulusPanelTravel));
                CumulusPanelTravel travel = EnsureComponent<CumulusPanelTravel>(root);
                RemoveUnexpectedChildren(
                    root.transform,
                    "Glass Face",
                    "Primary Label",
                    "On Glass Button");

                GameObject glassFace = EnsureChild(root.transform, "Glass Face");
                ConfigureMeshObject(
                    glassFace,
                    panelMesh,
                    library.Resolve(CumulusMaterialRole.SceneGlass),
                    Vector3.zero,
                    Vector3.one,
                    ShadowCastingMode.Off,
                    true);
                RemoveUnexpectedChildren(glassFace.transform);
                ConfigureWorldSpaceText(
                    EnsureChild(root.transform, "Primary Label"),
                    "CUMULUS GLASS",
                    new Vector3(0f, 0.48f, -0.16f),
                    Vector3.one,
                    new Vector2(4f, 0.8f),
                    3.2f,
                    textFont);

                GameObject buttonRoot = EnsureChild(root.transform, "On Glass Button");
                RemoveUnexpectedComponents(
                    buttonRoot,
                    typeof(Transform),
                    typeof(BoxCollider),
                    typeof(CumulusPressable));
                buttonRoot.SetActive(true);
                RemoveUnexpectedChildren(buttonRoot.transform, "On Glass Button Visual");
                SetLocalTransform(
                    buttonRoot.transform,
                    new Vector3(0f, -0.56f, -0.22f),
                    Quaternion.identity,
                    Vector3.one);
                BoxCollider collider = EnsureComponent<BoxCollider>(buttonRoot);
                collider.enabled = true;
                collider.center = Vector3.zero;
                collider.size = new Vector3(1.48f, 0.54f, 0.22f);
                collider.isTrigger = false;

                GameObject buttonVisual = EnsureChild(buttonRoot.transform, "On Glass Button Visual");
                ConfigureMeshObject(
                    buttonVisual,
                    panelMesh,
                    library.Resolve(CumulusMaterialRole.OnGlass),
                    Vector3.zero,
                    new Vector3(0.37f, 0.23f, 0.72f),
                    ShadowCastingMode.Off,
                    true);
                RemoveUnexpectedChildren(buttonVisual.transform, "Button Label");
                ConfigureWorldSpaceText(
                    EnsureChild(buttonVisual.transform, "Button Label"),
                    "TRAVEL",
                    new Vector3(0f, 0f, -0.12f),
                    Vector3.one,
                    new Vector2(1.48f, 0.54f),
                    5.2f,
                    textFont);

                CumulusPressable pressable = EnsureComponent<CumulusPressable>(buttonRoot);
                SetObjectReference(pressable, "hitCollider", collider);
                SetObjectReference(pressable, "visual", buttonVisual.transform);
                SetString(pressable, "semanticId", "glass-panel-travel");
                while (pressable.Activated.GetPersistentEventCount() > 0)
                {
                    UnityEventTools.RemovePersistentListener(pressable.Activated, 0);
                }

                UnityEventTools.AddPersistentListener(pressable.Activated, travel.ToggleDestination);
                pressable.Activated.SetPersistentListenerState(
                    0,
                    UnityEngine.Events.UnityEventCallState.RuntimeOnly);
                pressable.enabled = true;
                SetObjectReference(travel, "sourceAnchor", null);
                SetObjectReference(travel, "destinationAnchor", null);
                SetLocalTransform(root.transform, Vector3.zero, Quaternion.identity, Vector3.one);

                PrefabUtility.SaveAsPrefabAsset(root, PrefabPath);
            }
            finally
            {
                if (loadedContents)
                {
                    PrefabUtility.UnloadPrefabContents(root);
                }
                else
                {
                    UnityEngine.Object.DestroyImmediate(root);
                }
            }

            return AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
        }

        private static void ConfigureCube(
            GameObject cube,
            Vector3 localPosition,
            Vector3 localScale,
            Material material)
        {
            cube.SetActive(true);
            RemoveUnexpectedComponents(cube, typeof(Transform), typeof(MeshFilter), typeof(MeshRenderer));
            RemoveUnexpectedChildren(cube.transform);
            MeshFilter meshFilter = EnsureComponent<MeshFilter>(cube);
            if (meshFilter.sharedMesh == null || meshFilter.sharedMesh.name != "Cube")
            {
                GameObject primitive = GameObject.CreatePrimitive(PrimitiveType.Cube);
                meshFilter.sharedMesh = primitive.GetComponent<MeshFilter>().sharedMesh;
                UnityEngine.Object.DestroyImmediate(primitive);
            }

            MeshRenderer renderer = EnsureComponent<MeshRenderer>(cube);
            renderer.sharedMaterial = material;
            ConfigureRenderer(renderer, ShadowCastingMode.On, true);
            SetLocalTransform(cube.transform, localPosition, Quaternion.identity, localScale);
        }

        private static void ConfigureMeshObject(
            GameObject target,
            Mesh mesh,
            Material material,
            Vector3 localPosition,
            Vector3 localScale,
            ShadowCastingMode shadowCastingMode,
            bool receiveShadows)
        {
            target.SetActive(true);
            RemoveUnexpectedComponents(target, typeof(Transform), typeof(MeshFilter), typeof(MeshRenderer));
            MeshFilter filter = EnsureComponent<MeshFilter>(target);
            filter.sharedMesh = mesh;
            MeshRenderer renderer = EnsureComponent<MeshRenderer>(target);
            // The authored panel separates its camera-facing back, opposite
            // face, and bevel into submeshes. Bind the closed semantic role to
            // every submesh so the camera-facing face cannot silently render
            // without a material slot.
            renderer.sharedMaterials = Enumerable.Repeat(material, mesh.subMeshCount).ToArray();
            ConfigureRenderer(renderer, shadowCastingMode, receiveShadows);
            SetLocalTransform(target.transform, localPosition, Quaternion.identity, localScale);
        }

        private static void ConfigureWorldSpaceText(
            GameObject target,
            string text,
            Vector3 localPosition,
            Vector3 localScale,
            Vector2 bounds,
            float fontSize,
            TMP_FontAsset font)
        {
            target.SetActive(true);
            RemoveUnexpectedComponents(
                target,
                typeof(Transform),
                typeof(RectTransform),
                typeof(TextMeshPro),
                typeof(MeshRenderer));
            RemoveUnexpectedChildren(target.transform);
            TextMeshPro textMesh = EnsureComponent<TextMeshPro>(target);
            textMesh.font = font;
            textMesh.fontSharedMaterial = font.material;
            textMesh.text = text;
            textMesh.alignment = TextAlignmentOptions.Center;
            textMesh.fontSize = fontSize;
            textMesh.fontStyle = FontStyles.Normal;
            textMesh.color = Color.white;
            textMesh.richText = false;
            textMesh.textWrappingMode = TextWrappingModes.NoWrap;
            textMesh.overflowMode = TextOverflowModes.Overflow;
            textMesh.rectTransform.sizeDelta = bounds;
            ConfigureRenderer(textMesh.renderer, ShadowCastingMode.Off, false);
            SetLocalTransform(target.transform, localPosition, Quaternion.identity, localScale);
        }

        private static void ReconcileScene(
            Mesh panelMesh,
            GameObject panelPrefab,
            CumulusMaterialLibrary library)
        {
            Scene scene = AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null
                ? EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single)
                : EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            {
                RemoveUnexpectedSceneRoots(
                    scene,
                    "Main Camera",
                    "Directional Light",
                    "Point Light",
                    "Moving Striped Object",
                    "Panel Source Anchor",
                    "Panel Destination Anchor",
                    "Cumulus Glass Panel",
                    "Independent Glass Pane",
                    "Cumulus Verification Markers");

                Camera camera = ReconcileCamera(scene, library);
                ReconcileLight(scene);
                ReconcilePointLight(scene);
                ReconcileBackground(scene, AssetDatabase.LoadAssetAtPath<Material>(BackdropPath));

                Transform sourceAnchor = ReconcileAnchor(scene, "Panel Source Anchor", new Vector3(-3f, 1f, 0f));
                Transform destinationAnchor = ReconcileAnchor(scene, "Panel Destination Anchor", new Vector3(-1.4f, 2.7f, 0f));
                GameObject panel = FindUniqueSceneRoot(scene, "Cumulus Glass Panel");
                if (panel == null || PrefabUtility.GetCorrespondingObjectFromSource(panel) != panelPrefab)
                {
                    if (panel != null)
                    {
                        UnityEngine.Object.DestroyImmediate(panel);
                    }

                    panel = (GameObject)PrefabUtility.InstantiatePrefab(panelPrefab, scene);
                }
                else
                {
                    PrefabUtility.RevertPrefabInstance(panel, InteractionMode.AutomatedAction);
                }

                panel.name = "Cumulus Glass Panel";
                panel.SetActive(true);
                panel.transform.SetPositionAndRotation(sourceAnchor.position, sourceAnchor.rotation);
                panel.transform.localScale = Vector3.one;
                CumulusPanelTravel travel = panel.GetComponent<CumulusPanelTravel>();
                SetObjectReference(travel, "sourceAnchor", sourceAnchor);
                SetObjectReference(travel, "destinationAnchor", destinationAnchor);

                GameObject independentPane = EnsureSceneRoot(scene, "Independent Glass Pane");
                ConfigureMeshObject(
                    independentPane,
                    panelMesh,
                    library.Resolve(CumulusMaterialRole.SceneGlass),
                    new Vector3(3.25f, 1.35f, 0.35f),
                    new Vector3(0.8f, 0.75f, 1f),
                    ShadowCastingMode.Off,
                    true);
                RemoveUnexpectedChildren(independentPane.transform);

                ReconcileVerificationMarkers(scene, camera);

                RenderSettings.skybox = null;
                RenderSettings.fog = false;
                RenderSettings.ambientMode = AmbientMode.Flat;
                RenderSettings.ambientLight = new Color(0.18f, 0.15f, 0.22f, 1f);
                RenderSettings.reflectionIntensity = 0f;

                EditorSceneManager.SaveScene(scene, ScenePath);
            }
        }

        private static Camera ReconcileCamera(Scene scene, CumulusMaterialLibrary library)
        {
            GameObject cameraObject = EnsureSceneRoot(scene, "Main Camera");
            RemoveUnexpectedComponents(
                cameraObject,
                typeof(Transform),
                typeof(Camera),
                typeof(UniversalAdditionalCameraData),
                typeof(CumulusPointerInteractor),
                typeof(CumulusGlassLightingReporter));
            RemoveUnexpectedChildren(cameraObject.transform);
            cameraObject.tag = "MainCamera";
            SetWorldTransform(cameraObject.transform, new Vector3(0f, 0f, -10f), Quaternion.identity, Vector3.one);
            Camera camera = EnsureComponent<Camera>(cameraObject);
            camera.orthographic = true;
            camera.orthographicSize = 5f;
            camera.aspect = 16f / 9f;
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 50f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.045f, 0.025f, 0.07f, 1f);
            camera.allowHDR = true;
            camera.allowMSAA = false;
            EnsureComponent<UniversalAdditionalCameraData>(cameraObject).renderPostProcessing = false;
            CumulusPointerInteractor interactor = EnsureComponent<CumulusPointerInteractor>(cameraObject);
            SetObjectReference(interactor, "interactionCamera", camera);
            EnsureComponent<CumulusGlassLightingReporter>(cameraObject).Configure(
                library,
                CumulusGlassQuality.Desktop,
                CumulusGlassRendererMode.ForwardPlus);
            return camera;
        }

        private static void ReconcileLight(Scene scene)
        {
            GameObject lightObject = EnsureSceneRoot(scene, "Directional Light");
            RemoveUnexpectedComponents(lightObject, typeof(Transform), typeof(Light), typeof(CumulusLightOrbit));
            RemoveUnexpectedChildren(lightObject.transform);
            SetWorldTransform(lightObject.transform, Vector3.zero, Quaternion.identity, Vector3.one);
            Light light = EnsureComponent<Light>(lightObject);
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.82f, 0.6f, 1f);
            light.intensity = 2.2f;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.9f;
            EnsureComponent<CumulusLightOrbit>(lightObject).SetPhase(0f);
        }

        private static void ReconcilePointLight(Scene scene)
        {
            GameObject lightObject = EnsureSceneRoot(scene, "Point Light");
            RemoveUnexpectedComponents(lightObject, typeof(Transform), typeof(Light), typeof(CumulusLightOrbit));
            RemoveUnexpectedChildren(lightObject.transform);
            SetWorldTransform(lightObject.transform, Vector3.zero, Quaternion.identity, Vector3.one);
            Light light = EnsureComponent<Light>(lightObject);
            light.type = LightType.Point;
            light.color = new Color(0.28f, 0.72f, 1f, 1f);
            light.intensity = 10f;
            light.range = 9f;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.8f;
            EnsureComponent<CumulusLightOrbit>(lightObject).ConfigurePointOrbit(
                new Vector3(0f, 0.6f, -1.5f),
                4.5f,
                1.2f,
                0f);
        }

        private static void ReconcileBackground(Scene scene, Material material)
        {
            GameObject root = EnsureSceneRoot(scene, "Moving Striped Object");
            RemoveUnexpectedComponents(root, typeof(Transform), typeof(CumulusSpinner));
            SetWorldTransform(root.transform, new Vector3(0f, 0f, 4f), Quaternion.identity, Vector3.one);
            CumulusSpinner spinner = EnsureComponent<CumulusSpinner>(root);
            var renderers = new List<Renderer>();
            var colors = new List<Color>();
            Color[] palette =
            {
                new Color(0.95f, 0.88f, 0.67f, 1f),
                new Color(0.025f, 0.012f, 0.045f, 1f),
                new Color(0.95f, 0.53f, 0.12f, 1f),
            };
            var stripeNames = new string[11];
            for (int index = 0; index < 11; index++)
            {
                string name = index == 0
                    ? "Background Bright"
                    : index == 1
                        ? "Background Dark"
                        : index == 2
                            ? "Background Gold"
                            : $"Pattern Stripe {index:00}";
                stripeNames[index] = name;
                GameObject stripe = EnsureChild(root.transform, name);
                ConfigureCube(
                    stripe,
                    new Vector3((index - 5) * 1.7f, 0f, 0f),
                    new Vector3(1.72f, 13f, 0.2f),
                    material);
                renderers.Add(stripe.GetComponent<Renderer>());
                colors.Add(palette[index % palette.Length]);
            }

            RemoveUnexpectedChildren(root.transform, stripeNames);
            SetObjectReferenceArray(spinner, "coloredRenderers", renderers.Cast<UnityEngine.Object>().ToArray());
            SetColorArray(spinner, "colors", colors.ToArray());
            spinner.SetPhase(0.04f);
        }

        private static Transform ReconcileAnchor(Scene scene, string name, Vector3 position)
        {
            GameObject anchor = EnsureSceneRoot(scene, name);
            RemoveUnexpectedComponents(anchor, typeof(Transform));
            RemoveUnexpectedChildren(anchor.transform);
            SetWorldTransform(anchor.transform, position, Quaternion.identity, Vector3.one);
            return anchor.transform;
        }

        private static void ReconcileVerificationMarkers(Scene scene, Camera camera)
        {
            GameObject root = EnsureSceneRoot(scene, "Cumulus Verification Markers");
            RemoveUnexpectedComponents(root, typeof(Transform), typeof(CumulusVerificationMarkers));
            SetWorldTransform(root.transform, Vector3.zero, Quaternion.identity, Vector3.one);
            CumulusVerificationMarkers markers = EnsureComponent<CumulusVerificationMarkers>(root);
            AddOrReconcileMarker(markers, root.transform, "LiveGlassA", new Vector3(-3.85f, 0.98f, -0.5f), new Vector2(0.5f, 0.42f));
            AddOrReconcileMarker(markers, root.transform, "LiveGlassB", new Vector3(3.25f, 1.35f, -0.5f), new Vector2(0.72f, 0.58f));
            AddOrReconcileMarker(markers, root.transform, "UncoveredPattern", new Vector3(0.35f, -0.55f, 3.5f), new Vector2(0.62f, 0.54f));
            AddOrReconcileMarker(markers, root.transform, "OnGlassButton", new Vector3(-3f, 0.44f, -0.5f), new Vector2(0.86f, 0.3f));
            RemoveUnexpectedChildren(
                root.transform,
                "Region LiveGlassA",
                "Region LiveGlassB",
                "Region UncoveredPattern",
                "Region OnGlassButton");

            foreach (CumulusVerificationRegion region in Enum.GetValues(typeof(CumulusVerificationRegion)))
            {
                Rect projected = markers.GetViewportRegion(region, camera);
                if (projected.xMin < 0f || projected.yMin < 0f || projected.xMax > 1f || projected.yMax > 1f)
                {
                    throw new InvalidOperationException($"Verification region {region} lies outside the camera.");
                }
            }
        }

        private static void AddOrReconcileMarker(
            CumulusVerificationMarkers markers,
            Transform parent,
            string regionName,
            Vector3 position,
            Vector2 size)
        {
            GameObject marker = EnsureChild(parent, "Region " + regionName);
            RemoveUnexpectedComponents(marker, typeof(Transform));
            RemoveUnexpectedChildren(marker.transform);
            SetWorldTransform(marker.transform, position, Quaternion.identity, new Vector3(size.x, size.y, 1f));
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

            CumulusGlassRendererFeature[] glassSubassets = AssetDatabase.LoadAllAssetsAtPath(RendererPath)
                .OfType<CumulusGlassRendererFeature>()
                .ToArray();
            CumulusGlassRendererFeature feature = glassSubassets.FirstOrDefault();
            if (feature == null)
            {
                feature = ScriptableObject.CreateInstance<CumulusGlassRendererFeature>();
                feature.name = "CumulusGlassRendererFeature";
                feature.hideFlags = HideFlags.HideInHierarchy;
                AssetDatabase.AddObjectToAsset(feature, rendererData);
                AssetDatabase.SaveAssets();
            }

            foreach (CumulusGlassRendererFeature duplicate in glassSubassets.Skip(1))
            {
                rendererData.rendererFeatures.Remove(duplicate);
                UnityEngine.Object.DestroyImmediate(duplicate, true);
            }

            SetObjectReference(feature, "blurMaterial", AssetDatabase.LoadAssetAtPath<Material>(BlurPath));
            feature.SetActive(true);
            EditorUtility.SetDirty(feature);

            List<ScriptableRendererFeature> retained = rendererData.rendererFeatures
                .Where(candidate => candidate != null && !(candidate is CumulusGlassRendererFeature))
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

        private static T EnsureComponent<T>(GameObject target)
            where T : Component
        {
            T[] components = target.GetComponents<T>();
            T retained = components.FirstOrDefault();
            if (retained == null)
            {
                retained = target.AddComponent<T>();
            }

            foreach (T duplicate in components.Skip(1))
            {
                UnityEngine.Object.DestroyImmediate(duplicate);
            }

            if (retained is Behaviour behaviour)
            {
                behaviour.enabled = true;
            }

            return retained;
        }

        private static GameObject EnsureChild(Transform parent, string name)
        {
            Transform retained = null;
            for (int index = parent.childCount - 1; index >= 0; index--)
            {
                Transform child = parent.GetChild(index);
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
                    UnityEngine.Object.DestroyImmediate(child.gameObject);
                }
            }

            if (retained != null)
            {
                retained.gameObject.SetActive(true);
                return retained.gameObject;
            }

            var created = new GameObject(name);
            created.transform.SetParent(parent, false);
            return created;
        }

        private static void RemoveUnexpectedChildren(Transform parent, params string[] expectedNames)
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

        private static void RemoveUnexpectedComponents(GameObject target, params Type[] expectedTypes)
        {
            var expected = new HashSet<Type>(expectedTypes);
            Component[] components = target.GetComponents<Component>();
            for (int index = components.Length - 1; index >= 0; index--)
            {
                Component component = components[index];
                if (component != null && !expected.Contains(component.GetType()))
                {
                    UnityEngine.Object.DestroyImmediate(component);
                }
            }
        }

        private static GameObject EnsureSceneRoot(Scene scene, string name)
        {
            GameObject existing = FindUniqueSceneRoot(scene, name);
            if (existing != null)
            {
                existing.SetActive(true);
                return existing;
            }

            var created = new GameObject(name);
            SceneManager.MoveGameObjectToScene(created, scene);
            return created;
        }

        private static GameObject FindUniqueSceneRoot(Scene scene, string name)
        {
            GameObject retained = null;
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                if (root.name != name)
                {
                    continue;
                }

                if (retained == null)
                {
                    retained = root;
                }
                else
                {
                    UnityEngine.Object.DestroyImmediate(root);
                }
            }

            return retained;
        }

        private static void RemoveUnexpectedSceneRoots(Scene scene, params string[] expectedNames)
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

        private static void SetWorldTransform(
            Transform target,
            Vector3 position,
            Quaternion rotation,
            Vector3 scale)
        {
            target.SetPositionAndRotation(position, rotation);
            target.localScale = scale;
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

        private static void NormalizeSerializedWhitespace(params string[] assetPaths)
        {
            foreach (string assetPath in assetPaths)
            {
                string source = File.ReadAllText(assetPath);
                string normalized = Regex.Replace(source, @"[ \t]+(?=\r?$)", string.Empty, RegexOptions.Multiline);
                if (source == normalized)
                {
                    continue;
                }

                File.WriteAllText(assetPath, normalized, new UTF8Encoding(false));
                AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceSynchronousImport);
            }
        }

        private static void ConfigureSceneGlass(Material material)
        {
            // Unity's linear-HDR composition needs this calibrated alpha to
            // match the effective 0.54 CSS fill across the parity backgrounds.
            material.SetColor("_CumulusFillColor", SrgbTokenColor(14, 14, 16, 0.78f));
            material.SetFloat("_CumulusSaturation", 1.5f);
            // CSS alpha compositing calibrates to this linear-HDR intensity.
            material.SetFloat("_CumulusSheenAlpha", 0.015f);
            // CSS composites its 14-percent white rim in the browser's color
            // pipeline. This linear-HDR opacity matches that rendered lift.
            material.SetFloat("_CumulusRimAlpha", 0.06f);
            material.SetFloat("_CumulusFallbackAlpha", 0.72f);
            material.SetOverrideTag("RenderType", "Transparent");
            material.renderQueue = (int)RenderQueue.Transparent;
            EditorUtility.SetDirty(material);
        }

        private static void ConfigureOnGlass(Material material)
        {
            material.SetColor("_CumulusLensColor", SrgbTokenColor(4, 4, 6, 0.13f));
            // Preserve the web role's prominent one-pixel white rim after
            // linear-HDR composition over the live parent glass surface.
            material.SetFloat("_CumulusRimAlpha", 0.32f);
            material.SetFloat("_CumulusHighlightAlpha", 0.10f);
            material.SetOverrideTag("RenderType", "Transparent");
            material.renderQueue = (int)RenderQueue.Transparent + 10;
            EditorUtility.SetDirty(material);
        }

        private static void ConfigureGlassLighting(
            Material material,
            CumulusGlassLightingRoleSettings settings,
            CumulusGlassLightingProfile profile)
        {
            material.SetFloat("_CumulusEdgeStrength", settings.EdgeStrength);
            material.SetFloat("_CumulusEdgeRoughness", settings.EdgeRoughness);
            material.SetFloat("_CumulusInteriorStrength", settings.InteriorStrength);
            material.SetFloat("_CumulusInteriorRoughness", settings.InteriorRoughness);
            material.SetFloat("_CumulusLightColorResponse", settings.LightColorResponse);
            material.SetFloat("_CumulusReflectionCeiling", settings.ReflectionLuminanceCeiling);
            material.SetFloat("_CumulusDesktopAdditionalLightLimit", profile.DesktopAdditionalLightLimit);
            material.SetFloat("_CumulusMobileAdditionalLightLimit", profile.MobileAdditionalLightLimit);
            EditorUtility.SetDirty(material);
        }

        private static Color SrgbTokenColor(byte red, byte green, byte blue, float alpha)
        {
            Color color = ((Color)new Color32(red, green, blue, 255)).linear;
            color.a = alpha;
            return color;
        }

        private static void ConfigureBlur(Material material)
        {
            material.renderQueue = -1;
            EditorUtility.SetDirty(material);
        }

        private static void ConfigureBackdrop(Material material)
        {
            material.SetColor("_BaseColor", Color.white);
            material.SetFloat("_Surface", 0f);
            material.SetFloat("_Blend", 0f);
            material.SetFloat("_AlphaClip", 0f);
            material.SetFloat("_Cull", (float)CullMode.Back);
            material.SetFloat("_ZWrite", 1f);
            material.SetOverrideTag("RenderType", "Opaque");
            material.DisableKeyword("_SURFACE_TYPE_TRANSPARENT");
            material.DisableKeyword("_ALPHATEST_ON");
            material.renderQueue = (int)RenderQueue.Geometry;
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

        private static CumulusMaterialLibrary GetOrCreateLibrary()
        {
            CumulusMaterialLibrary library = AssetDatabase.LoadAssetAtPath<CumulusMaterialLibrary>(LibraryPath);
            if (library == null)
            {
                library = ScriptableObject.CreateInstance<CumulusMaterialLibrary>();
                library.name = "CumulusMaterialLibrary";
                AssetDatabase.CreateAsset(library, LibraryPath);
            }

            return library;
        }

        private static CumulusGlassLightingProfile GetOrCreateLightingProfile()
        {
            CumulusGlassLightingProfile profile =
                AssetDatabase.LoadAssetAtPath<CumulusGlassLightingProfile>(LightingProfilePath);
            if (profile == null)
            {
                profile = ScriptableObject.CreateInstance<CumulusGlassLightingProfile>();
                profile.name = "CumulusGlassLightingProfile";
                AssetDatabase.CreateAsset(profile, LightingProfilePath);
            }

            profile.Validate();
            EditorUtility.SetDirty(profile);
            return profile;
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
