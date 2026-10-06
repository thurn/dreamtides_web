// Card, Dreamsign, and Avatar choice views and authored action parameters
// shared by the Exploration action and resolution view models.

import { resolveDeckEntryCard } from "../../card-type-change";
import type { GameCardModel } from "../../cumulus/components/card/CardView";
import type { ExplorationCardChoiceView } from "../../cumulus/screens/ExplorationSiteScreen";
import type { ExplorationActionContent } from "../../data/exploration";
import { createDreamsign } from "../../data/dreamsigns";
import { toJourneyAvatar } from "../../data/avatar-selection";
import type { JourneyContent } from "../../data/journey-content";
import { toDreamsignView } from "../../cumulus/components/hud/dreamsign-view";
import type { CardData } from "../../types/cards";
import type { DeckEntry } from "../../types/journey";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import type { DreamsignId } from "../../types/identifiers";
import type { AvatarId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import { parseDreamsignId } from "../../types/identifiers";

/** A custom Exploration Dreamsign or catalog Dreamsign by id, or null. */
export function dreamsignById(
  content: JourneyContent,
  dreamsignId: DreamsignId,
): ReturnType<typeof createDreamsign> | null {
  const customDreamsign = content.exploration.customDreamsigns.find(
    (dreamsign) => dreamsign.id === dreamsignId,
  );
  if (customDreamsign !== undefined) return customDreamsign;
  const template = content.dreamsignTemplates.find(
    (dreamsign) => dreamsign.id === dreamsignId,
  );
  return template === undefined ? null : createDreamsign(template);
}

/** The journey Avatar for an Avatar id, or null. */
export function avatarById(content: JourneyContent, avatarId: AvatarId) {
  const normalized = avatarId.toLowerCase();
  const avatar = content.avatars.find(
    (candidate) => candidate.id.toLowerCase() === normalized,
  );
  return avatar === undefined ? null : toJourneyAvatar(avatar);
}

/** The card view model displaying a card as-is. */
export function modelForCard(card: CardData): GameCardModel {
  return { cardId: card.id, displaySnapshot: card };
}

/** A deck entry as a card choice showing its resolved, transfigured card. */
export function deckCardChoice(
  entry: DeckEntry,
  content: JourneyContent,
): ExplorationCardChoiceView<DeckEntryId> | null {
  const base = content.cardDatabase.get(entry.cardNumber);
  if (base === undefined) return null;
  const resolved = resolveDeckEntryCard(
    content.transfigurationData,
    base,
    entry,
  );
  const transfiguration =
    entry.transfiguration === null
      ? undefined
      : buildTransfigurationDisplay(
          content.transfigurationData,
          base,
          entry.transfiguration,
        ).display;
  return {
    entryId: entry.entryId,
    model: {
      ...modelForCard(resolved),
      ...(transfiguration === undefined ? {} : { transfiguration }),
    },
    isBane: entry.isBane,
  };
}

/** Dreamsign views for Dreamsign ids, skipping unknown ids. */
export function dreamsignChoices(
  ids: readonly string[],
  content: JourneyContent,
): readonly ReturnType<typeof toDreamsignView>[] {
  return ids.flatMap((id) => {
    const dreamsign = dreamsignById(content, parseDreamsignId(id));
    if (dreamsign === null) return [];
    return [toDreamsignView(dreamsign)];
  });
}

/** The authored essence-per-spark rate of a purge-for-essence action. */
export function authoredEssencePerSpark(
  action: ExplorationActionContent,
): number {
  if (action.essencePerSpark === undefined) {
    throw new Error("Missing essencePerSpark on purge-for-essence action.");
  }
  return action.essencePerSpark;
}

/** The distinct `{name}` placeholders in an authored message template. */
export function templateArgumentNames(message: string): readonly string[] {
  return [
    ...new Set(
      [...message.matchAll(/\{([a-z][a-z0-9_]*)\}/gu)].map(
        (match) => match[1] ?? "",
      ),
    ),
  ];
}
