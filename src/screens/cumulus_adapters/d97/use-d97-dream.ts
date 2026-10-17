// The dream the overworld plays and its occupants. Which dream is folded
// state: the run's `dreamId` (`selectRunDream` over the dream modules); only
// whether its compiled map has arrived yet is view state. The development
// dream is ready at once; a catalog dream is null while its map loads, and
// becomes the development dream if its map cannot be loaded. A run whose
// dream is in no module plays the development dream. Logs the dream played,
// any fallback and any topology or resident findings, with UUIDs.

import { useEffect, useMemo, useRef, useState } from "react";
import { D97_CHARACTER_SPRITES } from "../../../content/d97/characters";
import { DEVELOPMENT_DREAM } from "../../../content/d97/dreams/development";
import type { D97DreamDefinition } from "../../../content/d97/dreams/schema";
import { registeredDialogueCatalog } from "../../../d97/dialogue/catalog";
import type { CompiledDreamMap } from "../../../d97/map/compiled";
import { compileDevMap } from "../../../d97/overworld/dev-map";
import { loadCompiledDreamMap, selectRunDream, type D97DreamMapLoad } from "../../../d97/overworld/dream-loading";
import { dreamOccupants, validateDreamResidents, validateDreamTopology } from "../../../d97/overworld/dream-occupants";
import type { OverworldOccupants } from "../../../d97/overworld/occupants";
import { logEvent } from "../../../logging";
import type { D97Run } from "../../../rules/d97/d97-state";
import type { DreamMapId } from "../../../types/identifiers";

export interface D97PlayedDream {
  readonly dream: D97DreamDefinition;
  readonly map: CompiledDreamMap;
  readonly occupants: OverworldOccupants;
}

const played = new Map<CompiledDreamMap, D97PlayedDream>();
function play(dream: D97DreamDefinition, map: CompiledDreamMap): D97PlayedDream {
  let entry = played.get(map);
  if (entry === undefined) {
    const registry = {
      anchors: map.anchors,
      characterIds: new Set(D97_CHARACTER_SPRITES.map((recipe) => recipe.id)),
      dialogueIds: new Set(registeredDialogueCatalog().dialogues.keys()),
    };
    const findings = [...validateDreamTopology(dream, map.anchors), ...validateDreamResidents(dream, registry)];
    if (findings.length > 0) {
      logEvent("d97_dream_findings", { dreamId: dream.id, mapId: map.id, findings });
    }
    entry = { dream, map, occupants: dreamOccupants(dream, registry) };
    played.set(map, entry);
  }
  return entry;
}

let devMap: CompiledDreamMap | null = null;
function developmentDream(): D97PlayedDream {
  devMap ??= compileDevMap();
  return play(DEVELOPMENT_DREAM, devMap);
}

/** The dream `run` is in, or null while its map loads. */
export function useD97Dream(run: D97Run): D97PlayedDream | null {
  const { runId, dreamId } = run;
  const selection = useMemo(() => selectRunDream(dreamId), [dreamId]);
  const [load, setLoad] = useState<{ readonly mapId: DreamMapId; readonly result: D97DreamMapLoad } | null>(null);
  const loggedRef = useRef<string | null>(null);
  const { dream, source } = selection;

  useEffect(() => {
    // Log once per mount and dream, despite StrictMode's doubled effects.
    const once = () => {
      const key = `${runId}:${dream.id}`;
      if (loggedRef.current === key) return false;
      loggedRef.current = key;
      return true;
    };
    if (source === "unknown") {
      if (once()) logEvent("d97_dream_fallback", { runId, dreamId, mapId: null, reason: "unknownDream", fallbackDreamId: dream.id });
      return;
    }
    if (source === "development") {
      if (once()) logEvent("d97_dream_loaded", { runId, dreamId: dream.id, mapId: dream.mapId, source });
      return;
    }
    let cancelled = false;
    void loadCompiledDreamMap(dream.mapId).then((result) => {
      if (cancelled) return;
      setLoad({ mapId: dream.mapId, result });
      if (!once()) return;
      if (result.ok) logEvent("d97_dream_loaded", { runId, dreamId: dream.id, mapId: dream.mapId, source });
      else {
        logEvent("d97_dream_fallback", {
          runId,
          dreamId: dream.id,
          mapId: dream.mapId,
          reason: result.reason,
          fallbackDreamId: DEVELOPMENT_DREAM.id,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dream.id, dream.mapId, dreamId, runId, source]);

  if (source !== "catalog") return developmentDream();
  if (load === null || load.mapId !== dream.mapId) return null;
  return load.result.ok ? play(dream, load.result.map) : developmentDream();
}
