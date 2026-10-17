// The pure view-model builder for the D97 slice-end screen: the run's Avatar
// and its summary. It names no dream.

import type { D97SliceEndView } from "../../../cumulus/screens/d97/D97SliceEndScreen";
import { copiesInZone } from "../../../d97/collection/collection";
import type { D97Run } from "../../../rules/d97/d97-state";
import type { AvatarContent } from "../../../types/content";

export function buildD97SliceEndView(run: D97Run, avatars: readonly AvatarContent[]): D97SliceEndView {
  const avatar = avatars.find((candidate) => candidate.id === run.avatarId) ?? null;
  const beaten = Object.values(run.encounters).filter((encounter) => encounter?.beaten === true).length;
  return {
    avatar:
      avatar === null
        ? null
        : {
            id: avatar.id,
            name: avatar.name,
            title: avatar.title,
            ability: avatar.renderedText,
            imageNumber: avatar.imageNumber,
            ...(avatar.portraitFocus === undefined ? {} : { portraitFocus: avatar.portraitFocus }),
          },
    stats: [
      { id: "battles", value: run.battlesFought, kind: "number" },
      { id: "beaten", value: beaten, kind: "number" },
      { id: "collection", value: run.collection.copies.length, kind: "number" },
      { id: "deck", value: copiesInZone(run.collection, "deck").length, kind: "number" },
      { id: "essence", value: run.essence, kind: "essence" },
    ],
  };
}
