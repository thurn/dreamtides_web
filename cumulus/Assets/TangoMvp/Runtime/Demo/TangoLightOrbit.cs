using UnityEngine;

namespace TangoMvp.Demo
{
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Light))]
    public sealed class TangoLightOrbit : MonoBehaviour
    {
        private const float LoopsPerSecond = 0.04f;
        private const float PitchDegrees = 52f;

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

        private void ApplyPhase()
        {
            transform.localRotation = Quaternion.Euler(PitchDegrees, phase * 360f, 0f);
        }
    }
}
