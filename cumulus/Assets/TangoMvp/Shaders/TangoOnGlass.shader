Shader "TangoMvp/OnGlass"
{
    Properties
    {
        [HideInInspector] _TangoLensColor("Tango Lens", Color) = (0.001214, 0.001214, 0.001821, 0.13)
        [HideInInspector] _TangoRimAlpha("Tango Rim Alpha", Float) = 0.08
        [HideInInspector] _TangoHighlightAlpha("Tango Highlight Alpha", Float) = 0.10
        [HideInInspector] _TangoEdgeStrength("Tango Edge Strength", Float) = 0.42
        [HideInInspector] _TangoEdgeRoughness("Tango Edge Roughness", Float) = 0.20
        [HideInInspector] _TangoInteriorStrength("Tango Interior Strength", Float) = 0.08
        [HideInInspector] _TangoInteriorRoughness("Tango Interior Roughness", Float) = 0.52
        [HideInInspector] _TangoLightColorResponse("Tango Light Color Response", Float) = 0.85
        [HideInInspector] _TangoReflectionCeiling("Tango Reflection Ceiling", Float) = 0.75
        [HideInInspector] _TangoDesktopAdditionalLightLimit("Tango Desktop Light Limit", Float) = 4
        [HideInInspector] _TangoMobileAdditionalLightLimit("Tango Mobile Light Limit", Float) = 1
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
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP
            #pragma shader_feature_local_fragment _TANGO_GLASS_MOBILE_QUALITY

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

            CBUFFER_START(UnityPerMaterial)
                half4 _TangoLensColor;
                half _TangoRimAlpha;
                half _TangoHighlightAlpha;
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

                half highlight = localHighlight * _TangoHighlightAlpha + fresnel * 0.08h;
                TangoGlassLightingParameters lightingParameters;
                lightingParameters.edgeStrength = _TangoEdgeStrength;
                lightingParameters.edgeRoughness = _TangoEdgeRoughness;
                lightingParameters.interiorStrength = _TangoInteriorStrength;
                lightingParameters.interiorRoughness = _TangoInteriorRoughness;
                lightingParameters.lightColorResponse = _TangoLightColorResponse;
                lightingParameters.reflectionCeiling = _TangoReflectionCeiling;
                lightingParameters.desktopAdditionalLightLimit = _TangoDesktopAdditionalLightLimit;
                lightingParameters.mobileAdditionalLightLimit = _TangoMobileAdditionalLightLimit;
                half3 reflectedLighting = EvaluateTangoGlassLighting(
                    input.positionWS,
                    GetNormalizedScreenSpaceUV(input.positionCS),
                    normalWS,
                    viewDirectionWS,
                    input.shellRegion,
                    lightingParameters);
                half4 lens = half4(
                    _TangoLensColor.rgb + highlight,
                    saturate(_TangoLensColor.a + highlight));
                lens.rgb += reflectedLighting / max(lens.a, 0.0001h);
                half rimOpacity = saturate(rim * _TangoRimAlpha);
                return lerp(lens, half4(1.0h, 1.0h, 1.0h, 1.0h), rimOpacity);
            }
            ENDHLSL
        }
    }

    FallBack Off
}
