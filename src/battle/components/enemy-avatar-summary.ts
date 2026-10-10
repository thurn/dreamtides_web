// Resolves the opposing Avatar a battle shows from the battle's enemy
// descriptor: the journey content Avatar its id names, for portrait art and
// focus, with the descriptor's own name, title, and ability text.

import type { JourneyContent } from "../../data/journey-content";
import type { AvatarId, OpponentId } from "../../types/identifiers";
import { parseAvatarId } from "../../types/identifiers";
import type { BattleAvatarSummary, BattleEnemyDescriptor } from "../types";

export function resolveEnemyAvatarSummary(
  enemyDescriptor: BattleEnemyDescriptor,
  journeyContent: JourneyContent,
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

function findEnemySourceAvatar(
  enemyDescriptor: BattleEnemyDescriptor,
  journeyContent: JourneyContent,
) {
  const sourceId = parseEnemySourceAvatarId(enemyDescriptor.id);
  if (sourceId !== null) {
    const byId = journeyContent.avatars.find(
      (avatar) => avatar.id === sourceId,
    );
    if (byId !== undefined) {
      return byId;
    }
  }

  const descriptorName = enemyDescriptor.name.toLocaleLowerCase();
  return journeyContent.avatars.find((avatar) => {
    const fullName = avatar.name.toLocaleLowerCase();
    const shortName = fullName.split(",")[0] ?? fullName;
    return (
      descriptorName === fullName ||
      descriptorName === shortName ||
      descriptorName.endsWith(` ${fullName}`) ||
      descriptorName.endsWith(` ${shortName}`)
    );
  });
}

function parseEnemySourceAvatarId(enemyId: OpponentId): AvatarId | null {
  const prefix = "enemy:";
  if (!enemyId.startsWith(prefix)) {
    return null;
  }
  const sourceAndSeed = enemyId.slice(prefix.length);
  const seedSeparator = sourceAndSeed.lastIndexOf(":");
  if (seedSeparator <= 0) {
    return null;
  }
  return parseAvatarId(sourceAndSeed.slice(0, seedSeparator));
}
