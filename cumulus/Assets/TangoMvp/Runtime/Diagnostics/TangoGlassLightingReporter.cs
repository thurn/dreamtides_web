using TangoMvp.Materials;
using TangoMvp.Rendering;
using UnityEngine;

namespace TangoMvp.Diagnostics
{
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Camera))]
    public sealed class TangoGlassLightingReporter : MonoBehaviour
    {
        [SerializeField] private TangoMaterialLibrary materialLibrary;
        [SerializeField] private TangoGlassQuality quality = TangoGlassQuality.Desktop;
        [SerializeField] private TangoGlassRendererMode rendererMode = TangoGlassRendererMode.ForwardPlus;

        public void Configure(
            TangoMaterialLibrary library,
            TangoGlassQuality glassQuality,
            TangoGlassRendererMode glassRendererMode)
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
            TangoGlassLightingProfile profile = materialLibrary == null
                ? null
                : materialLibrary.LightingProfile;
            if (targetCamera == null || profile == null)
            {
                return;
            }

            TangoGlassLightingQualitySettings settings = profile.ForQuality(quality);
            var facts = new TangoGlassLightingFacts(
                profile.name,
                TangoGlassLightingProfile.SettingsVersion,
                quality,
                rendererMode,
                settings.AdditionalLightLimit,
                settings.AdditionalLightShadows,
                Shader.GetGlobalFloat(TangoGlassShaderIds.Available) >= 0.5f);
            int cameraKey = TangoGlassDiagnostics.GetCameraKey(targetCamera);
            if (!TangoGlassDiagnostics.PublishLighting(cameraKey, facts))
            {
                return;
            }

            Debug.Log(
                $"Tango glass lighting: profile={facts.ProfileName}, " +
                $"settingsVersion={facts.SettingsVersion}, quality={facts.Quality}, " +
                $"renderer={facts.RendererMode}, additionalLights={facts.AdditionalLightLimit}, " +
                $"additionalShadows={facts.AdditionalLightShadows.ToString().ToLowerInvariant()}, " +
                $"glassMode={(facts.LiveBlur ? "live-shared-blur" : "fallback")}",
                this);
        }
    }
}
