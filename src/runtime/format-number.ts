/**
 * Formats a number for player-facing text: the shortest round-trip decimal
 * representation, with comma thousands separators on the integer part
 * (`1000` → `"1,000"`, `-2.5` → `"-2.5"`).
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("formatNumber requires a finite number.");
  }
  const ascii = JSON.stringify(Object.is(value, -0) ? 0 : value);
  const exponentIndex = ascii.search(/[eE]/u);
  const mantissa = exponentIndex < 0 ? ascii : ascii.slice(0, exponentIndex);
  const exponent = exponentIndex < 0 ? "" : ascii.slice(exponentIndex + 1);
  const negative = mantissa.startsWith("-");
  const [integer = "0", fraction] = mantissa.replace(/^-/u, "").split(".");
  const grouped =
    exponent === "" ? integer.replace(/\B(?=(\d{3})+$)/gu, ",") : integer;
  return `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `.${fraction}`}${exponent === "" ? "" : `E${exponent}`}`;
}
