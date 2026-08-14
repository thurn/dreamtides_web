const CARD_IDS_PARAM = "cards";

export function parseExplorationCardFilter(
  search: string,
): ReadonlySet<string> | null {
  const params = new URLSearchParams(search);
  if (!params.has(CARD_IDS_PARAM)) return null;

  return new Set(
    params
      .getAll(CARD_IDS_PARAM)
      .flatMap((value) => value.split(","))
      .map((cardId) => cardId.trim().toLowerCase())
      .filter((cardId) => cardId !== ""),
  );
}
