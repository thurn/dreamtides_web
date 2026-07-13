// Real SiteContentProvider: generates the content-coupled site runtimes
// (`OPEN_SITE`) and the shop restock (`REROLL_SHOP`) from the loaded quest
// content, drawing ALL randomness from the reducer-supplied `ctx.rng` (adapted
// to a `() => number` stream) so two clients folding the same event roll
// byte-identical offers. Every generator's `Math.random` was threaded off this
// stream (see the reward / dreamsign / shop generators).

import type { QuestContent } from "../../data/quest-content";
import type { DraftState } from "../../types/draft";
import type {
  CardChoiceSiteRuntime,
  CardChoiceTransfigurationOffer,
  DeckEntry,
  RewardSiteRuntime,
  SiteRuntimeState,
  SiteState,
  QuestState,
} from "../../types/quest";
import type { CardData } from "../../types/cards";
import { generateRewardSiteData } from "../../rewards/reward-generator";
import { drawDreamsignOptions } from "../../dreamsign/dreamsign-pool";
import {
  generateShopInventory,
  replayShopDraftState,
  shopSlotsToRuntime,
} from "../../shop/shop-generator";
import {
  offeredTransfigurationForms,
  transfigurationEffectDetails,
} from "../../transfiguration/transfiguration-logic";
import { transfigurationEssenceCost } from "../../transfiguration/transfiguration-pricing";
import {
  resolveMerchantDecline,
  resolveMerchantOffer,
} from "../../journey_v2/encounter/resolveMerchantOffer";
import type { MerchantChoice } from "../../journey_v2/types";
import type { MerchantArchetypeId } from "../../journey_v2/archetypes/types";
import { mintEntryId } from "../../rules/quest/deck";
import type {
  ShopRerollResult,
  SiteContentProvider,
  SiteOpenResult,
} from "../../rules/quest/sites";
import { streamFromKeyed } from "./rng-stream";

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Coerce an optional `{ choiceId }` merchant choice from a raw payload field. */
function coerceMerchantChoice(value: unknown): MerchantChoice | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const choiceId = (value as { choiceId?: unknown }).choiceId;
  return typeof choiceId === "string" ? { choiceId } : undefined;
}

/** Whether the run's draft is a deck-fit mode (replay / fresh20). */
function isDeckFitDraft(quest: QuestState): boolean {
  return (
    quest.draftState?.mode === "replay" || quest.draftState?.mode === "fresh20"
  );
}

/**
 * The draft state a shop draws its card slots from. Deck-fit runs use a
 * transient pool rebuilt from the resolved package (their live draft state is a
 * frozen pack sequence, not a multiset); pool runs draw from the run draft
 * state directly.
 */
function shopSourceDraftState(quest: QuestState): DraftState | null {
  return isDeckFitDraft(quest)
    ? replayShopDraftState(quest.resolvedPackage)
    : quest.draftState;
}

/** A uniform rng shuffle (no ambient `Math.random`). */
function rngShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool;
}

/**
 * Select up to three deck entries to surface at a card-choice site (the whole
 * deck at an enhanced site). Candidate order is a deterministic rng shuffle; a
 * transfiguration site skips entries with no eligible form.
 */
function selectCardChoiceEntryIds(
  deck: readonly DeckEntry[],
  cardDatabase: Map<number, CardData>,
  kind: "transfiguration" | "duplication",
  isEnhanced: boolean,
  rng: () => number,
): string[] {
  const ordered = isEnhanced ? [...deck] : rngShuffle(deck, rng);
  const limit = isEnhanced ? Number.POSITIVE_INFINITY : 3;
  const entryIds: string[] = [];
  for (const entry of ordered) {
    if (entryIds.length >= limit) break;
    const card = cardDatabase.get(entry.cardNumber);
    if (card === undefined) continue;
    if (
      kind === "transfiguration" &&
      (entry.transfiguration !== null ||
        offeredTransfigurationForms(card, entry.transfiguration).length === 0)
    ) {
      continue;
    }
    entryIds.push(entry.entryId);
  }
  return entryIds;
}

