import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  createGettext,
  resolveGettextLocale,
  type GettextFormatter,
  type GettextLocale,
} from "../../data/gettext";

const fallback = createGettext("en-US");
const GettextContext = createContext<GettextFormatter>(fallback);

function browserLocale(): GettextLocale {
  return typeof window === "undefined"
    ? "en-US"
    : resolveGettextLocale(window.location.search);
}

/** Provides the gettext proof-of-concept catalog beside the Fluent provider. */
export function GettextProvider({
  children,
  locale = browserLocale(),
}: {
  readonly children: ReactNode;
  readonly locale?: GettextLocale;
}) {
  const formatter = useMemo(() => createGettext(locale), [locale]);
  return (
    <GettextContext.Provider value={formatter}>
      {children}
    </GettextContext.Provider>
  );
}

/** Returns the gettext API bound to the current proof-of-concept locale. */
export function useGettext(): GettextFormatter {
  return useContext(GettextContext);
}
