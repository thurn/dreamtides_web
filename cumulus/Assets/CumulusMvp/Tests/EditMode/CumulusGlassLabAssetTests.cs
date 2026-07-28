using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using NUnit.Framework;
using CumulusMvp.Editor;
using CumulusMvp.Demo;
using CumulusMvp.Diagnostics;
using CumulusMvp.Interaction;
using CumulusMvp.Materials;
using CumulusMvp.Motion;
using CumulusMvp.Rendering;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using TMPro;

namespace CumulusMvp.Tests
{
    public sealed class CumulusGlassLabAssetTests
    {
        private const string MeshPath = "Assets/CumulusMvp/Meshes/CumulusPanel.asset";
        private const string SceneGlassPath = "Assets/CumulusMvp/Materials/CumulusSceneGlass.mat";
        private const string OnGlassPath = "Assets/CumulusMvp/Materials/CumulusOnGlass.mat";
        private const string LightingProfilePath = "Assets/CumulusMvp/Materials/CumulusGlassLightingProfile.asset";
        private const string BlurPath = "Assets/CumulusMvp/Materials/CumulusBlur.mat";
        private const string LibraryPath = "Assets/CumulusMvp/Materials/CumulusMaterialLibrary.asset";
        private const string PrefabPath = "Assets/CumulusMvp/Prefabs/CumulusGlassPanel.prefab";
        private const string ScenePath = "Assets/Scenes/CumulusGlassLab.unity";
        private const string DreamsignButtonMeshPath =
            "Assets/CumulusMvp/Meshes/CumulusDreamsignGlassButton.asset";
        private const string RendererPath = "Assets/Settings/PC_Renderer.asset";
        private const string MobileRendererPath = "Assets/Settings/Mobile_Renderer.asset";
        private const string BuildSettingsPath = "ProjectSettings/EditorBuildSettings.asset";

        [Test]
        public void Rebuild_DoesNotOwnTextRenderingAssets()
        {
            InvokeRebuild();

            Assert.That(
                AssetDatabase.LoadAssetAtPath<Material>(
                    "Assets/CumulusMvp/Materials/CumulusTextOutline.mat"),
                Is.Null);
            Assert.That(
                AssetDatabase.LoadAssetAtPath<Shader>(
                    "Assets/CumulusMvp/Shaders/CumulusTextOutline.shader"),
                Is.Null);
        }

        [Test]
        public void Rebuild_DoesNotCreateOpaqueCumulusSurfaceMaterials()
        {
            InvokeRebuild();

            Assert.That(
                AssetDatabase.LoadAssetAtPath<Material>(
                    "Assets/CumulusMvp/Materials/CumulusSolidChrome.mat"),
                Is.Null);
            Assert.That(
                AssetDatabase.LoadAssetAtPath<Material>(
                    "Assets/CumulusMvp/Materials/CumulusShadowReceiver.mat"),
                Is.Null);
        }

