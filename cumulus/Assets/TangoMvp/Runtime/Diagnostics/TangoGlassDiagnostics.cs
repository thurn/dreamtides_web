using System;
using System.Collections.Generic;
using UnityEngine;

namespace TangoMvp.Diagnostics
{
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

        public static void Reset()
        {
            CameraKeys.Clear();
            FactsByCamera.Clear();
            nextCameraKey = 1;
        }
    }
}
