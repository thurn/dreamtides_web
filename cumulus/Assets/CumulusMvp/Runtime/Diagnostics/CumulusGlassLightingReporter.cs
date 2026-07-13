using CumulusMvp.Materials;
using CumulusMvp.Rendering;
using UnityEngine;

namespace CumulusMvp.Diagnostics
{
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Camera))]
    public sealed class CumulusGlassLightingReporter : MonoBehaviour
    {
        [SerializeField] private CumulusMaterialLibrary materialLibrary;
        [SerializeField] private CumulusGlassQuality quality = CumulusGlassQuality.Desktop;
        [SerializeField] private CumulusGlassRendererMode rendererMode = CumulusGlassRendererMode.ForwardPlus;

        public void Configure(
            CumulusMaterialLibrary library,
            CumulusGlassQuality glassQuality,
            CumulusGlassRendererMode glassRendererMode)
        {
            materialLibrary = library;
            quality = glassQuality;
            rendererMode = glassRendererMode;
            PublishIfChanged();
        }

        private void OnEnable()
        {
            PublishIfChanged();
        }

        private void Update()
        {
            PublishIfChanged();
        }

        private void PublishIfChanged()
        {
            Camera targetCamera = GetComponent<Camera>();
            CumulusGlassLightingProfile profile = materialLibrary == null
                ? null
                : materialLibrary.LightingProfile;
            if (targetCamera == null || profile == null)
            {
                return;
            }

            CumulusGlassLightingQualitySettings settings = profile.ForQuality(quality);
            var facts = new CumulusGlassLightingFacts(
                profile.name,
                CumulusGlassLightingProfile.SettingsVersion,
                quality,
                rendererMode,
                settings.AdditionalLightLimit,
                settings.AdditionalLightShadows,
                Shader.GetGlobalFloat(CumulusGlassShaderIds.Available) >= 0.5f);
            int cameraKey = CumulusGlassDiagnostics.GetCameraKey(targetCamera);
            if (!CumulusGlassDiagnostics.PublishLighting(cameraKey, facts))
            {
                return;
            }

            Debug.Log(
                $"Cumulus glass lighting: profile={facts.ProfileName}, " +
                $"settingsVersion={facts.SettingsVersion}, quality={facts.Quality}, " +
                $"renderer={facts.RendererMode}, additionalLights={facts.AdditionalLightLimit}, " +
                $"additionalShadows={facts.AdditionalLightShadows.ToString().ToLowerInvariant()}, " +
                $"glassMode={(facts.LiveBlur ? "live-shared-blur" : "fallback")}",
                this);
        }
    }
}
