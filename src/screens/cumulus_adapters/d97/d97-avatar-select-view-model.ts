// The pure view-model rules for D97 Avatar select. A D97 run may start with
// any Avatar in the roster; the shared selection screen shows them a page of
// three at a time in roster order, and its reroll control turns the page.

import type { AvatarContent } from "../../../types/content";

/** Avatars the shared selection screen lays out side by side. */
const D97_AVATAR_PAGE_SIZE = 3;

/** The number of roster pages, at least one. */
export function d97AvatarPageCount(avatars: readonly AvatarContent[]): number {
  return Math.max(1, Math.ceil(avatars.length / D97_AVATAR_PAGE_SIZE));
}

/** The Avatars on roster page `page`, which wraps past the last page. */
export function d97AvatarPage(
  avatars: readonly AvatarContent[],
  page: number,
): AvatarContent[] {
  const count = d97AvatarPageCount(avatars);
  const start = (((page % count) + count) % count) * D97_AVATAR_PAGE_SIZE;
  return avatars.slice(start, start + D97_AVATAR_PAGE_SIZE);
}
