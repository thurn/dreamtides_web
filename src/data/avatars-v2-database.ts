/** Loads the Avatar identities compiled from `avatars.toml`. */

import type { AvatarPortraitFocus } from "../types/content";
import type { CardId } from "../types/card-identity";
import { parseAvatarId, type AvatarId } from "../types/identifiers";

export interface DraftAvatar {
  id: AvatarId;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  portraitFocus?: AvatarPortraitFocus;
  startingEssence?: number;
  signatureCards?: readonly string[];
  /** Stable card UUIDs, index-aligned with `signatureCards`. */
  signatureCardIds?: readonly CardId[];
}

interface RawDraftAvatar extends Omit<DraftAvatar, "id"> {
  id: unknown;
}

export async function loadAvatarsV2(): Promise<DraftAvatar[]> {
  const response = await fetch("/avatars-v2-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load Avatar data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const avatars = (await response.json()) as RawDraftAvatar[];
  return avatars.map((avatar) => ({
    ...avatar,
    id: parseAvatarId(avatar.id),
    signatureCards: avatar.signatureCards ?? [],
    signatureCardIds: avatar.signatureCardIds ?? [],
  }));
}
