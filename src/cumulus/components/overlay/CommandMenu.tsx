// The strict command-menu offering for app chrome and card/pointer actions.
// These are interactive overlays, deliberately separate from InfoCard's
// pointer-transparent entity-reveal contract.

import { meaning, tx, type LocalizedString } from "@trox/runtime";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { GlassDialog } from "./GlassDialog";
import { GlassButton } from "../controls/GlassButton";
import { IconButton } from "../controls/IconButton";
import { StandaloneGlyph } from "../controls/StandaloneGlyph";
import { TextField } from "../controls/TextField";
import { Pressable } from "../../primitives/Pressable";
import type { Glyph } from "../../primitives/glyph";
import { GLYPHS } from "../../primitives/glyph";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { token } from "../../primitives/tokens";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import {
  MENU_EDGE_INSET_DESKTOP_PX,
  MENU_EDGE_INSET_MOBILE_PX,
} from "../../primitives/chrome-geometry";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

export type CommandMenuCopy = LocalizedString;
export type CommandMenuStatusCopy = LocalizedString;

/** A single command row. `id` is stable domain identity, never display copy. */
export interface CommandMenuAction {
  kind: "action";
  id: string;
  glyph: Glyph;
  label: CommandMenuCopy;
  active?: boolean;
  onCommand: () => void;
}

/** A named, nested group of command rows. */
export interface CommandMenuGroup {
  kind: "group";
  id: string;
  glyph: Glyph;
  label: CommandMenuCopy;
  active?: boolean;
  /** Runs when Cumulus opens this group, before its nested commands are shown. */
  onOpen?: () => void;
  actions: readonly CommandMenuItem[];
}

/** A structural separator with stable identity. */
export interface CommandMenuDivider {
  kind: "divider";
  id: string;
}

/** A signed, non-zero whole-number command committed from an inline field. */
export interface CommandMenuSignedInteger {
  kind: "signed-integer";
  /** Stable domain identity for the field command. */
  id: string;
  /** Visible label above the field. */
  label: LocalizedString;
  /** Optional example value shown while the field is empty. */
  placeholder?: LocalizedString;
  /** Label for the commit action beneath the field. */
  commitLabel: LocalizedString;
  /** Receives the validated signed, non-zero whole number. */
  onCommand: (value: number) => void;
}

/** The full typed hierarchy accepted by Cumulus command menus. */
export type CommandMenuItem =
  | CommandMenuAction
  | CommandMenuGroup
  | CommandMenuSignedInteger
  | CommandMenuDivider;

type CommandMenuInteractiveItem = CommandMenuAction | CommandMenuGroup;

/** The fixed trigger rendered by an app-chrome command menu. */
export interface CommandMenuTriggerModel {
  glyph: Glyph;
  label: CommandMenuCopy;
  corner: "topStart" | "topEnd";
}

/** A short command result presented beneath an app-chrome trigger. */
export interface CommandMenuStatusModel {
  /** Player-facing status copy. */
  text: CommandMenuStatusCopy;
  /** Optional test selector for the status announcement. */
  testId?: string;
}

/** A command menu installed in the fixed journey app chrome. */
export interface CommandMenuAppChromeModel {
  kind: "appChrome";
  /** The fixed IconButton trigger rendered by the component. */
  trigger: CommandMenuTriggerModel;
  /** Root utility commands and their nested groups. */
  actions: readonly CommandMenuItem[];
  /** Optional transient result reported by the app-shell command controller. */
  status?: CommandMenuStatusModel;
  /** Lifts the fixed trigger above an app-shell full-screen overlay. */
  elevated?: boolean;
  /** Optional test selector for the trigger. */
  testId?: string;
}

/** Anchor supplied by a pointer interaction. */
export interface CommandMenuAnchor {
  x: number;
  y: number;
}

/** A command menu opened for an activated card or pointer target. */
export interface CommandMenuContextModel {
  kind: "context";
  /** Describes the card/pointer subject in the menu's header. */
  title: LocalizedString;
  /** Optional structured secondary location/context copy. */
  subtitle?: LocalizedString;
  /** Commands available for the activated card or pointer target. */
  actions: readonly CommandMenuItem[];
  /** Semantic location used to anchor the desktop pointer menu. */
  anchor: CommandMenuAnchor;
  /** Called after a leaf command, outside dismissal, or Escape. */
  onDismiss: () => void;
  /** Optional test selector for the root offering. */
  testId?: string;
}

