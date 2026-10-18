// The dream the overworld plays, the map of it the player is on, and its
// occupants. Which dream and which map are folded state: the run's `dreamId`,
// among the dreams the D97 content provider registers (`selectRunDream`), and
// the room of its last place (`d97RunRoomId`, decision P19), whose map is
// played instead of the dream's own. Only whether a compiled map has arrived
// yet is view state. The development dream's own map, registered in
// development builds only, is ready at once; a catalog map (every room's
// included) loads while it is fetched. A run whose dream is not registered,
// or whose map cannot be loaded, has no dream to play: the hook reports it
// unavailable. Its occupants are the dream's residents on all its maps, drawn
// for the Avatar the run plays; the scene shows those standing on the map
// played. Logs each map loaded, an unavailable dream and any topology or
// resident findings, with UUIDs.

import { useEffect, useMemo, useRef, useState } from "react";
import { D97_CHARACTER_SPRITES } from "../../../content/d97/characters";
import type { D97DreamDefinition } from "../../../content/d97/dreams/schema";
import type { CompiledDreamMap } from "../../../d97/map/compiled";
import {
  loadCompiledDreamMap,
  selectRunDream,
  type D97DreamMapFailure,
  type D97DreamMapLoad,
} from "../../../d97/overworld/dream-loading";
import { dreamOccupants, validateDreamResidents, validateDreamTopology } from "../../../d97/overworld/dream-occupants";
import type { OverworldOccupants } from "../../../d97/overworld/occupants";
import { logEvent } from "../../../logging";
import { d97ContentProvider } from "../../../rules/d97/d97-content";
import { d97RunRoomId, type D97Run } from "../../../rules/d97/d97-state";
import { d97DevelopmentContent } from "../../../runtime/qa-scene-entry";
import type { AvatarId, D97RoomId, DreamMapId } from "../../../types/identifiers";

export interface D97PlayedDream {
  readonly dream: D97DreamDefinition;
  /** The room whose map is played, or null for the dream's own map. */
  readonly roomId: D97RoomId | null;
  /** The map played: the dream's own, or the room's. */
  readonly map: CompiledDreamMap;
  readonly occupants: OverworldOccupants;
}

/** Why a run has no dream to play: its dream is not registered, or its map failed to load. */
export type D97DreamUnavailableReason = "unknownDream" | D97DreamMapFailure;

export type D97DreamState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly played: D97PlayedDream }
  | { readonly kind: "unavailable"; readonly reason: D97DreamUnavailableReason };

const LOADING: D97DreamState = { kind: "loading" };

/** Each map's played dream, per Avatar the run plays (its residents' incarnations). */
const played = new Map<CompiledDreamMap, Map<AvatarId, D97PlayedDream>>();
function play(dream: D97DreamDefinition, roomId: D97RoomId | null, map: CompiledDreamMap, runAvatarId: AvatarId): D97PlayedDream {
  let byAvatar = played.get(map);
  if (byAvatar === undefined) {
    byAvatar = new Map();
    played.set(map, byAvatar);
  }
  let entry = byAvatar.get(runAvatarId);
  if (entry === undefined) {
    const development = d97DevelopmentContent();
    const sprites = development === null ? D97_CHARACTER_SPRITES : [...D97_CHARACTER_SPRITES, ...development.characterSprites];
    // The dream's anchors on all its maps, as the content provider registered
    // them; the played map's own when the dream is not registered.
    const anchors = d97ContentProvider()?.dreams.get(dream.id)?.anchors ?? map.anchors.map((anchor) => ({ ...anchor, roomId }));
    const registry = {
      anchors,
      characterIds: new Set(sprites.map((recipe) => recipe.id)),
      dialogues: d97ContentProvider()?.dialogue.dialogues ?? new Map(),
    };
    const findings = [...validateDreamTopology(dream, anchors), ...validateDreamResidents(dream, registry)];
    if (findings.length > 0 && byAvatar.size === 0) {
      logEvent("d97_dream_findings", { dreamId: dream.id, mapId: map.id, findings });
    }
    entry = { dream, roomId, map, occupants: dreamOccupants(dream, registry, runAvatarId) };
    byAvatar.set(runAvatarId, entry);
  }
  return entry;
}

const inlineMaps = new Map<DreamMapId, CompiledDreamMap>();

/** The dream `run` is in: loading while its map arrives, or unavailable. */
export function useD97Dream(run: D97Run): D97DreamState {
  const { runId, dreamId, avatarId } = run;
  const roomId = d97RunRoomId(run);
  const selection = useMemo(() => {
    const dreams = [...(d97ContentProvider()?.dreams.values() ?? [])].map((dream) => dream.definition);
    return selectRunDream(dreamId, dreams, d97DevelopmentContent());
  }, [dreamId]);
  const [load, setLoad] = useState<{ readonly mapId: DreamMapId; readonly result: D97DreamMapLoad } | null>(null);
  const loggedRef = useRef<string | null>(null);
  // The room the player is in, when the dream still has it; else its own map.
  const room = selection.dream?.rooms.find((candidate) => candidate.id === roomId) ?? null;
  const mapId = room?.mapId ?? selection.dream?.mapId ?? null;
  // The development dream's own map compiles in code; every other map is fetched.
  const inline = selection.source === "development" && room === null;

  useEffect(() => {
    // Log once per mount, dream and map, despite StrictMode's doubled effects.
    const once = () => {
      const key = `${runId}:${dreamId}:${mapId ?? ""}`;
      if (loggedRef.current === key) return false;
      loggedRef.current = key;
      return true;
    };
    const unavailable = (reason: D97DreamUnavailableReason) =>
      logEvent("d97_dream_unavailable", { runId, dreamId, roomId: room?.id ?? null, mapId, reason });
    if (selection.source === "unknown" || mapId === null) {
      if (once()) unavailable("unknownDream");
      return;
    }
    const loaded = { runId, dreamId, roomId: room?.id ?? null, mapId, source: selection.source };
    if (inline) {
      if (once()) logEvent("d97_dream_loaded", loaded);
      return;
    }
    let cancelled = false;
    void loadCompiledDreamMap(mapId).then((result) => {
      if (cancelled) return;
      setLoad({ mapId, result });
      if (!once()) return;
      if (result.ok) logEvent("d97_dream_loaded", loaded);
      else unavailable(result.reason);
    });
    return () => {
      cancelled = true;
    };
  }, [dreamId, inline, mapId, room, runId, selection]);

  if (selection.source === "unknown" || mapId === null) return { kind: "unavailable", reason: "unknownDream" };
  if (selection.source === "development" && inline) {
    const { dream, compileMap } = selection;
    let map = inlineMaps.get(dream.mapId);
    if (map === undefined) {
      map = compileMap();
      inlineMaps.set(dream.mapId, map);
    }
    return { kind: "ready", played: play(dream, null, map, avatarId) };
  }
  if (load === null || load.mapId !== mapId) return LOADING;
  return load.result.ok
    ? { kind: "ready", played: play(selection.dream, room?.id ?? null, load.result.map, avatarId) }
    : { kind: "unavailable", reason: load.result.reason };
}
