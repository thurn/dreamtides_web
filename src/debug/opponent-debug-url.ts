/** The opponent-deck algorithm a generation is viewed through. */
export type OpponentDebugAlgo = "coherent" | "corpus";

/**
 * The parameters that fully determine one opponent generation in the
 * `/opponent` debug tool. The `completionLevel` / `dreamscapeId` / `nonce`
 * triple derives the battle seed (the generation is deterministic in them, so
 * it is reproducible from them alone). `algo` selects the deck-building
 * algorithm the same generation is viewed through — a separate, orthogonal
 * choice that does not affect the seed.
 */
export interface OpponentDebugParams {
  /** Run position, 0 (opening) through the loaded Atlas's final layer (boss). */
  completionLevel: number;
  /** The dreamscape whose affiliation steers the build, or `null` for neutral. */
  dreamscapeId: string | null;
  /** Re-roll counter: changing it re-derives the seed under the same position. */
  nonce: number;
  /** The deck-building algorithm to view the generation through. */
  algo: OpponentDebugAlgo;
}

/** Query-param / id tokens that all denote "no affiliation". */
const NEUTRAL_TOKENS: ReadonlySet<string> = new Set([
  "",
  "neutral",
  "__neutral__",
]);

/** The stable id prefix shared by the URL `gen` token and the
 * `opponent_deck_constructed` log's `battleEntryKey`. */
const ID_PREFIX = "opponent-debug";

function clampLayer(value: number, maxLayer: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maxLayer, Math.max(0, Math.trunc(value)));
}

function normalizeNonce(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

function normalizeDreamscape(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return NEUTRAL_TOKENS.has(trimmed) ? null : trimmed;
}

/** Coerce an arbitrary `?opponentAlgorithm=` / selector value to a known algorithm,
 * defaulting to corpus. */
export function normalizeOpponentDebugAlgo(
  raw: string | null | undefined,
): OpponentDebugAlgo {
  return raw?.trim() === "coherent" ? "coherent" : "corpus";
}

/**
 * The shareable generation id for `params`, e.g.
 * `opponent-debug:pharaohs_gate:3:2`. This is byte-for-byte the
 * `battleEntryKey` the generation logs as, so the same string both addresses a
 * URL (`?gen=<id>`) and greps the journey log
 * (`grep '"battleEntryKey":"<id>"' logs/journey-log.jsonl`).
 */
export function opponentGenerationId(params: OpponentDebugParams): string {
  const dreamscape = params.dreamscapeId ?? "neutral";
  return `${ID_PREFIX}:${dreamscape}:${String(params.completionLevel)}:${String(
    params.nonce,
  )}`;
}

/**
 * Parse a generation id (`opponent-debug:<dreamscape>:<layer>:<nonce>`) back
 * into params, or `null` when it is not a well-formed id. Tolerant of dreamscape
 * ids that themselves contain no colons (every real dreamscape id is a single
 * token), validating the trailing layer / nonce as numbers. The id does not
 * carry the algorithm choice (a separate query param), so the returned `algo`
 * is the default `"corpus"`; callers reading a full query string overlay the
 * `?opponentAlgorithm=` value.
 */
export function parseOpponentGenerationId(
  id: string,
  maxLayer = Number.MAX_SAFE_INTEGER,
): OpponentDebugParams | null {
  const parts = id.split(":");
  if (parts.length !== 4 || parts[0] !== ID_PREFIX) return null;
  const layer = Number(parts[2]);
  const nonce = Number(parts[3]);
  if (!Number.isFinite(layer) || !Number.isFinite(nonce)) return null;
  return {
    completionLevel: clampLayer(layer, maxLayer),
    dreamscapeId: normalizeDreamscape(parts[1]),
    nonce: normalizeNonce(nonce),
    algo: "corpus",
  };
}

/**
 * Resolve the opponent-debug params from a URL query string. A `gen=<id>` token
 * (the full generation id) wins when present and valid; otherwise the discrete
 * `layer` / `dreamscape` / `n` params are read. Missing or malformed values fall
 * back to the layer-0 neutral generation, so a bare `/opponent` is always valid.
 */
export function parseOpponentDebugParams(
  search: string,
  maxLayer = Number.MAX_SAFE_INTEGER,
): OpponentDebugParams {
  const query = new URLSearchParams(search);

  // The algorithm is an orthogonal query param read independently of the seed
  // params, so a `gen=` link and an opponent-algorithm choice compose freely.
  const algo = normalizeOpponentDebugAlgo(query.get("opponentAlgorithm"));

  const gen = query.get("gen");
  if (gen != null) {
    const fromId = parseOpponentGenerationId(gen, maxLayer);
    if (fromId !== null) return { ...fromId, algo };
  }

  return {
    completionLevel: clampLayer(Number(query.get("layer")), maxLayer),
    dreamscapeId: normalizeDreamscape(query.get("dreamscape")),
    nonce: normalizeNonce(Number(query.get("n"))),
    algo,
  };
}

/**
 * Serialize params into a canonical `?layer=…&dreamscape=…&n=…` query string
 * (leading `?` included; `dreamscape` omitted for a neutral build,
 * `opponentAlgorithm` omitted for the corpus default so default links stay bare). Round-trips
 * with {@link parseOpponentDebugParams}.
 */
export function opponentDebugSearch(params: OpponentDebugParams): string {
  const query = new URLSearchParams();
  query.set("layer", String(params.completionLevel));
  if (params.dreamscapeId !== null) {
    query.set("dreamscape", params.dreamscapeId);
  }
  query.set("n", String(params.nonce));
  if (params.algo === "coherent") {
    query.set("opponentAlgorithm", params.algo);
  }
  return `?${query.toString()}`;
}
