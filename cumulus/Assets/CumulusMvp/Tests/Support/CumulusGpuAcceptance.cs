using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CumulusMvp.Tests.Support
{
    public enum CumulusComparison
    {
        GreaterThanOrEqual,
        LessThanOrEqual,
        Equal,
    }

    [Serializable]
    public sealed class CumulusGpuAcceptanceResult
    {
        public string metricName;
        public float measuredValue;
        public bool measuredValueFinite;
        public string measuredValueText;
        public string comparison;
        public float threshold;
        public bool passed;
        public string phaseA;
        public string phaseB;
        public string graphicsApi;
        public string deviceName;
    }

    public static class CumulusGpuAcceptance
    {
        public const string LiveBackdropDelta = "liveBackdropDelta";
        public const string SurfaceContribution = "surfaceContribution";
        public const string BlurEdgeEnergyRatioMaximum = "blurEdgeEnergyRatioMaximum";
        public const string BlurEdgeEnergyRatioMinimum = "blurEdgeEnergyRatioMinimum";
        public const string SharedGraphRecords = "sharedGraphRecords";
        public const string DownsamplePasses = "downsamplePasses";
        public const string UpsamplePasses = "upsamplePasses";
        public const string OnGlassAdditionalPasses = "onGlassAdditionalPasses";
        public const string OnGlassBackdropDelta = "onGlassBackdropDelta";
        public const string OnGlassBackdropCorrelation = "onGlassBackdropCorrelation";
        public const string FallbackInteriorLuminanceMinimum = "fallbackInteriorLuminanceMinimum";
        public const string FallbackInteriorLuminanceMaximum = "fallbackInteriorLuminanceMaximum";

        public static CumulusGpuAcceptanceResult Evaluate(
            string metricName,
            float measuredValue,
            CumulusComparison comparison,
            float threshold,
            string phaseA = "",
            string phaseB = "",
            string graphicsApi = "",
            string deviceName = "")
        {
            if (string.IsNullOrWhiteSpace(metricName))
            {
                throw new ArgumentException("Metric name is required.", nameof(metricName));
            }

            if (float.IsNaN(threshold) || float.IsInfinity(threshold))
            {
                throw new ArgumentException("Threshold must be finite.", nameof(threshold));
            }

            bool finite = !float.IsNaN(measuredValue) && !float.IsInfinity(measuredValue);
            bool passed = finite && Compare(measuredValue, comparison, threshold);
            return new CumulusGpuAcceptanceResult
            {
                metricName = metricName,
                measuredValue = finite ? measuredValue : 0f,
                measuredValueFinite = finite,
                measuredValueText = finite
                    ? measuredValue.ToString("R", CultureInfo.InvariantCulture)
                    : float.IsNaN(measuredValue) ? "NaN" : measuredValue > 0f ? "Infinity" : "-Infinity",
                comparison = ComparisonName(comparison),
                threshold = threshold,
                passed = passed,
                phaseA = phaseA ?? string.Empty,
                phaseB = phaseB ?? string.Empty,
                graphicsApi = graphicsApi ?? string.Empty,
                deviceName = deviceName ?? string.Empty,
            };
        }

        public static bool AllPassed(IEnumerable<CumulusGpuAcceptanceResult> results)
        {
            if (results == null)
            {
                return false;
            }

            bool any = false;
            foreach (CumulusGpuAcceptanceResult result in results)
            {
                any = true;
                if (result == null || !result.passed)
                {
                    return false;
                }
            }

            return any;
        }

        public static string Serialize(IEnumerable<CumulusGpuAcceptanceResult> results)
        {
            if (results == null)
            {
                throw new ArgumentNullException(nameof(results));
            }

            var output = new StringBuilder("{\n  \"schemaVersion\": 1,\n  \"metrics\": [");
            bool first = true;
            foreach (CumulusGpuAcceptanceResult result in results)
            {
                if (result == null)
                {
                    throw new ArgumentException("Metrics cannot contain null records.", nameof(results));
                }

                if (!first)
                {
                    output.Append(',');
                }

                first = false;
                output.Append("\n    {");
                AppendString(output, "metricName", result.metricName, true);
                output.Append(",\n      \"measuredValue\": ");
                output.Append(result.measuredValueFinite ? result.measuredValueText : "null");
                AppendString(output, "measuredValueText", result.measuredValueText, false);
                output.Append(",\n      \"measuredValueFinite\": ").Append(result.measuredValueFinite ? "true" : "false");
                AppendString(output, "comparison", result.comparison, false);
                output.Append(",\n      \"threshold\": ").Append(result.threshold.ToString("R", CultureInfo.InvariantCulture));
                output.Append(",\n      \"passed\": ").Append(result.passed ? "true" : "false");
                AppendString(output, "phaseA", result.phaseA, false);
                AppendString(output, "phaseB", result.phaseB, false);
                AppendString(output, "graphicsApi", result.graphicsApi, false);
                AppendString(output, "deviceName", result.deviceName, false);
                output.Append("\n    }");
            }

            output.Append("\n  ]\n}\n");
            return output.ToString();
        }

        private static bool Compare(float value, CumulusComparison comparison, float threshold)
        {
            switch (comparison)
            {
                case CumulusComparison.GreaterThanOrEqual:
                    return value >= threshold;
                case CumulusComparison.LessThanOrEqual:
                    return value <= threshold;
                case CumulusComparison.Equal:
                    return value == threshold;
                default:
                    throw new ArgumentOutOfRangeException(nameof(comparison), comparison, "Unknown comparison.");
            }
        }

        private static string ComparisonName(CumulusComparison comparison)
        {
            switch (comparison)
            {
                case CumulusComparison.GreaterThanOrEqual:
                    return "greaterThanOrEqual";
                case CumulusComparison.LessThanOrEqual:
                    return "lessThanOrEqual";
                case CumulusComparison.Equal:
                    return "equal";
                default:
                    throw new ArgumentOutOfRangeException(nameof(comparison), comparison, "Unknown comparison.");
            }
        }

        private static void AppendString(StringBuilder output, string key, string value, bool first)
        {
            output.Append(first ? "\n      \"" : ",\n      \"");
            output.Append(Escape(key)).Append("\": \"").Append(Escape(value ?? string.Empty)).Append('"');
        }

        private static string Escape(string value)
        {
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
        }
    }
}
