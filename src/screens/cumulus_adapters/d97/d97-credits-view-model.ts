// D97 credits view-model rules: one entry per art source in the manifest
// (P23), in manifest order, carrying its title, page, every license and every
// credited author. The attribution files live in the local art library, not
// in the build, so each shows by the file name it ships under in the source;
// the source's page leads to it.

import type { D97ArtSource } from "../../../content/d97/art-sources";
import type { D97CreditsView } from "../../../cumulus/screens/d97/D97CreditsPanel";

/** A library-relative path's final segment: the name the file ships under. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The credits screen's view of `sources`. */
export function buildD97CreditsView(sources: readonly D97ArtSource[]): D97CreditsView {
  return {
    sources: sources.map((source) => ({
      directory: source.directory,
      title: source.title,
      url: source.url,
      licenses: source.licenses,
      authors: source.authors,
      creditsFiles: source.creditsFiles.map(fileName),
    })),
  };
}
