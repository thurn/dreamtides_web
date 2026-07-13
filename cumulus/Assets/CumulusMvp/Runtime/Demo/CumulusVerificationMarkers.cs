using System;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace CumulusMvp.Demo
{
    public enum CumulusVerificationRegion
    {
        LiveGlassA,
        LiveGlassB,
        UncoveredPattern,
        OnGlassButton,
        SolidBevel,
        FrameShadowReceiver,
        PrimaryLabel,
    }

    [DisallowMultipleComponent]
    public sealed class CumulusVerificationMarkers : MonoBehaviour
    {
        [SerializeField] private Transform liveGlassA;
        [SerializeField] private Transform liveGlassB;
        [SerializeField] private Transform uncoveredPattern;
        [SerializeField] private Transform onGlassButton;
        [SerializeField] private Transform solidBevel;
        [SerializeField] private Transform frameShadowReceiver;
        [SerializeField] private Transform primaryLabel;

        private void Start()
        {
            Version urpVersion = typeof(UniversalRenderPipeline).Assembly.GetName().Version;
            Debug.Log(
                $"Cumulus glass lab initialized: unity={Application.unityVersion}, " +
                $"urp={urpVersion}, mode=live-shared-blur",
                this);
        }

        public Rect GetViewportRegion(CumulusVerificationRegion region, Camera camera)
        {
            if (camera == null)
            {
                throw new ArgumentNullException(nameof(camera));
            }

            Transform marker = Resolve(region);
            if (marker == null)
            {
                throw new InvalidOperationException($"Verification region {region} has no marker.");
            }

            Vector3 halfSize = Vector3.one * 0.5f;
            float minX = float.PositiveInfinity;
            float minY = float.PositiveInfinity;
            float maxX = float.NegativeInfinity;
            float maxY = float.NegativeInfinity;
            for (int x = -1; x <= 1; x += 2)
            {
                for (int y = -1; y <= 1; y += 2)
                {
                    Vector3 viewport = camera.WorldToViewportPoint(
                        marker.TransformPoint(new Vector3(x * halfSize.x, y * halfSize.y, 0f)));
                    if (viewport.z <= 0f)
                    {
                        throw new InvalidOperationException($"Verification region {region} is behind the camera.");
                    }

                    minX = Mathf.Min(minX, viewport.x);
                    minY = Mathf.Min(minY, viewport.y);
                    maxX = Mathf.Max(maxX, viewport.x);
                    maxY = Mathf.Max(maxY, viewport.y);
                }
            }

            return Rect.MinMaxRect(minX, minY, maxX, maxY);
        }

        private Transform Resolve(CumulusVerificationRegion region)
        {
            switch (region)
            {
                case CumulusVerificationRegion.LiveGlassA:
                    return liveGlassA;
                case CumulusVerificationRegion.LiveGlassB:
                    return liveGlassB;
                case CumulusVerificationRegion.UncoveredPattern:
                    return uncoveredPattern;
                case CumulusVerificationRegion.OnGlassButton:
                    return onGlassButton;
                case CumulusVerificationRegion.SolidBevel:
                    return solidBevel;
                case CumulusVerificationRegion.FrameShadowReceiver:
                    return frameShadowReceiver;
                case CumulusVerificationRegion.PrimaryLabel:
                    return primaryLabel;
                default:
                    throw new ArgumentOutOfRangeException(nameof(region), region, "Unknown verification region.");
            }
        }
    }
}
