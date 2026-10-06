/** Loads the Avatar identities from the `src/content/avatars/` modules. */

import type { AvatarPortraitFocus } from "../types/content";
import type { CardId } from "../types/card-identity";
import { parseAvatarId, type AvatarId } from "../types/identifiers";
import { avatarsDocument } from "../content/documents";

export interface DraftAvatar {
  id: AvatarId;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  portraitFocus?: AvatarPortraitFocus;
  startingEssence?: number;
  /** Stable UUIDs of the Avatar's signature cards. */
  signatureCardIds?: readonly CardId[];
}

interface RawDraftAvatar extends Omit<DraftAvatar, "id"> {
  id: unknown;
}

export function loadAvatarsV2(): DraftAvatar[] {
  const avatars = avatarsDocument() as unknown as readonly RawDraftAvatar[];
  return avatars.map((avatar) => ({
    ...avatar,
    id: parseAvatarId(avatar.id),
    signatureCardIds: avatar.signatureCardIds ?? [],
  }));
}
