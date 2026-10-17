// The D97 dream catalog: every authored dream module, in catalog order
// (decision P18). A dream module names its map (`../maps/`), declares its
// topology and its residents (`./schema.ts`); `npm run d97:dialogue --
// validate` checks both against its map's anchors and the character and
// dialogue catalogs. The rules know a dream only once the D97 content
// provider registers it (src/session/providers/d97-content-provider.ts): the
// catalog in every build, the development dream (`./development.ts`) in
// development builds only.

import dream3229d6c7 from "./3229d6c7-0700-4f37-9b07-921e3dccb8b6";
import type { D97DreamDefinition } from "./schema";

export const D97_DREAMS: readonly D97DreamDefinition[] = [dream3229d6c7];
