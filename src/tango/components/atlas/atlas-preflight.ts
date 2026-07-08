import { type ArtRef, resolveArtRef } from "../../primitives/art";
import { type AtlasMapNode } from "./AtlasMap";

function addArtRef(target: ArtRef[], ref: ArtRef | null | undefined): void {
  if (ref !== null && ref !== undefined) {
    target.push(ref);
  }
}

/**
 * Resolves every image the Atlas map and node reveal cards can show, in stable
 * first-seen order. PURE, exported for regression coverage around the preflight
 * contract.
 */
export function atlasPreflightImageUrls(nodes: AtlasMapNode[]): string[] {
  const refs: ArtRef[] = [];
  for (const item of nodes) {
    addArtRef(refs, item.view.iconRef);
    addArtRef(refs, item.view.knownDreamsignRef);
    addArtRef(refs, item.card.sceneArt);
    addArtRef(refs, item.card.figureArt);
    addArtRef(refs, item.card.dreamsign?.art);
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
