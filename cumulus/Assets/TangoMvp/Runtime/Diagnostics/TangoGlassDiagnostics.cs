using System;
using System.Collections.Generic;
using UnityEngine;
using TangoMvp.Materials;

namespace TangoMvp.Diagnostics
{
    public enum TangoGlassRendererMode
    {
        Forward,
        ForwardPlus,
    }

    public readonly struct TangoGlassLightingFacts : IEquatable<TangoGlassLightingFacts>
    {
        public TangoGlassLightingFacts(
            string profileName,
            int settingsVersion,
            TangoGlassQuality quality,
            TangoGlassRendererMode rendererMode,
            int additionalLightLimit,
            bool additionalLightShadows,
            bool liveBlur)
        {
            ProfileName = profileName ?? string.Empty;
            SettingsVersion = settingsVersion;
            Quality = quality;
            RendererMode = rendererMode;
            AdditionalLightLimit = additionalLightLimit;
            AdditionalLightShadows = additionalLightShadows;
            LiveBlur = liveBlur;
        }

        public string ProfileName { get; }
        public int SettingsVersion { get; }
        public TangoGlassQuality Quality { get; }
        public TangoGlassRendererMode RendererMode { get; }
        public int AdditionalLightLimit { get; }
        public bool AdditionalLightShadows { get; }
        public bool LiveBlur { get; }

        public bool Equals(TangoGlassLightingFacts other)
        {
            return ProfileName == other.ProfileName &&
                SettingsVersion == other.SettingsVersion &&
                Quality == other.Quality &&
                RendererMode == other.RendererMode &&
                AdditionalLightLimit == other.AdditionalLightLimit &&
                AdditionalLightShadows == other.AdditionalLightShadows &&
                LiveBlur == other.LiveBlur;
        }

        public override bool Equals(object obj)
        {
            return obj is TangoGlassLightingFacts other && Equals(other);
        }

        public override int GetHashCode()
        {
            unchecked
            {
                int hash = ProfileName.GetHashCode();
                hash = hash * 397 ^ SettingsVersion;
                hash = hash * 397 ^ (int)Quality;
                hash = hash * 397 ^ (int)RendererMode;
                hash = hash * 397 ^ AdditionalLightLimit;
                hash = hash * 397 ^ AdditionalLightShadows.GetHashCode();
                return hash * 397 ^ LiveBlur.GetHashCode();
            }
        }
    }

    public readonly struct TangoGlassFrameFacts
    {
        public TangoGlassFrameFacts(
            int frameCount,
            int inputWidth,
            int inputHeight,
            int outputWidth,
            int outputHeight,
            int graphRecordCount,
            int horizontalPassCount,
            int verticalPassCount,
            bool available)
        {
            FrameCount = frameCount;
            InputWidth = inputWidth;
            InputHeight = inputHeight;
            OutputWidth = outputWidth;
            OutputHeight = outputHeight;
            GraphRecordCount = graphRecordCount;
            HorizontalPassCount = horizontalPassCount;
            VerticalPassCount = verticalPassCount;
            Available = available;
        }

        public int FrameCount { get; }
        public int InputWidth { get; }
        public int InputHeight { get; }
        public int OutputWidth { get; }
        public int OutputHeight { get; }
        public int GraphRecordCount { get; }
        public int HorizontalPassCount { get; }
        public int VerticalPassCount { get; }
        public bool Available { get; }
    }

    public static class TangoGlassDiagnostics
    {
        private static readonly Dictionary<EntityId, int> CameraKeys =
            new Dictionary<EntityId, int>(8);
        private static readonly Dictionary<int, TangoGlassFrameFacts> FactsByCamera =
            new Dictionary<int, TangoGlassFrameFacts>(8);
        private static readonly Dictionary<int, TangoGlassLightingFacts> LightingFactsByCamera =
            new Dictionary<int, TangoGlassLightingFacts>(8);
        private static int nextCameraKey = 1;

        public static int GetCameraKey(Camera camera)
        {
            if (camera == null)
            {
                throw new ArgumentNullException(nameof(camera));
            }

            EntityId entityId = camera.GetEntityId();
            if (CameraKeys.TryGetValue(entityId, out int cameraKey))
            {
                return cameraKey;
            }

            if (nextCameraKey == int.MaxValue)
            {
                throw new InvalidOperationException("Tango glass diagnostics exhausted its camera key space.");
            }

            cameraKey = nextCameraKey++;
            CameraKeys.Add(entityId, cameraKey);
            return cameraKey;
        }

        public static bool TryGetFrameFacts(
            int cameraInstanceId,
            int frameCount,
            out TangoGlassFrameFacts facts)
        {
            if (FactsByCamera.TryGetValue(cameraInstanceId, out facts) && facts.FrameCount == frameCount)
            {
                return true;
            }

            facts = default;
            return false;
        }

        public static void Publish(
            int cameraInstanceId,
            int frameCount,
            int inputWidth,
            int inputHeight,
            int outputWidth,
            int outputHeight,
            int graphRecordCount,
            int horizontalPassCount,
            int verticalPassCount,
            bool available)
        {
            FactsByCamera[cameraInstanceId] = new TangoGlassFrameFacts(
                frameCount,
                inputWidth,
                inputHeight,
                outputWidth,
                outputHeight,
                graphRecordCount,
                horizontalPassCount,
                verticalPassCount,
                available);
        }

        public static bool PublishLighting(int cameraInstanceId, TangoGlassLightingFacts facts)
        {
            if (LightingFactsByCamera.TryGetValue(cameraInstanceId, out TangoGlassLightingFacts existing) &&
                existing.Equals(facts))
            {
                return false;
            }

            LightingFactsByCamera[cameraInstanceId] = facts;
            return true;
        }

        public static bool TryGetLightingFacts(int cameraInstanceId, out TangoGlassLightingFacts facts)
        {
            return LightingFactsByCamera.TryGetValue(cameraInstanceId, out facts);
        }

        public static void Reset()
        {
            CameraKeys.Clear();
            FactsByCamera.Clear();
            LightingFactsByCamera.Clear();
            nextCameraKey = 1;
        }
    }
}
