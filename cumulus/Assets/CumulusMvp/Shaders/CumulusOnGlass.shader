Shader "CumulusMvp/OnGlass"
{
    Properties
    {
        [HideInInspector] _CumulusLensColor("Cumulus Lens", Color) = (0.001214, 0.001214, 0.001821, 0.13)
        [HideInInspector] _CumulusRimAlpha("Cumulus Rim Alpha", Float) = 0.08
        [HideInInspector] _CumulusHighlightAlpha("Cumulus Highlight Alpha", Float) = 0.10
        [HideInInspector] _CumulusEdgeStrength("Cumulus Edge Strength", Float) = 0.42
        [HideInInspector] _CumulusEdgeRoughness("Cumulus Edge Roughness", Float) = 0.20
        [HideInInspector] _CumulusInteriorStrength("Cumulus Interior Strength", Float) = 0.08
        [HideInInspector] _CumulusInteriorRoughness("Cumulus Interior Roughness", Float) = 0.52
        [HideInInspector] _CumulusLightColorResponse("Cumulus Light Color Response", Float) = 0.85
        [HideInInspector] _CumulusReflectionCeiling("Cumulus Reflection Ceiling", Float) = 0.75
        [HideInInspector] _CumulusDesktopAdditionalLightLimit("Cumulus Desktop Light Limit", Float) = 4
        [HideInInspector] _CumulusMobileAdditionalLightLimit("Cumulus Mobile Light Limit", Float) = 1
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
            Name "Cumulus On Glass"
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

            CBUFFER_START(UnityPerMaterial)
                half4 _CumulusLensColor;
                half _CumulusRimAlpha;
                half _CumulusHighlightAlpha;
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

            half4 Frag(Varyings input) : SV_Target
            {
                half2 uvPerPixel = max(fwidth(input.paneUv), half2(0.00001h, 0.00001h));
                half2 edgeDistanceUv = min(input.paneUv, 1.0h - input.paneUv);
                half2 edgeDistancePixels = edgeDistanceUv / uvPerPixel;
                half rim = 1.0h - smoothstep(
                    0.25h,
                    1.25h,
                    min(edgeDistancePixels.x, edgeDistancePixels.y));
                half2 highlightDelta = (input.paneUv - half2(0.36h, 0.78h)) / half2(0.22h, 0.14h);
                half localHighlight = pow(saturate(1.0h - dot(highlightDelta, highlightDelta)), 3.0h);
                half3 normalWS = normalize(input.normalWS);
                half3 viewDirectionWS = GetWorldSpaceNormalizeViewDir(input.positionWS);
                half fresnel = pow(1.0h - saturate(dot(normalWS, viewDirectionWS)), 4.0h);

                half highlight = localHighlight * _CumulusHighlightAlpha + fresnel * 0.08h;
                CumulusGlassLightingParameters lightingParameters;
                lightingParameters.edgeStrength = _CumulusEdgeStrength;
                lightingParameters.edgeRoughness = _CumulusEdgeRoughness;
                lightingParameters.interiorStrength = _CumulusInteriorStrength;
                lightingParameters.interiorRoughness = _CumulusInteriorRoughness;
                lightingParameters.lightColorResponse = _CumulusLightColorResponse;
                lightingParameters.reflectionCeiling = _CumulusReflectionCeiling;
                lightingParameters.desktopAdditionalLightLimit = _CumulusDesktopAdditionalLightLimit;
                lightingParameters.mobileAdditionalLightLimit = _CumulusMobileAdditionalLightLimit;
                half3 reflectedLighting = EvaluateCumulusGlassLighting(
                    input.positionWS,
                    GetNormalizedScreenSpaceUV(input.positionCS),
                    normalWS,
                    viewDirectionWS,
                    input.shellRegion,
                    lightingParameters);
                half4 lens = half4(
                    _CumulusLensColor.rgb + highlight,
                    saturate(_CumulusLensColor.a + highlight));
                lens.rgb += reflectedLighting / max(lens.a, 0.0001h);
                half rimOpacity = saturate(rim * _CumulusRimAlpha);
                return lerp(lens, half4(1.0h, 1.0h, 1.0h, 1.0h), rimOpacity);
            }
            ENDHLSL
        }
    }

    FallBack Off
}