/** Build a Transfiguration / Duplication card-choice runtime. */
function buildCardChoiceRuntime(
  quest: QuestState,
  site: SiteState,
  cardDatabase: Map<number, CardData>,
  kind: "transfiguration" | "duplication",
  rng: () => number,
): CardChoiceSiteRuntime {
  const entryIds = selectCardChoiceEntryIds(
    quest.deck,
    cardDatabase,
    kind,
    site.isEnhanced,
    rng,
  );

  if (kind === "duplication") {
    return { kind: "cardChoice", choiceKind: "duplication", entryIds, acceptedEntryIds: [] };
  }

  const deckByEntryId = new Map(quest.deck.map((entry) => [entry.entryId, entry]));
  const transfigurationOffers: CardChoiceTransfigurationOffer[] = [];
  for (const entryId of entryIds) {
    const entry = deckByEntryId.get(entryId);
    if (entry === undefined) continue;
    const card = cardDatabase.get(entry.cardNumber);
    if (card === undefined) continue;
    for (const offer of offeredTransfigurationForms(card, entry.transfiguration)) {
      transfigurationOffers.push({
        entryId,
        type: offer.type,
        effectDescription: offer.description,
        effectDetails: transfigurationEffectDetails(offer, card),
        previewCard: offer.previewCard,
        essenceCost: transfigurationEssenceCost(
          quest.seed,
          site.id,
          entryId,
          card,
          offer.type,
        ),
      });
    }
  }
  return {
    kind: "cardChoice",
    choiceKind: "transfiguration",
    entryIds,
    acceptedEntryIds: [],
    transfigurationOffers,
  };
}

