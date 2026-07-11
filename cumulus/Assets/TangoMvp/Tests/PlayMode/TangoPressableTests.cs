using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using TangoMvp.Interaction;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.TestTools;

namespace TangoMvp.Tests.PlayMode
{
    public sealed class TangoPressableTests : InputTestFixture
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
        public IEnumerator StateMachine_ScalesOnlyVisualAndPressWinsHover()
        {
            TangoPressable pressable = CreatePressable("state-control", out Transform visual, out Collider collider);
            Vector3 rootScale = pressable.transform.localScale;
            Vector3 visualScale = visual.localScale;
            Bounds initialBounds = collider.bounds;
            yield return null;

            pressable.SetHovered(true);
            AssertVector(visual.localScale, visualScale * 1.03f);
            pressable.BeginPress();
            AssertVector(visual.localScale, visualScale * 0.9f);
            pressable.SetHovered(false);
            AssertVector(visual.localScale, visualScale * 0.9f);

            AssertVector(pressable.transform.localScale, rootScale);
            AssertBounds(collider.bounds, initialBounds);
        }

        [UnityTest]
        public IEnumerator StateMachine_CancelsAwayAndActivatesOnceOver()
        {
            TangoPressable pressable = CreatePressable("confirm-button", out _, out _);
            int activations = 0;
            pressable.Activated.AddListener(() => activations++);
            yield return null;

            pressable.BeginPress();
            Assert.That(pressable.EndPress(false), Is.False);
            Assert.That(activations, Is.Zero);

            pressable.BeginPress();
            LogAssert.Expect(LogType.Log, "TangoPressable activated: confirm-button");
            Assert.That(pressable.EndPress(true), Is.True);
            Assert.That(pressable.EndPress(true), Is.False);
            Assert.That(activations, Is.EqualTo(1));
        }

        [UnityTest]
        public IEnumerator VirtualMouse_ActivatesThroughPointerInteractor()
        {
            Mouse mouse = InputSystem.AddDevice<Mouse>();
            Camera camera = CreateCamera();
            TangoPressable pressable = CreatePressable("pointer-control", out _, out _);
            CreateInteractor(camera);
            int activations = 0;
            pressable.Activated.AddListener(() => activations++);
            Physics.SyncTransforms();
            yield return null;

            Move(mouse.position, camera.WorldToScreenPoint(pressable.transform.position));
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            LogAssert.Expect(LogType.Log, "TangoPressable activated: pointer-control");
            Release(mouse.leftButton);
            yield return null;

            Assert.That(activations, Is.EqualTo(1));
        }

        [UnityTest]
        public IEnumerator VirtualMouse_DragOffCancelsOriginalPress()
        {
            Mouse mouse = InputSystem.AddDevice<Mouse>();
            Camera camera = CreateCamera();
            TangoPressable pressable = CreatePressable("cancel-control", out _, out _);
            CreateInteractor(camera);
            int activations = 0;
            pressable.Activated.AddListener(() => activations++);
            Physics.SyncTransforms();
            yield return null;

            Move(mouse.position, camera.WorldToScreenPoint(pressable.transform.position));
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            Move(mouse.position, new Vector2(1f, 1f));
            yield return null;
            Release(mouse.leftButton);
            yield return null;

            Assert.That(activations, Is.Zero);
        }

        [UnityTest]
        public IEnumerator VirtualMouse_DisabledCameraCancelsPressAndAllowsLaterActivation()
        {
            Mouse mouse = InputSystem.AddDevice<Mouse>();
            Camera camera = CreateCamera();
            TangoPressable pressable = CreatePressable("disabled-camera-control", out Transform visual, out _);
            CreateInteractor(camera);
            int activations = 0;
            pressable.Activated.AddListener(() => activations++);
            Physics.SyncTransforms();
            yield return null;

            Move(mouse.position, camera.WorldToScreenPoint(pressable.transform.position));
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            AssertVector(visual.localScale, new Vector3(1.2f, 0.8f, 1f) * 0.9f);

            camera.enabled = false;
            Release(mouse.leftButton);
            yield return null;
            AssertVector(visual.localScale, new Vector3(1.2f, 0.8f, 1f));
            Assert.That(activations, Is.Zero);

            camera.enabled = true;
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            AssertVector(visual.localScale, new Vector3(1.2f, 0.8f, 1f) * 0.9f);
            LogAssert.Expect(LogType.Log, "TangoPressable activated: disabled-camera-control");
            Release(mouse.leftButton);
            yield return null;
            Assert.That(activations, Is.EqualTo(1));
        }

