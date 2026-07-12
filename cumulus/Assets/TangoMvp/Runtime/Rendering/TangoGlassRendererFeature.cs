using TangoMvp.Diagnostics;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.RenderGraphModule.Util;
using UnityEngine.Rendering.Universal;

namespace TangoMvp.Rendering
{
    public sealed class TangoGlassRendererFeature : ScriptableRendererFeature
    {
        private const float BlurSupportOutputPixels = 22f;
        private const int PyramidLevelCount = 4;

        [SerializeField]
        private Material blurMaterial;

        private TangoGlassBlurPass blurPass;
        private bool cameraCallbackSubscribed;

        public override void Create()
        {
            SubscribeCameraCallback();
            if (!isActive)
            {
                ResetAvailability();
            }

            blurPass = new TangoGlassBlurPass
            {
                renderPassEvent = RenderPassEvent.BeforeRenderingTransparents,
                requiresIntermediateTexture = true,
            };
        }

        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            if (blurMaterial == null || renderingData.cameraData.cameraType != CameraType.Game)
            {
                ResetAvailability();
                return;
            }

            blurPass.Setup(blurMaterial);
            renderer.EnqueuePass(blurPass);
        }

        protected override void Dispose(bool disposing)
        {
            UnsubscribeCameraCallback();
            ResetAvailability();
            blurPass = null;
        }

        private void OnDisable()
        {
            UnsubscribeCameraCallback();
            ResetAvailability();
        }

        private void SubscribeCameraCallback()
        {
            if (cameraCallbackSubscribed)
            {
                return;
            }

            RenderPipelineManager.beginCameraRendering += OnBeginCameraRendering;
            cameraCallbackSubscribed = true;
        }

        private void UnsubscribeCameraCallback()
        {
            if (!cameraCallbackSubscribed)
            {
                return;
            }

            RenderPipelineManager.beginCameraRendering -= OnBeginCameraRendering;
            cameraCallbackSubscribed = false;
        }

        private void OnBeginCameraRendering(ScriptableRenderContext context, Camera camera)
        {
            if (!isActive)
            {
                ResetAvailability();
            }
        }

        private static void ResetAvailability()
        {
            Shader.SetGlobalFloat(TangoGlassShaderIds.Available, 0f);
        }

        private sealed class TangoGlassBlurPass : ScriptableRenderPass
        {
            private const string GlobalsPassName = "Tango Glass Publish Globals";
            private const string ActiveMode = "RenderGraph";
            private const RenderGraphUtils.FullScreenGeometryType BlurGeometry =
                RenderGraphUtils.FullScreenGeometryType.ProceduralTriangle;

            private Material material;
            private bool initializationLogged;

            public void Setup(Material blurMaterial)
            {
                material = blurMaterial;
            }

