using System;
using System.Collections.Generic;
using UnityEngine;
using CumulusMvp.Materials;

namespace CumulusMvp.Diagnostics
{
    public enum CumulusGlassRendererMode
    {
        Forward,
        ForwardPlus,
    }

    public readonly struct CumulusGlassLightingFacts : IEquatable<CumulusGlassLightingFacts>
    {
        public CumulusGlassLightingFacts(
            string profileName,
            int settingsVersion,
            CumulusGlassQuality quality,
            CumulusGlassRendererMode rendererMode,
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
        public CumulusGlassQuality Quality { get; }
        public CumulusGlassRendererMode RendererMode { get; }
        public int AdditionalLightLimit { get; }
        public bool AdditionalLightShadows { get; }
        public bool LiveBlur { get; }

        public bool Equals(CumulusGlassLightingFacts other)
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
            return obj is CumulusGlassLightingFacts other && Equals(other);
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

    public readonly struct CumulusGlassFrameFacts
    {
        public CumulusGlassFrameFacts(
            int frameCount,
            int inputWidth,
            int inputHeight,
            int outputWidth,
            int outputHeight,
            int graphRecordCount,
            int downsamplePassCount,
            int upsamplePassCount,
            bool available)
        {
            FrameCount = frameCount;
            InputWidth = inputWidth;
            InputHeight = inputHeight;
            OutputWidth = outputWidth;
            OutputHeight = outputHeight;
            GraphRecordCount = graphRecordCount;
            DownsamplePassCount = downsamplePassCount;
            UpsamplePassCount = upsamplePassCount;
            Available = available;
        }

        public int FrameCount { get; }
        public int InputWidth { get; }
        public int InputHeight { get; }
        public int OutputWidth { get; }
        public int OutputHeight { get; }
        public int GraphRecordCount { get; }
        public int DownsamplePassCount { get; }
        public int UpsamplePassCount { get; }
        public bool Available { get; }
    }

    public static class CumulusGlassDiagnostics
    {
        private static readonly Dictionary<EntityId, int> CameraKeys =
            new Dictionary<EntityId, int>(8);
        private static readonly Dictionary<int, CumulusGlassFrameFacts> FactsByCamera =
            new Dictionary<int, CumulusGlassFrameFacts>(8);
        private static readonly Dictionary<int, CumulusGlassLightingFacts> LightingFactsByCamera =
            new Dictionary<int, CumulusGlassLightingFacts>(8);
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
                throw new InvalidOperationException("Cumulus glass diagnostics exhausted its camera key space.");
            }

            cameraKey = nextCameraKey++;
            CameraKeys.Add(entityId, cameraKey);
            return cameraKey;
        }

        public static bool TryGetFrameFacts(
            int cameraInstanceId,
            int frameCount,
            out CumulusGlassFrameFacts facts)
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
            int downsamplePassCount,
            int upsamplePassCount,
            bool available)
        {
            FactsByCamera[cameraInstanceId] = new CumulusGlassFrameFacts(
                frameCount,
                inputWidth,
                inputHeight,
                outputWidth,
                outputHeight,
                graphRecordCount,
                downsamplePassCount,
                upsamplePassCount,
                available);
        }

        public static bool PublishLighting(int cameraInstanceId, CumulusGlassLightingFacts facts)
        {
            if (LightingFactsByCamera.TryGetValue(cameraInstanceId, out CumulusGlassLightingFacts existing) &&
                existing.Equals(facts))
            {
                return false;
            }

            LightingFactsByCamera[cameraInstanceId] = facts;
            return true;
        }

        public static bool TryGetLightingFacts(int cameraInstanceId, out CumulusGlassLightingFacts facts)
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
