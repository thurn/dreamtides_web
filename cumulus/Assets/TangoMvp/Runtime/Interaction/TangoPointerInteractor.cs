using UnityEngine;
using UnityEngine.InputSystem;

namespace TangoMvp.Interaction
{
    [DisallowMultipleComponent]
    public sealed class TangoPointerInteractor : MonoBehaviour
    {
        [SerializeField] private Camera interactionCamera;

        private TangoPressable hovered;
        private TangoPressable pressed;

        private void Reset()
        {
            interactionCamera = GetComponent<Camera>();
        }

        private void OnDisable()
        {
            CancelInteraction();
        }

        private void Update()
        {
            Mouse mouse = Mouse.current;
            if (mouse == null || interactionCamera == null || !interactionCamera.isActiveAndEnabled)
            {
                CancelInteraction();
                return;
            }

            Ray ray = interactionCamera.ScreenPointToRay(mouse.position.ReadValue());
            TangoPressable current = null;
            if (Physics.Raycast(ray, out RaycastHit hit, Mathf.Infinity, ~0, QueryTriggerInteraction.Ignore))
            {
                TangoPressable candidate = hit.collider.GetComponent<TangoPressable>();
                if (candidate != null && candidate.isActiveAndEnabled && candidate.Owns(hit.collider))
                {
                    current = candidate;
                }
            }

            SetHovered(current);

            if (mouse.leftButton.wasPressedThisFrame && current != null)
            {
                pressed = current;
                pressed.BeginPress();
            }

            if (mouse.leftButton.wasReleasedThisFrame && pressed != null)
            {
                TangoPressable released = pressed;
                pressed = null;
                released.EndPress(released == current);
            }
        }

        private void SetHovered(TangoPressable current)
        {
            if (hovered == current)
            {
                return;
            }

            if (hovered != null)
            {
                hovered.SetHovered(false);
            }

            hovered = current;
            if (hovered != null)
            {
                hovered.SetHovered(true);
            }
        }

        private void CancelInteraction()
        {
            SetHovered(null);
            if (pressed == null)
            {
                return;
            }

            TangoPressable canceled = pressed;
            pressed = null;
            canceled.EndPress(false);
        }
    }
}