/** Complete data for either supported command-menu presentation. */
export type CommandMenuModel =
  CommandMenuAppChromeModel | CommandMenuContextModel;

/** Props for {@link CommandMenu}. */
export interface CommandMenuProps {
  /** Commands and the semantic presentation selected for this offering. */
  model: CommandMenuModel;
}

/**
 * The single Cumulus command offering. Its model selects fixed app chrome or
 * an activated card/pointer context while preserving one typed action model.
 */
export function CommandMenu({ model }: CommandMenuProps): ReactElement {
  return model.kind === "appChrome" ? (
    <AppChromeCommandMenu model={model} />
  ) : (
    <ContextCommandMenu model={model} />
  );
}

function AppChromeCommandMenu({
  model,
}: {
  model: CommandMenuAppChromeModel;
}): ReactElement {
  const { trigger, actions, status, elevated = false, testId } = model;
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const resolve = useLocalizer();
  const isDesktop = useIsDesktop();
  const edgeInset = isDesktop
    ? MENU_EDGE_INSET_DESKTOP_PX
    : MENU_EDGE_INSET_MOBILE_PX;

  useEffect(() => {
    if (!open) return;
    const dismissIfOutside = (event: PointerEvent): void => {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismissIfOutside);
    window.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissIfOutside);
      window.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  const menu = (
    <div
      ref={hostRef}
      className="cumulus"
      style={{
        position: "fixed",
        top: `max(var(--safe-area-inset-top), ${edgeInset}px)`,
        ...(trigger.corner === "topEnd"
          ? { right: `max(var(--safe-area-inset-right), ${edgeInset}px)` }
          : { left: `max(var(--safe-area-inset-left), ${edgeInset}px)` }),
        zIndex: elevated ? 65 : 60,
      }}
    >
      <IconButton
        glyph={trigger.glyph}
        label={trigger.label}
        ariaExpanded={open}
        ariaControls={menuId}
        testId={testId}
        onPress={() => setOpen((value) => !value)}
      />
      {open && (
        <HierarchicalMenu
          id={menuId}
          items={actions}
          align={trigger.corner === "topEnd" ? "end" : "start"}
          onDismiss={() => setOpen(false)}
        />
      )}
      {!open && status !== undefined && (
        <div
          role="status"
          data-testid={status.testId}
          style={{
            ...glassSurfaceStyle(),
            position: "absolute",
            top: `calc(100% + ${token("--space-xs")})`,
            ...(trigger.corner === "topEnd" ? { right: 0 } : { left: 0 }),
            zIndex: 1,
            maxWidth: 260,
            padding: token("--space-s"),
            color: token("--text-on-glass"),
            font: token("--t-caption"),
          }}
        >
          {resolve(status.text)}
        </div>
      )}
    </div>
  );
  // A full-screen app-shell overlay may live outside the journey chrome's fixed
  // stacking context. Elevated utility chrome therefore portals to the document
  // root, where its semantic elevation remains above that overlay.
  return elevated ? createPortal(menu, document.body) : menu;
}

function ContextCommandMenu({
  model,
}: {
  model: CommandMenuContextModel;
}): ReactElement {
  const { title, subtitle, actions, anchor, onDismiss, testId } = model;
  const isDesktop = useIsDesktop();
  const resolve = useLocalizer();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const origin = anchor;

  useLayoutEffect(() => {
    if (!isDesktop || menuRef.current === null) return;
    const rect = menuRef.current.getBoundingClientRect();
    const margin = 8;
    setPosition({
      left: Math.max(
        margin,
        Math.min(origin.x, window.innerWidth - rect.width - margin),
      ),
      top: Math.max(
        margin,
        Math.min(origin.y, window.innerHeight - rect.height - margin),
      ),
    });
  }, [actions, isDesktop, origin.x, origin.y]);

  useEffect(() => {
    if (!isDesktop) return;
    const dismissIfOutside = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) onDismiss();
    };
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", dismissIfOutside);
    window.addEventListener("keydown", dismissOnEscape);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      document.removeEventListener("pointerdown", dismissIfOutside);
      window.removeEventListener("keydown", dismissOnEscape);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [isDesktop, onDismiss]);

  if (!isDesktop) {
    return createPortal(
      <GlassDialog
        title={title}
        subtitle={subtitle}
        closeLabel={tx(
          "Close actions",
          "[accessibility] [ui] Action name that closes a command menu.",
        )}
        onClose={onDismiss}
      >
        <HierarchicalMenu items={actions} mobile onDismiss={onDismiss} />
      </GlassDialog>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={menuRef}
      className="cumulus"
      data-command-menu-context=""
      data-testid={testId}
      style={{
        position: "fixed",
        left: position?.left ?? origin.x,
        top: position?.top ?? origin.y,
        zIndex: 61,
        visibility: position === null ? "hidden" : "visible",
      }}
    >
      <div style={headerStyle}>
        <span
          style={{ font: token("--t-body"), color: token("--text-on-glass") }}
        >
          {resolve(title)}
        </span>
        {subtitle !== undefined && (
          <span
            style={{
              font: token("--t-caption"),
              color: token("--text-on-glass-muted"),
            }}
          >
            {resolve(subtitle)}
          </span>
        )}
      </div>
      <HierarchicalMenu items={actions} onDismiss={onDismiss} />
    </div>,
    document.body,
  );
}

function HierarchicalMenu({
  id,
  items,
  align = "start",
  onDismiss,
  mobile = false,
}: {
  id?: string;
  items: readonly CommandMenuItem[];
  align?: "start" | "end";
  onDismiss: () => void;
  mobile?: boolean;
}): ReactElement {
  const resolve = useLocalizer();
  const [path, setPath] = useState<readonly string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const leafItems = items.filter((item) => item.kind !== "divider");
  const currentItems = menuItemsAtPath(items, path);
  const interactive = currentItems.filter(
    (item): item is CommandMenuInteractiveItem =>
      item.kind === "action" || item.kind === "group",
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    const input = menuRef.current?.querySelector<HTMLInputElement>(
      "[data-command-menu-signed-integer] input",
    );
    if (input !== null && input !== undefined) input.focus();
    else menuRef.current?.focus();
  }, [path]);

  function choose(item: CommandMenuInteractiveItem): void {
    if (item.kind === "group") {
      item.onOpen?.();
      setPath((previous) => [...previous, item.id]);
      return;
    }
    item.onCommand();
    onDismiss();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      if (path.length > 0) setPath((previous) => previous.slice(0, -1));
      else onDismiss();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (interactive.length === 0) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (previous) =>
          (previous + direction + interactive.length) % interactive.length,
      );
      return;
    }
    const active = interactive[activeIndex];
    if (
      event.key === "ArrowRight" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      if (active !== undefined) {
        event.preventDefault();
        choose(active);
      }
      return;
    }
    if (event.key === "ArrowLeft" && path.length > 0) {
      event.preventDefault();
      setPath((previous) => previous.slice(0, -1));
    }
  }

  const menuStyle: CSSProperties = mobile
    ? { display: "flex", flexDirection: "column", gap: token("--space-xs") }
    : {
        ...glassSurfaceStyle(),
        position: id === undefined ? "relative" : "absolute",
        top:
          id === undefined ? undefined : `calc(100% + ${token("--space-xs")})`,
        ...(id === undefined
          ? {}
          : align === "end"
            ? { right: 0 }
            : { left: 0 }),
        width: 240,
        maxHeight: "calc(100vh - 16px)",
        overflowY: "auto",
        padding: token("--space-xs"),
      };

  return (
    <div
      ref={menuRef}
      id={id}
      role="menu"
      aria-orientation="vertical"
      tabIndex={-1}
      style={{ ...menuStyle, outline: "none" }}
      onKeyDown={onKeyDown}
    >
      {path.length > 0 && (
        <CommandRow
          item={{
            kind: "group",
            id: "back",
            label: tx(
              meaning("command-menu-back", "Back"),
              "[ui] Command-menu action that returns from a nested group to its parent command list.",
            ),
            glyph: GLYPHS.arrowLeft,
            actions: [],
          }}
          label={tx(
            meaning("command-menu-back", "Back"),
            "[ui] Command-menu action that returns from a nested group to its parent command list.",
          )}
          active
          mobile={mobile}
          onActivate={() => setPath((previous) => previous.slice(0, -1))}
        />
      )}
      {currentItems.map((item) => {
        if (item.kind === "divider")
          return <div key={item.id} role="separator" style={dividerStyle} />;
        if (item.kind === "signed-integer") {
          return (
            <SignedIntegerCommand
              key={item.id}
              item={item}
              onDismiss={onDismiss}
            />
          );
        }
        const index = interactive.indexOf(item);
        return (
          <CommandRow
            key={item.id}
            item={item}
            label={item.label}
            active={index === activeIndex}
            mobile={mobile}
            onActivate={() => choose(item)}
          />
        );
      })}
      {leafItems.length === 0 && (
        <span
          style={{
            font: token("--t-body-sm"),
            color: token("--text-on-glass-muted"),
          }}
        >
          {resolve(
            tx(
              "No actions available.",
              "[ui] Empty-state message shown when a command menu has no available actions.",
            ),
          )}
        </span>
      )}
    </div>
  );
}

