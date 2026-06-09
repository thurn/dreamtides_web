import type {
  MerchantAcceptRequest,
  MerchantContext,
  MerchantDeclineRequest,
  MerchantEncounter,
} from "../types";
import type { QuestState, SiteState } from "../../types/quest";

export interface DreamMerchantScreenProps {
  site: SiteState;
  encounter: MerchantEncounter;
  onAcceptOffer: (request: MerchantAcceptRequest) => void;
  onDecline: (request: MerchantDeclineRequest) => void;
  context?: MerchantContext;
  questState?: QuestState;
}

export function DreamMerchantScreen({
  site,
  encounter,
  context,
  questState,
}: DreamMerchantScreenProps) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
      data-testid="dream-merchant-v2-screen"
      data-site-id={site.id}
      data-encounter-signature={encounter.encounterSignature}
      data-offer-count={encounter.offers.length}
      data-essence={context?.essence ?? questState?.essence}
    >
      <h2 className="text-2xl font-bold text-purple-200">Dream Merchant</h2>
    </div>
  );
}