        [Test]
        public void ShopGlassDemo_UsesWebShopBackdropAndOneCenteredSquareGlassPanel()
        {
            CumulusShopGlassDemoBuilder.Rebuild();
            Scene scene = EditorSceneManager.OpenScene(
                CumulusShopGlassDemoBuilder.ScenePath,
                OpenSceneMode.Single);
            GameObject[] roots = scene.GetRootGameObjects();

            Assert.That(
                roots.Select(root => root.name),
                Is.EquivalentTo(new[]
                {
                    "Main Camera",
                    "Directional Light",
                    "Tumbleleaf Village Backdrop",
                    "Cumulus Glass Panel",
                }));

            Camera camera = roots.Single(root => root.name == "Main Camera").GetComponent<Camera>();
            Assert.That(camera.orthographic, Is.True);
            Assert.That(camera.transform.position, Is.EqualTo(new Vector3(0f, 0f, -10f)));

            GameObject panel = roots.Single(root => root.name == "Cumulus Glass Panel");
            MeshFilter panelFilter = panel.GetComponent<MeshFilter>();
            Vector3 panelSize = Vector3.Scale(panelFilter.sharedMesh.bounds.size, panel.transform.localScale);
            Assert.That(panel.transform.position, Is.EqualTo(Vector3.zero));
            Assert.That(panelSize.x, Is.EqualTo(panelSize.y).Within(0.001f));
            Assert.That(panel.transform.localScale.x, Is.EqualTo(panel.transform.localScale.y).Within(0.0001f));
            Assert.That(panelSize.y / (camera.orthographicSize * 2f), Is.LessThanOrEqualTo(0.5f));
            Assert.That(
                ProjectedTopRightCornerRadius(panelFilter.sharedMesh, camera, 2160),
                Is.EqualTo(8f).Within(0.05f));
            Assert.That(
                AssetDatabase.GetAssetPath(panel.GetComponent<MeshRenderer>().sharedMaterial),
                Is.EqualTo(SceneGlassPath));

            GameObject backdrop = roots.Single(root => root.name == "Tumbleleaf Village Backdrop");
            Material backdropMaterial = backdrop.GetComponent<MeshRenderer>().sharedMaterial;
            Assert.That(
                AssetDatabase.GetAssetPath(backdropMaterial.mainTexture),
                Is.EqualTo(CumulusShopGlassDemoBuilder.BackdropTexturePath));
            Assert.That(backdropMaterial.GetTextureScale("_BaseMap").y, Is.LessThan(1f));

            Light directional = roots.Single(root => root.name == "Directional Light").GetComponent<Light>();
            Assert.That(directional.type, Is.EqualTo(LightType.Directional));
            Assert.That(directional.shadows, Is.EqualTo(LightShadows.Soft));
        }

        [Test]
        public void ShopGlassDemo_UsesOnlyTheSharedGlassSurface()
        {
            CumulusShopGlassDemoBuilder.Rebuild();
            Scene scene = EditorSceneManager.OpenScene(
                CumulusShopGlassDemoBuilder.ScenePath,
                OpenSceneMode.Single);
            GameObject panel = scene.GetRootGameObjects()
                .Single(root => root.name == "Cumulus Glass Panel");

            Assert.That(panel.transform.childCount, Is.Zero);
            MeshRenderer renderer = panel.GetComponent<MeshRenderer>();
            Assert.That(renderer.shadowCastingMode, Is.EqualTo(ShadowCastingMode.Off));
            Assert.That(
                renderer.sharedMaterials,
                Has.All.SameAs(AssetDatabase.LoadAssetAtPath<Material>(SceneGlassPath)));
        }

        [Test]
        public void ShopGlassDemo_RebuildIsByteStable()
        {
            CumulusShopGlassDemoBuilder.Rebuild();
            byte[] first = File.ReadAllBytes(CumulusShopGlassDemoBuilder.ScenePath);

            CumulusShopGlassDemoBuilder.Rebuild();

            Assert.That(
                File.ReadAllBytes(CumulusShopGlassDemoBuilder.ScenePath),
                Is.EqualTo(first));
        }

