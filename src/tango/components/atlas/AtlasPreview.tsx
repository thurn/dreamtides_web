// AtlasPreview — the floating detail card shown beside a hovered Dream Atlas
// node, plus its companion known-dreamsign card. Ported from the legacy atlas
// screen so the previews read and behave as they did while the atlas screen
// itself moves to the Tango design system; moving these onto Tango's InfoCard
// engine is a later step. It lives beside `AtlasNode` (a component, not a
// screen) so its class-based markup and font-glyph rows are within bounds.
//
// The component is presentational: it takes an already-resolved model (plain
// strings and URLs, minted by the atlas view-model builder) and reports
// nothing. Each card measures itself and, anchored to its node's stage-space
// centre, flips to whichever side has room and clamps within the stage.

import { useLayoutEffect, useRef, useState } from "react";
import { RulesText } from "../card/RulesText";
import { BOSS_DISPLAY } from "./atlas-display";
import "./atlas-preview.css";

/** The resolved detail-card model for one hovered node. */
export interface AtlasPreviewModel {
  /** Node centre in stage coordinates — the card anchors beside it. */
  anchorLeft: number;
  anchorTop: number;
  /** An unrevealed non-boss node shows the compact "unseen dream" card. */
  isUnrevealed: boolean;
  /** The boss node shows the red Final Dream card. */
  isBoss: boolean;
  /** Boss incarnation title / short deck description (boss card only). */
  bossSubtitle: string | null;
  bossDescription: string | null;
  /** Revealed dreamscape name (header title). */
  dreamscapeName: string | null;
  /** Rectangular scene art URL for the header. */
  sceneUrl: string | null;
  /** Resident guide name + portrait URL, or null for the starter. */
  guideName: string | null;
  guidePortraitUrl: string | null;
  /** Signature-site display name and its glyph class. */
  siteName: string | null;
  siteIconClass: string | null;
  /** The guide's home-site bonus copy. */
  bonusText: string | null;
  /** Card affiliation name, or null for a neutral on-ramp. */
  affiliationName: string | null;
}

/** The resolved known-dreamsign card model shown alongside the preview. */
export interface AtlasDreamsignModel {
  name: string;
  iconUrl: string | null;
  rulesText: string;
  anchorLeft: number;
  anchorTop: number;
}

/** Boxicons class used for the "Card Affiliation" row in the preview card. */
const AFFILIATION_ROW_ICON_CLASS = "bxf bx-rectangle-vertical";
/** Font Awesome flag glyph the starting dreamscape shows as its site mark. */
const STARTER_FLAG_ICON_CLASS = "fa-solid fa-flag";

/** Clamp a card's stage-space `top` so it stays within the stage vertically. */
function clampTop(desiredTop: number, height: number, stageHeight: number): number {
  return Math.max(20, Math.min(desiredTop, stageHeight - height - 20));
}

interface AtlasPreviewProps {
  model: AtlasPreviewModel;
  /** Whether the hovered node also carries a known dreamsign (widens the flip). */
  hasDreamsign: boolean;
  stageWidth: number;
  stageHeight: number;
}

/**
 * Floating detail card for a hovered node. Auto-flips to whichever side of the
 * node has room and is vertically clamped to the stage. Three variants:
 * unrevealed (compact), boss (red Final Dream), and a revealed dreamscape
 * (scene art, resident guide, and the signature-site / bonus / affiliation rows).
 */
