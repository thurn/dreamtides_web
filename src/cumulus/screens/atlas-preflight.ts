import { type AtlasNodeModel } from "../components/atlas/AtlasNode";
import { type ArtRef, resolveArtRef } from "../primitives/art";

function addArtRef(target: ArtRef[], ref: ArtRef | null | undefined): void {
  if (ref !== null && ref !== undefined) target.push(ref);
}

/**
 * Resolves every image the Atlas screen and node reveal cards can show, in
 * stable first-seen order.
 */
export function atlasPreflightImageUrls(nodes: AtlasNodeModel[]): string[] {
  const refs: ArtRef[] = [];
  for (const model of nodes) {
    addArtRef(refs, model.iconRef);
    addArtRef(refs, model.knownDreamsignRef);
    addArtRef(refs, model.primary.sceneArt);
    addArtRef(refs, model.primary.figureArt);
    addArtRef(refs, model.dreamsign?.art);
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const ref of refs) {
    const url = resolveArtRef(ref);
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}
