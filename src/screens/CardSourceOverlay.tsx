import { useMemo } from "react";
import type { CardSourceDebugState } from "../types/journey";
import type { CardData } from "../types/cards";
import type { Tides4ProvenanceSummary } from "../types/content";
import { CardSourceDialog } from "../cumulus/screens/CardSourceDialog";
import { buildCardSourceView } from "./cumulus_adapters/card-source-view-model";

const EMPTY_CARD_DATABASE: ReadonlyMap<number, CardData> = new Map();

/** External adapter: receives already-computed provenance and supplies pure display data. */
export function CardSourceOverlay({ cardSourceDebug, cardDatabase = EMPTY_CARD_DATABASE, tides4Provenance = null, isOpen, onClose }: { cardSourceDebug: CardSourceDebugState | null; cardDatabase?: ReadonlyMap<number, CardData>; tides4Provenance?: Tides4ProvenanceSummary | null; isOpen: boolean; onClose: () => void; }) {
  const view = useMemo(() => buildCardSourceView(cardSourceDebug, tides4Provenance, cardDatabase), [cardDatabase, cardSourceDebug, tides4Provenance]);
  return <CardSourceDialog isOpen={isOpen} view={view} onClose={onClose} />;
}
