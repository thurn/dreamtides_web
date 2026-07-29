using System.Collections;
using System.Reflection;
using CumulusMvp.Interaction;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace CumulusMvp.Tests.PlayMode
{
    public sealed class CumulusDreamsignAcquisitionMotionTests
    {
        private GameObject root;
        private GameObject cameraObject;

        [UnityTearDown]
        public IEnumerator TearDown()
        {
            if (root != null)
            {
                Object.Destroy(root);
            }

            if (cameraObject != null)
            {
                Object.Destroy(cameraObject);
            }

            yield return null;
        }

        [UnityTest]
        public IEnumerator Activation_ReleasesThenTravelsToBottomRightAtHudScale()
        {
            CumulusDreamsignAcquisitionMotion motion = CreateMotion(
                out CumulusPressable pressable,
                out Transform feedbackVisual,
                out Transform travelVisual,
                out Collider collider,
                out Camera camera);
            yield return null;

            pressable.SetHovered(true);
            AssertVector(feedbackVisual.localScale, Vector3.one * 1.03f);
            pressable.BeginPress();
            AssertVector(feedbackVisual.localScale, Vector3.one * 0.9f);

            LogAssert.Expect(
                LogType.Log,
                "CumulusPressable activated: shop-dreamsign:test-dreamsign-uuid");
            LogAssert.Expect(
                LogType.Log,
                "Dreamsign acquisition started: test-dreamsign-uuid");
            Assert.That(pressable.EndPress(true), Is.True);
            Assert.That(collider.enabled, Is.False);
            Assert.That(pressable.enabled, Is.False);
            AssertVector(travelVisual.localScale, Vector3.one * 0.9f);

            Advance(motion, CumulusDreamsignAcquisitionMotion.ReleaseDuration);
            AssertVector(travelVisual.localScale, Vector3.one * 1.03f);
            AssertVector(root.transform.localPosition, Vector3.zero);

            Vector3 expectedDestination = camera.ViewportToWorldPoint(
                new Vector3(0.94f, 0.1f, camera.WorldToViewportPoint(root.transform.position).z));
            LogAssert.Expect(
                LogType.Log,
                "Dreamsign acquisition completed: test-dreamsign-uuid");
            Advance(motion, CumulusDreamsignAcquisitionMotion.TravelDuration);

            Assert.That(motion.IsComplete, Is.True);
            AssertVector(root.transform.position, expectedDestination);
            AssertVector(
                travelVisual.localScale,
                Vector3.one * CumulusDreamsignAcquisitionMotion.DestinationScaleFactor);
            Assert.That(root.transform.rotation, Is.EqualTo(Quaternion.identity));
        }

        private CumulusDreamsignAcquisitionMotion CreateMotion(
            out CumulusPressable pressable,
            out Transform feedbackVisual,
            out Transform travelVisual,
            out Collider collider,
            out Camera camera)
        {
            cameraObject = new GameObject("Interaction Camera");
            cameraObject.transform.position = new Vector3(0f, 0f, -10f);
            camera = cameraObject.AddComponent<Camera>();
            camera.orthographic = true;
            camera.orthographicSize = 5f;
            camera.aspect = 16f / 9f;

            root = new GameObject("Dreamsign Root");
            root.SetActive(false);
            collider = root.AddComponent<BoxCollider>();

            GameObject travelObject = new GameObject("Travel Visual");
            travelObject.transform.SetParent(root.transform, false);
            travelVisual = travelObject.transform;

            GameObject feedbackObject = new GameObject("Feedback Visual");
            feedbackObject.transform.SetParent(travelVisual, false);
            feedbackVisual = feedbackObject.transform;

            pressable = root.AddComponent<CumulusPressable>();
            SetField(pressable, "semanticId", "shop-dreamsign:test-dreamsign-uuid");
            SetField(pressable, "hitCollider", collider);
            SetField(pressable, "visual", feedbackVisual);

            CumulusDreamsignAcquisitionMotion motion =
                root.AddComponent<CumulusDreamsignAcquisitionMotion>();
            SetField(motion, "dreamsignId", "test-dreamsign-uuid");
            SetField(motion, "targetCamera", camera);
            SetField(motion, "pressable", pressable);
            SetField(motion, "hitCollider", collider);
            SetField(motion, "travelVisual", travelVisual);
            root.SetActive(true);
            return motion;
        }

        private static void Advance(
            CumulusDreamsignAcquisitionMotion motion,
            float deltaSeconds)
        {
            MethodInfo method = typeof(CumulusDreamsignAcquisitionMotion).GetMethod(
                "AdvanceAnimation",
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(method, Is.Not.Null);
            method.Invoke(motion, new object[] { deltaSeconds });
        }

        private static void SetField(object target, string name, object value)
        {
            FieldInfo field = target.GetType().GetField(
                name,
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(field, Is.Not.Null, $"Missing serialized field {name}");
            field.SetValue(target, value);
        }

        private static void AssertVector(Vector3 actual, Vector3 expected)
        {
            Assert.That(actual.x, Is.EqualTo(expected.x).Within(0.0001f));
            Assert.That(actual.y, Is.EqualTo(expected.y).Within(0.0001f));
            Assert.That(actual.z, Is.EqualTo(expected.z).Within(0.0001f));
        }
    }
}
