import * as React from "react";
import type { CSSProperties } from "react";
import type { AtlasNodeState } from "../../../types/journey";
import { richText } from "../card/rich-text";
import { rulesTextDefinitionCards } from "../card/rules-text-reveal";
import type {
  RevealInfoCardModel,
  RevealSpec,
} from "../../internal/reveal/model";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { type ArtRef, resolveArtRef } from "../../primitives/art";
import { type Glyph } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import type { InfoCardProps } from "../overlay/InfoCard";
import "./atlas.css";
import { tx, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import type { AtlasNodeId, DreamsignId } from "../../../types/identifiers";

const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: 0,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Atlas-primary display data. The component selects the strict InfoCard variant. */
export interface AtlasNodePrimary {
  sceneArt: ArtRef | null;
  figureArt: ArtRef | null;
  placeName: LocalizedString | null;
  guideName: LocalizedString | null;
  title: LocalizedString;
  body: LocalizedString;
}

/** Selects the strict Atlas primary variant from semantic node content. */
export function atlasPrimaryInfoCard(content: AtlasNodePrimary): InfoCardProps {
  if (content.sceneArt === null || content.placeName === null) {
    return {
      variant: "text",
      title: content.title,
      body: richText.plain(content.body),
    };
  }
  return {
    variant: "atlasReveal",
    image: content.sceneArt,
    imageCrop: "center",
    figure: content.figureArt ?? undefined,
    title: content.placeName,
    subtitle: content.guideName ?? undefined,
    body: richText.plain(content.body),
  };
}

/** A UUID-backed known Dreamsign related to an Atlas node. */
export interface AtlasNodeDreamsign {
  id: DreamsignId;
  name: LocalizedString;
  art: ArtRef | null;
  rulesText: LocalizedString;
}

/** A UUID-backed signature site related to an Atlas node. */
export interface AtlasNodeSite {
  name: LocalizedString;
  blurb: LocalizedString;
  icon: Glyph;
}

/** A UUID-backed affiliation related to an Atlas node. */
export interface AtlasNodeAffiliation {
  title: LocalizedString;
  body: LocalizedString;
}

/**
 * Strict semantic model for one Dream Atlas node. It contains face data plus
 * the Atlas primary and related domain entities; AtlasNode gives the known
 * Dreamsign its own reveal target and keeps site → affiliation details on the
 * destination target.
 */
export type AtlasNodeRole = "regular" | "starter" | "boss";

export interface AtlasNodeModel {
  /** Stable Atlas node identity. */
  id: AtlasNodeId;
  /** Localized accessible name for the assigned or unrevealed dreamscape. */
  name: LocalizedString;
  /** Journey presentation state that selects the node treatment. */
  state: AtlasNodeState;
  role: AtlasNodeRole;
  isReachable: boolean;
  iconRef: ArtRef | null;
  unrevealedFrameRef: ArtRef;
  siteBadgeGlyph: Glyph | null;
  knownDreamsignRef: ArtRef | null;
  primary: AtlasNodePrimary;
  dreamsign: AtlasNodeDreamsign | null;
  site: AtlasNodeSite | null;
  affiliation: AtlasNodeAffiliation | null;
}

function dreamsignCard(dreamsign: AtlasNodeDreamsign): RevealInfoCardModel {
  return dreamsign.art === null
    ? {
        variant: "text",
        title: dreamsign.name,
        body: richText.rules(dreamsign.rulesText),
      }
    : {
        variant: "object",
        image: dreamsign.art,
        title: dreamsign.name,
        body: richText.rules(dreamsign.rulesText),
      };
}

/** Derives the private reveal protocol from Atlas semantics. */
function atlasNodeRevealSpec(model: AtlasNodeModel): RevealSpec {
  const secondaries: RevealInfoCardModel[] = [];
  if (model.site !== null) {
    secondaries.push({
      variant: "icon",
      glyph: model.site.icon,
      title: model.site.name,
      body: richText.plain(model.site.blurb),
    });
  }
  if (model.affiliation !== null) {
    secondaries.push({
      variant: "text",
      title: model.affiliation.title,
      body: richText.plain(model.affiliation.body),
    });
  }
  return {
    primary: { kind: "infoCard", card: atlasPrimaryInfoCard(model.primary) },
    secondaries,
  };
}

function KnownDreamsignTarget({
  dreamsign,
  art,
}: {
  readonly dreamsign: AtlasNodeDreamsign;
  readonly art: ArtRef;
}): React.ReactElement {
  const resolve = useLocalizer();
  const binding = useRevealSource({
    identity: {
      entityType: "dreamsign",
      entityId: revealEntityId("dreamsign", dreamsign.id),
    },
    spec: {
      primary: { kind: "infoCard", card: dreamsignCard(dreamsign) },
      secondaries: rulesTextDefinitionCards(dreamsign.rulesText, "dreamsign"),
    },
  });

  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      pressFeedback="stationary"
      className="cumulus-atlas-known-target"
      aria-label={resolve(dreamsign.name)}
      data-atlas-known-dreamsign-id={dreamsign.id}
    >
      <span
        className="cumulus-atlas-known-badge"
        title={resolve(
          tx(
            "Known dreamsign",
            "[dreamsign] Tooltip identifying the known Dreamsign reward badge on a Dream Atlas node.",
          ),
        )}
      >
        <img src={resolveArtRef(art)} alt="" draggable={false} />
      </span>
    </Pressable>
  );
}

