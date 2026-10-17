// The D97 dialogue catalog: every authored dream's dialogue modules, quests
// and quest items. Each dream's residents bead registers its content here;
// `npm run d97:dialogue -- validate` checks it.

import { FIRST_DREAM_DIALOGUE_CONTENT } from "./3229d6c7-0700-4f37-9b07-921e3dccb8b6";
import type { D97DialogueContent } from "./schema";

const CONTENTS: readonly D97DialogueContent[] = [FIRST_DREAM_DIALOGUE_CONTENT];

export const D97_DIALOGUE_CONTENT: D97DialogueContent = {
  dialogues: CONTENTS.flatMap((content) => content.dialogues),
  quests: CONTENTS.flatMap((content) => content.quests),
  items: CONTENTS.flatMap((content) => content.items),
};
