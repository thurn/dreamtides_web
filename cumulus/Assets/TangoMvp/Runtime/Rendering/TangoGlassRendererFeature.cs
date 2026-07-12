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
        private const float BlurRadiusOutputPixels = 44f;

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
            private const string HorizontalPassName = "Tango Glass Blur Horizontal";
            private const string VerticalPassName = "Tango Glass Blur Vertical";
            private const string GlobalsPassName = "Tango Glass Publish Globals";
            private const string ActiveMode = "RenderGraph";
            private const RenderGraphUtils.FullScreenGeometryType BlurGeometry =
                RenderGraphUtils.FullScreenGeometryType.ProceduralTriangle;

            private static readonly int OutputTexelSizeId = Shader.PropertyToID("_TangoBlurOutputTexelSize");
            private static readonly int RadiusId = Shader.PropertyToID("_TangoBlurRadius");

            private readonly MaterialPropertyBlock blurProperties = new MaterialPropertyBlock();
            private Material material;
            private bool initializationLogged;

            public TangoGlassBlurPass()
            {
                // Chromium's 22px backdrop blur calibrates to 44 output pixels
                // of support in this two-pass, half-resolution kernel.
                blurProperties.SetFloat(RadiusId, BlurRadiusOutputPixels * 0.5f);
            }

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
                RenderTextureDescriptor outputDescriptor = TangoGlassBlurDescriptor.Create(inputDescriptor);

                if (!initializationLogged)
                {
                    Debug.Log(
                        $"Tango glass blur initialized: camera={camera.name}, " +
                        $"input={inputDescriptor.width}x{inputDescriptor.height}, " +
                        $"output={outputDescriptor.width}x{outputDescriptor.height}, " +
                        $"radiusOutputPixels={BlurRadiusOutputPixels}, mode={ActiveMode}");
                    initializationLogged = true;
                }

                TextureHandle source = resourceData.activeColorTexture;
                if (resourceData.isActiveTargetBackBuffer || !source.IsValid() || material == null)
                {
                    Shader.SetGlobalFloat(TangoGlassShaderIds.Available, 0f);
                    PublishDiagnostics(camera, inputDescriptor, outputDescriptor, 0, 0, false);
                    return;
                }

                TextureHandle ping = UniversalRenderer.CreateRenderGraphTexture(
                    renderGraph,
                    outputDescriptor,
                    TangoGlassBlurDescriptor.PingResourceName,
                    false,
                    FilterMode.Bilinear,
                    TextureWrapMode.Clamp);
                TextureHandle blur = UniversalRenderer.CreateRenderGraphTexture(
                    renderGraph,
                    outputDescriptor,
                    TangoGlassBlurDescriptor.BlurResourceName,
                    false,
                    FilterMode.Bilinear,
                    TextureWrapMode.Clamp);

                Vector4 outputTexelSize = new Vector4(
                    1f / outputDescriptor.width,
                    1f / outputDescriptor.height,
                    outputDescriptor.width,
                    outputDescriptor.height);
                blurProperties.SetVector(OutputTexelSizeId, outputTexelSize);

                var horizontalParameters = new RenderGraphUtils.BlitMaterialParameters(
                    source,
                    ping,
                    material,
                    0,
                    blurProperties,
                    BlurGeometry);
                renderGraph.AddBlitPass(horizontalParameters, HorizontalPassName);

                var verticalParameters = new RenderGraphUtils.BlitMaterialParameters(
                    ping,
                    blur,
                    material,
                    1,
                    blurProperties,
                    BlurGeometry);
                using (var builder = renderGraph.AddBlitPass(
                    verticalParameters,
                    VerticalPassName,
                    returnBuilder: true))
                {
                    builder.SetGlobalTextureAfterPass(blur, TangoGlassShaderIds.BlurTexture);
                }

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

                PublishDiagnostics(camera, inputDescriptor, outputDescriptor, 1, 1, true);
            }

            private static void PublishDiagnostics(
                Camera camera,
                RenderTextureDescriptor inputDescriptor,
                RenderTextureDescriptor outputDescriptor,
                int horizontalPassCount,
                int verticalPassCount,
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
                    horizontalPassCount,
                    verticalPassCount,
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
