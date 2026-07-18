import { useMemo } from "react";
import type { CardSourceDebugState } from "../types/quest";
import type { Idf3ProvenanceSummary, SeedProvenanceSummary, Tides4ProvenanceSummary } from "../types/content";
import { CardSourceDialog } from "../cumulus/screens/CardSourceDialog";
import { buildCardSourceView } from "./cumulus_adapters/card-source-view-model";

/** External adapter: receives already-computed provenance and supplies pure display data. */
export function CardSourceOverlay({ cardSourceDebug, idf3Provenance, seedProvenance = null, tides4Provenance = null, isOpen, onClose }: { cardSourceDebug: CardSourceDebugState | null; idf3Provenance: Idf3ProvenanceSummary | null; seedProvenance?: SeedProvenanceSummary | null; tides4Provenance?: Tides4ProvenanceSummary | null; isOpen: boolean; onClose: () => void; }) {
  const view = useMemo(() => buildCardSourceView(cardSourceDebug, idf3Provenance, seedProvenance, tides4Provenance), [cardSourceDebug, idf3Provenance, seedProvenance, tides4Provenance]);
  return <CardSourceDialog isOpen={isOpen} view={view} onClose={onClose} />;
}
