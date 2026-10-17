// The registered dialogue content, indexed by UUID: the dream catalog's
// dialogue, quests and items, plus the development dream's fixtures, which
// stand on the development dream the overworld shows until authored dreams
// are wired in.

import { D97_DIALOGUE_CONTENT } from "../../content/d97/dialogue";
import type {
  D97DialogueContent,
  D97DialogueModule,
  D97ItemDefinition,
} from "../../content/d97/dialogue/schema";
import type { D97DialogueId, D97ItemId } from "../../types/identifiers";
import { DEV_DIALOGUE_CONTENT } from "../overworld/dev-dialogue";
import type { D97QuestCatalog } from "../quests/quests";

export interface D97DialogueCatalog {
  readonly dialogues: ReadonlyMap<D97DialogueId, D97DialogueModule>;
  readonly quests: D97QuestCatalog;
  readonly items: ReadonlyMap<D97ItemId, D97ItemDefinition>;
}

/** Every body of dialogue content the game registers, in order. */
export const REGISTERED_DIALOGUE_CONTENT: readonly D97DialogueContent[] = [
  D97_DIALOGUE_CONTENT,
  DEV_DIALOGUE_CONTENT,
];

/** Index `contents` by UUID; a later duplicate id replaces an earlier one. */
export function buildDialogueCatalog(contents: readonly D97DialogueContent[]): D97DialogueCatalog {
  return {
    dialogues: new Map(contents.flatMap((content) => content.dialogues.map((module) => [module.id, module]))),
    quests: new Map(contents.flatMap((content) => content.quests.map((quest) => [quest.id, quest]))),
    items: new Map(contents.flatMap((content) => content.items.map((item) => [item.id, item]))),
  };
}

let registered: D97DialogueCatalog | null = null;

/** The registered dialogue catalog, built once. */
export function registeredDialogueCatalog(): D97DialogueCatalog {
  registered ??= buildDialogueCatalog(REGISTERED_DIALOGUE_CONTENT);
  return registered;
}
