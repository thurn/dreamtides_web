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
 * client is the SOLE connected client AND that fact is actually known. A
 * missing/not-yet-observed count does NOT default to "treat as local": every
 * battle lives in a room (single-player included), presence resolves within a
 * moment of RoomGate writing it, and two clients whose presence has not yet
 * loaded could otherwise both default to "I'm alone" and both drive the enemy
 * — corrupting the shared battle. Gating off (never running) until presence is
 * confirmed connected is the safe default; single-player briefly withholds the
 * AI for the same window before presence resolves, then proceeds normally.
 */
export interface AiMayRunHereInput {
  /**
   * Number of clients currently connected to the shared room (connected
   * presence entries). `undefined`/`null` means presence is unknown.
   */
  connectedCount: number | null | undefined;
}

/**
 * Returns whether the battle AI may run on THIS client. True only when
 * presence is KNOWN and this is the sole connected client (count <= 1).
 * Unknown presence (`null`/`undefined`) and two-or-more connected clients (a
 * shared multiplayer room) both mean the AI must NOT run here.
 *
 * This is the ADDITIONAL gate layered on top of `aiMode`: `aiMode` still has to
 * be enabled for the AI to do anything; this function only decides whether the
 * single-client safety condition holds.
 */
export function aiMayRunHere({ connectedCount }: AiMayRunHereInput): boolean {
  if (connectedCount === null || connectedCount === undefined) {
    return false;
  }
  return connectedCount <= 1;
}
