import { semanticEntityId } from "../../../types/semantic-identity";

/** Preserve UUID identities and deterministically namespace older stable ids. */
export function revealEntityId(namespace: string, id: string): string {
  return semanticEntityId(namespace, id);
}
