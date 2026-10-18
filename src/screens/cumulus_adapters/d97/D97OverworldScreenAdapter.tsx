// Adapter for the D97 overworld: the run's dream (./use-d97-dream.ts) on the
// Pixi canvas (loaded on first use, so journey players never download Pixi),
// a loading or unavailable screen until it can be played, the HUD, beaten
// opponents without badges, quest marks, door veils and lit waypoints, the
// panels (./D97OverworldPanelsAdapter.tsx), and the input-focus rule: the
// canvas ignores input while a panel or a pending reward is open. Every
// interaction goes through ./use-d97-interactions.ts. Wiring only.

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { D97_CHARACTER_SPRITES } from "../../../content/d97/characters";
import { D97_ACT_CHALLENGER_TIERS, D97_CHARACTER_TUNABLES, D97_OVERWORLD_TUNABLES } from "../../../content/d97/tunables";
import { D97DreamLoadingScreen } from "../../../cumulus/screens/d97/D97DreamLoadingScreen";
import { D97OverworldScreen, type D97OverworldControlId } from "../../../cumulus/screens/d97/D97OverworldScreen";
import type { JourneyContent } from "../../../data/journey-content";
import { buildDialogueCatalog } from "../../../d97/dialogue/catalog";
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
  if (dream.kind === "loading") return <D97DreamLoadingScreen />;
  if (dream.kind === "unavailable") return <D97DreamUnavailableAdapter />;
  return <D97DreamOverworld {...props} dream={dream.played} />;
}

function D97DreamOverworld({
  run,
  journeyContent,
  initialDeckEditorOpen = false,
  returningFromBattle = false,
  dream: { dream, map, occupants: placed },
}: D97OverworldProps & { readonly dream: D97PlayedDream }) {
  const catalog = d97ContentProvider()?.dialogue ?? NO_DIALOGUE;
  const beatenText = beatenOpponentsText(run.encounters);
  const occupants = useMemo(() => withBeatenOpponents(placed, beatenText), [beatenText, placed]);
  // The player walks as their Avatar's recipe, or as a capsule for an Avatar without one.
  const playerCharacter = useMemo(() => D97_CHARACTER_SPRITES.find((recipe) => recipe.avatarId === run.avatarId)?.id ?? null, [run.avatarId]);
  const interactions = useD97Interactions({ run, topology: dream.topology, occupants }, initialDeckEditorOpen ? { kind: "deck" } : null);
  const travel = useD97Travel({ run, dream: dream.topology, returningFromBattle });
  const [hudInset, setHudInset] = useState(0);
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    logEvent("d97_overworld_shown", { runId: run.runId, mapId: map.id });
  }, [map.id, run.runId]);

  const view = useMemo(
    () => buildD97OverworldHudView({ act: d97RunAct(run), actTiers: D97_ACT_CHALLENGER_TIERS, essence: run.essence, enabled: ENABLED_CONTROLS }),
    [run],
  );
  const cards = useMemo(() => cardsByUuid(journeyContent.cardDatabase), [journeyContent.cardDatabase]);
  const marks = useMemo(() => buildD97QuestMarks(run.quests, catalog.quests, map.anchors), [catalog.quests, map.anchors, run.quests]);

  const panelOpen = interactions.panel !== null || run.quests.pendingReward !== null;
  return (
    <D97OverworldScreen
      view={view}
      onControl={interactions.control}
      panelOpen={panelOpen}
      onHudInset={setHudInset}
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
            inputEnabled={!panelOpen}
            hudInset={hudInset}
            badges={marks.badges}
            hiddenAnchorIds={marks.hiddenAnchorIds}
          />
        </Suspense>
      }
      panel={
        <D97OverworldPanelsAdapter run={run} interactions={interactions} occupants={occupants} catalog={catalog} cards={cards} avatars={journeyContent.avatars} />
      }
    />
  );
}
