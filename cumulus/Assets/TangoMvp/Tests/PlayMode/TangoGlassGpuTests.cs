using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using TangoMvp.Demo;
using TangoMvp.Diagnostics;
using TangoMvp.Interaction;
using TangoMvp.Motion;
using TangoMvp.Rendering;
using TangoMvp.Tests.Support;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace TangoMvp.Tests.PlayMode
{
    public sealed class TangoGlassGpuTests : InputTestFixture
    {
        private const int CaptureWidth = 512;
        private const int CaptureHeight = 288;
        private static readonly string EvidenceDirectory = Path.GetFullPath("Artifacts/TangoMvpVerification");
        private readonly List<TangoGpuAcceptanceResult> latestResults = new List<TangoGpuAcceptanceResult>();
        private static bool forceFailureAfterSetup;

        [UnityTest]
        public IEnumerator Fallback_RealSceneButtonSupportsHoverPressCancelAndTravelActivation()
        {
            Mouse mouse = null;
            TangoGlassRendererFeature feature = null;
            TangoPointerInteractor interactor = null;
            TangoPressable pressable = null;
            TangoPanelTravel travel = null;
            Transform panel = null;
            Transform visual = null;
            bool featureWasActive = false;
            bool interactorWasEnabled = false;
            bool travelWasEnabled = false;
            Vector3 panelPosition = default;
            Quaternion panelRotation = default;
            Vector3 restingVisualScale = default;
            bool stateCaptured = false;

            try
            {
                SceneManager.LoadScene("TangoGlassLab", LoadSceneMode.Single);
                yield return null;

                Camera camera = UnityEngine.Object.FindFirstObjectByType<Camera>();
                Assert.That(camera, Is.Not.Null);
                feature = Resources.FindObjectsOfTypeAll<TangoGlassRendererFeature>()
                    .FirstOrDefault(candidate => candidate != null && candidate.name == "TangoGlassRendererFeature");
                interactor = camera.GetComponent<TangoPointerInteractor>();
                pressable = UnityEngine.Object.FindFirstObjectByType<TangoPressable>();
                travel = UnityEngine.Object.FindFirstObjectByType<TangoPanelTravel>();
                Assert.That(feature, Is.Not.Null);
                Assert.That(interactor, Is.Not.Null);
                Assert.That(pressable, Is.Not.Null);
                Assert.That(travel, Is.Not.Null);
                panel = travel.transform;
                visual = pressable.transform.Find("On Glass Button Visual");
                Assert.That(visual, Is.Not.Null);

                featureWasActive = feature.isActive;
                interactorWasEnabled = interactor.enabled;
                travelWasEnabled = travel.enabled;
                panelPosition = panel.position;
                panelRotation = panel.rotation;
                restingVisualScale = visual.localScale;
                stateCaptured = true;
                feature.SetActive(false);
                Assert.That(feature.isActive, Is.False);

                mouse = InputSystem.AddDevice<Mouse>();
                Physics.SyncTransforms();
                Vector2 buttonPosition = camera.WorldToScreenPoint(pressable.transform.position);
                Move(mouse.position, buttonPosition);
                yield return null;
                AssertVector(visual.localScale, restingVisualScale * TangoPressable.HoverScaleFactor);

                Press(mouse.leftButton);
                yield return null;
                AssertVector(visual.localScale, restingVisualScale * TangoPressable.PressScaleFactor);
                Move(mouse.position, new Vector2(1f, 1f));
                yield return null;
                Release(mouse.leftButton);
                yield return null;
                Assert.That(travel.IsTravelling, Is.False);
                AssertVector(visual.localScale, restingVisualScale);

                Move(mouse.position, buttonPosition);
                yield return null;
                Press(mouse.leftButton);
                yield return null;
                LogAssert.Expect(LogType.Log, "TangoPressable activated: glass-panel-travel");
                Release(mouse.leftButton);
                yield return null;
                Assert.That(travel.IsTravelling, Is.True);
                yield return null;
                Assert.That(Vector3.Distance(panel.position, panelPosition), Is.GreaterThan(0f));
            }
            finally
            {
                if (stateCaptured && interactor != null)
                {
                    interactor.enabled = false;
                }
                if (mouse != null && mouse.added)
                {
                    InputSystem.RemoveDevice(mouse);
                }
                if (stateCaptured && travel != null)
                {
                    travel.enabled = false;
                }
                if (stateCaptured && panel != null)
                {
                    panel.SetPositionAndRotation(panelPosition, panelRotation);
                }
                if (stateCaptured && visual != null)
                {
                    visual.localScale = restingVisualScale;
                }
                if (stateCaptured && travel != null)
                {
                    travel.enabled = travelWasEnabled;
                }
                if (stateCaptured && interactor != null)
                {
                    interactor.enabled = interactorWasEnabled;
                }
                if (stateCaptured && feature != null)
                {
                    feature.SetActive(featureWasActive);
                }
            }
        }

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
        public IEnumerator EarlyFailure_RestoresEverySeededNonDefaultState()
        {
            var priorActive = new RenderTexture(8, 8, 0);
            priorActive.Create();
            RenderTexture.active = priorActive;
            var priorTarget = new RenderTexture(16, 16, 0); priorTarget.Create();
            try
            {
                IEnumerator routine = GlassLab_RendersLiveSharedBlurAndFailClosedFallbackEvidence();
                Assert.That(routine.MoveNext(), Is.True);
                yield return routine.Current;
                Camera seededCamera = UnityEngine.Object.FindFirstObjectByType<Camera>();
                TangoSpinner seededSpinner = UnityEngine.Object.FindFirstObjectByType<TangoSpinner>();
                TangoLightOrbit seededLight = UnityEngine.Object.FindFirstObjectByType<TangoLightOrbit>();
                TangoGlassRendererFeature seededFeature = Resources.FindObjectsOfTypeAll<TangoGlassRendererFeature>()
                    .First(candidate => candidate.name == "TangoGlassRendererFeature");
                GameObject seededMain = GameObject.Find("Tango Glass Panel/Glass Face");
                seededCamera.aspect = 1.2345f;
                seededCamera.targetTexture = priorTarget;
                seededSpinner.enabled = false;
                seededLight.enabled = false;
                seededFeature.SetActive(false);
                seededMain.SetActive(false);
                Quaternion spinnerPose = seededSpinner.transform.localRotation;
                Quaternion lightPose = seededLight.transform.localRotation;
                forceFailureAfterSetup = true;
                InvalidOperationException failure = null;
                try
                {
                    routine.MoveNext();
                }
                catch (InvalidOperationException error)
                {
                    failure = error;
                }
                finally
                {
                    forceFailureAfterSetup = false;
                }

                Assert.That(failure?.Message, Is.EqualTo("Forced GPU setup failure."));
                Assert.That(seededCamera.aspect, Is.EqualTo(1.2345f));
                Assert.That(seededCamera.targetTexture, Is.SameAs(priorTarget));
                Assert.That(RenderTexture.active, Is.SameAs(priorActive));
                Assert.That(seededSpinner.enabled, Is.False);
                Assert.That(seededLight.enabled, Is.False);
                Assert.That(seededFeature.isActive, Is.False);
                Assert.That(seededMain.activeSelf, Is.False);
                Assert.That(seededSpinner.transform.localRotation, Is.EqualTo(spinnerPose));
                Assert.That(seededLight.transform.localRotation, Is.EqualTo(lightPose));
                Assert.That(File.Exists(Path.Combine(EvidenceDirectory, "render-metrics.json")), Is.True);
            }
            finally
            {
                forceFailureAfterSetup = false;
                RenderTexture.active = null;
                priorTarget.Release();
                priorActive.Release();
                UnityEngine.Object.Destroy(priorTarget);
                UnityEngine.Object.Destroy(priorActive);
            }
        }

        [UnityTest]
        public IEnumerator GlassLab_RendersLiveSharedBlurAndFailClosedFallbackEvidence()
        {
            Directory.CreateDirectory(EvidenceDirectory);
            string metricsPath = Path.Combine(EvidenceDirectory, "render-metrics.json");
            File.Delete(metricsPath);
            latestResults.Clear();
            List<TangoGpuAcceptanceResult> results = latestResults;
            Camera camera = null; TangoSpinner spinner = null; TangoLightOrbit lightOrbit = null;
            TangoGlassRendererFeature feature = null; GameObject mainGlass = null; GameObject independentGlass = null;
            GameObject onGlassButton = null; GameObject frameShadowCaster = null; Renderer labelRenderer = null;
            RenderTexture target = null; RenderTexture previousTarget = null; RenderTexture previousActive = RenderTexture.active;
            float previousAspect = 0f; bool featureWasActive = false; ShadowCastingMode originalShadowMode = default;
            bool mainGlassEnabled = false, independentGlassEnabled = false, buttonEnabled = false, labelRendererEnabled = false;
            bool spinnerEnabled = false, lightOrbitEnabled = false; Quaternion spinnerRotation = default, lightRotation = default;

            try
            {
                SceneManager.LoadScene("TangoGlassLab", LoadSceneMode.Single);
                yield return null;
                camera = UnityEngine.Object.FindFirstObjectByType<Camera>();
                TangoVerificationMarkers markers = UnityEngine.Object.FindFirstObjectByType<TangoVerificationMarkers>();
                spinner = UnityEngine.Object.FindFirstObjectByType<TangoSpinner>();
                lightOrbit = UnityEngine.Object.FindFirstObjectByType<TangoLightOrbit>();
                feature = Resources.FindObjectsOfTypeAll<TangoGlassRendererFeature>().FirstOrDefault(candidate => candidate != null && candidate.name == "TangoGlassRendererFeature");
                mainGlass = FindSceneObject("Glass Face"); independentGlass = FindSceneObject("Independent Glass Pane");
                onGlassButton = FindSceneObject("On Glass Button"); frameShadowCaster = FindSceneObject("Frame Bottom Rail");
                GameObject primaryLabel = FindSceneObject("Primary Label");
                Assert.That(camera, Is.Not.Null); Assert.That(markers, Is.Not.Null); Assert.That(spinner, Is.Not.Null); Assert.That(lightOrbit, Is.Not.Null);
                Assert.That(feature, Is.Not.Null); Assert.That(mainGlass, Is.Not.Null); Assert.That(independentGlass, Is.Not.Null);
                Assert.That(onGlassButton, Is.Not.Null); Assert.That(frameShadowCaster, Is.Not.Null); Assert.That(primaryLabel, Is.Not.Null);
                previousTarget = camera.targetTexture; previousAspect = camera.aspect; featureWasActive = feature.isActive;
                originalShadowMode = frameShadowCaster.GetComponent<Renderer>().shadowCastingMode;
                mainGlassEnabled = mainGlass.activeSelf; independentGlassEnabled = independentGlass.activeSelf; buttonEnabled = onGlassButton.activeSelf;
                labelRenderer = primaryLabel.GetComponent<Renderer>(); labelRendererEnabled = labelRenderer.enabled;
                spinnerEnabled = spinner.enabled; lightOrbitEnabled = lightOrbit.enabled; spinnerRotation = spinner.transform.localRotation; lightRotation = lightOrbit.transform.localRotation;
                target = new RenderTexture(CaptureWidth, CaptureHeight, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB)
                { name = "Tango MVP GPU Acceptance", antiAliasing = 1, useMipMap = false, autoGenerateMips = false };
                spinner.enabled = false; lightOrbit.enabled = false; camera.targetTexture = target; camera.aspect = (float)CaptureWidth / CaptureHeight; target.Create();
                if (forceFailureAfterSetup) throw new InvalidOperationException("Forced GPU setup failure.");
                string graphicsApi = SystemInfo.graphicsDeviceType.ToString(); string deviceName = SystemInfo.graphicsDeviceName;
                RectInt liveA = Region(markers, camera, TangoVerificationRegion.LiveGlassA); RectInt liveB = Region(markers, camera, TangoVerificationRegion.LiveGlassB);
                RectInt uncovered = Region(markers, camera, TangoVerificationRegion.UncoveredPattern); RectInt button = Region(markers, camera, TangoVerificationRegion.OnGlassButton);
                RectInt bevel = Region(markers, camera, TangoVerificationRegion.SolidBevel); RectInt receiver = Region(markers, camera, TangoVerificationRegion.FrameShadowReceiver);
                RectInt label = Region(markers, camera, TangoVerificationRegion.PrimaryLabel);
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

                RecordFacts(results, baselineFacts, "bothPanesEnabled", graphicsApi, deviceName);

                spinner.SetPhase(0.29f);
                mainGlass.SetActive(false);
                Color32[] mainPaneDisabled = Capture(camera, target, "main-pane-disabled");
                RecordFacts(results, RequireFacts(camera), "mainPaneDisabled", graphicsApi, deviceName);
                mainGlass.SetActive(true);
                Record(results, TangoGpuAcceptance.SurfaceContribution + ".LiveGlassA",
                    TangoImageMetrics.MeanAbsoluteRgbDifference(spinnerB, mainPaneDisabled, CaptureWidth, CaptureHeight, liveA),
                    TangoComparison.GreaterThanOrEqual, 0.02f, "glass=enabled", "glass=disabled", graphicsApi, deviceName);

                spinner.SetPhase(0.29f);
                independentGlass.SetActive(false);
                Color32[] independentPaneDisabled = Capture(camera, target, "independent-pane-disabled");
                RecordFacts(results, RequireFacts(camera), "independentPaneDisabled", graphicsApi, deviceName);
                independentGlass.SetActive(true);
                Record(results, TangoGpuAcceptance.SurfaceContribution + ".LiveGlassB",
                    TangoImageMetrics.MeanAbsoluteRgbDifference(spinnerB, independentPaneDisabled, CaptureWidth, CaptureHeight, liveB),
                    TangoComparison.GreaterThanOrEqual, 0.02f, "glass=enabled", "glass=disabled", graphicsApi, deviceName);

                float uncoveredEnergy = TangoImageMetrics.LuminanceGradientPeak(
                    independentPaneDisabled,
                    CaptureWidth,
                    CaptureHeight,
                    liveB);
                if (uncoveredEnergy <= 0f)
                {
                    throw new InvalidOperationException("Glass-disabled reference produced zero edge energy.");
                }

                float blurRatio = TangoImageMetrics.LuminanceGradientPeak(
                    spinnerB,
                    CaptureWidth,
                    CaptureHeight,
                    liveB) / uncoveredEnergy;
                Record(results, TangoGpuAcceptance.BlurEdgeEnergyRatioMaximum, blurRatio,
                    TangoComparison.LessThanOrEqual, 0.65f, "glass=enabled", "glass=disabled", graphicsApi, deviceName);
                Record(results, TangoGpuAcceptance.BlurEdgeEnergyRatioMinimum, blurRatio,
                    TangoComparison.GreaterThanOrEqual, 0.005f, "glass=enabled", "glass=disabled", graphicsApi, deviceName);

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
                if (feature != null) feature.SetActive(featureWasActive);
                if (frameShadowCaster != null) frameShadowCaster.GetComponent<Renderer>().shadowCastingMode = originalShadowMode;
                if (mainGlass != null) mainGlass.SetActive(mainGlassEnabled); if (independentGlass != null) independentGlass.SetActive(independentGlassEnabled);
                if (onGlassButton != null) onGlassButton.SetActive(buttonEnabled); if (labelRenderer != null) labelRenderer.enabled = labelRendererEnabled;
                if (spinner != null) { spinner.enabled = spinnerEnabled; spinner.transform.localRotation = spinnerRotation; }
                if (lightOrbit != null) { lightOrbit.enabled = lightOrbitEnabled; lightOrbit.transform.localRotation = lightRotation; }
                if (camera != null) { camera.targetTexture = previousTarget; camera.aspect = previousAspect; }
                RenderTexture.active = previousActive;
                if (target != null) { target.Release(); UnityEngine.Object.Destroy(target); }
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

        private static GameObject FindSceneObject(string name)
        {
            return Resources.FindObjectsOfTypeAll<GameObject>()
                .FirstOrDefault(candidate => candidate.scene.IsValid() && candidate.name == name);
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

        private static void AssertVector(Vector3 actual, Vector3 expected)
        {
            Assert.That(actual.x, Is.EqualTo(expected.x).Within(0.0001f));
            Assert.That(actual.y, Is.EqualTo(expected.y).Within(0.0001f));
            Assert.That(actual.z, Is.EqualTo(expected.z).Within(0.0001f));
        }
    }
}
