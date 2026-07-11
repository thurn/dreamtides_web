using UnityEngine;

namespace TangoMvp.Rendering
{
    public static class TangoGlassShaderIds
    {
        public static readonly int BlurTexture = Shader.PropertyToID("_TangoGlassBlurTexture");
        public static readonly int BlurTexelSize = Shader.PropertyToID("_TangoGlassBlurTexelSize");
        public static readonly int Available = Shader.PropertyToID("_TangoGlassAvailable");
    }
}
