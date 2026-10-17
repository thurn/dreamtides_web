// Adapter for D97 Avatar select over the shared Cumulus `JourneyStartScreen`.
// Wiring only: it pages the full roster (presentation state), builds the
// shared offer views, and records the pick as `D97_START_RUN`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { JourneyStartScreen } from "../../../cumulus/screens/JourneyStartScreen";
import type { JourneyContent } from "../../../data/journey-content";
import { logEventOnce } from "../../../logging";
import { useActions, useGameState } from "../../../session/hooks";
import type { AvatarId } from "../../../types/identifiers";
import { buildAvatarOfferViews } from "../journey-start-view-model";
import { d97AvatarPage, d97AvatarPageCount } from "./d97-avatar-select-view-model";

/** Live D97 Avatar select: any roster Avatar starts the run. */
export function D97AvatarSelectScreenAdapter({
  journeyContent,
}: {
  readonly journeyContent: JourneyContent;
}) {
  const actions = useActions();
  const gameSeed = useGameState().journey.seed;
  const [page, setPage] = useState(0);
  const roster = journeyContent.avatars;
  const pageCount = d97AvatarPageCount(roster);
  const pageIndex = page % pageCount;
  const offered = useMemo(() => d97AvatarPage(roster, pageIndex), [roster, pageIndex]);
  const avatars = useMemo(
    () =>
      buildAvatarOfferViews(
        offered,
        journeyContent.poolContext,
        gameSeed,
        journeyContent.tutorialJourneyPool,
      ),
    [offered, journeyContent.poolContext, journeyContent.tutorialJourneyPool, gameSeed],
  );

  useEffect(() => {
    const avatarIds = offered.map((avatar) => avatar.id);
    logEventOnce(
      `d97-avatar-page:${gameSeed}:${String(pageIndex)}`,
      "d97_avatar_page_shown",
      { avatarIds, page: pageIndex, pageCount },
    );
  }, [offered, gameSeed, pageIndex, pageCount]);

  const handlePick = useCallback(
    (avatarId: AvatarId) => {
      if (!offered.some((avatar) => avatar.id === avatarId)) return;
      void actions.d97StartRun(avatarId).catch((error: unknown) => {
        console.error("D97 run start failed", error);
      });
    },
    [actions, offered],
  );

  const handleNextPage = useCallback(() => {
    setPage((current) => current + 1);
  }, []);

  return (
    <JourneyStartScreen
      key={pageIndex}
      avatars={avatars}
      onPick={handlePick}
      onReroll={pageCount > 1 ? handleNextPage : undefined}
    />
  );
}
