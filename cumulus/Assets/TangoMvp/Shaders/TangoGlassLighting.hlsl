#ifndef TANGO_GLASS_LIGHTING_INCLUDED
#define TANGO_GLASS_LIGHTING_INCLUDED

#define TANGO_GLASS_DESKTOP_LIGHT_LIMIT 4
#define TANGO_GLASS_MOBILE_LIGHT_LIMIT 1

struct TangoGlassLightingParameters
{
    half edgeStrength;
    half edgeRoughness;
    half interiorStrength;
    half interiorRoughness;
    half lightColorResponse;
    half reflectionCeiling;
    half desktopAdditionalLightLimit;
    half mobileAdditionalLightLimit;
};

half TangoGlassGgxSpecular(half3 normalWS, half3 viewDirectionWS, half3 lightDirectionWS, half roughness)
{
    half3 halfDirection = SafeNormalize(viewDirectionWS + lightDirectionWS);
    half nDotL = saturate(dot(normalWS, lightDirectionWS));
    half nDotV = saturate(dot(normalWS, viewDirectionWS));
    half nDotH = saturate(dot(normalWS, halfDirection));
    half vDotH = saturate(dot(viewDirectionWS, halfDirection));
    half alpha = max(roughness * roughness, 0.0004h);
    half alphaSquared = alpha * alpha;
    half denominator = nDotH * nDotH * (alphaSquared - 1.0h) + 1.0h;
    half distribution = alphaSquared / max(PI * denominator * denominator, 0.0001h);
    half k = (roughness + 1.0h);
    k = k * k * 0.125h;
    half visibilityL = nDotL / max(nDotL * (1.0h - k) + k, 0.0001h);
    half visibilityV = nDotV / max(nDotV * (1.0h - k) + k, 0.0001h);
    half fresnel = 0.04h + (1.0h - 0.04h) * Pow5(1.0h - vDotH);
    return distribution * visibilityL * visibilityV * fresnel * nDotL;
}

half3 TangoGlassEvaluateLight(
    Light light,
    half3 normalWS,
    half3 viewDirectionWS,
    half shellRegion,
    TangoGlassLightingParameters parameters)
{
    half edgeLobe = TangoGlassGgxSpecular(
        normalWS,
        viewDirectionWS,
        light.direction,
        parameters.edgeRoughness);
    half interiorLobe = TangoGlassGgxSpecular(
        normalWS,
        viewDirectionWS,
        light.direction,
        parameters.interiorRoughness);
    half edgeWeight = saturate(shellRegion);
    half interiorWeight = 1.0h - edgeWeight;
    half response = edgeWeight * edgeLobe * parameters.edgeStrength;
    response += interiorWeight * interiorLobe * parameters.interiorStrength;
    half lightLuminance = dot(light.color, half3(0.2126h, 0.7152h, 0.0722h));
    half3 responseColor = lerp(
        lightLuminance.xxx,
        light.color,
        saturate(parameters.lightColorResponse));
    return responseColor * response * light.distanceAttenuation * light.shadowAttenuation;
}

half3 TangoGlassApplyLuminanceShoulder(half3 reflected, half ceiling)
{
    reflected = max(reflected, 0.0h.xxx);
    half luminance = dot(reflected, half3(0.2126h, 0.7152h, 0.0722h));
    half safeCeiling = max(ceiling, 0.01h);
    half halfCeiling = safeCeiling * 0.5h;
    if (luminance <= halfCeiling)
    {
        return reflected;
    }

    half excess = luminance - halfCeiling;
    half shouldered = halfCeiling + halfCeiling * excess / (excess + halfCeiling);
    return reflected * (shouldered / max(luminance, 0.0001h));
}

half3 EvaluateTangoGlassLighting(
    float3 positionWS,
    float2 normalizedScreenSpaceUV,
    half3 normalWS,
    half3 viewDirectionWS,
    half shellRegion,
    TangoGlassLightingParameters parameters)
{
    half3 reflected = 0.0h.xxx;
    Light mainLight = GetMainLight(TransformWorldToShadowCoord(positionWS));
    reflected += TangoGlassEvaluateLight(
        mainLight,
        normalWS,
        viewDirectionWS,
        shellRegion,
        parameters);

    #if defined(_ADDITIONAL_LIGHTS)
        InputData inputData = (InputData)0;
        inputData.positionWS = positionWS;
        inputData.normalizedScreenSpaceUV = normalizedScreenSpaceUV;
        uint availableLightCount = GetAdditionalLightsCount();
        uint evaluatedLightCount = 0u;
        #if defined(SHADER_API_MOBILE) || defined(_TANGO_GLASS_MOBILE_QUALITY)
            uint configuredLightLimit = min(
                (uint)parameters.mobileAdditionalLightLimit,
                (uint)TANGO_GLASS_MOBILE_LIGHT_LIMIT);
            uint pixelLightCount = min(availableLightCount, configuredLightLimit);
        #else
            uint configuredLightLimit = min(
                (uint)parameters.desktopAdditionalLightLimit,
                (uint)TANGO_GLASS_DESKTOP_LIGHT_LIMIT);
            uint pixelLightCount = min(availableLightCount, configuredLightLimit);
        #endif

        LIGHT_LOOP_BEGIN(pixelLightCount)
            if (evaluatedLightCount >= configuredLightLimit)
            {
                break;
            }
            #if defined(SHADER_API_MOBILE) || defined(_TANGO_GLASS_MOBILE_QUALITY)
                Light additionalLight = GetAdditionalLight(lightIndex, positionWS);
                additionalLight.shadowAttenuation = 1.0h;
            #else
                Light additionalLight = GetAdditionalLight(lightIndex, positionWS, half4(1.0h, 1.0h, 1.0h, 1.0h));
            #endif
            reflected += TangoGlassEvaluateLight(
                additionalLight,
                normalWS,
                viewDirectionWS,
                shellRegion,
                parameters);
            evaluatedLightCount++;
        LIGHT_LOOP_END
    #endif

    return TangoGlassApplyLuminanceShoulder(reflected, parameters.reflectionCeiling);
}

#endif
