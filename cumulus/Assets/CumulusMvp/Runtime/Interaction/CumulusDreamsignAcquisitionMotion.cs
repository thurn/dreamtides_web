using UnityEngine;
using CumulusMvp.Motion;

namespace CumulusMvp.Interaction
{
    /// <summary>
    /// Carries an activated Dreamsign from its world-space offer into the
    /// bottom-right HUD region while preserving the shared Cumulus press motion.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(CumulusPressable))]
    [RequireComponent(typeof(Collider))]
    public sealed class CumulusDreamsignAcquisitionMotion : MonoBehaviour
    {
        public const float ReleaseDuration = 0.14f;
        public const float TravelDuration = 0.9f;
        public const float DestinationScaleFactor = 0.28f;

        private static readonly Vector2 EaseControl1 = new Vector2(0.16f, 1f);
        private static readonly Vector2 EaseControl2 = new Vector2(0.3f, 1f);

        private enum MotionPhase
        {
            Idle,
            Release,
            Travel,
            Complete,
        }

        [SerializeField] private string dreamsignId = string.Empty;
        [SerializeField] private Camera targetCamera;
        [SerializeField] private CumulusPressable pressable;
        [SerializeField] private Collider hitCollider;
        [SerializeField] private Transform travelVisual;
        [SerializeField] private Vector2 targetViewport = new Vector2(0.94f, 0.1f);

        private MotionPhase phase;
        private float phaseElapsed;
        private Vector3 restingTravelScale;
        private Vector3 travelStartPosition;
        private Quaternion travelStartRotation;
        private Vector3 travelDestination;

        public bool IsComplete => phase == MotionPhase.Complete;

        private void Reset()
        {
            pressable = GetComponent<CumulusPressable>();
            hitCollider = GetComponent<Collider>();
        }

        private void OnEnable()
        {
            if (!ValidateReferences())
            {
                enabled = false;
                return;
            }

            restingTravelScale = travelVisual.localScale;
            phase = MotionPhase.Idle;
            phaseElapsed = 0f;
            pressable.Activated.AddListener(BeginAcquisition);
        }

        private void OnDisable()
        {
            if (pressable != null)
            {
                pressable.Activated.RemoveListener(BeginAcquisition);
            }
        }

        private void Update()
        {
            AdvanceAnimation(Time.unscaledDeltaTime);
        }

        public void BeginAcquisition()
        {
            if (phase != MotionPhase.Idle)
            {
                return;
            }

            travelStartPosition = transform.localPosition;
            travelStartRotation = transform.localRotation;
            travelDestination = ResolveDestination();
            phase = MotionPhase.Release;
            phaseElapsed = 0f;

            hitCollider.enabled = false;
            pressable.enabled = false;
            travelVisual.localScale =
                restingTravelScale * CumulusPressable.PressScaleFactor;

            Debug.Log($"Dreamsign acquisition started: {dreamsignId}", this);
        }

        internal void AdvanceAnimation(float deltaSeconds)
        {
            float remaining = Mathf.Max(0f, deltaSeconds);
            while (remaining > 0f)
            {
                switch (phase)
                {
                    case MotionPhase.Release:
                        remaining = AdvanceRelease(remaining);
                        break;
                    case MotionPhase.Travel:
                        remaining = AdvanceTravel(remaining);
                        break;
                    default:
                        return;
                }
            }
        }

        private float AdvanceRelease(float deltaSeconds)
        {
            float consumed = Mathf.Min(deltaSeconds, ReleaseDuration - phaseElapsed);
            phaseElapsed += consumed;
            float progress = CumulusCubicBezier.Evaluate(
                phaseElapsed / ReleaseDuration,
                EaseControl1,
                EaseControl2);
            float scale = Mathf.Lerp(
                CumulusPressable.PressScaleFactor,
                CumulusPressable.HoverScaleFactor,
                progress);
            travelVisual.localScale = restingTravelScale * scale;

            if (phaseElapsed < ReleaseDuration)
            {
                return 0f;
            }

            phase = MotionPhase.Travel;
            phaseElapsed = 0f;
            return deltaSeconds - consumed;
        }

        private float AdvanceTravel(float deltaSeconds)
        {
            float consumed = Mathf.Min(deltaSeconds, TravelDuration - phaseElapsed);
            phaseElapsed += consumed;
            float progress = CumulusCubicBezier.Evaluate(
                phaseElapsed / TravelDuration,
                EaseControl1,
                EaseControl2);

            transform.localPosition = Vector3.LerpUnclamped(
                travelStartPosition,
                travelDestination,
                progress);
            transform.localRotation = Quaternion.SlerpUnclamped(
                travelStartRotation,
                Quaternion.identity,
                progress);
            travelVisual.localScale = restingTravelScale * Mathf.LerpUnclamped(
                CumulusPressable.HoverScaleFactor,
                DestinationScaleFactor,
                progress);

            if (phaseElapsed < TravelDuration)
            {
                return 0f;
            }

            transform.localPosition = travelDestination;
            transform.localRotation = Quaternion.identity;
            travelVisual.localScale = restingTravelScale * DestinationScaleFactor;
            phase = MotionPhase.Complete;
            phaseElapsed = 0f;
            Debug.Log($"Dreamsign acquisition completed: {dreamsignId}", this);
            return deltaSeconds - consumed;
        }

        private Vector3 ResolveDestination()
        {
            float cameraDepth = targetCamera.WorldToViewportPoint(transform.position).z;
            Vector3 destinationWorld = targetCamera.ViewportToWorldPoint(
                new Vector3(targetViewport.x, targetViewport.y, cameraDepth));
            return transform.parent != null
                ? transform.parent.InverseTransformPoint(destinationWorld)
                : destinationWorld;
        }

        private bool ValidateReferences()
        {
            if (targetCamera == null ||
                pressable == null ||
                hitCollider == null ||
                travelVisual == null)
            {
                Debug.LogError(
                    "CumulusDreamsignAcquisitionMotion requires a camera, pressable, " +
                    "collider, and travel visual.",
                    this);
                return false;
            }

            if (travelVisual == transform || !travelVisual.IsChildOf(transform))
            {
                Debug.LogError(
                    "CumulusDreamsignAcquisitionMotion travel visual must be a child " +
                    "of the moving Dreamsign root.",
                    this);
                return false;
            }

            return true;
        }
    }
}
