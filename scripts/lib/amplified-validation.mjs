/** Structural invariants shared by runtime-data generation and catalog audit. */

export const drawAmounts = (text) =>
  [...text.matchAll(/\bDraw(?: up to)?(?: an?| (\d+)) cards?\b/giu)].map(
    (match) => Number(match[1] ?? 1),
  );

export const activatedCosts = (text) =>
  text.split("\n\n").flatMap((paragraph) => {
    const colon = paragraph.indexOf(":");
    if (colon < 0) return [];
    const prefix = paragraph.slice(0, colon);
    if (prefix.startsWith("▸") || !/[●⧗☾❖]/u.test(prefix)) return [];
    return [prefix];
  });

export const namedTriggers = (text) =>
  [...text.matchAll(/▸(?:Dawn|Materialized|Challenge|Night|Dusk)/gu)].map(
    (match) => match[0],
  );

export const cadencePhrases = (text) =>
  [...text.matchAll(/\b(?:Once per turn|the first time|each time)\b/giu)].map(
    (match) => match[0].toLowerCase(),
  );

export const reclaimClauses = (text) =>
  text.split("\n\n").filter((paragraph) => /\bReclaim\b/u.test(paragraph));

export function amplifiedStructuralErrors(base, amplified) {
  const errors = [];
  const baseDraw = drawAmounts(base);
  const amplifiedDraw = drawAmounts(amplified);
  if (
    amplifiedDraw.length > baseDraw.length ||
    amplifiedDraw.some((amount, index) => amount > (baseDraw[index] ?? 0))
  ) {
    errors.push("adds or increases draw");
  }
  for (const [label, collect] of [
    ["an activated ability cost", activatedCosts],
    ["a named trigger", namedTriggers],
    ["trigger cadence", cadencePhrases],
    ["Reclaim text", reclaimClauses],
  ]) {
    if (JSON.stringify(collect(amplified)) !== JSON.stringify(collect(base))) {
      errors.push(`changes ${label}`);
    }
  }
  if (!/\bFast\b/u.test(base) && /\bFast\b/u.test(amplified)) {
    errors.push("adds Fast");
  }
  return errors;
}
