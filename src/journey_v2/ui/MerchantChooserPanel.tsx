import type {
  MerchantChoiceCandidate,
  MerchantChoiceRequest,
  MerchantOffer,
} from "../types";
import { MerchantGameObjectList } from "./MerchantGameObjectView";

interface MerchantChooserPanelProps {
  offer: MerchantOffer;
  choiceRequest: MerchantChoiceRequest;
  selectedChoiceId?: string;
  onSelect: (candidate: MerchantChoiceCandidate) => void;
  onClose: () => void;
}

function choiceTypeLabel(choiceType: MerchantChoiceRequest["choiceType"]): string {
  if (choiceType === "catalogCard") return "Card choices";
  if (choiceType === "dreamsign") return "Dreamsign choices";
  return "Replacement choices";
}

export function MerchantChooserPanel({
  offer,
  choiceRequest,
  selectedChoiceId,
  onSelect,
  onClose,
}: MerchantChooserPanelProps) {
  return (
    <section
      className="rounded-md border border-emerald-300/40 bg-slate-950/85 p-4 text-left shadow-xl shadow-black/30"
      data-testid="merchant-chooser-panel"
      data-offer-id={offer.offerId}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-emerald-200">
            {choiceTypeLabel(choiceRequest.choiceType)}
          </p>
          <h3 className="mt-1 break-words text-lg font-bold text-slate-50">
            {choiceRequest.prompt}
          </h3>
        </div>
        <button
          type="button"
          className="min-h-9 rounded-md border border-slate-600 bg-slate-900 px-3 py-1 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          onClick={onClose}
        >
          Close
        </button>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {choiceRequest.candidates.map((candidate) => {
          const selected = candidate.choiceId === selectedChoiceId;
          return (
            <button
              key={candidate.choiceId}
              type="button"
              className={`min-h-[176px] rounded-md border p-3 text-left transition ${
                selected
                  ? "border-emerald-200 bg-emerald-500/15"
                  : "border-slate-600 bg-slate-900/75 hover:border-emerald-300/60"
              }`}
              data-choice-id={candidate.choiceId}
              data-testid={`merchant-choice-${candidate.choiceId}`}
              onClick={() => onSelect(candidate)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-bold leading-tight text-slate-50">
                    {candidate.title}
                  </h4>
                  <p className="mt-1 text-xs leading-snug text-slate-300">
                    {candidate.summary}
                  </p>
                </div>
                {selected && (
                  <span className="rounded-md border border-emerald-200/60 bg-emerald-300/15 px-2 py-1 text-xs font-bold text-emerald-100">
                    Selected
                  </span>
                )}
              </div>
              <div className="mt-3">
                <MerchantGameObjectList objects={candidate.gameObjects} compact />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
