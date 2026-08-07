import type { CardSourceDebugState } from "../../types/journey";
import type { Tides4ProvenanceSummary } from "../../types/content";
import type { CardSourceView } from "../../cumulus/screens/CardSourceDialog";
import type { CardData } from "../../types/cards";

/** Maps computed provenance into display copy; it never mutates or recomputes the run pool. */
export function buildCardSourceView(debug: CardSourceDebugState | null, tides: Tides4ProvenanceSummary | null, cardDatabase: ReadonlyMap<number, CardData>): CardSourceView | null {
  if (debug === null) return null;
  const cards = debug.entries ?? [];
  const lines = (copy: (entry: typeof cards[number]) => string) => cards.map((entry, index) => { const card = cardDatabase.get(entry.cardNumber); return { id: `card:${String(entry.cardNumber)}:${String(index)}`, text: copy(entry), card: card === undefined ? null : { cardId: card.id, displaySnapshot: card } }; });
  const plain = (values: readonly string[]) => values.map((text, index) => ({ id: `copy:${String(index)}`, text, card: null }));
  if (tides !== null) return { title: debug.screenLabel, subtitle: `${surface(debug.surface)} dealt from your DreamAvatar's tides.`, construction: { id: "construction", title: "How this pool was built", lines: plain(["Signature tide", ...tides.tides.filter((tide) => tide.role === "signature").map((tide) => tide.displayName ?? tide.name), "Theme tides", `${String(tides.facetDrawnCount)} of ${String(tides.facetAvailableCount)} theme tides were drawn at random.`, "Deal", `Built to ${String(tides.dealSize)} cards at a ${String(tides.cap)}-copy cap.`]) }, cards: { id: "cards", title: "The cards in front of you", lines: lines((entry) => tideLine(entry.cardNumber, entry.cardName, tides)) } };
  return { title: debug.screenLabel, subtitle: "Why am I seeing these cards?", construction: null, cards: { id: "cards", title: "The cards in front of you", lines: lines((entry) => `${entry.cardName}: Pool card. Draft-pool card. ${String(entry.draftPoolCopies ?? 0)} copies in the pool.`) } };
}
function surface(surface: CardSourceDebugState["surface"]): string { return surface === "Draft" ? "These draft cards come" : surface === "Shop" ? "Shop cards are drawn" : "Rewards are drawn"; }
function tideLine(number: number, name: string, provenance: Tides4ProvenanceSummary): string { const source = provenance.cardProvenanceByNumber[String(number)]; const tide = provenance.tides.find((value) => value.id === source?.primaryTideId); if (tide === undefined) return `${name}: Pool card.`; const label = tide.displayName ?? tide.name; return tide.role === "signature" ? `${name}: From your signature tide ${label}.` : tide.role === "facet" ? `${name}: From the theme tide ${label}, one of the ${String(provenance.facetDrawnCount)} drawn at random this run.` : `${name}: From the tide ${label}.`; }
