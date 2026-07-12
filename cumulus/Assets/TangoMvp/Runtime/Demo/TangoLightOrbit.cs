using UnityEngine;

namespace TangoMvp.Demo
{
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Light))]
    public sealed class TangoLightOrbit : MonoBehaviour
    {
        private const float LoopsPerSecond = 0.04f;
        private const float PitchDegrees = 52f;

        [SerializeField] private Vector3 pointOrbitCenter;
        [SerializeField, Min(0f)] private float pointOrbitRadius;
        [SerializeField] private float pointOrbitHeight;

        private float phase;

        private void OnEnable()
        {
            SetPhase(phase);
        }

        private void Update()
        {
            phase = Mathf.Repeat(phase + Time.deltaTime * LoopsPerSecond, 1f);
            ApplyPhase();
        }

        public void SetPhase(float normalizedPhase)
        {
            phase = Mathf.Repeat(normalizedPhase, 1f);
            ApplyPhase();
        }

        public void ConfigurePointOrbit(
            Vector3 center,
            float radius,
            float height,
            float normalizedPhase)
        {
            pointOrbitCenter = center;
            pointOrbitRadius = Mathf.Max(0f, radius);
            pointOrbitHeight = height;
            SetPhase(normalizedPhase);
        }

        private void ApplyPhase()
        {
            Light targetLight = GetComponent<Light>();
            if (targetLight != null && targetLight.type == LightType.Point)
            {
                float angle = phase * Mathf.PI * 2f;
                transform.localPosition = pointOrbitCenter + new Vector3(
                    Mathf.Cos(angle) * pointOrbitRadius,
                    pointOrbitHeight,
                    Mathf.Sin(angle) * pointOrbitRadius);
                return;
            }

            transform.localRotation = Quaternion.Euler(PitchDegrees, phase * 360f, 0f);
        }
    }
}
