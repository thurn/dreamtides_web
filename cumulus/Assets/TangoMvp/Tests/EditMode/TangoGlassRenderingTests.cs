using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using NUnit.Framework;
using TangoMvp.Diagnostics;
using TangoMvp.Materials;
using TangoMvp.Rendering;
using UnityEditor;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace TangoMvp.Tests
{
    public sealed class TangoGlassRenderingTests
    {
        private const string SceneGlassMaterialPath = "Assets/TangoMvp/Materials/TangoSceneGlass.mat";
        private const string OnGlassMaterialPath = "Assets/TangoMvp/Materials/TangoOnGlass.mat";
        private const string SolidChromeMaterialPath = "Assets/TangoMvp/Materials/TangoSolidChrome.mat";
        private const string BlurMaterialPath = "Assets/TangoMvp/Materials/TangoBlur.mat";
        private const string MaterialLibraryPath = "Assets/TangoMvp/Materials/TangoMaterialLibrary.asset";

        [SetUp]
        public void SetUp()
        {
            TangoGlassDiagnostics.Reset();
        }

        [TearDown]
        public void TearDown()
        {
            TangoGlassDiagnostics.Reset();
        }

        [TestCase(2560, 1440, 1280, 720)]
        [TestCase(2559, 1439, 1280, 720)]
        [TestCase(1, 1, 1, 1)]
        public void BlurDescriptor_HalvesWithCeilingAndRemovesDepthAndMsaa(
            int sourceWidth,
            int sourceHeight,
            int expectedWidth,
            int expectedHeight)
        {
            var source = new RenderTextureDescriptor(sourceWidth, sourceHeight)
            {
                graphicsFormat = GraphicsFormat.R16G16B16A16_SFloat,
                depthBufferBits = 24,
                msaaSamples = 4,
                useMipMap = true,
                autoGenerateMips = true,
            };

            RenderTextureDescriptor result = TangoGlassBlurDescriptor.Create(source);

            Assert.That(result.width, Is.EqualTo(expectedWidth));
            Assert.That(result.height, Is.EqualTo(expectedHeight));
            Assert.That(result.graphicsFormat, Is.EqualTo(source.graphicsFormat));
            Assert.That(result.msaaSamples, Is.EqualTo(1));
            Assert.That(result.depthBufferBits, Is.Zero);
            Assert.That(result.useMipMap, Is.False);
            Assert.That(result.autoGenerateMips, Is.False);
        }

        [Test]
        public void ShaderIds_MatchRequiredGlobalNames()
        {
            Assert.That(TangoGlassShaderIds.BlurTexture, Is.EqualTo(Shader.PropertyToID("_TangoGlassBlurTexture")));
            Assert.That(TangoGlassShaderIds.BlurTexelSize, Is.EqualTo(Shader.PropertyToID("_TangoGlassBlurTexelSize")));
            Assert.That(TangoGlassShaderIds.Available, Is.EqualTo(Shader.PropertyToID("_TangoGlassAvailable")));
        }

        [Test]
        public void RendererFeature_OwnsOneMaterialAndOneConfiguredPass()
        {
            var feature = ScriptableObject.CreateInstance<TangoGlassRendererFeature>();
            try
            {
                feature.Create();
                FieldInfo[] fields = typeof(TangoGlassRendererFeature).GetFields(
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);

                Assert.That(fields.Count(field => field.FieldType == typeof(Material)), Is.EqualTo(1));

                ScriptableRenderPass[] passes = fields
                    .Where(field => typeof(ScriptableRenderPass).IsAssignableFrom(field.FieldType))
                    .Select(field => field.GetValue(feature) as ScriptableRenderPass)
                    .Where(pass => pass != null)
                    .ToArray();

                Assert.That(passes, Has.Length.EqualTo(1));
                Assert.That(passes[0].renderPassEvent, Is.EqualTo(RenderPassEvent.BeforeRenderingTransparents));
                Assert.That(passes[0].requiresIntermediateTexture, Is.True);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(feature);
            }
        }

        [Test]
        public void RendererFeature_RadiusIsFixedAndNotAuthorAdjustable()
        {
            FieldInfo[] instanceFields = typeof(TangoGlassRendererFeature).GetFields(
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            FieldInfo radiusConstant = typeof(TangoGlassRendererFeature).GetField(
                "BlurRadiusOutputPixels",
                BindingFlags.Static | BindingFlags.NonPublic);
            MethodInfo declaredSetActive = typeof(TangoGlassRendererFeature).GetMethod(
                "SetActive",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly);

            Assert.That(instanceFields.Any(field => field.FieldType == typeof(float)), Is.False);
            Assert.That(instanceFields.Any(field =>
                field.FieldType == typeof(float) && field.GetCustomAttribute<SerializeField>() != null), Is.False);
            Assert.That(radiusConstant, Is.Not.Null);
            Assert.That(radiusConstant.IsLiteral, Is.True);
            Assert.That(radiusConstant.GetRawConstantValue(), Is.EqualTo(22f));
            Assert.That(declaredSetActive, Is.Null);
        }

        [Test]
        public void RendererFeature_BaseTypedDeactivationResetsBeforeNextCameraAndSubscriptionIsIdempotent()
        {
            var feature = ScriptableObject.CreateInstance<TangoGlassRendererFeature>();
            FieldInfo subscribedField = typeof(TangoGlassRendererFeature).GetField(
                "cameraCallbackSubscribed",
                BindingFlags.Instance | BindingFlags.NonPublic);
            MethodInfo cameraBeginCallback = typeof(TangoGlassRendererFeature).GetMethod(
                "OnBeginCameraRendering",
                BindingFlags.Instance | BindingFlags.NonPublic);

            try
            {
                Assert.That(subscribedField, Is.Not.Null);
                Assert.That(cameraBeginCallback, Is.Not.Null);

                feature.Create();
                feature.Create();
                Assert.That(subscribedField.GetValue(feature), Is.True);

                Shader.SetGlobalFloat(TangoGlassShaderIds.Available, 1f);
                ScriptableRendererFeature baseTypedFeature = feature;
                baseTypedFeature.SetActive(false);

                cameraBeginCallback.Invoke(feature, new object[] { default(ScriptableRenderContext), null });

                Assert.That(Shader.GetGlobalFloat(TangoGlassShaderIds.Available), Is.Zero);

                ((IDisposable)feature).Dispose();
                Assert.That(subscribedField.GetValue(feature), Is.False);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(feature);
            }
        }

        [Test]
        public void Diagnostics_RejectStaleFramesOverwriteSameFrameAndReset()
        {
            const int cameraId = 17;
            TangoGlassDiagnostics.Publish(cameraId, 40, 1920, 1080, 960, 540, 1, 1, 1, true);

            Assert.That(TangoGlassDiagnostics.TryGetFrameFacts(cameraId, 39, out _), Is.False);
            Assert.That(TangoGlassDiagnostics.TryGetFrameFacts(cameraId, 40, out TangoGlassFrameFacts initial), Is.True);
            Assert.That(initial.InputWidth, Is.EqualTo(1920));
            Assert.That(initial.InputHeight, Is.EqualTo(1080));
            Assert.That(initial.OutputWidth, Is.EqualTo(960));
            Assert.That(initial.OutputHeight, Is.EqualTo(540));
            Assert.That(initial.GraphRecordCount, Is.EqualTo(1));
            Assert.That(initial.HorizontalPassCount, Is.EqualTo(1));
            Assert.That(initial.VerticalPassCount, Is.EqualTo(1));
            Assert.That(initial.Available, Is.True);

            TangoGlassDiagnostics.Publish(cameraId, 40, 1280, 720, 640, 360, 1, 1, 1, false);

            Assert.That(TangoGlassDiagnostics.TryGetFrameFacts(cameraId, 40, out TangoGlassFrameFacts overwritten), Is.True);
            Assert.That(overwritten.InputWidth, Is.EqualTo(1280));
            Assert.That(overwritten.OutputWidth, Is.EqualTo(640));
            Assert.That(overwritten.GraphRecordCount, Is.EqualTo(1));
            Assert.That(overwritten.Available, Is.False);

            TangoGlassDiagnostics.Reset();
            Assert.That(TangoGlassDiagnostics.TryGetFrameFacts(cameraId, 40, out _), Is.False);
        }

        [Test]
        public void Diagnostics_CameraKeysAreStableUniqueRegistrationsAndResetWithState()
        {
            var firstObject = new GameObject("Tango diagnostics camera A");
            var secondObject = new GameObject("Tango diagnostics camera B");
            try
            {
                Camera firstCamera = firstObject.AddComponent<Camera>();
                Camera secondCamera = secondObject.AddComponent<Camera>();

                int firstKey = TangoGlassDiagnostics.GetCameraKey(firstCamera);
                int repeatedFirstKey = TangoGlassDiagnostics.GetCameraKey(firstCamera);
                int secondKey = TangoGlassDiagnostics.GetCameraKey(secondCamera);

                Assert.That(firstKey, Is.GreaterThan(0));
                Assert.That(repeatedFirstKey, Is.EqualTo(firstKey));
                Assert.That(secondKey, Is.Not.EqualTo(firstKey));

                TangoGlassDiagnostics.Publish(firstKey, 8, 32, 16, 16, 8, 1, 1, 1, true);
                TangoGlassDiagnostics.Reset();

                Assert.That(TangoGlassDiagnostics.TryGetFrameFacts(firstKey, 8, out _), Is.False);
                Assert.That(TangoGlassDiagnostics.GetCameraKey(secondCamera), Is.EqualTo(1));
                Assert.That(TangoGlassDiagnostics.GetCameraKey(firstCamera), Is.EqualTo(2));

                FieldInfo entityKeyMap = typeof(TangoGlassDiagnostics).GetFields(
                        BindingFlags.Static | BindingFlags.NonPublic)
                    .SingleOrDefault(field =>
                        field.FieldType.IsGenericType &&
                        field.FieldType.GetGenericTypeDefinition() == typeof(Dictionary<,>) &&
                        field.FieldType.GetGenericArguments()[0] == typeof(EntityId) &&
                        field.FieldType.GetGenericArguments()[1] == typeof(int));
                Assert.That(entityKeyMap, Is.Not.Null);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(firstObject);
                UnityEngine.Object.DestroyImmediate(secondObject);
            }
        }

        [Test]
        public void BlurShader_HasExactlyHorizontalAndVerticalPasses()
        {
            Shader shader = Shader.Find("TangoMvp/SeparableBlur");

            Assert.That(shader, Is.Not.Null);
            Assert.That(shader.passCount, Is.EqualTo(2));
            var material = new Material(shader);
            try
            {
                Assert.That(material.FindPass("Tango Glass Blur Horizontal"), Is.EqualTo(0));
                Assert.That(material.FindPass("Tango Glass Blur Vertical"), Is.EqualTo(1));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(material);
            }
        }

        [Test]
        public void GlassShaders_ExposeOnlyHiddenFixedRoleProperties()
        {
            Shader sceneGlass = Shader.Find("TangoMvp/SceneGlass");
            Shader onGlass = Shader.Find("TangoMvp/OnGlass");

            Assert.That(sceneGlass, Is.Not.Null);
            Assert.That(onGlass, Is.Not.Null);

            AssertHiddenProperty(sceneGlass, "_TangoFillColor");
            AssertHiddenProperty(sceneGlass, "_TangoSaturation");
            AssertHiddenProperty(sceneGlass, "_TangoSheenAlpha");
            AssertHiddenProperty(sceneGlass, "_TangoRimAlpha");
            AssertHiddenProperty(sceneGlass, "_TangoFallbackAlpha");
            AssertHiddenProperty(onGlass, "_TangoLensColor");
            AssertHiddenProperty(onGlass, "_TangoRimAlpha");
            AssertHiddenProperty(onGlass, "_TangoHighlightAlpha");
        }

        [Test]
        public void SceneGlass_ConsumesSharedBlurOnceAndKeepsTransmissionOutOfDiffuseLighting()
        {
            Shader shader = Shader.Find("TangoMvp/SceneGlass");
            Assert.That(shader, Is.Not.Null);

            string source = ReadShaderSource(shader);
            Assert.That(source, Does.Contain("TEXTURE2D_X(_TangoGlassBlurTexture)"));
            Assert.That(source, Does.Contain("_TangoGlassBlurTexelSize"));
            Assert.That(source, Does.Contain("_TangoGlassAvailable"));
            Assert.That(
                Regex.Matches(source, @"SAMPLE_TEXTURE2D_X\s*\(\s*_TangoGlassBlurTexture").Count,
                Is.EqualTo(1));
            Assert.That(source, Does.Contain("half3 transmission"));
            Assert.That(source, Does.Contain("half3 shellLighting"));
            Assert.That(source, Does.Contain("1.0h - input.paneUv.y"));
            Assert.That(source, Does.Not.Contain("transmission * mainLight"));
            Assert.That(source, Does.Contain("0.72"));
            Assert.That(source, Does.Contain("ZWrite Off"));
            Assert.That(source, Does.Contain("ZTest LEqual"));
        }

        [Test]
        public void OnGlass_NeverDeclaresOrSamplesSharedBlur()
        {
            Shader shader = Shader.Find("TangoMvp/OnGlass");
            Assert.That(shader, Is.Not.Null);

            string source = ReadShaderSource(shader);
            Assert.That(source, Does.Not.Contain("_TangoGlassBlurTexture"));
            Assert.That(source, Does.Not.Contain("_TangoGlassBlurTexelSize"));
            Assert.That(source, Does.Not.Contain("_TangoGlassAvailable"));
        }

        [Test]
        public void RebuildMaterials_CreatesStableSharedMaterialVocabulary()
        {
            InvokeRebuildMaterials();

            string[] paths =
            {
                SceneGlassMaterialPath,
                OnGlassMaterialPath,
                SolidChromeMaterialPath,
                BlurMaterialPath,
                MaterialLibraryPath,
            };
            string[] initialGuids = paths.Select(AssetDatabase.AssetPathToGUID).ToArray();
            Assert.That(initialGuids, Has.All.Not.Empty);

            InvokeRebuildMaterials();

            Assert.That(paths.Select(AssetDatabase.AssetPathToGUID), Is.EqualTo(initialGuids));

            Material sceneGlass = AssetDatabase.LoadAssetAtPath<Material>(SceneGlassMaterialPath);
            Material onGlass = AssetDatabase.LoadAssetAtPath<Material>(OnGlassMaterialPath);
            Material solidChrome = AssetDatabase.LoadAssetAtPath<Material>(SolidChromeMaterialPath);
            Material blur = AssetDatabase.LoadAssetAtPath<Material>(BlurMaterialPath);
            TangoMaterialLibrary library = AssetDatabase.LoadAssetAtPath<TangoMaterialLibrary>(MaterialLibraryPath);

            Assert.That(sceneGlass, Is.Not.Null);
            Assert.That(onGlass, Is.Not.Null);
            Assert.That(solidChrome, Is.Not.Null);
            Assert.That(blur, Is.Not.Null);
            Assert.That(library, Is.Not.Null);
            Assert.That(sceneGlass.renderQueue, Is.EqualTo((int)RenderQueue.Transparent));
            Color fill = sceneGlass.GetColor("_TangoFillColor");
            Assert.That(fill.r, Is.EqualTo(0.055f).Within(0.0001f));
            Assert.That(fill.g, Is.EqualTo(0.055f).Within(0.0001f));
            Assert.That(fill.b, Is.EqualTo(0.063f).Within(0.0001f));
            Assert.That(fill.a, Is.EqualTo(0.54f).Within(0.0001f));
            Assert.That(sceneGlass.GetFloat("_TangoSaturation"), Is.EqualTo(1.5f));
            Assert.That(sceneGlass.GetFloat("_TangoSheenAlpha"), Is.EqualTo(0.07f));
            Assert.That(sceneGlass.GetFloat("_TangoRimAlpha"), Is.EqualTo(0.14f));
            Assert.That(sceneGlass.GetFloat("_TangoFallbackAlpha"), Is.EqualTo(0.72f));
            Assert.That(solidChrome.shader.name, Is.EqualTo("Universal Render Pipeline/Lit"));
            Assert.That(solidChrome.renderQueue, Is.EqualTo((int)RenderQueue.Geometry));
            Assert.That(solidChrome.GetShaderPassEnabled("ShadowCaster"), Is.True);

            Material[] resolved =
            {
                library.Resolve(TangoMaterialRole.SceneGlass),
                library.Resolve(TangoMaterialRole.OnGlass),
                library.Resolve(TangoMaterialRole.SolidChrome),
            };
            Assert.That(resolved, Has.All.Not.Null);
            Assert.That(resolved.Distinct().Count(), Is.EqualTo(3));
            Assert.That(AssetDatabase.GetAssetPath(resolved[0]), Is.EqualTo(SceneGlassMaterialPath));
            Assert.That(AssetDatabase.GetAssetPath(resolved[1]), Is.EqualTo(OnGlassMaterialPath));
            Assert.That(AssetDatabase.GetAssetPath(resolved[2]), Is.EqualTo(SolidChromeMaterialPath));
            Assert.DoesNotThrow(library.Validate);
        }

        private static void AssertHiddenProperty(Shader shader, string propertyName)
        {
            var material = new Material(shader);
            try
            {
                Assert.That(material.HasProperty(propertyName), Is.True, $"{shader.name} must declare {propertyName}.");
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(material);
            }

            string source = ReadShaderSource(shader);
            Assert.That(source, Does.Contain($"[HideInInspector] {propertyName}"));
        }

        private static string ReadShaderSource(Shader shader)
        {
            string assetPath = AssetDatabase.GetAssetPath(shader);
            Assert.That(assetPath, Is.Not.Empty);
            return File.ReadAllText(assetPath);
        }

        private static void InvokeRebuildMaterials()
        {
            Type builderType = Type.GetType("TangoMvp.Editor.TangoGlassLabBuilder, TangoMvp.Editor");
            Assert.That(builderType, Is.Not.Null);
            MethodInfo method = builderType.GetMethod(
                "RebuildMaterials",
                BindingFlags.Static | BindingFlags.Public);
            Assert.That(method, Is.Not.Null);
            method.Invoke(null, null);
        }
    }
}
