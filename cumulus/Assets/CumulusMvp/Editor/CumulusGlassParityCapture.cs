using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using CumulusMvp.Rendering;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace CumulusMvp.Editor
{
    /// <summary>
    /// Captures the deterministic bare/glass matrix consumed by the web-to-Unity
    /// parity comparator.
    /// </summary>
    public static class CumulusGlassParityCapture
    {
        private const int CaptureWidth = 512;
        private const int CaptureHeight = 288;
        private const int EdgePanelWidth = 320;
        private const int EdgePanelHeight = 176;
        private const string ScenePath = "Assets/Scenes/CumulusGlassLab.unity";
        private const string SceneGlassPath =
            "Assets/CumulusMvp/Materials/CumulusSceneGlass.mat";

        public static void CaptureBatch()
        {
            CumulusGlassLabBuilder.Rebuild();
            Scene scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            Camera camera = scene.GetRootGameObjects()
                .SelectMany(root => root.GetComponentsInChildren<Camera>(true))
                .Single();
            CumulusGlassRendererFeature feature =
                Resources.FindObjectsOfTypeAll<CumulusGlassRendererFeature>()
                    .FirstOrDefault(candidate =>
                        candidate != null &&
                        candidate.name == "CumulusGlassRendererFeature");
            Material sceneGlass = AssetDatabase.LoadAssetAtPath<Material>(SceneGlassPath);
            if (feature == null || sceneGlass == null)
            {
                throw new InvalidOperationException(
                    "Glass parity capture requires the renderer feature and scene-glass material.");
            }
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null)
            {
                throw new InvalidOperationException(
                    "Glass parity capture requires a graphics-capable Unity process.");
            }

            string evidenceDirectory = Path.GetFullPath("Artifacts/GlassParity/unity");
            Directory.CreateDirectory(evidenceDirectory);
            foreach (string staleCapture in Directory.GetFiles(evidenceDirectory, "*.png"))
            {
                File.Delete(staleCapture);
            }

            var rendererStates = new Dictionary<Renderer, bool>();
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
                foreach (Renderer renderer in scene.GetRootGameObjects()
                    .SelectMany(root => root.GetComponentsInChildren<Renderer>(true)))
                {
                    rendererStates.Add(renderer, renderer.enabled);
                    renderer.enabled = false;
                }

                backgroundMaterial = new Material(
                    RequireShader("Universal Render Pipeline/Unlit"))
                {
                    name = "Cumulus Parity Background Material",
                };
                background = GameObject.CreatePrimitive(PrimitiveType.Quad);
                background.name = "Cumulus Parity Background";
                UnityEngine.Object.DestroyImmediate(background.GetComponent<Collider>());
                background.transform.SetPositionAndRotation(
                    new Vector3(0f, 0f, 2f),
                    Quaternion.identity);
                background.transform.localScale = new Vector3(160f / 9f, 10f, 1f);
                background.GetComponent<Renderer>().sharedMaterial = backgroundMaterial;

                glass = GameObject.CreatePrimitive(PrimitiveType.Quad);
                glass.name = "Cumulus Parity Glass";
                UnityEngine.Object.DestroyImmediate(glass.GetComponent<Collider>());
                glass.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
                glass.transform.localScale = new Vector3(160f / 9f, 10f, 1f);
                glass.GetComponent<Renderer>().sharedMaterial = sceneGlass;

                target = new RenderTexture(
                    CaptureWidth,
                    CaptureHeight,
                    24,
                    RenderTextureFormat.ARGB32,
                    RenderTextureReadWrite.sRGB)
                {
                    name = "Cumulus Glass Parity Capture",
                    antiAliasing = 1,
                    useMipMap = false,
                    autoGenerateMips = false,
                };
                camera.targetTexture = target;
                camera.aspect = (float)CaptureWidth / CaptureHeight;
                target.Create();
                feature.SetActive(true);

                Texture2D[] backgrounds = Resources.LoadAll<Texture2D>(
                        "CumulusParityBackgrounds")
                    .OrderBy(texture => texture.name, StringComparer.Ordinal)
                    .ToArray();
                if (backgrounds.Length < 2)
                {
                    throw new InvalidOperationException(
                        "Glass parity capture requires at least two backgrounds.");
                }

                foreach (Texture2D texture in backgrounds)
                {
                    backgroundMaterial.mainTexture = texture;
                    bool edgeScenario = texture.name == "edge-neutral";
                    glass.transform.localScale = edgeScenario
                        ? new Vector3(
                            (160f / 9f) * EdgePanelWidth / CaptureWidth,
                            10f * EdgePanelHeight / CaptureHeight,
                            1f)
                        : new Vector3(160f / 9f, 10f, 1f);
                    glass.SetActive(false);
                    Capture(camera, target, evidenceDirectory, texture.name + "-bare");
                    glass.SetActive(true);
                    Capture(camera, target, evidenceDirectory, texture.name + "-glass");
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
                if (glass != null)
                {
                    UnityEngine.Object.DestroyImmediate(glass);
                }
                if (background != null)
                {
                    UnityEngine.Object.DestroyImmediate(background);
                }
                if (backgroundMaterial != null)
                {
                    UnityEngine.Object.DestroyImmediate(backgroundMaterial);
                }
                foreach (KeyValuePair<Renderer, bool> state in rendererStates)
                {
                    if (state.Key != null)
                    {
                        state.Key.enabled = state.Value;
                    }
                }
            }
        }

        private static Shader RequireShader(string name)
        {
            Shader shader = Shader.Find(name);
            return shader != null
                ? shader
                : throw new InvalidOperationException(
                    "Required shader is unavailable: " + name);
        }

        private static void Capture(
            Camera camera,
            RenderTexture target,
            string directory,
            string name)
        {
            camera.Render();
            RenderTexture previous = RenderTexture.active;
            var texture = new Texture2D(
                CaptureWidth,
                CaptureHeight,
                TextureFormat.RGBA32,
                false,
                false);
            try
            {
                RenderTexture.active = target;
                texture.ReadPixels(
                    new Rect(0f, 0f, CaptureWidth, CaptureHeight),
                    0,
                    0,
                    false);
                texture.Apply(false, false);
                File.WriteAllBytes(
                    Path.Combine(directory, name + ".png"),
                    texture.EncodeToPNG());
            }
            finally
            {
                RenderTexture.active = previous;
                UnityEngine.Object.DestroyImmediate(texture);
            }
        }
    }
}
