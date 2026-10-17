// Adapter for the D97 overworld: the development dream on the Pixi canvas,
// the HUD view, the encounter preview, deck editor and Menu panels, beaten
// opponents without badges, the return beside the last battle's anchor, and
// the input-focus rule
// (the canvas ignores input while a panel is open). Which panel is open is
// view state; every equip and unequip is recorded as an intent. Wiring only.
// The canvas module (and Pixi with it) loads on first use, so journey
// players never download it.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { D97_COLLECTION } from "../../../content/d97/collection";
import { D97_CHARACTER_SPRITES } from "../../../content/d97/characters";
import { DEV_KNIGHT } from "../../../content/d97/characters/development";
import {
  D97_ACT_CHALLENGER_TIERS,
  D97_CHARACTER_TUNABLES,
  D97_OVERWORLD_TUNABLES,
} from "../../../content/d97/tunables";
import { GlassButton } from "../../../cumulus/components/controls/GlassButton";
import { GlassDialog } from "../../../cumulus/components/overlay/GlassDialog";
import { D97DeckEditorScreen } from "../../../cumulus/screens/d97/D97DeckEditorScreen";
import { D97EncounterPreview } from "../../../cumulus/screens/d97/D97EncounterPreview";
import {
  D97OverworldScreen,
  type D97OverworldControlId,
} from "../../../cumulus/screens/d97/D97OverworldScreen";
import type { JourneyContent } from "../../../data/journey-content";
import { compileDevMap } from "../../../d97/overworld/dev-map";
import { devOccupants } from "../../../d97/overworld/dev-occupants";
import { createInteractionRegistry } from "../../../d97/overworld/interactions";
import { logEvent } from "../../../logging";
import type { D97Run } from "../../../rules/d97/d97-state";
import { useActions } from "../../../session/hooks";
import type { D97OwnedCopyId } from "../../../types/identifiers";
import { buildD97DeckEditorView, cardsByUuid } from "./d97-deck-editor-view-model";
import { buildD97OverworldHudView } from "./d97-overworld-view-model";
import { useD97Encounter } from "./use-d97-encounter";

const OverworldCanvas = lazy(() =>
  import("../../../d97/overworld/OverworldCanvas").then((module) => ({
    default: module.OverworldCanvas,
  })),
);

/** Controls whose surfaces exist; Quests arrives with its bead. */
const ENABLED_CONTROLS: ReadonlySet<D97OverworldControlId> = new Set(["deck", "menu"]);

type Panel = "deck" | "menu";

let devDream: { map: ReturnType<typeof compileDevMap>; occupants: ReturnType<typeof devOccupants> } | null = null;
function currentDream() {
  if (devDream === null) {
    const map = compileDevMap();
    devDream = { map, occupants: devOccupants(map) };
  }
  return devDream;
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
  const { map, occupants: placed } = currentDream();
  // Beaten opponents stay as ordinary characters: no badge, desaturated.
  const beatenKey = Object.values(run.encounters).filter((encounter) => encounter?.beaten === true).map((encounter) => encounter?.anchorId).join(",");
  const occupants = useMemo(() => {
    const beaten = new Set(beatenKey.split(","));
    return new Map([...placed].map(([anchorId, occupant]) => [anchorId, beaten.has(anchorId) ? { ...occupant, badge: null, beaten: true as const } : occupant]));
  }, [beatenKey, placed]);
  // The player walks as their Avatar's recipe, or the development knight
  // while the Avatar has none.
  const playerCharacter = useMemo(
    () => (D97_CHARACTER_SPRITES.find((recipe) => recipe.avatarId === run.avatarId) ?? DEV_KNIGHT).id,
    [run.avatarId],
  );
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
  const openDeckEditor = useCallback(() => {
    logEvent("d97_deck_editor_opened", { runId: run.runId });
    setPanel("deck");
  }, [run.runId]);
  const encounter = useD97Encounter({ run, registry, actions, avatars: journeyContent.avatars, cardsById: cards, openDeckEditor });
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
            characterTunables={D97_CHARACTER_TUNABLES}
            occupants={occupants}
            playerCharacter={playerCharacter}
            returnAnchorId={run.returnAnchorId}
            inputEnabled={panel === null && !encounter.open}
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
          {encounter.preview !== null && (
            <D97EncounterPreview view={encounter.preview} onFight={encounter.fight} onNotNow={encounter.notNow} />
          )}
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
