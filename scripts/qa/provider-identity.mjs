/** Shared admission shape for originally negotiated stateful transport identity.
 * @param {unknown} sessionId @param {unknown} url @param {unknown} protocolVersion
 */
export function parseProviderIdentity(sessionId, url, protocolVersion) {
  if (typeof sessionId !== "string" || !/^[\x21-\x7e]+$/u.test(sessionId) ||
    typeof protocolVersion !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(protocolVersion) || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.href !== url || parsed.username || parsed.password || parsed.hash) return null;
  } catch { return null; }
  return { sessionId, url, protocolVersion };
}
