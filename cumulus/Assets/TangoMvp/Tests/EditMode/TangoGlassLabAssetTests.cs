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
