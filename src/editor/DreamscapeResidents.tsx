import type { CSSProperties } from "react";
import { DreamcallerPopover } from "../components/DreamcallerPopover";
import { DreamcallerPortrait } from "../components/DreamcallerPortrait";
import { HoverPopover } from "../tango/components/HoverPopover";
import type {
  DreamcallerAssignmentAction,
  DreamcallerOption,
  DreamscapeCardSize,
  EditorDreamscapeRecord,
} from "./dreamscape-types";

export interface ResidentAssignmentStatus {
  pending: boolean;
  message: string | null;
}

export interface DreamscapeResidentsProps {
  record: EditorDreamscapeRecord;
  size: DreamscapeCardSize;
  dreamcallers: DreamcallerOption[];
  /** Lowercased Dreamcaller id -> the name of the region that currently hosts it. */
  regionNameByDreamcaller: Map<string, string>;
  status: ResidentAssignmentStatus;
  onAssign: (
    action: DreamcallerAssignmentAction,
    params: { inId?: string; outId?: string },
  ) => void;
}

const MIN_RESIDENTS = 3;
const MAX_RESIDENTS = 4;

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.66rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#7f8d88",
  fontWeight: 700,
  marginBottom: "6px",
};

const controlStyle: CSSProperties = {
  boxSizing: "border-box",
  border: "1px solid rgba(142, 219, 209, 0.4)",
  borderRadius: "6px",
  background: "#0b1517",
  color: "#fff7e0",
  font: "inherit",
  fontSize: "0.72rem",
  fontWeight: 600,
  padding: "4px 6px",
  cursor: "pointer",
};

const THUMB_SIZE: Record<DreamscapeCardSize, number> = {
  small: 44,
  medium: 54,
  large: 64,
};

/**
 * Build the `<option>` list of Dreamcallers a region can take on — every caller
 * not already resident here — each labelled with where it currently lives so the
 * editor makes the move (and any resulting swap) obvious before it happens.
 */
function candidateOptions(
  dreamcallers: DreamcallerOption[],
  residentIds: Set<string>,
  regionNameByDreamcaller: Map<string, string>,
  selfName: string,
) {
  return dreamcallers
    .filter((dreamcaller) => !residentIds.has(dreamcaller.id.toLowerCase()))
    .map((dreamcaller) => {
      const region = regionNameByDreamcaller.get(dreamcaller.id.toLowerCase());
      const where = region === undefined ? "unassigned" : region === selfName ? "here" : region;
      return { id: dreamcaller.id, label: `${dreamcaller.name} — ${where}` };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

export default function DreamscapeResidents({
  record,
  size,
  dreamcallers,
  regionNameByDreamcaller,
  status,
  onAssign,
}: DreamscapeResidentsProps) {
  const byId = new Map(dreamcallers.map((dreamcaller) => [dreamcaller.id.toLowerCase(), dreamcaller]));
  const residentIds = new Set(record.dreamcallerIds.map((id) => id.toLowerCase()));
  const residents = record.dreamcallerIds.map((id) => ({
    id,
    option: byId.get(id.toLowerCase()) ?? null,
  }));
  const candidates = candidateOptions(
    dreamcallers,
    residentIds,
    regionNameByDreamcaller,
    record.name,
  );

  const count = record.dreamcallerIds.length;
  const canRemove = count > MIN_RESIDENTS;
  const canAdd = count < MAX_RESIDENTS;
  const thumb = THUMB_SIZE[size];

  return (
    <div data-dreamscape-residents={record.id}>
      <span style={labelStyle}>
        Resident Dreamcallers ({count}/{MAX_RESIDENTS})
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {residents.map((resident) => (
          <div
            key={resident.id}
            data-resident-id={resident.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#0f1a1d",
              border: "1px solid rgba(142, 219, 209, 0.16)",
              borderRadius: "10px",
              padding: "6px",
            }}
          >
            {resident.option !== null ? (
              <div style={{ flex: "0 0 auto", cursor: "help" }}>
                <HoverPopover
                  placement="left"
                  delayMs={150}
                  maxWidthPx={null}
                  content={<DreamcallerPopover dreamcaller={resident.option} />}
                >
                  <DreamcallerPortrait
                    dreamcaller={resident.option}
                    variant="thumb"
                    style={{ width: `${String(thumb)}px`, height: `${String(thumb)}px` }}
                  />
                </HoverPopover>
              </div>
            ) : (
              <span
                style={{
                  width: `${String(thumb)}px`,
                  height: `${String(thumb)}px`,
                  flex: "0 0 auto",
                  borderRadius: "10px",
                  background: "#2a1414",
                }}
              />
            )}

            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.84rem",
                  fontWeight: 700,
                  color: "#fff7e0",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {resident.option?.name ?? "Unknown Dreamcaller"}
              </div>
              {resident.option !== null && resident.option.title !== "" ? (
                <div
                  style={{
                    fontSize: "0.7rem",
                    fontStyle: "italic",
                    color: "#9fb0aa",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {resident.option.title}
                </div>
              ) : null}

              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                <select
                  aria-label={`Replace ${resident.option?.name ?? resident.id}`}
                  value=""
                  disabled={status.pending}
                  onChange={(event) => {
                    const inId = event.currentTarget.value;
                    if (inId !== "") {
                      onAssign("replace", { outId: resident.id, inId });
                    }
                  }}
                  style={{ ...controlStyle, flex: "1 1 auto", minWidth: 0 }}
                >
                  <option value="" disabled>
                    Replace with…
                  </option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  aria-label={`Remove ${resident.option?.name ?? resident.id}`}
                  title={
                    canRemove
                      ? "Send this Dreamcaller to the unassigned pool"
                      : `A region must keep at least ${String(MIN_RESIDENTS)} Dreamcallers`
                  }
                  disabled={!canRemove || status.pending}
                  onClick={() => onAssign("remove", { outId: resident.id })}
                  style={{
                    ...controlStyle,
                    flex: "0 0 auto",
                    padding: "4px 9px",
                    opacity: canRemove && !status.pending ? 1 : 0.4,
                    cursor: canRemove && !status.pending ? "pointer" : "not-allowed",
                    color: "#f7c9bd",
                    borderColor: "rgba(247, 201, 189, 0.4)",
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "8px" }}>
        <select
          aria-label={`Add a resident to ${record.name}`}
          value=""
          disabled={!canAdd || status.pending || candidates.length === 0}
          onChange={(event) => {
            const inId = event.currentTarget.value;
            if (inId !== "") {
              onAssign("add", { inId });
            }
          }}
          style={{
            ...controlStyle,
            width: "100%",
            opacity: canAdd && !status.pending ? 1 : 0.5,
            cursor: canAdd && !status.pending ? "pointer" : "not-allowed",
          }}
        >
          <option value="" disabled>
            {canAdd ? "+ Add resident…" : `Region is full (${String(MAX_RESIDENTS)})`}
          </option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
      </div>

      {status.pending ? (
        <p style={{ margin: "6px 0 0", fontSize: "0.72rem", color: "#8edbd1" }}>Saving…</p>
      ) : null}
      {status.message !== null ? (
        <p style={{ margin: "6px 0 0", fontSize: "0.72rem", color: "#f7c9bd" }}>{status.message}</p>
      ) : null}
    </div>
  );
}
