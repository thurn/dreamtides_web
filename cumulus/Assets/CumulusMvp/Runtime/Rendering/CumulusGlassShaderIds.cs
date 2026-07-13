using UnityEngine;

namespace CumulusMvp.Rendering
{
    public static class CumulusGlassShaderIds
    {
        public static readonly int BlurTexture = Shader.PropertyToID("_CumulusGlassBlurTexture");
        public static readonly int BlurTexelSize = Shader.PropertyToID("_CumulusGlassBlurTexelSize");
        public static readonly int Available = Shader.PropertyToID("_CumulusGlassAvailable");
    }
}
