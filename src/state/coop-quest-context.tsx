// The coop-backed quest context provider.
//
// This mounts inside `CoopProvider` (src/coop/hooks.ts) and re-backs the
// legacy `QuestContextValue` interface that every quest screen consumes:
//   - `state` comes from `useGameState().quest` (the displayed fold, confirmed +
//     optimistic), instead of the RTDB-mirrored multiplayer room.
//   - `mutations` are thin adapters over the Task-25 action facade
//     (`useActions()`): each legacy `QuestMutations` method resolves its display
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

import { useMemo, useRef, type ReactNode } from "react";
import type { QuestContent } from "../data/quest-content";
import { useActions, useAppend, useGameState } from "../coop/hooks";
import {
  QuestContextProvider,
  type QuestContextValue,
  type QuestMutations,
} from "./quest-context";
import { mergeCardKeywordModification } from "../card-type-change";
import { rerollCost } from "../shop/shop-generator";
import { buildQaScene } from "../runtime/qa-scenes";
import type { CardData } from "../types/cards";
import type { DreamAtlas, QuestState } from "../types/quest";

export interface CoopQuestProviderProps {
  children: ReactNode;
  questContent: QuestContent;
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

/** Resolve a card catalog UUID back to its `cardNumber` key in the database. */
function cardNumberForUuid(
  cardDatabase: Map<number, CardData>,
  cardId: string,
): number | null {
  for (const [cardNumber, card] of cardDatabase) {
    if (card.id === cardId) return cardNumber;
  }
  return null;
}

export function CoopQuestProvider({
  children,
  questContent,
}: CoopQuestProviderProps) {
  const fold = useGameState();
  const state = fold.quest;
  const actions = useActions();
  const append = useAppend();
  const cardDatabase = questContent.cardDatabase;

  // The current fold state, reachable from the (stable) memoized mutations so
  // each adapter resolves display identifiers against live state at call time
  // without re-creating the mutations object on every render.
  const stateRef = useRef<QuestState>(state);
  stateRef.current = state;

  const mutations = useMemo<QuestMutations>(() => {
    // Fire-and-forget an action; surface (but do not throw on) an append error,
    // matching the legacy providers' non-blocking write semantics.
    const dispatch = (promise: Promise<number>): void => {
      void promise.catch((error: unknown) => {
        console.error("Coop quest action failed", error);
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
      changeMaxEssence: (delta) => dispatch(actions.changeMaxEssence(delta)),
      setEssenceCap: (value) => dispatch(actions.setEssenceCap(value)),
      setMaxDreamsigns: (value) => dispatch(actions.setMaxDreamsigns(value)),
      setCompletionLevel: (value) => dispatch(actions.setCompletionLevel(value)),

      // ---- lifecycle ----
      startQuest: (dreamcaller) =>
        dispatch(actions.startQuest({ dreamcallerId: dreamcaller.id })),
      setDreamcallerSelection: (resolvedPackage) =>
        dispatch(actions.selectDreamcaller(resolvedPackage.dreamcaller.id)),
      resetQuest: () => dispatch(actions.resetQuest()),
      // The room seed is fixed at genesis, so a loaded snapshot must adopt it —
      // the reducer's LOAD_STATE validator bounces a foreign seed. These debug /
      // QA snapshots do not depend on their minted seed matching, so stamping the
      // live room seed keeps every derived generator convergent for both clients.
      loadQuestState: (snapshot) =>
        dispatch(actions.loadState({ ...snapshot, seed: stateRef.current.seed })),
      bootstrapQaScene: (sceneId) => {
        const snapshot = buildQaScene(sceneId, questContent);
        if (snapshot === null) return;
        dispatch(actions.loadState({ ...snapshot, seed: stateRef.current.seed }));
      },
      dismissStartingDeckPopup: () =>
        dispatch(actions.dismissStartingDeckPopup()),

      // ---- navigation ----
      setScreen: (screen) => dispatch(actions.setScreen(screen)),
      markSiteVisited: (siteId) => dispatch(actions.markSiteVisited(siteId)),
      setCurrentDreamscape: (nodeId) => {
        // travelToDreamscape(null) is not a coop intent: the battle-completion
        // return-to-map path is handled by END_BATTLE(victory), so a null here
        // is a dead path for quest and is intentionally a no-op.
        if (nodeId === null) return;
        dispatch(actions.travelToDreamscape(nodeId));
      },
      updateAtlas: (atlas) => dispatch(actions.updateAtlas(atlas)),

      // ---- deck & transfiguration ----
      addCard: (cardNumber, source) => {
        const cardId = cardIdFor(cardNumber);
        if (cardId === null) return;
        dispatch(actions.addCard({ cardId, source }));
      },
      addBaneCard: (cardNumber, source) => {
        const cardId = cardIdFor(cardNumber);
        if (cardId === null) return;
        dispatch(actions.addCard({ cardId, isBane: true, source }));
      },
      addCardById: (cardId, source) => {
        dispatch(actions.addCard({ cardId, source }));
        return null;
      },
      addCardByIdWithTransfiguration: (cardId, type, source) => {
        dispatch(actions.addCard({ cardId, transfiguration: type, source }));
        return null;
      },
      addBaneCardById: (cardId, source) => {
        dispatch(actions.addCard({ cardId, isBane: true, source }));
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
      purgeDeckCards: (siteId, entryIds, cost, _source, baneDreamsignIndices) =>
        dispatch(
          actions.purgeDeckCards(entryIds, {
            siteId,
            cost,
            ...(baneDreamsignIndices === undefined
              ? {}
              : { baneDreamsignIndices }),
          }),
        ),
      purgeRandomBaneCards: (count) =>
        dispatch(actions.purgeRandomBaneCards(count)),
      purgeAllBaneCards: () => dispatch(actions.purgeAllBaneCards()),

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
      setDreamsignIsBane: (index, isBane) => {
        const dreamsignId = stateRef.current.dreamsigns[index]?.id;
        if (dreamsignId === undefined) return;
        dispatch(actions.setDreamsignIsBane(dreamsignId, isBane));
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
      enterDraftSite: (siteId) => dispatch(actions.enterDraftSite(siteId)),

      // ---- sites: runtime reveal collapses to OPEN_SITE ----
      ensureRewardSiteRuntime: (siteId) => dispatch(actions.openSite(siteId)),
      ensureDreamsignOfferRuntime: (siteId) =>
        dispatch(actions.openSite(siteId)),
      ensureEssenceSiteRuntime: (siteId) => dispatch(actions.openSite(siteId)),
      ensureShopRuntime: (site) => dispatch(actions.openSite(site.id)),
      ensureCardChoiceRuntime: (siteId) => dispatch(actions.openSite(siteId)),

      // ---- sites: player actions ----
      completeSite: (siteId) => dispatch(actions.completeSite(siteId)),
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
      acceptEssenceSite: (siteId) => dispatch(actions.acceptEssence(siteId)),
      acceptTransfigurationChoice: (siteId, entryId, type) =>
        emit("ACCEPT_TRANSFIGURATION_CHOICE", { siteId, entryId, type }),
      acceptDuplicationChoice: (siteId, entryId) =>
        dispatch(actions.acceptDuplicationChoice(siteId, entryId)),
      completeDreamAugurySite: (siteId) =>
        dispatch(actions.completeDreamAugury(siteId)),
      rerollDreamAugury: (siteId) =>
        dispatch(actions.rerollDreamAugury(siteId)),
      forceDreamAuguryArchetype: (siteId, archetypeId) =>
        // archetypeId may be null (clear the force); the reducer accepts it.
        emit("FORCE_DREAM_AUGURY_ARCHETYPE", { siteId, archetypeId }),
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
      rerollShop: (site) => {
        // The reducer reads `essenceCost` for a paid reroll; free rerolls (from
        // shopModifiers) are charged 0 there. Compute the cost the way the
        // legacy provider did so a paid reroll spends the right essence.
        const essenceCost = rerollCost(0, site.isEnhanced);
        emit("REROLL_SHOP", { siteId: site.id, essenceCost });
      },
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
      pushTemporaryBaneGrant: (baneCardId, baneName, count, battles, source) => {
        const cardNumber = cardNumberForUuid(cardDatabase, baneCardId);
        if (cardNumber === null) {
          console.warn(
            `pushTemporaryBaneGrant: unknown bane card id ${baneCardId}`,
          );
          return;
        }
        dispatch(
          actions.pushTemporaryBaneGrant({
            cardNumber,
            baneName,
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
      setCardSourceDebug: (cardSourceDebug) =>
        dispatch(actions.setCardSourceDebug(cardSourceDebug)),

      // ---- completion & failure (battle-completion bridges; Task 27) ----
      // Battle victory/defeat fold through `END_BATTLE`: the reducer's
      // `applyVictory` bumps the completion level and `applyDefeat` freezes the
      // failure summary from the terminal board and routes to the `questFailed`
      // screen. The battle screen appends `END_BATTLE` directly; these facade
      // methods keep the legacy `QuestMutations` shape mapping onto the same
      // events. `setFailureSummary` bounces when no battle is in progress.
      incrementCompletionLevel: () => dispatch(actions.endBattle("victory")),
      setFailureSummary: (failureSummary) => {
        if (failureSummary === null) return;
        dispatch(actions.endBattle("defeat"));
      },
    };
  }, [actions, append, questContent, cardDatabase]);

  const value = useMemo<QuestContextValue>(
    () => ({ state, mutations, cardDatabase, questContent }),
    [state, mutations, cardDatabase, questContent],
  );

  return <QuestContextProvider value={value}>{children}</QuestContextProvider>;
}
