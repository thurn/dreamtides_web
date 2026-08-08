/** Structural invariants shared by runtime-data generation and catalog audit. */

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

export const discoverCriteria = (text) =>
  [
    ...text.matchAll(
      /\bDiscover\s+(.+?)(?=,\s*then\s+materialize\b|\s+and\s+materialize\b|[.!?]|$)/giu,
    ),
  ].map((match) => match[1].replaceAll(/\s+/gu, " ").trim().toLowerCase());

export function amplifiedStructuralErrors(base, amplified, cardType) {
  const errors = [];
  for (const [label, collect] of [
    ["an activated ability cost", activatedCosts],
    ["a named trigger", namedTriggers],
    ["trigger cadence", cadencePhrases],
    ["Reclaim text", reclaimClauses],
    ["Discover criteria", discoverCriteria],
  ]) {
    if (JSON.stringify(collect(amplified)) !== JSON.stringify(collect(base))) {
      errors.push(`changes ${label}`);
    }
  }
  if (!/\bFast\b/u.test(base) && /\bFast\b/u.test(amplified)) {
    errors.push("adds Fast");
  }
  if (
    cardType === "Event" &&
    !/\bdraws?\b/iu.test(base) &&
    /\bdraws?\b/iu.test(amplified)
  ) {
    errors.push("adds draw to an Event without base draw");
  }
  return errors;
}
