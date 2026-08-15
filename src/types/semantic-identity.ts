import { sha256 } from "js-sha256";
import { parseSemanticEntityId, type SemanticEntityId } from "./identifiers";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Preserve UUIDs and deterministically namespace stable domain identities. */
export type SemanticEntityNamespace =
  | "atlas-node"
  | "card-rules-text"
  | "avatar"
  | "dreamsign"
  | "dreamsign-gallery-action"
  | "avatar-rules-text"
  | "dreamsign-rules-text"
  | "dreamwell-card-rules-text"
  | "essence-source"
  | "figment"
  | "gallery-action"
  | "game-card"
  | "game-card-copies"
  | "generated-battle-card"
  | "glossary-term"
  | "offer"
  | "opponent-avatar-rules-text"
  | "resource-essence"
  | "site"
  | "dreamwell-card"
  | "test"
  | "tide"
  | "test:essence-source";

export function semanticEntityId<SourceIdentity extends string>(
  namespace: SemanticEntityNamespace,
  id: SourceIdentity,
): SemanticEntityId {
  if (UUID_PATTERN.test(id)) return parseSemanticEntityId(id);
  const digest = sha256(`${namespace}\u0000${id}`).slice(0, 32).split("");
  digest[12] = "4";
  digest[16] = ((Number.parseInt(digest[16] ?? "0", 16) & 0x3) | 0x8).toString(
    16,
  );
  const hex = digest.join("");
  return parseSemanticEntityId(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`,
  );
}
