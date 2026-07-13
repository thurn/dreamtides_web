using System;
using UnityEngine;

namespace CumulusMvp.Materials
{
    [CreateAssetMenu(fileName = "CumulusMaterialLibrary", menuName = "Cumulus MVP/Material Library")]
    public sealed class CumulusMaterialLibrary : ScriptableObject
    {
        [SerializeField] private Material sceneGlass;
        [SerializeField] private Material onGlass;
        [SerializeField] private Material solidChrome;
        [SerializeField] private CumulusGlassLightingProfile lightingProfile;

        public CumulusGlassLightingProfile LightingProfile => lightingProfile;

        public Material Resolve(CumulusMaterialRole role)
        {
            switch (role)
            {
                case CumulusMaterialRole.SceneGlass:
                    return sceneGlass;
                case CumulusMaterialRole.OnGlass:
                    return onGlass;
                case CumulusMaterialRole.SolidChrome:
                    return solidChrome;
                default:
                    throw new ArgumentOutOfRangeException(nameof(role), role, "Unknown Cumulus material role.");
            }
        }

        public void Validate()
        {
            ValidateAssignment(CumulusMaterialRole.SceneGlass, sceneGlass);
            ValidateAssignment(CumulusMaterialRole.OnGlass, onGlass);
            ValidateAssignment(CumulusMaterialRole.SolidChrome, solidChrome);
            if (lightingProfile == null)
            {
                throw new InvalidOperationException("Cumulus material library has no glass lighting profile.");
            }

            lightingProfile.Validate();
        }

        private static void ValidateAssignment(CumulusMaterialRole role, Material material)
        {
            if (material == null)
            {
                throw new InvalidOperationException($"Material role {role} has no assigned material.");
            }
        }
    }
}
