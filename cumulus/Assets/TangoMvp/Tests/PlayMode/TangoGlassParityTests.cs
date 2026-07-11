using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using TangoMvp.Rendering;
using TangoMvp.Tests.Support;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace TangoMvp.Tests.PlayMode
{
    public sealed class TangoGlassParityTests
    {
        private const int CaptureWidth = 512;
        private const int CaptureHeight = 288;
        private static readonly string EvidenceDirectory = Path.GetFullPath("Artifacts/GlassParity/unity");
        [UnityTest]
        public IEnumerator SharedBackgroundMatrix_CapturesBareAndSceneGlassFrames()
        {
            Directory.CreateDirectory(EvidenceDirectory);
            foreach (string staleCapture in Directory.GetFiles(EvidenceDirectory, "*.png"))
            {
                File.Delete(staleCapture);
            }
            SceneManager.LoadScene("TangoGlassLab", LoadSceneMode.Single);
            yield return null;

            Camera camera = UnityEngine.Object.FindFirstObjectByType<Camera>();
            TangoGlassRendererFeature feature = Resources.FindObjectsOfTypeAll<TangoGlassRendererFeature>()
                .FirstOrDefault(candidate => candidate != null && candidate.name == "TangoGlassRendererFeature");
            Material sceneGlass = Resources.FindObjectsOfTypeAll<Material>()
                .FirstOrDefault(candidate => candidate != null && candidate.name == "TangoSceneGlass");
            Assert.That(camera, Is.Not.Null);
            Assert.That(feature, Is.Not.Null);
            Assert.That(sceneGlass, Is.Not.Null);
            Assert.That(SystemInfo.graphicsDeviceType, Is.Not.EqualTo(GraphicsDeviceType.Null));

            var originalRendererStates = new Dictionary<Renderer, bool>();
            RenderTexture originalTarget = camera.targetTexture;
            float originalAspect = camera.aspect;
            bool featureWasActive = feature.isActive;
            RenderTexture previousActive = RenderTexture.active;
            RenderTexture target = null;
            Material backgroundMaterial = null;
            GameObject background = null;
            GameObject glass = null;
            try
            {
                foreach (Renderer renderer in UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None))
                {
                    originalRendererStates.Add(renderer, renderer.enabled);
                    renderer.enabled = false;
                }

                backgroundMaterial = new Material(RequireShader("Universal Render Pipeline/Unlit"));
                backgroundMaterial.name = "Tango Parity Background Material";
                background = GameObject.CreatePrimitive(PrimitiveType.Quad);
                background.name = "Tango Parity Background";
                UnityEngine.Object.DestroyImmediate(background.GetComponent<Collider>());
                background.transform.SetPositionAndRotation(new Vector3(0f, 0f, 2f), Quaternion.identity);
                background.transform.localScale = new Vector3(160f / 9f, 10f, 1f);
                background.GetComponent<Renderer>().sharedMaterial = backgroundMaterial;

                glass = GameObject.CreatePrimitive(PrimitiveType.Quad);
                glass.name = "Tango Parity Glass";
                UnityEngine.Object.DestroyImmediate(glass.GetComponent<Collider>());
                glass.transform.SetPositionAndRotation(new Vector3(0f, 0f, 0f), Quaternion.identity);
                glass.transform.localScale = new Vector3(160f / 9f, 10f, 1f);
                glass.GetComponent<Renderer>().sharedMaterial = sceneGlass;

                camera.targetTexture = target = new RenderTexture(
                    CaptureWidth,
                    CaptureHeight,
                    24,
                    RenderTextureFormat.ARGB32,
                    RenderTextureReadWrite.sRGB)
                {
                    name = "Tango Glass Parity Capture",
                    antiAliasing = 1,
                    useMipMap = false,
                    autoGenerateMips = false,
                };
                camera.aspect = (float)CaptureWidth / CaptureHeight;
                target.Create();
                feature.SetActive(true);

                Texture2D[] backgrounds = Resources.LoadAll<Texture2D>("TangoParityBackgrounds")
                    .OrderBy(texture => texture.name, StringComparer.Ordinal)
                    .ToArray();
                Assert.That(backgrounds.Length, Is.GreaterThanOrEqualTo(2));
                foreach (Texture2D texture in backgrounds)
                {
                    backgroundMaterial.mainTexture = texture;
                    glass.SetActive(false);
                    Capture(camera, target, texture.name + "-bare");
                    glass.SetActive(true);
                    Capture(camera, target, texture.name + "-glass");
                }
            }
            finally
            {
                feature.SetActive(featureWasActive);
                camera.targetTexture = originalTarget;
                camera.aspect = originalAspect;
                RenderTexture.active = previousActive;
                if (target != null)
                {
                    target.Release();
                    UnityEngine.Object.DestroyImmediate(target);
                }
                if (glass != null) UnityEngine.Object.DestroyImmediate(glass);
                if (background != null) UnityEngine.Object.DestroyImmediate(background);
                if (backgroundMaterial != null) UnityEngine.Object.DestroyImmediate(backgroundMaterial);
                foreach (KeyValuePair<Renderer, bool> state in originalRendererStates)
                {
                    if (state.Key != null) state.Key.enabled = state.Value;
                }
            }
        }

        private static Shader RequireShader(string name)
        {
            Shader shader = Shader.Find(name);
            if (shader == null) throw new InvalidOperationException("Required shader is unavailable: " + name);
            return shader;
        }

        private static void Capture(Camera camera, RenderTexture target, string name)
        {
            camera.Render();
            RenderTexture previous = RenderTexture.active;
            var texture = new Texture2D(CaptureWidth, CaptureHeight, TextureFormat.RGBA32, false, false);
            try
            {
                RenderTexture.active = target;
                texture.ReadPixels(new Rect(0f, 0f, CaptureWidth, CaptureHeight), 0, 0, false);
                texture.Apply(false, false);
                File.WriteAllBytes(
                    Path.Combine(EvidenceDirectory, name + ".png"),
                    TangoImageMetrics.EncodeRegionPng(
                        texture.GetPixels32(),
                        CaptureWidth,
                        CaptureHeight,
                        new RectInt(0, 0, CaptureWidth, CaptureHeight)));
            }
            finally
            {
                RenderTexture.active = previous;
                UnityEngine.Object.DestroyImmediate(texture);
            }
        }
    }
}
