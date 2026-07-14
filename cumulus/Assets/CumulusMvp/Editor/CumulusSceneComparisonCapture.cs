using System;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace CumulusMvp.Editor
{
    /// <summary>Batch capture entry point shared by registered scene comparisons.</summary>
    public static class CumulusSceneComparisonCapture
    {
        public static void CaptureBatch()
        {
            string scenePath = RequireArgument("-comparisonScene");
            string outputPath = RequireArgument("-comparisonOutput");
            int width = RequirePositiveInteger("-comparisonWidth");
            int height = RequirePositiveInteger("-comparisonHeight");
            string rebuildMethod = OptionalArgument("-comparisonRebuildMethod");

            if (!string.IsNullOrEmpty(rebuildMethod))
            {
                InvokeStaticMethod(rebuildMethod);
            }

            Scene scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            Camera camera = scene.GetRootGameObjects()
                .Where(root => root.name == "Main Camera")
                .Select(root => root.GetComponent<Camera>())
                .Single(candidate => candidate != null);
            Capture(camera, width, height, outputPath);
        }

        private static void Capture(Camera camera, int width, int height, string outputPath)
        {
            var target = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32)
            {
                name = "Cumulus Scene Comparison Capture",
                antiAliasing = 1,
            };
            // The Game view presents an opaque backbuffer. RGB readback preserves
            // that displayed frame instead of exporting material alpha written by
            // opaque cutout shaders as transparency in the comparison PNG.
            var output = new Texture2D(width, height, TextureFormat.RGB24, false);
            RenderTexture previousActive = RenderTexture.active;
            RenderTexture previousTarget = camera.targetTexture;
            try
            {
                target.Create();
                camera.targetTexture = target;
                // The first render primes the scene's URP shader variants and
                // render-target bindings before the authoritative frame.
                camera.Render();
                camera.Render();
                RenderTexture.active = target;
                output.ReadPixels(new Rect(0f, 0f, width, height), 0, 0, false);
                output.Apply(false, false);

                string absolutePath = Path.GetFullPath(outputPath);
                Directory.CreateDirectory(Path.GetDirectoryName(absolutePath));
                File.WriteAllBytes(absolutePath, output.EncodeToPNG());
                Debug.Log($"CUMULUS_SCENE_COMPARISON_CAPTURE:{absolutePath}:{width}x{height}");
            }
            finally
            {
                camera.targetTexture = previousTarget;
                RenderTexture.active = previousActive;
                UnityEngine.Object.DestroyImmediate(output);
                target.Release();
                UnityEngine.Object.DestroyImmediate(target);
            }
        }

        private static void InvokeStaticMethod(string qualifiedName)
        {
            int separator = qualifiedName.LastIndexOf('.');
            if (separator <= 0 || separator == qualifiedName.Length - 1)
            {
                throw new ArgumentException($"Invalid rebuild method: {qualifiedName}");
            }

            string typeName = qualifiedName.Substring(0, separator);
            string methodName = qualifiedName.Substring(separator + 1);
            Type type = AppDomain.CurrentDomain.GetAssemblies()
                .Select(assembly => assembly.GetType(typeName, false))
                .FirstOrDefault(candidate => candidate != null);
            MethodInfo method = type?.GetMethod(
                methodName,
                BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                null,
                Type.EmptyTypes,
                null);
            if (method == null)
            {
                throw new MissingMethodException(typeName, methodName);
            }
            method.Invoke(null, null);
        }

        private static int RequirePositiveInteger(string name)
        {
            string raw = RequireArgument(name);
            if (!int.TryParse(raw, out int value) || value <= 0)
            {
                throw new ArgumentException($"{name} must be a positive integer, received '{raw}'.");
            }
            return value;
        }

        private static string RequireArgument(string name)
        {
            return OptionalArgument(name) ?? throw new ArgumentException($"Missing required argument {name}.");
        }

        private static string OptionalArgument(string name)
        {
            string[] arguments = Environment.GetCommandLineArgs();
            int index = Array.IndexOf(arguments, name);
            if (index < 0)
            {
                return null;
            }
            if (index == arguments.Length - 1 || arguments[index + 1].StartsWith("-", StringComparison.Ordinal))
            {
                throw new ArgumentException($"Argument {name} requires a value.");
            }
            return arguments[index + 1];
        }
    }
}
