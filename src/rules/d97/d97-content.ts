// The content seam D97 reducer cases read. The app registers it from the
// loaded catalogs before any event folds (src/session/providers/), so the
// cases stay pure and every fold of a log on one build sees the same content.

import type { AvatarId } from "../../types/identifiers";

/** Fold-relevant D97 content identities. */
export interface D97ContentProvider {
  /** Every Avatar a run may start with (the full roster). */
  readonly avatarIds: ReadonlySet<AvatarId>;
}

let provider: D97ContentProvider | null = null;

/** Register the D97 content before any game event is folded. */
export function registerD97ContentProvider(
  next: D97ContentProvider | null,
): void {
  provider = next;
}

/** The registered D97 content, or null before registration. */
export function d97ContentProvider(): D97ContentProvider | null {
  return provider;
}
