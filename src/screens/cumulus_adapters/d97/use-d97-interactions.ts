// The overworld's one interaction dispatcher and its panel reducer. Every
// interaction, from the world (an anchor the player faces or walks to), a
// conversation (its challenge or shop hand-off), the encounter preview (Fight,
// Not now) or a HUD control, resolves to a result
// (../../../d97/overworld/interactions.ts) that this hook carries out: its log
// records, its intents through `actions.d97`, and the panel it opens. Which
// panel is open is view state; everything the game agrees on is an intent.

import { useCallback, useReducer, useRef } from "react";
import type { D97OverworldControlId } from "../../../cumulus/screens/d97/D97OverworldScreen";
import type { CompiledAnchor } from "../../../d97/map/compiled";
import {
  resolveChallenge,
  resolveFight,
  resolveInteraction,
  resolveShopOpening,
  type InteractionContext,
  type InteractionResult,
} from "../../../d97/overworld/interactions";
import { logEvent } from "../../../logging";
import { useActions } from "../../../session/hooks";
import type { DreamAnchorId } from "../../../types/identifiers";
import { overworldPanelReducer, type D97OverworldPanel } from "./d97-overworld-view-model";

function reportFailure(error: unknown): void {
  console.error("D97 overworld intent failed", error);
}

export interface D97Interactions {
  readonly panel: D97OverworldPanel | null;
  /** The player's interaction with `anchor`; false when its kind has none. */
  readonly interact: (anchor: CompiledAnchor) => boolean;
  /** A conversation's challenge at `anchorId`. */
  readonly challenge: (anchorId: DreamAnchorId) => void;
  /** A conversation's hand-off to the shop at `anchorId`. */
  readonly openShop: (anchorId: DreamAnchorId) => void;
  /** Fight in the open preview. */
  readonly fight: () => void;
  /** Not now in the open preview. */
  readonly notNow: () => void;
  readonly control: (id: D97OverworldControlId) => void;
  readonly closeDeck: () => void;
  readonly close: () => void;
}

export function useD97Interactions(context: InteractionContext, initialPanel: D97OverworldPanel | null): D97Interactions {
  const actions = useActions();
  const [panel, dispatch] = useReducer(overworldPanelReducer, initialPanel);
  // Interactions resolve against the latest run, not the one they were bound with.
  const contextRef = useRef(context);
  contextRef.current = context;
  const runId = context.run.runId;
  const questId = context.run.quests.active?.questId ?? null;

  const apply = useCallback(
    (result: InteractionResult): boolean => {
      for (const { event, fields } of result.logs) logEvent(event, fields);
      for (const intent of result.intents) void actions.d97(intent).catch(reportFailure);
      if (result.open !== undefined) dispatch({ type: "open", panel: result.open });
      return result.refusal !== "noInteraction";
    },
    [actions],
  );
  const interact = useCallback((anchor: CompiledAnchor) => apply(resolveInteraction(contextRef.current, anchor)), [apply]);
  const challenge = useCallback((anchorId: DreamAnchorId) => void apply(resolveChallenge(contextRef.current, anchorId)), [apply]);
  const openShop = useCallback((anchorId: DreamAnchorId) => void apply(resolveShopOpening(contextRef.current, anchorId)), [apply]);
  const previewAnchorId = panel?.kind === "preview" ? panel.anchorId : null;
  const fight = useCallback(() => {
    if (previewAnchorId === null) return;
    dispatch({ type: "close" });
    apply(resolveFight(contextRef.current, previewAnchorId));
  }, [apply, previewAnchorId]);
  const notNow = useCallback(() => {
    if (previewAnchorId === null) return;
    dispatch({ type: "close" });
    apply({ intents: [{ type: "D97_DECLINE_ENCOUNTER", payload: { anchorId: previewAnchorId } }], logs: [] });
  }, [apply, previewAnchorId]);
  const control = useCallback(
    (id: D97OverworldControlId) => {
      logEvent("d97_overworld_control_pressed", { control: id });
      if (id === "deck") logEvent("d97_deck_editor_opened", { runId });
      if (id === "quests") logEvent("d97_quest_log_opened", { runId, questId });
      dispatch({ type: "open", panel: { kind: id } });
    },
    [questId, runId],
  );
  const closeDeck = useCallback(() => {
    logEvent("d97_deck_editor_closed", { runId });
    dispatch({ type: "close" });
  }, [runId]);
  const close = useCallback(() => dispatch({ type: "close" }), []);
  return { panel, interact, challenge, openShop, fight, notNow, control, closeDeck, close };
}
