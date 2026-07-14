using UnityEngine;

namespace CumulusMvp.Motion
{
    [DisallowMultipleComponent]
    public sealed class CumulusPanelTravel : MonoBehaviour
    {
        public const float Duration = 0.42f;

        private static readonly Vector2 Control1 = new Vector2(0.16f, 1f);
        private static readonly Vector2 Control2 = new Vector2(0.3f, 1f);

        [SerializeField] private Transform sourceAnchor;
        [SerializeField] private Transform destinationAnchor;

        private Vector3 startPosition;
        private Quaternion startRotation;
        private Vector3 targetPosition;
        private Quaternion targetRotation;
        private float elapsed;
        private bool destinationSelected;

        public bool IsTravelling { get; private set; }

        private void OnEnable()
        {
            IsTravelling = false;
            elapsed = 0f;
            if (sourceAnchor != null && destinationAnchor != null)
            {
                destinationSelected =
                    Vector3.SqrMagnitude(transform.position - destinationAnchor.position)
                    < Vector3.SqrMagnitude(transform.position - sourceAnchor.position);
            }
        }

        private void Update()
        {
            Advance(Time.deltaTime);
        }

        private void Advance(float deltaTime)
        {
            if (!IsTravelling)
            {
                return;
            }

            elapsed += deltaTime;
            float progress = Mathf.Min(elapsed / Duration, 1f);
            float eased = CumulusCubicBezier.Evaluate(progress, Control1, Control2);
            transform.SetPositionAndRotation(
                Vector3.LerpUnclamped(startPosition, targetPosition, eased),
                Quaternion.SlerpUnclamped(startRotation, targetRotation, eased));

            if (progress >= 1f)
            {
                transform.SetPositionAndRotation(targetPosition, targetRotation);
                IsTravelling = false;
            }
        }

        public void ToggleDestination()
        {
            if (sourceAnchor == null || destinationAnchor == null)
            {
                Debug.LogError("CumulusPanelTravel requires source and destination anchors.", this);
                return;
            }

            destinationSelected = !destinationSelected;
            startPosition = transform.position;
            startRotation = transform.rotation;
            Transform target = destinationSelected ? destinationAnchor : sourceAnchor;
            targetPosition = target.position;
            targetRotation = target.rotation;
            elapsed = 0f;
            IsTravelling = true;
        }
    }
}
