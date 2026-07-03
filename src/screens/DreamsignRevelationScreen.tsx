import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Dreamsign, SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { dreamsignIconUrl } from "../tango/components/atlas-display";
import { SiteGuide } from "../components/SiteGuide";
import { SiteCloseButton } from "../components/SiteCloseButton";
import {
  DREAMSIGN_HOVER_DELAY_MS,
  DreamsignInfoCard,
} from "../tango/components/Dreamsign";
import { HoverPopover } from "../tango/components/HoverPopover";
import { DreamsignPurgeOverlay } from "./DreamsignPurgeOverlay";
import "./dreamsign-revelation.css";

/** Props for the DreamsignRevelationScreen component. */
interface DreamsignRevelationScreenProps {
  site: SiteState;
}

/** How long the chosen sign's fly-to-tray animation plays before navigating. */
const FLY_TO_TRAY_MS = 1000;

/**
 * The Dreamsign Revelation. Sigrún reveals 3 dreamsigns (4 when enhanced) over
 * the dimmed dreamscape scene; the player takes one — which glows and flies
 * toward the Dreamsign collection in the bottom-left HUD — or leaves via the
 * red close button in the top-right corner. Shares the dreamsign-offer data
 * flow with the dreamsign draft (option draw, accept, at-cap purge), but
 * presents it as a full immersive scene rather than the card-grid offering.
 */
export function DreamsignRevelationScreen({
  site,
}: DreamsignRevelationScreenProps) {
  const { state, mutations } = useQuest();
  const { dreamsigns: currentDreamsigns, maxDreamsigns } = state;

  const optionCount = site.isEnhanced ? 4 : 3;
  const runtime = state.siteRuntime[site.id];
  const offerRuntime = runtime?.kind === "dreamsignOffer" ? runtime : null;
  const options = offerRuntime?.offeredDreamsigns ?? null;
  const remainingDreamsignPoolKey = state.remainingDreamsignPool.join("\u0000");

  const [mounted, setMounted] = useState(false);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [purging, setPurging] = useState(false);
  const [pendingDreamsign, setPendingDreamsign] = useState<Dreamsign | null>(
    null,
  );

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureDreamsignOfferRuntime(site.id, optionCount);
    }
  }, [mutations, optionCount, remainingDreamsignPoolKey, runtime, site.id]);

  // Trigger the entrance animation once mounted.
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (options === null) return;
    logEvent("site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      optionCount,
    });
  }, [site.type, site.isEnhanced, optionCount, options]);

  const handleTake = useCallback(
    (dreamsign: Dreamsign, index: number) => {
      if (chosenIndex !== null) return;
      if (currentDreamsigns.length >= maxDreamsigns) {
        setPendingDreamsign(dreamsign);
        setPurging(true);
        return;
      }
      // Play the fly-to-tray animation, then commit (which returns to the
      // dreamscape). Accepting the offer is what records the choice.
      setChosenIndex(index);
      window.setTimeout(() => {
        mutations.acceptDreamsignOffer(site.id, dreamsign);
      }, FLY_TO_TRAY_MS);
    },
    [chosenIndex, currentDreamsigns.length, maxDreamsigns, mutations, site.id],
  );

  const handlePurge = useCallback(
    (index: number) => {
      if (pendingDreamsign) {
        mutations.acceptDreamsignOffer(site.id, pendingDreamsign, index);
      }
      setPurging(false);
      setPendingDreamsign(null);
    },
    [pendingDreamsign, mutations, site.id],
  );

  const handleSkip = useCallback(() => {
    if (chosenIndex !== null) return;
    mutations.completeSite(site.id, "dreamsign_revelation");
  }, [chosenIndex, mutations, site.id]);

  if (purging) {
    return (
      <DreamsignPurgeOverlay
        maxDreamsigns={maxDreamsigns}
        pendingDreamsign={pendingDreamsign}
        currentDreamsigns={currentDreamsigns}
        onPurge={handlePurge}
        onCancel={() => {
          setPurging(false);
          setPendingDreamsign(null);
        }}
      />
    );
  }

  const offered = options ?? [];

  return (
    <div
      className={`dreamsign-revelation${mounted ? " mounted" : ""}`}
      data-testid="dreamsign-revelation-screen"
    >
      {options === null ? (
        <p className="dsr-status">Revealing Dreamsigns...</p>
      ) : offered.length === 0 ? (
        <p className="dsr-status">The Dreamsign pool is exhausted.</p>
      ) : (
        <>
          <div className="dsr-row">
            {offered.map((dreamsign, index) => (
              <RevelationCard
                key={`reveal-${dreamsign.id ?? dreamsign.name}`}
                dreamsign={dreamsign}
                index={index}
                state={cardStateFor(mounted, chosenIndex, index)}
                onTake={handleTake}
              />
            ))}
          </div>

        </>
      )}

      <SiteGuide siteType="DreamsignRevelation" isEnhanced={site.isEnhanced} />

      <SiteCloseButton
        onClose={handleSkip}
        testId="dreamsign-revelation-skip"
        disabled={chosenIndex !== null}
      />
    </div>
  );
}

/** Per-card animation state: entrance, dimmed, or flying to the tray. */
type CardAnimState = "out" | "in" | "dimmed" | "fly";

function cardStateFor(
  mounted: boolean,
  chosenIndex: number | null,
  index: number,
): CardAnimState {
  if (chosenIndex === null) return mounted ? "in" : "out";
  if (index === chosenIndex) return "fly";
  return "dimmed";
}

/**
 * A single revealed dreamsign: only the art and a Take button. The name, kind,
 * and full rule text live exclusively in the hover card (DreamsignHoverCard).
 */
function RevelationCard({
  dreamsign,
  index,
  state,
  onTake,
}: {
  readonly dreamsign: Dreamsign;
  readonly index: number;
  readonly state: CardAnimState;
  readonly onTake: (dreamsign: Dreamsign, index: number) => void;
}) {
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = Boolean(dreamsign.imageName) && !imageBroken;
  const triggerId = dreamsign.id ?? dreamsign.name;

  return (
    <div
      className={`dsr-col state-${state}`}
      style={{ "--i": index } as CSSProperties}
      data-testid={`dreamsign-revelation-option-${triggerId}`}
    >
      <div className="flex">
      <HoverPopover
        triggerAs="div"
        delayMs={DREAMSIGN_HOVER_DELAY_MS}
        placement="left"
        maxWidthPx={null}
        content={<DreamsignInfoCard dreamsign={dreamsign} />}
      >
        <div
          className={`dsr-art-wrap${dreamsign.isBane ? " bane" : ""}`}
          aria-label={`Dreamsign: ${dreamsign.name}`}
        >
          {showImage ? (
            <img
              className="dsr-art"
              src={dreamsignIconUrl(String(dreamsign.imageName))}
              alt={dreamsign.imageAlt ?? dreamsign.name}
              onError={() => setImageBroken(true)}
            />
          ) : (
            <div className="dsr-art-fallback" aria-hidden="true">
              ✦
            </div>
          )}
        </div>
      </HoverPopover>
      </div>

      <button
        type="button"
        className="dsr-take"
        data-testid={`dreamsign-revelation-take-${triggerId}`}
        onClick={() => onTake(dreamsign, index)}
      >
        Take
      </button>
    </div>
  );
}
