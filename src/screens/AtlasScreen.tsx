import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuest } from "../state/quest-context";
import { AtlasNode, type AtlasNodeView } from "../tango/components/atlas/AtlasNode";
import { AtlasEdge, type AtlasEdgeKind } from "../tango/components/atlas/AtlasEdge";
import { RulesText } from "../tango/components/card/RulesText";
import {
  regenerateAtlasForProgress,
  revealedAtlasSite,
  siteTypeIcon,
  siteTypeName,
  type SiteGenerationContext,
} from "../atlas/atlas-generator";
import {
  AFFILIATION_ROW_ICON_CLASS,
  BOSS_DISPLAY,
  STARTER_FLAG_ICON_CLASS,
  dreamscapeSceneUrl,
  dreamsignIconUrl,
  guidePortraitUrl,
} from "../tango/components/atlas/atlas-display";
import { glyph } from "../tango/primitives/glyph";
import { artRef } from "../tango/primitives/art";
import type {
  AffiliationContent,
  ApollyonIncarnationContent,
  DreamGuideContent,
  DreamscapeContent,
  DreamsignTemplate,
} from "../types/content";
import type { DreamAtlas, DreamscapeNode } from "../types/quest";
import {
  type LayerName,
  layerAtOrdinal,
  layerOrdinal,
  layerRoman,
} from "../types/layer-name";
import type { QuestContent } from "../data/quest-content";
import { logEvent } from "../logging";
import "../atlas/atlas.css";

/** The fixed design canvas the atlas stage scales to fit (letterboxed). */
const STAGE_W = 1920;
const STAGE_H = 1080;

/** Screen-space padding kept clear above a hover card. */
const PREVIEW_TOP_INSET = 12;
/** Screen-space bottom padding used when the HUD bar is not in the DOM. */
const PREVIEW_BOTTOM_INSET = 88;

/**
 * Clamp a hover card's stage-space `top` so its on-screen box stays fully
 * visible: padded below the top edge and above the fixed bottom HUD bar. The
 * atlas stage is uniformly scaled and letterboxed, so the desired stage Y is
 * mapped into screen space through the live stage rect, clamped against the
 * window and HUD bar, then mapped back to stage space. When the card is taller
 * than the available band it is pinned to the top (its bottom may clip).
 */
function clampCardTop(
  cardEl: HTMLElement,
  desiredTop: number,
  height: number,
): number {
  const stage = cardEl.closest(".stage");
  if (stage === null) {
    return Math.max(20, Math.min(desiredTop, STAGE_H - height - 20));
  }
  const rect = stage.getBoundingClientRect();
  const scale = rect.height / STAGE_H;
  if (scale <= 0) {
    return Math.max(20, Math.min(desiredTop, STAGE_H - height - 20));
  }
  const hud = document.querySelector("[data-quest-bottom-hud]");
  const bottomLimit =
    hud !== null
      ? hud.getBoundingClientRect().top
      : window.innerHeight - PREVIEW_BOTTOM_INSET;
  const minTop = (PREVIEW_TOP_INSET - rect.top) / scale;
  const maxTop = (bottomLimit - rect.top) / scale - height;
  if (maxTop < minTop) {
    return minTop;
  }
  return Math.max(minTop, Math.min(desiredTop, maxTop));
}

/**
 * Stage-space rectangle the run graph is fitted into. Leaves room above for the
 * title block and layer numerals, and below for the persistent bottom HUD.
 */
const CONTENT_RECT = { left: 180, right: 1748, top: 256, bottom: 838 };

/**
 * Everything one node needs across the node face and its hover preview,
 * resolved once from quest content. The `view` field feeds {@link AtlasNode};
 * the resolved content drives the preview/dreamsign cards.
 */
interface ResolvedAtlasNode {
  view: AtlasNodeView;
  dreamscape: DreamscapeContent | null;
  guide: DreamGuideContent | null;
  affiliation: AffiliationContent | null;
  dreamsign: DreamsignTemplate | null;
  /**
   * The Apollyon incarnation presenting the boss node (`null` for non-boss
   * nodes, or when no incarnation was assigned). Drives the boss preview's
   * title and short deck description.
   */
  bossIncarnation: ApollyonIncarnationContent | null;
}

