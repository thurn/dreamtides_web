using System;
using NUnit.Framework;
using TangoMvp.Tests.Support;
using UnityEngine;

namespace TangoMvp.Tests
{
    public sealed class TangoImageMetricsTests
    {
        private static readonly RectInt Full2X2 = new RectInt(0, 0, 2, 2);

        [Test]
        public void MeanAbsoluteRgbDifference_HandlesIdenticalAndDifferentLinearizedFrames()
        {
            Color32[] black = Solid(2, 2, new Color32(0, 0, 0, 255));
            Color32[] white = Solid(2, 2, new Color32(255, 255, 255, 255));

            Assert.That(TangoImageMetrics.MeanAbsoluteRgbDifference(black, white, 2, 2, Full2X2), Is.EqualTo(1f).Within(0.000001f));
            Assert.That(TangoImageMetrics.MeanAbsoluteRgbDifference(black, black, 2, 2, Full2X2), Is.Zero);
        }

        [Test]
        public void LuminanceEdgeEnergy_IsZeroForConstantImageAndHigherForHardEdgeThanBlurredEdge()
        {
            Color32[] constant = Row(0, 0, 0, 0);
            Color32[] hard = Row(0, 0, 255, 255);
            Color32[] blurred = Row(0, 85, 170, 255);
            var row = new RectInt(0, 0, 4, 1);

            Assert.That(TangoImageMetrics.LuminanceEdgeEnergy(constant, 4, 1, row), Is.Zero);
            Assert.That(TangoImageMetrics.LuminanceEdgeEnergy(hard, 4, 1, row), Is.GreaterThan(TangoImageMetrics.LuminanceEdgeEnergy(blurred, 4, 1, row)));
        }

        [Test]
        public void LuminanceGradientPeak_DistinguishesASharpEdgeFromTheSameSoftTransition()
        {
            Color32[] hard = Row(0, 0, 255, 255);
            Color32[] blurred = Row(0, 85, 170, 255);
            var row = new RectInt(0, 0, 4, 1);

            Assert.That(
                TangoImageMetrics.LuminanceGradientPeak(hard, 4, 1, row),
                Is.GreaterThan(TangoImageMetrics.LuminanceGradientPeak(blurred, 4, 1, row)));
        }

        [Test]
        public void PercentileContrast_UsesGlyph95thPercentileAndExpandedBorderMedian()
        {
            Color32[] image = Solid(5, 5, GrayForLinearLuminance(0.1f));
            Set(image, 5, 2, 2, GrayForLinearLuminance(0.5f));

            float contrast = TangoImageMetrics.PercentileContrast(image, 5, 5, new RectInt(2, 2, 1, 1));

            Assert.That(contrast, Is.EqualTo((0.5f + 0.05f) / (0.1f + 0.05f)).Within(0.04f));
        }

        [Test]
        public void PercentileContrast_WithBackdropFindsGlyphAndItsOnePixelOutline()
        {
            Color32[] backdrop = Solid(5, 5, GrayForLinearLuminance(0.6f));
            Color32[] labeled = (Color32[])backdrop.Clone();
            for (int y = 1; y <= 3; y++)
            {
                for (int x = 1; x <= 3; x++)
                {
                    Set(labeled, 5, x, y, GrayForLinearLuminance(0.02f));
                }
            }

            Set(labeled, 5, 2, 2, GrayForLinearLuminance(0.9f));

            float contrast = TangoImageMetrics.PercentileContrast(
                labeled,
                backdrop,
                5,
                5,
                new RectInt(1, 1, 3, 3));

            Assert.That(contrast, Is.EqualTo((0.9f + 0.05f) / (0.02f + 0.05f)).Within(0.3f));
        }

