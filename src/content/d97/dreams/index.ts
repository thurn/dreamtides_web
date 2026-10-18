// The D97 dream catalog: every authored catalog dream, in catalog order
// (decision P18), each beside its brief (`<dream-uuid>.md`). A catalog dream
// names its map (`../maps/`), size class and tileset, and declares its
// topology, town, residents, personas and quests (`./schema.ts`);
// `npm run d97:dialogue -- validate` runs the catalog validator
// (src/d97/dreams/validate.ts) over it. The rules know a dream only once the
// D97 content provider registers it
// (src/session/providers/d97-content-provider.ts): the catalog in every
// build, the development dream (`./development.ts`) in development builds
// only.

import dream3229d6c7 from "./3229d6c7-0700-4f37-9b07-921e3dccb8b6";
import type { D97CatalogDream } from "./schema";

export const D97_DREAMS: readonly D97CatalogDream[] = [dream3229d6c7];
