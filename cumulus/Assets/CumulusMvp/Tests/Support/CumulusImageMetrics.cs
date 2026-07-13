using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace CumulusMvp.Tests.Support
{
    public static class CumulusImageMetrics
    {
        private const float RedLuminance = 0.2126f;
        private const float GreenLuminance = 0.7152f;
        private const float BlueLuminance = 0.0722f;

        public static float MeanAbsoluteRgbDifference(
            Color32[] first,
            Color32[] second,
            int width,
            int height,
            RectInt region)
        {
            ValidatePair(first, second, width, height);
            ValidateRegion(region, width, height);
            double sum = 0d;
            int channels = region.width * region.height * 3;
            for (int y = region.yMin; y < region.yMax; y++)
            {
                for (int x = region.xMin; x < region.xMax; x++)
                {
                    int index = y * width + x;
                    Vector3 a = LinearRgb(first[index]);
                    Vector3 b = LinearRgb(second[index]);
                    sum += Math.Abs(a.x - b.x) + Math.Abs(a.y - b.y) + Math.Abs(a.z - b.z);
                }
            }

            return CheckedResult(sum / channels, nameof(MeanAbsoluteRgbDifference));
        }

        public static float MeanLuminance(Color32[] pixels, int width, int height, RectInt region)
        {
            ValidateBuffer(pixels, width, height, nameof(pixels));
            ValidateRegion(region, width, height);
            double sum = 0d;
            for (int y = region.yMin; y < region.yMax; y++)
            {
                for (int x = region.xMin; x < region.xMax; x++)
                {
                    sum += LinearLuminance(pixels[y * width + x]);
                }
            }

            return CheckedResult(sum / (region.width * region.height), nameof(MeanLuminance));
        }

        public static float LuminanceEdgeEnergy(Color32[] pixels, int width, int height, RectInt region)
        {
            ValidateBuffer(pixels, width, height, nameof(pixels));
            ValidateRegion(region, width, height);
            long derivativeCount = (long)(region.width - 1) * region.height
                + (long)(region.height - 1) * region.width;
            if (derivativeCount <= 0)
            {
                throw new ArgumentException("Edge-energy region must contain at least one adjacent pixel pair.", nameof(region));
            }

            double sum = 0d;
            for (int y = region.yMin; y < region.yMax; y++)
            {
                for (int x = region.xMin; x < region.xMax; x++)
                {
                    float current = LinearLuminance(pixels[y * width + x]);
                    if (x + 1 < region.xMax)
                    {
                        sum += Math.Abs(current - LinearLuminance(pixels[y * width + x + 1]));
                    }

                    if (y + 1 < region.yMax)
                    {
                        sum += Math.Abs(current - LinearLuminance(pixels[(y + 1) * width + x]));
                    }
                }
            }

            return CheckedResult(sum / derivativeCount, nameof(LuminanceEdgeEnergy));
        }

        public static float LuminanceGradientPeak(Color32[] pixels, int width, int height, RectInt region)
        {
            ValidateBuffer(pixels, width, height, nameof(pixels));
            ValidateRegion(region, width, height);
            if (region.width < 2 && region.height < 2)
            {
                throw new ArgumentException("Gradient region must contain at least one adjacent pixel pair.", nameof(region));
            }

            float peak = 0f;
            for (int y = region.yMin; y < region.yMax; y++)
            {
                for (int x = region.xMin; x < region.xMax; x++)
                {
                    float current = LinearLuminance(pixels[y * width + x]);
                    if (x + 1 < region.xMax)
                    {
                        peak = Math.Max(peak, Math.Abs(current - LinearLuminance(pixels[y * width + x + 1])));
                    }

                    if (y + 1 < region.yMax)
                    {
                        peak = Math.Max(peak, Math.Abs(current - LinearLuminance(pixels[(y + 1) * width + x])));
                    }
                }
            }

            return CheckedResult(peak, nameof(LuminanceGradientPeak));
        }

        public static float PercentileContrast(Color32[] pixels, int width, int height, RectInt glyphRegion)
        {
            ValidateBuffer(pixels, width, height, nameof(pixels));
            ValidateRegion(glyphRegion, width, height);
            var regionLuminances = new List<float>(glyphRegion.width * glyphRegion.height);
            for (int y = glyphRegion.yMin; y < glyphRegion.yMax; y++)
            {
                for (int x = glyphRegion.xMin; x < glyphRegion.xMax; x++)
                {
                    regionLuminances.Add(LinearLuminance(pixels[y * width + x]));
                }
            }

            float glyphCutoff = Percentile(new List<float>(regionLuminances), 0.95f);
            var glyphCoordinates = new HashSet<Vector2Int>();
            var glyph = new List<float>();
            for (int y = glyphRegion.yMin; y < glyphRegion.yMax; y++)
            {
                for (int x = glyphRegion.xMin; x < glyphRegion.xMax; x++)
                {
                    float luminance = LinearLuminance(pixels[y * width + x]);
                    if (luminance >= glyphCutoff)
                    {
                        glyphCoordinates.Add(new Vector2Int(x, y));
                        glyph.Add(luminance);
                    }
                }
            }

            var borderCoordinates = new HashSet<Vector2Int>();
            foreach (Vector2Int coordinate in glyphCoordinates)
            {
                for (int y = coordinate.y - 1; y <= coordinate.y + 1; y++)
                {
                    for (int x = coordinate.x - 1; x <= coordinate.x + 1; x++)
                    {
                        var candidate = new Vector2Int(x, y);
                        if (x >= 0 && y >= 0 && x < width && y < height
                            && !glyphCoordinates.Contains(candidate))
                        {
                            borderCoordinates.Add(candidate);
                        }
                    }
                }
            }

            List<float> border = borderCoordinates
                .Select(coordinate => LinearLuminance(pixels[coordinate.y * width + coordinate.x]))
                .ToList();
            if (border.Count == 0)
            {
                throw new ArgumentException("Glyph region must identify a non-empty one-pixel border.", nameof(glyphRegion));
            }

            float glyph95 = Percentile(glyph, 0.95f);
            float borderMedian = Percentile(border, 0.5f);
            float brighter = Math.Max(glyph95, borderMedian);
            float darker = Math.Min(glyph95, borderMedian);
            return CheckedResult((brighter + 0.05d) / (darker + 0.05d), nameof(PercentileContrast));
        }

        public static float PercentileContrast(
            Color32[] labeled,
            Color32[] backdrop,
            int width,
            int height,
            RectInt glyphRegion)
        {
            ValidatePair(labeled, backdrop, width, height);
            ValidateRegion(glyphRegion, width, height);
            var positiveDeltas = new List<float>();
            for (int y = glyphRegion.yMin; y < glyphRegion.yMax; y++)
            {
                for (int x = glyphRegion.xMin; x < glyphRegion.xMax; x++)
                {
                    int index = y * width + x;
                    float delta = LinearLuminance(labeled[index]) - LinearLuminance(backdrop[index]);
                    if (delta > 0.01f)
                    {
                        positiveDeltas.Add(delta);
                    }
                }
            }

            if (positiveDeltas.Count == 0)
            {
                throw new ArgumentException("Labeled image contains no brighter glyph pixels.", nameof(labeled));
            }

            float glyphDeltaCutoff = Percentile(new List<float>(positiveDeltas), 0.7f);
            var glyphCoordinates = new HashSet<Vector2Int>();
            var glyphLuminances = new List<float>();
            for (int y = glyphRegion.yMin; y < glyphRegion.yMax; y++)
            {
                for (int x = glyphRegion.xMin; x < glyphRegion.xMax; x++)
                {
                    int index = y * width + x;
                    float luminance = LinearLuminance(labeled[index]);
                    float delta = luminance - LinearLuminance(backdrop[index]);
                    if (delta >= glyphDeltaCutoff)
                    {
                        glyphCoordinates.Add(new Vector2Int(x, y));
                        glyphLuminances.Add(luminance);
                    }
                }
            }

            var borderCoordinates = new HashSet<Vector2Int>();
            foreach (Vector2Int coordinate in glyphCoordinates)
            {
                for (int y = coordinate.y - 1; y <= coordinate.y + 1; y++)
                {
                    for (int x = coordinate.x - 1; x <= coordinate.x + 1; x++)
                    {
                        var candidate = new Vector2Int(x, y);
                        if (x >= 0 && y >= 0 && x < width && y < height
                            && !glyphCoordinates.Contains(candidate))
                        {
                            borderCoordinates.Add(candidate);
                        }
                    }
                }
            }

            if (borderCoordinates.Count == 0)
            {
                throw new ArgumentException("Detected glyph pixels have no one-pixel border.", nameof(glyphRegion));
            }

            var borderLuminances = borderCoordinates
                .Select(coordinate => LinearLuminance(labeled[coordinate.y * width + coordinate.x]))
                .ToList();
            float glyph95 = Percentile(glyphLuminances, 0.95f);
            float borderMedian = Percentile(borderLuminances, 0.5f);
            float brighter = Math.Max(glyph95, borderMedian);
            float darker = Math.Min(glyph95, borderMedian);
            return CheckedResult((brighter + 0.05d) / (darker + 0.05d), nameof(PercentileContrast));
        }

        public static float LuminanceCorrelation(
            Color32[] first,
            int firstWidth,
            int firstHeight,
            RectInt firstRegion,
            Color32[] second,
            int secondWidth,
            int secondHeight,
            RectInt secondRegion)
        {
            ValidateBuffer(first, firstWidth, firstHeight, nameof(first));
            ValidateBuffer(second, secondWidth, secondHeight, nameof(second));
            if (firstWidth != secondWidth || firstHeight != secondHeight)
            {
                throw new ArgumentException("Correlated images must have matching dimensions.", nameof(second));
            }

            ValidateRegion(firstRegion, firstWidth, firstHeight);
            ValidateRegion(secondRegion, secondWidth, secondHeight);
            int sampleWidth = Math.Min(firstRegion.width, secondRegion.width);
            int sampleHeight = Math.Min(firstRegion.height, secondRegion.height);
            if (sampleWidth * sampleHeight < 2)
            {
                throw new ArgumentException("Correlation regions must provide at least two samples.");
            }

            var firstSamples = new float[sampleWidth * sampleHeight];
            var secondSamples = new float[firstSamples.Length];
            for (int y = 0; y < sampleHeight; y++)
            {
                for (int x = 0; x < sampleWidth; x++)
                {
                    int sample = y * sampleWidth + x;
                    firstSamples[sample] = SampleLuminance(first, firstWidth, firstRegion, x, y, sampleWidth, sampleHeight);
                    secondSamples[sample] = SampleLuminance(second, secondWidth, secondRegion, x, y, sampleWidth, sampleHeight);
                }
            }

            return Pearson(firstSamples, secondSamples);
        }

        public static float LuminanceDeltaCorrelation(
            Color32[] firstPhaseA,
            Color32[] firstPhaseB,
            RectInt firstRegion,
            Color32[] secondPhaseA,
            Color32[] secondPhaseB,
            RectInt secondRegion,
            int width,
            int height)
        {
            ValidatePair(firstPhaseA, firstPhaseB, width, height);
            ValidatePair(secondPhaseA, secondPhaseB, width, height);
            ValidateRegion(firstRegion, width, height);
            ValidateRegion(secondRegion, width, height);
            int sampleWidth = Math.Min(firstRegion.width, secondRegion.width);
            int sampleHeight = Math.Min(firstRegion.height, secondRegion.height);
            if (sampleWidth * sampleHeight < 2)
            {
                throw new ArgumentException("Delta-correlation regions must provide at least two samples.");
            }

            var firstDelta = new float[sampleWidth * sampleHeight];
            var secondDelta = new float[firstDelta.Length];
            for (int y = 0; y < sampleHeight; y++)
            {
                for (int x = 0; x < sampleWidth; x++)
                {
                    int sample = y * sampleWidth + x;
                    firstDelta[sample] =
                        SampleLuminance(firstPhaseB, width, firstRegion, x, y, sampleWidth, sampleHeight)
                        - SampleLuminance(firstPhaseA, width, firstRegion, x, y, sampleWidth, sampleHeight);
                    secondDelta[sample] =
                        SampleLuminance(secondPhaseB, width, secondRegion, x, y, sampleWidth, sampleHeight)
                        - SampleLuminance(secondPhaseA, width, secondRegion, x, y, sampleWidth, sampleHeight);
                }
            }

            return Pearson(firstDelta, secondDelta);
        }

        public static byte[] EncodeRegionPng(Color32[] pixels, int width, int height, RectInt region)
        {
            ValidateBuffer(pixels, width, height, nameof(pixels));
            ValidateRegion(region, width, height);
            var regionPixels = new Color32[region.width * region.height];
            for (int y = 0; y < region.height; y++)
            {
                Array.Copy(pixels, (region.y + y) * width + region.x, regionPixels, y * region.width, region.width);
            }

            var texture = new Texture2D(region.width, region.height, TextureFormat.RGBA32, false, true);
            try
            {
                texture.SetPixels32(regionPixels);
                texture.Apply(false, false);
                byte[] png = ImageConversion.EncodeToPNG(texture);
                if (png == null || png.Length == 0)
                {
                    throw new InvalidOperationException("Unity returned an empty PNG encoding.");
                }

                return png;
            }
            finally
            {
                if (Application.isPlaying)
                {
                    UnityEngine.Object.Destroy(texture);
                }
                else
                {
                    UnityEngine.Object.DestroyImmediate(texture);
                }
            }
        }

        public static RectInt ViewportToPixelRegion(Rect viewport, int width, int height)
        {
            if (!IsFinite(viewport.xMin) || !IsFinite(viewport.yMin)
                || !IsFinite(viewport.xMax) || !IsFinite(viewport.yMax))
            {
                throw new ArgumentException("Viewport region contains a non-finite coordinate.", nameof(viewport));
            }

            int xMin = Mathf.FloorToInt(viewport.xMin * width);
            int yMin = Mathf.FloorToInt(viewport.yMin * height);
            int xMax = Mathf.CeilToInt(viewport.xMax * width);
            int yMax = Mathf.CeilToInt(viewport.yMax * height);
            var result = new RectInt(xMin, yMin, xMax - xMin, yMax - yMin);
            ValidateRegion(result, width, height);
            return result;
        }

        public static float LinearLuminance(Color32 color)
        {
            Vector3 linear = LinearRgb(color);
            return linear.x * RedLuminance + linear.y * GreenLuminance + linear.z * BlueLuminance;
        }

        private static Vector3 LinearRgb(Color32 color)
        {
            return new Vector3(SrgbToLinear(color.r), SrgbToLinear(color.g), SrgbToLinear(color.b));
        }

        private static float SrgbToLinear(byte channel)
        {
            float value = channel / 255f;
            return value <= 0.04045f
                ? value / 12.92f
                : Mathf.Pow((value + 0.055f) / 1.055f, 2.4f);
        }

        private static float SampleLuminance(
            Color32[] pixels,
            int width,
            RectInt region,
            int sampleX,
            int sampleY,
            int sampleWidth,
            int sampleHeight)
        {
            int x = region.xMin + Math.Min(region.width - 1, (sampleX * region.width + region.width / 2) / sampleWidth);
            int y = region.yMin + Math.Min(region.height - 1, (sampleY * region.height + region.height / 2) / sampleHeight);
            return LinearLuminance(pixels[y * width + x]);
        }

        private static float Pearson(float[] first, float[] second)
        {
            double firstMean = 0d;
            double secondMean = 0d;
            for (int index = 0; index < first.Length; index++)
            {
                firstMean += first[index];
                secondMean += second[index];
            }

            firstMean /= first.Length;
            secondMean /= second.Length;
            double covariance = 0d;
            double firstVariance = 0d;
            double secondVariance = 0d;
            for (int index = 0; index < first.Length; index++)
            {
                double firstCentered = first[index] - firstMean;
                double secondCentered = second[index] - secondMean;
                covariance += firstCentered * secondCentered;
                firstVariance += firstCentered * firstCentered;
                secondVariance += secondCentered * secondCentered;
            }

            double denominator = Math.Sqrt(firstVariance * secondVariance);
            if (denominator <= 1e-12d)
            {
                throw new ArgumentException("Correlation is undefined for a constant signal.");
            }

            return CheckedResult(covariance / denominator, nameof(LuminanceCorrelation));
        }

        private static float Percentile(List<float> values, float percentile)
        {
            if (values == null || values.Count == 0)
            {
                throw new ArgumentException("Percentile requires at least one value.", nameof(values));
            }

            values.Sort();
            float position = percentile * (values.Count - 1);
            int lower = Mathf.FloorToInt(position);
            int upper = Mathf.CeilToInt(position);
            return Mathf.Lerp(values[lower], values[upper], position - lower);
        }

        private static void ValidatePair(Color32[] first, Color32[] second, int width, int height)
        {
            ValidateBuffer(first, width, height, nameof(first));
            ValidateBuffer(second, width, height, nameof(second));
        }

        private static void ValidateBuffer(Color32[] pixels, int width, int height, string parameterName)
        {
            if (width <= 0 || height <= 0)
            {
                throw new ArgumentOutOfRangeException(parameterName, "Image dimensions must be positive.");
            }

            if (pixels == null || pixels.Length != width * height)
            {
                throw new ArgumentException("Pixel count does not match image dimensions.", parameterName);
            }
        }

        private static void ValidateRegion(RectInt region, int width, int height)
        {
            if (region.width <= 0 || region.height <= 0)
            {
                throw new ArgumentException("Image region must be non-empty.", nameof(region));
            }

            if (region.xMin < 0 || region.yMin < 0 || region.xMax > width || region.yMax > height)
            {
                throw new ArgumentOutOfRangeException(nameof(region), "Image region lies outside the image.");
            }
        }

        private static float CheckedResult(double value, string metric)
        {
            if (double.IsNaN(value) || double.IsInfinity(value))
            {
                throw new InvalidOperationException(metric + " produced a non-finite result.");
            }

            return (float)value;
        }

        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }
    }
}