export function AtlasPreview({
  model,
  hasDreamsign,
  stageWidth,
  stageHeight,
}: AtlasPreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({
    left: 0,
    top: 0,
    ready: false,
  });

  const isUnrevealed = model.isUnrevealed;

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    const reposition = () => {
      const height = el.offsetHeight;
      const previewWidth = isUnrevealed ? 320 : 560;
      const combinedWidth = previewWidth + (hasDreamsign ? 14 + 308 : 0);
      const gap = 92;
      let left = model.anchorLeft + gap;
      if (left + combinedWidth > stageWidth - 24) {
        left = model.anchorLeft - gap - previewWidth;
      }
      const top = clampTop(model.anchorTop - height / 2, height, stageHeight);
      setPos({ left, top, ready: true });
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [isUnrevealed, hasDreamsign, model.anchorLeft, model.anchorTop, stageWidth, stageHeight]);

  const style = {
    left: pos.left,
    top: pos.top,
    visibility: pos.ready ? ("visible" as const) : ("hidden" as const),
  };

  if (isUnrevealed) {
    return (
      <div className="preview preview-mini" ref={ref} style={style}>
        <div>
          <div className="eyebrow">Unrevealed</div>
          <div className="mini-title">An Unseen Dream</div>
          <p className="mini-text">
            This dreamscape is revealed only as you draw near. Travel onward to
            learn what waits here.
          </p>
        </div>
      </div>
    );
  }

  if (model.isBoss) {
    return (
      <div className="preview has-guide is-boss" ref={ref} style={style}>
        <div
          className="preview-scene"
          style={{ backgroundImage: `url(${BOSS_DISPLAY.sceneUrl})` }}
        >
          <div className="scene-fade boss-fade" />
          <div className="preview-title">
            <div className="ds-name">{BOSS_DISPLAY.place}</div>
            <div className="guide-name boss-subtitle">
              {model.bossSubtitle ?? BOSS_DISPLAY.title}
            </div>
          </div>
        </div>
        <div className="preview-info">
          <div className="info-row">
            <i className="fa-solid fa-skull row-ico danger" aria-hidden="true" />
            <div>
              <div className="eyebrow">Final Battle</div>
              <div className="row-val">Confront {BOSS_DISPLAY.name}</div>
            </div>
          </div>
          <div className="info-row">
            <i className="fa-solid fa-bolt row-ico danger" aria-hidden="true" />
            <div>
              <div className="eyebrow">Incarnation</div>
              <p className="row-text">
                {model.bossDescription ?? BOSS_DISPLAY.intro}
              </p>
            </div>
          </div>
        </div>
        <img
          className="preview-guide boss-figure"
          src={BOSS_DISPLAY.figureUrl}
          alt={BOSS_DISPLAY.name}
          draggable={false}
        />
      </div>
    );
  }

  if (model.dreamscapeName === null) {
    return null;
  }

  const hasGuide = model.guideName !== null;

  return (
    <div className={`preview${hasGuide ? " has-guide" : ""}`} ref={ref} style={style}>
      <div
        className="preview-scene"
        style={
          model.sceneUrl !== null
            ? { backgroundImage: `url(${model.sceneUrl})` }
            : undefined
        }
      >
        <div className="scene-fade" />
        <div className="preview-title">
          <div className="ds-name">{model.dreamscapeName}</div>
          {model.guideName !== null && (
            <div className="guide-name">{model.guideName}</div>
          )}
        </div>
      </div>
      <div className="preview-info">
        {hasGuide ? (
          <>
            <div className="info-row">
              <i
                className={`${model.siteIconClass ?? ""} row-ico`}
                aria-hidden="true"
              />
              <div>
                <div className="eyebrow">Site</div>
                <div className="row-val">{model.siteName}</div>
              </div>
            </div>
            <div className="info-row">
              <i className="fa-solid fa-star row-ico gold" aria-hidden="true" />
              <div>
                <div className="eyebrow">Bonus</div>
                <p className="row-text">{model.bonusText}</p>
              </div>
            </div>
            <div className="info-row">
              <i
                className={`${AFFILIATION_ROW_ICON_CLASS} row-ico`}
                aria-hidden="true"
              />
              <div>
                <div className="eyebrow">Affiliation</div>
                {model.affiliationName !== null ? (
                  <span className="aff-pill">{model.affiliationName}</span>
                ) : (
                  <div className="row-val dim">None — a neutral on-ramp</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="start-text">
            <i
              className={STARTER_FLAG_ICON_CLASS}
              aria-hidden="true"
              style={{ color: "var(--dt-accent-strong)", marginRight: 8 }}
            />
            A quiet place where every dream quest begins.
          </p>
        )}
      </div>
      {model.guidePortraitUrl !== null && (
        <img
          className="preview-guide"
          src={model.guidePortraitUrl}
          alt={model.guideName ?? ""}
          draggable={false}
        />
      )}
    </div>
  );
}

interface AtlasDreamsignCardProps {
  model: AtlasDreamsignModel;
  /** Whether the companion preview is the compact (unrevealed) width. */
  previewIsMini: boolean;
  stageWidth: number;
  stageHeight: number;
}

/**
 * Dedicated dreamsign card shown alongside the preview when a hovered node
 * carries a pre-revealed known dreamsign. Sits just outside the preview, on the
 * same side the preview flipped to.
 */
export function AtlasDreamsignCard({
  model,
  previewIsMini,
  stageWidth,
  stageHeight,
}: AtlasDreamsignCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({
    left: 0,
    top: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    const reposition = () => {
      const height = el.offsetHeight;
      const previewWidth = previewIsMini ? 320 : 560;
      const signWidth = 308;
      const gap = 92;
      const innerGap = 14;
      const combinedWidth = previewWidth + innerGap + signWidth;
      let previewLeft = model.anchorLeft + gap;
      let left: number;
      if (previewLeft + combinedWidth > stageWidth - 24) {
        previewLeft = model.anchorLeft - gap - previewWidth;
        left = previewLeft - innerGap - signWidth;
      } else {
        left = previewLeft + previewWidth + innerGap;
      }
      left = Math.max(24, Math.min(left, stageWidth - signWidth - 24));
      const top = clampTop(model.anchorTop - height / 2, height, stageHeight);
      setPos({ left, top, ready: true });
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [previewIsMini, model.anchorLeft, model.anchorTop, stageWidth, stageHeight]);

  const style = {
    left: pos.left,
    top: pos.top,
    visibility: pos.ready ? ("visible" as const) : ("hidden" as const),
  };

  return (
    <div className="dreamsign-card" ref={ref} style={style}>
      <div className="dsc-art">
        <div className="dsc-aura" />
        <div className="dsc-glow" />
        {model.iconUrl !== null && (
          <img
            className="dsc-icon"
            src={model.iconUrl}
            alt=""
            draggable={false}
          />
        )}
      </div>
      <div className="dsc-body">
        <div className="dsc-name">{model.name}</div>
        <div className="dsc-rules">
          <RulesText text={model.rulesText} />
        </div>
      </div>
    </div>
  );
}
