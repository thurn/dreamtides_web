Shader "TangoMvp/OnGlass"
{
    Properties
    {
        [HideInInspector] _TangoLensColor("Tango Lens", Color) = (0.001214, 0.001214, 0.001821, 0.13)
        [HideInInspector] _TangoRimAlpha("Tango Rim Alpha", Float) = 0.18
        [HideInInspector] _TangoHighlightAlpha("Tango Highlight Alpha", Float) = 0.10
    }

    SubShader
    {
        Tags
        {
            "RenderType" = "Transparent"
            "Queue" = "Transparent+10"
            "RenderPipeline" = "UniversalPipeline"
        }

        Pass
        {
            Name "Tango On Glass"
            Tags { "LightMode" = "UniversalForwardOnly" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZTest LEqual
            ZWrite Off
            Cull Back

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                half3 normalWS : TEXCOORD1;
                float2 paneUv : TEXCOORD2;
            };

            CBUFFER_START(UnityPerMaterial)
                half4 _TangoLensColor;
                half _TangoRimAlpha;
                half _TangoHighlightAlpha;
            CBUFFER_END

            Varyings Vert(Attributes input)
            {
                Varyings output;
                VertexPositionInputs positions = GetVertexPositionInputs(input.positionOS.xyz);
                output.positionCS = positions.positionCS;
                output.positionWS = positions.positionWS;
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.paneUv = input.uv;
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                half2 edgeDistance = min(input.paneUv, 1.0h - input.paneUv);
                half rim = 1.0h - smoothstep(0.0h, 0.055h, min(edgeDistance.x, edgeDistance.y));
                half2 highlightDelta = (input.paneUv - half2(0.36h, 0.78h)) / half2(0.22h, 0.14h);
                half localHighlight = pow(saturate(1.0h - dot(highlightDelta, highlightDelta)), 3.0h);
                half3 normalWS = normalize(input.normalWS);
                half3 viewDirectionWS = GetWorldSpaceNormalizeViewDir(input.positionWS);
                half fresnel = pow(1.0h - saturate(dot(normalWS, viewDirectionWS)), 4.0h);

                half highlight = rim * _TangoRimAlpha + localHighlight * _TangoHighlightAlpha + fresnel * 0.08h;
                return half4(_TangoLensColor.rgb + highlight, saturate(_TangoLensColor.a + highlight));
            }
            ENDHLSL
        }
    }

    FallBack Off
}
