using System;
using UnityEngine;

namespace CumulusMvp.Materials
{
    public enum CumulusGlassQuality
    {
        Desktop,
        Mobile,
    }

    [Serializable]
    public struct CumulusGlassLightingQualitySettings
    {
        public CumulusGlassLightingQualitySettings(int additionalLightLimit, bool additionalLightShadows)
        {
            AdditionalLightLimit = additionalLightLimit;
            AdditionalLightShadows = additionalLightShadows;
        }

        public int AdditionalLightLimit { get; }
        public bool AdditionalLightShadows { get; }
    }

    [Serializable]
    public struct CumulusGlassLightingRoleSettings
    {
        [SerializeField, Min(0f), Tooltip("Energy of the modeled bevel and side reflection.")]
        private float edgeStrength;

        [SerializeField, Range(0.02f, 1f), Tooltip("GGX roughness of the edge reflection.")]
        private float edgeRoughness;

        [SerializeField, Min(0f), Tooltip("Energy of the broad face reflection.")]
        private float interiorStrength;

        [SerializeField, Range(0.02f, 1f), Tooltip("GGX roughness of the interior reflection.")]
        private float interiorRoughness;

        [SerializeField, Range(0f, 1f), Tooltip("How much scene-light chroma reaches the reflection.")]
        private float lightColorResponse;

        [SerializeField, Min(0.01f), Tooltip("Soft HDR luminance ceiling for added reflected light.")]
        private float reflectionLuminanceCeiling;

        public CumulusGlassLightingRoleSettings(
            float edgeStrength,
            float edgeRoughness,
            float interiorStrength,
            float interiorRoughness,
            float lightColorResponse,
            float reflectionLuminanceCeiling)
        {
            this.edgeStrength = edgeStrength;
            this.edgeRoughness = edgeRoughness;
            this.interiorStrength = interiorStrength;
            this.interiorRoughness = interiorRoughness;
            this.lightColorResponse = lightColorResponse;
            this.reflectionLuminanceCeiling = reflectionLuminanceCeiling;
        }

        public float EdgeStrength => edgeStrength;
        public float EdgeRoughness => edgeRoughness;
        public float InteriorStrength => interiorStrength;
        public float InteriorRoughness => interiorRoughness;
        public float LightColorResponse => lightColorResponse;
        public float ReflectionLuminanceCeiling => reflectionLuminanceCeiling;

        public CumulusGlassLightingRoleSettings Sanitized()
        {
            return new CumulusGlassLightingRoleSettings(
                FiniteClamp(edgeStrength, 0f, 4f),
                FiniteClamp(edgeRoughness, 0.02f, 1f),
                FiniteClamp(interiorStrength, 0f, 4f),
                FiniteClamp(interiorRoughness, 0.02f, 1f),
                FiniteClamp(lightColorResponse, 0f, 1f),
                FiniteClamp(reflectionLuminanceCeiling, 0.01f, 8f));
        }

        public void Validate(string roleName)
        {
            ValidateRange(edgeStrength, 0f, 4f, roleName, nameof(EdgeStrength));
            ValidateRange(edgeRoughness, 0.02f, 1f, roleName, nameof(EdgeRoughness));
            ValidateRange(interiorStrength, 0f, 4f, roleName, nameof(InteriorStrength));
            ValidateRange(interiorRoughness, 0.02f, 1f, roleName, nameof(InteriorRoughness));
            ValidateRange(lightColorResponse, 0f, 1f, roleName, nameof(LightColorResponse));
            ValidateRange(
                reflectionLuminanceCeiling,
                0.01f,
                8f,
                roleName,
                nameof(ReflectionLuminanceCeiling));
        }

        private static float FiniteClamp(float value, float minimum, float maximum)
        {
            return float.IsNaN(value) || float.IsInfinity(value)
                ? minimum
                : Mathf.Clamp(value, minimum, maximum);
        }

        private static void ValidateRange(
            float value,
            float minimum,
            float maximum,
            string roleName,
            string settingName)
        {
            if (float.IsNaN(value) || float.IsInfinity(value) || value < minimum || value > maximum)
            {
                throw new InvalidOperationException(
                    $"{roleName} {settingName} must be finite and in [{minimum}, {maximum}].");
            }
        }
    }

    [CreateAssetMenu(fileName = "CumulusGlassLightingProfile", menuName = "Cumulus MVP/Glass Lighting Profile")]
    public sealed class CumulusGlassLightingProfile : ScriptableObject
    {
        public const int SettingsVersion = 1;

        [Header("Scene Glass")]
        [SerializeField]
        private CumulusGlassLightingRoleSettings sceneGlass = new CumulusGlassLightingRoleSettings(
            0.65f,
            0.14f,
            0.14f,
            0.42f,
            1f,
            1.25f);

        [Header("On Glass")]
        [SerializeField]
        private CumulusGlassLightingRoleSettings onGlass = new CumulusGlassLightingRoleSettings(
            0.42f,
            0.20f,
            0.08f,
            0.52f,
            0.85f,
            0.75f);

        [Header("Quality")]
        [SerializeField, Range(0, 4)]
        private int desktopAdditionalLightLimit = 4;

        [SerializeField, Range(0, 1)]
        private int mobileAdditionalLightLimit = 1;

        [SerializeField]
        private bool desktopAdditionalLightShadows = true;

        public CumulusGlassLightingRoleSettings SceneGlass => sceneGlass;
        public CumulusGlassLightingRoleSettings OnGlass => onGlass;
        public int DesktopAdditionalLightLimit => desktopAdditionalLightLimit;
        public int MobileAdditionalLightLimit => mobileAdditionalLightLimit;
        public bool DesktopAdditionalLightShadows => desktopAdditionalLightShadows;

        public CumulusGlassLightingQualitySettings ForQuality(CumulusGlassQuality quality)
        {
            switch (quality)
            {
                case CumulusGlassQuality.Desktop:
                    return new CumulusGlassLightingQualitySettings(
                        desktopAdditionalLightLimit,
                        desktopAdditionalLightShadows);
                case CumulusGlassQuality.Mobile:
                    return new CumulusGlassLightingQualitySettings(mobileAdditionalLightLimit, false);
                default:
                    throw new ArgumentOutOfRangeException(nameof(quality), quality, "Unknown Cumulus glass quality.");
            }
        }

        public void Validate()
        {
            sceneGlass.Validate(nameof(SceneGlass));
            onGlass.Validate(nameof(OnGlass));
            if (desktopAdditionalLightLimit < 0 || desktopAdditionalLightLimit > 4)
            {
                throw new InvalidOperationException("Desktop additional-light limit must be in [0, 4].");
            }

            if (mobileAdditionalLightLimit < 0 || mobileAdditionalLightLimit > 1)
            {
                throw new InvalidOperationException("Mobile additional-light limit must be in [0, 1].");
            }
        }
    }
}
