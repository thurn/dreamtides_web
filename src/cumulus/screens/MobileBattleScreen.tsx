import { useRef, useState, type CSSProperties } from "react";
import { LayoutGroup, motion } from "framer-motion";
import {
  GameCard,
  type GameCardModel,
} from "../components/card/CardView";
import {
  BATTLEFIELD_CARD_ASPECT_RATIO,
  CARD_ASPECT_RATIO,
} from "../components/card/card-aspect";
import { BattleStatusDisplay } from "../components/battle/BattleStatusDisplay";
import { CardBack } from "../components/battle/CardBack";
import {
  CardPile,
  type BattlePileCard,
} from "../components/battle/CardPile";
import { GlassButton } from "../components/controls/GlassButton";
import { IconButton } from "../components/controls/IconButton";
import { GlassPanel } from "../components/overlay/GlassPanel";
import type { DreamcallerVisual } from "../components/hud/DreamcallerPortrait";
import { GLYPHS } from "../primitives/glyph";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import battleBackgroundUrl from "../assets/battle-background.png";

/** One physical face-up card instance rendered by the battle board. */
export interface MobileBattleCardView {
  readonly id: string;
  readonly model: GameCardModel;
  readonly exhausted: boolean;
  readonly figment: boolean;
  readonly figmentTitleBar: boolean;
}

/** A stable battlefield position which may currently be empty. */
export interface MobileBattleSlotView {
  readonly id: string;
  readonly card: MobileBattleCardView | null;
}

/** The compact resources and Dreamcaller identity shown for one side. */
export interface MobileBattleStatusView {
  readonly dreamcaller: DreamcallerVisual;
  readonly currentEnergy: number;
  readonly maxEnergy: number;
  readonly points: number;
}

/** Every zone owned by one side of the battle. */
export interface MobileBattleSideView {
  readonly deckCardIds: readonly string[];
  readonly voidCards: readonly MobileBattleCardView[];
  readonly backRank: readonly MobileBattleSlotView[];
  readonly frontRank: readonly MobileBattleSlotView[];
  readonly status: MobileBattleStatusView;
}

/** The complete, presentation-ready mobile battle board. */
export interface MobileBattleView {
  readonly battleId: string;
  readonly enemyHandCardIds: readonly string[];
  readonly enemy: MobileBattleSideView;
  readonly player: MobileBattleSideView;
  readonly playerHand: readonly MobileBattleCardView[];
}

export interface MobileBattleScreenProps {
  readonly view: MobileBattleView;
  readonly interactions?: MobileBattleInteractions;
}

export type MobileBattleOwner = "enemy" | "player";
export type MobileBattleRank = "back" | "front";
export type MobileBattleCardSource = "player-hand" | "battlefield";
export type MobileBattleDropZone = "deck" | "hand" | "void";

export interface MobileBattleSlotTarget {
  readonly owner: MobileBattleOwner;
  readonly rank: MobileBattleRank;
  readonly slotId: string;
}

export interface MobileBattleZoneTarget {
  readonly owner: MobileBattleOwner;
  readonly zone: MobileBattleDropZone;
}

/** Intent-only gesture bridge owned by the live battle controller. */
export interface MobileBattleInteractions {
  readonly canInteract: boolean;
  readonly pendingCardId: string | null;
  readonly onHandCardActivate: (battleCardId: string) => void;
  readonly onCardDragStart: (
    battleCardId: string,
    source: MobileBattleCardSource,
  ) => void;
  readonly onCardDragEnd: () => void;
  readonly onSlotDrop: (target: MobileBattleSlotTarget) => void;
  readonly onZoneDrop: (target: MobileBattleZoneTarget) => void;
  readonly onPreviousPhase: () => void;
  readonly onNextPhase: () => void;
  readonly onFillBattlefieldPreview?: () => void;
}

const ENEMY_HAND_VISIBLE_CARD_CAP = 6;
const BATTLEFIELD_SIDE_INSET_PERCENT = 6;
const BATTLEFIELD_WIDTH_PERCENT = 100 - BATTLEFIELD_SIDE_INSET_PERCENT * 2;

