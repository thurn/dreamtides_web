import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CardData } from "../types/cards";
import type { CardSizePreset } from "./card-size";
import { loadCardsV2Database } from "../data/cards-v2-database";
import TidesListView from "./TidesListView";
import TidesDetailView, { type TideSaveStatus } from "./TidesDetailView";
import { loadTidesArtifact, saveTideField } from "./tides-editor-api";
import {
  isPushedTidesEditorEntry,
  parseTidesEditorUrlState,
  pushTidesEditorUrlState,
  replaceTidesEditorUrlState,
  type TidesEditorUrlState,
} from "./tides-editor-url-state";
import type {
  EditableTideField,
  EditorDreamAvatar,
  TidesArtifact,
  TidesEditorApiClient,
} from "./tides-types";

const DEFAULT_TIDES_API_CLIENT: TidesEditorApiClient = {
  loadTidesArtifact,
  saveTideField,
};

type LoadStatus =
  | { kind: "loading" }
  | {
      kind: "loaded";
      artifact: TidesArtifact;
      cardById: ReadonlyMap<string, CardData>;
      dreamAvatarById: ReadonlyMap<string, EditorDreamAvatar>;
    }
  | { kind: "error"; message: string };

export interface TidesEditorAppProps {
  apiClient?: TidesEditorApiClient;
}

function errorMessageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load tides.";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Build a UUID-keyed (lowercased) card index from the v2 card database. */
function buildCardById(database: Map<number, CardData>): Map<string, CardData> {
  const byId = new Map<string, CardData>();
  for (const card of database.values()) byId.set(card.id.toLowerCase(), card);
  return byId;
}

async function loadDreamAvatarById(
  signal?: AbortSignal,
): Promise<Map<string, EditorDreamAvatar>> {
  const response = await fetch("/dream-avatars-v2-data.json", { signal });
  const byId = new Map<string, EditorDreamAvatar>();
  if (!response.ok) return byId;
  const dreamAvatars = (await response.json()) as EditorDreamAvatar[];
  for (const dreamAvatar of dreamAvatars) {
    byId.set(dreamAvatar.id.toLowerCase(), dreamAvatar);
  }
  return byId;
}

