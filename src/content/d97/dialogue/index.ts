// The D97 dialogue catalog: every authored dream's dialogue modules, quests
// and quest items. Each dream's residents bead registers its content here;
// `npm run d97:dialogue -- validate` checks it.

import type { D97DialogueContent } from "./schema";

export const D97_DIALOGUE_CONTENT: D97DialogueContent = {
  dialogues: [],
  quests: [],
  items: [],
};
