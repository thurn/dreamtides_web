import type {
  MerchantAcceptRequest,
  MerchantChoiceCandidate,
  MerchantContext,
  MerchantDeclineRequest,
  MerchantEncounter,
  MerchantOffer,
  MerchantOfferActionResult,
} from "../types";
import type { QuestState, SiteState } from "../../types/quest";
import { useEffect, useMemo, useState } from "react";
import {
  MERCHANT_ARCHETYPE_LABELS,
  type MerchantArchetypeId,
} from "../archetypes/types";
import { DreamJourneyMobile } from "./DreamJourneyMobile";
import { DreamJourneyStage } from "./DreamJourneyStage";
import { OfferColumn } from "./OfferColumn";
import { SiteLeaveControl } from "../../screens/SiteLeaveControl";

export interface DreamMerchantScreenProps {
  site: SiteState;
  encounter: MerchantEncounter;
  onAcceptOffer: (request: MerchantAcceptRequest) => MerchantOfferActionResult | void;
  onDecline: (request: MerchantDeclineRequest) => void;
  /**
   * Debug-only: regenerate this encounter from the same quest parameters. When
   * provided, a reroll icon button is shown in the top-right corner.
   */
  onReroll?: () => void;
  /**
   * Debug-only: force the next encounter to include an offer of the given
   * archetype (or clear the force with `null`). When provided, a bug icon button
   * opens a dropdown of forceable categories beside the reroll button.
   */
  onForceArchetype?: (archetypeId: MerchantArchetypeId | null) => void;
  /**
   * Debug-only: archetypes eligible for the current quest state, used to
   * populate the force-category dropdown. Only these can actually appear.
   */
  eligibleArchetypeIds?: readonly MerchantArchetypeId[];
  /** Debug-only: the archetype currently forced for this site, when any. */
  forcedArchetypeId?: string | null;
  context?: MerchantContext;
  questState?: QuestState;
  /** The resident guide's name, shown as a caption beside the central figure. */
  guideName?: string;
  /** A short greeting line for the guide, shown under the name in the caption. */
  guideLine?: string | null;
}

/** Below this viewport width the screen switches to the mobile overview flow. */
const MOBILE_MAX_WIDTH = 760;

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia === undefined) return;
    const query = window.matchMedia(`(max-width: ${String(MOBILE_MAX_WIDTH - 1)}px)`);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

