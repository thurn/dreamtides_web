using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using TangoMvp.Demo;
using TangoMvp.Diagnostics;
using TangoMvp.Rendering;
using TangoMvp.Tests.Support;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace TangoMvp.Tests.PlayMode
{
    public sealed class TangoGlassGpuTests
    {
        private const int CaptureWidth = 512;
        private const int CaptureHeight = 288;
        private static readonly string EvidenceDirectory = Path.GetFullPath("Artifacts/TangoMvpVerification");
        private readonly List<TangoGpuAcceptanceResult> latestResults = new List<TangoGpuAcceptanceResult>();

        [UnityTearDown]
        public IEnumerator RemoveLabSceneObjects()
        {
            Scene scene = SceneManager.GetActiveScene();
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                UnityEngine.Object.Destroy(root);
            }

            TangoGlassDiagnostics.Reset();
            string metricsPath = Path.Combine(EvidenceDirectory, "render-metrics.json");
            if (!File.Exists(metricsPath))
            {
                Directory.CreateDirectory(EvidenceDirectory);
                File.WriteAllText(metricsPath, TangoGpuAcceptance.Serialize(latestResults));
            }

            yield return null;
        }

        [UnityTest]
        public IEnumerator GlassLab_RendersLiveSharedBlurAndFailClosedFallbackEvidence()
        {
            Directory.CreateDirectory(EvidenceDirectory);
            string metricsPath = Path.Combine(EvidenceDirectory, "render-metrics.json");
            File.Delete(metricsPath);
            SceneManager.LoadScene("TangoGlassLab", LoadSceneMode.Single);
            yield return null;

            latestResults.Clear();
            List<TangoGpuAcceptanceResult> results = latestResults;
            Camera camera = UnityEngine.Object.FindFirstObjectByType<Camera>();
            TangoVerificationMarkers markers = UnityEngine.Object.FindFirstObjectByType<TangoVerificationMarkers>();
            TangoSpinner spinner = UnityEngine.Object.FindFirstObjectByType<TangoSpinner>();
            TangoLightOrbit lightOrbit = UnityEngine.Object.FindFirstObjectByType<TangoLightOrbit>();
            Assert.That(camera, Is.Not.Null);
            Assert.That(markers, Is.Not.Null);
            Assert.That(spinner, Is.Not.Null);
            Assert.That(lightOrbit, Is.Not.Null);

            TangoGlassRendererFeature feature = Resources.FindObjectsOfTypeAll<TangoGlassRendererFeature>()
                .FirstOrDefault(candidate => candidate != null && candidate.name == "TangoGlassRendererFeature");
            Assert.That(feature, Is.Not.Null, "The PC renderer must contain the active Tango feature.");

            GameObject panelRoot = GameObject.Find("Tango Glass Panel");
            GameObject mainGlass = GameObject.Find("Tango Glass Panel/Glass Face");
            GameObject independentGlass = GameObject.Find("Independent Glass Pane");
            GameObject onGlassButton = GameObject.Find("Tango Glass Panel/On Glass Button");
            GameObject solidFrame = GameObject.Find("Tango Glass Panel/Solid Frame");
            GameObject frameShadowCaster = GameObject.Find("Tango Glass Panel/Frame Bottom Rail");
            GameObject primaryLabel = GameObject.Find("Tango Glass Panel/Primary Label");
            Assert.That(panelRoot, Is.Not.Null);
            Assert.That(mainGlass, Is.Not.Null);
            Assert.That(independentGlass, Is.Not.Null);
            Assert.That(onGlassButton, Is.Not.Null);
            Assert.That(solidFrame, Is.Not.Null);
            Assert.That(frameShadowCaster, Is.Not.Null);
            Assert.That(primaryLabel, Is.Not.Null);

            var target = new RenderTexture(
                CaptureWidth,
                CaptureHeight,
                24,
                RenderTextureFormat.ARGB32,
                RenderTextureReadWrite.sRGB)
            {
                name = "Tango MVP GPU Acceptance",
                antiAliasing = 1,
                useMipMap = false,
                autoGenerateMips = false,
            };
            RenderTexture previousTarget = camera.targetTexture;
            bool featureWasActive = feature.isActive;
            ShadowCastingMode originalShadowMode = frameShadowCaster.GetComponent<Renderer>().shadowCastingMode;
            bool mainGlassEnabled = mainGlass.activeSelf;
            bool independentGlassEnabled = independentGlass.activeSelf;
            bool buttonEnabled = onGlassButton.activeSelf;
            Renderer labelRenderer = primaryLabel.GetComponent<Renderer>();
            bool labelRendererEnabled = labelRenderer.enabled;
            spinner.enabled = false;
            lightOrbit.enabled = false;
            camera.targetTexture = target;
            camera.aspect = (float)CaptureWidth / CaptureHeight;
            target.Create();

            string graphicsApi = SystemInfo.graphicsDeviceType.ToString();
            string deviceName = SystemInfo.graphicsDeviceName;
            RectInt liveA = Region(markers, camera, TangoVerificationRegion.LiveGlassA);
            RectInt liveB = Region(markers, camera, TangoVerificationRegion.LiveGlassB);
            RectInt uncovered = Region(markers, camera, TangoVerificationRegion.UncoveredPattern);
            RectInt button = Region(markers, camera, TangoVerificationRegion.OnGlassButton);
            RectInt bevel = Region(markers, camera, TangoVerificationRegion.SolidBevel);
            RectInt receiver = Region(markers, camera, TangoVerificationRegion.FrameShadowReceiver);
            RectInt label = Region(markers, camera, TangoVerificationRegion.PrimaryLabel);

            try
            {
                feature.SetActive(true);
                lightOrbit.SetPhase(0f);
                spinner.SetPhase(0.04f);
                Color32[] spinnerA = Capture(camera, target, "spinner-a");
                TangoGlassFrameFacts baselineFacts = RequireFacts(camera);
                spinner.SetPhase(0.29f);
                Color32[] spinnerB = Capture(camera, target, "spinner-b");
                spinner.SetPhase(0.70f);
                Color32[] spinnerC = Capture(camera, target, "spinner-c");

                Record(results, TangoGpuAcceptance.LiveBackdropDelta + ".LiveGlassA",
                    TangoImageMetrics.MeanAbsoluteRgbDifference(spinnerA, spinnerC, CaptureWidth, CaptureHeight, liveA),
                    TangoComparison.GreaterThanOrEqual, 0.015f, "spinner=0.04", "spinner=0.70", graphicsApi, deviceName);
                Record(results, TangoGpuAcceptance.LiveBackdropDelta + ".LiveGlassB",
                    TangoImageMetrics.MeanAbsoluteRgbDifference(spinnerA, spinnerC, CaptureWidth, CaptureHeight, liveB),
                    TangoComparison.GreaterThanOrEqual, 0.015f, "spinner=0.04", "spinner=0.70", graphicsApi, deviceName);

                float uncoveredEnergy = TangoImageMetrics.LuminanceEdgeEnergy(spinnerB, CaptureWidth, CaptureHeight, uncovered);
                if (uncoveredEnergy <= 0f)
                {
                    throw new InvalidOperationException("Uncovered pattern produced zero edge energy.");
                }

                float blurRatio = TangoImageMetrics.LuminanceEdgeEnergy(spinnerB, CaptureWidth, CaptureHeight, liveB) / uncoveredEnergy;
                Record(results, TangoGpuAcceptance.BlurEdgeEnergyRatioMaximum, blurRatio,
                    TangoComparison.LessThanOrEqual, 0.65f, "spinner=0.29", "spinner=0.29", graphicsApi, deviceName);
                Record(results, TangoGpuAcceptance.BlurEdgeEnergyRatioMinimum, blurRatio,
                    TangoComparison.GreaterThanOrEqual, 0.05f, "spinner=0.29", "spinner=0.29", graphicsApi, deviceName);

                RecordFacts(results, baselineFacts, "bothPanesEnabled", graphicsApi, deviceName);

                mainGlass.SetActive(false);
                Capture(camera, target, "main-pane-disabled");
                RecordFacts(results, RequireFacts(camera), "mainPaneDisabled", graphicsApi, deviceName);
                mainGlass.SetActive(true);

                independentGlass.SetActive(false);
                Capture(camera, target, "independent-pane-disabled");
                RecordFacts(results, RequireFacts(camera), "independentPaneDisabled", graphicsApi, deviceName);
                independentGlass.SetActive(true);

                onGlassButton.SetActive(false);
                spinner.SetPhase(0.04f);
                Color32[] parentA = Capture(camera, target, "button-parent-a");
                TangoGlassFrameFacts buttonDisabledFacts = RequireFacts(camera);
                RecordFacts(results, buttonDisabledFacts, "onGlassButtonDisabled", graphicsApi, deviceName);
                spinner.SetPhase(0.29f);
                Color32[] parentB = Capture(camera, target, "button-parent-b");
                Record(results, TangoGpuAcceptance.OnGlassAdditionalPasses,
                    Math.Abs(buttonDisabledFacts.HorizontalPassCount - baselineFacts.HorizontalPassCount)
                    + Math.Abs(buttonDisabledFacts.VerticalPassCount - baselineFacts.VerticalPassCount),
                    TangoComparison.Equal, 0f, "buttonEnabled", "buttonDisabled", graphicsApi, deviceName);

                onGlassButton.SetActive(true);
                spinner.SetPhase(0.04f);
                Color32[] buttonA = Capture(camera, target, "button-a");
                spinner.SetPhase(0.29f);
                Color32[] buttonB = Capture(camera, target, "button-b");
                Record(results, TangoGpuAcceptance.OnGlassBackdropDelta,
                    TangoImageMetrics.MeanAbsoluteRgbDifference(buttonA, buttonB, CaptureWidth, CaptureHeight, button),
                    TangoComparison.GreaterThanOrEqual, 0.005f, "spinner=0.04", "spinner=0.29", graphicsApi, deviceName);
                Record(results, TangoGpuAcceptance.OnGlassBackdropCorrelation,
                    TangoImageMetrics.LuminanceDeltaCorrelation(buttonA, buttonB, button, parentA, parentB, button, CaptureWidth, CaptureHeight),
                    TangoComparison.GreaterThanOrEqual, 0.5f, "buttonOverBackdropA", "buttonOverBackdropB", graphicsApi, deviceName);

                spinner.SetPhase(0.04f);
                lightOrbit.SetPhase(0f);
                Color32[] lightA = Capture(camera, target, "light-a");
                lightOrbit.SetPhase(0.5f);
                Color32[] lightB = Capture(camera, target, "light-b");
                float bevelDelta = TangoImageMetrics.MeanAbsoluteRgbDifference(lightA, lightB, CaptureWidth, CaptureHeight, bevel);
                float transmissionDelta = TangoImageMetrics.MeanAbsoluteRgbDifference(lightA, lightB, CaptureWidth, CaptureHeight, liveA);
                Record(results, TangoGpuAcceptance.BevelLightDelta, bevelDelta,
                    TangoComparison.GreaterThanOrEqual, 0.02f, "light=0", "light=0.5", graphicsApi, deviceName);
                Record(results, TangoGpuAcceptance.TransmissionLightDeltaRatio,
                    bevelDelta > 0f ? transmissionDelta / bevelDelta : float.NaN,
                    TangoComparison.LessThanOrEqual, 0.25f, "light=0", "light=0.5", graphicsApi, deviceName);

                lightOrbit.SetPhase(0f);
                Renderer frameRenderer = frameShadowCaster.GetComponent<Renderer>();
                frameRenderer.shadowCastingMode = ShadowCastingMode.On;
                Color32[] shadowOn = Capture(camera, target, "shadow-on");
                frameRenderer.shadowCastingMode = ShadowCastingMode.Off;
                Color32[] shadowOff = Capture(camera, target, "shadow-off");
                Record(results, TangoGpuAcceptance.FrameShadowDelta,
                    TangoImageMetrics.MeanAbsoluteRgbDifference(shadowOn, shadowOff, CaptureWidth, CaptureHeight, receiver),
                    TangoComparison.GreaterThanOrEqual, 0.02f, "shadow=On", "shadow=Off", graphicsApi, deviceName);

                frameRenderer.shadowCastingMode = originalShadowMode;
                float[] labelPhases = { 0.04f, 0.70f, 0.37f };
                string[] labelNames = { "bright", "gold", "dark" };
                for (int index = 0; index < labelPhases.Length; index++)
                {
                    spinner.SetPhase(labelPhases[index]);
                    labelRenderer.enabled = false;
                    Color32[] labelBackdrop = Capture(camera, target, "label-" + labelNames[index] + "-backdrop");
                    labelRenderer.enabled = true;
                    Color32[] labelCapture = Capture(camera, target, "label-" + labelNames[index]);
                    Record(results, TangoGpuAcceptance.LabelContrast + "." + labelNames[index],
                        TangoImageMetrics.PercentileContrast(
                            labelCapture,
                            labelBackdrop,
                            CaptureWidth,
                            CaptureHeight,
                            label),
                        TangoComparison.GreaterThanOrEqual, 4.5f,
                        "background=" + labelNames[index], "background=" + labelNames[index], graphicsApi, deviceName);
                }

                spinner.SetPhase(0.04f);
                feature.SetActive(false);
                Color32[] fallback = Capture(camera, target, "fallback");
                float fallbackLuminance = TangoImageMetrics.MeanLuminance(fallback, CaptureWidth, CaptureHeight, liveA);
                Record(results, TangoGpuAcceptance.FallbackInteriorLuminanceMinimum, fallbackLuminance,
                    TangoComparison.GreaterThanOrEqual, 0.02f, "feature=active", "feature=inactive", graphicsApi, deviceName);
                Record(results, TangoGpuAcceptance.FallbackInteriorLuminanceMaximum, fallbackLuminance,
                    TangoComparison.LessThanOrEqual, 0.8f, "feature=active", "feature=inactive", graphicsApi, deviceName);
            }
            finally
            {
                feature.SetActive(featureWasActive);
                frameShadowCaster.GetComponent<Renderer>().shadowCastingMode = originalShadowMode;
                mainGlass.SetActive(mainGlassEnabled);
                independentGlass.SetActive(independentGlassEnabled);
                onGlassButton.SetActive(buttonEnabled);
                labelRenderer.enabled = labelRendererEnabled;
                camera.targetTexture = previousTarget;
                RenderTexture.active = null;
                target.Release();
                UnityEngine.Object.Destroy(target);
                File.WriteAllText(metricsPath, TangoGpuAcceptance.Serialize(results));
            }

            Assert.That(SystemInfo.graphicsDeviceType, Is.Not.EqualTo(GraphicsDeviceType.Null));
            string failures = string.Join(
                Environment.NewLine,
                results.Where(result => !result.passed).Select(result =>
                    $"{result.metricName}: measured={result.measuredValueText} {result.comparison} {result.threshold}"));
            Assert.That(TangoGpuAcceptance.AllPassed(results), Is.True, failures);
        }

        private static RectInt Region(TangoVerificationMarkers markers, Camera camera, TangoVerificationRegion region)
        {
            return TangoImageMetrics.ViewportToPixelRegion(markers.GetViewportRegion(region, camera), CaptureWidth, CaptureHeight);
        }

        private static Color32[] Capture(Camera camera, RenderTexture target, string name)
        {
            camera.Render();
            RenderTexture previous = RenderTexture.active;
            var texture = new Texture2D(CaptureWidth, CaptureHeight, TextureFormat.RGBA32, false, false);
            try
            {
                RenderTexture.active = target;
                texture.ReadPixels(new Rect(0f, 0f, CaptureWidth, CaptureHeight), 0, 0, false);
                texture.Apply(false, false);
                Color32[] pixels = texture.GetPixels32();
                File.WriteAllBytes(
                    Path.Combine(EvidenceDirectory, name + ".png"),
                    TangoImageMetrics.EncodeRegionPng(pixels, CaptureWidth, CaptureHeight, new RectInt(0, 0, CaptureWidth, CaptureHeight)));
                return pixels;
            }
            finally
            {
                RenderTexture.active = previous;
                UnityEngine.Object.DestroyImmediate(texture);
            }
        }

        private static TangoGlassFrameFacts RequireFacts(Camera camera)
        {
            int key = TangoGlassDiagnostics.GetCameraKey(camera);
            if (!TangoGlassDiagnostics.TryGetFrameFacts(key, Time.frameCount, out TangoGlassFrameFacts facts))
            {
                throw new InvalidOperationException("No exact-frame Tango glass diagnostics were published for the capture camera.");
            }

            return facts;
        }

        private static void RecordFacts(
            List<TangoGpuAcceptanceResult> results,
            TangoGlassFrameFacts facts,
            string phase,
            string graphicsApi,
            string deviceName)
        {
            Record(results, TangoGpuAcceptance.SharedGraphRecords + "." + phase, facts.GraphRecordCount,
                TangoComparison.Equal, 1f, phase, phase, graphicsApi, deviceName);
            Record(results, TangoGpuAcceptance.HorizontalPasses + "." + phase, facts.HorizontalPassCount,
                TangoComparison.Equal, 1f, phase, phase, graphicsApi, deviceName);
            Record(results, TangoGpuAcceptance.VerticalPasses + "." + phase, facts.VerticalPassCount,
                TangoComparison.Equal, 1f, phase, phase, graphicsApi, deviceName);
        }

        private static void Record(
            List<TangoGpuAcceptanceResult> results,
            string metric,
            float value,
            TangoComparison comparison,
            float threshold,
            string phaseA,
            string phaseB,
            string graphicsApi,
            string deviceName)
        {
            results.Add(TangoGpuAcceptance.Evaluate(
                metric,
                value,
                comparison,
                threshold,
                phaseA,
                phaseB,
                graphicsApi,
                deviceName));
        }
    }
}