        [Test]
        public void DreamsignGlassDemo_UsesThreeParityLitShadowCapableJourneyMeshesOnSharedGlass()
        {
            CumulusDreamsignGlassDemoBuilder.Rebuild();
            Scene scene = EditorSceneManager.OpenScene(
                CumulusDreamsignGlassDemoBuilder.ScenePath,
                OpenSceneMode.Single);
            GameObject[] roots = scene.GetRootGameObjects();
            string[] dreamsignIds =
            {
                "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
                "EDE46F71-AA77-4B12-9824-0D3706DA6A22",
                "A98F468B-5E76-4041-83EE-69C0871A6BF0",
            };

            Assert.That(
                roots.Select(root => root.name),
                Is.EquivalentTo(new[]
                {
                    "Main Camera",
                    "Directional Light",
                    "Tumbleleaf Village Backdrop",
                    "Cumulus Glass Panel",
                    "Dreamsign Violet Point Light",
                    "Dreamsign Cyan Point Light",
                    "Default Glass Button",
                }.Concat(dreamsignIds.Select(id => "Dreamsign " + id))));

            GameObject glass = roots.Single(root => root.name == "Cumulus Glass Panel");
            Assert.That(glass.GetComponent<MeshRenderer>().receiveShadows, Is.True);
            Assert.That(
                AssetDatabase.GetAssetPath(glass.GetComponent<MeshRenderer>().sharedMaterial),
                Is.EqualTo(SceneGlassPath));

            foreach (string id in dreamsignIds)
            {
                GameObject dreamsign = roots.Single(root => root.name == "Dreamsign " + id);
                MeshRenderer renderer = dreamsign.GetComponent<MeshRenderer>();
                Material material = renderer.sharedMaterial;

                Assert.That(dreamsign.transform.position.z, Is.LessThan(glass.transform.position.z));
                Assert.That(renderer.shadowCastingMode, Is.EqualTo(ShadowCastingMode.On));
                Assert.That(renderer.receiveShadows, Is.True);
                Assert.That(material.shader.name, Is.EqualTo("CumulusMvp/Dreamsign"));
                Assert.That(material.FindPass("Cumulus Dreamsign Forward"), Is.GreaterThanOrEqualTo(0));
                Assert.That(material.FindPass("Cumulus Dreamsign Shadow Caster"), Is.GreaterThanOrEqualTo(0));
                Assert.That(material.renderQueue, Is.EqualTo((int)RenderQueue.AlphaTest));
                Assert.That(material.GetFloat("_CumulusDreamsignBrightness"), Is.EqualTo(1.08f));
                Assert.That(material.GetFloat("_CumulusDreamsignSaturation"), Is.EqualTo(1.08f));
                Assert.That(material.GetFloat("_CumulusDreamsignLightStrength"), Is.EqualTo(0.08f));
                Assert.That(material.GetFloat("_CumulusDreamsignLightTintStrength"), Is.EqualTo(0.04f));
                Assert.That(material.GetFloat("_CumulusDreamsignShadowStrength"), Is.EqualTo(0.28f));
                Assert.That(material.GetFloat("_CumulusDreamsignAlphaCutoff"), Is.EqualTo(0.08f));
                Assert.That(
                    AssetDatabase.GetAssetPath(material.GetTexture("_BaseMap")),
                    Is.EqualTo($"Assets/CumulusMvp/Demo/Art/Dreamsigns/{id}.png"));
            }

            foreach (string lightName in new[]
                     {
                         "Dreamsign Violet Point Light",
                         "Dreamsign Cyan Point Light",
                     })
            {
                Light light = roots.Single(root => root.name == lightName).GetComponent<Light>();
                Assert.That(light.type, Is.EqualTo(LightType.Point));
                Assert.That(light.shadows, Is.EqualTo(LightShadows.Soft));
            }

            GameObject button = roots.Single(root => root.name == "Default Glass Button");
            float expectedButtonCenterY = -4.6f * 0.5f + (24f + 42f * 0.5f) * 10f / 1080f;
            Assert.That(button.transform.position.x, Is.EqualTo(0f).Within(0.00001f));
            Assert.That(button.transform.position.y, Is.EqualTo(expectedButtonCenterY).Within(0.00001f));
            Assert.That(button.transform.position.z, Is.EqualTo(-0.06f).Within(0.00001f));
            Assert.That(button.GetComponent<CumulusPressable>(), Is.Not.Null);
            BoxCollider collider = button.GetComponent<BoxCollider>();
            Assert.That(collider, Is.Not.Null);

            Transform visual = button.transform.Find("Default Glass Button Visual");
            Assert.That(visual, Is.Not.Null);
            Mesh buttonMesh = visual.GetComponent<MeshFilter>().sharedMesh;
            Assert.That(AssetDatabase.GetAssetPath(buttonMesh), Is.EqualTo(DreamsignButtonMeshPath));
            Assert.That(
                buttonMesh.bounds.size.x,
                Is.EqualTo(59.921875f * 10f / 1080f).Within(0.00001f));
            Assert.That(
                buttonMesh.bounds.size.y,
                Is.EqualTo(42f * 10f / 1080f).Within(0.00001f));
            Assert.That(collider.size.x, Is.EqualTo(buttonMesh.bounds.size.x).Within(0.00001f));
            Assert.That(collider.size.y, Is.EqualTo(buttonMesh.bounds.size.y).Within(0.00001f));

            MeshRenderer buttonRenderer = visual.GetComponent<MeshRenderer>();
            Assert.That(
                buttonRenderer.sharedMaterials,
                Has.All.SameAs(AssetDatabase.LoadAssetAtPath<Material>(OnGlassPath)));
            Assert.That(buttonRenderer.shadowCastingMode, Is.EqualTo(ShadowCastingMode.Off));

            TextMeshPro label = visual.GetComponentInChildren<TextMeshPro>();
            Assert.That(label, Is.Not.Null);
            Assert.That(label.text, Is.EqualTo("Sort"));
            Assert.That(label.alignment, Is.EqualTo(TextAlignmentOptions.Center));
            Assert.That(label.fontSize, Is.EqualTo(1.4f));
            Assert.That(label.fontWeight, Is.EqualTo(FontWeight.Bold));
            Assert.That(label.fontStyle, Is.EqualTo(FontStyles.Bold));
            Assert.That(label.color.r, Is.EqualTo(1f).Within(0.00001f));
            Assert.That(label.color.g, Is.EqualTo(248f / 255f).Within(0.00001f));
            Assert.That(label.color.b, Is.EqualTo(236f / 255f).Within(0.00001f));
            Assert.That(label.color.a, Is.EqualTo(1f).Within(0.00001f));
            Assert.That(
                label.rectTransform.sizeDelta.x,
                Is.EqualTo(buttonMesh.bounds.size.x).Within(0.00001f));
            Assert.That(
                label.rectTransform.sizeDelta.y,
                Is.EqualTo(buttonMesh.bounds.size.y).Within(0.00001f));
            Assert.That(
                AssetDatabase.GetAssetPath(label.font),
                Is.EqualTo("Assets/TextMesh Pro/Examples & Extras/Resources/Fonts & Materials/Roboto-Bold SDF.asset"));
            Assert.That(label.GetComponentInParent<Canvas>(), Is.Null);

            Assert.That(
                roots.Single(root => root.name == "Main Camera")
                    .GetComponent<CumulusPointerInteractor>(),
                Is.Not.Null);
            Assert.That(
                roots.SelectMany(root => root.GetComponentsInChildren<TMP_Text>()),
                Is.EquivalentTo(new TMP_Text[] { label }));
            Assert.That(roots.SelectMany(root => root.GetComponentsInChildren<Canvas>()), Is.Empty);
        }

