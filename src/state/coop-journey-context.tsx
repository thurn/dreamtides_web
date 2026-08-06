// The coop-backed journey context provider.
//
// This mounts inside `CoopProvider` (src/coop/hooks.ts) and re-backs the
// legacy `JourneyContextValue` interface that every journey screen consumes:
//   - `state` comes from `useGameState().journey` (the displayed fold, confirmed +
//     optimistic), instead of the RTDB-mirrored multiplayer room.
//   - `mutations` are thin adapters over the Task-25 action facade
//     (`useActions()`): each legacy `JourneyMutations` method resolves its display
//     identifiers (cardNumber, dreamsign/dreamscape index, placement) to the
//     event payload's UUID / index / nodeId at THIS boundary and appends one
//     event. Screens keep their call sites unchanged — only the implementation
//     under the interface changes.
//
// Fields the reducer reads that the typed facade does not surface (e.g.
// `purgeIndex` on ACCEPT_REWARD / ACCEPT_DREAMSIGN_OFFER / BUY_SHOP_SLOT, the
// optional transfiguration `type`, `essenceCost` on REROLL_SHOP, and the
// merchant request fields) are appended directly via `useAppend()`; the reducer
// re-validates every raw payload, so a raw append is equivalent to a facade call
// with the extra fields present.
//
// See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
// §"Client layer".

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { JourneyContent } from "../data/journey-content";
import { NIGHTMARE_CARD_ID } from "../data/nightmare";
import { useActions, useAppend, useGameState } from "../coop/hooks";
import {
  JourneyContextProvider,
  type JourneyContextValue,
  type JourneyMutations,
} from "./journey-context";
import { mergeCardKeywordModification } from "../card-type-change";
import { buildQaScene, qaSceneLoadsBattle } from "../runtime/qa-scenes";
import {
  createBattleInitProvider,
  settleDeferredOpponentLog,
} from "../coop/providers/battle-init-provider";
import type { DreamAtlas, JourneyState } from "../types/journey";
import {
  updateCardSourcePublication,
  type CardSourcePublication,
} from "./card-source-publication";

export interface CoopJourneyProviderProps {
  children: ReactNode;
  journeyContent: JourneyContent;
}

/**
 * The "next" dreamscape reachable from `currentId`: the first forward target the
 * player has not already cleared. Mirrors the legacy provider's resolution so
 * `addSiteToDreamscape("next", …)` targets the same node.
 */
function findNextDreamscapeId(
  atlas: DreamAtlas,
  currentId: string | null,
): string | null {
  if (currentId === null) return null;
  const currentNode = atlas.nodes[currentId];
  if (currentNode === undefined) return null;
  for (const forwardId of currentNode.forwardIds) {
    const node = atlas.nodes[forwardId];
    if (node !== undefined && node.state !== "completed") {
      return forwardId;
    }
  }
  return null;
}

