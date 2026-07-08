/** FNV-1a 32-bit hash of `text`, as 8-char lowercase hex. Deterministic and
 *  dependency-free — used only to detect drift in registered card rules text,
 *  not for security. */
export function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
