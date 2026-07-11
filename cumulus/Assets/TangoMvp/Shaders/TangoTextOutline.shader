Shader "TangoMvp/TextOutline"
{
    Properties
    {
        _MainTex("Font Atlas", 2D) = "white" {}
        _OutlineColor("Outline", Color) = (0.006, 0.004, 0.01, 1)
        _OutlineWidth("Outline Width", Float) = 1.5
    }

    SubShader
    {
        Tags
        {
            "Queue" = "Transparent+20"
            "RenderType" = "Transparent"
            "RenderPipeline" = "UniversalPipeline"
        }

        Pass
        {
            Name "Outlined Text"
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Off

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                half4 color : COLOR;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                half4 color : COLOR;
                float2 uv : TEXCOORD0;
            };

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);
            float4 _MainTex_TexelSize;

            CBUFFER_START(UnityPerMaterial)
                half4 _OutlineColor;
                half _OutlineWidth;
            CBUFFER_END

            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.color = input.color;
                output.uv = input.uv;
                return output;
            }

            half SampleAlpha(float2 uv)
            {
                return SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, uv).a;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                float2 offset = _MainTex_TexelSize.xy * _OutlineWidth;
                half glyph = SampleAlpha(input.uv);
                half outline = glyph;
                outline = max(outline, SampleAlpha(input.uv + float2(offset.x, 0.0)));
                outline = max(outline, SampleAlpha(input.uv - float2(offset.x, 0.0)));
                outline = max(outline, SampleAlpha(input.uv + float2(0.0, offset.y)));
                outline = max(outline, SampleAlpha(input.uv - float2(0.0, offset.y)));
                outline = max(outline, SampleAlpha(input.uv + offset));
                outline = max(outline, SampleAlpha(input.uv - offset));
                outline = max(outline, SampleAlpha(input.uv + float2(offset.x, -offset.y)));
                outline = max(outline, SampleAlpha(input.uv + float2(-offset.x, offset.y)));
                half3 color = lerp(_OutlineColor.rgb, input.color.rgb, glyph);
                half alpha = max(glyph * input.color.a, outline * _OutlineColor.a);
                return half4(color, alpha);
            }
            ENDHLSL
        }
    }

    FallBack Off
}
