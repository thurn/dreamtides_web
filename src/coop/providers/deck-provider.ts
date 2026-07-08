// Real DeckContentProvider: pure UUID lookups against the loaded quest content.
//
// `ADD_CARD` carries a card UUID (resolved to its `cardNumber`) and
// `ADD_DREAMSIGN` carries a dreamsign UUID (resolved to its full record). Both
// are content-catalogue lookups with no randomness, so this adapter is a thin
// wrapper over the id index and the dreamsign templates captured at
// registration time.

import type { QuestContent } from "../../data/quest-content";
import { buildIdIndex } from "../../data/cards-v2-database";
import { createDreamsign } from "../../data/dreamsigns";
import type { Dreamsign } from "../../types/quest";
import type { DeckContentProvider } from "../../rules/quest/deck";

export function createDeckContentProvider(
  content: QuestContent,
): DeckContentProvider {
  // The collision-free UUID (lowercased) -> cardNumber index. Built once here
  // from the captured card database so lookups never re-scan the catalogue.
  const idIndex = buildIdIndex(content.cardDatabase);
  const templateById = new Map(
    content.dreamsignTemplates.map((template) => [template.id, template]),
  );

  return {
    resolveCardNumber: (cardId) => idIndex.get(cardId.toLowerCase()) ?? null,
    resolveDreamsign: (dreamsignId): Dreamsign | null => {
      const template = templateById.get(dreamsignId);
      return template === undefined ? null : createDreamsign(template);
    },
  };
}
