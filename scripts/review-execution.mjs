/**
 * Drain every independent review step before reporting failure, so callers
 * can restore prepared assets after every consumer has finished.
 *
 * @param {import("./review-plan.mjs").ReviewStep[]} steps
 * @param {(step: string, args: string[]) => Promise<number>} runStep
 * @returns {Promise<number>}
 */
export async function runConcurrentReviewSteps(steps, runStep) {
  const results = await Promise.allSettled(
    steps.map(({ step, args }) => runStep(step, args)),
  );
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected !== undefined) {
    throw new Error("Review step could not run", {
      cause: /** @type {unknown} */ (rejected.reason),
    });
  }
  for (const result of results) {
    if (result.status === "fulfilled" && result.value !== 0) return result.value;
  }
  return 0;
}
