using UnityEngine;

namespace TangoMvp.Demo
{
    [DisallowMultipleComponent]
    public sealed class TangoSpinner : MonoBehaviour
    {
        private const float DegreesPerSecond = 18f;

        [SerializeField] private Renderer[] coloredRenderers = new Renderer[0];
        [SerializeField] private Color[] colors = new Color[0];

        private MaterialPropertyBlock colorProperties;
        private float phase;

        private void OnEnable()
        {
            ApplyColors();
            SetPhase(phase);
        }

        private void Update()
        {
            phase = Mathf.Repeat(phase + Time.deltaTime * DegreesPerSecond / 360f, 1f);
            ApplyPhase();
        }

        public void SetPhase(float normalizedPhase)
        {
            phase = Mathf.Repeat(normalizedPhase, 1f);
            ApplyPhase();
        }

        private void ApplyPhase()
        {
            transform.localRotation = Quaternion.Euler(0f, 0f, phase * 360f);
        }

        private void ApplyColors()
        {
            if (colorProperties == null)
            {
                colorProperties = new MaterialPropertyBlock();
            }

            int count = Mathf.Min(coloredRenderers.Length, colors.Length);
            for (int index = 0; index < count; index++)
            {
                Renderer target = coloredRenderers[index];
                if (target == null)
                {
                    continue;
                }

                target.GetPropertyBlock(colorProperties);
                colorProperties.SetColor("_BaseColor", colors[index]);
                target.SetPropertyBlock(colorProperties);
                colorProperties.Clear();
            }
        }
    }
}
