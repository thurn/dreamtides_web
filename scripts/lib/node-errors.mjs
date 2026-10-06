/**
 * Reads a field of a thrown value, such as the `code` of a Node.js system
 * error or the exit `status` of a failed `execFileSync`. Thrown values are
 * `unknown`, so anything that is not an object carrying `field` reads as
 * `undefined`.
 *
 * @param {unknown} error
 * @param {"code" | "status"} field
 * @returns {unknown}
 */
export function thrownField(error, field) {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return undefined;
  }
  return /** @type {Record<string, unknown>} */ (error)[field];
}
