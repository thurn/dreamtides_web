using System;
using System.Collections.Generic;
using NUnit.Framework;
using CumulusMvp.Geometry;
using CumulusMvp.Materials;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace CumulusMvp.Tests
{
    public sealed class CumulusRoundedPanelMeshTests
    {
        [Test]
        public void Create_BuildsValidRoundedPanelWithRequestedBounds()
        {
            Mesh mesh = CumulusRoundedPanelMesh.Create(4f, 2f, 0.12f, 0.24f, 4);

            try
            {
                Assert.That(mesh.subMeshCount, Is.EqualTo(3));
                Assert.That(mesh.GetTriangles(0), Is.Not.Empty, "Front triangles");
                Assert.That(mesh.GetTriangles(1), Is.Not.Empty, "Back triangles");
                Assert.That(mesh.GetTriangles(2), Is.Not.Empty, "Bevel triangles");
                Assert.That(mesh.bounds.size.x, Is.EqualTo(4f).Within(0.001f));
                Assert.That(mesh.bounds.size.y, Is.EqualTo(2f).Within(0.001f));
                Assert.That(mesh.bounds.size.z, Is.EqualTo(0.12f).Within(0.001f));

                foreach (int index in mesh.triangles)
                {
                    Assert.That(index, Is.InRange(0, mesh.vertexCount - 1));
                }

                foreach (Vector3 normal in mesh.normals)
                {
                    Assert.That(IsFinite(normal.x) && IsFinite(normal.y) && IsFinite(normal.z), Is.True);
                }

                var shellRegions = new List<Vector2>();
                mesh.GetUVs(1, shellRegions);
                Assert.That(shellRegions, Has.Count.EqualTo(mesh.vertexCount));
                Assert.That(shellRegions[0].x, Is.Zero, "Front center");
                Assert.That(shellRegions[1 + 4 * 5].x, Is.Zero, "Back center");
                Assert.That(shellRegions[2 + 2 * 4 * 5].x, Is.EqualTo(1f), "Front bevel");
                Assert.That(shellRegions, Has.All.Matches<Vector2>(region =>
                    IsFinite(region.x) && region.x >= 0f && region.x <= 1f));

                Vector3[] vertices = mesh.vertices;
                int[] triangles = mesh.triangles;
                for (int i = 0; i < triangles.Length; i += 3)
                {
                    Vector3 a = vertices[triangles[i]];
                    Vector3 b = vertices[triangles[i + 1]];
                    Vector3 c = vertices[triangles[i + 2]];
                    Assert.That(Vector3.Cross(b - a, c - a).sqrMagnitude, Is.GreaterThan(1e-10f));
                }
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(mesh);
            }
        }

        [Test]
        public void Create_SelectsIndexFormatForVertexCount()
        {
            Mesh ordinaryMesh = CumulusRoundedPanelMesh.Create(4f, 2f, 0.12f, 0.24f, 4);
            Mesh largeMesh = CumulusRoundedPanelMesh.Create(4f, 2f, 0.12f, 0.24f, 2047);

            try
            {
                Assert.That(ordinaryMesh.indexFormat, Is.EqualTo(IndexFormat.UInt16));
                Assert.That(largeMesh.vertexCount, Is.EqualTo(65538));
                Assert.That(largeMesh.indexFormat, Is.EqualTo(IndexFormat.UInt32));
                Assert.That(largeMesh.triangles, Has.All.InRange(0, largeMesh.vertexCount - 1));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(ordinaryMesh);
                UnityEngine.Object.DestroyImmediate(largeMesh);
            }
        }

        [Test]
        public void MaterialLibrary_ResolvesEachRoleAndValidatesAssignments()
        {
            CumulusMaterialLibrary library = ScriptableObject.CreateInstance<CumulusMaterialLibrary>();
            Shader shader = Shader.Find("Hidden/InternalErrorShader");
            Material sceneGlass = new Material(shader);
            Material onGlass = new Material(shader);
            CumulusGlassLightingProfile lightingProfile = ScriptableObject.CreateInstance<CumulusGlassLightingProfile>();

            try
            {
                SerializedObject serializedLibrary = new SerializedObject(library);
                serializedLibrary.FindProperty("sceneGlass").objectReferenceValue = sceneGlass;
                serializedLibrary.FindProperty("onGlass").objectReferenceValue = onGlass;
                serializedLibrary.FindProperty("lightingProfile").objectReferenceValue = lightingProfile;
                serializedLibrary.ApplyModifiedPropertiesWithoutUndo();

                Assert.That(library.Resolve(CumulusMaterialRole.SceneGlass), Is.SameAs(sceneGlass));
                Assert.That(library.Resolve(CumulusMaterialRole.OnGlass), Is.SameAs(onGlass));
                Assert.That(library.LightingProfile, Is.SameAs(lightingProfile));
                library.Validate();

                serializedLibrary.FindProperty("onGlass").objectReferenceValue = null;
                serializedLibrary.ApplyModifiedPropertiesWithoutUndo();
                InvalidOperationException exception = Assert.Throws<InvalidOperationException>(library.Validate);
                Assert.That(exception.Message, Does.Contain(nameof(CumulusMaterialRole.OnGlass)));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(sceneGlass);
                UnityEngine.Object.DestroyImmediate(onGlass);
                UnityEngine.Object.DestroyImmediate(lightingProfile);
                UnityEngine.Object.DestroyImmediate(library);
            }
        }

        [Test]
        public void GlassLightingProfile_HasValidatedRoleAndQualityDefaults()
        {
            CumulusGlassLightingProfile profile = ScriptableObject.CreateInstance<CumulusGlassLightingProfile>();
            try
            {
                Assert.That(CumulusGlassLightingProfile.SettingsVersion, Is.EqualTo(1));
                Assert.That(profile.SceneGlass.EdgeStrength, Is.EqualTo(0.65f));
                Assert.That(profile.SceneGlass.InteriorStrength, Is.EqualTo(0.14f));
                Assert.That(profile.OnGlass.EdgeStrength, Is.EqualTo(0.42f));
                Assert.That(profile.OnGlass.InteriorStrength, Is.EqualTo(0.08f));
                Assert.That(profile.DesktopAdditionalLightLimit, Is.EqualTo(4));
                Assert.That(profile.MobileAdditionalLightLimit, Is.EqualTo(1));
                Assert.That(profile.DesktopAdditionalLightShadows, Is.True);
                Assert.That(profile.ForQuality(CumulusGlassQuality.Mobile).AdditionalLightShadows, Is.False);
                Assert.DoesNotThrow(profile.Validate);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(profile);
            }
        }

        [TestCase(0f, 2f, 0.12f, 0.24f, 4, "width")]
        [TestCase(4f, 0f, 0.12f, 0.24f, 4, "height")]
        [TestCase(4f, 2f, 0f, 0.24f, 4, "depth")]
        [TestCase(4f, 2f, 0.12f, 0f, 4, "cornerRadius")]
        [TestCase(4f, 2f, 0.12f, 1f, 4, "cornerRadius")]
        [TestCase(4f, 2f, 0.25f, 0.24f, 4, "depth")]
        [TestCase(4f, 2f, 0.12f, 0.24f, 1, "cornerSegments")]
        [TestCase(float.PositiveInfinity, 2f, 0.12f, 0.24f, 4, "width")]
        [TestCase(4f, float.PositiveInfinity, 0.12f, 0.24f, 4, "height")]
        [TestCase(4f, 2f, float.PositiveInfinity, 0.24f, 4, "depth")]
        [TestCase(4f, 2f, 0.12f, float.PositiveInfinity, 4, "cornerRadius")]
        [TestCase(float.NaN, 2f, 0.12f, 0.24f, 4, "width")]
        [TestCase(4f, float.NaN, 0.12f, 0.24f, 4, "height")]
        [TestCase(4f, 2f, float.NaN, 0.24f, 4, "depth")]
        [TestCase(4f, 2f, 0.12f, float.NaN, 4, "cornerRadius")]
        public void Create_RejectsInvalidAuthoringInputs(
            float width,
            float height,
            float depth,
            float cornerRadius,
            int cornerSegments,
            string parameterName)
        {
            ArgumentOutOfRangeException exception = Assert.Throws<ArgumentOutOfRangeException>(
                () => CumulusRoundedPanelMesh.Create(width, height, depth, cornerRadius, cornerSegments));

            Assert.That(exception.ParamName, Is.EqualTo(parameterName));
        }

        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }
    }
}
