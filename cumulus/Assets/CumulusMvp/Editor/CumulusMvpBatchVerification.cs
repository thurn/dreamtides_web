using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.Rendering;

namespace CumulusMvp.Editor
{
    public static class CumulusMvpBatchVerification
    {
        private const string ArtifactRelativePath = "Artifacts/CumulusMvpVerification";
        private const string PlayerRelativePath = "Builds/CumulusMvpVerification/CumulusCumulusMvp.app";

        public static void InspectShadersAndBuildPlayer()
        {
            string projectRoot = Directory.GetParent(Application.dataPath).FullName;
            string artifactDirectory = Path.Combine(projectRoot, ArtifactRelativePath);
            Directory.CreateDirectory(artifactDirectory);

            string[] shaderNames =
            {
                "CumulusMvp/SceneGlass",
                "CumulusMvp/OnGlass",
                "CumulusMvp/Dreamsign",
                "Hidden/CumulusMvp/SeparableBlur",
            };
            var shaderRecords = new List<ShaderRecord>(shaderNames.Length);
            int errorCount = 0;
            foreach (string shaderName in shaderNames)
            {
                Shader shader = Shader.Find(shaderName);
                var record = new ShaderRecord
                {
                    name = shaderName,
                    found = shader != null,
                    messages = Array.Empty<ShaderMessageRecord>(),
                };
                if (shader == null)
                {
                    record.messages = new[]
                    {
                        new ShaderMessageRecord
                        {
                            severity = "Error",
                            message = "Required shader was not found.",
                            platform = string.Empty,
                            file = string.Empty,
                            line = 0,
                        },
                    };
                    errorCount++;
                }
                else
                {
                    ShaderMessage[] messages = ShaderUtil.GetShaderMessages(shader);
                    record.messages = messages.Select(message => new ShaderMessageRecord
                    {
                        severity = message.severity.ToString(),
                        message = message.message ?? string.Empty,
                        platform = message.platform.ToString(),
                        file = message.file ?? string.Empty,
                        line = message.line,
                    }).ToArray();
                    errorCount += messages.Count(message =>
                        message.severity == ShaderCompilerMessageSeverity.Error);
                }

                shaderRecords.Add(record);
            }

            var shaderReport = new ShaderReport
            {
                unityVersion = Application.unityVersion,
                shaderCount = shaderRecords.Count,
                errorCount = errorCount,
                shaders = shaderRecords.ToArray(),
            };
            WriteJson(Path.Combine(artifactDirectory, "shader-report.json"), shaderReport);
            if (errorCount != 0)
            {
                Debug.LogError($"Cumulus MVP shader inspection found {errorCount} error(s).");
                EditorApplication.Exit(21);
                return;
            }

            string[] enabledScenes = EditorBuildSettings.scenes
                .Where(scene => scene.enabled)
                .Select(scene => scene.path)
                .ToArray();
            if (enabledScenes.Length != 1 || enabledScenes[0] != "Assets/Scenes/CumulusGlassLab.unity")
            {
                var invalidSettingsReport = new BuildReportRecord
                {
                    result = "InvalidBuildSettings",
                    outputPath = PlayerRelativePath,
                    platform = BuildTarget.StandaloneOSX.ToString(),
                    totalErrors = 1,
                    totalWarnings = 0,
                    totalSize = 0,
                    totalTimeSeconds = 0,
                };
                WriteJson(Path.Combine(artifactDirectory, "build-report.json"), invalidSettingsReport);
                Debug.LogError("Cumulus MVP build settings must contain exactly the enabled CumulusGlassLab scene.");
                EditorApplication.Exit(22);
                return;
            }

            string playerPath = Path.Combine(projectRoot, PlayerRelativePath);
            string buildDirectory = Path.GetDirectoryName(playerPath);
            if (Directory.Exists(buildDirectory))
            {
                Directory.Delete(buildDirectory, true);
            }

            Directory.CreateDirectory(buildDirectory);
            BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = enabledScenes,
                locationPathName = playerPath,
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.None,
            });
            BuildSummary summary = report.summary;
            var buildReport = new BuildReportRecord
            {
                result = summary.result.ToString(),
                outputPath = PlayerRelativePath,
                platform = summary.platform.ToString(),
                totalErrors = summary.totalErrors,
                totalWarnings = summary.totalWarnings,
                totalSize = summary.totalSize,
                totalTimeSeconds = summary.totalTime.TotalSeconds,
            };
            WriteJson(Path.Combine(artifactDirectory, "build-report.json"), buildReport);
            if (summary.result != BuildResult.Succeeded)
            {
                Debug.LogError($"Cumulus MVP standalone build failed: {summary.result}.");
                EditorApplication.Exit(22);
            }
        }

        private static void WriteJson<T>(string path, T value)
        {
            string temporaryPath = path + ".tmp";
            File.WriteAllText(temporaryPath, JsonUtility.ToJson(value, true) + Environment.NewLine);
            if (File.Exists(path))
            {
                File.Delete(path);
            }

            File.Move(temporaryPath, path);
        }

        [Serializable]
        private sealed class ShaderReport
        {
            public string unityVersion;
            public int shaderCount;
            public int errorCount;
            public ShaderRecord[] shaders;
        }

        [Serializable]
        private sealed class ShaderRecord
        {
            public string name;
            public bool found;
            public ShaderMessageRecord[] messages;
        }

        [Serializable]
        private sealed class ShaderMessageRecord
        {
            public string severity;
            public string message;
            public string platform;
            public string file;
            public int line;
        }

        [Serializable]
        private sealed class BuildReportRecord
        {
            public string result;
            public string outputPath;
            public string platform;
            public int totalErrors;
            public int totalWarnings;
            public ulong totalSize;
            public double totalTimeSeconds;
        }
    }
}
