import { roomPath } from "./room-paths";

export function battleStatePath(roomId: string): string {
  return `${roomPath(roomId)}/battleState`;
}

export function battleStateInitPath(roomId: string): string {
  return `${battleStatePath(roomId)}/init`;
}

export function battleStateReducerPath(roomId: string): string {
  return `${battleStatePath(roomId)}/reducer`;
}