            public override void RecordRenderGraph(RenderGraph renderGraph, ContextContainer frameData)
            {
                UniversalResourceData resourceData = frameData.Get<UniversalResourceData>();
                UniversalCameraData cameraData = frameData.Get<UniversalCameraData>();
                Camera camera = cameraData.camera;
                RenderTextureDescriptor inputDescriptor = cameraData.cameraTargetDescriptor;
                RenderTextureDescriptor halfDescriptor = TangoGlassBlurDescriptor.Create(inputDescriptor);
                RenderTextureDescriptor quarterDescriptor = TangoGlassBlurDescriptor.Create(halfDescriptor);
                RenderTextureDescriptor eighthDescriptor = TangoGlassBlurDescriptor.Create(quarterDescriptor);
                RenderTextureDescriptor sixteenthDescriptor = TangoGlassBlurDescriptor.Create(eighthDescriptor);

                if (!initializationLogged)
                {
                    Debug.Log(
                        $"Tango glass blur initialized: camera={camera.name}, " +
                        $"input={inputDescriptor.width}x{inputDescriptor.height}, " +
                        $"output={halfDescriptor.width}x{halfDescriptor.height}, " +
                        $"pyramidLevels={PyramidLevelCount}, " +
                        $"supportOutputPixels={BlurSupportOutputPixels}, mode={ActiveMode}");
                    initializationLogged = true;
                }

                TextureHandle source = resourceData.activeColorTexture;
                if (resourceData.isActiveTargetBackBuffer || !source.IsValid() || material == null)
                {
                    Shader.SetGlobalFloat(TangoGlassShaderIds.Available, 0f);
                    PublishDiagnostics(camera, inputDescriptor, halfDescriptor, 0, 0, false);
                    return;
                }

                TextureHandle half = CreateTexture(renderGraph, halfDescriptor, "Tango Glass Blur Half");
                TextureHandle quarter = CreateTexture(renderGraph, quarterDescriptor, "Tango Glass Blur Quarter");
                TextureHandle eighth = CreateTexture(renderGraph, eighthDescriptor, "Tango Glass Blur Eighth");
                TextureHandle sixteenth = CreateTexture(renderGraph, sixteenthDescriptor, "Tango Glass Blur Sixteenth");
                AddBlurPass(renderGraph, source, half, 0, "Tango Glass Blur Downsample 1");
                AddBlurPass(renderGraph, half, quarter, 0, "Tango Glass Blur Downsample 2");
                AddBlurPass(renderGraph, quarter, eighth, 0, "Tango Glass Blur Downsample 3");
                AddBlurPass(renderGraph, eighth, sixteenth, 0, "Tango Glass Blur Downsample 4");

                TextureHandle eighthUp = CreateTexture(renderGraph, eighthDescriptor, "Tango Glass Blur Eighth Up");
                TextureHandle quarterUp = CreateTexture(renderGraph, quarterDescriptor, "Tango Glass Blur Quarter Up");
                TextureHandle blur = CreateTexture(renderGraph, halfDescriptor, "Tango Glass Blur");
                AddBlurPass(renderGraph, sixteenth, eighthUp, 1, "Tango Glass Blur Upsample 3");
                AddBlurPass(renderGraph, eighthUp, quarterUp, 1, "Tango Glass Blur Upsample 2");

                var finalParameters = new RenderGraphUtils.BlitMaterialParameters(
                    quarterUp,
                    blur,
                    material,
                    1,
                    null,
                    BlurGeometry);
                using (var builder = renderGraph.AddBlitPass(
                    finalParameters,
                    "Tango Glass Blur Upsample 1",
                    returnBuilder: true))
                {
                    builder.SetGlobalTextureAfterPass(blur, TangoGlassShaderIds.BlurTexture);
                }

                Vector4 outputTexelSize = new Vector4(
                    1f / halfDescriptor.width,
                    1f / halfDescriptor.height,
                    halfDescriptor.width,
                    halfDescriptor.height);

                using (var builder = renderGraph.AddRasterRenderPass<GlobalsPassData>(
                    GlobalsPassName,
                    out GlobalsPassData passData))
                {
                    passData.blur = blur;
                    passData.texelSize = outputTexelSize;
                    builder.UseTexture(blur, AccessFlags.Read);
                    builder.AllowGlobalStateModification(true);
                    builder.AllowPassCulling(false);
                    builder.SetRenderFunc(static (GlobalsPassData data, RasterGraphContext context) =>
                    {
                        context.cmd.SetGlobalVector(TangoGlassShaderIds.BlurTexelSize, data.texelSize);
                        context.cmd.SetGlobalFloat(TangoGlassShaderIds.Available, 1f);
                    });
                }

                PublishDiagnostics(camera, inputDescriptor, halfDescriptor, PyramidLevelCount, PyramidLevelCount - 1, true);
            }

            private static TextureHandle CreateTexture(
                RenderGraph renderGraph,
                RenderTextureDescriptor descriptor,
                string name)
            {
                return UniversalRenderer.CreateRenderGraphTexture(
                    renderGraph,
                    descriptor,
                    name,
                    false,
                    FilterMode.Bilinear,
                    TextureWrapMode.Clamp);
            }

            private void AddBlurPass(
                RenderGraph renderGraph,
                TextureHandle source,
                TextureHandle destination,
                int materialPass,
                string name)
            {
                var parameters = new RenderGraphUtils.BlitMaterialParameters(
                    source,
                    destination,
                    material,
                    materialPass,
                    null,
                    BlurGeometry);
                renderGraph.AddBlitPass(parameters, name);
            }

            private static void PublishDiagnostics(
                Camera camera,
                RenderTextureDescriptor inputDescriptor,
                RenderTextureDescriptor outputDescriptor,
                int downsamplePassCount,
                int upsamplePassCount,
                bool available)
            {
                TangoGlassDiagnostics.Publish(
                    TangoGlassDiagnostics.GetCameraKey(camera),
                    Time.frameCount,
                    inputDescriptor.width,
                    inputDescriptor.height,
                    outputDescriptor.width,
                    outputDescriptor.height,
                    1,
                    downsamplePassCount,
                    upsamplePassCount,
                    available);
            }

            private sealed class GlobalsPassData
            {
                public TextureHandle blur;
                public Vector4 texelSize;
            }
        }
    }
}
