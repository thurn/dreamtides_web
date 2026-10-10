// Resolves the opposing Avatar a battle shows from the battle's enemy
// descriptor: the journey content Avatar its `avatarId` names, for portrait
// art and focus, with the descriptor's own name, title, and ability text.

import type { JourneyContent } from "../../data/journey-content";
import { logEventOnce } from "../../logging";
import type { BattleAvatarSummary, BattleEnemyDescriptor } from "../types";

export function resolveEnemyAvatarSummary(
  enemyDescriptor: BattleEnemyDescriptor,
  journeyContent: Pick<JourneyContent, "avatars">,
): BattleAvatarSummary {
  const sourceAvatar = findEnemySourceAvatar(enemyDescriptor, journeyContent);
  return {
    id: sourceAvatar?.id ?? enemyDescriptor.id,
    imageNumber:
      enemyDescriptor.imageNumber ?? sourceAvatar?.imageNumber ?? "001",
    name: enemyDescriptor.name,
    renderedText: enemyDescriptor.abilityText,
    title: enemyDescriptor.subtitle,
    ...(sourceAvatar?.portraitFocus === undefined
      ? {}
      : { portraitFocus: sourceAvatar.portraitFocus }),
  };
}

/**
 * The content Avatar the descriptor's `avatarId` names. A descriptor without
 * an `avatarId` (the synthetic opponent battle init builds when no Avatar is
 * available) has no source Avatar. An `avatarId` absent from the content is a
 * broken battle init: it is logged with both UUIDs and the summary renders
 * from the descriptor alone.
 */
function findEnemySourceAvatar(
  enemyDescriptor: BattleEnemyDescriptor,
  journeyContent: Pick<JourneyContent, "avatars">,
) {
  const avatarId = enemyDescriptor.avatarId;
  if (avatarId === undefined) {
    return undefined;
  }
  const avatar = journeyContent.avatars.find(
    (candidate) => candidate.id === avatarId,
  );
  if (avatar === undefined) {
    logEventOnce(
      `battle_enemy_avatar_missing:${enemyDescriptor.id}:${avatarId}`,
      "battle_enemy_avatar_missing",
      { opponentId: enemyDescriptor.id, avatarId },
    );
  }
  return avatar;
}