        [Test]
        public void DreamsignGlassDemo_RebuildIsByteStable()
        {
            CumulusDreamsignGlassDemoBuilder.Rebuild();
            byte[] first = File.ReadAllBytes(CumulusDreamsignGlassDemoBuilder.ScenePath);

            CumulusDreamsignGlassDemoBuilder.Rebuild();

            Assert.That(
                File.ReadAllBytes(CumulusDreamsignGlassDemoBuilder.ScenePath),
                Is.EqualTo(first));
        }

        private static readonly string[] StableAssetPaths =
        {
            MeshPath,
            "Assets/CumulusMvp/Meshes/CumulusShopGlassPanel.asset",
            SceneGlassPath,
            OnGlassPath,
            BlurPath,
            LibraryPath,
            LightingProfilePath,
            PrefabPath,
            ScenePath,
        };

        private static float ProjectedTopRightCornerRadius(
            Mesh mesh,
            Camera camera,
            int captureHeight)
        {
            Vector3[] vertices = mesh.vertices;
            float maximumX = vertices.Max(vertex => vertex.x);
            float maximumY = vertices.Max(vertex => vertex.y);
            float topEdgeEndX = vertices
                .Where(vertex => Mathf.Abs(vertex.y - maximumY) < 0.00001f)
                .Max(vertex => vertex.x);
            float worldRadius = maximumX - topEdgeEndX;
            return worldRadius * captureHeight / (camera.orthographicSize * 2f);
        }

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
                    BoxCollider driftedCollider = prefabRoot.transform.Find("On Glass Button")
                        .GetComponent<BoxCollider>();
                    driftedCollider.enabled = false;
                    driftedCollider.center = Vector3.one * 3f;
                    driftedCollider.size = Vector3.one * 9f;
                    driftedCollider.isTrigger = true;
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