const ROOT_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100%",
  height: "100dvh",
  boxSizing: "border-box",
  overflow: "hidden",
  display: "grid",
  gridTemplateRows:
    "minmax(0, 9fr) minmax(0, 12fr) minmax(0, 20fr) minmax(0, 20fr) 40px minmax(0, 12fr) minmax(0, 27fr)",
  paddingTop: `var(${SAFE_AREA_INSET_PROPERTIES.top})`,
  paddingRight: `var(${SAFE_AREA_INSET_PROPERTIES.right})`,
  paddingBottom: `var(${SAFE_AREA_INSET_PROPERTIES.bottom})`,
  paddingLeft: `var(${SAFE_AREA_INSET_PROPERTIES.left})`,
  backgroundColor: token("--battle-table"),
  backgroundImage: `url("${battleBackgroundUrl}")`,
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "100% 100%",
};

const ROW_STYLE: CSSProperties = {
  position: "relative",
  minWidth: 0,
  minHeight: 0,
};

function centeredFanPosition(params: {
  index: number;
  count: number;
  maximumSpread: number;
  spacing: number;
}): { left: string; normalized: number } {
  const { index, count, maximumSpread, spacing } = params;
  if (count <= 1) return { left: "50%", normalized: 0 };
  const spread = Math.min(maximumSpread, (count - 1) * spacing);
  const normalized = index / (count - 1) - 0.5;
  return {
    left: `${String(50 + normalized * spread)}%`,
    normalized,
  };
}