        [Test]
        public void LuminanceCorrelation_RecognizesMatchingAndInvertedImages()
        {
            Color32[] increasing = Row(0, 0, 255, 255);
            Color32[] same = Row(0, 0, 255, 255);
            Color32[] inverted = Row(255, 255, 0, 0);
            var row = new RectInt(0, 0, 4, 1);

            Assert.That(TangoImageMetrics.LuminanceCorrelation(increasing, 4, 1, row, same, 4, 1, row), Is.EqualTo(1f).Within(0.0001f));
            Assert.That(TangoImageMetrics.LuminanceCorrelation(increasing, 4, 1, row, inverted, 4, 1, row), Is.EqualTo(-1f).Within(0.0001f));
        }

        [Test]
        public void RegionEncoding_ProducesPngWithRequestedDimensions()
        {
            byte[] png = TangoImageMetrics.EncodeRegionPng(Solid(3, 2, new Color32(12, 34, 56, 255)), 3, 2, new RectInt(1, 0, 2, 2));
            var texture = new Texture2D(1, 1, TextureFormat.RGBA32, false, true);
            try
            {
                Assert.That(ImageConversion.LoadImage(texture, png, false), Is.True);
                Assert.That(texture.width, Is.EqualTo(2));
                Assert.That(texture.height, Is.EqualTo(2));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(texture);
            }
        }

        [TestCaseSource(nameof(InvalidMetricCalls))]
        public void Metrics_RejectInvalidInputs(TestDelegate call)
        {
            Assert.That(call, Throws.TypeOf<ArgumentException>()
                .Or.TypeOf<ArgumentOutOfRangeException>());
        }

        [Test]
        public void AcceptanceThresholds_FlipImmediatelyAcrossEveryCommittedBoundary()
        {
            AssertBoundary(TangoGpuAcceptance.LiveBackdropDelta, 0.015f, TangoComparison.GreaterThanOrEqual);
            AssertBoundary(TangoGpuAcceptance.SurfaceContribution, 0.02f, TangoComparison.GreaterThanOrEqual);
            AssertBoundary(TangoGpuAcceptance.BlurEdgeEnergyRatioMaximum, 0.65f, TangoComparison.LessThanOrEqual);
            AssertBoundary(TangoGpuAcceptance.BlurEdgeEnergyRatioMinimum, 0.005f, TangoComparison.GreaterThanOrEqual);
            AssertBoundary(TangoGpuAcceptance.SharedGraphRecords, 1f, TangoComparison.Equal);
            AssertBoundary(TangoGpuAcceptance.HorizontalPasses, 1f, TangoComparison.Equal);
            AssertBoundary(TangoGpuAcceptance.VerticalPasses, 1f, TangoComparison.Equal);
            AssertBoundary(TangoGpuAcceptance.OnGlassAdditionalPasses, 0f, TangoComparison.Equal);
            AssertBoundary(TangoGpuAcceptance.OnGlassBackdropDelta, 0.005f, TangoComparison.GreaterThanOrEqual);
            AssertBoundary(TangoGpuAcceptance.OnGlassBackdropCorrelation, 0.5f, TangoComparison.GreaterThanOrEqual);
            AssertBoundary(TangoGpuAcceptance.BevelLightDelta, 0.02f, TangoComparison.GreaterThanOrEqual);
            AssertBoundary(TangoGpuAcceptance.TransmissionLightDeltaRatio, 0.25f, TangoComparison.LessThanOrEqual);
            AssertBoundary(TangoGpuAcceptance.FrameShadowDelta, 0.02f, TangoComparison.GreaterThanOrEqual);
            AssertBoundary(TangoGpuAcceptance.LabelContrast, 4.5f, TangoComparison.GreaterThanOrEqual);
            AssertBoundary(TangoGpuAcceptance.FallbackInteriorLuminanceMinimum, 0.02f, TangoComparison.GreaterThanOrEqual);
            AssertBoundary(TangoGpuAcceptance.FallbackInteriorLuminanceMaximum, 0.8f, TangoComparison.LessThanOrEqual);
        }

