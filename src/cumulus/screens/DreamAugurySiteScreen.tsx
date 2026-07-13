import { useCallback, useState } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { GlassButton } from "../components/controls/GlassButton";
import { GlowIcon } from "../components/controls/GlowIcon";
import { IconButton } from "../components/controls/IconButton";
import { Motes } from "../components/hud/Motes";
import { Dreamsign } from "../components/hud/Dreamsign";
import { QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP } from "../components/hud/QuestStatusBar";
import { glassSurfaceStyle } from "../internal/glass-surface";
import type { ArtRef } from "../primitives/art";
import { resolveArtRef } from "../primitives/art";
import type { Glyph } from "../primitives/glyph";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { Dreamsign as DreamsignData } from "../../types/quest";
import { useIsDesktop } from "./use-is-desktop";

export interface DreamAuguryGuideView {
  id: string;
  name: string;
  art: ArtRef;
}

export interface DreamAuguryCardView {
  id: string;
  model: GameCardModel;
}

export interface DreamAuguryCardChoiceView {
  id: string;
  card: DreamAuguryCardView;
}

export interface DreamAuguryDreamsignChoiceView {
  id: string;
  dreamsign: DreamsignData;
}

export type DreamAuguryOfferVisualView =
  | { kind: "cards"; cards: readonly DreamAuguryCardView[] }
  | {
      kind: "cardChoices";
      choices: readonly DreamAuguryCardChoiceView[];
      doubled: boolean;
    }
  | {
      kind: "beforeAfter";
      pairs: readonly {
        id: string;
        before: DreamAuguryCardView;
        after: DreamAuguryCardView;
      }[];
    }
  | { kind: "purge"; card: DreamAuguryCardView }
  | {
      kind: "purgeReplace";
      removed: DreamAuguryCardView;
      choices: readonly DreamAuguryCardChoiceView[];
    }
  | { kind: "duplicate"; card: DreamAuguryCardView }
  | {
      kind: "duplicateChoices";
      choices: readonly DreamAuguryCardChoiceView[];
    }
  | { kind: "dreamsigns"; dreamsigns: readonly DreamsignData[] }
  | {
      kind: "dreamsignChoices";
      choices: readonly DreamAuguryDreamsignChoiceView[];
    }
  | { kind: "site"; siteName: string; glyph: Glyph }
  | {
      kind: "mixed";
      cards: readonly DreamAuguryCardView[];
      dreamsigns: readonly DreamsignData[];
    };

export interface DreamAuguryOfferView {
  id: string;
  ordinal: "I" | "II";
  headline: string;
  requiresSelection: boolean;
  visual: DreamAuguryOfferVisualView;
}

export interface DreamAugurySiteView {
  siteId: string;
  scene: ArtRef | null;
  encounterSignature: string | null;
  guide: DreamAuguryGuideView;
  offers: readonly DreamAuguryOfferView[];
}

export type DreamAuguryChoiceResult =
  | { ok: true }
  | { ok: false; message: string };

export interface DreamAugurySiteScreenProps {
  view: DreamAugurySiteView;
  onChoose: (
    offerId: string,
    choiceId: string | null,
  ) => DreamAuguryChoiceResult;
  onClose: () => void;
}

const DIRECT_CARD_WIDTH = 190;
const GROUP_CARD_WIDTH = 116;
const CHOICE_CARD_WIDTH = 112;
const TRANSITION_CARD_WIDTH = 108;
const GUIDE_MAX_WIDTH = 410;
const DREAMSIGN_SIZE = 124;
const SITE_GLYPH_SIZE = "72px";

