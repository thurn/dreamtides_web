// Dreamtides 97 opponent construction and battle setup (Appendix B §B9,
// §B10), over the journey's shared builders: an opponent's deck comes from
// the unified tide-affinity builder at its tier knob, seeded from
// `hash(runSeed : characterId)`; a battle's engine init stacks the player's
// active deck against the stored opponent deck at the act's score target.
// Pure and deterministic in its inputs; nothing here logs.

import type { D97TierKnob } from "../../content/d97/encounters";
import { makeRng } from "../../draft/pool/rng";
import type { Tides4DecksJson } from "../../draft/pool/tides4-io";
import type { BattleInit as EngineBattleInit } from "../../engine";
import { battleSeed } from "../../engine/state/ids";
import type { D97BattleInit } from "../../rules/battle/fold";
import type { D97BattleStartInput, D97OpponentBuild } from "../../rules/d97/d97-content";
import type { CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { AvatarContent, DreamsignTemplate } from "../../types/content";
import type { Tides4Tuning } from "../../types/draft-data";
import type { AvatarId, DreamwellCardId } from "../../types/identifiers";
import type { OpponentsData } from "../../types/opponents-data";
import { createBaseBattleDeckCardDefinition } from "../card-definition";
import { buildEnemyDescriptor } from "./create-battle-init";
import { selectSignatureCards } from "./signature-cards";
import { buildTideOpponentDeck } from "./tide-opponent-deck";

/** The loaded content D97 battles read. */
export interface D97BattleContent {
  readonly cardDatabase: ReadonlyMap<number, CardData>;
  readonly cardsById: ReadonlyMap<CardId, CardData>;
  readonly avatars: readonly AvatarContent[];
  readonly dreamsignTemplates: readonly DreamsignTemplate[];
  readonly dreamwellCardIds: readonly DreamwellCardId[];
  readonly opponentsData: OpponentsData;
  readonly tides4Decks: Tides4DecksJson | undefined;
  readonly tides4Tuning: Tides4Tuning | undefined;
  /** An Avatar's pinned dealt pool (decision P29), the player's battle draft pool. */
  readonly pinnedDealtPool: (avatarId: AvatarId) => readonly { readonly cardId: CardId; readonly copies: number }[];
}

function avatarOf(content: D97BattleContent, avatarId: AvatarId): AvatarContent | null {
  return content.avatars.find((avatar) => avatar.id === avatarId) ?? null;
}

/** An opponent's deck at a tier knob (Appendix B §B9). */
export function buildD97OpponentDeck(
  content: D97BattleContent,
  input: {
    readonly avatarId: AvatarId;
    readonly seed: number;
    readonly knob: D97TierKnob;
    readonly deckSize: number;
    readonly signatureCount: number;
  },
): D97OpponentBuild | null {
  const avatar = avatarOf(content, input.avatarId);
  if (avatar === null || content.tides4Decks === undefined || content.tides4Tuning === undefined) return null;
  // The tier knob stands in for the journey's per-layer progression: the
  // builder reads layer 0 of a progression the knob writes.
  const build = buildTideOpponentDeck({
    opponentAvatar: avatar,
    affiliation: null,
    cardDatabase: content.cardDatabase,
    dreamsignTemplates: content.dreamsignTemplates,
    completionLevel: 0,
    poolSeed: input.seed,
    opponentsContentHash: content.opponentsData.contentHash,
    progression: {
      abilityActiveFromLayer: input.knob.abilityActive ? 0 : 1,
      dreamsignsFromLayer: input.knob.dreamsigns > 0 ? 0 : 1,
      legendariesFromLayer: input.knob.legendaries ? 0 : 1,
      starterDilution: [input.knob.starterDilution],
    },
    deckSize: input.deckSize,
    tides4Decks: content.tides4Decks,
    tides4Tuning: content.tides4Tuning,
    deferLog: () => undefined,
  });
  if (build === null) return null;
  const signatures = selectSignatureCards({
    abilityText: avatar.renderedText,
    candidates: build.finalCards,
    count: input.signatureCount,
  });
  return {
    deck: build.finalCards.map((card) => card.id),
    draftPool: build.draftPool,
    dreamsignIds: build.dreamsign === null ? [] : [build.dreamsign.id],
    signatureCardIds: signatures.map((selection) => selection.cardId),
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The display init and engine init of an encounter's battle (Appendix B §B10). */
export function startD97Battle(
  content: D97BattleContent,
  input: D97BattleStartInput,
): { readonly init: D97BattleInit; readonly engineInit: EngineBattleInit } | null {
  const { run, encounter } = input;
  const player = avatarOf(content, run.avatarId);
  const opponent = avatarOf(content, encounter.avatarId);
  if (player === null || opponent === null) return null;
  const card = (cardId: CardId) => content.cardsById.get(cardId);
  const playerDeck = run.collection.copies.filter((copy) => copy.zone === "deck").map((copy) => copy.cardId);
  const playerCards = playerDeck.map(card);
  const opponentCards = encounter.deck.map(card);
  if (playerCards.some((entry) => entry === undefined) || opponentCards.some((entry) => entry === undefined)) return null;
  const random = makeRng(input.seed);
  const dreamsigns = encounter.dreamsignIds.flatMap((id) => content.dreamsignTemplates.filter((sign) => sign.id === id));
  const descriptor = buildEnemyDescriptor(opponent, dreamsigns, random);
  const init: D97BattleInit = {
    battleId: input.battleId,
    essenceReward: encounter.extra?.amount ?? 0,
    opponentAbilityActive: encounter.abilityActive,
    enemyDescriptor: {
      ...descriptor,
      signatureCards: encounter.signatureCardIds.flatMap((cardId) => {
        const signature = card(cardId);
        return signature === undefined ? [] : [{ cardId, cardNumber: signature.cardNumber, name: signature.name }];
      }),
    },
    avatarSummary: {
      id: player.id,
      name: player.name,
      title: player.title,
      renderedText: player.renderedText,
      imageNumber: player.imageNumber,
      ...(player.portraitFocus === undefined ? {} : { portraitFocus: player.portraitFocus }),
    },
    cardDefinitions: [
      ...shuffled(playerCards as CardData[], random).map(createBaseBattleDeckCardDefinition),
      ...(opponentCards as CardData[]).map(createBaseBattleDeckCardDefinition),
    ],
    anchorId: encounter.anchorId,
    characterId: encounter.characterId,
    role: encounter.role,
    tier: encounter.tier,
    playerAnteCopyId: input.playerAnteCopyId,
    opponentAnteCardId: encounter.opponentAnteCardId,
  };
  const engineInit: EngineBattleInit = {
    seed: battleSeed(String(input.seed)),
    scoreToWin: encounter.scoreToWin,
    startingSide: content.opponentsData.battle.startingSide,
    decks: {
      player: playerDeck.map((cardId) => ({ cardId })),
      enemy: encounter.deck.map((cardId) => ({ cardId })),
    },
    draftPools: {
      player: content.pinnedDealtPool(run.avatarId).flatMap((entry) => Array.from({ length: entry.copies }, () => entry.cardId)),
      enemy: [...encounter.draftPool],
    },
    dreamwell: [...content.dreamwellCardIds],
    avatars: {
      player: player.id,
      ...(encounter.abilityActive ? { enemy: opponent.id } : {}),
    },
    dreamsigns: { player: [], enemy: [...encounter.dreamsignIds] },
  };
  return { init, engineInit };
}