/** Builds the resolved-node lookup, fitting the run graph into the stage rect. */
function resolveAtlasNodes(
  atlas: DreamAtlas,
  questContent: QuestContent,
): Map<string, ResolvedAtlasNode> {
  const positioned = Object.values(atlas.nodes).filter((n) =>
    Boolean(n.position),
  );
  const resolved = new Map<string, ResolvedAtlasNode>();
  if (positioned.length === 0) {
    return resolved;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of positioned) {
    minX = Math.min(minX, node.position.x);
    maxX = Math.max(maxX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxY = Math.max(maxY, node.position.y);
  }

  const mapX = (x: number): number =>
    maxX === minX
      ? (CONTENT_RECT.left + CONTENT_RECT.right) / 2
      : CONTENT_RECT.left +
        ((x - minX) / (maxX - minX)) * (CONTENT_RECT.right - CONTENT_RECT.left);
  const mapY = (y: number): number =>
    maxY === minY
      ? (CONTENT_RECT.top + CONTENT_RECT.bottom) / 2
      : CONTENT_RECT.top +
        ((y - minY) / (maxY - minY)) * (CONTENT_RECT.bottom - CONTENT_RECT.top);

  for (const node of positioned) {
    const isStarter = node.id === atlas.startingNodeId;
    const isBoss = node.id === atlas.bossNodeId;
    const dreamscape =
      node.dreamscapeId !== null
        ? (questContent.dreamscapes.find((d) => d.id === node.dreamscapeId) ??
          null)
        : null;
    const guide =
      dreamscape?.guideId != null
        ? (questContent.guides.find((g) => g.id === dreamscape.guideId) ?? null)
        : null;
    const affiliation =
      dreamscape?.affiliationId != null
        ? (questContent.affiliations.find(
            (a) => a.id === dreamscape.affiliationId,
          ) ?? null)
        : null;
    const dreamsign =
      node.knownDreamsignId !== null
        ? (questContent.dreamsignTemplates.find(
            (t) => t.id === node.knownDreamsignId,
          ) ?? null)
        : null;
    // The boss node presents the run's chosen Apollyon incarnation; resolve its
    // title and short deck description for the boss preview.
    const bossIncarnation =
      isBoss && atlas.bossIncarnationId != null
        ? ((questContent.apollyonIncarnations ?? []).find(
            (i) => i.id === atlas.bossIncarnationId,
          ) ?? null)
        : null;

    // The node face: the boss is always the icon; a revealed dreamscape shows
    // its circular icon; an unrevealed node shows the empty round frame.
    const iconRef =
      isBoss || dreamscape === null
        ? null
        : artRef.dreamscapeIcon(dreamscape.id);

    // The signature-site badge is shown only for non-starter, non-boss revealed
    // dreamscapes; the starter shows just its meadow icon, the boss its skull.
    const revealedSite = revealedAtlasSite(node);
    const siteBadgeGlyph =
      isBoss || isStarter || dreamscape === null || revealedSite === null
        ? null
        : glyph(siteTypeIcon(dreamscape.signatureSite));

    const knownDreamsignRef =
      dreamsign?.imageName != null
        ? artRef.dreamsign(dreamsign.imageName)
        : null;

    resolved.set(node.id, {
      view: {
        node,
        left: mapX(node.position.x),
        top: mapY(node.position.y),
        size: isBoss || isStarter ? 150 : 132,
        isStarter,
        isBoss,
        iconRef,
        siteBadgeGlyph,
        knownDreamsignRef,
      },
      dreamscape,
      guide,
      affiliation,
      dreamsign,
      bossIncarnation,
    });
  }

  return resolved;
}

/** SVG edge styling derived from the two endpoints' lifecycle states. */
type EdgeKind = AtlasEdgeKind;

/**
 * Picks an edge style from the endpoint states and how deep the edge sits
 * relative to the layer the player is currently choosing into (`choiceLayer`,
 * the layer of the `available` frontier; `null` once nothing is available).
 *
 * Every edge that *originates* at the current layer or earlier is drawn solid:
 * it links nodes the player has already revealed and can reason about. Only
 * edges reaching forward from a layer deeper than the current frontier are
 * dotted, marking the speculative routes into still-locked territory.
 */
function edgeKind(
  from: DreamscapeNode,
  to: DreamscapeNode,
  choiceLayer: LayerName | null,
): EdgeKind {
  if (from.state === "completed" && to.state === "completed") {
    return "traveled";
  }
  if (from.state === "completed" && to.state === "available") {
    return "open";
  }
  if (
    choiceLayer !== null &&
    layerOrdinal(from.layer) > layerOrdinal(choiceLayer)
  ) {
    return "locked";
  }
  return "dim";
}

/* ----------------------------- Hover previews ----------------------------- */

interface PreviewProps {
  resolved: ResolvedAtlasNode;
}

/**
 * Floating detail card shown beside a hovered node. Auto-flips to whichever side
 * of the node has room and is vertically clamped to the stage. Three variants:
 * unrevealed (compact), boss (red Final Dream), and a revealed dreamscape (scene
 * art, resident guide, and the signature site / site bonus / affiliation rows).
 */
function Preview({ resolved }: PreviewProps) {
  const { view, dreamscape, guide, affiliation, bossIncarnation } = resolved;
  const node = view.node;
  const isBoss = view.isBoss;
  const isUnrevealed = node.state === "unrevealed" && !isBoss;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>(
    {
      left: 0,
      top: 0,
      ready: false,
    },
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    // Re-clamp whenever the card's measured height changes (e.g. web fonts
    // load and the bonus text reflows to another line) so a card anchored to a
    // low node never grows past the bottom edge of the stage.
    const reposition = () => {
      const height = el.offsetHeight;
      const previewWidth = isUnrevealed ? 320 : 560;
      const combinedWidth =
        previewWidth + (resolved.dreamsign === null ? 0 : 14 + 308);
      const gap = 92;
      let left = view.left + gap;
      if (left + combinedWidth > STAGE_W - 24) {
        left = view.left - gap - previewWidth;
      }
      const top = clampCardTop(el, view.top - height / 2, height);
      setPos({ left, top, ready: true });
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [isUnrevealed, resolved.dreamsign, view.left, view.top]);

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

  if (isBoss) {
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
              {bossIncarnation?.title ?? BOSS_DISPLAY.title}
            </div>
          </div>
        </div>
        <div className="preview-info">
          <div className="info-row">
            <i
              className="fa-solid fa-skull row-ico danger"
              aria-hidden="true"
            />
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
                {bossIncarnation?.description ?? BOSS_DISPLAY.intro}
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

  if (dreamscape === null) {
    return null;
  }

  return (
    <div
      className={`preview${guide ? " has-guide" : ""}`}
      ref={ref}
      style={style}
    >
      <div
        className="preview-scene"
        style={{ backgroundImage: `url(${dreamscapeSceneUrl(dreamscape.id)})` }}
      >
        <div className="scene-fade" />
        <div className="preview-title">
          <div className="ds-name">{dreamscape.name}</div>
          {guide && <div className="guide-name">{guide.name}</div>}
        </div>
      </div>
      <div className="preview-info">
        {guide ? (
          <>
            <div className="info-row">
              <i
                className={`${siteTypeIcon(dreamscape.signatureSite)} row-ico`}
                aria-hidden="true"
              />
              <div>
                <div className="eyebrow">Site</div>
                <div className="row-val">
                  {siteTypeName(dreamscape.signatureSite)}
                </div>
              </div>
            </div>
            <div className="info-row">
              <i className="fa-solid fa-star row-ico gold" aria-hidden="true" />
              <div>
                <div className="eyebrow">Bonus</div>
                <p className="row-text">{guide.homeSpecialty}</p>
              </div>
            </div>
            <div className="info-row">
              <i
                className={`${AFFILIATION_ROW_ICON_CLASS} row-ico`}
                aria-hidden="true"
              />
              <div>
                <div className="eyebrow">Affiliation</div>
                {affiliation ? (
                  <span className="aff-pill">{affiliation.name}</span>
                ) : (
                  <div className="row-val dim">None — a neutral on-ramp</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="start-text">
            <i
              className={`${STARTER_FLAG_ICON_CLASS}`}
              aria-hidden="true"
              style={{ color: "var(--dt-accent-strong)", marginRight: 8 }}
            />
            A quiet place where every dream quest begins.
          </p>
        )}
      </div>
      {guide && (
        <img
          className="preview-guide"
          src={guidePortraitUrl(guide.id)}
          alt={guide.name}
          draggable={false}
        />
      )}
    </div>
  );
}

interface DreamsignCardProps {
  resolved: ResolvedAtlasNode;
}

/**
 * Dedicated dreamsign card shown alongside the dreamscape preview when a node
 * carries a pre-revealed known dreamsign. Sits just outside the preview, on the
 * same side the preview flipped to.
 */
function DreamsignCard({ resolved }: DreamsignCardProps) {
  const { view, dreamsign } = resolved;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>(
    {
      left: 0,
      top: 0,
      ready: false,
    },
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    // Re-clamp on resize (font load / content reflow) so the dreamsign card
    // stays fully on the stage when anchored to a low node.
    const reposition = () => {
      const height = el.offsetHeight;
      const previewWidth =
        view.node.state === "unrevealed" && !view.isBoss ? 320 : 560;
      const signWidth = 308;
      const gap = 92;
      const innerGap = 14;
      const combinedWidth = previewWidth + innerGap + signWidth;
      let previewLeft = view.left + gap;
      let left: number;
      if (previewLeft + combinedWidth > STAGE_W - 24) {
        previewLeft = view.left - gap - previewWidth;
        left = previewLeft - innerGap - signWidth;
      } else {
        left = previewLeft + previewWidth + innerGap;
      }
      left = Math.max(24, Math.min(left, STAGE_W - signWidth - 24));
      const top = clampCardTop(el, view.top - height / 2, height);
      setPos({ left, top, ready: true });
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [view.isBoss, view.left, view.node.state, view.top]);

  if (dreamsign === null) {
    return null;
  }

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
        {dreamsign.imageName != null && (
          <img
            className="dsc-icon"
            src={dreamsignIconUrl(dreamsign.imageName)}
            alt=""
            draggable={false}
          />
        )}
      </div>
      <div className="dsc-body">
        <div className="dsc-name">{dreamsign.name}</div>
        <div className="dsc-rules">
          <RulesText text={dreamsign.effectDescription} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Motes ----------------------------------- */

interface Mote {
  left: string;
  top: string;
  size: number;
  duration: string;
  delay: string;
  opacity: number;
}

function buildMotes(): Mote[] {
  const motes: Mote[] = [];
  for (let i = 0; i < 26; i++) {
    const size = 2 + Math.random() * 4;
    motes.push({
      left: `${String(Math.random() * 100)}%`,
      top: `${String(Math.random() * 100)}%`,
      size,
      duration: `${String(9 + Math.random() * 10)}s`,
      delay: `${String(-Math.random() * 12)}s`,
      opacity: 0.15 + Math.random() * 0.4,
    });
  }
  return motes;
}

/* ------------------------------- AtlasScreen ------------------------------ */

/**
 * The Dream Atlas: the between-battles map where the player chooses which
 * dreamscape to enter next, across seven layers, on the way to the final dream.
 * The run graph is fitted into a fixed 1920x1080 stage that scales to fit the
 * viewport (letterboxed); nodes, edges, hover previews, and the title block all
 * live in that stage. The persistent bottom HUD is rendered by the app shell.
 */
export function AtlasScreen() {
  const { state, mutations, questContent } = useQuest();
  const { atlas } = state;
  const [hover, setHover] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const motes = useMemo(() => buildMotes(), []);

  useEffect(() => {
    const fit = () => {
      setScale(
        Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
    };
  }, []);

  const resolved = useMemo(
    () => resolveAtlasNodes(atlas, questContent),
    [atlas, questContent],
  );

  // The layer the player is currently choosing into (the `available` frontier).
  const choiceLayer = useMemo(() => {
    const available = Object.values(atlas.nodes).find(
      (n) => n.state === "available",
    );
    return available?.layer ?? null;
  }, [atlas.nodes]);

  // Forward edges, drawn from each node's `forwardIds`, styled by endpoint state.
  const edges = useMemo(() => {
    const list: Array<{
      key: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      kind: EdgeKind;
    }> = [];
    for (const from of Object.values(atlas.nodes)) {
      const fromView = resolved.get(from.id);
      if (fromView === undefined) continue;
      for (const toId of from.forwardIds ?? []) {
        const to = atlas.nodes[toId];
        const toView = resolved.get(toId);
        if (to === undefined || toView === undefined) continue;
        list.push({
          key: `${from.id}-${toId}`,
          x1: fromView.view.left,
          y1: fromView.view.top,
          x2: toView.view.left,
          y2: toView.view.top,
          kind: edgeKind(from, to, choiceLayer),
        });
      }
    }
    return list;
  }, [atlas.nodes, resolved, choiceLayer]);

  // Layer numerals: one watermark per layer, centred on that layer's column.
  const layerHeads = useMemo(() => {
    const heads: Array<{ layer: LayerName; x: number }> = [];
    atlas.layers.forEach((layerIds, ordinal) => {
      const layer = layerAtOrdinal(ordinal);
      if (layer === undefined) return;
      const first = layerIds.map((id) => resolved.get(id)).find(Boolean);
      if (first !== undefined) {
        heads.push({ layer, x: first.view.left });
      }
    });
    return heads;
  }, [atlas.layers, resolved]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const node = atlas.nodes[nodeId];
      if (!node || node.state !== "available") return;
      mutations.setCurrentDreamscape(nodeId);
      mutations.setScreen({ type: "dreamscape" });
    },
    [atlas.nodes, mutations],
  );

  /**
   * Debug-only: discard the persisted atlas and rebuild one with the current
   * generation logic, replaying the live progression up to the player's present
   * progress depth so atlas generation can be iterated live without starting a
   * new quest. Starting from a fresh Completion Level 0 atlas, one expansion is
   * applied per completed dreamscape (`state.completionLevel` total), so the
   * regenerated map reproduces the player's current layer experience: the same
   * count of completed dreamscapes, an available frontier to continue from, and
   * the layers ahead revealed but locked. Every node id is reissued; the player
   * is placed back at the regenerated frontier (`currentDreamscape` cleared once
   * any dreamscape has been completed, matching the post-victory atlas state).
   */
  const handleDebugRegenerate = useCallback(() => {
    const context: SiteGenerationContext = {
      ...(state.dreamscapeModifiers.length > 0
        ? { dreamscapeModifiers: state.dreamscapeModifiers }
        : {}),
    };
    const regenerated = regenerateAtlasForProgress(
      state.completionLevel,
      context,
      {
        dreamscapes: questContent.dreamscapes,
        atlasConfig: questContent.atlasConfig,
        dreamsignPoolIds: state.remainingDreamsignPool,
        apollyonIncarnations: questContent.apollyonIncarnations,
      },
      { logEvents: true },
    );
    const completedCount = Object.values(regenerated.nodes).filter(
      (node) => node.state === "completed",
    ).length;
    logEvent("debug_atlas_regenerated", {
      source: "atlas_debug_refresh",
      completionLevel: state.completionLevel,
      replayedCompletions: completedCount,
      dreamscapeModifierCount: state.dreamscapeModifiers.length,
      regeneratedNodeCount: Object.keys(regenerated.nodes).length,
      startingNodeId: regenerated.startingNodeId,
      bossNodeId: regenerated.bossNodeId,
      bossIncarnationId: regenerated.bossIncarnationId ?? null,
    });
    mutations.updateAtlas(regenerated);
    // After completing a dreamscape the player stands at the atlas frontier with
    // no dreamscape entered (matching `battle-completion-bridge`); a zero-depth
    // replay leaves them at the freshly generated starter, as a new quest does.
    mutations.setCurrentDreamscape(
      state.completionLevel > 0 ? null : regenerated.startingNodeId,
    );
    setHover(null);
  }, [
    state.dreamscapeModifiers,
    state.completionLevel,
    state.remainingDreamsignPool,
    questContent,
    mutations,
  ]);

  const hovered = hover !== null ? (resolved.get(hover) ?? null) : null;

  return (
    <div className="dream-atlas">
      <div className="viewport">
        <div
          className="stage"
          style={{ transform: `translate(-50%, -50%) scale(${String(scale)})` }}
        >
          <div className="wash" />

          <div className="motes">
            {motes.map((mote, i) => (
              <span
                key={i}
                className="mote"
                style={{
                  left: mote.left,
                  top: mote.top,
                  width: mote.size,
                  height: mote.size,
                  animationDuration: mote.duration,
                  animationDelay: mote.delay,
                  opacity: mote.opacity,
                }}
              />
            ))}
          </div>

          <svg
            className="edges"
            viewBox={`0 0 ${String(STAGE_W)} ${String(STAGE_H)}`}
            width={STAGE_W}
            height={STAGE_H}
          >
            {edges.map((edge) => (
              <AtlasEdge
                key={edge.key}
                kind={edge.kind}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
              />
            ))}
          </svg>

          <div className="layer-heads">
            {layerHeads.map((head) => (
              <div
                className="layer-head"
                key={head.layer}
                style={{ left: head.x, top: 120 }}
              >
                {layerRoman(head.layer)}
              </div>
            ))}
          </div>

          <div className="nodes">
            {Array.from(resolved.values()).map((entry) => (
              <AtlasNode
                key={entry.view.node.id}
                view={entry.view}
                hovered={hover === entry.view.node.id}
                onEnter={setHover}
                onLeave={() => {
                  setHover(null);
                }}
                onClick={handleNodeClick}
              />
            ))}
          </div>

          {hovered && <Preview resolved={hovered} />}
          {hovered && hovered.dreamsign !== null && (
            <DreamsignCard resolved={hovered} />
          )}

          <div className="hud-top">
            <div className="atlas-title">Dream Atlas</div>
            <div className="atlas-sub">
              {choiceLayer !== null
                ? `Layer ${layerRoman(choiceLayer)} · Choose your next dream`
                : "Seven layers to the final dream"}
            </div>
          </div>

          <button
            type="button"
            className="atlas-debug"
            data-testid="atlas-debug-regenerate"
            onClick={handleDebugRegenerate}
          >
            {"🔄 Debug: Regenerate Atlas"}
          </button>
        </div>
      </div>
    </div>
  );
}
