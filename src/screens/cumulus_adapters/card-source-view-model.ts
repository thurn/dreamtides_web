import { assertLocalized } from "@trox/runtime";
import type {
  CardSourceNarrativeLine,
  CardSourceView,
} from "../../cumulus/screens/CardSourceDialog";
import type { Tides4ProvenanceSummary } from "../../types/content";
import type { CardData } from "../../types/cards";
import type { CardSourceDebugState } from "../../types/journey";
import { serializeCardNumber } from "../../types/draft";

/** Maps computed developer provenance into display copy without recomputing it. */
export function buildCardSourceView(
  debug: CardSourceDebugState | null,
  tides: Tides4ProvenanceSummary | null,
  cardDatabase: ReadonlyMap<number, CardData>,
): CardSourceView | null {
  if (debug === null) return null;
  const cards = debug.entries ?? [];
  const lines = (
    copy: (entry: (typeof cards)[number]) => string,
  ): CardSourceNarrativeLine[] =>
    cards.map((entry, index) => {
      const card = cardDatabase.get(entry.cardNumber);
      return {
        id: `card:${entry.cardNumber}:${index}`,
        text: assertLocalized(copy(entry)),
        card:
          card === undefined
            ? null
            : { cardId: card.id, displaySnapshot: card },
      };
    });
  const plain = (values: readonly string[]): CardSourceNarrativeLine[] =>
    values.map((text, index) => ({
      id: `copy:${index}`,
      text: assertLocalized(text),
      card: null,
    }));

  if (tides !== null) {
    return {
      title: assertLocalized(debug.screenLabel),
      subtitle: assertLocalized(
        `${surface(debug.surface)} dealt from your DreamAvatar's tides.`,
      ),
      construction: {
        id: "construction",
        title: assertLocalized("How this pool was built"),
        lines: plain([
          "Signature tide",
          ...tides.tides
            .filter((tide) => tide.role === "signature")
            .map((tide) => tide.displayName),
          "Theme tides",
          `${String(tides.facetDrawnCount)} of ${String(tides.facetAvailableCount)} theme tides were drawn at random.`,
          "Deal",
          `Built to ${String(tides.dealSize)} cards at a ${String(tides.cap)}-copy cap.`,
        ]),
      },
      cards: {
        id: "cards",
        title: assertLocalized("The cards in front of you"),
        lines: lines((entry) =>
          tideLine(entry.cardNumber, entry.cardName, tides),
        ),
      },
    };
  }

  return {
    title: assertLocalized(debug.screenLabel),
    subtitle: assertLocalized("Why am I seeing these cards?"),
    construction: null,
    cards: {
      id: "cards",
      title: assertLocalized("The cards in front of you"),
      lines: lines(
        (entry) =>
          `${entry.cardName}: Pool card. Draft-pool card. ${String(entry.draftPoolCopies ?? 0)} copies in the pool.`,
      ),
    },
  };
}

function surface(surfaceKind: CardSourceDebugState["surface"]): string {
  return surfaceKind === "Draft"
    ? "These draft cards come"
    : surfaceKind === "Shop"
      ? "Shop cards are drawn"
      : "Rewards are drawn";
}

function tideLine(
  number: number,
  name: string,
  provenance: Tides4ProvenanceSummary,
): string {
  const source = provenance.cardProvenanceByNumber[serializeCardNumber(number)];
  const tide = provenance.tides.find(
    (value) => value.id === source?.primaryTideId,
  );
  if (tide === undefined) return `${name}: Pool card.`;
  const label = tide.displayName;
  return tide.role === "signature"
    ? `${name}: From your signature tide ${label}.`
    : tide.role === "facet"
      ? `${name}: From the theme tide ${label}, one of the ${String(provenance.facetDrawnCount)} drawn at random this run.`
      : `${name}: From the tide ${label}.`;
}
