import { useCallback, useState, type ReactNode } from "react";
import type { Database } from "firebase/database";
import type { ContentConfig } from "../eventlog/types";
import { createAndNavigateToRoom } from "./RoomGate";

interface UnreadableRoomScreenProps {
  db: Database;
  /** Content config pinned into the fresh room this screen creates. */
  contentConfig: ContentConfig;
}

/**
 * Terminal read-only screen shown when a room's log node is UNREADABLE — its
 * genesis or `baseSnapshot` string failed to decode, so the fold has no
 * foundation (`decodeLogNode` returned null). The broken room is left
 * untouched: this build cannot safely fold it, so the only action offered is
 * starting a fresh room on the current build. Mirrors {@link VersionGateScreen}.
 *
 * See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
 * §"Error handling and safety rails" (Malformed log entries).
 */
export function UnreadableRoomScreen({ db, contentConfig }: UnreadableRoomScreenProps): ReactNode {
  const [status, setStatus] = useState<"idle" | "creating" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleStartNewGame = useCallback(() => {
    setStatus("creating");
    setMessage(null);
    void createAndNavigateToRoom(db, contentConfig)
      .then(() => {
        // Full reload so the fresh `?game=<id>` boots the gate from scratch.
        window.location.reload();
      })
      .catch((error: unknown) => {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Failed to create a new game.");
      });
  }, [db, contentConfig]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div
        data-unreadable-room="true"
        className="flex w-full max-w-lg flex-col items-center gap-6 rounded-2xl p-8 text-center"
        style={{
          background: "rgba(20, 12, 32, 0.9)",
          border: "1px solid rgba(124, 58, 237, 0.4)",
        }}
      >
        <h1 className="text-2xl font-semibold" style={{ color: "#c084fc" }}>
          This game could not be read
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "#e2e8f0" }}>
          This game&rsquo;s data is corrupted and can no longer be loaded. Start
          a new game to keep playing.
        </p>
        <button
          data-start-new-game="true"
          type="button"
          onClick={handleStartNewGame}
          disabled={status === "creating"}
          className="cursor-pointer rounded-xl px-8 py-3 text-lg font-semibold tracking-wide transition-all duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 55%, #c084fc 100%)",
            color: "#ffffff",
            border: "2px solid rgba(192, 132, 252, 0.6)",
            boxShadow: "0 8px 24px rgba(124, 58, 237, 0.4)",
          }}
        >
          {status === "creating" ? "Starting..." : "Start a New Game"}
        </button>
        {message !== null && (
          <p role="alert" className="text-sm" style={{ color: "#fca5a5" }}>
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