export interface AtlasNodeProps {
  /** UUID-backed semantic Atlas face and reveal data. */
  model: AtlasNodeModel;
  /** Enter the node's dreamscape. Available nodes invoke this with their UUID. */
  onPress: (nodeId: AtlasNodeId) => void;
}

/** One self-revealing, focusable Dream Atlas node. */
export function AtlasNode({
  model,
  onPress,
}: AtlasNodeProps): React.ReactElement {
  const resolve = useLocalizer();
  const { id, role, state } = model;
  const isStarter = role === "starter";
  const isBoss = role === "boss";
  const isAvailable = state === "available";
  const binding = useRevealSource({
    identity: {
      entityType: "atlas-node",
      entityId: revealEntityId("atlas-node", id),
    },
    spec: atlasNodeRevealSpec(model),
    onActivate: isAvailable ? () => onPress(id) : undefined,
  });
  const suppressCompatibilityClick = React.useRef(false);
  const pointerDown = binding.sourceProps.onPointerDown;
  const active = binding.sourceProps["data-reveal-active"] === "true";
  const isCompleted = state === "completed";

  const frameUrl = resolveArtRef(model.unrevealedFrameRef);
  const face =
    model.iconRef !== null ? (
      <img
        className="cumulus-atlas-frame-img"
        src={resolveArtRef(model.iconRef)}
        alt=""
        draggable={false}
      />
    ) : (
      <div className="cumulus-atlas-unrevealed-face">
        <img
          className="cumulus-atlas-frame-img"
          src={frameUrl}
          alt=""
          draggable={false}
        />
      </div>
    );

  const className =
    `cumulus-atlas-node cumulus-atlas-node-${state}` +
    (model.isReachable === false ? " cumulus-atlas-node-unreachable" : "") +
    (isBoss ? " cumulus-atlas-node-boss" : "") +
    (isStarter ? " cumulus-atlas-node-start" : "");
  const accessibleStateMessage = (() => {
    switch (state) {
      case "unrevealed":
        return tx(
          "This dreamscape is unrevealed.",
          "[accessibility] State sentence for a Dream Atlas node whose contents have not been revealed.",
        );
      case "revealedLocked":
        return tx(
          "This dreamscape is revealed and locked.",
          "[accessibility] State sentence for a revealed Dream Atlas node that cannot currently be entered.",
        );
      case "available":
        return tx(
          "This dreamscape is available.",
          "[accessibility] State sentence for a Dream Atlas node the player can enter now.",
        );
      case "completed":
        return tx(
          "This dreamscape is completed.",
          "[accessibility] State sentence for a Dream Atlas node the player has completed.",
        );
      case "forgone":
        return tx(
          "This dreamscape is unreachable.",
          "[accessibility] [journey] State sentence for a Dream Atlas node that cannot be entered on this journey.",
        );
    }
  })();
  const accessibleRoleMessage =
    role === "starter"
      ? tx(
          "This is the starting dreamscape.",
          "[accessibility] Role sentence for the starting node on the Dream Atlas.",
        )
      : role === "boss"
        ? tx(
            "This is the final boss.",
            "[accessibility] Role sentence for the final boss node on the Dream Atlas.",
          )
        : null;
  const accessibleNameId = React.useId();
  const nodeStyle = {
    width: "100%",
    height: "100%",
    touchAction: "pan-x pan-y",
    WebkitTapHighlightColor: "transparent",
    cursor: isAvailable ? "pointer" : "default",
    ...binding.sourceProps.style,
  } as CSSProperties;
  const selectableHighlightStyle = {
    maskImage: `url("${frameUrl}?v=1")`,
    WebkitMaskImage: `url("${frameUrl}?v=1")`,
  } as CSSProperties;

  return (
    <div className="cumulus-atlas-node-shell">
      <Pressable
        as="button"
        ref={binding.ref}
        {...binding.sourceProps}
        pressFeedback={isAvailable ? "scale" : "stationary"}
        className={className}
        style={nodeStyle}
        aria-labelledby={`${accessibleNameId}-name ${accessibleNameId}-state${accessibleRoleMessage === null ? "" : ` ${accessibleNameId}-role`}`}
        aria-disabled={!isAvailable}
        data-atlas-node-id={id}
        data-node-state={state}
        data-node-boss={isBoss ? "true" : undefined}
        data-node-starting={isStarter ? "true" : undefined}
        data-node-known-dreamsign={
          model.knownDreamsignRef !== null ? "true" : undefined
        }
        onPointerDown={(event) => {
          suppressCompatibilityClick.current = event.pointerType === "touch";
          pointerDown?.(event);
        }}
        onClick={(event) => {
          if (!isAvailable) return;
          if (event.detail === 0) {
            suppressCompatibilityClick.current = false;
            onPress(id);
            return;
          }
          if (suppressCompatibilityClick.current) {
            suppressCompatibilityClick.current = false;
            return;
          }
          onPress(id);
        }}
      >
        <span id={`${accessibleNameId}-name`} style={VISUALLY_HIDDEN_STYLE}>
          {resolve(model.name)}
        </span>
        <span id={`${accessibleNameId}-state`} style={VISUALLY_HIDDEN_STYLE}>
          {resolve(accessibleStateMessage)}
        </span>
        {accessibleRoleMessage === null ? null : (
          <span id={`${accessibleNameId}-role`} style={VISUALLY_HIDDEN_STYLE}>
            {resolve(accessibleRoleMessage)}
          </span>
        )}
        {isAvailable && (
          <div
            className="cumulus-atlas-node-selectable-highlight"
            data-ambient-paused={active ? "true" : "false"}
            aria-hidden="true"
          >
            <div
              className="cumulus-atlas-node-selectable-highlight-layer cumulus-atlas-node-selectable-highlight-pulse"
              style={selectableHighlightStyle}
            />
            <div
              className="cumulus-atlas-node-selectable-highlight-layer cumulus-atlas-node-selectable-highlight-base"
              style={selectableHighlightStyle}
            />
          </div>
        )}
        <div
          className="cumulus-atlas-node-glow"
          data-ambient-paused={active ? "true" : "false"}
        />
        <div className="cumulus-atlas-node-art">{face}</div>

        {(isCompleted || model.siteBadgeGlyph !== null) && (
          <div className="cumulus-atlas-site-badges">
            <div className="cumulus-atlas-site-badge">
              <i
                className={`${isCompleted ? "fa-solid fa-check" : (model.siteBadgeGlyph ?? "")} cumulus-atlas-site-badge-glyph`}
                aria-hidden="true"
              />
            </div>
          </div>
        )}

        {isBoss && (
          <div
            className="cumulus-atlas-boss-badge"
            title={resolve(
              tx(
                "Final boss",
                "[ui] Tooltip identifying the final boss badge on a Dream Atlas node.",
              ),
            )}
          >
            <i className="fa-solid fa-skull" aria-hidden="true" />
          </div>
        )}
      </Pressable>
      {model.knownDreamsignRef !== null && model.dreamsign !== null ? (
        <KnownDreamsignTarget
          dreamsign={model.dreamsign}
          art={model.knownDreamsignRef}
        />
      ) : null}
    </div>
  );
}
