/**
 * Move the tutorial room into the quest runtime after its shared fold has
 * reached the tutorial DreamAvatar offer. The room and content parameters stay
 * intact; a direct QA scene must not bootstrap again in the quest app.
 */
export function tutorialJourneyUrl(currentHref: string): string {
  const next = new URL(currentHref);
  next.pathname = "/";
  next.searchParams.delete("goto");
  return `${next.pathname}${next.search}${next.hash}`;
}
