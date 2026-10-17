// Adapter for the D97 placeholder overworld: resolves the run's Avatar for
// the pure screen.

import { useMemo } from "react";
import { D97OverworldPlaceholderScreen } from "../../../cumulus/screens/d97/D97OverworldPlaceholderScreen";
import type { AvatarContent } from "../../../types/content";
import type { D97Run } from "../../../rules/d97/d97-state";
import { buildD97OverworldPlaceholderView } from "./d97-overworld-view-model";

/** Live placeholder overworld of a started run. */
export function D97OverworldPlaceholderScreenAdapter({
  run,
  avatars,
}: {
  readonly run: D97Run;
  readonly avatars: readonly AvatarContent[];
}) {
  const view = useMemo(
    () => buildD97OverworldPlaceholderView(run, avatars),
    [run, avatars],
  );
  return <D97OverworldPlaceholderScreen view={view} />;
}
