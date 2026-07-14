using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using CumulusMvp.Motion;
using UnityEngine;
using UnityEngine.TestTools;

namespace CumulusMvp.Tests.PlayMode
{
    public sealed class CumulusPanelTravelTests
    {
        private readonly List<GameObject> objects = new List<GameObject>();

        [UnityTearDown]
        public IEnumerator DestroyObjects()
        {
            for (int index = objects.Count - 1; index >= 0; index--)
            {
                if (objects[index] != null)
                {
                    Object.Destroy(objects[index]);
                }
            }

            objects.Clear();
            yield return null;
        }

        [UnityTest]
        public IEnumerator ToggleDestination_ReachesBothExactAnchorsInReferenceDuration()
        {
            CumulusPanelTravel travel = CreateTravel(out Transform panel, out Transform source, out Transform destination);
            yield return null;

            Assert.That(CumulusPanelTravel.Duration, Is.EqualTo(0.42f));
            travel.ToggleDestination();
            AdvanceTravel(travel, CumulusPanelTravel.Duration * 0.5f);
            Assert.That(travel.IsTravelling, Is.True);
            AdvanceTravel(travel, CumulusPanelTravel.Duration * 0.5f);
            AssertPose(panel, destination);

            travel.ToggleDestination();
            AdvanceTravel(travel, CumulusPanelTravel.Duration);
            AssertPose(panel, source);
        }

        [UnityTest]
        public IEnumerator ToggleDestination_InterruptsFromCurrentPoseWithoutSnap()
        {
            CumulusPanelTravel travel = CreateTravel(out Transform panel, out Transform source, out _);
            yield return null;

            travel.ToggleDestination();
            AdvanceTravel(travel, 0.14f);

            Vector3 interruptedPosition = panel.position;
            Quaternion interruptedRotation = panel.rotation;
            Assert.That(Vector3.Distance(interruptedPosition, source.position), Is.GreaterThan(0.1f));

            travel.ToggleDestination();
            AssertVector(panel.position, interruptedPosition);
            Assert.That(Quaternion.Angle(panel.rotation, interruptedRotation), Is.LessThan(0.001f));
            AdvanceTravel(travel, 0.01f);
            Assert.That(Vector3.Distance(panel.position, interruptedPosition), Is.GreaterThan(0f));
            Assert.That(
                Vector3.Distance(panel.position, source.position),
                Is.LessThan(Vector3.Distance(interruptedPosition, source.position)));

            AdvanceTravel(travel, CumulusPanelTravel.Duration);

            AssertPose(panel, source);
        }

        private CumulusPanelTravel CreateTravel(out Transform panel, out Transform source, out Transform destination)
        {
            source = Track(new GameObject("Source Anchor")).transform;
            source.position = new Vector3(-2f, 1f, 0f);
            source.rotation = Quaternion.Euler(0f, -15f, 0f);

            destination = Track(new GameObject("Destination Anchor")).transform;
            destination.position = new Vector3(3f, -1f, 2f);
            destination.rotation = Quaternion.Euler(12f, 35f, -8f);

            GameObject panelObject = Track(new GameObject("Travelling Panel"));
            panelObject.SetActive(false);
            panel = panelObject.transform;
            panel.SetPositionAndRotation(source.position, source.rotation);
            CumulusPanelTravel travel = panelObject.AddComponent<CumulusPanelTravel>();
            SetField(travel, "sourceAnchor", source);
            SetField(travel, "destinationAnchor", destination);
            panelObject.SetActive(true);
            return travel;
        }

        private static void AdvanceTravel(CumulusPanelTravel travel, float deltaTime)
        {
            MethodInfo advance = typeof(CumulusPanelTravel).GetMethod(
                "Advance",
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(advance, Is.Not.Null, "Missing deterministic travel step");
            advance.Invoke(travel, new object[] { deltaTime });
        }

        private GameObject Track(GameObject gameObject)
        {
            objects.Add(gameObject);
            return gameObject;
        }

        private static void SetField(object target, string name, object value)
        {
            FieldInfo field = target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(field, Is.Not.Null, $"Missing serialized field {name}");
            field.SetValue(target, value);
        }

        private static void AssertPose(Transform actual, Transform expected)
        {
            AssertVector(actual.position, expected.position);
            Assert.That(Quaternion.Angle(actual.rotation, expected.rotation), Is.LessThan(0.001f));
        }

        private static void AssertVector(Vector3 actual, Vector3 expected)
        {
            Assert.That(actual.x, Is.EqualTo(expected.x).Within(0.0001f));
            Assert.That(actual.y, Is.EqualTo(expected.y).Within(0.0001f));
            Assert.That(actual.z, Is.EqualTo(expected.z).Within(0.0001f));
        }
    }
}
