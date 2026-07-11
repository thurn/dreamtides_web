using UnityEngine;
using UnityEngine.Events;

namespace TangoMvp.Interaction
{
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Collider))]
    public sealed class TangoPressable : MonoBehaviour
    {
        public const float HoverScaleFactor = 1.03f;
        public const float PressScaleFactor = 0.9f;

        [SerializeField] private string semanticId = string.Empty;
        [SerializeField] private Collider hitCollider;
        [SerializeField] private Transform visual;
        [SerializeField] private UnityEvent activated = new UnityEvent();

        private Vector3 restingVisualScale;
        private bool hovered;
        private bool pressed;

        public UnityEvent Activated => activated;

        private void Reset()
        {
            hitCollider = GetComponent<Collider>();
        }

        private void OnEnable()
        {
            if (hitCollider == null)
            {
                hitCollider = GetComponent<Collider>();
            }

            if (visual == null)
            {
                Debug.LogError("TangoPressable requires an assigned visual child.", this);
                enabled = false;
                return;
            }

            if (visual == transform || !visual.IsChildOf(transform))
            {
                Debug.LogError("TangoPressable visual must be a child of the stable collider root.", this);
                enabled = false;
                return;
            }

            restingVisualScale = visual.localScale;
            hovered = false;
            pressed = false;
            ApplyVisualState();
        }

        private void OnDisable()
        {
            hovered = false;
            pressed = false;
            if (visual != null && visual != transform)
            {
                visual.localScale = restingVisualScale;
            }
        }

        public void SetHovered(bool isHovered)
        {
            if (hovered == isHovered)
            {
                return;
            }

            hovered = isHovered;
            ApplyVisualState();
        }

        public void BeginPress()
        {
            if (pressed)
            {
                return;
            }

            pressed = true;
            ApplyVisualState();
        }

        public bool EndPress(bool pointerStillOver)
        {
            if (!pressed)
            {
                return false;
            }

            pressed = false;
            ApplyVisualState();
            if (!pointerStillOver)
            {
                return false;
            }

            Debug.Log($"TangoPressable activated: {semanticId}", this);
            activated.Invoke();
            return true;
        }

        internal bool Owns(Collider candidate)
        {
            return candidate == hitCollider;
        }

        private void ApplyVisualState()
        {
            if (visual == null)
            {
                return;
            }

            float factor = pressed ? PressScaleFactor : hovered ? HoverScaleFactor : 1f;
            visual.localScale = restingVisualScale * factor;
        }
    }
}
