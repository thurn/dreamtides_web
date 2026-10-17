// Adapter for the D97 slice-end screen: builds the run summary, logs the
// arrival once, and starts a new D97 run on request. Wiring only.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { D97SliceEndScreen } from "../../../cumulus/screens/d97/D97SliceEndScreen";
import { copiesInZone } from "../../../d97/collection/collection";
import { logEvent } from "../../../logging";
import type { D97Run } from "../../../rules/d97/d97-state";
import { useGameSwitch } from "../../../session/game-switch";
import type { AvatarContent } from "../../../types/content";
import { buildD97SliceEndView } from "./d97-slice-end-view-model";

export function D97SliceEndScreenAdapter({
  run,
  avatars,
}: {
  readonly run: D97Run;
  readonly avatars: readonly AvatarContent[];
}) {
  const gameSwitch = useGameSwitch();
  const loggedRef = useRef(false);
  const view = useMemo(() => buildD97SliceEndView(run, avatars), [run, avatars]);

  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    logEvent("d97_slice_end_shown", {
      runId: run.runId,
      avatarId: run.avatarId,
      battlesFought: run.battlesFought,
      beatenAnchorIds: Object.values(run.encounters).filter((encounter) => encounter?.beaten === true).map((encounter) => encounter?.anchorId),
      deckCardIds: copiesInZone(run.collection, "deck").map((copy) => copy.cardId),
      collectionSize: run.collection.copies.length,
      essence: run.essence,
    });
  }, [run]);

  const newRun = useCallback(() => {
    gameSwitch?.startD97Run({ source: "d97_slice_end" });
  }, [gameSwitch]);

  return <D97SliceEndScreen view={view} onNewRun={gameSwitch === null ? null : newRun} />;
}
