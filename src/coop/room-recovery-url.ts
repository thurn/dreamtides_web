import { normalizeRoomId } from "../eventlog/game-id";

/** The URL that reopens the current `?game=` from its stored log. */
export function recoveryUrlFromLocation(href: string): string | null {
  const source = new URL(href);
  const gameId = normalizeRoomId(source.searchParams.get("game"));
  if (gameId === null) return null;
  const recovery = new URL("/", source.origin);
  recovery.searchParams.set("game", gameId);
  return recovery.toString();
}
