// The pure view-model builder for the D97 placeholder overworld: resolves the
// run's Avatar UUID against the roster at the render boundary.

import type { D97OverworldPlaceholderView } from "../../../cumulus/screens/d97/D97OverworldPlaceholderScreen";
import type { D97Run } from "../../../rules/d97/d97-state";
import type { AvatarContent } from "../../../types/content";

/** The placeholder overworld view of `run`, given the Avatar roster. */
export function buildD97OverworldPlaceholderView(
  run: D97Run,
  avatars: readonly AvatarContent[],
): D97OverworldPlaceholderView {
  const avatar = avatars.find((candidate) => candidate.id === run.avatarId);
  return {
    runId: run.runId,
    avatar:
      avatar === undefined
        ? null
        : {
            id: avatar.id,
            name: avatar.name,
            title: avatar.title,
            imageNumber: avatar.imageNumber,
            portraitFocus: avatar.portraitFocus,
            ability: avatar.renderedText,
          },
  };
}
