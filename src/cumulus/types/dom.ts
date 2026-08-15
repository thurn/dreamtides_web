import type { ComponentProps } from "react";

/** Identifier text consumed directly by the browser DOM rather than the game domain. */
export type DomElementId = NonNullable<ComponentProps<"div">["id"]>;

/** Stable selector text emitted through a `data-testid` DOM attribute. */
export type DomTestId = DomElementId;