                UnityEngine.Object.DestroyImmediate(roots.Single(root => root.name == "Point Light"));
                new GameObject("Unexpected Builder Drift");
                EditorSceneManager.SaveScene(driftedScene, ScenePath);

                InvokeRebuild();

                foreach (string path in repairedPaths)
                {
                    Assert.That(AssetDatabase.AssetPathToGUID(path), Is.EqualTo(guids[path]), path);
                }

                Mesh repairedMesh = AssetDatabase.LoadAssetAtPath<Mesh>(MeshPath);
                Assert.That(repairedMesh.name, Is.EqualTo("CumulusPanel"));
                Assert.That(repairedMesh.vertexCount, Is.GreaterThan(0));
                Assert.That(repairedMesh.bounds.size.x, Is.EqualTo(4f).Within(0.001f));

                GameObject repairedPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
                Assert.That(repairedPrefab.transform.Find("Primary Label"), Is.Not.Null);
                Assert.That(repairedPrefab.transform.Find("Unexpected Builder Drift"), Is.Null);
                BoxCollider repairedCollider = repairedPrefab.transform.Find("On Glass Button")
                    .GetComponent<BoxCollider>();
                Assert.That(repairedCollider.enabled, Is.True);
                Assert.That(repairedCollider.center, Is.EqualTo(Vector3.zero));
                Assert.That(repairedCollider.size, Is.EqualTo(new Vector3(1.48f, 0.54f, 0.22f)));
                Assert.That(repairedCollider.isTrigger, Is.False);
                Assert.That(repairedPrefab.GetComponentsInChildren<Behaviour>(true),
                    Has.All.Matches<Behaviour>(behaviour => behaviour.enabled));
                Assert.That(repairedPrefab.GetComponentsInChildren<Renderer>(true),
                    Has.All.Matches<Renderer>(renderer => renderer.enabled));

                Scene repairedScene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
                GameObject[] repairedRoots = repairedScene.GetRootGameObjects();
                Assert.That(repairedRoots.Any(root => root.name == "Point Light"), Is.True);
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
                Assert.That(repairedLight.GetComponent<CumulusLightOrbit>().enabled, Is.True);
                Assert.That(repairedRoots.Single(root => root.name == "Main Camera").GetComponent<Camera>().enabled,
                    Is.True);
                Assert.That(repairedRoots.Single(root => root.name == "Main Camera")
                    .GetComponent<CumulusPointerInteractor>().enabled, Is.True);
                Assert.That(repairedRoots.Single(root => root.name == "Moving Striped Object")
                    .GetComponent<CumulusSpinner>().enabled, Is.True);
                Assert.That(repairedRoots.Single(root => root.name == "Cumulus Verification Markers")
                    .GetComponent<CumulusVerificationMarkers>().enabled, Is.True);
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
            CumulusGlassRendererFeature[] glassFeatures = rendererData.rendererFeatures
                .OfType<CumulusGlassRendererFeature>()
                .ToArray();
            Assert.That(glassFeatures, Has.Length.EqualTo(1));
            Assert.That(glassFeatures[0].isActive, Is.True);
            Assert.That(AssetDatabase.GetAssetPath(glassFeatures[0]), Is.EqualTo(RendererPath));
            Assert.That(rendererData.rendererFeatures.Count(
                feature => feature != null && feature.GetType().Name.Contains("ScreenSpaceAmbientOcclusion")),
                Is.EqualTo(1));

