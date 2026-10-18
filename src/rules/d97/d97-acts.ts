// The run's assembled act as the D97 rules read it (Appendix B §B4, §B7):
// assembling Act 1 when the run starts (src/d97/assembly/), and resolving
// against the stored act who stands at a battle anchor, what an assembled
// challenger speaks, and the exit door the incarnation blocks. The act is
// written once into run state and never re-derived (decision P5).
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import { D97_ACT_SHAPE } from "../../content/d97/acts";
import type { D97DialogueModule } from "../../content/d97/dialogue/schema";
import type { D97BattleResident } from "../../content/d97/dreams/schema";
import { assembleAct, oneDreamAct, type D97ActAssembly, type D97ActAttemptFailure } from "../../d97/assembly/assemble";
import type { D97Act, D97ActFallback, D97ActStartDream } from "../../d97/assembly/types";
import type { ReducerLogRecord } from "../../eventlog/types";
import type { D97DreamId, D97RunId, D97RunSeed, DreamAnchorId } from "../../types/identifiers";
import type { D97ContentProvider, D97RegisteredDream } from "./d97-content";
import { runDreamAnchor } from "./d97-dreams";
import { d97RunActOf, type D97Run } from "./d97-state";

/** `registered` as assembly reads a start dream: its catalog entry when it is a catalog dream. */
function startDreamOf(content: D97ContentProvider, registered: D97RegisteredDream): D97ActStartDream {
  const entry = content.actCatalog.dreams.find((candidate) => candidate.dream.id === registered.definition.id);
  return entry === undefined
    ? { dream: registered.definition, anchors: registered.anchors, personas: [], quests: [] }
    : { dream: entry.dream, anchors: entry.anchors, personas: entry.dream.personas, quests: entry.dream.quests };
}

/** Act 1 of a run starting in `start`, assembled from the run seed. */
export function assembleFirstAct(content: D97ContentProvider, start: D97RegisteredDream, runSeed: D97RunSeed): D97ActAssembly {
  return assembleAct({ runSeed, number: 1, start: startDreamOf(content, start), catalog: content.actCatalog, shape: D97_ACT_SHAPE });
}

/**
 * The one-dream Act 1 of `dreamId` for a run of `runSeed`, which a save from
 * before act assembly is given on load; null for an unregistered dream.
 */
export function oneDreamFirstAct(
  content: D97ContentProvider,
  dreamId: D97DreamId,
  runSeed: D97RunSeed,
  fallback: D97ActFallback,
): D97Act | null {
  const registered = content.dreams.get(dreamId);
  if (registered === undefined) return null;
  return oneDreamAct({ runSeed, number: 1, start: startDreamOf(content, registered), deckSourceAvatarIds: content.actCatalog.deckSourceAvatarIds, fallback });
}

/** The log records of an act's assembly: each failed attempt, then the act, with UUIDs only. */
export function actAssemblyLogRecords(
  runId: D97RunId,
  act: D97Act,
  failures: readonly D97ActAttemptFailure[],
  shortfall: string | null,
): ReducerLogRecord[] {
  return [
    ...failures.map((failure) => ({
      event: "d97_act_attempt_failed",
      fields: { runId, actId: act.actId, act: act.number, salt: failure.salt, findings: failure.findings },
    })),
    {
      event: "d97_act_assembled",
      fields: {
        runId,
        actId: act.actId,
        act: act.number,
        salt: act.salt,
        attempts: failures.length + 1,
        fallback: act.fallback,
        shortfall,
        entryDreamId: act.entryDreamId,
        incarnationDreamId: act.incarnationDreamId,
        dreamIds: act.dreamIds,
        doors: act.doors,
        exitDoor: act.exitDoor,
        guardians: act.guardians,
        challengers: act.challengers,
        quests: act.quests,
      },
    },
  ];
}

/**
 * Who stands at the battle anchor `anchorId` of the run's dream, as its act
 * seats them (§B7): an assembled generic challenger with its persona's look
 * and lines and its deck source, or the dream module's own challenger or
 * guardian at a seat the act leaves to it. Null for an anchor the act leaves
 * empty, one outside the run's dream or the map the player is on, and a run
 * without an act.
 */
export function runBattleResident(run: D97Run, content: D97ContentProvider, anchorId: DreamAnchorId): D97BattleResident | null {
  const dream = runDreamAnchor(run, content, anchorId);
  const act = d97RunActOf(run);
  if (dream === null || act === null) return null;
  const at = (seat: { readonly dreamId: D97DreamId; readonly anchorId: DreamAnchorId }) => seat.dreamId === run.dreamId && seat.anchorId === anchorId;
  const challenger = act.challengers.find(at);
  if (challenger !== undefined) {
    const { occupant } = challenger;
    if (occupant.kind === "resident") return dream.challengers.get(anchorId) ?? null;
    return {
      role: "challenger",
      anchorId,
      characterId: occupant.characterId,
      ...(occupant.dialogueId === null ? {} : { dialogueId: occupant.dialogueId }),
      scale: "standard",
      deck: { kind: "generic", deckSourceAvatarId: occupant.deckSourceAvatarId },
    };
  }
  const guardian = act.guardians.find(at);
  return guardian?.authored === true ? (dream.challengers.get(anchorId) ?? null) : null;
}

/**
 * The registered dialogue the occupant of `anchorId` in the run's dream
 * speaks: an assembled challenger's persona's, or the dream module's
 * resident's (`speakerDialogue`); null when it speaks none.
 */
export function runSpeakerDialogue(run: D97Run, content: D97ContentProvider, anchorId: DreamAnchorId): D97DialogueModule | null {
  const dream = runDreamAnchor(run, content, anchorId);
  if (dream === null) return null;
  const seat = d97RunActOf(run)?.challengers.find((candidate) => candidate.dreamId === run.dreamId && candidate.anchorId === anchorId);
  if (seat?.occupant.kind !== "generic") return dream.speakerDialogue(anchorId, run.avatarId);
  return seat.occupant.dialogueId === null ? null : (content.dialogue.dialogues.get(seat.occupant.dialogueId) ?? null);
}

/**
 * The act's exit door when it stands in the run's dream, with the guardian
 * anchor seating the incarnation that blocks it; null in every other dream
 * and for a run without an act.
 */
export function runExitDoor(run: D97Run): { readonly doorAnchorId: DreamAnchorId; readonly guardianAnchorId: DreamAnchorId } | null {
  const act = d97RunActOf(run);
  const incarnation = act?.guardians.find((seat) => seat.seat === "incarnation");
  if (act === null || incarnation === undefined || act.exitDoor.dreamId !== run.dreamId) return null;
  return { doorAnchorId: act.exitDoor.anchorId, guardianAnchorId: incarnation.anchorId };
}
