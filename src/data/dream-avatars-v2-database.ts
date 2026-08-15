/** Loads the DreamAvatar identities compiled from `dream_avatars.toml`. */

import type { DreamAvatarPortraitFocus } from "../types/content";
import type { CardId } from "../types/card-identity";
import { parseDreamAvatarId, type DreamAvatarId } from "../types/identifiers";

export interface DraftDreamAvatar {
  id: DreamAvatarId;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  portraitFocus?: DreamAvatarPortraitFocus;
  startingEssence?: number;
  signatureCards?: readonly string[];
  /** Stable card UUIDs, index-aligned with `signatureCards`. */
  signatureCardIds?: readonly CardId[];
}

interface RawDraftDreamAvatar extends Omit<DraftDreamAvatar, "id"> {
  id: unknown;
}

export async function loadDreamAvatarsV2(): Promise<DraftDreamAvatar[]> {
  const response = await fetch("/dream-avatars-v2-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load DreamAvatar data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const dreamAvatars = (await response.json()) as RawDraftDreamAvatar[];
  return dreamAvatars.map((dreamAvatar) => ({
    ...dreamAvatar,
    id: parseDreamAvatarId(dreamAvatar.id),
    signatureCards: dreamAvatar.signatureCards ?? [],
    signatureCardIds: dreamAvatar.signatureCardIds ?? [],
  }));
}