export function DreamAugurySiteScreen({
  view,
  onChoose,
  onClose,
}: DreamAugurySiteScreenProps) {
  const isDesktop = useIsDesktop();
  const sceneUrl = view.scene === null ? null : resolveArtRef(view.scene);
  const [selectedChoices, setSelectedChoices] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const [committingOfferId, setCommittingOfferId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectChoice = useCallback((offerId: string, choiceId: string) => {
    setErrorMessage(null);
    setSelectedChoices((current) => {
      const next = new Map(current);
      next.set(offerId, choiceId);
      return next;
    });
  }, []);

  const confirmOffer = useCallback(
    (offer: DreamAuguryOfferView) => {
      const choiceId = selectedChoices.get(offer.id) ?? null;
      const result = onChoose(offer.id, choiceId);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setCommittingOfferId(offer.id);
    },
    [onChoose, selectedChoices],
  );

  return (
    <div
      className="cumulus"
      data-testid="cumulus-dream-augury-site-screen"
      data-site-id={view.siteId}
      data-encounter-signature={view.encounterSignature ?? undefined}
      style={{
        position: "fixed",
        inset: 0,
        minHeight: "100dvh",
        overflow: "hidden",
        background: token("--bg-app"),
        color: token("--text-on-glass"),
      }}
    >
      {sceneUrl !== null && (
        <img
          src={sceneUrl}
          alt=""
          draggable={false}
          data-testid="cumulus-dream-augury-scene"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 58%",
            userSelect: "none",
          }}
        />
      )}
      <Motes on tint="warm" count={18} seed={7} />

      <div
        style={{
          position: "absolute",
          top: `max(var(--safe-area-inset-top), ${token("--space-8")})`,
          left: `max(var(--safe-area-inset-left), ${token("--space-8")})`,
          zIndex: 40,
        }}
      >
        <IconButton
          glyph={GLYPHS.close}
          label="Walk on"
          size="sm"
          onPress={onClose}
          testId="cumulus-dream-augury-close"
        />
      </div>

      <main
        data-dream-augury-layout={isDesktop ? "desktop" : "mobile"}
        style={{
          position: "absolute",
          top: `max(var(--safe-area-inset-top), ${token("--space-8")})`,
          right: `max(var(--safe-area-inset-right), ${token("--space-9")})`,
          bottom: `calc(${QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-6")})`,
          left: `max(var(--safe-area-inset-left), ${token("--space-9")})`,
          minHeight: 0,
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr)",
          gap: token("--space-7"),
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <header
          style={{
            display: "grid",
            justifyItems: "center",
            gap: token("--space-2"),
            textAlign: "center",
            textShadow: token("--text-outline-media"),
          }}
        >
          <p
            style={{
              margin: 0,
              font: token("--t-eyebrow"),
              letterSpacing: token("--tracking-eyebrow"),
              color: token("--text-primary"),
              textTransform: "uppercase",
            }}
          >
            Dream Augury
          </p>
          <h1 style={{ margin: 0, font: token("--t-display") }}>Choose One</h1>
        </header>

        {view.offers.length === 2 ? (
          <section
            data-dream-augury-choice-stage=""
            style={{
              width: "100%",
              maxWidth: 1500,
              minHeight: 0,
              justifySelf: "center",
              display: "grid",
              gridTemplateColumns: isDesktop
                ? "minmax(280px, 1fr) minmax(220px, 0.68fr) minmax(280px, 1fr)"
                : "minmax(0, 1fr)",
              gridTemplateRows: isDesktop ? "minmax(0, 1fr)" : "auto",
              gap: token("--space-8"),
              alignItems: "center",
              overflowY: isDesktop ? "visible" : "auto",
              padding: isDesktop ? undefined : token("--space-2"),
              boxSizing: "border-box",
            }}
          >
            <OfferPanel
              offer={view.offers[0]}
              selectedChoiceId={selectedChoices.get(view.offers[0].id)}
              disabled={committingOfferId !== null}
              onSelect={selectChoice}
              onConfirm={confirmOffer}
            />
            <GuideFigure guide={view.guide} desktop={isDesktop} />
            <OfferPanel
              offer={view.offers[1]}
              selectedChoiceId={selectedChoices.get(view.offers[1].id)}
              disabled={committingOfferId !== null}
              onSelect={selectChoice}
              onConfirm={confirmOffer}
            />
          </section>
        ) : (
          <section
            style={{
              ...glassSurfaceStyle({ radius: token("--radius-panel") }),
              alignSelf: "center",
              justifySelf: "center",
              padding: token("--space-9"),
              display: "grid",
              justifyItems: "center",
              gap: token("--space-6"),
              pointerEvents: "auto",
            }}
          >
            <p style={{ margin: 0, font: token("--t-lead") }}>
              The augury is clouded.
            </p>
            <GlassButton label="Walk On" placement="onGlass" onPress={onClose} />
          </section>
        )}
      </main>

      {errorMessage !== null && (
        <div
          role="status"
          data-testid="cumulus-dream-augury-error"
          style={{
            ...glassSurfaceStyle({ radius: token("--radius-control") }),
            position: "absolute",
            left: "25%",
            right: "25%",
            bottom: `calc(${QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-6")})`,
            maxWidth: 520,
            marginInline: "auto",
            padding: `${token("--space-5")} ${token("--space-7")}`,
            color: token("--text-on-glass"),
            font: token("--t-body-sm"),
            textAlign: "center",
            zIndex: 50,
          }}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}

function GuideFigure({
  guide,
  desktop,
}: {
  guide: DreamAuguryGuideView;
  desktop: boolean;
}) {
  return (
    <figure
      data-augury-guide=""
      data-guide-id={guide.id}
      style={{
        position: "relative",
        order: desktop ? undefined : -1,
        width: "100%",
        height: desktop ? "100%" : 260,
        minHeight: desktop ? 520 : undefined,
        maxHeight: desktop ? 760 : undefined,
        margin: 0,
        pointerEvents: "none",
      }}
    >
      <img
        src={resolveArtRef(guide.art)}
        alt={guide.name}
        draggable={false}
        data-testid="cumulus-dream-augury-guide-art"
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          translate: "-50% 0",
          width: desktop ? "min(29vw, 100%)" : "min(72vw, 360px)",
          maxWidth: GUIDE_MAX_WIDTH,
          height: "100%",
          objectFit: "contain",
          objectPosition: "50% 100%",
          userSelect: "none",
        }}
      />
      <figcaption
        style={{
          position: "absolute",
          left: "50%",
          bottom: token("--space-5"),
          translate: "-50% 0",
          margin: 0,
          font: token("--t-caption"),
          color: token("--text-primary"),
          textAlign: "center",
          textShadow: token("--text-outline-media"),
          whiteSpace: "nowrap",
        }}
      >
        {guide.name}
      </figcaption>
    </figure>
  );
}

function OfferPanel({
  offer,
  selectedChoiceId,
  disabled,
  onSelect,
  onConfirm,
}: {
  offer: DreamAuguryOfferView;
  selectedChoiceId?: string;
  disabled: boolean;
  onSelect: (offerId: string, choiceId: string) => void;
  onConfirm: (offer: DreamAuguryOfferView) => void;
}) {
  const confirmDisabled =
    disabled || (offer.requiresSelection && selectedChoiceId === undefined);
  return (
    <article
      data-augury-offer={offer.id}
      style={{
        ...glassSurfaceStyle({ radius: token("--radius-panel") }),
        width: "100%",
        height: "min(100%, 720px)",
        minHeight: 520,
        minWidth: 0,
        boxSizing: "border-box",
        padding: token("--space-7"),
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        gap: token("--space-6"),
        color: token("--text-on-glass"),
        pointerEvents: "auto",
      }}
    >
      <header
        style={{
          display: "grid",
          justifyItems: "center",
          gap: token("--space-3"),
          textAlign: "center",
        }}
      >
        <span
          style={{
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            color: token("--text-on-glass-muted"),
            textTransform: "uppercase",
          }}
        >
          {`Vision ${offer.ordinal}`}
        </span>
        <h2 style={{ margin: 0, font: token("--t-title-sm") }}>
          {offer.headline}
        </h2>
      </header>
      <div
        style={{
          minHeight: 0,
          overflow: "auto",
          display: "grid",
          placeItems: "center",
          padding: token("--space-2"),
        }}
      >
        <OfferVisual
          offerId={offer.id}
          visual={offer.visual}
          selectedChoiceId={selectedChoiceId}
          onSelect={onSelect}
        />
      </div>
      <div style={{ display: "grid", placeItems: "center" }}>
        <GlassButton
          label="Choose This"
          variant="accent"
          placement="onGlass"
          disabled={confirmDisabled}
          onPress={() => onConfirm(offer)}
          testId={`cumulus-dream-augury-confirm-${offer.id}`}
        />
      </div>
    </article>
  );
}

function OfferVisual({
  offerId,
  visual,
  selectedChoiceId,
  onSelect,
}: {
  offerId: string;
  visual: DreamAuguryOfferVisualView;
  selectedChoiceId?: string;
  onSelect: (offerId: string, choiceId: string) => void;
}) {
  switch (visual.kind) {
    case "cards":
      return <CardRow cards={visual.cards} />;
    case "cardChoices":
      return (
        <CardChoices
          offerId={offerId}
          choices={visual.choices}
          selectedChoiceId={selectedChoiceId}
          onSelect={onSelect}
        />
      );
    case "beforeAfter":
      return (
        <div style={{ display: "grid", gap: token("--space-5") }}>
          {visual.pairs.map((pair) => (
            <div
              key={pair.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: token("--space-4"),
              }}
            >
              <CardTile card={pair.before} width={TRANSITION_CARD_WIDTH} muted />
              <GlowIcon
                iconClass={GLYPHS.chevronRight}
                color="accent-bright"
                size="32px"
              />
              <CardTile card={pair.after} width={TRANSITION_CARD_WIDTH} selected />
            </div>
          ))}
        </div>
      );
    case "purge":
      return <CardTile card={visual.card} width={DIRECT_CARD_WIDTH} danger />;
    case "purgeReplace":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: token("--space-4"),
          }}
        >
          <CardTile card={visual.removed} width={TRANSITION_CARD_WIDTH} danger />
          <GlowIcon
            iconClass={GLYPHS.chevronRight}
            color="accent-bright"
            size="32px"
          />
          <CardChoices
            offerId={offerId}
            choices={visual.choices}
            selectedChoiceId={selectedChoiceId}
            onSelect={onSelect}
          />
        </div>
      );
    case "duplicate":
      return <DuplicateCards card={visual.card} />;
    case "duplicateChoices":
      return (
        <CardChoices
          offerId={offerId}
          choices={visual.choices}
          selectedChoiceId={selectedChoiceId}
          onSelect={onSelect}
        />
      );
    case "dreamsigns":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: token("--space-7"),
            flexWrap: "wrap",
          }}
        >
          {visual.dreamsigns.map((dreamsign) => (
            <Dreamsign
              key={dreamsign.id}
              dreamsign={dreamsign}
              sizePx={DREAMSIGN_SIZE}
              testid={`cumulus-augury-dreamsign-${dreamsign.id}`}
            />
          ))}
        </div>
      );
    case "dreamsignChoices":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: token("--space-6"),
            flexWrap: "wrap",
          }}
        >
          {visual.choices.map((choice) => {
            const selected = selectedChoiceId === choice.id;
            return (
              <div
                key={choice.id}
                data-selected={selected ? "true" : "false"}
                style={{
                  padding: token("--space-3"),
                  borderRadius: token("--radius-panel"),
                  border: `1px solid ${selected ? token("--border-accent") : "transparent"}`,
                  boxShadow: selected ? token("--glow-accent-soft") : undefined,
                }}
              >
                <Dreamsign
                  dreamsign={choice.dreamsign}
                  sizePx={DREAMSIGN_SIZE}
                  onPress={() => onSelect(offerId, choice.id)}
                  testid={`cumulus-augury-choice-${choice.id}`}
                />
              </div>
            );
          })}
        </div>
      );
    case "site":
      return (
        <div
          style={{
            display: "grid",
            justifyItems: "center",
            gap: token("--space-6"),
          }}
        >
          <div
            style={{
              width: 132,
              height: 132,
              borderRadius: token("--radius-pill"),
              border: `1px solid ${token("--border-accent")}`,
              display: "grid",
              placeItems: "center",
              boxShadow: token("--glow-accent-soft"),
            }}
          >
            <GlowIcon
              iconClass={visual.glyph}
              color="accent-bright"
              size={SITE_GLYPH_SIZE}
              shadow
              title={visual.siteName}
            />
          </div>
          <span style={{ font: token("--t-lead") }}>{visual.siteName}</span>
        </div>
      );
    case "mixed":
      return (
        <div style={{ display: "grid", gap: token("--space-6") }}>
          <CardRow cards={visual.cards} />
          {visual.dreamsigns.map((dreamsign) => (
            <Dreamsign
              key={dreamsign.id}
              dreamsign={dreamsign}
              sizePx={DREAMSIGN_SIZE}
            />
          ))}
        </div>
      );
  }
}