export function DreamMerchantScreen({
  site,
  encounter,
  onAcceptOffer,
  onDecline,
  onReroll,
  onForceArchetype,
  eligibleArchetypeIds,
  forcedArchetypeId,
  context,
  questState,
  guideName,
  guideLine,
}: DreamMerchantScreenProps) {
  const [forcePanelOpen, setForcePanelOpen] = useState(false);
  const [selectedChoices, setSelectedChoices] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const isNarrow = useIsNarrow();

  const forceableArchetypes = useMemo(
    () =>
      [...(eligibleArchetypeIds ?? [])].sort((a, b) =>
        MERCHANT_ARCHETYPE_LABELS[a].localeCompare(MERCHANT_ARCHETYPE_LABELS[b]),
      ),
    [eligibleArchetypeIds],
  );

  function forceArchetype(archetypeId: MerchantArchetypeId | null) {
    setForcePanelOpen(false);
    onForceArchetype?.(archetypeId);
  }

  function selectCandidate(
    offer: MerchantOffer,
    candidate: MerchantChoiceCandidate,
  ) {
    setValidationMessage(null);
    setSelectedChoices((previous) => {
      const next = new Map(previous);
      next.set(offer.offerId, candidate.choiceId);
      return next;
    });
  }

  function acceptOffer(offer: MerchantOffer) {
    setValidationMessage(null);
    const choiceId = selectedChoices.get(offer.offerId);
    const request: MerchantAcceptRequest = {
      encounterSignature: encounter.encounterSignature,
      offerId: offer.offerId,
      archetypeId: offer.archetypeId,
      ...(choiceId === undefined ? {} : { choice: { choiceId } }),
    };
    const result = onAcceptOffer(request);
    if (result?.ok === false) {
      setValidationMessage(validationMessageFor(result.reason));
      return;
    }
    setAccepted(true);
  }

  function declineEncounter() {
    const declineOffer = encounter.offers[0];
    const request: MerchantDeclineRequest = {
      encounterSignature: encounter.encounterSignature,
      offerId: declineOffer?.offerId ?? "A",
    };
    onDecline(request);
  }

  const debugControls =
    onReroll === undefined && onForceArchetype === undefined ? undefined : (
      <DebugControls
        onReroll={onReroll}
        onForceArchetype={onForceArchetype}
        forcePanelOpen={forcePanelOpen}
        setForcePanelOpen={setForcePanelOpen}
        forceArchetype={forceArchetype}
        forceableArchetypes={forceableArchetypes}
        forcedArchetypeId={forcedArchetypeId ?? null}
      />
    );

  const toastBaseStyle = {
    position: "absolute",
    left: "50%",
    bottom: 132,
    transform: "translateX(-50%)",
    zIndex: 20,
    maxWidth: 520,
    padding: "12px 18px",
    borderRadius: 12,
    fontSize: 13.5,
    fontWeight: 600,
    textAlign: "center",
  } as const;

  const validationOverlay =
    validationMessage !== null ? (
      <div
        data-testid="merchant-validation-message"
        style={{
          ...toastBaseStyle,
          background: "rgba(60,20,28,.92)",
          border: "1px solid rgba(255,140,140,.4)",
          color: "#ffd9d6",
        }}
      >
        {validationMessage}
      </div>
    ) : accepted ? (
      <div
        data-testid="merchant-accept-reaction"
        style={{
          ...toastBaseStyle,
          background: "rgba(20,44,36,.92)",
          border: "1px solid rgba(120,235,180,.4)",
          color: "#cdedd9",
        }}
      >
        {encounter.acceptReaction}
      </div>
    ) : undefined;

  const rootProps = {
    "data-testid": "dream-merchant-v2-screen",
    "data-site-id": site.id,
    "data-encounter-signature": encounter.encounterSignature,
    "data-offer-count": encounter.offers.length,
    "data-essence": context?.essence ?? questState?.essence,
  } as const;

  if (isNarrow) {
    return (
      <div
        {...rootProps}
        style={{ position: "relative", height: "calc(100dvh - 64px)", width: "100%" }}
      >
        <DreamJourneyMobile
          offers={encounter.offers}
          subtitle={encounter.dialogue.line}
          context={context}
          selectedChoices={selectedChoices}
          onSelectCandidate={selectCandidate}
          onAccept={acceptOffer}
        />
        <SiteLeaveControl
          label="Walk on"
          onLeave={declineEncounter}
          testId="merchant-walk-away"
        />
        {validationMessage !== null && (
          <div
            data-testid="merchant-validation-message"
            style={{
              position: "fixed",
              left: 16,
              right: 16,
              bottom: 80,
              zIndex: 30,
              padding: "12px 16px",
              borderRadius: 12,
              background: "rgba(60,20,28,.95)",
              border: "1px solid rgba(255,140,140,.4)",
              color: "#ffd9d6",
              fontSize: 13.5,
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {validationMessage}
          </div>
        )}
      </div>
    );
  }

  const offerA = encounter.offers[0];
  const offerB = encounter.offers[1];

  return (
    <div
      {...rootProps}
      style={{ position: "relative", height: "calc(100dvh - 64px)", width: "100%" }}
    >
      <DreamJourneyStage
        subtitle={encounter.dialogue.line}
        guideName={guideName}
        guideLine={guideLine}
        debugControls={debugControls}
        overlay={validationOverlay}
        leftColumn={
          offerA === undefined ? null : (
            <OfferColumn
              offer={offerA}
              side="left"
              label="A"
              context={context}
              selectedChoiceId={selectedChoices.get(offerA.offerId)}
              onSelectCandidate={(candidate) => selectCandidate(offerA, candidate)}
              onAccept={() => acceptOffer(offerA)}
            />
          )
        }
        rightColumn={
          offerB === undefined ? null : (
            <OfferColumn
              offer={offerB}
              side="right"
              label="B"
              context={context}
              selectedChoiceId={selectedChoices.get(offerB.offerId)}
              onSelectCandidate={(candidate) => selectCandidate(offerB, candidate)}
              onAccept={() => acceptOffer(offerB)}
            />
          )
        }
      />
      <SiteLeaveControl
        label="Walk on"
        onLeave={declineEncounter}
        testId="merchant-walk-away"
      />
    </div>
  );
}

// --- debug controls ---------------------------------------------------------

interface DebugControlsProps {
  onReroll?: () => void;
  onForceArchetype?: (archetypeId: MerchantArchetypeId | null) => void;
  forcePanelOpen: boolean;
  setForcePanelOpen: (updater: (open: boolean) => boolean) => void;
  forceArchetype: (archetypeId: MerchantArchetypeId | null) => void;
  forceableArchetypes: readonly MerchantArchetypeId[];
  forcedArchetypeId: string | null;
}

const DEBUG_BUTTON_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 32,
  width: 32,
  borderRadius: 8,
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
  color: "#fcd34d",
  background: "rgba(15, 23, 42, 0.7)",
  border: "1px solid rgba(252, 211, 77, 0.4)",
} as const;

function DebugControls({
  onReroll,
  onForceArchetype,
  forcePanelOpen,
  setForcePanelOpen,
  forceArchetype,
  forceableArchetypes,
  forcedArchetypeId,
}: DebugControlsProps) {
  return (
    <>
      {onForceArchetype !== undefined && (
        <div style={{ position: "relative" }}>
          <button
            type="button"
            aria-label="Force a journey category (debug)"
            title="Force a journey category (debug)"
            aria-expanded={forcePanelOpen}
            data-testid="dream-merchant-force-toggle"
            onClick={() => setForcePanelOpen((open) => !open)}
            style={{
              ...DEBUG_BUTTON_STYLE,
              background:
                forcedArchetypeId != null
                  ? "rgba(252, 211, 77, 0.18)"
                  : DEBUG_BUTTON_STYLE.background,
            }}
          >
            <i className="bx bx-bug" aria-hidden="true" />
          </button>
          {forcePanelOpen && (
            <div
              data-testid="dream-merchant-force-panel"
              style={{
                position: "absolute",
                right: 0,
                top: 38,
                width: 256,
                maxHeight: "60vh",
                overflowY: "auto",
                borderRadius: 8,
                border: "1px solid rgba(252,211,77,.45)",
                background: "rgba(2,6,23,.97)",
                padding: 4,
                textAlign: "left",
                boxShadow: "0 18px 40px rgba(0,0,0,.5)",
              }}
            >
              <p
                style={{
                  padding: "6px 8px",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  color: "rgba(252,211,77,.8)",
                }}
              >
                Force a category
              </p>
              <DebugForceRow
                label="Random (clear force)"
                active={forcedArchetypeId == null}
                onClick={() => forceArchetype(null)}
                testId="dream-merchant-force-clear"
              />
              {forceableArchetypes.length === 0 ? (
                <p
                  style={{
                    padding: "6px 8px",
                    fontSize: 12,
                    fontStyle: "italic",
                    color: "#94a3b8",
                  }}
                >
                  No categories are eligible here.
                </p>
              ) : (
                forceableArchetypes.map((archetypeId) => (
                  <DebugForceRow
                    key={archetypeId}
                    label={MERCHANT_ARCHETYPE_LABELS[archetypeId]}
                    active={forcedArchetypeId === archetypeId}
                    onClick={() => forceArchetype(archetypeId)}
                    testId={`dream-merchant-force-${archetypeId}`}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}
      {onReroll !== undefined && (
        <button
          type="button"
          aria-label="Reroll journey (debug)"
          title="Reroll journey (debug)"
          data-testid="dream-merchant-reroll"
          onClick={onReroll}
          style={DEBUG_BUTTON_STYLE}
        >
          {"↻"}
        </button>
      )}
    </>
  );
}

function DebugForceRow({
  label,
  active,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        justifyContent: "space-between",
        borderRadius: 6,
        padding: "6px 8px",
        fontSize: 13,
        textAlign: "left",
        color: "#e2e8f0",
        background: active ? "rgba(252,211,77,.16)" : "transparent",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      {active && <span style={{ color: "#fcd34d" }}>✓</span>}
    </button>
  );
}

function validationMessageFor(reason: string): string {
  if (
    reason === "stale_encounter" ||
    reason === "archetype_mismatch" ||
    reason === "offer_not_found"
  ) {
    return "The offer changed while you were deciding. Review the new deal and try again.";
  }
  return "The merchant cannot complete that trade. Review the offer and try again.";
}
