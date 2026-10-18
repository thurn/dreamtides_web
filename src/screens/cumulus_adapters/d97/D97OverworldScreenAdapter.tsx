// Adapter for the D97 overworld: the map of the run's dream the player is on
// (./use-d97-dream.ts: its own or a room's) on the Pixi canvas, loaded on
// first use, with the fade between maps (./use-d97-map-transition.ts); a
// loading or unavailable screen until it can be played, the HUD, beaten
// opponents, quest marks, door veils, lit waypoints, the panels, and the
// input-focus rule: the canvas ignores input while a panel or pending reward
// is open or the world is faded. Interactions go through
// ./use-d97-interactions.ts. Wiring only.

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { D97_CHARACTER_SPRITES } from "../../../content/d97/characters";
import { D97_ACT_CHALLENGER_TIERS, D97_CHARACTER_TUNABLES, D97_OVERWORLD_TUNABLES } from "../../../content/d97/tunables";
import { D97DreamLoadingScreen } from "../../../cumulus/screens/d97/D97DreamLoadingScreen";
import { D97OverworldScreen, type D97OverworldControlId } from "../../../cumulus/screens/d97/D97OverworldScreen";
import type { JourneyContent } from "../../../data/journey-content";
import type { CompiledDreamMap } from "../../../d97/map/compiled";
import { buildDialogueCatalog } from "../../../d97/dialogue/catalog";
import { publishD97QaRun } from "../../../d97/overworld/qa-surface";
import { logEvent } from "../../../logging";
import { d97ContentProvider } from "../../../rules/d97/d97-content";
import { d97RunAct, type D97Run } from "../../../rules/d97/d97-state";
import { cardsByUuid } from "./d97-deck-editor-view-model";
import { beatenOpponentsText, buildD97OverworldHudView, withBeatenOpponents } from "./d97-overworld-view-model";
import { buildD97QuestMarks } from "./d97-quest-view-model";
import { D97DreamUnavailableAdapter } from "./D97DreamUnavailableAdapter";
import { D97OverworldPanelsAdapter } from "./D97OverworldPanelsAdapter";
import { useD97Dream, type D97PlayedDream } from "./use-d97-dream";
import { useD97Interactions } from "./use-d97-interactions";
import { useD97MapTransition, type D97MapTransition } from "./use-d97-map-transition";
import { useD97Travel } from "./use-d97-travel";

const OverworldCanvas = lazy(() => import("../../../d97/overworld/OverworldCanvas").then((module) => ({ default: module.OverworldCanvas })));

const NO_DIALOGUE = buildDialogueCatalog([]);

const ENABLED_CONTROLS: ReadonlySet<D97OverworldControlId> = new Set(["deck", "quests", "menu"]);

interface D97OverworldProps {
  readonly run: D97Run;
  readonly journeyContent: JourneyContent;
  readonly initialDeckEditorOpen?: boolean;
  /** Whether this overworld opened straight from a battle, which places the player beside the opponent. */
  readonly returningFromBattle?: boolean;
}

/** Live overworld of a started run, in the dream the run is in. */
export function D97OverworldScreenAdapter(props: D97OverworldProps) {
  const dream = useD97Dream(props.run);
  const transition = useD97MapTransition(dream, D97_OVERWORLD_TUNABLES.roomFadeSeconds);
  if (dream.kind === "unavailable") return <D97DreamUnavailableAdapter />;
  if (transition.shown === null) return <D97DreamLoadingScreen />;
  return <D97DreamOverworld {...props} dream={transition.shown} transition={transition} />;
}

function D97DreamOverworld({
  run,
  journeyContent,
  initialDeckEditorOpen = false,
  returningFromBattle = false,
  dream: { dream, roomId, map, occupants: placed },
  transition: { covered, onSceneReady },
}: D97OverworldProps & { readonly dream: D97PlayedDream; readonly transition: D97MapTransition }) {
  const catalog = d97ContentProvider()?.dialogue ?? NO_DIALOGUE;
  const beatenText = beatenOpponentsText(run.encounters);
  const occupants = useMemo(() => withBeatenOpponents(placed, beatenText), [beatenText, placed]);
  // The player walks as their Avatar's recipe, or as a capsule for an Avatar without one.
  const playerCharacter = useMemo(() => D97_CHARACTER_SPRITES.find((recipe) => recipe.avatarId === run.avatarId)?.id ?? null, [run.avatarId]);
  const interactions = useD97Interactions({ run, topology: dream.topology, rooms: dream.rooms, occupants }, initialDeckEditorOpen ? { kind: "deck" } : null);
  const travel = useD97Travel({ run, dream: dream.topology, mapId: map.id, returningFromBattle });
  const [hudInset, setHudInset] = useState(0);
  const loggedRef = useRef<CompiledDreamMap["id"] | null>(null);

  useEffect(() => (import.meta.env.DEV ? publishD97QaRun(run) : undefined), [run]);

  useEffect(() => {
    // Once per map shown, despite StrictMode's doubled effects.
    if (loggedRef.current === map.id) return;
    loggedRef.current = map.id;
    logEvent("d97_overworld_shown", { runId: run.runId, dreamId: dream.id, roomId, mapId: map.id });
  }, [dream.id, map.id, roomId, run.runId]);

  const view = useMemo(
    () => buildD97OverworldHudView({ act: d97RunAct(run), actTiers: D97_ACT_CHALLENGER_TIERS, essence: run.essence, enabled: ENABLED_CONTROLS }),
    [run],
  );
  const cards = useMemo(() => cardsByUuid(journeyContent.cardDatabase), [journeyContent.cardDatabase]);
  const marks = useMemo(() => buildD97QuestMarks(run.quests, catalog.quests, map.anchors), [catalog.quests, map.anchors, run.quests]);

  const panelOpen = interactions.panel !== null || run.quests.pendingReward !== null;
  const worldFade = useMemo(() => ({ covered, seconds: D97_OVERWORLD_TUNABLES.roomFadeSeconds }), [covered]);
  return (
    <D97OverworldScreen
      view={view}
      onControl={interactions.control}
      panelOpen={panelOpen}
      onHudInset={setHudInset}
      worldFade={worldFade}
      world={
        <Suspense fallback={null}>
          <OverworldCanvas
            map={map}
            onInteract={interactions.interact}
            tunables={D97_OVERWORLD_TUNABLES}
            characterTunables={D97_CHARACTER_TUNABLES}
            occupants={occupants}
            playerCharacter={playerCharacter}
            arrival={travel.arrival}
            veils={travel.veils}
            activeWaypointIds={travel.activeWaypointIds}
            inputEnabled={!panelOpen && !covered}
            hudInset={hudInset}
            badges={marks.badges}
            hiddenAnchorIds={marks.hiddenAnchorIds}
            onSceneReady={onSceneReady}
          />
        </Suspense>
      }
      panel={
        <D97OverworldPanelsAdapter run={run} interactions={interactions} occupants={occupants} catalog={catalog} cards={cards} avatars={journeyContent.avatars} />
      }
    />
  );
}
