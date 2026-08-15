import {
  semanticEntityId,
  type SemanticEntityNamespace,
} from "../../../types/semantic-identity";
import type { SemanticEntityId } from "../../../types/identifiers";

/** Preserve UUID identities and deterministically namespace older stable ids. */
export function revealEntityId<SourceIdentity extends string>(
  namespace: SemanticEntityNamespace,
  id: SourceIdentity,
): SemanticEntityId {
  return semanticEntityId(namespace, id);
}
