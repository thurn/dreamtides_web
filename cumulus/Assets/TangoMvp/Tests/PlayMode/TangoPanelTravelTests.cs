using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using TangoMvp.Motion;
using UnityEngine;
using UnityEngine.TestTools;

namespace TangoMvp.Tests.PlayMode
{
    public sealed class TangoPanelTravelTests
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
            TangoPanelTravel travel = CreateTravel(out Transform panel, out Transform source, out Transform destination);
            yield return null;

            float outwardDuration = 0f;
            yield return MeasureTravel(travel, duration => outwardDuration = duration);
            Assert.That(outwardDuration, Is.EqualTo(0.42f).Within(0.02f));
            AssertPose(panel, destination);

            float returnDuration = 0f;
            yield return MeasureTravel(travel, duration => returnDuration = duration);
            Assert.That(returnDuration, Is.EqualTo(0.42f).Within(0.02f));
            AssertPose(panel, source);
        }

        [UnityTest]
        public IEnumerator ToggleDestination_InterruptsFromCurrentPoseWithoutSnap()
        {
            TangoPanelTravel travel = CreateTravel(out Transform panel, out Transform source, out _);
            yield return null;

            travel.ToggleDestination();
            float interruptAt = Time.time + 0.14f;
            while (Time.time < interruptAt)
            {
                yield return null;
            }

            Vector3 interruptedPosition = panel.position;
            Quaternion interruptedRotation = panel.rotation;
            Assert.That(Vector3.Distance(interruptedPosition, source.position), Is.GreaterThan(0.1f));

            travel.ToggleDestination();
            AssertVector(panel.position, interruptedPosition);
            Assert.That(Quaternion.Angle(panel.rotation, interruptedRotation), Is.LessThan(0.001f));
            yield return null;
            Assert.That(Vector3.Distance(panel.position, interruptedPosition), Is.LessThan(0.5f));
            Assert.That(Vector3.Distance(panel.position, source.position), Is.GreaterThan(0.01f));

            while (travel.IsTravelling)
            {
                yield return null;
            }

            AssertPose(panel, source);
        }

        private TangoPanelTravel CreateTravel(out Transform panel, out Transform source, out Transform destination)
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
            TangoPanelTravel travel = panelObject.AddComponent<TangoPanelTravel>();
            SetField(travel, "sourceAnchor", source);
            SetField(travel, "destinationAnchor", destination);
            panelObject.SetActive(true);
            return travel;
        }

        private IEnumerator MeasureTravel(TangoPanelTravel travel, System.Action<float> recordDuration)
        {
            float startedAt = Time.time;
            travel.ToggleDestination();
            Assert.That(travel.IsTravelling, Is.True);
            while (travel.IsTravelling)
            {
                yield return null;
            }

            recordDuration(Time.time - startedAt);
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
