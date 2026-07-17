// Adapter bridging live quest state to the pure Cumulus atlas screen
// (`src/cumulus/screens/AtlasScreen`). Adapters are wiring only: this one owns
// `useQuest()`, builds the view-model, wires node entry to `setCurrentDreamscape`
// + `setScreen`, and emits the reconstruction logging. All mapping from domain
// data to the screen's view types lives in the pure builder
// (`atlas-view-model.ts`); the Cumulus screen itself stays pure. The atlas's
// utility actions (deck viewer, glossary, Regenerate Atlas, ...) live in the
// app-shell hamburger menu, not this adapter.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuest } from "../../state/quest-context";
import { logEvent } from "../../logging";
import { AtlasScreen } from "../../cumulus/screens/AtlasScreen";
import { useIsDesktop } from "../../cumulus/screens/use-is-desktop";
import { buildAtlasView, atlasChoiceLayer } from "./atlas-view-model";

/**
 * Live atlas screen: builds the vertical run-graph view-model from the current
 * atlas + run state, enters an available node's dreamscape on select, and logs
 * the presented atlas once per navigation for reconstruction.
 */
export function AtlasScreenAdapter() {
  const { state, mutations, questContent } = useQuest();
  const { atlas } = state;
  const isDesktop = useIsDesktop();

  const view = useMemo(
    () => buildAtlasView(atlas, questContent, isDesktop),
    [atlas, questContent, isDesktop],
  );

  // Reconstruction log: which atlas was presented, its current frontier, and
  // how many nodes were shown. Deduped against StrictMode double-fire and
  // re-fired only when the presented frontier changes.
  const loggedFrontierRef = useRef<string | null>(null);
  useEffect(() => {
    const choiceLayer = atlasChoiceLayer(atlas);
    const signature = `${String(atlas.startingNodeId)}|${choiceLayer ?? "none"}|${String(view.nodes.length)}`;
    if (loggedFrontierRef.current === signature) {
      return;
    }
    loggedFrontierRef.current = signature;
    logEvent("atlas_overview_presented", {
      startingNodeId: atlas.startingNodeId,
      bossNodeId: atlas.bossNodeId,
      choiceLayer,
      completionLevel: state.completionLevel,
      nodeCount: view.nodes.length,
    });
  }, [atlas, view.nodes.length, state.completionLevel]);

  const handleEnterNode = useCallback(
    (nodeId: string) => {
      const node = atlas.nodes[nodeId];
      if (node === undefined || node.state !== "available") {
        return;
      }
      mutations.setCurrentDreamscape(nodeId);
    },
    [atlas.nodes, mutations],
  );

  return <AtlasScreen view={view} onEnterNode={handleEnterNode} />;
}
