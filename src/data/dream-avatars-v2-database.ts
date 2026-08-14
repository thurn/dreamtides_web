/** Loads the DreamAvatar identities compiled from `dream_avatars.toml`. */

import type { DreamAvatarPortraitFocus } from "../types/content";
import type { CardId } from "../types/card-identity";

export interface DraftDreamAvatar {
  id: string;
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

export async function loadDreamAvatarsV2(): Promise<DraftDreamAvatar[]> {
  const response = await fetch("/dream-avatars-v2-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load DreamAvatar data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const dreamAvatars = (await response.json()) as DraftDreamAvatar[];
  for (const dreamAvatar of dreamAvatars) {
    dreamAvatar.signatureCards = dreamAvatar.signatureCards ?? [];
    dreamAvatar.signatureCardIds = dreamAvatar.signatureCardIds ?? [];
  }
  return dreamAvatars;
}
