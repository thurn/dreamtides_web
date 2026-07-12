Shader "TangoMvp/SceneGlass"
{
    Properties
    {
        [HideInInspector] _TangoFillColor("Tango Fill", Color) = (0.004392, 0.004392, 0.005182, 0.78)
        [HideInInspector] _TangoSaturation("Tango Saturation", Float) = 1.5
        [HideInInspector] _TangoSheenAlpha("Tango Sheen Alpha", Float) = 0.015
        [HideInInspector] _TangoRimAlpha("Tango Rim Alpha", Float) = 0.06
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

            half3 SampleTransmission(float4 positionCS)
            {
                float2 screenUv = GetNormalizedScreenSpaceUV(positionCS);
                float2 halfTexel = 0.5 * _TangoGlassBlurTexelSize.xy;
                screenUv = clamp(screenUv, halfTexel, 1.0 - halfTexel);
                half3 blurredSource = SAMPLE_TEXTURE2D_X(
                    _TangoGlassBlurTexture,
                    sampler_TangoGlassBlurTexture,
                    screenUv).rgb;
                half3 saturatedSource = SaturateAroundLuminance(blurredSource);
                return lerp(saturatedSource, _TangoFillColor.rgb, _TangoFillColor.a);
            }

            half EdgeDistancePixels(float2 paneUv)
            {
                half2 uvPerPixel = max(fwidth(paneUv), half2(0.00001h, 0.00001h));
                half2 edgeDistanceUv = min(paneUv, 1.0h - paneUv);
                half2 edgeDistancePixels = edgeDistanceUv / uvPerPixel;
                return min(edgeDistancePixels.x, edgeDistancePixels.y);
            }

            void ComputeShellLighting(Varyings input, out half3 additiveLighting, out half rimOpacity)
            {
                half3 normalWS = normalize(input.normalWS);
                half3 viewDirectionWS = GetWorldSpaceNormalizeViewDir(input.positionWS);
                Light mainLight = GetMainLight(TransformWorldToShadowCoord(input.positionWS));
                half3 halfDirection = SafeNormalize(mainLight.direction + viewDirectionWS);
                half specular = pow(saturate(dot(normalWS, halfDirection)), 64.0h) *
                    mainLight.distanceAttenuation * mainLight.shadowAttenuation;
                half fresnel = pow(1.0h - saturate(dot(normalWS, viewDirectionWS)), 5.0h);

                half rimMask = 1.0h - smoothstep(0.25h, 1.25h, EdgeDistancePixels(input.paneUv));
                half topDistancePixels = (1.0h - input.paneUv.y) /
                    max(fwidth(input.paneUv.y), 0.00001h);
                half topInset = (1.0h - smoothstep(0.25h, 1.75h, topDistancePixels)) * 0.05h;
                half lowerInteriorWash = (1.0h - smoothstep(0.0h, 0.32h, input.paneUv.y)) * 0.01h;
                half diagonal = input.paneUv.x + input.paneUv.y * 0.57735h;
                half sheen = (1.0h - smoothstep(0.0h, 0.42h, abs(diagonal - 0.52h))) * _TangoSheenAlpha;

                additiveLighting = mainLight.color * specular * 0.32h;
                additiveLighting += topInset;
                additiveLighting += lowerInteriorWash;
                additiveLighting += sheen;
                additiveLighting += fresnel * 0.10h;
                rimOpacity = rimMask * _TangoRimAlpha;
            }

            half3 CompositeRim(half3 color, half rimOpacity)
            {
                return lerp(color, 1.0h.xxx, saturate(rimOpacity));
            }

            half4 ComposeFallback(half3 interior, half3 additiveLighting, half rimOpacity)
            {
                half outputAlpha = max(_TangoFallbackAlpha, 0.0001h);
                half3 sourceColor = interior + additiveLighting / outputAlpha;
                return half4(CompositeRim(sourceColor, rimOpacity), outputAlpha);
            }

            half4 Frag(Varyings input) : SV_Target
            {
                half3 additiveLighting;
                half rimOpacity;
                ComputeShellLighting(input, additiveLighting, rimOpacity);
                UNITY_BRANCH
                if (_TangoGlassAvailable < 0.5h)
                {
                    return ComposeFallback(_TangoFillColor.rgb, additiveLighting, rimOpacity);
                }

                half3 transmission = SampleTransmission(input.positionCS);
                return half4(CompositeRim(transmission + additiveLighting, rimOpacity), 1.0h);
            }
            ENDHLSL
        }
    }

    FallBack Off
}
