// D97 credits view-model rules: one entry per art source in the manifest
// (P23), in manifest order, carrying its title, page, every license and every
// credited author. The attribution files live in the local art library, not
// in the build, so each shows by the file name it ships under in the source;
// the source's page leads to it. When workspace preparation generated the
// character credits, the character generator's entry lists the authors and
// licenses of exactly the sprite parts the game uses instead of its catalog
// summary.

import type { D97ArtSource } from "../../../content/d97/art-sources";
import type { D97CreditsView } from "../../../cumulus/screens/d97/D97CreditsPanel";
import { CHARACTER_GENERATOR_DIRECTORY, type CharacterCredits } from "../../../d97/overworld/characters/credits";

/** A library-relative path's final segment: the name the file ships under. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The credits screen's view of `sources`, with the generated `characterCredits` when there are any. */
export function buildD97CreditsView(sources: readonly D97ArtSource[], characterCredits: CharacterCredits | null): D97CreditsView {
  return {
    sources: sources.map((source) => {
      const parts = characterCredits !== null && source.directory === CHARACTER_GENERATOR_DIRECTORY ? characterCredits : null;
      return {
        directory: source.directory,
        title: source.title,
        url: source.url,
        licenses: parts?.licenses ?? source.licenses,
        authors: parts?.authors ?? source.authors,
        creditsFrom: parts === null ? "catalog" : "parts",
        creditsFiles: source.creditsFiles.map(fileName),
      };
    }),
  };
}