            FieldInfo blurField = typeof(CumulusGlassRendererFeature).GetField(
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
                AssertNameCount(objects, "Point Light", 1);
                AssertNameCount(objects, "Moving Striped Object", 1);
                AssertNameCount(objects, "Panel Source Anchor", 1);
                AssertNameCount(objects, "Panel Destination Anchor", 1);
                AssertNameCount(objects, "Cumulus Glass Panel", 1);
                AssertNameCount(objects, "Independent Glass Pane", 1);
                AssertNameCount(objects, "On Glass Button", 1);
                AssertNameCount(objects, "Cumulus Verification Markers", 1);

                Camera camera = objects.Single(item => item.name == "Main Camera").GetComponent<Camera>();
                Assert.That(camera, Is.Not.Null);
                CumulusPointerInteractor interactor = camera.GetComponent<CumulusPointerInteractor>();
                Assert.That(interactor, Is.Not.Null);
                AssertSerializedReference(interactor, "interactionCamera", camera);
                Assert.That(camera.GetComponent<CumulusGlassLightingReporter>(), Is.Not.Null);
                Light pointLight = objects.Single(item => item.name == "Point Light").GetComponent<Light>();
                Assert.That(pointLight.type, Is.EqualTo(LightType.Point));
                Assert.That(pointLight.range, Is.GreaterThan(0f));
                Assert.That(pointLight.color.b, Is.GreaterThan(pointLight.color.r));

                MeshRenderer[] sceneGlassRenderers = objects
                    .Select(item => item.GetComponent<MeshRenderer>())
                    .Where(renderer => renderer != null && renderer.sharedMaterial != null &&
                        renderer.sharedMaterial.shader.name == "CumulusMvp/SceneGlass")
                    .ToArray();
                Assert.That(sceneGlassRenderers, Has.Length.EqualTo(2));
                Assert.That(sceneGlassRenderers[0].sharedMaterial, Is.SameAs(sceneGlassRenderers[1].sharedMaterial));
                Assert.That(sceneGlassRenderers[0].sharedMaterial,
                    Is.SameAs(AssetDatabase.LoadAssetAtPath<Material>(SceneGlassPath)));
                foreach (MeshRenderer renderer in sceneGlassRenderers)
                {
                    Assert.That(renderer.sharedMaterials, Has.Length.EqualTo(3));
                    Assert.That(renderer.sharedMaterials,
                        Has.All.SameAs(AssetDatabase.LoadAssetAtPath<Material>(SceneGlassPath)));
                }

                MeshRenderer onGlass = objects.Single(item => item.name == "On Glass Button Visual")
                    .GetComponent<MeshRenderer>();
                Assert.That(onGlass.sharedMaterial, Is.SameAs(AssetDatabase.LoadAssetAtPath<Material>(OnGlassPath)));
                Assert.That(onGlass.sharedMaterials, Has.Length.EqualTo(3));
                Assert.That(onGlass.sharedMaterials,
                    Has.All.SameAs(AssetDatabase.LoadAssetAtPath<Material>(OnGlassPath)));

                string[] objectNames = objects.Select(item => item.name).ToArray();
                Assert.That(objectNames, Does.Not.Contain("Solid Frame"));
                Assert.That(objectNames, Does.Not.Contain("Frame Bottom Rail"));
                Assert.That(objectNames, Does.Not.Contain("Frame Left Rail"));
                Assert.That(objectNames, Does.Not.Contain("Frame Right Rail"));

                TextMeshPro[] labels = objects.Select(item => item.GetComponent<TextMeshPro>())
                    .Where(label => label != null)
                    .ToArray();
                Assert.That(labels, Has.Length.EqualTo(2));
                Assert.That(labels.Select(label => label.name), Is.EquivalentTo(new[] { "Primary Label", "Button Label" }));
                Assert.That(labels.Select(label => label.text), Is.EquivalentTo(new[] { "CUMULUS GLASS", "TRAVEL" }));
                Assert.That(labels, Has.All.Matches<TextMeshPro>(label => label.GetComponentInParent<Canvas>() == null));
                Assert.That(labels, Has.All.Matches<TextMeshPro>(label => label.color == Color.white));
                Assert.That(labels, Has.All.Matches<TextMeshPro>(label => label.font != null));
                Assert.That(labels, Has.All.Matches<TextMeshPro>(label =>
                    AssetDatabase.GetAssetPath(label.fontSharedMaterial) ==
                    "Assets/TextMesh Pro/Resources/Fonts & Materials/LiberationSans SDF.asset"));
                Assert.That(objects.Select(item => item.GetComponent<TextMesh>()).Any(label => label != null), Is.False);

                CumulusPressable[] pressables = objects.Select(item => item.GetComponent<CumulusPressable>())
                    .Where(pressable => pressable != null)
                    .ToArray();
                Assert.That(pressables, Has.Length.EqualTo(1));
                foreach (CumulusPressable pressable in pressables)
                {
                    Collider[] rootColliders = pressable.GetComponents<Collider>();
                    Assert.That(rootColliders, Has.Length.EqualTo(1));
                    Assert.That(pressable.GetComponentsInChildren<Collider>(true), Has.Length.EqualTo(1));
                    AssertSerializedReference(pressable, "hitCollider", rootColliders[0]);
                    Transform visual = GetSerializedReference<Transform>(pressable, "visual");
                    Assert.That(visual, Is.Not.Null);
                    Assert.That(visual.IsChildOf(pressable.transform), Is.True);
                }

                CumulusPanelTravel travel = objects.Single(item => item.name == "Cumulus Glass Panel")
                    .GetComponent<CumulusPanelTravel>();
                Assert.That(travel, Is.Not.Null);
                Assert.That(GetSerializedReference<Transform>(travel, "sourceAnchor").name,
                    Is.EqualTo("Panel Source Anchor"));
                Assert.That(GetSerializedReference<Transform>(travel, "destinationAnchor").name,
                    Is.EqualTo("Panel Destination Anchor"));
                CumulusPressable button = pressables.Single();
                Assert.That(button.Activated.GetPersistentEventCount(), Is.EqualTo(1));
                Assert.That(button.Activated.GetPersistentTarget(0), Is.SameAs(travel));
                Assert.That(button.Activated.GetPersistentMethodName(0), Is.EqualTo(nameof(CumulusPanelTravel.ToggleDestination)));
                Assert.That(button.Activated.GetPersistentListenerState(0), Is.EqualTo(UnityEventCallState.RuntimeOnly));

                Assert.That(objects.Count(item => item.GetComponent<CumulusSpinner>() != null), Is.EqualTo(1));
                Assert.That(objects.Count(item => item.GetComponent<CumulusLightOrbit>() != null), Is.EqualTo(2));
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
                CumulusVerificationMarkers markers = objects
                    .Single(item => item.name == "Cumulus Verification Markers")
                    .GetComponent<CumulusVerificationMarkers>();
                Assert.That(markers, Is.Not.Null);

                CumulusVerificationRegion[] names = (CumulusVerificationRegion[])Enum.GetValues(
                    typeof(CumulusVerificationRegion));
                Assert.That(names, Has.Length.EqualTo(4));
                var regions = new List<Rect>(names.Length);
                foreach (CumulusVerificationRegion name in names)
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
            CumulusSpinner spinner = spinnerObject.AddComponent<CumulusSpinner>();
            CumulusLightOrbit lightOrbit = lightObject.AddComponent<CumulusLightOrbit>();

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
            CumulusSpinner spinner = SceneObjects(scene)
                .Single(item => item.name == "Moving Striped Object")
                .GetComponent<CumulusSpinner>();
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
            Type builderType = Type.GetType("CumulusMvp.Editor.CumulusGlassLabBuilder, CumulusMvp.Editor");
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
