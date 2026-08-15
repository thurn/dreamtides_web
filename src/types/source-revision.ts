declare const sourceRevisionBrand: unique symbol;

/** Opaque digest identifying the exact editor source bytes last loaded. */
export type SourceRevision = string & {
  readonly [sourceRevisionBrand]: "SourceRevision";
};

/** Decode a persisted or transport-provided source revision once at its edge. */
export function parseSourceRevision(value: unknown): SourceRevision {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Source revision must be a non-empty string.");
  }
  return value as SourceRevision;
}

export type RawSourceRevisionResponse<
  Response extends { readonly sourceRevision: SourceRevision },
> = Omit<Response, "sourceRevision"> & { readonly sourceRevision: unknown };

export type ParsedSourceRevisionResponse<
  Response extends { readonly sourceRevision: SourceRevision },
> = Omit<Response, "sourceRevision"> & {
  readonly sourceRevision: SourceRevision;
};

/** Preserve a decoded response while branding its transport revision exactly once. */
export function parseSourceRevisionResponse<
  Response extends { readonly sourceRevision: SourceRevision },
>(
  response: RawSourceRevisionResponse<Response>,
): ParsedSourceRevisionResponse<Response> {
  return {
    ...response,
    sourceRevision: parseSourceRevision(response.sourceRevision),
  };
}

export type RawOptionalSourceRevisionResponse<
  Response extends { readonly sourceRevision?: SourceRevision },
> = Omit<Response, "sourceRevision"> & { readonly sourceRevision?: unknown };

export type ParsedOptionalSourceRevisionResponse<
  Response extends { readonly sourceRevision?: SourceRevision },
> = Omit<RawOptionalSourceRevisionResponse<Response>, "sourceRevision"> & {
  readonly sourceRevision?: SourceRevision;
};

/** Decode an optional transport revision without manufacturing one when omitted. */
export function parseOptionalSourceRevisionResponse<
  Response extends { readonly sourceRevision?: SourceRevision },
>(
  response: RawOptionalSourceRevisionResponse<Response>,
): ParsedOptionalSourceRevisionResponse<Response> {
  const { sourceRevision, ...rest } = response;
  return {
    ...rest,
    ...(sourceRevision === undefined
      ? {}
      : { sourceRevision: parseSourceRevision(sourceRevision) }),
  };
}
