import { sha256 } from "js-sha256";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Preserve UUID identities and deterministically namespace older stable ids. */
export function revealEntityId(namespace: string, id: string): string {
  if (UUID_PATTERN.test(id)) return id;
  const digest = sha256(`${namespace}\u0000${id}`).slice(0, 32).split("");
  digest[12] = "4";
  digest[16] = ((Number.parseInt(digest[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const hex = digest.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
