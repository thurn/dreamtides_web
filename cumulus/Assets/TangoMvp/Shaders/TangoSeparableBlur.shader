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

        float4 SampleClamped(float2 uv)
        {
            float2 halfSourceTexel = 0.5 * _BlitTexture_TexelSize.xy;
            uv = clamp(uv, halfSourceTexel, 1.0 - halfSourceTexel);
            return SAMPLE_TEXTURE2D_X_LOD(_BlitTexture, sampler_LinearClamp, uv, _BlitMipLevel);
        }

        float4 Downsample(Varyings input) : SV_Target0
        {
            UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
            float2 uv = input.texcoord.xy;
            float2 halfTexel = 0.5 * _BlitTexture_TexelSize.xy;
            float4 color = SampleClamped(uv) * 4.0;
            color += SampleClamped(uv + halfTexel * float2(-1.0, -1.0));
            color += SampleClamped(uv + halfTexel * float2(1.0, -1.0));
            color += SampleClamped(uv + halfTexel * float2(-1.0, 1.0));
            color += SampleClamped(uv + halfTexel * float2(1.0, 1.0));
            return color * 0.125;
        }

        float4 Upsample(Varyings input) : SV_Target0
        {
            UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
            float2 uv = input.texcoord.xy;
            float2 halfTexel = 0.5 * _BlitTexture_TexelSize.xy;
            float4 color = SampleClamped(uv + halfTexel * float2(-2.0, 0.0)) * 2.0;
            color += SampleClamped(uv + halfTexel * float2(-1.0, -1.0));
            color += SampleClamped(uv + halfTexel * float2(0.0, -2.0)) * 2.0;
            color += SampleClamped(uv + halfTexel * float2(1.0, -1.0));
            color += SampleClamped(uv + halfTexel * float2(2.0, 0.0)) * 2.0;
            color += SampleClamped(uv + halfTexel * float2(1.0, 1.0));
            color += SampleClamped(uv + halfTexel * float2(0.0, 2.0)) * 2.0;
            color += SampleClamped(uv + halfTexel * float2(-1.0, 1.0));
            return color / 12.0;
        }
        ENDHLSL

        Pass
        {
            Name "Tango Glass Blur Downsample"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Downsample
            ENDHLSL
        }

        Pass
        {
            Name "Tango Glass Blur Upsample"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Upsample
            ENDHLSL
        }
    }
}
