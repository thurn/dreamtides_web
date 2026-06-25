import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Database } from "firebase/database";
import type { LogEntry } from "../logging";
import type { DatabaseMode } from "../runtime/runtime-config";
import { readRoomLog } from "./room-log-service";

interface RoomLogViewerProps {
  database: Database;
  gameId: string;
  databaseMode: DatabaseMode;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; entries: ReadonlyArray<Readonly<LogEntry>> }
  | { status: "error"; message: string };

/**
 * Read-only viewer for a room's persisted quest log, reached via
 * `?viewLogs=<roomId>`. Reads `rooms/<roomId>/logs` once from Realtime Database
 * and renders the entries as JSONL, with a substring filter and a download
 * button so a production run can be inspected after the playing tab has closed.
 */
export function RoomLogViewer({
  database,
  gameId,
  databaseMode,
}: RoomLogViewerProps): ReactNode {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [filter, setFilter] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void readRoomLog(database, gameId)
      .then((entries) => {
        if (!cancelled) {
          setState({ status: "ready", entries });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Failed to read log.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [database, gameId, reloadToken]);

  const allLines = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }
    return state.entries.map((entry) => JSON.stringify(entry));
  }, [state]);

  const filteredLines = useMemo(() => {
    const trimmed = filter.trim().toLowerCase();
    if (trimmed === "") {
      return allLines;
    }
    return allLines.filter((line) => line.toLowerCase().includes(trimmed));
  }, [allLines, filter]);

  const handleReload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const handleDownload = useCallback(() => {
    const content = allLines.join("\n") + (allLines.length > 0 ? "\n" : "");
    const blob = new Blob([content], { type: "application/x-jsonlines" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `quest-log-${gameId}.jsonl`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [allLines, gameId]);

  return (
    <main
      className="flex min-h-screen flex-col p-4"
      style={{ background: "#0a0612", color: "#e2e8f0" }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold" style={{ color: "#c084fc" }}>
          Quest log: <span className="font-mono">{gameId}</span>
        </h1>
        <span className="text-sm" style={{ color: "#94a3b8" }}>
          {state.status === "ready"
            ? `${filteredLines.length}/${allLines.length} entries`
            : databaseMode === "emulator"
              ? "emulator"
              : "realtime"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
            placeholder="Filter (substring)"
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
            disabled={allLines.length === 0}
          />
        </div>
      </div>

      {state.status === "loading" && (
        <p style={{ color: "#94a3b8" }}>Loading log for {gameId}...</p>
      )}

      {state.status === "error" && (
        <div
          role="alert"
          className="rounded-lg p-4"
          style={{
            background: "rgba(127, 29, 29, 0.3)",
            border: "1px solid rgba(248, 113, 113, 0.5)",
            color: "#fca5a5",
          }}
        >
          <p className="font-mono text-sm">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && allLines.length === 0 && (
        <p style={{ color: "#94a3b8" }}>
          No log entries are stored for &ldquo;{gameId}&rdquo;. The game may not
          exist, or it was played before logs were persisted.
        </p>
      )}

      {state.status === "ready" && allLines.length > 0 && (
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