function EnemyHand({ cardIds }: { readonly cardIds: readonly string[] }) {
  const visibleCardIds = cardIds.slice(0, ENEMY_HAND_VISIBLE_CARD_CAP);
  return (
    <div
      data-battle-mobile-row="enemy-hand"
      data-battle-hand-count={cardIds.length}
      data-battle-hand-visible-count={visibleCardIds.length}
      style={{
        ...ROW_STYLE,
        overflow: "hidden",
      }}
    >
      {visibleCardIds.map((cardId, index) => {
        const { left, normalized } = centeredFanPosition({
          index,
          count: visibleCardIds.length,
          maximumSpread: 36,
          spacing: 8,
        });
        const rotation = normalized * -12;
        const drop = normalized * normalized * 16;
        return (
          <div
            key={cardId}
            data-battle-card-id={cardId}
            data-battle-card-zone="enemy-hand"
            data-battle-card-face="down"
            style={{
              position: "absolute",
              top: 0,
              left,
              height: "94%",
              aspectRatio: CARD_ASPECT_RATIO,
              transformOrigin: "50% 0%",
              transform: `translateX(-50%) translateY(-${String(drop)}%) rotate(${String(rotation)}deg)`,
              zIndex: index + 1,
            }}
          >
            <motion.div
              layoutId={`battle-card:${cardId}`}
              data-battle-card-motion=""
              style={{ width: "100%", height: "100%" }}
            >
              <CardBack label="Enemy card" />
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function toDeckPile(cardIds: readonly string[]): readonly BattlePileCard[] {
  return cardIds.map((id) => ({ face: "down", id }));
}

function toVoidPile(
  cards: readonly MobileBattleCardView[],
): readonly BattlePileCard[] {
  return cards.map((card) => ({
    face: "up",
    id: card.id,
    model: card.model,
    figment: card.figment,
    figmentTitleBar: card.figmentTitleBar,
  }));
}

function SideZones({
  owner,
  side,
  interactions,
}: {
  readonly owner: MobileBattleOwner;
  readonly side: MobileBattleSideView;
  readonly interactions?: MobileBattleInteractions;
}) {
  const deck = toDeckPile(side.deckCardIds);
  const voidPile = toVoidPile(side.voidCards);
  const canDrop =
    interactions?.canInteract === true && interactions.pendingCardId !== null;
  const zoneDropProps = (zone: "deck" | "void") => ({
    "data-battle-drop-target": canDrop ? "true" : undefined,
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      if (canDrop) event.preventDefault();
    },
    onDrop: (event: React.DragEvent<HTMLDivElement>) => {
      if (!canDrop) return;
      event.preventDefault();
      interactions.onZoneDrop({ owner, zone });
    },
  });
  return (
    <div
      data-battle-mobile-row={`${owner}-zones`}
      style={{
        ...ROW_STYLE,
        display: "grid",
        gridTemplateColumns:
          "minmax(0, 0.82fr) minmax(0, 1.6fr) minmax(0, 0.82fr)",
        alignItems: "center",
        columnGap: token("--space-5"),
        paddingInline: token("--space-4"),
      }}
    >
      <div
        {...zoneDropProps("deck")}
        data-battle-zone={`${owner}-deck`}
        data-battle-zone-count={deck.length}
        data-battle-zone-top-card-id={deck[0]?.id}
        style={{
          minWidth: 0,
          minHeight: 0,
          height: "72%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CardPile
          cards={deck}
          orientation="landscape"
          label={`${owner === "enemy" ? "Enemy" : "Player"} deck`}
          testId={`${owner}-battle-deck`}
        />
      </div>
      <div
        data-battle-zone={`${owner}-status`}
        style={{
          minWidth: 0,
          minHeight: 0,
          height: "82%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BattleStatusDisplay
          owner={owner}
          dreamcaller={side.status.dreamcaller}
          currentEnergy={side.status.currentEnergy}
          maxEnergy={side.status.maxEnergy}
          points={side.status.points}
          testId={`${owner}-battle-status`}
        />
      </div>
      <div
        {...zoneDropProps("void")}
        data-battle-zone={`${owner}-void`}
        data-battle-zone-count={voidPile.length}
        data-battle-zone-top-card-id={voidPile[0]?.id}
        style={{
          minWidth: 0,
          minHeight: 0,
          height: "72%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CardPile
          cards={voidPile}
          orientation="landscape"
          label={`${owner === "enemy" ? "Enemy" : "Player"} void`}
          testId={`${owner}-battle-void`}
        />
      </div>
    </div>
  );
}

function FaceUpCard({
  card,
  zone,
  showRulesText = false,
  interaction,
}: {
  readonly card: MobileBattleCardView;
  readonly zone: string;
  readonly showRulesText?: boolean;
  readonly interaction?: {
    readonly draggable: boolean;
    readonly onActivate?: () => void;
    readonly onDragStart: () => void;
    readonly onDragEnd: () => void;
  };
}) {
  const dragSuppressedRef = useRef(false);
  const [touchDragSuppressed, setTouchDragSuppressed] = useState(false);
  const draggable = interaction?.draggable === true;
  return (
    <motion.div
      layoutId={`battle-card:${card.id}`}
      data-battle-card-id={card.id}
      data-battle-card-zone={zone}
      data-battle-card-face="up"
      data-battle-card-exhausted={card.exhausted ? "true" : "false"}
      draggable={draggable && !touchDragSuppressed}
      onPointerDownCapture={(event) => {
        dragSuppressedRef.current = false;
        const suppressTouchDrag = event.pointerType === "touch";
        event.currentTarget.draggable = draggable && !suppressTouchDrag;
        setTouchDragSuppressed(suppressTouchDrag);
      }}
      onPointerUpCapture={(event) => {
        event.currentTarget.draggable = draggable;
        setTouchDragSuppressed(false);
      }}
      onPointerCancelCapture={(event) => {
        event.currentTarget.draggable = draggable;
        setTouchDragSuppressed(false);
      }}
      onClick={(event) => {
        if (!draggable) return;
        event.stopPropagation();
        if (dragSuppressedRef.current) {
          dragSuppressedRef.current = false;
          return;
        }
        interaction?.onActivate?.();
      }}
      onDragStart={() => {
        if (draggable) {
          dragSuppressedRef.current = true;
          interaction?.onDragStart();
        }
      }}
      onDragEnd={() => {
        if (draggable) interaction?.onDragEnd();
      }}
      style={{
        width: "100%",
        cursor: draggable ? "grab" : undefined,
        transform: card.exhausted ? "rotate(90deg)" : undefined,
        transformOrigin: "50% 50%",
      }}
    >
      <GameCard
        model={card.model}
        hideRulesText={!showRulesText}
        presentation={showRulesText ? "full" : "battlefield"}
        figment={card.figment}
        figmentTitleBar={card.figmentTitleBar}
        testId={`battle-card-face:${card.id}`}
      />
    </motion.div>
  );
}

function lastFilledSlotCount(slots: readonly MobileBattleSlotView[]): number {
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    if (slots[index]?.card !== null) return index + 1;
  }
  return 0;
}

function battlefieldLayoutBackSlotCount(view: MobileBattleView): number {
  const sides = [view.enemy, view.player] as const;
  return Math.max(
    1,
    ...sides.map((side) => lastFilledSlotCount(side.backRank)),
    ...sides.map((side) => lastFilledSlotCount(side.frontRank) + 1),
  );
}

function battlefieldCardSize(layoutBackSlotCount: number): string {
  const slotCount = Math.max(layoutBackSlotCount, 1);
  const horizontalGapCount = Math.max(slotCount - 1, 0);
  return `min(22cqw, calc((${String(BATTLEFIELD_WIDTH_PERCENT)}cqw - ${String(horizontalGapCount)} * ${token("--space-2")}) / ${String(slotCount)}), calc((200cqh - 3 * ${token("--space-2")}) / 4))`;
}

function battlefieldTrackWidth(
  slotCount: number,
  cardSize: string,
): string {
  const gapCount = Math.max(slotCount - 1, 0);
  return `calc(${String(slotCount)} * ${cardSize} + ${String(gapCount)} * ${token("--space-2")})`;
}

function Rank({
  owner,
  rank,
  slots,
  layoutBackSlotCount,
  cardSize,
  order,
  interactions,
}: {
  readonly owner: MobileBattleOwner;
  readonly rank: MobileBattleRank;
  readonly slots: readonly MobileBattleSlotView[];
  readonly layoutBackSlotCount: number;
  readonly cardSize: string;
  readonly order: number;
  readonly interactions?: MobileBattleInteractions;
}) {
  const canDrop =
    interactions?.canInteract === true && interactions.pendingCardId !== null;
  const layoutSlotCount =
    rank === "back"
      ? layoutBackSlotCount
      : Math.max(layoutBackSlotCount - 1, 1);
  const isCenterFacingRank =
    (owner === "enemy" && order === 1) ||
    (owner === "player" && order === 0);
  const centerOffset = token("--space-1");
  const outerOffset = `calc(${cardSize} + ${token("--space-2")} + ${centerOffset})`;
  return (
    <div
      data-battle-rank={`${owner}-${rank}`}
      data-battle-rank-order={order}
      style={{
        position: "absolute",
        left: `${String(BATTLEFIELD_SIDE_INSET_PERCENT)}%`,
        right: `${String(BATTLEFIELD_SIDE_INSET_PERCENT)}%`,
        height: cardSize,
        top:
          owner === "player"
            ? isCenterFacingRank
              ? centerOffset
              : outerOffset
            : undefined,
        bottom:
          owner === "enemy"
            ? isCenterFacingRank
              ? centerOffset
              : outerOffset
            : undefined,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: rank === "front" ? 2 : 1,
      }}
    >
      <div
        data-battle-rank-track=""
        style={{
          position: "relative",
          flex: "0 0 auto",
          width: battlefieldTrackWidth(layoutSlotCount, cardSize),
          height: cardSize,
          display: "grid",
          gridTemplateColumns: `repeat(${String(layoutSlotCount)}, ${cardSize})`,
          gridAutoColumns: cardSize,
          gridAutoFlow: "column",
          columnGap: token("--space-2"),
        }}
      >
        {slots.map((slot) => (
          <div
            key={slot.id}
            data-battle-slot-id={slot.id}
            data-battle-slot-filled={slot.card !== null ? "true" : "false"}
            data-battle-drop-target={canDrop ? "true" : undefined}
            onDragOver={(event) => {
              if (canDrop) event.preventDefault();
            }}
            onDrop={(event) => {
              if (!canDrop) return;
              event.preventDefault();
              interactions.onSlotDrop({ owner, rank, slotId: slot.id });
            }}
            style={{
              position: "relative",
              width: cardSize,
              aspectRatio: BATTLEFIELD_CARD_ASPECT_RATIO,
              boxSizing: "border-box",
            }}
          >
            {slot.card !== null ? (
              <FaceUpCard
                card={slot.card}
                zone={`${owner}-${rank}-rank`}
                interaction={
                  interactions === undefined
                    ? undefined
                    : {
                        draggable: interactions.canInteract,
                        onDragStart: () =>
                          interactions.onCardDragStart(
                            slot.card?.id ?? "",
                            "battlefield",
                          ),
                        onDragEnd: interactions.onCardDragEnd,
                      }
                }
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayArea({
  owner,
  side,
  layoutBackSlotCount,
  cardSize,
  interactions,
}: {
  readonly owner: MobileBattleOwner;
  readonly side: MobileBattleSideView;
  readonly layoutBackSlotCount: number;
  readonly cardSize: string;
  readonly interactions?: MobileBattleInteractions;
}) {
  const ranks =
    owner === "enemy"
      ? ([
          ["back", side.backRank],
          ["front", side.frontRank],
        ] as const)
      : ([
          ["front", side.frontRank],
          ["back", side.backRank],
        ] as const);
  return (
    <div
      data-battle-mobile-row={`${owner}-play-area`}
      data-battle-play-area={owner}
      style={{
        ...ROW_STYLE,
        overflow: "hidden",
        containerType: "size",
      }}
    >
      {ranks.map(([rank, slots], order) => (
        <Rank
          key={rank}
          owner={owner}
          rank={rank}
          slots={slots}
          layoutBackSlotCount={layoutBackSlotCount}
          cardSize={cardSize}
          order={order}
          interactions={interactions}
        />
      ))}
    </div>
  );
}

function PlayerHand({
  cards,
  interactions,
}: {
  readonly cards: readonly MobileBattleCardView[];
  readonly interactions?: MobileBattleInteractions;
}) {
  const canDrop =
    interactions?.canInteract === true && interactions.pendingCardId !== null;
  return (
    <div
      data-battle-mobile-row="player-hand"
      data-battle-hand-count={cards.length}
      data-battle-hand-visible-count={cards.length}
      data-battle-drop-target={canDrop ? "true" : undefined}
      onDragOver={(event) => {
        if (canDrop) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!canDrop) return;
        event.preventDefault();
        interactions.onZoneDrop({ owner: "player", zone: "hand" });
      }}
      style={{
        ...ROW_STYLE,
        overflow: "hidden",
      }}
    >
      {cards.map((card, index) => {
        const { left, normalized } = centeredFanPosition({
          index,
          count: cards.length,
          maximumSpread: 82,
          spacing: 18,
        });
        const rotation = normalized * 18;
        const drop = normalized * normalized * 18;
        return (
          <div
            key={card.id}
            style={{
              position: "absolute",
              left,
              top: "calc(8% + var(--space-6))",
              height: "92%",
              aspectRatio: CARD_ASPECT_RATIO,
              transformOrigin: "50% 100%",
              transform: `translateX(-50%) translateY(${String(drop)}%) rotate(${String(rotation)}deg)`,
              zIndex: index + 1,
            }}
          >
            <FaceUpCard
              card={card}
              zone="player-hand"
              showRulesText
              interaction={
                interactions === undefined
                  ? undefined
                  : {
                      draggable: interactions.canInteract,
                      onActivate: () =>
                        interactions.onHandCardActivate(card.id),
                      onDragStart: () =>
                        interactions.onCardDragStart(card.id, "player-hand"),
                      onDragEnd: interactions.onCardDragEnd,
                    }
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function ControlRow({
  interactions,
}: {
  readonly interactions?: MobileBattleInteractions;
}) {
  const disabled = interactions?.canInteract !== true;
  return (
    <div
      data-battle-mobile-row="control-row"
      aria-label="Battle controls"
      style={{
        ...ROW_STYLE,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        boxSizing: "border-box",
        paddingRight: token("--space-4"),
        gap: token("--space-4"),
      }}
    >
      <IconButton
        glyph={GLYPHS.arrowLeft}
        size="sm"
        label="Previous phase"
        disabled={disabled}
        onPress={() => interactions?.onPreviousPhase()}
      />
      <IconButton
        glyph={GLYPHS.arrowRight}
        size="sm"
        variant="accent"
        label="Next phase"
        disabled={disabled}
        onPress={() => interactions?.onNextPhase()}
      />
    </div>
  );
}

function BattleDebugMenu({
  onFillBattlefieldPreview,
}: {
  readonly onFillBattlefieldPreview?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div
      data-battle-debug="menu"
      style={{
        position: "absolute",
        top: `calc(var(${SAFE_AREA_INSET_PROPERTIES.top}) + ${token("--space-4")})`,
        right: `calc(var(${SAFE_AREA_INSET_PROPERTIES.right}) + ${token("--space-4")})`,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: token("--space-3"),
      }}
    >
      <IconButton
        glyph={GLYPHS.bug}
        size="sm"
        label="Battle debug menu"
        ariaExpanded={isOpen}
        testId="battle-debug-menu-trigger"
        onPress={() => setIsOpen((open) => !open)}
      />
      {isOpen ? (
        <div
          role="menu"
          aria-label="Battle debug actions"
          style={{ width: 300, height: 66 }}
        >
          <GlassPanel radius="popover" tint="popover">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: token("--space-5"),
              }}
            >
              <GlassButton
                label="Fill Battlefield + Voids"
                placement="onGlass"
                disabled={onFillBattlefieldPreview === undefined}
                testId="battle-debug-fill-grid"
                onPress={() => {
                  onFillBattlefieldPreview?.();
                  setIsOpen(false);
                }}
              />
            </div>
          </GlassPanel>
        </div>
      ) : null}
    </div>
  );
}

/** Seven-row, mobile-only battle table composed entirely from battle objects. */
export function MobileBattleScreen({ view, interactions }: MobileBattleScreenProps) {
  const layoutBackSlotCount = battlefieldLayoutBackSlotCount(view);
  const cardSize = battlefieldCardSize(layoutBackSlotCount);
  return (
    <>
      <style>{`:where([data-connected-count]) { display: none; }`}</style>
      <main
        className="cumulus"
        data-battle-mobile={view.battleId}
        style={ROOT_STYLE}
      >
        <LayoutGroup id={`mobile-battle:${view.battleId}`}>
          <EnemyHand cardIds={view.enemyHandCardIds} />
          <SideZones owner="enemy" side={view.enemy} interactions={interactions} />
          <PlayArea
            owner="enemy"
            side={view.enemy}
            layoutBackSlotCount={layoutBackSlotCount}
            cardSize={cardSize}
            interactions={interactions}
          />
          <PlayArea
            owner="player"
            side={view.player}
            layoutBackSlotCount={layoutBackSlotCount}
            cardSize={cardSize}
            interactions={interactions}
          />
          <ControlRow interactions={interactions} />
          <SideZones owner="player" side={view.player} interactions={interactions} />
          <PlayerHand cards={view.playerHand} interactions={interactions} />
        </LayoutGroup>
        <BattleDebugMenu
          onFillBattlefieldPreview={interactions?.onFillBattlefieldPreview}
        />
      </main>
    </>
  );
}
