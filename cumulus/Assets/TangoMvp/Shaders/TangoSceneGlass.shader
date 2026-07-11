Shader "TangoMvp/SceneGlass"
{
    Properties
    {
        [HideInInspector] _TangoFillColor("Tango Fill", Color) = (0.055, 0.055, 0.063, 0.54)
        [HideInInspector] _TangoSaturation("Tango Saturation", Float) = 1.5
        [HideInInspector] _TangoSheenAlpha("Tango Sheen Alpha", Float) = 0.07
        [HideInInspector] _TangoRimAlpha("Tango Rim Alpha", Float) = 0.14
        [HideInInspector] _TangoFallbackAlpha("Tango Fallback Alpha", Float) = 0.72
    }

    SubShader
    {
        Tags
        {
            "RenderType" = "Transparent"
            "Queue" = "Transparent"
            "RenderPipeline" = "UniversalPipeline"
        }

        Pass
        {
            Name "Tango Scene Glass"
            Tags { "LightMode" = "UniversalForwardOnly" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZTest LEqual
            ZWrite Off
            Cull Back

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

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

            TEXTURE2D_X(_TangoGlassBlurTexture);
            SAMPLER(sampler_TangoGlassBlurTexture);
            float4 _TangoGlassBlurTexelSize;
            float _TangoGlassAvailable;

            CBUFFER_START(UnityPerMaterial)
                half4 _TangoFillColor;
                half _TangoSaturation;
                half _TangoSheenAlpha;
                half _TangoRimAlpha;
                half _TangoFallbackAlpha;
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

            half3 SaturateAroundLuminance(half3 color)
            {
                half luminance = dot(color, half3(0.2126h, 0.7152h, 0.0722h));
                return lerp(luminance.xxx, color, _TangoSaturation);
            }

            half4 Frag(Varyings input) : SV_Target
            {
                float2 screenUv = GetNormalizedScreenSpaceUV(input.positionCS);
                float2 halfTexel = 0.5 * _TangoGlassBlurTexelSize.xy;
                screenUv = clamp(screenUv, halfTexel, 1.0 - halfTexel);
                half3 blurredSource = SAMPLE_TEXTURE2D_X(
                    _TangoGlassBlurTexture,
                    sampler_TangoGlassBlurTexture,
                    screenUv).rgb;

                half available = step(0.5h, _TangoGlassAvailable);
                half3 saturatedSource = SaturateAroundLuminance(blurredSource);
                half3 composedBackdrop = lerp(saturatedSource, _TangoFillColor.rgb, _TangoFillColor.a);
                half3 fallbackInterior = _TangoFillColor.rgb;
                half3 transmission = lerp(fallbackInterior, composedBackdrop, available);

                half3 normalWS = normalize(input.normalWS);
                half3 viewDirectionWS = GetWorldSpaceNormalizeViewDir(input.positionWS);
                Light mainLight = GetMainLight(TransformWorldToShadowCoord(input.positionWS));
                half3 halfDirection = SafeNormalize(mainLight.direction + viewDirectionWS);
                half specular = pow(saturate(dot(normalWS, halfDirection)), 64.0h) *
                    mainLight.distanceAttenuation * mainLight.shadowAttenuation;
                half fresnel = pow(1.0h - saturate(dot(normalWS, viewDirectionWS)), 5.0h);

                half2 edgeDistance = min(input.paneUv, 1.0h - input.paneUv);
                half rimMask = 1.0h - smoothstep(0.0h, 0.035h, min(edgeDistance.x, edgeDistance.y));
                half topInset = (1.0h - smoothstep(0.0h, 0.06h, 1.0h - input.paneUv.y)) * 0.22h;
                half diagonal = input.paneUv.x + input.paneUv.y * 0.57735h;
                half sheen = (1.0h - smoothstep(0.0h, 0.42h, abs(diagonal - 0.52h))) * _TangoSheenAlpha;

                half3 shellLighting = mainLight.color * specular * 0.32h;
                shellLighting += rimMask * _TangoRimAlpha;
                shellLighting += topInset;
                shellLighting += sheen;
                shellLighting += fresnel * 0.10h;

                half interiorAlpha = lerp(_TangoFallbackAlpha, 1.0h, available);
                return half4(transmission + shellLighting, interiorAlpha);
            }
            ENDHLSL
        }
    }

    FallBack Off
}
