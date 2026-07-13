using UnityEngine;

namespace CumulusMvp.Motion
{
    public static class CumulusCubicBezier
    {
        private const int NewtonIterations = 8;
        private const int BisectionIterations = 16;
        private const float MinimumDerivative = 0.000001f;

        public static float Evaluate(float progress, Vector2 control1, Vector2 control2)
        {
            if (progress <= 0f)
            {
                return 0f;
            }

            if (progress >= 1f)
            {
                return 1f;
            }

            float parameter = progress;
            bool newtonConverged = false;
            for (int iteration = 0; iteration < NewtonIterations; iteration++)
            {
                float error = Cubic(parameter, control1.x, control2.x) - progress;
                if (Mathf.Abs(error) <= 0.000001f)
                {
                    newtonConverged = true;
                    break;
                }

                float derivative = CubicDerivative(parameter, control1.x, control2.x);
                if (Mathf.Abs(derivative) < MinimumDerivative)
                {
                    break;
                }

                float next = parameter - error / derivative;
                if (next < 0f || next > 1f)
                {
                    break;
                }

                parameter = next;
            }

            if (!newtonConverged)
            {
                float lower = 0f;
                float upper = 1f;
                for (int iteration = 0; iteration < BisectionIterations; iteration++)
                {
                    parameter = (lower + upper) * 0.5f;
                    if (Cubic(parameter, control1.x, control2.x) < progress)
                    {
                        lower = parameter;
                    }
                    else
                    {
                        upper = parameter;
                    }
                }

                parameter = (lower + upper) * 0.5f;
            }

            return Cubic(parameter, control1.y, control2.y);
        }

        private static float Cubic(float parameter, float control1, float control2)
        {
            float inverse = 1f - parameter;
            return 3f * inverse * inverse * parameter * control1
                + 3f * inverse * parameter * parameter * control2
                + parameter * parameter * parameter;
        }

        private static float CubicDerivative(float parameter, float control1, float control2)
        {
            float inverse = 1f - parameter;
            return 3f * inverse * inverse * control1
                + 6f * inverse * parameter * (control2 - control1)
                + 3f * parameter * parameter * (1f - control2);
        }
    }
}
