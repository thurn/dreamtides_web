using UnityEngine;
using UnityEngine.Experimental.Rendering;

namespace CumulusMvp.Rendering
{
    public static class CumulusGlassBlurDescriptor
    {
        public static RenderTextureDescriptor Create(RenderTextureDescriptor source)
        {
            source.width = HalfWithCeiling(source.width);
            source.height = HalfWithCeiling(source.height);
            source.msaaSamples = 1;
            source.bindMS = false;
            source.depthBufferBits = 0;
            source.depthStencilFormat = GraphicsFormat.None;
            source.useMipMap = false;
            source.autoGenerateMips = false;
            source.mipCount = 1;
            return source;
        }

        private static int HalfWithCeiling(int value)
        {
            value = Mathf.Max(1, value);
            return (value / 2) + (value & 1);
        }
    }
}
