/**
 * Multiplayer-coexistence gate for the battle AI.
 *
 * The AI is a LOCAL actor: it runs the planner on one client and dispatches the
 * enemy's commands into the shared room. If two clients connected to the same
 * room both ran the AI, they would each propose and drive the enemy and corrupt
 * the shared battle state. The AI must therefore run on exactly ONE client.
 *
 * Every battle in this app lives inside a Firebase room with an always-present
 * `roomId` and a per-client `clientId`; there is no null/local sentinel for the
 * single-player quest flow and no host/owner concept in the room model. The only
 * signal that distinguishes "this client is alone" from "two clients are sharing
 * the room" is presence: the number of clients currently connected to the room.
 *
 * v1 decision (`battle_ai.md` §"Multiplayer"): the AI is DISABLED in shared
 * rooms. The safe, conservative rule is therefore to run the AI only when this
 * client is the SOLE connected client. A missing/zero count is treated as a
 * single local client (the AI's own client is always present in practice, and a
 * count that has not yet been observed should not corrupt anything because it
 * means no OTHER client is known to be connected).
 */
export interface AiMayRunHereInput {
  /**
   * Number of clients currently connected to the shared room (connected
   * presence entries). `undefined`/`null` means presence is unknown; that is
   * treated as a single local client.
   */
  connectedCount: number | null | undefined;
}

/**
 * Returns whether the battle AI may run on THIS client. True only when this is
 * the sole connected client in the room (count <= 1, or unknown). Two or more
 * connected clients → a shared multiplayer room → the AI must NOT run here.
 *
 * This is the ADDITIONAL gate layered on top of `aiMode`: `aiMode` still has to
 * be enabled for the AI to do anything; this function only decides whether the
 * single-client safety condition holds.
 */
export function aiMayRunHere({ connectedCount }: AiMayRunHereInput): boolean {
  if (connectedCount === null || connectedCount === undefined) {
    return true;
  }
  return connectedCount <= 1;
}
