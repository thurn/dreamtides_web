import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuest } from "../state/quest-context";
import QuestDebugDeckSection from "./QuestDebugDeckSection";

const SOURCE = "quest_debug_editor";

const FIELD_LABEL_STYLE = {
  display: "block",
  fontSize: "0.74rem",
  fontWeight: 700,
  color: "rgba(247, 241, 223, 0.6)",
  marginBottom: 4,
} as const;

const TEXT_INPUT_STYLE = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(247, 241, 223, 0.2)",
  background: "#0e1215",
  color: "#f7f1df",
  fontSize: "0.9rem",
} as const;

/** A titled card container matching the debug overlay visual style. */
function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="space-y-2 rounded-lg p-3"
      style={{
        background: "rgba(0, 0, 0, 0.3)",
        border: "1px solid rgba(124, 58, 237, 0.15)",
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: "#a855f7" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

/** A number input that commits on blur and on Enter, ignoring NaN. */
function NumberField({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  onCommit?: (value: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string>(String(value));

  // Keep the input in sync if the upstream value changes (e.g. another edit).
  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit() {
    if (onCommit === undefined) return;
    const parsed = Number(text);
    if (text.trim() === "" || Number.isNaN(parsed)) {
      setText(String(value));
      return;
    }
    onCommit(parsed);
  }

  return (
    <div style={{ minWidth: 120, flex: "1 1 140px" }}>
      <label style={FIELD_LABEL_STYLE}>{label}</label>
      <input
        type="number"
        value={text}
        disabled={disabled || onCommit === undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        style={{
          ...TEXT_INPUT_STYLE,
          opacity: disabled || onCommit === undefined ? 0.5 : 1,
        }}
      />
    </div>
  );
}

/** Add-dreamsign search picker over the dreamsign templates. */
function DreamsignPicker({ disabled }: { disabled: boolean }) {
  const { questContent, mutations } = useQuest();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === "") return [];
    return questContent.dreamsignTemplates.filter(
      (template) =>
        template.name.toLowerCase().includes(trimmed) ||
        template.id.toLowerCase().includes(trimmed),
    );
  }, [questContent.dreamsignTemplates, query]);

  return (
    <div>
      <label style={FIELD_LABEL_STYLE}>Add dreamsign</label>
      <input
        type="text"
        value={query}
        placeholder="Search by name or id"
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        style={{ ...TEXT_INPUT_STYLE, opacity: disabled ? 0.5 : 1 }}
      />
      {disabled && (
        <p className="mt-1 text-[11px] opacity-60" style={{ color: "#fca5a5" }}>
          Dreamsign cap reached; remove one before adding more.
        </p>
      )}
      {!disabled && matches.length > 0 && (
        <div className="mt-2 space-y-1">
          {matches.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() =>
                mutations.addDreamsign(
                  {
                    id: template.id,
                    name: template.name,
                    effectDescription: template.effectDescription,
                    imageName: template.imageName,
                    imageAlt: template.imageAlt,
                    isBane: false,
                  },
                  SOURCE,
                )
              }
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-left"
              style={{
                background: "rgba(168, 85, 247, 0.08)",
                border: "1px solid rgba(168, 85, 247, 0.18)",
              }}
            >
              <span
                className="min-w-0 flex-1 truncate text-sm"
                style={{ color: "#e2e8f0" }}
              >
                {template.name}
              </span>
              <span className="shrink-0 text-[10px] opacity-50">add</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Full-screen debug overlay for editing live quest state. */
export default function QuestDebugEditor({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { state, mutations } = useQuest();

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  const atCap = state.dreamsigns.length >= state.maxDreamsigns;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="quest-debug-editor-backdrop"
          className="fixed inset-0 z-[60] flex flex-col"
          style={{ backgroundColor: "rgba(5, 2, 10, 0.95)" }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.3 }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 md:px-6"
            style={{
              borderBottom: "1px solid rgba(124, 58, 237, 0.3)",
              background:
                "linear-gradient(180deg, rgba(10, 6, 18, 0.95) 0%, rgba(10, 6, 18, 0.8) 100%)",
            }}
          >
            <h2
              className="text-lg font-bold md:text-xl"
              style={{ color: "#e2e8f0" }}
            >
              Edit Quest State (debug)
            </h2>
            <button
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-lg transition-colors"
              style={{ background: "rgba(255, 255, 255, 0.1)", color: "#e2e8f0" }}
              onClick={handleClose}
              aria-label="Close quest debug editor"
            >
              {"✕"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
            <div className="mx-auto max-w-4xl space-y-4">
              <InfoCard title="Resources">
                <div className="flex flex-wrap gap-3">
                  <NumberField
                    label="Essence"
                    value={state.essence}
                    onCommit={(n) => mutations.setEssence(n, SOURCE)}
                  />
                  <NumberField
                    label="Essence cap"
                    value={state.essenceCap}
                    onCommit={
                      mutations.setEssenceCap
                        ? (n) => mutations.setEssenceCap?.(n, SOURCE)
                        : undefined
                    }
                  />
                  <NumberField
                    label="Max dreamsigns"
                    value={state.maxDreamsigns}
                    onCommit={
                      mutations.setMaxDreamsigns
                        ? (n) => mutations.setMaxDreamsigns?.(n, SOURCE)
                        : undefined
                    }
                  />
                  <NumberField
                    label="Completion level"
                    value={state.completionLevel}
                    onCommit={
                      mutations.setCompletionLevel
                        ? (n) => mutations.setCompletionLevel?.(n, SOURCE)
                        : undefined
                    }
                  />
                </div>
              </InfoCard>

              <InfoCard title="Dreamsigns">
                <p className="text-[11px] opacity-60">
                  {state.dreamsigns.length} / {state.maxDreamsigns}
                </p>
                {state.dreamsigns.length === 0 ? (
                  <p className="text-sm opacity-50">No dreamsigns yet.</p>
                ) : (
                  <div className="space-y-1">
                    {state.dreamsigns.map((dreamsign, index) => (
                      <div
                        // Dreamsigns are positional; index is the stable key
                        // and the mutation address used by the live provider.
                        key={index}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1"
                        style={{
                          background: "rgba(168, 85, 247, 0.08)",
                          border: "1px solid rgba(168, 85, 247, 0.18)",
                        }}
                      >
                        <span
                          className="min-w-0 flex-1 truncate text-sm"
                          style={{ color: "#e2e8f0" }}
                        >
                          {dreamsign.name}
                          {dreamsign.isBane && (
                            <span
                              className="ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                              style={{
                                background: "rgba(127, 29, 29, 0.4)",
                                color: "#fecaca",
                              }}
                            >
                              bane
                            </span>
                          )}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {mutations.setDreamsignIsBane && (
                            <button
                              type="button"
                              onClick={() =>
                                mutations.setDreamsignIsBane?.(
                                  index,
                                  !dreamsign.isBane,
                                  SOURCE,
                                )
                              }
                              className="cursor-pointer rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                              style={{
                                background: "rgba(124, 58, 237, 0.3)",
                                color: "#e9d5ff",
                                border: "1px solid rgba(168, 85, 247, 0.4)",
                              }}
                            >
                              {dreamsign.isBane ? "Unbane" : "Bane"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              mutations.removeDreamsign(index, SOURCE)
                            }
                            aria-label={`Remove dreamsign ${dreamsign.name}`}
                            className="cursor-pointer rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                            style={{
                              background: "rgba(127, 29, 29, 0.4)",
                              color: "#fecaca",
                              border: "1px solid rgba(239, 68, 68, 0.4)",
                            }}
                          >
                            {"✕"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <DreamsignPicker disabled={atCap} />
              </InfoCard>

              <InfoCard title="Deck">
                <QuestDebugDeckSection />
              </InfoCard>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