        [Test]
        public void Acceptance_RejectsNonFiniteMeasurementsAndSerializesCompleteEvidence()
        {
            TangoGpuAcceptanceResult result = TangoGpuAcceptance.Evaluate(
                "syntheticFailure",
                float.NaN,
                TangoComparison.GreaterThanOrEqual,
                0.5f,
                "spinner=0",
                "spinner=0.5",
                "Metal",
                "Synthetic GPU");

            Assert.That(result.passed, Is.False);
            string json = TangoGpuAcceptance.Serialize(new[] { result });
            StringAssert.Contains("syntheticFailure", json);
            StringAssert.Contains("greaterThanOrEqual", json);
            StringAssert.Contains("spinner=0", json);
            StringAssert.Contains("Metal", json);
            StringAssert.Contains("Synthetic GPU", json);
        }

        private static object[] InvalidMetricCalls()
        {
            Color32[] pixels = Solid(2, 2, new Color32(0, 0, 0, 255));
            return new object[]
            {
                new TestDelegate(() => TangoImageMetrics.MeanAbsoluteRgbDifference(Array.Empty<Color32>(), Array.Empty<Color32>(), 0, 0, new RectInt())),
                new TestDelegate(() => TangoImageMetrics.MeanAbsoluteRgbDifference(pixels, pixels, 2, 2, new RectInt(0, 0, 0, 1))),
                new TestDelegate(() => TangoImageMetrics.LuminanceEdgeEnergy(pixels, 2, 2, new RectInt(1, 1, 2, 1))),
                new TestDelegate(() => TangoImageMetrics.PercentileContrast(pixels, 2, 2, new RectInt(-1, 0, 1, 1))),
                new TestDelegate(() => TangoImageMetrics.LuminanceCorrelation(pixels, 2, 2, Full2X2, Solid(3, 2, Color.black), 3, 2, new RectInt(0, 0, 3, 2))),
                new TestDelegate(() => TangoImageMetrics.ViewportToPixelRegion(new Rect(float.NaN, 0f, 0.5f, 0.5f), 2, 2)),
            };
        }

        private static void AssertBoundary(string metricName, float threshold, TangoComparison comparison)
        {
            float epsilon = Math.Max(Math.Abs(threshold) * 0.0001f, 0.00001f);
            float inside;
            float outside;
            if (comparison == TangoComparison.GreaterThanOrEqual)
            {
                inside = threshold + epsilon;
                outside = threshold - epsilon;
            }
            else if (comparison == TangoComparison.LessThanOrEqual)
            {
                inside = threshold - epsilon;
                outside = threshold + epsilon;
            }
            else
            {
                inside = threshold;
                outside = threshold + epsilon;
            }

            Assert.That(TangoGpuAcceptance.Evaluate(metricName, inside, comparison, threshold).passed, Is.True, metricName + " inside");
            Assert.That(TangoGpuAcceptance.Evaluate(metricName, outside, comparison, threshold).passed, Is.False, metricName + " outside");
        }

        private static Color32[] Solid(int width, int height, Color color)
        {
            return Solid(width, height, (Color32)color);
        }

        private static Color32[] Solid(int width, int height, Color32 color)
        {
            var result = new Color32[width * height];
            for (int index = 0; index < result.Length; index++)
            {
                result[index] = color;
            }

            return result;
        }

        private static Color32[] Row(params byte[] values)
        {
            var result = new Color32[values.Length];
            for (int index = 0; index < values.Length; index++)
            {
                result[index] = new Color32(values[index], values[index], values[index], 255);
            }

            return result;
        }

        private static Color32 GrayForLinearLuminance(float linear)
        {
            float srgb = linear <= 0.0031308f
                ? linear * 12.92f
                : 1.055f * Mathf.Pow(linear, 1f / 2.4f) - 0.055f;
            byte value = (byte)Mathf.RoundToInt(Mathf.Clamp01(srgb) * 255f);
            return new Color32(value, value, value, 255);
        }

        private static void Set(Color32[] pixels, int width, int x, int y, Color32 color)
        {
            pixels[y * width + x] = color;
        }
    }
}
