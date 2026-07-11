const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Preserve UUID identities and deterministically namespace older stable ids. */
export function revealEntityId(namespace: string, id: string): string {
  if (UUID_PATTERN.test(id)) return id;
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const character of `${namespace}:${id}`.toLowerCase()) {
    left = Math.imul(left ^ character.charCodeAt(0), 0x01000193) >>> 0;
    right = Math.imul(right ^ character.charCodeAt(0), 0x85ebca6b) >>> 0;
  }
  const hex = `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}0000000000000000`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
