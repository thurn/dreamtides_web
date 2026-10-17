// The dialogue catalog, indexed by UUID: the dream catalog's dialogue,
// quests and items, and in a development build the development dream's
// fixtures beside them. The D97 content provider builds it from the content
// it registers (src/session/providers/d97-content-provider.ts).

import type {
  D97DialogueContent,
  D97DialogueModule,
  D97ItemDefinition,
} from "../../content/d97/dialogue/schema";
import type { D97DialogueId, D97ItemId } from "../../types/identifiers";
import type { D97QuestCatalog } from "../quests/quests";

export interface D97DialogueCatalog {
  readonly dialogues: ReadonlyMap<D97DialogueId, D97DialogueModule>;
  readonly quests: D97QuestCatalog;
  readonly items: ReadonlyMap<D97ItemId, D97ItemDefinition>;
}

/** Index `contents` by UUID; a later duplicate id replaces an earlier one. */
export function buildDialogueCatalog(contents: readonly D97DialogueContent[]): D97DialogueCatalog {
  return {
    dialogues: new Map(contents.flatMap((content) => content.dialogues.map((module) => [module.id, module]))),
    quests: new Map(contents.flatMap((content) => content.quests.map((quest) => [quest.id, quest]))),
    items: new Map(contents.flatMap((content) => content.items.map((item) => [item.id, item]))),
  };
}