function SignedIntegerCommand({
  item,
  onDismiss,
}: {
  item: CommandMenuSignedInteger;
  onDismiss: () => void;
}): ReactElement {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<LocalizedString>();

  function commit(): void {
    const trimmed = draft.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) {
      setError(
        tx(
          "Enter a non-zero whole number.",
          "[developer] Validation message for a command-menu field that requires a signed, nonzero whole number.",
        ),
      );
      return;
    }
    const value = Number(trimmed);
    if (!Number.isSafeInteger(value) || value === 0) {
      setError(
        tx(
          "Enter a non-zero whole number.",
          "[developer] Validation message for a command-menu field that requires a signed, nonzero whole number.",
        ),
      );
      return;
    }
    item.onCommand(value);
    onDismiss();
  }

  return (
    <form
      data-command-menu-signed-integer={item.id}
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") event.stopPropagation();
      }}
      style={{
        display: "grid",
        gap: token("--space-xs"),
        padding: token("--space-xs"),
      }}
    >
      <TextField
        label={item.label}
        value={draft}
        onChange={(value) => {
          setDraft(value);
          setError(undefined);
        }}
        placeholder={item.placeholder}
        error={error}
        testId="command-menu-signed-integer-input"
      />
      <div style={{ display: "grid" }}>
        <GlassButton
          label={item.commitLabel}
          variant="accent"
          placement="onGlass"
          onPress={commit}
        />
      </div>
    </form>
  );
}

