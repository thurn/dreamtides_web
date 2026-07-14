Shader "CumulusMvp/Dreamsign"
{
    Properties
    {
        [HideInInspector] _BaseMap("Dreamsign Art", 2D) = "white" {}
        [HideInInspector] _CumulusDreamsignBrightness("Web Brightness", Float) = 1.08
        [HideInInspector] _CumulusDreamsignSaturation("Web Saturation", Float) = 1.08
        [HideInInspector] _CumulusDreamsignLightStrength("Light Strength", Float) = 0.08
        [HideInInspector] _CumulusDreamsignLightTintStrength("Light Tint Strength", Float) = 0.04
        [HideInInspector] _CumulusDreamsignShadowStrength("Shadow Strength", Float) = 0.28
        [HideInInspector] _CumulusDreamsignAlphaCutoff("Alpha Cutoff", Float) = 0.08
        [HideInInspector] _CumulusDreamsignDesktopAdditionalLightLimit("Desktop Light Limit", Float) = 4
        [HideInInspector] _CumulusDreamsignMobileAdditionalLightLimit("Mobile Light Limit", Float) = 1
    }

    SubShader
    {
        Tags
        {
            "RenderType" = "TransparentCutout"
            "Queue" = "AlphaTest"
            "RenderPipeline" = "UniversalPipeline"
        }

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

        #define CUMULUS_DREAMSIGN_DESKTOP_LIGHT_LIMIT 4
        #define CUMULUS_DREAMSIGN_MOBILE_LIGHT_LIMIT 1

        TEXTURE2D(_BaseMap);
        SAMPLER(sampler_BaseMap);

        CBUFFER_START(UnityPerMaterial)
            float4 _BaseMap_ST;
            half _CumulusDreamsignBrightness;
            half _CumulusDreamsignSaturation;
            half _CumulusDreamsignLightStrength;
            half _CumulusDreamsignLightTintStrength;
            half _CumulusDreamsignShadowStrength;
            half _CumulusDreamsignAlphaCutoff;
            half _CumulusDreamsignDesktopAdditionalLightLimit;
            half _CumulusDreamsignMobileAdditionalLightLimit;
        CBUFFER_END

        half3 CumulusDreamsignParityColor(half3 sampledLinear)
        {
            half3 displayColor = LinearToSRGB(sampledLinear);
            displayColor *= _CumulusDreamsignBrightness;
            half luminance = dot(displayColor, half3(0.2126h, 0.7152h, 0.0722h));
            displayColor = lerp(
                luminance.xxx,
                displayColor,
                _CumulusDreamsignSaturation);
            return SRGBToLinear(saturate(displayColor));
        }

        void AccumulateCumulusDreamsignLight(
            Light light,
            half3 normalWS,
            inout half3 directLighting,
            inout half shadowOcclusion)
        {
            half nDotL = saturate(dot(normalWS, light.direction));
            half unshadowedResponse = nDotL * light.distanceAttenuation;
            directLighting += light.color * unshadowedResponse * light.shadowAttenuation;
            shadowOcclusion = max(
                shadowOcclusion,
                unshadowedResponse * (1.0h - light.shadowAttenuation));
        }

        half3 ApplyCumulusDreamsignLighting(
            half3 parityColor,
            half3 directLighting,
            half shadowOcclusion)
        {
            half3 boundedLighting = directLighting / (1.0h.xxx + directLighting);
            half lightLuminance = dot(boundedLighting, half3(0.2126h, 0.7152h, 0.0722h));
            half3 lightChroma = boundedLighting - lightLuminance.xxx;
            half3 lightModulation = 1.0h.xxx;
            lightModulation += lightLuminance * _CumulusDreamsignLightStrength;
            lightModulation += lightChroma * _CumulusDreamsignLightTintStrength;
            half shadowModulation = 1.0h -
                saturate(shadowOcclusion) * _CumulusDreamsignShadowStrength;
            return parityColor * max(lightModulation, 0.0h.xxx) * shadowModulation;
        }
        ENDHLSL

        Pass
        {
            Name "Cumulus Dreamsign Forward"
            Tags { "LightMode" = "UniversalForwardOnly" }
            Blend One Zero
            ZTest LEqual
            ZWrite On
            Cull Off
            AlphaToMask On

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP

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
                float2 uv : TEXCOORD2;
            };

            Varyings Vert(Attributes input)
            {
                Varyings output;
                VertexPositionInputs positions = GetVertexPositionInputs(input.positionOS.xyz);
                output.positionCS = positions.positionCS;
                output.positionWS = positions.positionWS;
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.uv = TRANSFORM_TEX(input.uv, _BaseMap);
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                half4 sampled = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv);
                clip(sampled.a - _CumulusDreamsignAlphaCutoff);

                half3 normalWS = normalize(input.normalWS);
                half3 directLighting = 0.0h.xxx;
                half shadowOcclusion = 0.0h;
                Light mainLight = GetMainLight(TransformWorldToShadowCoord(input.positionWS));
                AccumulateCumulusDreamsignLight(
                    mainLight,
                    normalWS,
                    directLighting,
                    shadowOcclusion);

                #if defined(_ADDITIONAL_LIGHTS)
                    InputData inputData = (InputData)0;
                    inputData.positionWS = input.positionWS;
                    inputData.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(input.positionCS);
                    uint availableLightCount = GetAdditionalLightsCount();
                    uint evaluatedLightCount = 0u;
                    #if defined(SHADER_API_MOBILE)
                        uint configuredLightLimit = min(
                            (uint)_CumulusDreamsignMobileAdditionalLightLimit,
                            (uint)CUMULUS_DREAMSIGN_MOBILE_LIGHT_LIMIT);
                    #else
                        uint configuredLightLimit = min(
                            (uint)_CumulusDreamsignDesktopAdditionalLightLimit,
                            (uint)CUMULUS_DREAMSIGN_DESKTOP_LIGHT_LIMIT);
                    #endif
                    uint pixelLightCount = min(availableLightCount, configuredLightLimit);

                    LIGHT_LOOP_BEGIN(pixelLightCount)
                        if (evaluatedLightCount >= configuredLightLimit)
                        {
                            break;
                        }
                        #if defined(SHADER_API_MOBILE)
                            Light additionalLight = GetAdditionalLight(lightIndex, input.positionWS);
                            additionalLight.shadowAttenuation = 1.0h;
                        #else
                            Light additionalLight = GetAdditionalLight(
                                lightIndex,
                                input.positionWS,
                                half4(1.0h, 1.0h, 1.0h, 1.0h));
                        #endif
                        AccumulateCumulusDreamsignLight(
                            additionalLight,
                            normalWS,
                            directLighting,
                            shadowOcclusion);
                        evaluatedLightCount++;
                    LIGHT_LOOP_END
                #endif

                half3 parityColor = CumulusDreamsignParityColor(sampled.rgb);
                half3 color = ApplyCumulusDreamsignLighting(
                    parityColor,
                    directLighting,
                    shadowOcclusion);
                return half4(color, sampled.a);
            }
            ENDHLSL
        }

        Pass
        {
            Name "Cumulus Dreamsign Shadow Caster"
            Tags { "LightMode" = "ShadowCaster" }
            ZWrite On
            ZTest LEqual
            ColorMask 0
            Cull Off

            HLSLPROGRAM
            #pragma vertex ShadowVert
            #pragma fragment ShadowFrag
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW

            float3 _LightDirection;
            float3 _LightPosition;

            struct ShadowAttributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct ShadowVaryings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            float4 CumulusDreamsignShadowPosition(float3 positionOS, float3 normalOS)
            {
                float3 positionWS = TransformObjectToWorld(positionOS);
                float3 normalWS = TransformObjectToWorldNormal(normalOS);
                #if defined(_CASTING_PUNCTUAL_LIGHT_SHADOW)
                    float3 lightDirectionWS = normalize(_LightPosition - positionWS);
                #else
                    float3 lightDirectionWS = _LightDirection;
                #endif
                float4 positionCS = TransformWorldToHClip(
                    ApplyShadowBias(positionWS, normalWS, lightDirectionWS));
                return ApplyShadowClamping(positionCS);
            }

            ShadowVaryings ShadowVert(ShadowAttributes input)
            {
                ShadowVaryings output;
                output.positionCS = CumulusDreamsignShadowPosition(
                    input.positionOS.xyz,
                    input.normalOS);
                output.uv = TRANSFORM_TEX(input.uv, _BaseMap);
                return output;
            }

            half4 ShadowFrag(ShadowVaryings input) : SV_Target
            {
                half alpha = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv).a;
                clip(alpha - _CumulusDreamsignAlphaCutoff);
                return 0.0h.xxxx;
            }
            ENDHLSL
        }
    }

    FallBack Off
}