export function createSiteContentProvider(
  content: QuestContent,
): SiteContentProvider {
  const dreamsignRegenerationPoolIds = (quest: QuestState): readonly string[] =>
    quest.resolvedPackage?.dreamsignPoolIds ?? [];

  return {
    openSite: ({ quest, site, rng }): SiteOpenResult | null => {
      const stream = streamFromKeyed(rng);
      switch (site.type) {
        case "Reward": {
          const generated = generateRewardSiteData({
            dreamsignTemplates: content.dreamsignTemplates,
            remainingDreamsignPoolIds: quest.remainingDreamsignPool,
            regenerationPoolIds: dreamsignRegenerationPoolIds(quest),
            rng: stream,
          });
          const runtime: RewardSiteRuntime = {
            kind: "reward",
            reward: generated.reward,
            remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
            accepted: false,
          };
          // Keep the run pool unchanged when the essence fallback spent nothing;
          // otherwise persist the pool the reward draw consumed.
          if (generated.spentDreamsignPoolIds.length === 0) {
            return { runtime };
          }
          return {
            runtime,
            remainingDreamsignPool: generated.remainingDreamsignPoolIds,
          };
        }
        case "DreamsignRevelation": {
          const optionCount = site.isEnhanced ? 4 : 3;
          const draw = drawDreamsignOptions(
            quest.remainingDreamsignPool,
            content.dreamsignTemplates,
            optionCount,
            dreamsignRegenerationPoolIds(quest),
            stream,
          );
          const runtime: SiteRuntimeState = {
            kind: "dreamsignOffer",
            offeredDreamsigns: draw.offeredDreamsigns,
            remainingDreamsignPool: draw.remainingDreamsignPool,
            accepted: false,
          };
          return { runtime, remainingDreamsignPool: draw.remainingDreamsignPool };
        }
        case "Shop":
        case "DreamsignMarket": {
          const isMarket = site.type === "DreamsignMarket";
          const generated = generateShopInventory({
            cardDatabase: content.cardDatabase,
            draftState: isMarket ? null : shopSourceDraftState(quest),
            remainingDreamsignPoolIds: quest.remainingDreamsignPool,
            dreamsignTemplates: content.dreamsignTemplates,
            dreamsignRegenerationPoolIds: dreamsignRegenerationPoolIds(quest),
            ...(isMarket ? { cardCount: 0, dreamsignCount: 3 } : {}),
            rng: stream,
          });
          const runtime: SiteRuntimeState = {
            kind: "shop",
            slots: shopSlotsToRuntime(generated.slots),
            rerollCount: 0,
            remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
          };
          // SEAM (Task 27): the `SiteOpenResult` seam cannot carry the spent
          // draft state (only `remainingDreamsignPool`), so a pool-mode shop's
          // draft-multiset consumption is not persisted on OPEN. Slots are still
          // drawn deterministically from the run pool. The Dreamsign pool the
          // shop drew is persisted below.
          return {
            runtime,
            remainingDreamsignPool: generated.remainingDreamsignPoolIds,
          };
        }
        case "Transfiguration":
        case "Duplication": {
          const kind = site.type === "Transfiguration" ? "transfiguration" : "duplication";
          const runtime = buildCardChoiceRuntime(
            quest,
            site,
            content.cardDatabase,
            kind,
            stream,
          );
          return { runtime };
        }
        default:
          return null;
      }
    },

    rerollShop: ({ quest, site, rng }): ShopRerollResult | null => {
      const stream = streamFromKeyed(rng);
      const isMarket = site.type === "DreamsignMarket";
      const generated = generateShopInventory({
        cardDatabase: content.cardDatabase,
        draftState: isMarket ? null : shopSourceDraftState(quest),
        remainingDreamsignPoolIds: quest.remainingDreamsignPool,
        dreamsignTemplates: content.dreamsignTemplates,
        dreamsignRegenerationPoolIds: dreamsignRegenerationPoolIds(quest),
        ...(isMarket ? { cardCount: 0, dreamsignCount: 3 } : {}),
        rng: stream,
      });
      // Task-15 trap: deck-fit runs keep the live draft state, and a card-less
      // shop hands back no draft state (`generated.draftState` is `undefined`),
      // so `?? quest.draftState` keeps the run's draft pool intact rather than
      // null-wiping it on a reroll. ALWAYS returns the resolved draft state.
      const draftState = isDeckFitDraft(quest)
        ? quest.draftState
        : generated.draftState ?? quest.draftState;
      return {
        slots: shopSlotsToRuntime(generated.slots),
        remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
        remainingDreamsignPool: generated.remainingDreamsignPoolIds,
        draftState,
      };
    },

    // Resolve a Dream Merchant / DreamAugury ACCEPT / DECLINE. The whole
    // resolution (encounter regeneration, offer lookup, payload application,
    // site completion) is a PURE function of `(quest, questContent, site,
    // request)` — no rng, no clock — so the provider `rng` is unused. Both
    // resolvers regenerate the encounter deterministically from the same quest
    // state the reducer folds against, so two clients resolve identically.
    resolveMerchant: ({ quest, site, action, payload, seq }): QuestState | null => {
      const encounterSignature = asString(payload.encounterSignature);
      const offerId = asString(payload.offerId);
      if (encounterSignature === null || offerId === null) return null;
      const choice = coerceMerchantChoice(payload.choice);

      if (action === "decline") {
        const result = resolveMerchantDecline({
          state: quest,
          questContent: content,
          site,
          request: { encounterSignature, offerId, ...(choice ? { choice } : {}) },
        });
        return result.ok ? result.state : null;
      }

      const archetypeId = asString(payload.archetypeId);
      if (archetypeId === null) return null;
      const result = resolveMerchantOffer({
        state: quest,
        questContent: content,
        site,
        request: {
          encounterSignature,
          offerId,
          archetypeId: archetypeId as MerchantArchetypeId,
          ...(choice ? { choice } : {}),
        },
        // Mint any new deck entry through the SAME seq-keyed scheme every
        // other minting reducer case uses (audit finding P3-8), instead of
        // this module's legacy standalone counter.
        mintEntryId: (deck, index) => mintEntryId(deck, seq, index),
      });
      return result.ok ? result.state : null;
    },
  };
}
