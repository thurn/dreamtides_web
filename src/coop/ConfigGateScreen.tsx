import { useCallback, type ReactNode } from "react";
import type { ContentConfig } from "../eventlog/types";
import { applyContentConfigToSearch } from "../runtime/runtime-config";

interface ConfigGateScreenProps {
  /** The content config pinned in the room's genesis, or undefined if the genesis predates config pinning. */
  roomContentConfig: ContentConfig | undefined;
  /** This client's local content config, shown alongside the room's for context. */
  localContentConfig: ContentConfig;
}

/**
 * Read-only screen shown when a room's genesis `contentConfig` does not match
 * this client's local runtime config. Both players must fold the same content
 * (draft pool and draft mode), so a client whose `?algo=` params differ cannot
 * safely join. The single action rewrites this tab's query
 * string to the room's pinned content params (preserving `?game=<id>`) and
 * reloads, so the client adopts the room's config and joins.
 *
 * See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
 * §"Error handling and safety rails" — the config gate mirrors the version
 * gate's read-only + reload pattern.
 */
export function ConfigGateScreen({
  roomContentConfig,
  localContentConfig,
}: ConfigGateScreenProps): ReactNode {
  const canAdopt = roomContentConfig !== undefined;

  const handleUseRoomSettings = useCallback(() => {
    if (roomContentConfig === undefined) {
      return;
    }
    const nextSearch = applyContentConfigToSearch(window.location.search, roomContentConfig);
    // Full reload so the app re-parses the adopted params and folds the room's
    // content from scratch.
    window.location.search = nextSearch;
  }, [roomContentConfig]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div
        data-config-gate="true"
        className="flex w-full max-w-lg flex-col items-center gap-6 rounded-2xl p-8 text-center"
        style={{
          background: "rgba(20, 12, 32, 0.9)",
          border: "1px solid rgba(124, 58, 237, 0.4)",
        }}
      >
        <h1 className="text-2xl font-semibold" style={{ color: "#c084fc" }}>
          This game uses different settings
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "#e2e8f0" }}>
          This game was created with different content settings than your current
          ones. Both players must use the same settings to play together.
        </p>
        <ConfigComparison roomContentConfig={roomContentConfig} localContentConfig={localContentConfig} />
        <button
          data-use-room-settings="true"
          type="button"
          onClick={handleUseRoomSettings}
          disabled={!canAdopt}
          className="cursor-pointer rounded-xl px-8 py-3 text-lg font-semibold tracking-wide transition-all duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 55%, #c084fc 100%)",
            color: "#ffffff",
            border: "2px solid rgba(192, 132, 252, 0.6)",
            boxShadow: "0 8px 24px rgba(124, 58, 237, 0.4)",
          }}
        >
          Use this game&rsquo;s settings
        </button>
        {!canAdopt && (
          <p role="alert" className="text-sm" style={{ color: "#fca5a5" }}>
            This game was created by an older version and can no longer be joined.
          </p>
        )}
      </div>
    </main>
  );
}

function ConfigComparison({
  roomContentConfig,
  localContentConfig,
}: {
  roomContentConfig: ContentConfig | undefined;
  localContentConfig: ContentConfig;
}): ReactNode {
  return (
    <dl
      className="grid w-full grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-1 text-left text-sm"
      style={{ color: "#cbd5f5" }}
    >
      <span aria-hidden />
      <span className="font-semibold uppercase tracking-wider opacity-60">This game</span>
      <span className="font-semibold uppercase tracking-wider opacity-60">Yours</span>
      {describeConfig(roomContentConfig).map(([label, roomValue], index) => (
        <ConfigRow
          key={label}
          label={label}
          roomValue={roomValue}
          localValue={describeConfig(localContentConfig)[index][1]}
        />
      ))}
    </dl>
  );
}

function ConfigRow({
  label,
  roomValue,
  localValue,
}: {
  label: string;
  roomValue: string;
  localValue: string;
}): ReactNode {
  const differs = roomValue !== localValue;
  return (
    <>
      <dt className="opacity-70">{label}</dt>
      <dd style={{ color: differs ? "#fca5a5" : undefined }}>{roomValue}</dd>
      <dd style={{ color: differs ? "#fca5a5" : undefined }}>{localValue}</dd>
    </>
  );
}

/** Renders a content config (or its absence) as ordered [label, value] rows. */
function describeConfig(config: ContentConfig | undefined): Array<[string, string]> {
  if (config === undefined) {
    return [
      ["Pool", "—"],
      ["Draft", "—"],
      ["Pack size", "—"],
    ];
  }
  return [
    ["Pool", config.poolVariant],
    ["Draft", config.draftMode],
    ["Pack size", config.fresh20PackSize === null ? "default" : String(config.fresh20PackSize)],
  ];
}
