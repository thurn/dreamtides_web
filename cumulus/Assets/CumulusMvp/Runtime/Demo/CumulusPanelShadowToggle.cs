using UnityEngine;

namespace CumulusMvp.Demo
{
    [ExecuteAlways]
    [DisallowMultipleComponent]
    public sealed class CumulusPanelShadowToggle : MonoBehaviour
    {
        [SerializeField]
        [Tooltip("Cast the panel's rounded shadow onto the scene backdrop.")]
        private bool castShadow;

        [SerializeField, HideInInspector]
        private MeshRenderer shadowCaster;

        public bool CastShadow
        {
            get => castShadow;
            set
            {
                castShadow = value;
                Apply();
            }
        }

        public void Configure(MeshRenderer caster)
        {
            shadowCaster = caster;
            Apply();
        }

        private void OnEnable()
        {
            Apply();
        }

        private void OnValidate()
        {
            Apply();
        }

        private void Apply()
        {
            if (shadowCaster != null)
            {
                shadowCaster.enabled = castShadow;
            }
        }
    }
}
