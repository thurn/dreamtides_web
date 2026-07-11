using NUnit.Framework;
using TangoMvp.Motion;
using UnityEngine;

namespace TangoMvp.Tests
{
    public sealed class TangoCubicBezierTests
    {
        private static readonly Vector2 Control1 = new Vector2(0.16f, 1f);
        private static readonly Vector2 Control2 = new Vector2(0.3f, 1f);

        [Test]
        public void Evaluate_MapsCurveEndpointsExactly()
        {
            Assert.That(TangoCubicBezier.Evaluate(0f, Control1, Control2), Is.EqualTo(0f));
            Assert.That(TangoCubicBezier.Evaluate(1f, Control1, Control2), Is.EqualTo(1f));
        }

        [Test]
        public void Evaluate_IsFiniteMonotonicAndDeterministic()
        {
            float previous = -1f;
            for (int sample = 0; sample <= 100; sample++)
            {
                float progress = sample / 100f;
                float first = TangoCubicBezier.Evaluate(progress, Control1, Control2);
                float second = TangoCubicBezier.Evaluate(progress, Control1, Control2);

                Assert.That(float.IsNaN(first) || float.IsInfinity(first), Is.False, $"sample {sample}");
                Assert.That(first, Is.GreaterThanOrEqualTo(previous), $"sample {sample}");
                Assert.That(second, Is.EqualTo(first), $"sample {sample}");
                previous = first;
            }
        }

        [Test]
        public void Evaluate_SolvesBezierXForClockProgress()
        {
            for (int sample = 1; sample < 100; sample++)
            {
                float progress = sample / 100f;
                float eased = TangoCubicBezier.Evaluate(progress, Control1, Control2);
                double expected = ReferenceEvaluate(progress);

                Assert.That(eased, Is.EqualTo(expected).Within(0.00002), $"sample {sample}");
            }
        }

        private static double ReferenceEvaluate(double progress)
        {
            double lower = 0d;
            double upper = 1d;
            for (int iteration = 0; iteration < 80; iteration++)
            {
                double parameter = (lower + upper) * 0.5d;
                if (Cubic(parameter, Control1.x, Control2.x) < progress)
                {
                    lower = parameter;
                }
                else
                {
                    upper = parameter;
                }
            }

            return Cubic((lower + upper) * 0.5d, Control1.y, Control2.y);
        }

        private static double Cubic(double parameter, double control1, double control2)
        {
            double inverse = 1d - parameter;
            return 3f * inverse * inverse * parameter * control1
                + 3f * inverse * parameter * parameter * control2
                + parameter * parameter * parameter;
        }
    }
}
