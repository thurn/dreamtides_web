using System.Linq;
using System.Reflection;
using NUnit.Framework;
using TangoMvp.Diagnostics;
using TangoMvp.Rendering;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering.Universal;

namespace TangoMvp.Tests
{
    public sealed class TangoGlassRenderingTests
    {
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
    }
}
