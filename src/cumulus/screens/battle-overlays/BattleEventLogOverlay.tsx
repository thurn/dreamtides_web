import { useEffect, useRef, type ReactElement } from "react";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { token } from "../../primitives/tokens";

/** One line of the battle log. */
export interface BattleEventLogLineView {
  readonly key: string;
  readonly text: string;
}

/** One turn of the battle log, with its heading. */
export interface BattleEventLogTurnView {
  readonly turnNumber: number;
  readonly heading: string;
  readonly lines: readonly BattleEventLogLineView[];
}

export interface BattleEventLogOverlayProps {
  readonly title: string;
  readonly subtitle: string;
  readonly closeLabel: string;
  /** Shown when the log has no lines yet. */
  readonly emptyText: string;
  readonly turns: readonly BattleEventLogTurnView[];
  readonly onClose: () => void;
}

/** Caps the log's height so a long battle scrolls inside the dialog. */
const LOG_MAX_HEIGHT = "58vh";

/**
 * The player's battle log: what has happened this battle, one plain line per
 * event, grouped by turn, scrolled to the newest line.
 */
export function BattleEventLogOverlay({
  title,
  subtitle,
  closeLabel,
  emptyText,
  turns,
  onClose,
}: BattleEventLogOverlayProps): ReactElement {
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [turns]);
  return (
    <GlassDialog title={title} subtitle={subtitle} closeLabel={closeLabel} onClose={onClose} desktopCenterTarget="battlefield">
      <div
        ref={listRef}
        className="cumulus"
        data-battle-event-log=""
        style={{ display: "grid", gap: token("--space-m"), maxHeight: LOG_MAX_HEIGHT, overflowY: "auto" }}
      >
        {turns.length === 0 ? (
          <p style={{ margin: 0, color: token("--text-on-glass-muted"), font: token("--t-body") }}>{emptyText}</p>
        ) : (
          turns.map((turn, index) => (
            <section
              key={`${String(turn.turnNumber)}:${String(index)}`}
              data-battle-event-log-turn={turn.turnNumber}
              style={{ display: "grid", gap: token("--space-xs") }}
            >
              <h3 style={{ margin: 0, color: token("--text-on-glass"), font: token("--t-eyebrow") }}>{turn.heading}</h3>
              {turn.lines.map((line) => (
                <p
                  key={line.key}
                  data-battle-event-log-line=""
                  style={{ margin: 0, color: token("--text-on-glass-muted"), font: token("--t-body-sm") }}
                >
                  {line.text}
                </p>
              ))}
            </section>
          ))
        )}
      </div>
    </GlassDialog>
  );
}