export default function TidesEditorApp({
  apiClient = DEFAULT_TIDES_API_CLIENT,
}: TidesEditorAppProps) {
  const [urlState, setUrlState] = useState<TidesEditorUrlState>(() =>
    parseTidesEditorUrlState(window.location.search),
  );
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveStatus, setSaveStatus] = useState<TideSaveStatus>({ status: "idle" });

  const file = urlState.file;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      setLoadStatus({ kind: "loading" });
      try {
        const [artifact, cardDatabase, dreamAvatarById] = await Promise.all([
          apiClient.loadTidesArtifact(file, controller.signal),
          loadCardsV2Database(),
          loadDreamAvatarById(controller.signal),
        ]);
        if (cancelled) return;
        console.info(
          `[tides-editor] loaded ${file}: ${artifact.tides.length} tides, ` +
            `${cardDatabase.size} cards, ${dreamAvatarById.size} avatars.`,
        );
        setLoadStatus({
          kind: "loaded",
          artifact,
          cardById: buildCardById(cardDatabase),
          dreamAvatarById,
        });
      } catch (error) {
        if (isAbortError(error) || cancelled) return;
        setLoadStatus({ kind: "error", message: errorMessageFor(error) });
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiClient, file, loadAttempt]);

  // Keep the view in sync with browser Back/Forward navigation.
  useEffect(() => {
    function handlePopState() {
      setUrlState(parseTidesEditorUrlState(window.location.search));
    }
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const tides = loadStatus.kind === "loaded" ? loadStatus.artifact.tides : [];
  const selectedTide = useMemo(
    () =>
      urlState.tideId === null
        ? null
        : (tides.find((tide) => tide.id === urlState.tideId) ?? null),
    [tides, urlState.tideId],
  );

  const handleSelectTide = useCallback(
    (tideId: string) => {
      const next = { ...urlState, tideId };
      setUrlState(next);
      setSaveStatus({ status: "idle" });
      pushTidesEditorUrlState(next);
    },
    [urlState],
  );

  const handleBack = useCallback(() => {
    if (isPushedTidesEditorEntry()) {
      window.history.back();
    } else {
      const next = { ...urlState, tideId: null };
      setUrlState(next);
      replaceTidesEditorUrlState(next);
    }
  }, [urlState]);

  const handleSizeChange = useCallback(
    (size: CardSizePreset) => {
      const next = { ...urlState, size };
      setUrlState(next);
      replaceTidesEditorUrlState(next);
    },
    [urlState],
  );

  const saveSeqRef = useRef(0);
  const handleSaveField = useCallback(
    (field: EditableTideField, value: string) => {
      const tideId = urlState.tideId;
      if (tideId === null) return;
      const seq = (saveSeqRef.current += 1);
      setSaveStatus({ status: "saving" });
      apiClient
        .saveTideField({ file, id: tideId, field, value })
        .then((response) => {
          if (seq !== saveSeqRef.current) return;
          console.info(`[tides-editor] saved ${file} ${tideId}.${field}.`);
          setLoadStatus((current) => {
            if (current.kind !== "loaded") return current;
            return {
              ...current,
              artifact: {
                ...current.artifact,
                tides: current.artifact.tides.map((tide) =>
                  tide.id === response.tide.id ? response.tide : tide,
                ),
              },
            };
          });
          setSaveStatus({ status: "saved" });
        })
        .catch((error: unknown) => {
          if (seq !== saveSeqRef.current) return;
          const message = errorMessageFor(error);
          console.warn(`[tides-editor] save failed ${file} ${tideId}.${field}: ${message}`);
          setSaveStatus({ status: "error", message });
        });
    },
    [apiClient, file, urlState.tideId],
  );

  return (
    <main
      aria-busy={loadStatus.kind === "loading"}
      style={{
        height: "100dvh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: "16px 20px",
        background: "#101417",
        color: "#f7f1df",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", gap: 10, flex: "0 0 auto" }}>
        <h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.1 }}>
          Tides Editor
        </h1>
        <span aria-hidden="true" style={{ color: "rgba(247, 241, 223, 0.35)" }}>
          -
        </span>
        <span style={{ color: "#8edbd1", fontSize: "0.82rem", fontWeight: 600 }}>
          {`${file}.jsonc`}
        </span>
      </header>

      <section
        style={{
          display: "flex",
          flex: "1 1 auto",
          flexDirection: "column",
          minHeight: 0,
          paddingTop: 12,
        }}
      >
        {loadStatus.kind === "loading" ? (
          <p role="status" style={{ margin: 0, color: "#c9d3cf" }}>
            Loading tides…
          </p>
        ) : null}

        {loadStatus.kind === "error" ? (
          <div role="alert" style={{ maxWidth: 560 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>Unable to load tides</h2>
            <p style={{ margin: "0 0 18px", color: "#f0c6bd" }}>{loadStatus.message}</p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              style={{
                border: "1px solid rgba(247, 241, 223, 0.35)",
                background: "#1f635d",
                color: "#fff7e0",
                borderRadius: 6,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        ) : null}

        {loadStatus.kind === "loaded" && selectedTide !== null ? (
          <TidesDetailView
            key={selectedTide.id}
            tide={selectedTide}
            dreamAvatarById={loadStatus.dreamAvatarById}
            cardById={loadStatus.cardById}
            size={urlState.size}
            saveStatus={saveStatus}
            onSizeChange={handleSizeChange}
            onSaveField={handleSaveField}
            onBack={handleBack}
          />
        ) : null}

        {loadStatus.kind === "loaded" && selectedTide === null && urlState.tideId === null ? (
          <TidesListView
            tides={loadStatus.artifact.tides}
            dreamAvatarById={loadStatus.dreamAvatarById}
            cardById={loadStatus.cardById}
            onSelectTide={handleSelectTide}
          />
        ) : null}

        {loadStatus.kind === "loaded" && selectedTide === null && urlState.tideId !== null ? (
          <div style={{ marginTop: 12 }}>
            <p role="status" style={{ color: "#f0c6bd" }}>
              {`Tide "${urlState.tideId}" was not found in ${file}.jsonc.`}
            </p>
            <button
              type="button"
              onClick={handleBack}
              style={{
                marginTop: 8,
                border: "1px solid rgba(247, 241, 223, 0.25)",
                background: "#1f635d",
                color: "#fff7e0",
                borderRadius: 8,
                padding: "8px 12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              All tides
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
