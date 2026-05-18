import type { Dreamcaller } from "../types/quest";
import { DreamcallerPortrait } from "./DreamcallerPortrait";
import { RulesText } from "./RulesText";

const ACCENT_COLOR = "#a855f7";

interface DreamcallerPopoverProps {
  dreamcaller: Dreamcaller;
}

export function DreamcallerPopover({ dreamcaller }: DreamcallerPopoverProps) {
  const accentColor = ACCENT_COLOR;

  return (
    <div
      className="w-[280px] overflow-hidden rounded-2xl"
      style={{
        background: "linear-gradient(180deg, rgba(17, 24, 39, 0.98) 0%, rgba(10, 6, 18, 0.98) 100%)",
        border: `1px solid ${accentColor}66`,
        boxShadow: `0 18px 40px rgba(0, 0, 0, 0.45), 0 0 18px ${accentColor}26`,
      }}
    >
      <div
        className="relative overflow-hidden px-4 pt-4 pb-3"
        style={{
          background: `radial-gradient(circle at 30% 20%, ${accentColor}55 0%, rgba(15, 10, 24, 0.92) 58%, rgba(8, 6, 14, 0.98) 100%)`,
        }}
      >
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, transparent 35%, transparent 65%, rgba(255, 255, 255, 0.08) 100%)",
          }}
        />
        <div className="relative flex items-start gap-3">
          <div>
            <h3
              className="text-lg font-bold leading-tight"
              style={{ color: "#f8fafc" }}
            >
              {dreamcaller.name}
            </h3>
            <p
              className="mt-1 text-sm italic leading-tight"
              style={{ color: "#cbd5f5" }}
            >
              {dreamcaller.title}
            </p>
          </div>
        </div>

        <div className="relative mt-4">
          <DreamcallerPortrait
            dreamcaller={dreamcaller}
            variant="panel"
            style={{
              width: "100%",
              background:
                "linear-gradient(145deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.04) 45%, rgba(0, 0, 0, 0.18) 100%)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
            }}
          />
        </div>
      </div>

      <div className="px-4 py-4">
        <div
          className="text-sm leading-relaxed"
          style={{ color: "#e2e8f0" }}
        >
          <RulesText text={dreamcaller.renderedText} />
        </div>
      </div>
    </div>
  );
}
