Shader "TangoMvp/SceneGlass"
{
    Properties
    {
        [HideInInspector] _TangoFillColor("Tango Fill", Color) = (0.004392, 0.004392, 0.005182, 0.78)
        [HideInInspector] _TangoSaturation("Tango Saturation", Float) = 1.5
        [HideInInspector] _TangoSheenAlpha("Tango Sheen Alpha", Float) = 0.015
        [HideInInspector] _TangoRimAlpha("Tango Rim Alpha", Float) = 0.06
        [HideInInspector] _TangoFallbackAlpha("Tango Fallback Alpha", Float) = 0.72
        [HideInInspector] _TangoEdgeStrength("Tango Edge Strength", Float) = 0.65
        [HideInInspector] _TangoEdgeRoughness("Tango Edge Roughness", Float) = 0.14
        [HideInInspector] _TangoInteriorStrength("Tango Interior Strength", Float) = 0.14
        [HideInInspector] _TangoInteriorRoughness("Tango Interior Roughness", Float) = 0.42
        [HideInInspector] _TangoLightColorResponse("Tango Light Color Response", Float) = 1.0
        [HideInInspector] _TangoReflectionCeiling("Tango Reflection Ceiling", Float) = 1.25
        [HideInInspector] _TangoDesktopAdditionalLightLimit("Tango Desktop Light Limit", Float) = 4
        [HideInInspector] _TangoMobileAdditionalLightLimit("Tango Mobile Light Limit", Float) = 1
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
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "TangoGlassLighting.hlsl"

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
                half _TangoEdgeStrength;
                half _TangoEdgeRoughness;
                half _TangoInteriorStrength;
                half _TangoInteriorRoughness;
                half _TangoLightColorResponse;
                half _TangoReflectionCeiling;
                half _TangoDesktopAdditionalLightLimit;
                half _TangoMobileAdditionalLightLimit;
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
                half fresnel = pow(1.0h - saturate(dot(normalWS, viewDirectionWS)), 5.0h);

                half rimMask = 1.0h - smoothstep(0.25h, 1.25h, EdgeDistancePixels(input.paneUv));
                half topDistancePixels = (1.0h - input.paneUv.y) /
                    max(fwidth(input.paneUv.y), 0.00001h);
                half topInset = (1.0h - smoothstep(0.25h, 1.75h, topDistancePixels)) * 0.05h;
                half lowerInteriorWash = (1.0h - smoothstep(0.0h, 0.32h, input.paneUv.y)) * 0.01h;
                half diagonal = input.paneUv.x + input.paneUv.y * 0.57735h;
                half sheen = (1.0h - smoothstep(0.0h, 0.42h, abs(diagonal - 0.52h))) * _TangoSheenAlpha;

                additiveLighting = topInset;
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
                TangoGlassLightingParameters lightingParameters;
                lightingParameters.edgeStrength = _TangoEdgeStrength;
                lightingParameters.edgeRoughness = _TangoEdgeRoughness;
                lightingParameters.interiorStrength = _TangoInteriorStrength;
                lightingParameters.interiorRoughness = _TangoInteriorRoughness;
                lightingParameters.lightColorResponse = _TangoLightColorResponse;
                lightingParameters.reflectionCeiling = _TangoReflectionCeiling;
                lightingParameters.desktopAdditionalLightLimit = _TangoDesktopAdditionalLightLimit;
                lightingParameters.mobileAdditionalLightLimit = _TangoMobileAdditionalLightLimit;
                additiveLighting += EvaluateTangoGlassLighting(
                    input.positionWS,
                    GetNormalizedScreenSpaceUV(input.positionCS),
                    normalize(input.normalWS),
                    GetWorldSpaceNormalizeViewDir(input.positionWS),
                    input.shellRegion,
                    lightingParameters);
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
