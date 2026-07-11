using System;
using TangoMvp.Materials;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace TangoMvp.Editor
{
    public static class TangoGlassLabBuilder
    {
        private const string MaterialsFolder = "Assets/TangoMvp/Materials";
        private const string SceneGlassPath = MaterialsFolder + "/TangoSceneGlass.mat";
        private const string OnGlassPath = MaterialsFolder + "/TangoOnGlass.mat";
        private const string SolidChromePath = MaterialsFolder + "/TangoSolidChrome.mat";
        private const string BlurPath = MaterialsFolder + "/TangoBlur.mat";
        private const string LibraryPath = MaterialsFolder + "/TangoMaterialLibrary.asset";

        [MenuItem("Tango MVP/Rebuild Shared Materials")]
        public static void RebuildMaterials()
        {
            EnsureFolder(MaterialsFolder);

            Material sceneGlass = GetOrCreateMaterial(SceneGlassPath, RequireShader("TangoMvp/SceneGlass"));
            ConfigureSceneGlass(sceneGlass);

            Material onGlass = GetOrCreateMaterial(OnGlassPath, RequireShader("TangoMvp/OnGlass"));
            ConfigureOnGlass(onGlass);

            Material solidChrome = GetOrCreateMaterial(
                SolidChromePath,
                RequireShader("Universal Render Pipeline/Lit"));
            ConfigureSolidChrome(solidChrome);

            Material blur = GetOrCreateMaterial(BlurPath, RequireShader("TangoMvp/SeparableBlur"));
            ConfigureBlur(blur);

            TangoMaterialLibrary library = GetOrCreateLibrary();
            var serializedLibrary = new SerializedObject(library);
            serializedLibrary.FindProperty("sceneGlass").objectReferenceValue = sceneGlass;
            serializedLibrary.FindProperty("onGlass").objectReferenceValue = onGlass;
            serializedLibrary.FindProperty("solidChrome").objectReferenceValue = solidChrome;
            serializedLibrary.ApplyModifiedPropertiesWithoutUndo();
            library.Validate();
            EditorUtility.SetDirty(library);

            AssetDatabase.SaveAssets();

            // Let URP's material import validation normalize Lit serialization during this
            // rebuild, then reassert the closed role values before the final save.
            AssetDatabase.ImportAsset(SolidChromePath, ImportAssetOptions.ForceUpdate);
            ConfigureSolidChrome(solidChrome);
            AssetDatabase.SaveAssets();
        }

        private static void ConfigureSceneGlass(Material material)
        {
            material.SetColor("_TangoFillColor", new Color(0.055f, 0.055f, 0.063f, 0.54f));
            material.SetFloat("_TangoSaturation", 1.5f);
            material.SetFloat("_TangoSheenAlpha", 0.07f);
            material.SetFloat("_TangoRimAlpha", 0.14f);
            material.SetFloat("_TangoFallbackAlpha", 0.72f);
            material.SetOverrideTag("RenderType", "Transparent");
            material.renderQueue = (int)RenderQueue.Transparent;
            EditorUtility.SetDirty(material);
        }

        private static void ConfigureOnGlass(Material material)
        {
            material.SetColor("_TangoLensColor", new Color(0.10f, 0.09f, 0.12f, 0.20f));
            material.SetFloat("_TangoRimAlpha", 0.22f);
            material.SetFloat("_TangoHighlightAlpha", 0.28f);
            material.SetOverrideTag("RenderType", "Transparent");
            material.renderQueue = (int)RenderQueue.Transparent + 10;
            EditorUtility.SetDirty(material);
        }

        private static void ConfigureSolidChrome(Material material)
        {
            material.SetColor("_BaseColor", new Color(0.025f, 0.014f, 0.040f, 1f));
            material.SetFloat("_Surface", 0f);
            material.SetFloat("_Blend", 0f);
            material.SetFloat("_AlphaClip", 0f);
            material.SetFloat("_Smoothness", 0.72f);
            material.SetFloat("_Metallic", 0.34f);
            material.SetFloat("_Cull", (float)CullMode.Back);
            material.SetFloat("_ZWrite", 1f);
            material.SetOverrideTag("RenderType", "Opaque");
            material.DisableKeyword("_SURFACE_TYPE_TRANSPARENT");
            material.DisableKeyword("_ALPHATEST_ON");
            material.SetShaderPassEnabled("ShadowCaster", true);
            material.renderQueue = (int)RenderQueue.Geometry;
            EditorUtility.SetDirty(material);
        }

        private static void ConfigureBlur(Material material)
        {
            material.renderQueue = -1;
            EditorUtility.SetDirty(material);
        }

        private static Material GetOrCreateMaterial(string path, Shader shader)
        {
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(shader)
                {
                    name = System.IO.Path.GetFileNameWithoutExtension(path),
                };
                AssetDatabase.CreateAsset(material, path);
            }
            else if (material.shader != shader)
            {
                material.shader = shader;
            }

            return material;
        }

        private static TangoMaterialLibrary GetOrCreateLibrary()
        {
            TangoMaterialLibrary library = AssetDatabase.LoadAssetAtPath<TangoMaterialLibrary>(LibraryPath);
            if (library == null)
            {
                library = ScriptableObject.CreateInstance<TangoMaterialLibrary>();
                library.name = "TangoMaterialLibrary";
                AssetDatabase.CreateAsset(library, LibraryPath);
            }

            return library;
        }

        private static Shader RequireShader(string name)
        {
            Shader shader = Shader.Find(name);
            if (shader == null)
            {
                throw new InvalidOperationException($"Required shader '{name}' was not imported.");
            }

            return shader;
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path))
            {
                return;
            }

            string parent = System.IO.Path.GetDirectoryName(path)?.Replace('\\', '/');
            string name = System.IO.Path.GetFileName(path);
            if (string.IsNullOrEmpty(parent) || string.IsNullOrEmpty(name))
            {
                throw new InvalidOperationException($"Cannot create asset folder '{path}'.");
            }

            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, name);
        }
    }
}
