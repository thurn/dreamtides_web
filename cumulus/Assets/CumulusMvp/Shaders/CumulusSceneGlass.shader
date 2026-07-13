Shader "CumulusMvp/SceneGlass"
{
    Properties
    {
        [HideInInspector] _CumulusFillColor("Cumulus Fill", Color) = (0.004392, 0.004392, 0.005182, 0.78)
        [HideInInspector] _CumulusSaturation("Cumulus Saturation", Float) = 1.5
        [HideInInspector] _CumulusSheenAlpha("Cumulus Sheen Alpha", Float) = 0.015
        [HideInInspector] _CumulusRimAlpha("Cumulus Rim Alpha", Float) = 0.06
        [HideInInspector] _CumulusFallbackAlpha("Cumulus Fallback Alpha", Float) = 0.72
        [HideInInspector] _CumulusEdgeStrength("Cumulus Edge Strength", Float) = 0.65
        [HideInInspector] _CumulusEdgeRoughness("Cumulus Edge Roughness", Float) = 0.14
        [HideInInspector] _CumulusInteriorStrength("Cumulus Interior Strength", Float) = 0.14
        [HideInInspector] _CumulusInteriorRoughness("Cumulus Interior Roughness", Float) = 0.42
        [HideInInspector] _CumulusLightColorResponse("Cumulus Light Color Response", Float) = 1.0
        [HideInInspector] _CumulusReflectionCeiling("Cumulus Reflection Ceiling", Float) = 1.25
        [HideInInspector] _CumulusDesktopAdditionalLightLimit("Cumulus Desktop Light Limit", Float) = 4
        [HideInInspector] _CumulusMobileAdditionalLightLimit("Cumulus Mobile Light Limit", Float) = 1
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
            Name "Cumulus Scene Glass"
            Tags { "LightMode" = "UniversalForwardOnly" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZTest LEqual
            ZWrite Off
            Cull Back

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "CumulusGlassLighting.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
                float2 shellRegion : TEXCOORD1;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                half3 normalWS : TEXCOORD1;
                float2 paneUv : TEXCOORD2;
                half shellRegion : TEXCOORD3;
            };

            TEXTURE2D_X(_CumulusGlassBlurTexture);
            SAMPLER(sampler_CumulusGlassBlurTexture);
            float4 _CumulusGlassBlurTexelSize;
            float _CumulusGlassAvailable;

            CBUFFER_START(UnityPerMaterial)
                half4 _CumulusFillColor;
                half _CumulusSaturation;
                half _CumulusSheenAlpha;
                half _CumulusRimAlpha;
                half _CumulusFallbackAlpha;
                half _CumulusEdgeStrength;
                half _CumulusEdgeRoughness;
                half _CumulusInteriorStrength;
                half _CumulusInteriorRoughness;
                half _CumulusLightColorResponse;
                half _CumulusReflectionCeiling;
                half _CumulusDesktopAdditionalLightLimit;
                half _CumulusMobileAdditionalLightLimit;
            CBUFFER_END

            Varyings Vert(Attributes input)
            {
                Varyings output;
                VertexPositionInputs positions = GetVertexPositionInputs(input.positionOS.xyz);
                output.positionCS = positions.positionCS;
                output.positionWS = positions.positionWS;
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.paneUv = input.uv;
                output.shellRegion = input.shellRegion.x;
                return output;
            }

            half3 SaturateAroundLuminance(half3 color)
            {
                half luminance = dot(color, half3(0.2126h, 0.7152h, 0.0722h));
                return lerp(luminance.xxx, color, _CumulusSaturation);
            }

            half3 SampleTransmission(float4 positionCS)
            {
                float2 screenUv = GetNormalizedScreenSpaceUV(positionCS);
                float2 halfTexel = 0.5 * _CumulusGlassBlurTexelSize.xy;
                screenUv = clamp(screenUv, halfTexel, 1.0 - halfTexel);
                half3 blurredSource = SAMPLE_TEXTURE2D_X(
                    _CumulusGlassBlurTexture,
                    sampler_CumulusGlassBlurTexture,
                    screenUv).rgb;
                half3 saturatedSource = SaturateAroundLuminance(blurredSource);
                return lerp(saturatedSource, _CumulusFillColor.rgb, _CumulusFillColor.a);
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
                half fresnel = pow(1.0h - saturate(dot(normalWS, viewDirectionWS)), 5.0h);

                half rimMask = 1.0h - smoothstep(0.25h, 1.25h, EdgeDistancePixels(input.paneUv));
                half topDistancePixels = (1.0h - input.paneUv.y) /
                    max(fwidth(input.paneUv.y), 0.00001h);
                half topInset = (1.0h - smoothstep(0.25h, 1.75h, topDistancePixels)) * 0.05h;
                half lowerInteriorWash = (1.0h - smoothstep(0.0h, 0.32h, input.paneUv.y)) * 0.01h;
                half diagonal = input.paneUv.x + input.paneUv.y * 0.57735h;
                half sheen = (1.0h - smoothstep(0.0h, 0.42h, abs(diagonal - 0.52h))) * _CumulusSheenAlpha;

                additiveLighting = topInset;
                additiveLighting += lowerInteriorWash;
                additiveLighting += sheen;
                additiveLighting += fresnel * 0.10h;
                rimOpacity = rimMask * _CumulusRimAlpha;
            }

            half3 CompositeRim(half3 color, half rimOpacity)
            {
                return lerp(color, 1.0h.xxx, saturate(rimOpacity));
            }

            half4 ComposeFallback(half3 interior, half3 additiveLighting, half rimOpacity)
            {
                half outputAlpha = max(_CumulusFallbackAlpha, 0.0001h);
                half3 sourceColor = interior + additiveLighting / outputAlpha;
                return half4(CompositeRim(sourceColor, rimOpacity), outputAlpha);
            }

            half4 Frag(Varyings input) : SV_Target
            {
                half3 additiveLighting;
                half rimOpacity;
                ComputeShellLighting(input, additiveLighting, rimOpacity);
                CumulusGlassLightingParameters lightingParameters;
                lightingParameters.edgeStrength = _CumulusEdgeStrength;
                lightingParameters.edgeRoughness = _CumulusEdgeRoughness;
                lightingParameters.interiorStrength = _CumulusInteriorStrength;
                lightingParameters.interiorRoughness = _CumulusInteriorRoughness;
                lightingParameters.lightColorResponse = _CumulusLightColorResponse;
                lightingParameters.reflectionCeiling = _CumulusReflectionCeiling;
                lightingParameters.desktopAdditionalLightLimit = _CumulusDesktopAdditionalLightLimit;
                lightingParameters.mobileAdditionalLightLimit = _CumulusMobileAdditionalLightLimit;
                additiveLighting += EvaluateCumulusGlassLighting(
                    input.positionWS,
                    GetNormalizedScreenSpaceUV(input.positionCS),
                    normalize(input.normalWS),
                    GetWorldSpaceNormalizeViewDir(input.positionWS),
                    input.shellRegion,
                    lightingParameters);
                UNITY_BRANCH
                if (_CumulusGlassAvailable < 0.5h)
                {
                    return ComposeFallback(_CumulusFillColor.rgb, additiveLighting, rimOpacity);
                }

                half3 transmission = SampleTransmission(input.positionCS);
                return half4(CompositeRim(transmission + additiveLighting, rimOpacity), 1.0h);
            }
            ENDHLSL
        }
    }

    FallBack Off
}
