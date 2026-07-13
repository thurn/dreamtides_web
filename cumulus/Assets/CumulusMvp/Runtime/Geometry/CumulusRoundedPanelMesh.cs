using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CumulusMvp.Geometry
{
    public static class CumulusRoundedPanelMesh
    {
        private const int FrontSubmesh = 0;
        private const int BackSubmesh = 1;
        private const int BevelSubmesh = 2;

        public static Mesh Create(
            float width,
            float height,
            float depth,
            float cornerRadius,
            int cornerSegments)
        {
            ValidateDimensions(width, height, depth, cornerRadius, cornerSegments);

            float halfWidth = width * 0.5f;
            float halfHeight = height * 0.5f;
            float halfDepth = depth * 0.5f;
            float bevel = depth * 0.25f;
            float faceHalfWidth = halfWidth - bevel;
            float faceHalfHeight = halfHeight - bevel;
            float faceRadius = cornerRadius - bevel;

            List<OutlineVertex> outerOutline = CreateOutline(halfWidth, halfHeight, cornerRadius, cornerSegments);
            List<OutlineVertex> faceOutline = CreateOutline(faceHalfWidth, faceHalfHeight, faceRadius, cornerSegments);
            int outlineCount = outerOutline.Count;

            var vertices = new List<Vector3>(2 + outlineCount * 8);
            var normals = new List<Vector3>(2 + outlineCount * 8);
            var uvs = new List<Vector2>(2 + outlineCount * 8);
            var shellRegions = new List<Vector2>(2 + outlineCount * 8);
            var frontTriangles = new List<int>(outlineCount * 3);
            var backTriangles = new List<int>(outlineCount * 3);
            var bevelTriangles = new List<int>(outlineCount * 18);

            int frontCenter = AddVertex(vertices, normals, uvs, Vector2.zero, halfDepth, Vector3.forward, new Vector2(0.5f, 0.5f));
            int frontFaceRing = AddFaceRing(vertices, normals, uvs, faceOutline, halfDepth, Vector3.forward, faceHalfWidth, faceHalfHeight);
            AddFan(frontTriangles, frontCenter, frontFaceRing, outlineCount, false);

            int backCenter = AddVertex(vertices, normals, uvs, Vector2.zero, -halfDepth, Vector3.back, new Vector2(0.5f, 0.5f));
            int backFaceRing = AddFaceRing(vertices, normals, uvs, faceOutline, -halfDepth, Vector3.back, faceHalfWidth, faceHalfHeight);
            AddFan(backTriangles, backCenter, backFaceRing, outlineCount, true);

            float outerFrontZ = halfDepth - bevel;
            int frontBevelInnerRing = AddBevelRing(vertices, normals, uvs, faceOutline, halfDepth, 1f);
            int frontBevelOuterRing = AddBevelRing(vertices, normals, uvs, outerOutline, outerFrontZ, 1f);
            AddRingBridge(bevelTriangles, frontBevelInnerRing, frontBevelOuterRing, outlineCount, false);

            int sideFrontRing = AddSideRing(vertices, normals, uvs, outerOutline, outerFrontZ, 1f);
            int sideBackRing = AddSideRing(vertices, normals, uvs, outerOutline, -outerFrontZ, 0f);
            AddRingBridge(bevelTriangles, sideFrontRing, sideBackRing, outlineCount, false);

            int backBevelOuterRing = AddBevelRing(vertices, normals, uvs, outerOutline, -outerFrontZ, -1f);
            int backBevelInnerRing = AddBevelRing(vertices, normals, uvs, faceOutline, -halfDepth, -1f);
            AddRingBridge(bevelTriangles, backBevelOuterRing, backBevelInnerRing, outlineCount, false);

            int faceVertexCount = 2 + outlineCount * 2;
            for (int index = 0; index < vertices.Count; index++)
            {
                shellRegions.Add(new Vector2(index < faceVertexCount ? 0f : 1f, 0f));
            }

            var mesh = new Mesh
            {
                name = $"Cumulus Rounded Panel {width:0.###}x{height:0.###}x{depth:0.###}",
                indexFormat = vertices.Count > ushort.MaxValue ? IndexFormat.UInt32 : IndexFormat.UInt16
            };
            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetUVs(1, shellRegions);
            mesh.subMeshCount = 3;
            mesh.SetTriangles(frontTriangles, FrontSubmesh, false);
            mesh.SetTriangles(backTriangles, BackSubmesh, false);
            mesh.SetTriangles(bevelTriangles, BevelSubmesh, false);
            mesh.RecalculateBounds();
            return mesh;
        }

        private static void ValidateDimensions(float width, float height, float depth, float cornerRadius, int cornerSegments)
        {
            if (!IsFinite(width) || !(width > 0f))
            {
                throw new ArgumentOutOfRangeException(nameof(width));
            }

            if (!IsFinite(height) || !(height > 0f))
            {
                throw new ArgumentOutOfRangeException(nameof(height));
            }

            if (!IsFinite(depth) || !(depth > 0f))
            {
                throw new ArgumentOutOfRangeException(nameof(depth));
            }

            float maximumRadius = Mathf.Min(width, height) * 0.5f;
            if (!IsFinite(cornerRadius) || !(cornerRadius > 0f) || !(cornerRadius < maximumRadius))
            {
                throw new ArgumentOutOfRangeException(nameof(cornerRadius));
            }

            if (depth > cornerRadius)
            {
                throw new ArgumentOutOfRangeException(nameof(depth));
            }

            if (cornerSegments < 2)
            {
                throw new ArgumentOutOfRangeException(nameof(cornerSegments));
            }
        }

        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }

        private static List<OutlineVertex> CreateOutline(float halfWidth, float halfHeight, float radius, int cornerSegments)
        {
            var outline = new List<OutlineVertex>(4 * (cornerSegments + 1));
            AddCorner(outline, new Vector2(halfWidth - radius, -halfHeight + radius), -90f, cornerSegments, radius);
            AddCorner(outline, new Vector2(halfWidth - radius, halfHeight - radius), 0f, cornerSegments, radius);
            AddCorner(outline, new Vector2(-halfWidth + radius, halfHeight - radius), 90f, cornerSegments, radius);
            AddCorner(outline, new Vector2(-halfWidth + radius, -halfHeight + radius), 180f, cornerSegments, radius);
            return outline;
        }

        private static void AddCorner(
            ICollection<OutlineVertex> outline,
            Vector2 center,
            float startingAngle,
            int cornerSegments,
            float radius)
        {
            for (int segment = 0; segment <= cornerSegments; segment++)
            {
                float angle = (startingAngle + 90f * segment / cornerSegments) * Mathf.Deg2Rad;
                var outward = new Vector2(Mathf.Cos(angle), Mathf.Sin(angle));
                outline.Add(new OutlineVertex(center + outward * radius, outward));
            }
        }

        private static int AddFaceRing(
            List<Vector3> vertices,
            List<Vector3> normals,
            List<Vector2> uvs,
            IReadOnlyList<OutlineVertex> outline,
            float z,
            Vector3 normal,
            float halfWidth,
            float halfHeight)
        {
            int firstIndex = vertices.Count;
            foreach (OutlineVertex item in outline)
            {
                var uv = new Vector2(
                    (item.Position.x + halfWidth) / (halfWidth * 2f),
                    (item.Position.y + halfHeight) / (halfHeight * 2f));
                AddVertex(vertices, normals, uvs, item.Position, z, normal, uv);
            }

            return firstIndex;
        }

        private static int AddBevelRing(
            List<Vector3> vertices,
            List<Vector3> normals,
            List<Vector2> uvs,
            IReadOnlyList<OutlineVertex> outline,
            float z,
            float zNormal)
        {
            int firstIndex = vertices.Count;
            for (int i = 0; i < outline.Count; i++)
            {
                OutlineVertex item = outline[i];
                Vector3 normal = new Vector3(item.Outward.x, item.Outward.y, zNormal).normalized;
                AddVertex(vertices, normals, uvs, item.Position, z, normal, new Vector2((float)i / outline.Count, zNormal > 0f ? 1f : 0f));
            }

            return firstIndex;
        }

        private static int AddSideRing(
            List<Vector3> vertices,
            List<Vector3> normals,
            List<Vector2> uvs,
            IReadOnlyList<OutlineVertex> outline,
            float z,
            float v)
        {
            int firstIndex = vertices.Count;
            for (int i = 0; i < outline.Count; i++)
            {
                OutlineVertex item = outline[i];
                Vector3 normal = new Vector3(item.Outward.x, item.Outward.y, 0f);
                AddVertex(vertices, normals, uvs, item.Position, z, normal, new Vector2((float)i / outline.Count, v));
            }

            return firstIndex;
        }

        private static int AddVertex(
            ICollection<Vector3> vertices,
            ICollection<Vector3> normals,
            ICollection<Vector2> uvs,
            Vector2 position,
            float z,
            Vector3 normal,
            Vector2 uv)
        {
            int index = vertices.Count;
            vertices.Add(new Vector3(position.x, position.y, z));
            normals.Add(normal);
            uvs.Add(uv);
            return index;
        }

        private static void AddFan(List<int> triangles, int center, int ring, int count, bool reverse)
        {
            for (int i = 0; i < count; i++)
            {
                int next = (i + 1) % count;
                triangles.Add(center);
                triangles.Add(ring + (reverse ? next : i));
                triangles.Add(ring + (reverse ? i : next));
            }
        }

        private static void AddRingBridge(List<int> triangles, int firstRing, int secondRing, int count, bool reverse)
        {
            for (int i = 0; i < count; i++)
            {
                int next = (i + 1) % count;
                if (reverse)
                {
                    triangles.Add(firstRing + i);
                    triangles.Add(secondRing + next);
                    triangles.Add(secondRing + i);
                    triangles.Add(firstRing + i);
                    triangles.Add(firstRing + next);
                    triangles.Add(secondRing + next);
                }
                else
                {
                    triangles.Add(firstRing + i);
                    triangles.Add(secondRing + i);
                    triangles.Add(secondRing + next);
                    triangles.Add(firstRing + i);
                    triangles.Add(secondRing + next);
                    triangles.Add(firstRing + next);
                }
            }
        }

        private readonly struct OutlineVertex
        {
            public OutlineVertex(Vector2 position, Vector2 outward)
            {
                Position = position;
                Outward = outward;
            }

            public Vector2 Position { get; }
            public Vector2 Outward { get; }
        }
    }
}