        [UnityTest]
        public IEnumerator VirtualMouse_RemovedDeviceCancelsPressAndAllowsLaterActivation()
        {
            Mouse mouse = InputSystem.AddDevice<Mouse>();
            Camera camera = CreateCamera();
            TangoPressable pressable = CreatePressable("removed-mouse-control", out Transform visual, out _);
            CreateInteractor(camera);
            int activations = 0;
            pressable.Activated.AddListener(() => activations++);
            Physics.SyncTransforms();
            yield return null;

            Vector2 controlPosition = camera.WorldToScreenPoint(pressable.transform.position);
            Move(mouse.position, controlPosition);
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            AssertVector(visual.localScale, new Vector3(1.2f, 0.8f, 1f) * 0.9f);

            InputSystem.RemoveDevice(mouse);
            yield return null;
            AssertVector(visual.localScale, new Vector3(1.2f, 0.8f, 1f));
            Assert.That(activations, Is.Zero);

            Mouse replacement = InputSystem.AddDevice<Mouse>();
            Move(replacement.position, controlPosition);
            yield return null;
            Press(replacement.leftButton);
            yield return null;
            AssertVector(visual.localScale, new Vector3(1.2f, 0.8f, 1f) * 0.9f);
            LogAssert.Expect(LogType.Log, "TangoPressable activated: removed-mouse-control");
            Release(replacement.leftButton);
            yield return null;
            Assert.That(activations, Is.EqualTo(1));
        }

        [UnityTest]
        public IEnumerator VirtualMouse_DisabledInteractorCancelsPressAndAllowsLaterActivation()
        {
            Mouse mouse = InputSystem.AddDevice<Mouse>();
            Camera camera = CreateCamera();
            TangoPressable pressable = CreatePressable("disabled-interactor-control", out Transform visual, out _);
            TangoPointerInteractor interactor = CreateInteractor(camera);
            int activations = 0;
            pressable.Activated.AddListener(() => activations++);
            Physics.SyncTransforms();
            yield return null;

            Move(mouse.position, camera.WorldToScreenPoint(pressable.transform.position));
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            AssertVector(visual.localScale, new Vector3(1.2f, 0.8f, 1f) * 0.9f);

            interactor.enabled = false;
            AssertVector(visual.localScale, new Vector3(1.2f, 0.8f, 1f));
            Assert.That(activations, Is.Zero);
            Release(mouse.leftButton);
            yield return null;

            interactor.enabled = true;
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            AssertVector(visual.localScale, new Vector3(1.2f, 0.8f, 1f) * 0.9f);
            LogAssert.Expect(LogType.Log, "TangoPressable activated: disabled-interactor-control");
            Release(mouse.leftButton);
            yield return null;
            Assert.That(activations, Is.EqualTo(1));
        }

        private TangoPressable CreatePressable(string semanticId, out Transform visual, out Collider collider)
        {
            GameObject root = Track(new GameObject($"Pressable {semanticId}"));
            root.SetActive(false);
            root.transform.position = Vector3.zero;
            collider = root.AddComponent<BoxCollider>();
            ((BoxCollider)collider).size = new Vector3(2f, 1f, 0.2f);

            GameObject visualObject = Track(new GameObject("Visual"));
            visualObject.transform.SetParent(root.transform, false);
            visualObject.transform.localScale = new Vector3(1.2f, 0.8f, 1f);
            visual = visualObject.transform;

            TangoPressable pressable = root.AddComponent<TangoPressable>();
            SetField(pressable, "semanticId", semanticId);
            SetField(pressable, "hitCollider", collider);
            SetField(pressable, "visual", visual);
            root.SetActive(true);
            return pressable;
        }

        private Camera CreateCamera()
        {
            GameObject cameraObject = Track(new GameObject("Interaction Camera"));
            cameraObject.transform.position = new Vector3(0f, 0f, -10f);
            cameraObject.transform.rotation = Quaternion.identity;
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.orthographic = true;
            camera.orthographicSize = 5f;
            return camera;
        }

        private TangoPointerInteractor CreateInteractor(Camera camera)
        {
            TangoPointerInteractor interactor = camera.gameObject.AddComponent<TangoPointerInteractor>();
            SetField(interactor, "interactionCamera", camera);
            return interactor;
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

        private static void AssertVector(Vector3 actual, Vector3 expected)
        {
            Assert.That(actual.x, Is.EqualTo(expected.x).Within(0.0001f));
            Assert.That(actual.y, Is.EqualTo(expected.y).Within(0.0001f));
            Assert.That(actual.z, Is.EqualTo(expected.z).Within(0.0001f));
        }

        private static void AssertBounds(Bounds actual, Bounds expected)
        {
            AssertVector(actual.center, expected.center);
            AssertVector(actual.size, expected.size);
        }
    }
}
