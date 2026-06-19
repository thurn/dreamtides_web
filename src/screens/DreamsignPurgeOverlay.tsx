import { motion } from "framer-motion";
import type { Dreamsign } from "../types/quest";
import {
  OFFERING_NEUTRAL,
  OfferingCardFrame,
  OfferingDreamsignBody,
} from "../components/OfferingScreen";

/**
 * Purge overlay shown when the player accepts a dreamsign at the cap. Uses
 * the offering palette but switches the primary border tone to red so the
 * destructive intent reads at a glance.
 */
export function DreamsignPurgeOverlay({
  maxDreamsigns,
  pendingDreamsign,
  currentDreamsigns,
  onPurge,
  onCancel,
}: {
  readonly maxDreamsigns: number;
  readonly pendingDreamsign: Dreamsign | null;
  readonly currentDreamsigns: readonly Dreamsign[];
  readonly onPurge: (index: number) => void;
  readonly onCancel: () => void;
}) {
  return (
    <motion.div
      className="flex min-h-full flex-col items-center px-4 py-6 md:px-8 md:py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <h2
        className="mb-2 text-2xl font-bold"
        style={{ color: "#ef4444" }}
      >
        Dreamsign Limit Reached
      </h2>
      <p className="mb-6 text-sm opacity-70">
        You have {String(maxDreamsigns)} dreamsigns. Remove one to accept
        the new dreamsign.
      </p>

      {pendingDreamsign && (
        <div className="mb-6">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-wider opacity-50">
            New Dreamsign
          </p>
          <OfferingCardFrame>
            <OfferingDreamsignBody dreamsign={pendingDreamsign} />
          </OfferingCardFrame>
        </div>
      )}

      <p className="mb-3 text-xs font-bold uppercase tracking-wider opacity-50">
        Select one to remove
      </p>
      <div className="grid max-w-3xl grid-cols-3 gap-3 md:grid-cols-4">
        {currentDreamsigns.map((sign, index) => (
          <button
            key={`purge-${sign.name}-${String(index)}`}
            className="cursor-pointer rounded-lg p-2 text-left transition-colors"
            style={{
              background: "rgba(239, 68, 68, 0.05)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
            onClick={() => onPurge(index)}
          >
            <span className="text-xs font-bold text-slate-200">
              {sign.name}
            </span>
          </button>
        ))}
      </div>

      <button
        className="mt-6 rounded-lg px-6 py-2.5 text-base font-medium transition-colors"
        style={{
          background: OFFERING_NEUTRAL.background,
          border: `1px solid ${OFFERING_NEUTRAL.border}`,
          color: OFFERING_NEUTRAL.text,
        }}
        onClick={onCancel}
      >
        Cancel
      </button>
    </motion.div>
  );
}