function CommandRow({
  item,
  label,
  active,
  mobile,
  onActivate,
}: {
  item: CommandMenuInteractiveItem;
  label: LocalizedString;
  active: boolean;
  mobile: boolean;
  onActivate: () => void;
}): ReactElement {
  const resolve = useLocalizer();
  const color =
    item.active === true ? token("--accent-bright") : token("--text-on-glass");
  return (
    <Pressable
      as="button"
      role="menuitem"
      data-command-menu-action-id={item.id}
      aria-haspopup={item.kind === "group" ? "menu" : undefined}
      onClick={onActivate}
      style={{
        appearance: "none",
        border: active
          ? `1px solid ${token("--border-accent")}`
          : "1px solid transparent",
        background: active ? token("--accent-tint") : "transparent",
        borderRadius: token("--radius-compact"),
        minHeight: token("--touch-min"),
        padding: token("--space-s"),
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: token("--space-s"),
        width: "100%",
        textAlign: "left",
        color,
        font: mobile ? token("--t-button") : token("--t-body-sm"),
      }}
    >
      <StandaloneGlyph glyph={item.glyph} color="text-primary" />
      <span>{resolve(label)}</span>
      {item.kind === "group" && (
        <StandaloneGlyph glyph={GLYPHS.chevronRight} color="text-primary" />
      )}
    </Pressable>
  );
}

function menuItemsAtPath(
  items: readonly CommandMenuItem[],
  path: readonly string[],
): readonly CommandMenuItem[] {
  let current = items;
  for (const id of path) {
    const group = current.find(
      (item): item is CommandMenuGroup =>
        item.kind === "group" && item.id === id,
    );
    if (group === undefined) return items;
    current = group.actions;
  }
  return current;
}

const headerStyle: CSSProperties = {
  ...glassSurfaceStyle(),
  width: 240,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  display: "flex",
  flexDirection: "column",
  gap: token("--space-xxs"),
  padding: token("--space-m"),
};

const dividerStyle: CSSProperties = {
  height: 1,
  margin: token("--space-xs"),
  background: token("--border-soft"),
};
