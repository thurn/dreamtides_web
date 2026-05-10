export type TideChipVariant = "required" | "optional" | "neutral";

interface TideChipProps {
  label: string;
  variant: TideChipVariant;
}

export function TideChip({ label, variant }: TideChipProps) {
  const colors =
    variant === "required"
      ? {
        background: "rgba(251, 191, 36, 0.16)",
        border: "1px solid rgba(251, 191, 36, 0.35)",
        color: "#fbbf24",
      }
      : variant === "optional"
        ? {
          background: "rgba(96, 165, 250, 0.16)",
          border: "1px solid rgba(96, 165, 250, 0.35)",
          color: "#93c5fd",
        }
        : {
          background: "rgba(148, 163, 184, 0.16)",
          border: "1px solid rgba(148, 163, 184, 0.35)",
          color: "#cbd5e1",
        };

  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase"
      style={colors}
    >
      {label}
    </span>
  );
}
