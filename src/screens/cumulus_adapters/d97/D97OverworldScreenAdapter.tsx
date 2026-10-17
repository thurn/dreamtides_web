// Adapter for the D97 overworld: the development dream on the Pixi canvas,
// the HUD view, the deck editor and Menu panels, and the input-focus rule
// (the canvas ignores input while a panel is open). Which panel is open is
// view state; every equip and unequip is recorded as an intent. Wiring only.
// The canvas module (and Pixi with it) loads on first use, so journey
// players never download it.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { D97_COLLECTION } from "../../../content/d97/collection";
import { D97_ACT_CHALLENGER_TIERS, D97_OVERWORLD_TUNABLES } from "../../../content/d97/tunables";
import { GlassButton } from "../../../cumulus/components/controls/GlassButton";
import { GlassDialog } from "../../../cumulus/components/overlay/GlassDialog";
import { D97DeckEditorScreen } from "../../../cumulus/screens/d97/D97DeckEditorScreen";
import {
  D97OverworldScreen,
  type D97OverworldControlId,
} from "../../../cumulus/screens/d97/D97OverworldScreen";
import type { JourneyContent } from "../../../data/journey-content";
import { compileDevMap } from "../../../d97/overworld/dev-map";
import { createInteractionRegistry } from "../../../d97/overworld/interactions";
import { logEvent } from "../../../logging";
import type { D97Run } from "../../../rules/d97/d97-state";
import { useActions } from "../../../session/hooks";
import type { D97OwnedCopyId } from "../../../types/identifiers";
import { buildD97DeckEditorView, cardsByUuid } from "./d97-deck-editor-view-model";
import { buildD97OverworldHudView } from "./d97-overworld-view-model";

const OverworldCanvas = lazy(() =>
  import("../../../d97/overworld/OverworldCanvas").then((module) => ({
    default: module.OverworldCanvas,
  })),
);

/** Controls whose surfaces exist; Quests arrives with its bead. */
const ENABLED_CONTROLS: ReadonlySet<D97OverworldControlId> = new Set(["deck", "menu"]);

type Panel = "deck" | "menu";

let devMap: ReturnType<typeof compileDevMap> | null = null;
function currentMap() {
  devMap ??= compileDevMap();
  return devMap;
}

function reportFailure(error: unknown): void {
  console.error("D97 deck edit failed", error);
}

/** Live overworld of a started run. */
export function D97OverworldScreenAdapter({
  run,
  journeyContent,
  initialDeckEditorOpen = false,
}: {
  readonly run: D97Run;
  readonly journeyContent: JourneyContent;
  readonly initialDeckEditorOpen?: boolean;
}) {
  const map = currentMap();
  const actions = useActions();
  const registry = useRef(createInteractionRegistry()).current;
  const [panel, setPanel] = useState<Panel | null>(initialDeckEditorOpen ? "deck" : null);
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    logEvent("d97_overworld_shown", { runId: run.runId, mapId: map.id });
  }, [map.id, run.runId]);

  const view = useMemo(
    () =>
      buildD97OverworldHudView({
        act: 1,
        actTiers: D97_ACT_CHALLENGER_TIERS,
        essence: run.essence,
        enabled: ENABLED_CONTROLS,
      }),
    [run.essence],
  );
  const cards = useMemo(() => cardsByUuid(journeyContent.cardDatabase), [journeyContent.cardDatabase]);
  const deckView = useMemo(
    () => buildD97DeckEditorView(run.collection, cards, D97_COLLECTION.minimumDeckSize),
    [run.collection, cards],
  );

  const handleControl = useCallback(
    (id: D97OverworldControlId) => {
      logEvent("d97_overworld_control_pressed", { control: id });
      if (id === "deck") logEvent("d97_deck_editor_opened", { runId: run.runId });
      if (id === "deck" || id === "menu") setPanel(id);
    },
    [run.runId],
  );
  const closeDeck = useCallback(() => {
    logEvent("d97_deck_editor_closed", { runId: run.runId });
    setPanel(null);
  }, [run.runId]);
  const closePanel = useCallback(() => setPanel(null), []);
  const equip = useCallback(
    (copyId: D97OwnedCopyId) => {
      void actions.d97EquipCopy(copyId).catch(reportFailure);
    },
    [actions],
  );
  const unequip = useCallback(
    (copyId: D97OwnedCopyId) => {
      void actions.d97UnequipCopy(copyId).catch(reportFailure);
    },
    [actions],
  );

  return (
    <D97OverworldScreen
      view={view}
      onControl={handleControl}
      world={
        <Suspense fallback={null}>
          <OverworldCanvas
            map={map}
            registry={registry}
            tunables={D97_OVERWORLD_TUNABLES}
            inputEnabled={panel === null}
          />
        </Suspense>
      }
      panel={
        <>
          <D97DeckEditorScreen
            isOpen={panel === "deck"}
            view={deckView}
            onEquip={equip}
            onUnequip={unequip}
            onClose={closeDeck}
          />
          {panel === "menu" && (
            <GlassDialog title={"Menu"} presentation="popup" onClose={closePanel}>
              <GlassButton label={"Resume"} testId="d97-menu-resume" onPress={closePanel} />
            </GlassDialog>
          )}
        </>
      }
    />
  );
}
