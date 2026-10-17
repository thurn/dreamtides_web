// Renders a Dreamtides 97 game's current screen from its folded `d97` slice,
// keeps the address bar on `/d97` (the `?game=` query stays the resume key),
// and starts the run for a run-starting D97 QA scene on a fresh game.

import { useEffect, useRef } from "react";
import type { JourneyContent } from "../data/journey-content";
import { logEvent } from "../logging";
import { findD97QaScene } from "../runtime/qa-scene-entry";
import { useActions, useConfirmedHead, useGameState } from "../session/hooks";
import { D97AvatarSelectScreenAdapter } from "../screens/cumulus_adapters/d97/D97AvatarSelectScreenAdapter";
import { D97OverworldScreenAdapter } from "../screens/cumulus_adapters/d97/D97OverworldScreenAdapter";
import { D97SliceEndScreenAdapter } from "../screens/cumulus_adapters/d97/D97SliceEndScreenAdapter";
import type { QaSceneId } from "../types/identifiers";
import { ErrorBoundary } from "./ErrorBoundary";
import { PlayableBattleScreen } from "../battle/components/PlayableBattleScreen";
import { d97BattleOf } from "../rules/battle/fold";

/** The path a D97 game shows in the address bar. */
const D97_PATHNAME = "/d97";

export function D97ScreenRouter({
  journeyContent,
  gotoScene = null,
}: {
  readonly journeyContent: JourneyContent;
  readonly gotoScene?: QaSceneId | null;
}) {
  const { d97, battle } = useGameState();
  const confirmedHead = useConfirmedHead();
  const actions = useActions();
  const qaRunStartedRef = useRef(false);
  const screenType = d97?.screen.type ?? null;

  useEffect(() => {
    if (screenType === null || window.location.pathname === D97_PATHNAME) return;
    window.history.replaceState(
      window.history.state,
      "",
      `${D97_PATHNAME}${window.location.search}${window.location.hash}`,
    );
    logEvent("d97_url_synced", { path: D97_PATHNAME, screen: screenType });
  }, [screenType]);

  const qaScene = gotoScene === null ? null : findD97QaScene(gotoScene);
  const startsQaRun = qaScene?.startsRun === true;
  const opensDeckEditor = qaScene?.opensDeckEditor === true;
  const firstAvatarId = journeyContent.avatars[0]?.id ?? null;
  useEffect(() => {
    if (
      !startsQaRun ||
      qaRunStartedRef.current ||
      confirmedHead !== 0 ||
      d97?.run !== null ||
      firstAvatarId === null
    ) {
      return;
    }
    qaRunStartedRef.current = true;
    logEvent("d97_qa_scene_run_started", { gotoScene, avatarId: firstAvatarId });
    void actions.d97StartRun(firstAvatarId).catch((error: unknown) => {
      console.error("D97 QA run start failed", error);
    });
  }, [actions, confirmedHead, d97?.run, firstAvatarId, gotoScene, startsQaRun]);

  if (d97 === undefined) return null;
  const content =
    d97BattleOf(battle) !== null ? (
      <PlayableBattleScreen />
    ) : d97.screen.type === "overworld" && d97.run !== null ? (
      <D97OverworldScreenAdapter
        run={d97.run}
        journeyContent={journeyContent}
        initialDeckEditorOpen={opensDeckEditor}
      />
    ) : d97.screen.type === "sliceEnd" && d97.run !== null ? (
      <D97SliceEndScreenAdapter run={d97.run} avatars={journeyContent.avatars} />
    ) : (
      <D97AvatarSelectScreenAdapter journeyContent={journeyContent} />
    );
  return (
    <ErrorBoundary scope={`screen:d97:${battle === null ? d97.screen.type : "battle"}`} resetKey={battle === null ? d97.screen.type : battle.init.battleId}>
      {content}
    </ErrorBoundary>
  );
}
