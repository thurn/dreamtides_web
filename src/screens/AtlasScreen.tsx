import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuest } from "../state/quest-context";
import { AtlasNode, type AtlasNodeModel } from "../cumulus/components/atlas/AtlasNode";
import { AtlasEdge, type AtlasEdgeKind } from "../cumulus/components/atlas/AtlasEdge";
import {
  reachableAtlasNodeIds,
  regenerateAtlasForProgress,
  revealedAtlasSite,
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
  type SiteGenerationContext,
} from "../atlas/atlas-generator";
import {
  BOSS_DISPLAY,
} from "../cumulus/components/atlas/atlas-display";
import { glyph } from "../cumulus/primitives/glyph";
import { artRef } from "../cumulus/primitives/art";
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
  view: AtlasNodeModel;
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
  // Nodes the player can no longer reach are faded and never reveal their site
  // (see the per-node `isReachable` handling below).
  const reachable = reachableAtlasNodeIds(atlas);

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
    const isReachable = reachable.has(node.id);
    // An unreachable node forgets whatever dreamscape it was revealed as: its
    // face falls back to the empty frame and it carries no site or dreamsign
    // content.
    const dreamscape =
      isReachable && node.dreamscapeId !== null
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
      isReachable && node.knownDreamsignId !== null
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
        isReachable,
        iconRef,
        siteBadgeGlyph,
        knownDreamsignRef,
        primary: isBoss
          ? {
              sceneArt: artRef.dreamscapeScene("limbo"),
              figureArt: artRef.dreamGuide(BOSS_DISPLAY.guideId),
              placeName: BOSS_DISPLAY.place,
              guideName: bossIncarnation?.title ?? BOSS_DISPLAY.title,
              title: bossIncarnation?.title ?? BOSS_DISPLAY.title,
              body: bossIncarnation?.description ?? BOSS_DISPLAY.intro,
            }
          : dreamscape === null
            ? {
                sceneArt: null,
                figureArt: null,
                placeName: null,
                guideName: null,
                title: "An Unseen Dream",
                body: "Travel onward to learn what waits here.",
              }
            : {
                sceneArt: artRef.dreamscapeScene(dreamscape.id),
                figureArt: guide === null ? null : artRef.dreamGuide(guide.id),
                placeName: dreamscape.name,
                guideName: guide?.name ?? null,
                title: guide?.name ?? dreamscape.name,
                body: guide?.homeSpecialty ?? "A quiet place where every dream quest begins.",
              },
        dreamsign: dreamsign === null
          ? null
          : {
              id: dreamsign.id,
              name: dreamsign.name,
              art: dreamsign.imageName == null ? null : artRef.dreamsign(dreamsign.imageName),
              rulesText: dreamsign.effectDescription,
            },
        site: guide === null || dreamscape === null || revealedSite === null
          ? null
          : {
              id: revealedSite.id,
              name: siteTypeName(dreamscape.signatureSite),
              blurb: siteTypeDescription(dreamscape.signatureSite),
              icon: glyph(siteTypeIcon(dreamscape.signatureSite)),
            },
        affiliation: affiliation === null
          ? null
          : {
              id: affiliation.id,
              name: affiliation.name,
              cardTheme: affiliation.name,
            },
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
    // An edge touching a node the player can no longer reach is drawn dim, to
    // match the faded treatment of the unreachable node itself.
    const reachable = reachableAtlasNodeIds(atlas);
    for (const from of Object.values(atlas.nodes)) {
      const fromView = resolved.get(from.id);
      if (fromView === undefined) continue;
      for (const toId of from.forwardIds ?? []) {
        const to = atlas.nodes[toId];
        const toView = resolved.get(toId);
        if (to === undefined || toView === undefined) continue;
        const unreachable = !reachable.has(from.id) || !reachable.has(toId);
        list.push({
          key: `${from.id}-${toId}`,
          x1: fromView.view.left,
          y1: fromView.view.top,
          x2: toView.view.left,
          y2: toView.view.top,
          kind: unreachable ? "dim" : edgeKind(from, to, choiceLayer),
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
  }, [
    state.dreamscapeModifiers,
    state.completionLevel,
    state.remainingDreamsignPool,
    questContent,
    mutations,
  ]);


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
                model={entry.view}
                onActivate={handleNodeClick}
              />
            ))}
          </div>


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
