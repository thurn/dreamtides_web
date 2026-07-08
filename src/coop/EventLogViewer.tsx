import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Database } from "firebase/database";
import type { LogNode } from "../eventlog/types";
import { subscribeToLog } from "../eventlog/subscribe";
import { readRoomLogLines } from "./quest-log-sink";

interface EventLogViewerProps {
  db: Database;
  gameId: string;
}

interface EventRow {
  seq: number;
  type: string;
  actor: string;
  /** Outcome cross-referenced from the JSONL sink's `coop_event` lines. */
  outcome: string;
}

/**
 * Read-only viewer for a room's event log, reached via `?viewLogs=<roomId>`.
 * Shows two things:
 *
 *  1. The DECODED event log (seq, type, actor, outcome) folded from
 *     `rooms/{id}/log` via `subscribeToLog`. Outcome is not stored on the log
 *     node (it is a fold product), so it is cross-referenced from the JSONL
 *     sink's `coop_event` lines when present.
 *  2. The raw JSONL sink at `rooms/{id}/logs`, with a substring filter and a
 *     download button so a production run can be inspected after the playing
 *     tab has closed.
 */
export function EventLogViewer({ db, gameId }: EventLogViewerProps): ReactNode {
  const [node, setNode] = useState<LogNode | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [linesStatus, setLinesStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [linesError, setLinesError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  // Live-decoded event log.
  useEffect(() => {
    return subscribeToLog(db, gameId, (next) => {
      setNode(next);
    });
  }, [db, gameId]);

  // Raw JSONL sink (read on demand / reload).
  useEffect(() => {
    let cancelled = false;
    setLinesStatus("loading");
    void readRoomLogLines(db, gameId)
      .then((result) => {
        if (!cancelled) {
          setLines(result);
          setLinesStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLinesError(error instanceof Error ? error.message : "Failed to read log.");
          setLinesStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db, gameId, reloadToken]);

  // seq -> outcome, parsed from the JSONL sink's coop_event lines.
  const outcomeBySeq = useMemo(() => {
    const map = new Map<number, string>();
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as {
          event?: unknown;
          seq?: unknown;
          outcome?: unknown;
        };
        if (
          parsed.event === "coop_event" &&
          typeof parsed.seq === "number" &&
          typeof parsed.outcome === "string"
        ) {
          map.set(parsed.seq, parsed.outcome);
        }
      } catch {
        // Skip an unparseable line rather than failing the whole cross-reference.
      }
    }
    return map;
  }, [lines]);

  const eventRows = useMemo<EventRow[]>(() => {
    if (node === null) {
      return [];
    }
    return Array.from(node.events.entries())
      .sort(([leftSeq], [rightSeq]) => leftSeq - rightSeq)
      .map(([seq, event]) => ({
        seq,
        type: event.type,
        actor: event.actor,
        outcome: outcomeBySeq.get(seq) ?? "-",
      }));
  }, [node, outcomeBySeq]);

  const filteredLines = useMemo(() => {
    const trimmed = filter.trim().toLowerCase();
    if (trimmed === "") {
      return lines;
    }
    return lines.filter((line) => line.toLowerCase().includes(trimmed));
  }, [lines, filter]);

  const handleReload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const handleDownload = useCallback(() => {
    const content = lines.join("\n") + (lines.length > 0 ? "\n" : "");
    const blob = new Blob([content], { type: "application/x-jsonlines" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `quest-log-${gameId}.jsonl`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [lines, gameId]);

  return (
    <main
      className="flex min-h-screen flex-col gap-4 p-4"
      style={{ background: "#0a0612", color: "#e2e8f0" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold" style={{ color: "#c084fc" }}>
          Event log: <span className="font-mono">{gameId}</span>
        </h1>
        <span className="text-sm" style={{ color: "#94a3b8" }}>
          {node === null
            ? "waiting for log..."
            : `head ${node.head} · base ${node.baseSeq} · ${eventRows.length} events`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
            placeholder="Filter JSONL (substring)"
            className="rounded-md px-2 py-1 text-sm"
            style={{
              background: "rgba(30, 18, 48, 0.85)",
              border: "1px solid rgba(124, 58, 237, 0.5)",
              color: "#e2e8f0",
              minWidth: "14rem",
            }}
          />
          <ToolbarButton onClick={handleReload} label="Reload" />
          <ToolbarButton
            onClick={handleDownload}
            label="Download .jsonl"
            disabled={lines.length === 0}
          />
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>
          Decoded event log
        </h2>
        {eventRows.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No events folded yet.</p>
        ) : (
          <div
            className="overflow-auto rounded-lg"
            style={{ border: "1px solid rgba(124, 58, 237, 0.25)", maxHeight: "40vh" }}
          >
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr style={{ color: "#94a3b8", textAlign: "left" }}>
                  <th className="px-2 py-1">seq</th>
                  <th className="px-2 py-1">type</th>
                  <th className="px-2 py-1">actor</th>
                  <th className="px-2 py-1">outcome</th>
                </tr>
              </thead>
              <tbody>
                {eventRows.map((row) => (
                  <tr key={row.seq} style={{ borderTop: "1px solid rgba(124, 58, 237, 0.15)" }}>
                    <td className="px-2 py-1">{row.seq}</td>
                    <td className="px-2 py-1">{row.type}</td>
                    <td className="px-2 py-1">{row.actor}</td>
                    <td
                      className="px-2 py-1"
                      style={{ color: row.outcome === "bounced" ? "#fca5a5" : "#e2e8f0" }}
                    >
                      {row.outcome}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>
          Raw JSONL sink{" "}
          <span style={{ color: "#64748b" }}>
            ({filteredLines.length}/{lines.length})
          </span>
        </h2>
        {linesStatus === "loading" && <p style={{ color: "#94a3b8" }}>Loading sink...</p>}
        {linesStatus === "error" && (
          <div
            role="alert"
            className="rounded-lg p-4"
            style={{
              background: "rgba(127, 29, 29, 0.3)",
              border: "1px solid rgba(248, 113, 113, 0.5)",
              color: "#fca5a5",
            }}
          >
            <p className="font-mono text-sm">{linesError}</p>
          </div>
        )}
        {linesStatus === "ready" && lines.length === 0 && (
          <p style={{ color: "#94a3b8" }}>
            No JSONL entries are stored for &ldquo;{gameId}&rdquo;.
          </p>
        )}
        {linesStatus === "ready" && lines.length > 0 && (
          <pre
            className="flex-1 overflow-auto rounded-lg p-3 font-mono text-xs leading-relaxed"
            style={{
              background: "rgba(0, 0, 0, 0.4)",
              border: "1px solid rgba(124, 58, 237, 0.25)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {filteredLines.join("\n")}
          </pre>
        )}
      </section>
    </main>
  );
}

function ToolbarButton({
  onClick,
  label,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: "rgba(124, 58, 237, 0.25)",
        border: "1px solid rgba(124, 58, 237, 0.5)",
        color: "#e2e8f0",
      }}
    >
      {label}
    </button>
  );
}
