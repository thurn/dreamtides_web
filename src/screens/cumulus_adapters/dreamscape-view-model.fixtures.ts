// The Dreamscape art catalog the dreamscape and battle-start view model
// tests resolve scene art from.
import type { DreamscapeArtCatalog } from "../../data/dreamscapes";
import {
  testDreamscapeArtKey,
  testDreamscapeId,
} from "../../types/test-identities";

export const ART_CATALOG: DreamscapeArtCatalog = {
  dreamscapes: [
    {
      id: testDreamscapeId("test_dreamscape"),
      artKey: testDreamscapeArtKey("test_dreamscape"),
    },
  ],
  atlasData: {
    boss: {
      dreamscapeId: testDreamscapeId("fixture-boss"),
      sceneArtKey: testDreamscapeArtKey("fixture_boss_scene"),
    },
  },
};