function CardRow({ cards }: { cards: readonly DreamAuguryCardView[] }) {
  const width = cards.length === 1 ? DIRECT_CARD_WIDTH : GROUP_CARD_WIDTH;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-4"),
        flexWrap: "wrap",
      }}
    >
      {cards.map((card) => (
        <CardTile key={card.id} card={card} width={width} />
      ))}
    </div>
  );
}

function CardChoices({
  offerId,
  choices,
  selectedChoiceId,
  onSelect,
}: {
  offerId: string;
  choices: readonly DreamAuguryCardChoiceView[];
  selectedChoiceId?: string;
  onSelect: (offerId: string, choiceId: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          choices.length === 1
            ? "minmax(0, 1fr)"
            : "repeat(2, minmax(0, 1fr))",
        gap: token("--space-5"),
        justifyItems: "center",
      }}
    >
      {choices.map((choice) => (
        <CardTile
          key={choice.id}
          card={choice.card}
          width={CHOICE_CARD_WIDTH}
          selected={selectedChoiceId === choice.id}
          onActivate={() => onSelect(offerId, choice.id)}
          testId={`cumulus-augury-choice-${choice.id}`}
        />
      ))}
    </div>
  );
}

function CardTile({
  card,
  width,
  selected = false,
  muted = false,
  danger = false,
  onActivate,
  testId,
}: {
  card: DreamAuguryCardView;
  width: number;
  selected?: boolean;
  muted?: boolean;
  danger?: boolean;
  onActivate?: () => void;
  testId?: string;
}) {
  return (
    <div style={{ width }}>
      <GameCard
        model={card.model}
        onActivate={onActivate}
        unavailable={muted}
        selected={selected || danger}
        selectionColor={danger ? "danger" : undefined}
        testId={testId}
      />
    </div>
  );
}

function DuplicateCards({ card }: { card: DreamAuguryCardView }) {
  return (
    <div style={{ position: "relative", width: 232, height: 306 }}>
      <div
        aria-hidden="true"
        style={{ position: "absolute", top: 0, right: 0, width: GROUP_CARD_WIDTH }}
      >
        <GameCard model={card.model} />
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, width: DIRECT_CARD_WIDTH }}>
        <GameCard model={card.model} />
      </div>
    </div>
  );
}
