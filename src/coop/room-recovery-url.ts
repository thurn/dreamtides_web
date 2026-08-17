import { normalizeRoomId } from "../eventlog/room";

/** Build the cold recovery entrypoint for a room URL without mounting gameplay. */
export function recoveryUrlFromLocation(href: string): string | null {
  const source = new URL(href);
  const roomId = normalizeRoomId(source.searchParams.get("game"));
  if (roomId === null) return null;
  const recovery = new URL("/recover", source.origin);
  recovery.searchParams.set("game", roomId);
  if (source.searchParams.get("realtime") === "1") {
    recovery.searchParams.set("realtime", "1");
  }
  return recovery.toString();
}
