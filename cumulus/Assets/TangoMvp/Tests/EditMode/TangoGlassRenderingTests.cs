using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using NUnit.Framework;
using TangoMvp.Diagnostics;
using TangoMvp.Demo;
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
        private const string GlassLightingIncludePath = "Assets/TangoMvp/Shaders/TangoGlassLighting.hlsl";

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
        public void RendererFeature_BlurUsesMeshIndependentFullscreenGeometry()
        {
            Type blurPassType = typeof(TangoGlassRendererFeature).GetNestedType(
                "TangoGlassBlurPass",
                BindingFlags.NonPublic);
            FieldInfo geometry = blurPassType?.GetField(
                "BlurGeometry",
                BindingFlags.Static | BindingFlags.NonPublic);

            Assert.That(blurPassType, Is.Not.Null);
            Assert.That(geometry, Is.Not.Null);
            Assert.That(geometry.IsLiteral, Is.True);
            Assert.That(
                Enum.GetName(geometry.FieldType, geometry.GetRawConstantValue()),
                Is.EqualTo("ProceduralTriangle"));
        }

        [Test]
        public void RendererFeature_PyramidIsFixedAndNotAuthorAdjustable()
        {
            FieldInfo[] instanceFields = typeof(TangoGlassRendererFeature).GetFields(
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            FieldInfo supportConstant = typeof(TangoGlassRendererFeature).GetField(
                "BlurSupportOutputPixels",
                BindingFlags.Static | BindingFlags.NonPublic);
            FieldInfo levelConstant = typeof(TangoGlassRendererFeature).GetField(
                "PyramidLevelCount",
                BindingFlags.Static | BindingFlags.NonPublic);
            MethodInfo declaredSetActive = typeof(TangoGlassRendererFeature).GetMethod(
                "SetActive",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly);

            Assert.That(instanceFields.Any(field => field.FieldType == typeof(float)), Is.False);
            Assert.That(instanceFields.Any(field =>
                field.FieldType == typeof(float) && field.GetCustomAttribute<SerializeField>() != null), Is.False);
            Assert.That(supportConstant, Is.Not.Null);
            Assert.That(supportConstant.IsLiteral, Is.True);
            Assert.That(supportConstant.GetRawConstantValue(), Is.EqualTo(22f));
            Assert.That(levelConstant, Is.Not.Null);
            Assert.That(levelConstant.IsLiteral, Is.True);
            Assert.That(levelConstant.GetRawConstantValue(), Is.EqualTo(4));
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
            Assert.That(initial.DownsamplePassCount, Is.EqualTo(1));
            Assert.That(initial.UpsamplePassCount, Is.EqualTo(1));
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
        public void Diagnostics_RetainLightingConfigurationUntilItChangesOrResets()
        {
            var initial = new TangoGlassLightingFacts(
                "TangoGlassLightingProfile",
                1,
                TangoGlassQuality.Desktop,
                TangoGlassRendererMode.ForwardPlus,
                4,
                true,
                true);
            Assert.That(TangoGlassDiagnostics.PublishLighting(17, initial), Is.True);
            Assert.That(TangoGlassDiagnostics.PublishLighting(17, initial), Is.False);
            Assert.That(TangoGlassDiagnostics.TryGetLightingFacts(17, out TangoGlassLightingFacts facts), Is.True);
            Assert.That(facts, Is.EqualTo(initial));
            TangoGlassDiagnostics.Reset();
            Assert.That(TangoGlassDiagnostics.TryGetLightingFacts(17, out _), Is.False);
        }

        [Test]
        public void LightOrbit_MovesPointLightsAndKeepsDirectionalRotation()
        {
            var pointObject = new GameObject("Point orbit test");
            var directionalObject = new GameObject("Directional orbit test");
            try
            {
                Light point = pointObject.AddComponent<Light>();
                point.type = LightType.Point;
                TangoLightOrbit pointOrbit = pointObject.AddComponent<TangoLightOrbit>();
                pointOrbit.ConfigurePointOrbit(Vector3.zero, 3f, 2f, 0f);
                Assert.That(pointObject.transform.localPosition, Is.EqualTo(new Vector3(3f, 2f, 0f)));
                pointOrbit.SetPhase(0.25f);
                Assert.That(pointObject.transform.localPosition.x, Is.EqualTo(0f).Within(0.0001f));
                Assert.That(pointObject.transform.localPosition.z, Is.EqualTo(3f).Within(0.0001f));

                Light directional = directionalObject.AddComponent<Light>();
                directional.type = LightType.Directional;
                TangoLightOrbit directionalOrbit = directionalObject.AddComponent<TangoLightOrbit>();
                directionalOrbit.SetPhase(0.25f);
                Assert.That(directionalObject.transform.localRotation.eulerAngles.y, Is.EqualTo(90f).Within(0.01f));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(pointObject);
                UnityEngine.Object.DestroyImmediate(directionalObject);
            }
        }

        [Test]
        public void BlurShader_HasExactlyDownsampleAndUpsamplePasses()
        {
            Shader shader = Shader.Find("Hidden/TangoMvp/SeparableBlur");

            Assert.That(shader, Is.Not.Null);
            Assert.That(shader.passCount, Is.EqualTo(2));
            var material = new Material(shader);
            try
            {
                Assert.That(material.FindPass("Tango Glass Blur Downsample"), Is.EqualTo(0));
                Assert.That(material.FindPass("Tango Glass Blur Upsample"), Is.EqualTo(1));
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
            string[] lightingProperties =
            {
                "_TangoEdgeStrength",
                "_TangoEdgeRoughness",
                "_TangoInteriorStrength",
                "_TangoInteriorRoughness",
                "_TangoLightColorResponse",
                "_TangoReflectionCeiling",
                "_TangoDesktopAdditionalLightLimit",
                "_TangoMobileAdditionalLightLimit",
            };
            foreach (string property in lightingProperties)
            {
                AssertHiddenProperty(sceneGlass, property);
                AssertHiddenProperty(onGlass, property);
            }
        }

        [Test]
        public void GlassShaders_UseSharedBoundedUrpLightingWithoutRelightingTransmission()
        {
            string sceneSource = ReadShaderSource(Shader.Find("TangoMvp/SceneGlass"));
            string onGlassSource = ReadShaderSource(Shader.Find("TangoMvp/OnGlass"));
            Assert.That(File.Exists(GlassLightingIncludePath), Is.True);
            string lightingSource = File.ReadAllText(GlassLightingIncludePath);

            foreach (string source in new[] { sceneSource, onGlassSource })
            {
                Assert.That(source, Does.Contain("TangoGlassLighting.hlsl"));
                Assert.That(source, Does.Contain("_ADDITIONAL_LIGHTS"));
                Assert.That(source, Does.Contain("_ADDITIONAL_LIGHT_SHADOWS"));
                Assert.That(source, Does.Contain("_CLUSTER_LIGHT_LOOP"));
                Assert.That(source, Does.Contain("EvaluateTangoGlassLighting"));
            }

            Assert.That(lightingSource, Does.Contain("LIGHT_LOOP_BEGIN"));
            Assert.That(lightingSource, Does.Contain("LIGHT_LOOP_END"));
            Assert.That(lightingSource, Does.Contain("TANGO_GLASS_DESKTOP_LIGHT_LIMIT 4"));
            Assert.That(lightingSource, Does.Contain("TANGO_GLASS_MOBILE_LIGHT_LIMIT 1"));
            Assert.That(lightingSource, Does.Contain("0.04h"));
            Assert.That(lightingSource, Does.Contain("distanceAttenuation"));
            Assert.That(lightingSource, Does.Contain("shadowAttenuation"));
            Assert.That(lightingSource, Does.Contain("defined(SHADER_API_MOBILE)"));
            Assert.That(lightingSource, Does.Contain("GetAdditionalLight(lightIndex, positionWS)"));
            Assert.That(sceneSource, Does.Not.Contain("EvaluateTangoGlassLighting(transmission"));
            Assert.That(onGlassSource, Does.Not.Contain("_TangoGlassBlurTexture"));
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
            string shellBody = ExtractFunctionBody(
                source,
                "void ComputeShellLighting(Varyings input, out half3 additiveLighting, out half rimOpacity)");
            Assert.That(shellBody, Does.Not.Contain("transmission"));
            Assert.That(shellBody, Does.Not.Contain("_TangoGlassBlurTexture"));
            Assert.That(shellBody, Does.Not.Contain("GetMainLight"));
            Assert.That(source, Does.Contain("EvaluateTangoGlassLighting"));
            Assert.That(source, Does.Contain("ComputeShellLighting(input, additiveLighting, rimOpacity);"));
            Assert.That(Regex.Matches(source, @"\btransmission\b").Count, Is.EqualTo(2));
            Assert.That(source, Does.Contain("half3 transmission = SampleTransmission(input.positionCS);"));
            Assert.That(
                source,
                Does.Contain("return half4(CompositeRim(transmission + additiveLighting, rimOpacity), 1.0h);"));
            Assert.That(source, Does.Contain("1.0h - input.paneUv.y"));
            Assert.That(source, Does.Contain("0.72"));
            Assert.That(source, Does.Contain("ZWrite Off"));
            Assert.That(source, Does.Contain("ZTest LEqual"));
        }

        [Test]
        public void SceneGlass_FallbackStraightAlphaPreservesShellAndLiveReplacesBackdrop()
        {
            Shader shader = Shader.Find("TangoMvp/SceneGlass");
            Assert.That(shader, Is.Not.Null);

            string source = ReadShaderSource(shader);
            string fallbackBody = ExtractFunctionBody(
                source,
                "half4 ComposeFallback(half3 interior, half3 additiveLighting, half rimOpacity)");
            Assert.That(fallbackBody, Does.Contain("max(_TangoFallbackAlpha, 0.0001h)"));
            Assert.That(
                fallbackBody,
                Does.Contain("return half4(CompositeRim(sourceColor, rimOpacity), outputAlpha);"));

            const float fallbackAlpha = 0.72f;
            Color linearFill = ((Color)new Color32(14, 14, 16, 255)).linear;
            var interior = new Vector3(linearFill.r, linearFill.g, linearFill.b);
            var shell = new Vector3(0.12f, 0.07f, 0.03f);
            var destination = new Vector3(0.2f, 0.4f, 0.8f);
            Vector3 encodedFallback = interior + shell / fallbackAlpha;
            Vector3 blendedFallback = fallbackAlpha * encodedFallback + (1f - fallbackAlpha) * destination;
            Vector3 expectedFallback = fallbackAlpha * interior + shell + 0.28f * destination;
            Assert.That(Vector3.Distance(blendedFallback, expectedFallback), Is.LessThan(0.000001f));

            var transmission = new Vector3(0.3f, 0.5f, 0.7f);
            Vector3 blendedLive = transmission + shell;
            Vector3 expectedLive = transmission + shell;
            Assert.That(Vector3.Distance(blendedLive, expectedLive), Is.LessThan(0.000001f));
        }

        [Test]
        public void SceneGlass_AvailabilityBranchReturnsBeforeBlurSampling()
        {
            Shader shader = Shader.Find("TangoMvp/SceneGlass");
            Assert.That(shader, Is.Not.Null);

            string source = ReadShaderSource(shader);
            string fragmentBody = ExtractFunctionBody(source, "half4 Frag(Varyings input)");
            Assert.That(
                fragmentBody,
                Does.Match(@"UNITY_BRANCH\s+if\s*\(_TangoGlassAvailable\s*<\s*0\.5h\)"));

            int branchIndex = fragmentBody.IndexOf("if (_TangoGlassAvailable < 0.5h)", StringComparison.Ordinal);
            Assert.That(branchIndex, Is.GreaterThanOrEqualTo(0));
            int fallbackReturnIndex = fragmentBody.IndexOf("return ComposeFallback", branchIndex, StringComparison.Ordinal);
            int sampleIndex = fragmentBody.IndexOf("SampleTransmission", branchIndex, StringComparison.Ordinal);
            Assert.That(fallbackReturnIndex, Is.GreaterThan(branchIndex));
            Assert.That(sampleIndex, Is.GreaterThan(fallbackReturnIndex));
            Assert.That(
                fragmentBody.Substring(branchIndex, sampleIndex - branchIndex),
                Does.Not.Contain("_TangoGlassBlurTexture"));

            string sampleBody = ExtractFunctionBody(source, "half3 SampleTransmission(float4 positionCS)");
            Assert.That(
                Regex.Matches(sampleBody, @"SAMPLE_TEXTURE2D_X\s*\(\s*_TangoGlassBlurTexture").Count,
                Is.EqualTo(1));
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
        public void GlassRims_AreDerivativeScaledHairlinesWithCompositedWhite()
        {
            string sceneSource = ReadShaderSource(Shader.Find("TangoMvp/SceneGlass"));
            string onGlassSource = ReadShaderSource(Shader.Find("TangoMvp/OnGlass"));

            foreach (string source in new[] { sceneSource, onGlassSource })
            {
                Assert.That(source, Does.Contain("fwidth("));
                Assert.That(source, Does.Contain("edgeDistanceUv / uvPerPixel"));
                Assert.That(source, Does.Contain("0.25h"));
                Assert.That(source, Does.Contain("1.25h"));
            }

            Assert.That(sceneSource, Does.Contain("return lerp(color, 1.0h.xxx, saturate(rimOpacity));"));
            Assert.That(onGlassSource, Does.Contain("return lerp(lens, half4(1.0h, 1.0h, 1.0h, 1.0h), rimOpacity);"));
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
            Color expectedFill = ((Color)new Color32(14, 14, 16, 255)).linear;
            Assert.That(fill.r, Is.EqualTo(expectedFill.r).Within(0.0001f));
            Assert.That(fill.g, Is.EqualTo(expectedFill.g).Within(0.0001f));
            Assert.That(fill.b, Is.EqualTo(expectedFill.b).Within(0.0001f));
            Assert.That(fill.a, Is.EqualTo(0.78f).Within(0.0001f));
            Assert.That(sceneGlass.GetFloat("_TangoSaturation"), Is.EqualTo(1.5f));
            Assert.That(sceneGlass.GetFloat("_TangoSheenAlpha"), Is.EqualTo(0.015f));
            Assert.That(sceneGlass.GetFloat("_TangoRimAlpha"), Is.EqualTo(0.06f));
            Assert.That(sceneGlass.GetFloat("_TangoFallbackAlpha"), Is.EqualTo(0.72f));
            Color lens = onGlass.GetColor("_TangoLensColor");
            Color expectedLens = ((Color)new Color32(4, 4, 6, 255)).linear;
            Assert.That(lens.r, Is.EqualTo(expectedLens.r).Within(0.0001f));
            Assert.That(lens.g, Is.EqualTo(expectedLens.g).Within(0.0001f));
            Assert.That(lens.b, Is.EqualTo(expectedLens.b).Within(0.0001f));
            Assert.That(lens.a, Is.EqualTo(0.13f).Within(0.0001f));
            Assert.That(onGlass.GetFloat("_TangoRimAlpha"), Is.EqualTo(0.08f));
            Assert.That(onGlass.GetFloat("_TangoHighlightAlpha"), Is.EqualTo(0.10f));
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

        private static string ExtractFunctionBody(string source, string signature)
        {
            int signatureIndex = source.IndexOf(signature, StringComparison.Ordinal);
            Assert.That(signatureIndex, Is.GreaterThanOrEqualTo(0), $"Missing shader function: {signature}");
            int openingBrace = source.IndexOf('{', signatureIndex);
            Assert.That(openingBrace, Is.GreaterThan(signatureIndex));

            int depth = 0;
            for (int index = openingBrace; index < source.Length; index++)
            {
                switch (source[index])
                {
                    case '{':
                        depth++;
                        break;
                    case '}':
                        depth--;
                        if (depth == 0)
                        {
                            return source.Substring(openingBrace + 1, index - openingBrace - 1);
                        }

                        break;
                }
            }

            Assert.Fail($"Unterminated shader function: {signature}");
            return string.Empty;
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
