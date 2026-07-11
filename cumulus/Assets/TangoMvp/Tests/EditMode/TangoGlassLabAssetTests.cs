using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using NUnit.Framework;
using TangoMvp.Demo;
using TangoMvp.Interaction;
using TangoMvp.Materials;
using TangoMvp.Motion;
using TangoMvp.Rendering;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace TangoMvp.Tests
{
    public sealed class TangoGlassLabAssetTests
    {
        private const string MeshPath = "Assets/TangoMvp/Meshes/TangoPanel.asset";
        private const string SceneGlassPath = "Assets/TangoMvp/Materials/TangoSceneGlass.mat";
        private const string OnGlassPath = "Assets/TangoMvp/Materials/TangoOnGlass.mat";
        private const string SolidChromePath = "Assets/TangoMvp/Materials/TangoSolidChrome.mat";
        private const string BlurPath = "Assets/TangoMvp/Materials/TangoBlur.mat";
        private const string LibraryPath = "Assets/TangoMvp/Materials/TangoMaterialLibrary.asset";
        private const string PrefabPath = "Assets/TangoMvp/Prefabs/TangoGlassPanel.prefab";
        private const string ScenePath = "Assets/Scenes/TangoGlassLab.unity";
        private const string RendererPath = "Assets/Settings/PC_Renderer.asset";
        private const string MobileRendererPath = "Assets/Settings/Mobile_Renderer.asset";
        private const string BuildSettingsPath = "ProjectSettings/EditorBuildSettings.asset";

        private static readonly string[] StableAssetPaths =
        {
            MeshPath,
            SceneGlassPath,
            OnGlassPath,
            SolidChromePath,
            BlurPath,
            LibraryPath,
            PrefabPath,
            ScenePath,
        };

        [Test]
        public void Rebuild_IsByteStableAndRetainsEveryAuthoredGuid()
        {
            byte[] mobileBefore = File.ReadAllBytes(MobileRendererPath);

            InvokeRebuild();
            Dictionary<string, string> guids = StableAssetPaths.ToDictionary(
                path => path,
                AssetDatabase.AssetPathToGUID);
            Dictionary<string, byte[]> bytes = StableSerializedPaths().ToDictionary(
                path => path,
                File.ReadAllBytes);

            InvokeRebuild();

            foreach (string path in StableAssetPaths)
            {
                Assert.That(AssetDatabase.AssetPathToGUID(path), Is.Not.Empty, path);
                Assert.That(AssetDatabase.AssetPathToGUID(path), Is.EqualTo(guids[path]), path);
            }

            foreach (string path in StableSerializedPaths())
            {
                Assert.That(File.ReadAllBytes(path), Is.EqualTo(bytes[path]), path);
            }

            Assert.That(File.ReadAllBytes(MobileRendererPath), Is.EqualTo(mobileBefore));
        }

        [Test]
        public void Rebuild_RepairsMeshPrefabAndSceneDriftWithoutChangingGuids()
        {
            InvokeRebuild();
            string[] repairedPaths = { MeshPath, PrefabPath, ScenePath };
            Dictionary<string, byte[]> backups = repairedPaths.ToDictionary(path => path, File.ReadAllBytes);
            Dictionary<string, string> guids = repairedPaths.ToDictionary(path => path, AssetDatabase.AssetPathToGUID);

            try
            {
                Mesh mesh = AssetDatabase.LoadAssetAtPath<Mesh>(MeshPath);
                mesh.Clear();
                mesh.name = "Drifted Panel";
                EditorUtility.SetDirty(mesh);
                AssetDatabase.SaveAssets();

                GameObject prefabRoot = PrefabUtility.LoadPrefabContents(PrefabPath);
                try
                {
                    foreach (Behaviour behaviour in prefabRoot.GetComponentsInChildren<Behaviour>(true))
                    {
                        behaviour.enabled = false;
                    }

                    foreach (Renderer renderer in prefabRoot.GetComponentsInChildren<Renderer>(true))
                    {
                        renderer.enabled = false;
                    }

                    Transform primaryLabel = prefabRoot.transform.Find("Primary Label");
                    Assert.That(primaryLabel, Is.Not.Null);
                    UnityEngine.Object.DestroyImmediate(primaryLabel.gameObject);
                    prefabRoot.transform.Find("On Glass Button").GetComponent<BoxCollider>().size = Vector3.one * 9f;
                    new GameObject("Unexpected Builder Drift").transform.SetParent(prefabRoot.transform, false);
                    PrefabUtility.SaveAsPrefabAsset(prefabRoot, PrefabPath);
                }
                finally
                {
                    PrefabUtility.UnloadPrefabContents(prefabRoot);
                }

                Scene driftedScene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
                GameObject[] roots = driftedScene.GetRootGameObjects();
                roots.Single(root => root.name == "Independent Glass Pane").transform.position = Vector3.one * 19f;
                GameObject lightRoot = roots.Single(root => root.name == "Directional Light");
                lightRoot.transform.position = Vector3.one * 7f;
                lightRoot.transform.rotation = Quaternion.Euler(17f, 23f, 31f);
                lightRoot.transform.localScale = Vector3.one * 4f;
                foreach (Behaviour behaviour in SceneObjects(driftedScene)
                    .SelectMany(item => item.GetComponents<Behaviour>()))
                {
                    behaviour.enabled = false;
                }

                foreach (Renderer renderer in SceneObjects(driftedScene)
                    .Select(item => item.GetComponent<Renderer>())
                    .Where(renderer => renderer != null))
                {
                    renderer.enabled = false;
                }

                UnityEngine.Object.DestroyImmediate(roots.Single(root => root.name == "Ground Shadow Receiver"));
                new GameObject("Unexpected Builder Drift");
                EditorSceneManager.SaveScene(driftedScene, ScenePath);

                InvokeRebuild();

                foreach (string path in repairedPaths)
                {
                    Assert.That(AssetDatabase.AssetPathToGUID(path), Is.EqualTo(guids[path]), path);
                }

                Mesh repairedMesh = AssetDatabase.LoadAssetAtPath<Mesh>(MeshPath);
                Assert.That(repairedMesh.name, Is.EqualTo("TangoPanel"));
                Assert.That(repairedMesh.vertexCount, Is.GreaterThan(0));
                Assert.That(repairedMesh.bounds.size.x, Is.EqualTo(4f).Within(0.001f));

                GameObject repairedPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
                Assert.That(repairedPrefab.transform.Find("Primary Label"), Is.Not.Null);
                Assert.That(repairedPrefab.transform.Find("Unexpected Builder Drift"), Is.Null);
                Assert.That(repairedPrefab.transform.Find("On Glass Button").GetComponent<BoxCollider>().size,
                    Is.EqualTo(new Vector3(1.48f, 0.54f, 0.22f)));
                Assert.That(repairedPrefab.GetComponentsInChildren<Behaviour>(true),
                    Has.All.Matches<Behaviour>(behaviour => behaviour.enabled));
                Assert.That(repairedPrefab.GetComponentsInChildren<Renderer>(true),
                    Has.All.Matches<Renderer>(renderer => renderer.enabled));

                Scene repairedScene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
                GameObject[] repairedRoots = repairedScene.GetRootGameObjects();
                Assert.That(repairedRoots.Any(root => root.name == "Ground Shadow Receiver"), Is.True);
                Assert.That(repairedRoots.Any(root => root.name == "Unexpected Builder Drift"), Is.False);
                Assert.That(repairedRoots.Single(root => root.name == "Independent Glass Pane").transform.position,
                    Is.EqualTo(new Vector3(3.25f, 1.35f, 0.35f)));
                GameObject repairedLight = repairedRoots.Single(root => root.name == "Directional Light");
                Assert.That(repairedLight.transform.position, Is.EqualTo(Vector3.zero));
                Assert.That(repairedLight.transform.localScale, Is.EqualTo(Vector3.one));
                Assert.That(Quaternion.Angle(
                    repairedLight.transform.rotation,
                    Quaternion.Euler(52f, 0f, 0f)),
                    Is.LessThan(0.001f));
                Assert.That(repairedLight.GetComponent<Light>().enabled, Is.True);
                Assert.That(repairedLight.GetComponent<TangoLightOrbit>().enabled, Is.True);
                Assert.That(repairedRoots.Single(root => root.name == "Main Camera").GetComponent<Camera>().enabled,
                    Is.True);
                Assert.That(repairedRoots.Single(root => root.name == "Main Camera")
                    .GetComponent<TangoPointerInteractor>().enabled, Is.True);
                Assert.That(repairedRoots.Single(root => root.name == "Moving Striped Object")
                    .GetComponent<TangoSpinner>().enabled, Is.True);
                Assert.That(repairedRoots.Single(root => root.name == "Tango Verification Markers")
                    .GetComponent<TangoVerificationMarkers>().enabled, Is.True);
                Assert.That(SceneObjects(repairedScene),
                    Has.All.Matches<GameObject>(item => item.activeInHierarchy));
                Assert.That(SceneObjects(repairedScene)
                    .SelectMany(item => item.GetComponents<Behaviour>()),
                    Has.All.Matches<Behaviour>(behaviour => behaviour.enabled));
                Assert.That(SceneObjects(repairedScene)
                    .Select(item => item.GetComponent<Renderer>())
                    .Where(renderer => renderer != null),
                    Has.All.Matches<Renderer>(renderer => renderer.enabled));

                Dictionary<string, byte[]> once = repairedPaths.ToDictionary(path => path, File.ReadAllBytes);
                InvokeRebuild();
                foreach (string path in repairedPaths)
                {
                    Assert.That(File.ReadAllBytes(path), Is.EqualTo(once[path]), path);
                }
            }
            finally
            {
                foreach (string path in repairedPaths)
                {
                    File.WriteAllBytes(path, backups[path]);
                    AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
                }
            }
        }

        [Test]
        public void RendererAndBuildSettings_AreInstalledOnceWithoutRemovingSsao()
        {
            InvokeRebuild();

            UniversalRendererData rendererData = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            Assert.That(rendererData, Is.Not.Null);
            TangoGlassRendererFeature[] glassFeatures = rendererData.rendererFeatures
                .OfType<TangoGlassRendererFeature>()
                .ToArray();
            Assert.That(glassFeatures, Has.Length.EqualTo(1));
            Assert.That(glassFeatures[0].isActive, Is.True);
            Assert.That(AssetDatabase.GetAssetPath(glassFeatures[0]), Is.EqualTo(RendererPath));
            Assert.That(rendererData.rendererFeatures.Count(
                feature => feature != null && feature.GetType().Name.Contains("ScreenSpaceAmbientOcclusion")),
                Is.EqualTo(1));

            FieldInfo blurField = typeof(TangoGlassRendererFeature).GetField(
                "blurMaterial",
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(blurField, Is.Not.Null);
            Assert.That(
                AssetDatabase.GetAssetPath((Material)blurField.GetValue(glassFeatures[0])),
                Is.EqualTo(BlurPath));

            UnityEditor.EditorBuildSettingsScene[] enabledScenes = EditorBuildSettings.scenes
                .Where(scene => scene.enabled)
                .ToArray();
            Assert.That(enabledScenes, Has.Length.EqualTo(1));
            Assert.That(enabledScenes[0].path, Is.EqualTo(ScenePath));
        }

        [Test]
        public void Scene_ReopensWithExactProofObjectsAndSharedMaterialRoles()
        {
            InvokeRebuild();
            Scene scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Additive);

            try
            {
                GameObject[] objects = SceneObjects(scene);
                AssertNameCount(objects, "Main Camera", 1);
                AssertNameCount(objects, "Directional Light", 1);
                AssertNameCount(objects, "Moving Striped Object", 1);
                AssertNameCount(objects, "Panel Source Anchor", 1);
                AssertNameCount(objects, "Panel Destination Anchor", 1);
                AssertNameCount(objects, "Tango Glass Panel", 1);
                AssertNameCount(objects, "Independent Glass Pane", 1);
                AssertNameCount(objects, "On Glass Button", 1);
                AssertNameCount(objects, "Tango Verification Markers", 1);

                Camera camera = objects.Single(item => item.name == "Main Camera").GetComponent<Camera>();
                Assert.That(camera, Is.Not.Null);
                TangoPointerInteractor interactor = camera.GetComponent<TangoPointerInteractor>();
                Assert.That(interactor, Is.Not.Null);
                AssertSerializedReference(interactor, "interactionCamera", camera);

                MeshRenderer[] sceneGlassRenderers = objects
                    .Select(item => item.GetComponent<MeshRenderer>())
                    .Where(renderer => renderer != null && renderer.sharedMaterial != null &&
                        renderer.sharedMaterial.shader.name == "TangoMvp/SceneGlass")
                    .ToArray();
                Assert.That(sceneGlassRenderers, Has.Length.EqualTo(2));
                Assert.That(sceneGlassRenderers[0].sharedMaterial, Is.SameAs(sceneGlassRenderers[1].sharedMaterial));
                Assert.That(sceneGlassRenderers[0].sharedMaterial,
                    Is.SameAs(AssetDatabase.LoadAssetAtPath<Material>(SceneGlassPath)));

                MeshRenderer onGlass = objects.Single(item => item.name == "On Glass Button Visual")
                    .GetComponent<MeshRenderer>();
                Assert.That(onGlass.sharedMaterial, Is.SameAs(AssetDatabase.LoadAssetAtPath<Material>(OnGlassPath)));

                MeshRenderer frame = objects.Single(item => item.name == "Solid Frame").GetComponent<MeshRenderer>();
                Assert.That(frame.sharedMaterial, Is.SameAs(AssetDatabase.LoadAssetAtPath<Material>(SolidChromePath)));
                Assert.That(frame.sharedMaterial.renderQueue, Is.LessThan((int)RenderQueue.Transparent));
                Assert.That(frame.shadowCastingMode, Is.EqualTo(ShadowCastingMode.On));

                TextMesh[] labels = objects.Select(item => item.GetComponent<TextMesh>())
                    .Where(label => label != null)
                    .ToArray();
                Assert.That(labels, Has.Length.EqualTo(2));
                Assert.That(labels.Select(label => label.name), Is.EquivalentTo(new[] { "Primary Label", "Button Label" }));
                Assert.That(labels, Has.All.Matches<TextMesh>(label => label.GetComponentInParent<Canvas>() == null));
                Assert.That(labels, Has.All.Matches<TextMesh>(label => label.color.r >= 0.9f && label.color.g >= 0.8f));
                Assert.That(labels, Has.All.Matches<TextMesh>(label =>
                    label.GetComponent<Renderer>().sharedMaterial.shader.name.Contains("Text")));

                TangoPressable[] pressables = objects.Select(item => item.GetComponent<TangoPressable>())
                    .Where(pressable => pressable != null)
                    .ToArray();
                Assert.That(pressables, Has.Length.EqualTo(1));
                foreach (TangoPressable pressable in pressables)
                {
                    Collider[] rootColliders = pressable.GetComponents<Collider>();
                    Assert.That(rootColliders, Has.Length.EqualTo(1));
                    Assert.That(pressable.GetComponentsInChildren<Collider>(true), Has.Length.EqualTo(1));
                    AssertSerializedReference(pressable, "hitCollider", rootColliders[0]);
                    Transform visual = GetSerializedReference<Transform>(pressable, "visual");
                    Assert.That(visual, Is.Not.Null);
                    Assert.That(visual.IsChildOf(pressable.transform), Is.True);
                }

                TangoPanelTravel travel = objects.Single(item => item.name == "Tango Glass Panel")
                    .GetComponent<TangoPanelTravel>();
                Assert.That(travel, Is.Not.Null);
                Assert.That(GetSerializedReference<Transform>(travel, "sourceAnchor").name,
                    Is.EqualTo("Panel Source Anchor"));
                Assert.That(GetSerializedReference<Transform>(travel, "destinationAnchor").name,
                    Is.EqualTo("Panel Destination Anchor"));
                TangoPressable button = pressables.Single();
                Assert.That(button.Activated.GetPersistentEventCount(), Is.EqualTo(1));
                Assert.That(button.Activated.GetPersistentTarget(0), Is.SameAs(travel));
                Assert.That(button.Activated.GetPersistentMethodName(0), Is.EqualTo(nameof(TangoPanelTravel.ToggleDestination)));
                Assert.That(button.Activated.GetPersistentListenerState(0), Is.EqualTo(UnityEventCallState.RuntimeOnly));

                Assert.That(objects.Count(item => item.GetComponent<TangoSpinner>() != null), Is.EqualTo(1));
                Assert.That(objects.Count(item => item.GetComponent<TangoLightOrbit>() != null), Is.EqualTo(1));
            }
            finally
            {
                EditorSceneManager.CloseScene(scene, true);
            }
        }

        [Test]
        public void VerificationRegions_AreInsideViewportAndDoNotOverlap()
        {
            InvokeRebuild();
            Scene scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Additive);

            try
            {
                GameObject[] objects = SceneObjects(scene);
                Camera camera = objects.Single(item => item.name == "Main Camera").GetComponent<Camera>();
                TangoVerificationMarkers markers = objects
                    .Single(item => item.name == "Tango Verification Markers")
                    .GetComponent<TangoVerificationMarkers>();
                Assert.That(markers, Is.Not.Null);

                TangoVerificationRegion[] names = (TangoVerificationRegion[])Enum.GetValues(
                    typeof(TangoVerificationRegion));
                Assert.That(names, Has.Length.EqualTo(7));
                var regions = new List<Rect>(names.Length);
                foreach (TangoVerificationRegion name in names)
                {
                    Rect region = markers.GetViewportRegion(name, camera);
                    Assert.That(region.width, Is.GreaterThan(0f), name.ToString());
                    Assert.That(region.height, Is.GreaterThan(0f), name.ToString());
                    Assert.That(region.xMin, Is.GreaterThanOrEqualTo(0f), name.ToString());
                    Assert.That(region.yMin, Is.GreaterThanOrEqualTo(0f), name.ToString());
                    Assert.That(region.xMax, Is.LessThanOrEqualTo(1f), name.ToString());
                    Assert.That(region.yMax, Is.LessThanOrEqualTo(1f), name.ToString());
                    foreach (Rect prior in regions)
                    {
                        Assert.That(region.Overlaps(prior), Is.False, $"{name} overlaps {prior}");
                    }

                    regions.Add(region);
                }
            }
            finally
            {
                EditorSceneManager.CloseScene(scene, true);
            }
        }

        [Test]
        public void FrameShadowReceiver_SitsInsideProjectedBottomRailShadowWithMargin()
        {
            InvokeRebuild();
            Scene scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            GameObject[] objects = SceneObjects(scene);
            Renderer rail = objects.Single(item => item.name == "Frame Bottom Rail").GetComponent<Renderer>();
            Renderer receiver = objects.Single(item => item.name == "Ground Shadow Receiver").GetComponent<Renderer>();
            Light light = objects.Single(item => item.name == "Directional Light").GetComponent<Light>();
            TangoVerificationMarkers markers = objects
                .Single(item => item.name == "Tango Verification Markers")
                .GetComponent<TangoVerificationMarkers>();
            Transform marker = GetSerializedReference<Transform>(markers, "frameShadowReceiver");

            const float margin = 0.015f;
            float receiverPlaneZ = receiver.bounds.min.z;
            Vector3 direction = light.transform.forward;
            Assert.That(direction.z, Is.GreaterThan(0f));
            Bounds railBounds = rail.bounds;
            float projectedMinX = float.PositiveInfinity;
            float projectedMinY = float.PositiveInfinity;
            float projectedMaxX = float.NegativeInfinity;
            float projectedMaxY = float.NegativeInfinity;
            for (int x = -1; x <= 1; x += 2)
            {
                for (int y = -1; y <= 1; y += 2)
                {
                    for (int z = -1; z <= 1; z += 2)
                    {
                        Vector3 corner = railBounds.center + Vector3.Scale(
                            railBounds.extents,
                            new Vector3(x, y, z));
                        Vector3 projected = corner + direction * ((receiverPlaneZ - corner.z) / direction.z);
                        projectedMinX = Mathf.Min(projectedMinX, projected.x);
                        projectedMinY = Mathf.Min(projectedMinY, projected.y);
                        projectedMaxX = Mathf.Max(projectedMaxX, projected.x);
                        projectedMaxY = Mathf.Max(projectedMaxY, projected.y);
                    }
                }
            }

            Vector3 markerHalfSize = marker.lossyScale * 0.5f;
            Assert.That(marker.position.x - markerHalfSize.x, Is.GreaterThan(projectedMinX + margin));
            Assert.That(marker.position.x + markerHalfSize.x, Is.LessThan(projectedMaxX - margin));
            Assert.That(marker.position.y - markerHalfSize.y, Is.GreaterThan(projectedMinY + margin));
            Assert.That(marker.position.y + markerHalfSize.y, Is.LessThan(projectedMaxY - margin));
            Assert.That(marker.position.z, Is.EqualTo(receiverPlaneZ).Within(0.001f));
        }

        [Test]
        public void DemoMotion_SetPhaseIsDeterministicAndNormalized()
        {
            var spinnerObject = new GameObject("Spinner");
            var lightObject = new GameObject("Light");
            TangoSpinner spinner = spinnerObject.AddComponent<TangoSpinner>();
            TangoLightOrbit lightOrbit = lightObject.AddComponent<TangoLightOrbit>();

            try
            {
                spinner.SetPhase(0.25f);
                Quaternion spinnerQuarter = spinnerObject.transform.localRotation;
                spinner.SetPhase(1.25f);
                Assert.That(Quaternion.Angle(spinnerQuarter, spinnerObject.transform.localRotation), Is.LessThan(0.001f));

                lightOrbit.SetPhase(0.75f);
                Quaternion lightThreeQuarters = lightObject.transform.localRotation;
                lightOrbit.SetPhase(-0.25f);
                Assert.That(Quaternion.Angle(lightThreeQuarters, lightObject.transform.localRotation), Is.LessThan(0.001f));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(spinnerObject);
                UnityEngine.Object.DestroyImmediate(lightObject);
            }
        }

        [Test]
        public void Spinner_ReopenAndEnablePreserveAuthoredPhaseAndRotation()
        {
            InvokeRebuild();
            Scene scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            TangoSpinner spinner = SceneObjects(scene)
                .Single(item => item.name == "Moving Striped Object")
                .GetComponent<TangoSpinner>();
            var serialized = new SerializedObject(spinner);
            SerializedProperty phase = serialized.FindProperty("phase");
            Assert.That(phase, Is.Not.Null);
            Assert.That(phase.floatValue, Is.EqualTo(0.04f).Within(0.0001f));

            Quaternion expected = Quaternion.Euler(0f, 0f, 0.04f * 360f);
            Assert.That(Quaternion.Angle(expected, spinner.transform.localRotation), Is.LessThan(0.001f));
            spinner.gameObject.SetActive(false);
            spinner.gameObject.SetActive(true);
            Assert.That(Quaternion.Angle(expected, spinner.transform.localRotation), Is.LessThan(0.001f));
        }

        private static IEnumerable<string> StableSerializedPaths()
        {
            foreach (string path in StableAssetPaths)
            {
                yield return path;
                yield return path + ".meta";
            }

            yield return RendererPath;
            yield return BuildSettingsPath;
        }

        private static void InvokeRebuild()
        {
            Type builderType = Type.GetType("TangoMvp.Editor.TangoGlassLabBuilder, TangoMvp.Editor");
            Assert.That(builderType, Is.Not.Null);
            MethodInfo rebuild = builderType.GetMethod("Rebuild", BindingFlags.Static | BindingFlags.Public);
            Assert.That(rebuild, Is.Not.Null);
            rebuild.Invoke(null, null);
        }

        private static GameObject[] SceneObjects(Scene scene)
        {
            return scene.GetRootGameObjects()
                .SelectMany(root => root.GetComponentsInChildren<Transform>(true))
                .Select(transform => transform.gameObject)
                .ToArray();
        }

        private static void AssertNameCount(IEnumerable<GameObject> objects, string name, int expected)
        {
            Assert.That(objects.Count(item => item.name == name), Is.EqualTo(expected), name);
        }

        private static T GetSerializedReference<T>(UnityEngine.Object owner, string propertyName)
            where T : UnityEngine.Object
        {
            var serialized = new SerializedObject(owner);
            SerializedProperty property = serialized.FindProperty(propertyName);
            Assert.That(property, Is.Not.Null, propertyName);
            return property.objectReferenceValue as T;
        }

        private static void AssertSerializedReference<T>(
            UnityEngine.Object owner,
            string propertyName,
            T expected)
            where T : UnityEngine.Object
        {
            Assert.That(GetSerializedReference<T>(owner, propertyName), Is.SameAs(expected));
        }
    }
}