export function CoopJourneyProvider({
  children,
  journeyContent,
}: CoopJourneyProviderProps) {
  const fold = useGameState();
  const [cardSourcePublication, setCardSourcePublication] =
    useState<CardSourcePublication | null>(null);
  const publishCardSourceDebug = useCallback<JourneyMutations["setCardSourceDebug"]>(
    (cardSourceDebug, _source, publicationId) => {
      setCardSourcePublication((current) =>
        updateCardSourcePublication(current, cardSourceDebug, publicationId),
      );
    },
    [],
  );
  const state = useMemo<JourneyState>(
    () => ({
      ...fold.journey,
      cardSourceDebug: cardSourcePublication?.state ?? null,
    }),
    [fold.journey, cardSourcePublication],
  );
  const actions = useActions();
  const append = useAppend();
  const cardDatabase = journeyContent.cardDatabase;

  // The current fold state, reachable from the (stable) memoized mutations so
  // each adapter resolves display identifiers against live state at call time
  // without re-creating the mutations object on every render.
  const stateRef = useRef<JourneyState>(state);
  stateRef.current = state;

  const mutations = useMemo<JourneyMutations>(() => {
    // Fire-and-forget an action; surface (but do not throw on) an append error,
    // matching the legacy providers' non-blocking write semantics.
    const dispatch = (promise: Promise<number>): void => {
      void promise.catch((error: unknown) => {
        console.error("Coop journey action failed", error);
      });
    };
    const emit = (type: string, payload: Record<string, unknown>): void => {
      dispatch(append({ type, payload }));
    };
    const cardIdFor = (cardNumber: number): string | null =>
      cardDatabase.get(cardNumber)?.id ?? null;

    return {
      // ---- essence & limits ----
      changeEssence: (delta) => dispatch(actions.changeEssence(delta)),
      setEssence: (value) => dispatch(actions.setEssence(value)),
      setMaxDreamsigns: (value) => dispatch(actions.setMaxDreamsigns(value)),

      // ---- lifecycle ----
      startJourney: (dreamAvatar) =>
        dispatch(actions.startJourney({ dreamAvatarId: dreamAvatar.id })),
      rerollDreamAvatarOffer: () =>
        dispatch(actions.rerollDreamAvatarOffer()),
      setDreamAvatarSelection: (resolvedPackage) =>
        dispatch(actions.selectDreamAvatar(resolvedPackage.dreamAvatar.id)),
      resetJourney: () => dispatch(actions.resetJourney()),
      // The room seed is fixed at genesis, so a loaded snapshot must adopt it —
      // the reducer's LOAD_STATE validator bounces a foreign seed. These debug /
      // QA snapshots do not depend on their minted seed matching, so stamping the
      // live room seed keeps every derived generator convergent for both clients.
      loadJourneyState: (snapshot) =>
        dispatch(actions.loadState({ ...snapshot, seed: stateRef.current.seed })),
      bootstrapQaScene: (sceneId, explorationCardId) => {
        const snapshot = buildQaScene(sceneId, journeyContent, {
          explorationCardId,
        });
        if (snapshot === null) return;
        const seededSnapshot = { ...snapshot, seed: stateRef.current.seed };
        const activeSiteId = seededSnapshot.activeSiteId;
        const battle =
          activeSiteId === null || !qaSceneLoadsBattle(sceneId)
            ? null
            : createBattleInitProvider(journeyContent).beginBattle({
                journey: seededSnapshot,
                siteId: activeSiteId,
                seedOverride: null,
                seq: 0,
                rng: () => 0,
                timestamp: new Date(0).toISOString(),
              });
        settleDeferredOpponentLog(0, false);
        dispatch(
          append({
            type: "LOAD_STATE",
            payload: {
              snapshot: seededSnapshot,
              ...(battle === null ? {} : { battle }),
            },
            intentKey: `qa-bootstrap:${sceneId}`,
          }),
        );
      },
      dismissStartingDeckPopup: () =>
        dispatch(actions.dismissStartingDeckPopup()),

      // ---- navigation ----
      enterSite: (siteId) => dispatch(actions.enterSite(siteId)),
      travelToDreamscape: (nodeId) =>
        dispatch(actions.travelToDreamscape(nodeId)),
      regenerateAtlas: (completionLevel) =>
        dispatch(actions.regenerateAtlas(completionLevel)),

      // ---- deck & transfiguration ----
      addCard: (cardNumber, source) => {
        const cardId = cardIdFor(cardNumber);
        if (cardId === null) return;
        dispatch(actions.addCard({ cardId, source }));
      },
      addCardById: (cardId, source) => {
        dispatch(actions.addCard({ cardId, source }));
        return null;
      },
      addCardByIdWithTransfiguration: (cardId, type, source) => {
        dispatch(actions.addCard({ cardId, transfiguration: type, source }));
        return null;
      },
      removeCard: (entryId) => dispatch(actions.removeDeckEntry(entryId)),
      removeDeckEntry: (entryId) => dispatch(actions.removeDeckEntry(entryId)),
      duplicateDeckEntry: (entryId) =>
        dispatch(actions.duplicateDeckEntry(entryId)),
      transfigureCard: (entryId, type) =>
        dispatch(actions.transfigureCard(entryId, type)),
      setDeckEntryStatOverride: (entryId, statOverride) =>
        dispatch(actions.setDeckEntryStatOverride(entryId, statOverride)),
      setDeckEntryKeywords: (entryId, keywordModification) =>
        dispatch(actions.setDeckEntryKeywords(entryId, keywordModification)),
      changeDeckEntryKeywords: (entryId, keywordModification) => {
        // Legacy `changeDeckEntryKeywords` MERGED onto the entry's existing
        // modification; SET_DECK_ENTRY_KEYWORDS replaces, so merge here.
        const entry = stateRef.current.deck.find((e) => e.entryId === entryId);
        if (entry === undefined) return;
        const merged = mergeCardKeywordModification(
          entry.keywordModification,
          keywordModification,
        );
        dispatch(actions.setDeckEntryKeywords(entryId, merged));
      },
      setDeckEntryTypeChange: (entryId, typeChange) =>
        dispatch(actions.setDeckEntryType(entryId, typeChange)),
      changeDeckEntryType: (entryId, typeChange) =>
        dispatch(actions.setDeckEntryType(entryId, typeChange)),
      purgeDeckCards: (siteId, entryIds) =>
        dispatch(actions.purgeDeckCards(siteId, entryIds)),
      purgeRandomNightmareCards: (count) =>
        dispatch(actions.purgeRandomNightmareCards(count)),
      purgeAllNightmareCards: () => dispatch(actions.purgeAllNightmareCards()),

      // ---- dreamsigns ----
      addDreamsign: (dreamsign, _sourceSiteType, purgeIndex) => {
        if (dreamsign.id === undefined) return;
        if (purgeIndex === undefined) {
          dispatch(actions.addDreamsign(dreamsign.id));
          return;
        }
        emit("ADD_DREAMSIGN", { dreamsignId: dreamsign.id, purgeIndex });
      },
      removeDreamsign: (index) => {
        const dreamsignId = stateRef.current.dreamsigns[index]?.id;
        if (dreamsignId === undefined) return;
        dispatch(actions.removeDreamsign(dreamsignId));
      },
      setDreamsignIsNegative: (index, isNegative) => {
        const dreamsignId = stateRef.current.dreamsigns[index]?.id;
        if (dreamsignId === undefined) return;
        dispatch(actions.setDreamsignIsNegative(dreamsignId, isNegative));
      },
      setRemainingDreamsignPool: (remainingDreamsignPool) =>
        dispatch(actions.setDreamsignPool(remainingDreamsignPool)),

      // ---- draft ----
      setDraftState: (draftState) =>
        dispatch(actions.setDraftState(draftState)),
      pickDraftCard: (_siteId, cardNumber) => {
        const draftState = stateRef.current.draftState;
        if (draftState === null) return;
        const packIndex = draftState.currentOffer.indexOf(cardNumber);
        if (packIndex < 0) return;
        const cardId = cardIdFor(cardNumber);
        if (cardId === null) return;
        dispatch(actions.pickDraftCard(packIndex, cardId));
      },
      rerollDraftOffer: (siteId) => dispatch(actions.rerollDraftOffer(siteId)),
      enterDraftSite: (siteId) =>
        dispatch(actions.enterDraftSite(siteId, stateRef.current.runId ?? undefined)),

      // ---- sites: runtime reveal collapses to OPEN_SITE ----
      ensureRewardSiteRuntime: (siteId) =>
        dispatch(actions.openSite(siteId, stateRef.current.runId ?? undefined, "Reward")),
      ensureDreamsignOfferRuntime: (siteId) =>
        dispatch(actions.openSite(siteId, stateRef.current.runId ?? undefined, "DreamsignRevelation")),
      ensureEssenceSiteRuntime: (siteId) =>
        dispatch(actions.openSite(siteId, stateRef.current.runId ?? undefined, "Essence")),
      ensureShopRuntime: (site) =>
        dispatch(actions.openSite(site.id, stateRef.current.runId ?? undefined, site.type)),
      ensureCardChoiceRuntime: (siteId, kind) =>
        dispatch(actions.openSite(
          siteId,
          stateRef.current.runId ?? undefined,
          kind === "transfiguration" ? "Transfiguration" : "Duplication",
        )),
      ensureGambleSiteRuntime: (siteId, gambleGameId) =>
        dispatch(
          actions.openSite(
            siteId,
            stateRef.current.runId ?? undefined,
            "Gamble",
            gambleGameId,
          ),
        ),
      ensureExplorationSiteRuntime: (siteId) =>
        dispatch(actions.openSite(siteId, stateRef.current.runId ?? undefined, "Exploration")),
      ensureRandomSiteRuntime: (siteId) =>
        dispatch(actions.openSite(siteId, stateRef.current.runId ?? undefined, "RandomSite")),

      // ---- sites: player actions ----
      completeSite: (siteId) =>
        dispatch(actions.completeSite(siteId, stateRef.current.runId ?? undefined)),
      chooseRandomSite: (siteId, siteType) =>
        dispatch(actions.chooseRandomSite(siteId, siteType)),
      resolveExplorationChoice: (siteId, actionId, selection) =>
        dispatch(actions.resolveExplorationChoice(siteId, actionId, selection)),
      placeGravokWager: (siteId, gateId) =>
        dispatch(actions.placeGravokWager(siteId, gateId)),
      settleGravokWager: (siteId, shuffleCommitment) =>
        dispatch(
          actions.settleGravokWager(
            siteId,
            shuffleCommitment,
            stateRef.current.runId ?? undefined,
          ),
        ),
      playAgainGravokWager: (siteId, previousShuffleCommitment) =>
        dispatch(
          actions.playAgainGravokWager(
            siteId,
            previousShuffleCommitment,
            stateRef.current.runId ?? undefined,
          ),
        ),
      replaceGravokWagerDreamsign: (siteId, replacedDreamsignId) =>
        dispatch(
          actions.replaceGravokWagerDreamsign(siteId, replacedDreamsignId),
        ),
      drawTidemarkLadderClimb: (siteId) =>
        dispatch(actions.drawTidemarkLadderClimb(siteId)),
      settleTidemarkLadderClimb: (siteId, shuffleCommitment) =>
        dispatch(
          actions.settleTidemarkLadderClimb(
            siteId,
            shuffleCommitment,
            stateRef.current.runId ?? undefined,
          ),
        ),
      replaceTidemarkLadderClimbDreamsign: (siteId, replacedDreamsignId) =>
        dispatch(
          actions.replaceTidemarkLadderClimbDreamsign(
            siteId,
            replacedDreamsignId,
          ),
        ),
      drawStarwayStairs: (siteId) =>
        dispatch(actions.drawStarwayStairs(siteId)),
      settleStarwayStairs: (siteId, shuffleCommitment) =>
        dispatch(
          actions.settleStarwayStairs(
            siteId,
            shuffleCommitment,
            stateRef.current.runId ?? undefined,
          ),
        ),
      cashOutStarwayStairs: (siteId, shuffleCommitment) =>
        dispatch(actions.cashOutStarwayStairs(siteId, shuffleCommitment)),
      playAgainStarwayStairs: (siteId, previousShuffleCommitment) =>
        dispatch(
          actions.playAgainStarwayStairs(
            siteId,
            previousShuffleCommitment,
            stateRef.current.runId ?? undefined,
          ),
        ),
      acceptRewardSite: (siteId, purgeIndex) => {
        // ACCEPT_REWARD's reducer reads `purgeIndex` (the at-cap Dreamsign
        // replace slot), which the typed facade does not carry.
        emit(
          "ACCEPT_REWARD",
          purgeIndex === undefined ? { siteId } : { siteId, purgeIndex },
        );
      },
      acceptDreamsignOffer: (siteId, dreamsign, purgeIndex) => {
        if (dreamsign.id === undefined) return;
        emit("ACCEPT_DREAMSIGN_OFFER", {
          siteId,
          dreamsignId: dreamsign.id,
          ...(purgeIndex === undefined ? {} : { purgeIndex }),
        });
      },
      rejectDreamsignOffer: (siteId) =>
        dispatch(actions.rejectDreamsignOffer(siteId)),
      acceptEssenceSite: (siteId) =>
        dispatch(actions.acceptEssence(siteId, stateRef.current.runId ?? undefined)),
      acceptTransfigurationChoice: (siteId, entryId, type) =>
        emit("ACCEPT_TRANSFIGURATION_CHOICE", { siteId, entryId, type }),
      acceptDuplicationChoice: (siteId, entryId) =>
        dispatch(actions.acceptDuplicationChoice(siteId, entryId)),
      completeAugurySite: (siteId) =>
        dispatch(actions.completeAugury(siteId)),
      rerollAugury: (siteId) =>
        dispatch(actions.rerollAugury(siteId)),
      forceAuguryArchetype: (siteId, archetypeId) =>
        // archetypeId may be null (clear the force); the reducer accepts it.
        emit("FORCE_AUGURY_ARCHETYPE", { siteId, archetypeId }),
      acceptDreamMerchantOffer: (siteId, request) => {
        emit("ACCEPT_MERCHANT_OFFER", { siteId, ...request });
      },
      declineDreamMerchant: (siteId, request) => {
        emit("DECLINE_MERCHANT", { siteId, ...request });
      },

      // ---- shop ----
      buyShopSlot: (siteId, slotIndex, purgeIndex) =>
        emit("BUY_SHOP_SLOT", {
          siteId,
          slotIndex,
          ...(purgeIndex === undefined ? {} : { purgeIndex }),
        }),
      rerollShop: (site) => dispatch(actions.rerollShop(site.id)),
      grantFreeShopRerolls: (count) =>
        dispatch(actions.grantFreeRerolls(count)),
      applyShopEssenceDiscount: (percent) =>
        dispatch(actions.applyShopDiscount(percent)),

      // ---- modifiers & atlas ----
      pushBattleRewardModifier: (kind, amount, battles, source) => {
        const modifier =
          kind === "flat"
            ? {
                kind: "reward_reduction_flat",
                amount,
                battlesRemaining: battles,
                source,
              }
            : {
                kind: "reward_reduction_percent",
                percent: amount,
                battlesRemaining: battles,
                source,
              };
        dispatch(actions.pushBattleModifier(modifier));
      },
      pushTemporaryNightmareGrant: (count, battles, source) => {
        dispatch(
          actions.pushTemporaryNightmareGrant({
            cardId: NIGHTMARE_CARD_ID,
            count,
            battlesRemaining: battles,
            source,
          }),
        );
      },
      addSiteToDreamscape: (placement, siteType) => {
        const current = stateRef.current;
        const nodeId =
          placement === "current"
            ? current.currentDreamscape
            : findNextDreamscapeId(current.atlas, current.currentDreamscape);
        if (nodeId === null) return;
        dispatch(actions.addSiteToDreamscape(nodeId, siteType));
      },
      replaceSiteType: (from, to) => {
        const nodeId = stateRef.current.currentDreamscape;
        if (nodeId === null) return;
        dispatch(actions.replaceSiteType(nodeId, from, to));
      },
      removeSiteTypeFromNextDreamscapes: (siteType, dreamscapes) =>
        dispatch(actions.banSiteType(siteType, dreamscapes)),
      boostSiteAppearance: (siteType, percent, dreamscapes) =>
        dispatch(actions.boostSiteAppearance(siteType, percent, dreamscapes)),
      setCardSourceDebug: publishCardSourceDebug,

    };
  }, [actions, append, journeyContent, cardDatabase, publishCardSourceDebug]);

  const value = useMemo<JourneyContextValue>(
    () => ({ state, mutations, cardDatabase, journeyContent }),
    [state, mutations, cardDatabase, journeyContent],
  );

  return <JourneyContextProvider value={value}>{children}</JourneyContextProvider>;
}
