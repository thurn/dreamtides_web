using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using CumulusMvp.Demo;
using CumulusMvp.Diagnostics;
using CumulusMvp.Interaction;
using CumulusMvp.Motion;
using CumulusMvp.Rendering;
using CumulusMvp.Tests.Support;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace CumulusMvp.Tests.PlayMode
{
    public sealed class CumulusGlassGpuTests : InputTestFixture
    {
        private const int CaptureWidth = 512;
        private const int CaptureHeight = 288;
        private static readonly string EvidenceDirectory = Path.GetFullPath("Artifacts/CumulusMvpVerification");
        private readonly List<CumulusGpuAcceptanceResult> latestResults = new List<CumulusGpuAcceptanceResult>();
        private static bool forceFailureAfterSetup;

        [UnityTest]
        public IEnumerator Fallback_RealSceneButtonSupportsHoverPressCancelAndTravelActivation()
        {
            Mouse mouse = null;
            CumulusGlassRendererFeature feature = null;
            CumulusPointerInteractor interactor = null;
            CumulusPressable pressable = null;
            CumulusPanelTravel travel = null;
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
                SceneManager.LoadScene("CumulusGlassLab", LoadSceneMode.Single);
                yield return null;

                Camera camera = UnityEngine.Object.FindFirstObjectByType<Camera>();
                Assert.That(camera, Is.Not.Null);
                feature = Resources.FindObjectsOfTypeAll<CumulusGlassRendererFeature>()
                    .FirstOrDefault(candidate => candidate != null && candidate.name == "CumulusGlassRendererFeature");
                interactor = camera.GetComponent<CumulusPointerInteractor>();
                pressable = UnityEngine.Object.FindFirstObjectByType<CumulusPressable>();
                travel = UnityEngine.Object.FindFirstObjectByType<CumulusPanelTravel>();
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
                AssertVector(visual.localScale, restingVisualScale * CumulusPressable.HoverScaleFactor);

                Press(mouse.leftButton);
                yield return null;
                AssertVector(visual.localScale, restingVisualScale * CumulusPressable.PressScaleFactor);
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
                LogAssert.Expect(LogType.Log, "CumulusPressable activated: glass-panel-travel");
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

            CumulusGlassDiagnostics.Reset();
            string metricsPath = Path.Combine(EvidenceDirectory, "render-metrics.json");
            if (!File.Exists(metricsPath))
            {
                Directory.CreateDirectory(EvidenceDirectory);
                File.WriteAllText(metricsPath, CumulusGpuAcceptance.Serialize(latestResults));
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
                CumulusSpinner seededSpinner = UnityEngine.Object.FindFirstObjectByType<CumulusSpinner>();
                CumulusLightOrbit seededLight = UnityEngine.Object.FindObjectsByType<CumulusLightOrbit>(
                        FindObjectsInactive.Include,
                        FindObjectsSortMode.None)
                    .Single(candidate => candidate.GetComponent<Light>().type == LightType.Directional);
                CumulusGlassRendererFeature seededFeature = Resources.FindObjectsOfTypeAll<CumulusGlassRendererFeature>()
                    .First(candidate => candidate.name == "CumulusGlassRendererFeature");
                GameObject seededMain = GameObject.Find("Cumulus Glass Panel/Glass Face");
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
        public IEnumerator GlassLab_MovingPointLightChangesPositionAndColorOnGlass()
        {
            SceneManager.LoadScene("CumulusGlassLab", LoadSceneMode.Single);
            yield return null;
            Camera camera = UnityEngine.Object.FindFirstObjectByType<Camera>();
            CumulusVerificationMarkers markers = UnityEngine.Object.FindFirstObjectByType<CumulusVerificationMarkers>();
            CumulusLightOrbit[] orbits = UnityEngine.Object.FindObjectsByType<CumulusLightOrbit>(
                FindObjectsInactive.Include,
                FindObjectsSortMode.None);
            CumulusLightOrbit pointOrbit = orbits.Single(candidate => candidate.GetComponent<Light>().type == LightType.Point);
            CumulusLightOrbit directionalOrbit = orbits.Single(candidate => candidate.GetComponent<Light>().type == LightType.Directional);
            Light pointLight = pointOrbit.GetComponent<Light>();
            Light directionalLight = directionalOrbit.GetComponent<Light>();
            CumulusGlassRendererFeature feature = Resources.FindObjectsOfTypeAll<CumulusGlassRendererFeature>()
                .First(candidate => candidate != null && candidate.name == "CumulusGlassRendererFeature");
            RenderTexture previousTarget = camera.targetTexture;
            RenderTexture previousActive = RenderTexture.active;
            bool pointEnabled = pointLight.enabled;
            bool directionalEnabled = directionalLight.enabled;
            bool pointOrbitEnabled = pointOrbit.enabled;
            bool directionalOrbitEnabled = directionalOrbit.enabled;
            bool featureActive = feature.isActive;
            Vector3 pointPosition = pointOrbit.transform.localPosition;
            var target = new RenderTexture(
                CaptureWidth,
                CaptureHeight,
                24,
                RenderTextureFormat.ARGB32,
                RenderTextureReadWrite.sRGB);
            try
            {
                camera.targetTexture = target;
                target.Create();
                feature.SetActive(true);
                pointOrbit.enabled = false;
                directionalOrbit.enabled = false;
                directionalLight.enabled = false;
                RectInt region = Region(markers, camera, CumulusVerificationRegion.LiveGlassB);

                pointLight.enabled = false;
                Color32[] baseline = Capture(camera, target, "point-baseline", false);
                pointLight.enabled = true;
                pointOrbit.SetPhase(0f);
                Color32[] phaseA = Capture(camera, target, "point-phase-a", false);
                pointOrbit.SetPhase(0.5f);
                Color32[] phaseB = Capture(camera, target, "point-phase-b", false);

                Assert.That(
                    CumulusImageMetrics.MeanAbsoluteRgbDifference(
                        baseline,
                        phaseA,
                        CaptureWidth,
                        CaptureHeight,
                        region),
                    Is.GreaterThanOrEqualTo(0.002f));
                Assert.That(
                    CumulusImageMetrics.MeanAbsoluteRgbDifference(
                        phaseA,
                        phaseB,
                        CaptureWidth,
                        CaptureHeight,
                        region),
                    Is.GreaterThanOrEqualTo(0.001f));

                Vector3 channelDelta = MeanPositiveChannelDelta(baseline, phaseA, region);
                Assert.That(channelDelta.z, Is.GreaterThan(channelDelta.x * 1.05f));

            }
            finally
            {
                feature.SetActive(featureActive);
                pointLight.enabled = pointEnabled;
                directionalLight.enabled = directionalEnabled;
                pointOrbit.enabled = pointOrbitEnabled;
                directionalOrbit.enabled = directionalOrbitEnabled;
                pointOrbit.transform.localPosition = pointPosition;
                camera.targetTexture = previousTarget;
                RenderTexture.active = previousActive;
                target.Release();
                UnityEngine.Object.Destroy(target);
            }
        }

        [UnityTest]
        public IEnumerator GlassLab_RendersLiveSharedBlurAndFailClosedFallbackEvidence()
        {
            Directory.CreateDirectory(EvidenceDirectory);
            string metricsPath = Path.Combine(EvidenceDirectory, "render-metrics.json");
            File.Delete(metricsPath);
            latestResults.Clear();
            List<CumulusGpuAcceptanceResult> results = latestResults;
            Camera camera = null; CumulusSpinner spinner = null; CumulusLightOrbit lightOrbit = null;
            CumulusLightOrbit pointOrbit = null; Light pointLight = null;
            CumulusGlassRendererFeature feature = null; GameObject mainGlass = null; GameObject independentGlass = null;
            GameObject onGlassButton = null;
            RenderTexture target = null; RenderTexture previousTarget = null; RenderTexture previousActive = RenderTexture.active;
            float previousAspect = 0f; bool featureWasActive = false;
            bool mainGlassEnabled = false, independentGlassEnabled = false, buttonEnabled = false;
            bool spinnerEnabled = false, lightOrbitEnabled = false, pointOrbitEnabled = false, pointLightEnabled = false;
            Quaternion spinnerRotation = default, lightRotation = default;
            Vector3 pointPosition = default;

            try
            {
                SceneManager.LoadScene("CumulusGlassLab", LoadSceneMode.Single);
                yield return null;
                camera = UnityEngine.Object.FindFirstObjectByType<Camera>();
                CumulusVerificationMarkers markers = UnityEngine.Object.FindFirstObjectByType<CumulusVerificationMarkers>();
                spinner = UnityEngine.Object.FindFirstObjectByType<CumulusSpinner>();
                lightOrbit = UnityEngine.Object.FindObjectsByType<CumulusLightOrbit>(
                        FindObjectsInactive.Include,
                        FindObjectsSortMode.None)
                    .Single(candidate => candidate.GetComponent<Light>().type == LightType.Directional);
                pointOrbit = UnityEngine.Object.FindObjectsByType<CumulusLightOrbit>(
                        FindObjectsInactive.Include,
                        FindObjectsSortMode.None)
                    .Single(candidate => candidate.GetComponent<Light>().type == LightType.Point);
                pointLight = pointOrbit.GetComponent<Light>();
                feature = Resources.FindObjectsOfTypeAll<CumulusGlassRendererFeature>().FirstOrDefault(candidate => candidate != null && candidate.name == "CumulusGlassRendererFeature");
                mainGlass = FindSceneObject("Glass Face"); independentGlass = FindSceneObject("Independent Glass Pane");
                onGlassButton = FindSceneObject("On Glass Button");
                Assert.That(camera, Is.Not.Null); Assert.That(markers, Is.Not.Null); Assert.That(spinner, Is.Not.Null); Assert.That(lightOrbit, Is.Not.Null);
                Assert.That(feature, Is.Not.Null); Assert.That(mainGlass, Is.Not.Null); Assert.That(independentGlass, Is.Not.Null);
                Assert.That(onGlassButton, Is.Not.Null);
                previousTarget = camera.targetTexture; previousAspect = camera.aspect; featureWasActive = feature.isActive;
                mainGlassEnabled = mainGlass.activeSelf; independentGlassEnabled = independentGlass.activeSelf; buttonEnabled = onGlassButton.activeSelf;
                spinnerEnabled = spinner.enabled; lightOrbitEnabled = lightOrbit.enabled; spinnerRotation = spinner.transform.localRotation; lightRotation = lightOrbit.transform.localRotation;
                pointOrbitEnabled = pointOrbit.enabled; pointLightEnabled = pointLight.enabled; pointPosition = pointOrbit.transform.localPosition;
                target = new RenderTexture(CaptureWidth, CaptureHeight, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB)
                { name = "Cumulus MVP GPU Acceptance", antiAliasing = 1, useMipMap = false, autoGenerateMips = false };
                spinner.enabled = false; lightOrbit.enabled = false; pointOrbit.enabled = false; pointLight.enabled = false; camera.targetTexture = target; camera.aspect = (float)CaptureWidth / CaptureHeight; target.Create();
                if (forceFailureAfterSetup) throw new InvalidOperationException("Forced GPU setup failure.");
                string graphicsApi = SystemInfo.graphicsDeviceType.ToString(); string deviceName = SystemInfo.graphicsDeviceName;
                RectInt liveA = Region(markers, camera, CumulusVerificationRegion.LiveGlassA); RectInt liveB = Region(markers, camera, CumulusVerificationRegion.LiveGlassB);
                RectInt uncovered = Region(markers, camera, CumulusVerificationRegion.UncoveredPattern); RectInt button = Region(markers, camera, CumulusVerificationRegion.OnGlassButton);
                feature.SetActive(true);
                lightOrbit.SetPhase(0f);
                spinner.SetPhase(0.04f);
                Color32[] spinnerA = Capture(camera, target, "spinner-a");
                CumulusGlassFrameFacts baselineFacts = RequireFacts(camera);
                spinner.SetPhase(0.29f);
                Color32[] spinnerB = Capture(camera, target, "spinner-b");
                spinner.SetPhase(0.70f);
                Color32[] spinnerC = Capture(camera, target, "spinner-c");

                Record(results, CumulusGpuAcceptance.LiveBackdropDelta + ".LiveGlassA",
                    CumulusImageMetrics.MeanAbsoluteRgbDifference(spinnerA, spinnerC, CaptureWidth, CaptureHeight, liveA),
                    CumulusComparison.GreaterThanOrEqual, 0.015f, "spinner=0.04", "spinner=0.70", graphicsApi, deviceName);
                Record(results, CumulusGpuAcceptance.LiveBackdropDelta + ".LiveGlassB",
                    CumulusImageMetrics.MeanAbsoluteRgbDifference(spinnerA, spinnerC, CaptureWidth, CaptureHeight, liveB),
                    CumulusComparison.GreaterThanOrEqual, 0.015f, "spinner=0.04", "spinner=0.70", graphicsApi, deviceName);

                RecordFacts(results, baselineFacts, "bothPanesEnabled", graphicsApi, deviceName);

                spinner.SetPhase(0.29f);
                mainGlass.SetActive(false);
                Color32[] mainPaneDisabled = Capture(camera, target, "main-pane-disabled");
                RecordFacts(results, RequireFacts(camera), "mainPaneDisabled", graphicsApi, deviceName);
                mainGlass.SetActive(true);
                Record(results, CumulusGpuAcceptance.SurfaceContribution + ".LiveGlassA",
                    CumulusImageMetrics.MeanAbsoluteRgbDifference(spinnerB, mainPaneDisabled, CaptureWidth, CaptureHeight, liveA),
                    CumulusComparison.GreaterThanOrEqual, 0.02f, "glass=enabled", "glass=disabled", graphicsApi, deviceName);

                spinner.SetPhase(0.29f);
                independentGlass.SetActive(false);
                Color32[] independentPaneDisabled = Capture(camera, target, "independent-pane-disabled");
                RecordFacts(results, RequireFacts(camera), "independentPaneDisabled", graphicsApi, deviceName);
                independentGlass.SetActive(true);
                Record(results, CumulusGpuAcceptance.SurfaceContribution + ".LiveGlassB",
                    CumulusImageMetrics.MeanAbsoluteRgbDifference(spinnerB, independentPaneDisabled, CaptureWidth, CaptureHeight, liveB),
                    CumulusComparison.GreaterThanOrEqual, 0.02f, "glass=enabled", "glass=disabled", graphicsApi, deviceName);

                float uncoveredEnergy = CumulusImageMetrics.LuminanceGradientPeak(
                    independentPaneDisabled,
                    CaptureWidth,
                    CaptureHeight,
                    liveB);
                if (uncoveredEnergy <= 0f)
                {
                    throw new InvalidOperationException("Glass-disabled reference produced zero edge energy.");
                }

                float blurRatio = CumulusImageMetrics.LuminanceGradientPeak(
                    spinnerB,
                    CaptureWidth,
                    CaptureHeight,
                    liveB) / uncoveredEnergy;
                Record(results, CumulusGpuAcceptance.BlurEdgeEnergyRatioMaximum, blurRatio,
                    CumulusComparison.LessThanOrEqual, 0.65f, "glass=enabled", "glass=disabled", graphicsApi, deviceName);
                Record(results, CumulusGpuAcceptance.BlurEdgeEnergyRatioMinimum, blurRatio,
                    CumulusComparison.GreaterThanOrEqual, 0.005f, "glass=enabled", "glass=disabled", graphicsApi, deviceName);

                onGlassButton.SetActive(false);
                spinner.SetPhase(0.04f);
                Color32[] parentA = Capture(camera, target, "button-parent-a");
                CumulusGlassFrameFacts buttonDisabledFacts = RequireFacts(camera);
                RecordFacts(results, buttonDisabledFacts, "onGlassButtonDisabled", graphicsApi, deviceName);
                spinner.SetPhase(0.29f);
                Color32[] parentB = Capture(camera, target, "button-parent-b");
                Record(results, CumulusGpuAcceptance.OnGlassAdditionalPasses,
                    Math.Abs(buttonDisabledFacts.DownsamplePassCount - baselineFacts.DownsamplePassCount)
                    + Math.Abs(buttonDisabledFacts.UpsamplePassCount - baselineFacts.UpsamplePassCount),
                    CumulusComparison.Equal, 0f, "buttonEnabled", "buttonDisabled", graphicsApi, deviceName);

                onGlassButton.SetActive(true);
                spinner.SetPhase(0.04f);
                Color32[] buttonA = Capture(camera, target, "button-a");
                spinner.SetPhase(0.29f);
                Color32[] buttonB = Capture(camera, target, "button-b");
                Record(results, CumulusGpuAcceptance.OnGlassBackdropDelta,
                    CumulusImageMetrics.MeanAbsoluteRgbDifference(buttonA, buttonB, CaptureWidth, CaptureHeight, button),
                    CumulusComparison.GreaterThanOrEqual, 0.005f, "spinner=0.04", "spinner=0.29", graphicsApi, deviceName);
                Record(results, CumulusGpuAcceptance.OnGlassBackdropCorrelation,
                    CumulusImageMetrics.LuminanceDeltaCorrelation(buttonA, buttonB, button, parentA, parentB, button, CaptureWidth, CaptureHeight),
                    CumulusComparison.GreaterThanOrEqual, 0.5f, "buttonOverBackdropA", "buttonOverBackdropB", graphicsApi, deviceName);

                spinner.SetPhase(0.04f);
                feature.SetActive(false);
                Color32[] fallback = Capture(camera, target, "fallback");
                float fallbackLuminance = CumulusImageMetrics.MeanLuminance(fallback, CaptureWidth, CaptureHeight, liveA);
                Record(results, CumulusGpuAcceptance.FallbackInteriorLuminanceMinimum, fallbackLuminance,
                    CumulusComparison.GreaterThanOrEqual, 0.02f, "feature=active", "feature=inactive", graphicsApi, deviceName);
                Record(results, CumulusGpuAcceptance.FallbackInteriorLuminanceMaximum, fallbackLuminance,
                    CumulusComparison.LessThanOrEqual, 0.8f, "feature=active", "feature=inactive", graphicsApi, deviceName);
            }
            finally
            {
                if (feature != null) feature.SetActive(featureWasActive);
                if (mainGlass != null) mainGlass.SetActive(mainGlassEnabled); if (independentGlass != null) independentGlass.SetActive(independentGlassEnabled);
                if (onGlassButton != null) onGlassButton.SetActive(buttonEnabled);
                if (spinner != null) { spinner.enabled = spinnerEnabled; spinner.transform.localRotation = spinnerRotation; }
                if (lightOrbit != null) { lightOrbit.enabled = lightOrbitEnabled; lightOrbit.transform.localRotation = lightRotation; }
                if (pointOrbit != null) { pointOrbit.enabled = pointOrbitEnabled; pointOrbit.transform.localPosition = pointPosition; }
                if (pointLight != null) pointLight.enabled = pointLightEnabled;
                if (camera != null) { camera.targetTexture = previousTarget; camera.aspect = previousAspect; }
                RenderTexture.active = previousActive;
                if (target != null) { target.Release(); UnityEngine.Object.Destroy(target); }
                File.WriteAllText(metricsPath, CumulusGpuAcceptance.Serialize(results));
            }

            Assert.That(SystemInfo.graphicsDeviceType, Is.Not.EqualTo(GraphicsDeviceType.Null));
            string failures = string.Join(
                Environment.NewLine,
                results.Where(result => !result.passed).Select(result =>
                    $"{result.metricName}: measured={result.measuredValueText} {result.comparison} {result.threshold}"));
            Assert.That(CumulusGpuAcceptance.AllPassed(results), Is.True, failures);
        }

        private static RectInt Region(CumulusVerificationMarkers markers, Camera camera, CumulusVerificationRegion region)
        {
            return CumulusImageMetrics.ViewportToPixelRegion(markers.GetViewportRegion(region, camera), CaptureWidth, CaptureHeight);
        }

        private static GameObject FindSceneObject(string name)
        {
            return Resources.FindObjectsOfTypeAll<GameObject>()
                .FirstOrDefault(candidate => candidate.scene.IsValid() && candidate.name == name);
        }

        private static Color32[] Capture(Camera camera, RenderTexture target, string name, bool writeEvidence = true)
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
                if (writeEvidence)
                {
                    File.WriteAllBytes(
                        Path.Combine(EvidenceDirectory, name + ".png"),
                        CumulusImageMetrics.EncodeRegionPng(
                            pixels,
                            CaptureWidth,
                            CaptureHeight,
                            new RectInt(0, 0, CaptureWidth, CaptureHeight)));
                }
                return pixels;
            }
            finally
            {
                RenderTexture.active = previous;
                UnityEngine.Object.DestroyImmediate(texture);
            }
        }

        private static Vector3 MeanPositiveChannelDelta(Color32[] baseline, Color32[] lit, RectInt region)
        {
            Vector3 sum = Vector3.zero;
            int count = 0;
            for (int y = region.yMin; y < region.yMax; y++)
            {
                for (int x = region.xMin; x < region.xMax; x++)
                {
                    int index = y * CaptureWidth + x;
                    sum.x += Mathf.Max(0f, lit[index].r - baseline[index].r) / 255f;
                    sum.y += Mathf.Max(0f, lit[index].g - baseline[index].g) / 255f;
                    sum.z += Mathf.Max(0f, lit[index].b - baseline[index].b) / 255f;
                    count++;
                }
            }

            return count > 0 ? sum / count : Vector3.zero;
        }

        private static CumulusGlassFrameFacts RequireFacts(Camera camera)
        {
            int key = CumulusGlassDiagnostics.GetCameraKey(camera);
            if (!CumulusGlassDiagnostics.TryGetFrameFacts(key, Time.frameCount, out CumulusGlassFrameFacts facts))
            {
                throw new InvalidOperationException("No exact-frame Cumulus glass diagnostics were published for the capture camera.");
            }

            return facts;
        }

        private static void RecordFacts(
            List<CumulusGpuAcceptanceResult> results,
            CumulusGlassFrameFacts facts,
            string phase,
            string graphicsApi,
            string deviceName)
        {
            Record(results, CumulusGpuAcceptance.SharedGraphRecords + "." + phase, facts.GraphRecordCount,
                CumulusComparison.Equal, 1f, phase, phase, graphicsApi, deviceName);
            Record(results, CumulusGpuAcceptance.DownsamplePasses + "." + phase, facts.DownsamplePassCount,
                CumulusComparison.Equal, 4f, phase, phase, graphicsApi, deviceName);
            Record(results, CumulusGpuAcceptance.UpsamplePasses + "." + phase, facts.UpsamplePassCount,
                CumulusComparison.Equal, 3f, phase, phase, graphicsApi, deviceName);
        }

        private static void Record(
            List<CumulusGpuAcceptanceResult> results,
            string metric,
            float value,
            CumulusComparison comparison,
            float threshold,
            string phaseA,
            string phaseB,
            string graphicsApi,
            string deviceName)
        {
            results.Add(CumulusGpuAcceptance.Evaluate(
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
