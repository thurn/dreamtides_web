// Adapter bridging live quest state to the pure Tango dreamscape screen
// (`src/tango/screens/DreamscapeScreen`). Adapters are wiring only: this one
// owns `useQuest()`, builds the view-model, wires the site-select callback to
// `setScreen`, and emits the reconstruction logging. All mapping from domain
// data to the screen's view types lives in the pure builder
// (`dreamscape-view-model.ts`); the Tango screen itself stays pure.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuest } from "../../state/quest-context";
import { logEvent } from "../../logging";
import { DreamscapeScreen } from "../../tango/screens/DreamscapeScreen";
import {
  buildDreamscapeView,
  dreamscapeLayoutSeed,
} from "./dreamscape-view-model";

/**
 * Live dreamscape screen: resolves the current dreamscape node, builds its
 * view-model (seeded scatter + bottom-HUD data), enters a site on select, and
 * logs the presented overview once per dreamscape for reconstruction.
 */
export function DreamscapeScreenAdapter({
  onViewDeck,
}: {
  onViewDeck?: () => void;
}) {
  const { state, mutations } = useQuest();
  const { currentDreamscape, completionLevel } = state;
  const node =
    currentDreamscape !== null ? state.atlas.nodes[currentDreamscape] : undefined;

  const view = useMemo(
    () => (node !== undefined ? buildDreamscapeView(node, state) : null),
    [node, state],
  );

  // Reconstruction log: which dreamscape was presented, its guardian-unlock
  // state, and the exact seeded layout of every node shown. Re-logs only when
  // the presented dreamscape changes, guarded against StrictMode double-fire.
  const loggedNodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (node === undefined || view === null) {
      return;
    }
    if (loggedNodeRef.current === node.id) {
      return;
    }
    loggedNodeRef.current = node.id;
    logEvent("dreamscape_overview_presented", {
      nodeId: node.id,
      dreamscapeId: node.dreamscapeId,
      biomeName: node.biomeName,
      completionLevel,
      layoutSeed: dreamscapeLayoutSeed(node),
      uiVariant: "tango",
      sites: view.sites.map((model) => ({
        siteId: model.site.id,
        type: model.site.type,
        isEnhanced: model.site.isEnhanced,
        isVisited: model.site.isVisited,
        isLocked: model.isLocked,
        pos: model.pos,
      })),
    });
  }, [node, view, completionLevel]);

  const handleSelectSite = useCallback(
    (siteId: string) => {
      if (node === undefined) {
        return;
      }
      const site = node.sites.find((candidate) => candidate.id === siteId);
      if (site === undefined) {
        return;
      }
      logEvent("site_entered", {
        siteType: site.type,
        dreamscapeId: node.id,
        siteId: site.id,
        isEnhanced: site.isEnhanced,
      });
      mutations.setScreen({ type: "site", siteId });
    },
    [node, mutations],
  );

  if (view === null) {
    return null;
  }

  return (
    <DreamscapeScreen
      view={view}
      onSelectSite={handleSelectSite}
      onViewDeck={onViewDeck}
    />
  );
}
