import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AnnotatedLocalizedString,
  LocalizedString,
  ResolvedLocalizedPart,
} from "@trox/runtime";
import {
  requestedQALocaleFromBrowser,
  requireSourceRuntime,
  type LocalizationRuntime,
} from "./runtime";

export type ResolveMessage = (message: LocalizedString) => string;
export type ResolveMessageParts = <T>(
  message: AnnotatedLocalizedString<T>,
) => readonly ResolvedLocalizedPart<T>[];

interface LocalizationContextValue {
  readonly locale: string;
  readonly direction: "ltr" | "rtl";
  readonly resolve: ResolveMessage;
  readonly resolveParts: ResolveMessageParts;
}

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

/**
 * Pre-resolved catastrophic bootstrap copy. This is the sole player boundary
 * that can render before the checked source catalog exists.
 */
export const EMERGENCY_LOCALIZATION_FAILURE_TEXT =
  "Unable to display localized content.";

export interface TroxLocalizationProviderProps {
  readonly children: ReactNode;
  readonly runtime?: LocalizationRuntime | null;
}

export function TroxLocalizationProvider({
  children,
  runtime,
}: TroxLocalizationProviderProps) {
  const [active, setActive] = useState<LocalizationRuntime | null>(() => (
    runtime === undefined ? sourceRuntimeOrNull() : runtime
  ));

  useEffect(() => {
    if (runtime !== undefined) {
      setActive(runtime);
      return;
    }
    const source = sourceRuntimeOrNull();
    setActive(source);
    if (!import.meta.env.DEV || source === null) return;
    const qaLocale = requestedQALocaleFromBrowser();
    if (qaLocale === null) return;
    let cancelled = false;
    void import("./qa-runtime").then(({ loadQALocalizationRuntime }) => {
      if (!cancelled) setActive(loadQALocalizationRuntime(qaLocale));
    }).catch(() => {
      if (!cancelled) setActive(source);
    });
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  if (active === null) {
    return <div role="alert">{EMERGENCY_LOCALIZATION_FAILURE_TEXT}</div>;
  }
  return <ActiveTroxLocalizationProvider runtime={active}>{children}</ActiveTroxLocalizationProvider>;
}

function sourceRuntimeOrNull(): LocalizationRuntime | null {
  try {
    return requireSourceRuntime();
  } catch {
    return null;
  }
}

function ActiveTroxLocalizationProvider({
  children,
  runtime,
}: {
  readonly children: ReactNode;
  readonly runtime: LocalizationRuntime;
}) {
  const value = useMemo<LocalizationContextValue>(() => ({
    locale: runtime.locale,
    direction: runtime.direction,
    resolve: (message) => runtime.localizer.resolve(message),
    resolveParts: (message) => runtime.localizer.resolveParts(message),
  }), [runtime]);

  useEffect(() => {
    const previousLanguage = document.documentElement.lang;
    const previousDirection = document.documentElement.dir;
    document.documentElement.lang = runtime.locale;
    document.documentElement.dir = runtime.direction;
    return () => {
      document.documentElement.lang = previousLanguage;
      document.documentElement.dir = previousDirection;
    };
  }, [runtime]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalizationContext(): LocalizationContextValue {
  const value = useOptionalLocalizationContext();
  if (value === null) {
    throw new Error("useLocalizer requires a mounted TroxLocalizationProvider.");
  }
  return value;
}

/** Reads localization when a leaf also supports deliberately raw text. */
export function useOptionalLocalizationContext(): LocalizationContextValue | null {
  return useContext(LocalizationContext);
}
