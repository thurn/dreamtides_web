Shader "Hidden/TangoMvp/SeparableBlur"
{
    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" }
        ZTest Always
        ZWrite Off
        Cull Off

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"

        float4 _TangoBlurOutputTexelSize;
        float _TangoBlurRadius;

        float4 SampleClamped(float2 uv)
        {
            float2 halfSourceTexel = 0.5 * _BlitTexture_TexelSize.xy;
            uv = clamp(uv, halfSourceTexel, 1.0 - halfSourceTexel);
            return SAMPLE_TEXTURE2D_X_LOD(_BlitTexture, sampler_LinearClamp, uv, _BlitMipLevel);
        }

        float4 Blur(Varyings input, float2 outputPixelAxis)
        {
            UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
            float2 uv = input.texcoord.xy;
            float2 stepUv = outputPixelAxis * _TangoBlurRadius;
            float4 color = SampleClamped(uv) * 0.227027027;
            color += SampleClamped(uv + stepUv * 0.25) * 0.194594595;
            color += SampleClamped(uv - stepUv * 0.25) * 0.194594595;
            color += SampleClamped(uv + stepUv * 0.50) * 0.121621622;
            color += SampleClamped(uv - stepUv * 0.50) * 0.121621622;
            color += SampleClamped(uv + stepUv * 0.75) * 0.054054054;
            color += SampleClamped(uv - stepUv * 0.75) * 0.054054054;
            color += SampleClamped(uv + stepUv) * 0.016216216;
            color += SampleClamped(uv - stepUv) * 0.016216216;
            return color;
        }

        float4 BlurHorizontal(Varyings input) : SV_Target0
        {
            return Blur(input, float2(_TangoBlurOutputTexelSize.x, 0.0));
        }

        float4 BlurVertical(Varyings input) : SV_Target0
        {
            return Blur(input, float2(0.0, _TangoBlurOutputTexelSize.y));
        }
        ENDHLSL

        Pass
        {
            Name "Tango Glass Blur Horizontal"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment BlurHorizontal
            ENDHLSL
        }

        Pass
        {
            Name "Tango Glass Blur Vertical"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment BlurVertical
            ENDHLSL
        }
    }
}
