import type { CardData } from "../types/cards";
import { CardView } from "../tango/components/CardView";
import { DreamcallerPortrait } from "../components/DreamcallerPortrait";
import { HoverPopover } from "../tango/components/HoverPopover";
import { RulesText } from "../tango/components/RulesText";
import type { Tides4DeckJson } from "../draft/pool/tides4-io";
import type { EditorDreamcaller } from "./tides-types";

/** Width (px) of the enlarged card shown when hovering a card thumbnail. */
const HOVER_CARD_WIDTH = 240;

interface TideSourcePreviewProps {
  tide: Tides4DeckJson;
  dreamcallerById: ReadonlyMap<string, EditorDreamcaller>;
  cardById: ReadonlyMap<string, CardData>;
  /** Pixel size of the rendered thumbnail (square for a portrait, width for a card). */
  size: number;
}

function dreamcallerHoverContent(dreamcaller: EditorDreamcaller) {
  return (
    <div
      style={{
        maxWidth: 260,
        color: "#f7f1df",
        background: "#0e1215",
        border: "1px solid rgba(255, 255, 255, 0.16)",
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 18px 34px rgba(0, 0, 0, 0.5)",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: "0.9rem" }}>{dreamcaller.name}</div>
      <div style={{ color: "#8edbd1", fontSize: "0.74rem", marginBottom: 6 }}>
        {dreamcaller.title}
      </div>
      <div style={{ fontSize: "0.82rem", lineHeight: 1.35 }}>
        <RulesText text={dreamcaller.renderedText} />
      </div>
    </div>
  );
}

/**
 * The small source token shown for a tide: its Dreamcaller's portrait (signature
 * tides) or the themed card it is grown from (facet / neutral tides). Hovering a
 * portrait reveals the Dreamcaller ability; hovering a card reveals an enlarged
 * card. Cards and Dreamcallers are resolved by stable UUID, never by name.
 */
export function TideSourcePreview({
  tide,
  dreamcallerById,
  cardById,
  size,
}: TideSourcePreviewProps) {
  if (tide.role === "signature" && tide.dreamcallerId !== undefined) {
    const dreamcaller = dreamcallerById.get(tide.dreamcallerId.toLowerCase());
    if (dreamcaller === undefined) return null;
    return (
      <HoverPopover
        triggerAs="div"
        delayMs={150}
        maxWidthPx={null}
        content={dreamcallerHoverContent(dreamcaller)}
        style={{ width: size, height: size, flex: `0 0 ${size}px` }}
      >
        <DreamcallerPortrait
          dreamcaller={dreamcaller}
          variant="thumb"
          style={{ width: size, height: size }}
        />
      </HoverPopover>
    );
  }

  if (tide.leanCardId !== undefined) {
    const card = cardById.get(tide.leanCardId.toLowerCase());
    if (card === undefined) return null;
    return (
      <HoverPopover
        triggerAs="div"
        delayMs={150}
        maxWidthPx={null}
        content={
          <div style={{ width: HOVER_CARD_WIDTH }}>
            <CardView card={card} large suppressHoverHelp />
          </div>
        }
        style={{ width: size, flex: `0 0 ${size}px` }}
      >
        <div style={{ width: size }}>
          <CardView card={card} suppressHoverHelp />
        </div>
      </HoverPopover>
    );
  }

  return null;
}
