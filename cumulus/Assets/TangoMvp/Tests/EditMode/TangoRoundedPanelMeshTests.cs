using System;
using NUnit.Framework;
using TangoMvp.Geometry;
using TangoMvp.Materials;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace TangoMvp.Tests
{
    public sealed class TangoRoundedPanelMeshTests
    {
        [Test]
        public void Create_BuildsValidRoundedPanelWithRequestedBounds()
        {
            Mesh mesh = TangoRoundedPanelMesh.Create(4f, 2f, 0.12f, 0.24f, 4);

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
            Mesh ordinaryMesh = TangoRoundedPanelMesh.Create(4f, 2f, 0.12f, 0.24f, 4);
            Mesh largeMesh = TangoRoundedPanelMesh.Create(4f, 2f, 0.12f, 0.24f, 2047);

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
            TangoMaterialLibrary library = ScriptableObject.CreateInstance<TangoMaterialLibrary>();
            Shader shader = Shader.Find("Hidden/InternalErrorShader");
            Material sceneGlass = new Material(shader);
            Material onGlass = new Material(shader);
            Material solidChrome = new Material(shader);

            try
            {
                SerializedObject serializedLibrary = new SerializedObject(library);
                serializedLibrary.FindProperty("sceneGlass").objectReferenceValue = sceneGlass;
                serializedLibrary.FindProperty("onGlass").objectReferenceValue = onGlass;
                serializedLibrary.FindProperty("solidChrome").objectReferenceValue = solidChrome;
                serializedLibrary.ApplyModifiedPropertiesWithoutUndo();

                Assert.That(library.Resolve(TangoMaterialRole.SceneGlass), Is.SameAs(sceneGlass));
                Assert.That(library.Resolve(TangoMaterialRole.OnGlass), Is.SameAs(onGlass));
                Assert.That(library.Resolve(TangoMaterialRole.SolidChrome), Is.SameAs(solidChrome));
                library.Validate();

                serializedLibrary.FindProperty("onGlass").objectReferenceValue = null;
                serializedLibrary.ApplyModifiedPropertiesWithoutUndo();
                InvalidOperationException exception = Assert.Throws<InvalidOperationException>(library.Validate);
                Assert.That(exception.Message, Does.Contain(nameof(TangoMaterialRole.OnGlass)));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(sceneGlass);
                UnityEngine.Object.DestroyImmediate(onGlass);
                UnityEngine.Object.DestroyImmediate(solidChrome);
                UnityEngine.Object.DestroyImmediate(library);
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
                () => TangoRoundedPanelMesh.Create(width, height, depth, cornerRadius, cornerSegments));

            Assert.That(exception.ParamName, Is.EqualTo(parameterName));
        }

        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }
    }
}
