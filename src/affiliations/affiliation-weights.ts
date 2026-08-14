import { logEvent } from "../logging";
import type { AffiliationContent, DreamscapeContent } from "../types/content";
import type { DreamscapeNode } from "../types/journey";
import type { AffiliationId } from "../types/identifiers";

/** Resolve the authored affiliation for a revealed Atlas node. */
export function resolveNodeAffiliation(
  node: DreamscapeNode | null | undefined,
  dreamscapes: readonly DreamscapeContent[],
  affiliations: readonly AffiliationContent[],
): AffiliationContent | null {
  const dreamscapeId = node?.dreamscapeId;
  if (dreamscapeId === null || dreamscapeId === undefined) return null;
  const affiliationId = dreamscapes.find(
    (dreamscape) => dreamscape.id === dreamscapeId,
  )?.affiliationId;
  if (affiliationId === null || affiliationId === undefined) return null;
  return (
    affiliations.find((affiliation) => affiliation.id === affiliationId) ?? null
  );
}

/** Log any explicitly supplied legacy draw weights for replay diagnostics. */
export function logAffiliationDraw(args: {
  drawSite: string;
  affiliationId: AffiliationId | undefined;
  candidateWeights: ReadonlyMap<number, number>;
  picked: readonly number[];
}): void {
  if (args.candidateWeights.size === 0) return;
  logEvent("affiliation_draw_weighted", {
    drawSite: args.drawSite,
    affiliationId: args.affiliationId ?? null,
    candidateWeights: [...args.candidateWeights.entries()].map(
      ([cardNumber, weight]) => ({
        cardNumber,
        weight,
      }),
    ),
    pickedCardNumbers: [...args.picked],
  });
}
