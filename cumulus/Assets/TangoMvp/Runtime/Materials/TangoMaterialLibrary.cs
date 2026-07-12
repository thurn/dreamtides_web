using System;
using UnityEngine;

namespace TangoMvp.Materials
{
    [CreateAssetMenu(fileName = "TangoMaterialLibrary", menuName = "Tango MVP/Material Library")]
    public sealed class TangoMaterialLibrary : ScriptableObject
    {
        [SerializeField] private Material sceneGlass;
        [SerializeField] private Material onGlass;
        [SerializeField] private Material solidChrome;
        [SerializeField] private TangoGlassLightingProfile lightingProfile;

        public TangoGlassLightingProfile LightingProfile => lightingProfile;

        public Material Resolve(TangoMaterialRole role)
        {
            switch (role)
            {
                case TangoMaterialRole.SceneGlass:
                    return sceneGlass;
                case TangoMaterialRole.OnGlass:
                    return onGlass;
                case TangoMaterialRole.SolidChrome:
                    return solidChrome;
                default:
                    throw new ArgumentOutOfRangeException(nameof(role), role, "Unknown Tango material role.");
            }
        }

        public void Validate()
        {
            ValidateAssignment(TangoMaterialRole.SceneGlass, sceneGlass);
            ValidateAssignment(TangoMaterialRole.OnGlass, onGlass);
            ValidateAssignment(TangoMaterialRole.SolidChrome, solidChrome);
            if (lightingProfile == null)
            {
                throw new InvalidOperationException("Tango material library has no glass lighting profile.");
            }

            lightingProfile.Validate();
        }

        private static void ValidateAssignment(TangoMaterialRole role, Material material)
        {
            if (material == null)
            {
                throw new InvalidOperationException($"Material role {role} has no assigned material.");
            }
        }
    }
}
