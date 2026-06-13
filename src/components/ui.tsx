import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { encode as encodeQR } from "uqr";

import type { DelayTone } from "../api/format";
import {
  ACCENT_PRESETS,
  isAccentPreset,
  normalizeAccentColor,
  useIsMobile,
  type AccentPreference,
  type AccentPreset,
  type ThemePreference,
} from "../app/context";
import { showError } from "../app/errorStore";
import { useDismiss } from "../app/hooks";
import { useI18n, type MessageKey } from "../app/i18n";
import { Icon, type IconName } from "./Icon";

export function Card(props: { icon?: IconName; title?: ReactNode; actions?: ReactNode; wide?: boolean; children?: ReactNode }) {
  return (
    <div className={props.wide ? "card wide" : "card"}>
      {(props.title || props.actions) && (
        <div className="card-header">
          {props.icon && <Icon name={props.icon} />}
          <span>{props.title}</span>
          {props.actions && <div className="actions">{props.actions}</div>}
        </div>
      )}
      {props.children}
    </div>
  );
}

export function DataLine(props: { label: ReactNode; value: ReactNode; mono?: boolean }) {
  return (
    <div className="data-line">
      <span className="label">{props.label}</span>
      <span className={props.mono ? "value mono" : "value"}>{props.value}</span>
    </div>
  );
}

export type BadgeTone = DelayTone | "danger" | "info" | "accent";

export function Badge(props: { tone?: BadgeTone; children: ReactNode }) {
  const tone = props.tone && props.tone !== "neutral" ? ` ${props.tone}` : "";
  return <span className={`badge${tone}`}>{props.children}</span>;
}

export function Spinner() {
  return <span className="spinner" />;
}

export function EmptyState(props: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="empty-state">
      {props.icon && <Icon name={props.icon} size={28} />}
      {props.children}
    </div>
  );
}

// Chevron row of the Tools and Settings menu pages; `detail` is the trailing
// secondary value (e.g. the active server name), like a SwiftUI NavigationLink.
// With `href` it becomes an external link, trading the chevron for the
// open-in-new glyph.
export function NavRow(props: {
  icon: IconName;
  title: string;
  detail?: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <Icon name={props.icon} size={15} />
      <span>{props.title}</span>
      {props.detail != null && <span className="nav-row-detail">{props.detail}</span>}
      <Icon name={props.href ? "open_in_new" : "keyboard_arrow_right"} size={14} />
    </>
  );
  if (props.href) {
    return (
      <a className="nav-row" href={props.href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  }
  return (
    <button className="nav-row" onClick={props.onClick}>
      {inner}
    </button>
  );
}

export function SegmentedControl(props: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segmented">
      {props.options.map((option) => (
        <button
          key={option.value}
          className={option.value === props.value ? "active" : ""}
          disabled={props.disabled}
          onClick={() => {
            if (option.value !== props.value) {
              props.onChange(option.value);
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Shared between Settings preferences and the first-run setup screen.
export function ThemeSelect(props: {
  theme: ThemePreference;
  onChange: (theme: ThemePreference) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="icon-segmented">
      {(
        [
          { value: "auto", icon: "brightness_auto", title: t("System") },
          { value: "light", icon: "light_mode", title: t("Light") },
          { value: "dark", icon: "dark_mode", title: t("Dark") },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          className={props.theme === option.value ? "active" : ""}
          onClick={() => props.onChange(option.value)}
        >
          <Icon name={option.icon} size={15} />
        </button>
      ))}
    </div>
  );
}

export const ACCENT_TITLES: Record<AccentPreset, MessageKey> = {
  default: "Default",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  graphite: "Graphite",
};

// Accent swatch row mirroring the macOS System Settings picker. Each preset
// button carries data-accent, so the global palette rules color it directly.
// The trailing multicolor swatch hosts an invisible native color input — the
// browser's picker brings its own palette and hex entry, so a custom color
// needs no extra UI.
export function AccentSelect(props: {
  accent: AccentPreference;
  onChange: (accent: AccentPreference) => void;
}) {
  const { t } = useI18n();
  const custom = isAccentPreset(props.accent) ? null : props.accent;
  // Seed the picker with the resolved accent so it opens on the current
  // color even while a preset is selected.
  const wellValue =
    custom ??
    (getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1a1a1a");
  return (
    <div className="accent-picker">
      {ACCENT_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          title={t(ACCENT_TITLES[preset])}
          aria-label={t(ACCENT_TITLES[preset])}
          aria-pressed={props.accent === preset}
          className={props.accent === preset ? "active" : ""}
          data-accent={preset}
          onClick={() => props.onChange(preset)}
        />
      ))}
      <label className={custom !== null ? "custom active" : "custom"} title={t("Custom color")}>
        <input
          type="color"
          value={wellValue}
          aria-label={t("Custom color")}
          onChange={(event) =>
            props.onChange(normalizeAccentColor(event.target.value) ?? event.target.value)
          }
        />
      </label>
    </div>
  );
}

// Accent dropdown for the Theme rows in Settings and the setup screen: the
// preset swatch row plus the multicolor custom entry, in a menu like the
// server picker's. Picking a preset closes the menu; the custom swatch keeps
// it open while the browser's color panel (with its own hex field) is in use.
export function ThemeMenu(props: {
  accent: AccentPreference;
  onChange: (accent: AccentPreference) => void;
  openUp?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div className="menu-anchor" ref={ref}>
      <button className="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {isAccentPreset(props.accent) ? (
          <>
            <span className="accent-dot" data-accent={props.accent} />
            {t(ACCENT_TITLES[props.accent])}
          </>
        ) : (
          <>
            <span className="accent-dot" style={{ background: props.accent }} />
            {props.accent.toUpperCase()}
          </>
        )}
        <Icon name="unfold_more" size={13} />
      </button>
      {open && (
        <div className={props.openUp ? "menu open-up align-right accent-menu" : "menu align-right accent-menu"}>
          <AccentSelect
            accent={props.accent}
            onChange={(accent) => {
              props.onChange(accent);
              if (isAccentPreset(accent)) {
                setOpen(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

// Full-width segmented control that falls back to a select when the labels
// no longer fit, mirroring ClashModeCard's tabsFit measurement.
export function AdaptiveSegmented(props: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);

  useEffect(() => {
    const update = () => {
      const container = containerRef.current;
      const measure = measureRef.current;
      if (container && measure) {
        setFits(measure.scrollWidth <= container.clientWidth);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [props.options]);

  return (
    <div ref={containerRef}>
      <div className="segmented-measure" aria-hidden ref={measureRef}>
        <div className="segmented" style={{ height: "auto" }}>
          {props.options.map((option) => (
            <button key={option.value} tabIndex={-1}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {fits ? (
        <div className="segmented full">
          {props.options.map((option) => (
            <button
              key={option.value}
              className={option.value === props.value ? "active" : ""}
              onClick={() => {
                if (option.value !== props.value) {
                  props.onChange(option.value);
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <select
          className="select"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        >
          {props.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// "Others" overflow menu, mirroring the ellipsis-circle toolbar menu in
// sing-box-for-apple's LogView/ConnectionListView. Picker groups become
// labelled radio sections; any item click closes the menu.
export function OthersMenu(props: { children: ReactNode; icon?: IconName }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        className={open ? "icon-button active" : "icon-button"}
        title={t("Others")}
        onClick={() => setOpen(!open)}
      >
        <Icon name={props.icon ?? "more_vert"} />
      </button>
      {open && (
        <div className="menu align-right" onClick={() => setOpen(false)}>
          <SubMenuGroup>{props.children}</SubMenuGroup>
        </div>
      )}
    </div>
  );
}

// Sibling submenus share this so opening one closes the other; mounted inside
// the conditional render above so the state resets whenever the menu reopens.
const SubMenuGroupContext = createContext<{
  openId: string | null;
  setOpenId: (id: string | null) => void;
} | null>(null);

function SubMenuGroup(props: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <SubMenuGroupContext.Provider value={{ openId, setOpenId }}>
      {props.children}
    </SubMenuGroupContext.Provider>
  );
}

export function MenuLabel(props: { children: ReactNode }) {
  return <div className="menu-label">{props.children}</div>;
}

// Nested flyout matching the UIMenu submenus in sing-box-for-apple's LogView
// (Log Level / Save). Opens on hover for mouse, on tap for touch; selecting a
// nested item bubbles up to OthersMenu and closes the whole menu.
export function SubMenu(props: { label: ReactNode; icon?: IconName; children: ReactNode }) {
  const id = useId();
  const group = useContext(SubMenuGroupContext);
  const [localOpen, setLocalOpen] = useState(false);
  const open = group ? group.openId === id : localOpen;
  const setOpen = (next: boolean) => {
    if (!group) {
      setLocalOpen(next);
    } else if (next) {
      group.setOpenId(id);
    } else if (group.openId === id) {
      group.setOpenId(null);
    }
  };
  return (
    <div
      className="submenu"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          setOpen(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          setOpen(false);
        }
      }}
    >
      <button
        className="menu-item"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <span className="menu-check">{props.icon && <Icon name={props.icon} size={13} />}</span>
        {props.label}
        <span className="submenu-arrow">
          <Icon name="keyboard_arrow_right" size={12} />
        </span>
      </button>
      {open && <div className="menu submenu-panel">{props.children}</div>}
    </div>
  );
}

export function MenuItem(props: {
  checked?: boolean;
  icon?: IconName;
  danger?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={props.danger ? "menu-item danger" : "menu-item"}
      onClick={props.onSelect}
    >
      <span className="menu-check">
        {props.checked && <Icon name="check" size={13} />}
        {props.icon && <Icon name={props.icon} size={13} />}
      </span>
      {props.children}
    </button>
  );
}

export function Toggle(props: { label: ReactNode; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <div className="toggle-line">
      <span>{props.label}</span>
      <button
        className={props.value ? "switch on" : "switch"}
        role="switch"
        aria-checked={props.value}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.value)}
      />
    </div>
  );
}

export function Field(props: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label>{props.label}</label>
      {props.children}
    </div>
  );
}

// Shared by the connections, logs, and Tailscale peer list filters.
export function SearchInput(props: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="search-input">
      <Icon name="search" size={14} />
      <input
        className="input"
        placeholder={t("Search")}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

export function Sparkline(props: { data: number[]; height?: number; color?: string; capacity?: number }) {
  const height = props.height ?? 46;
  const width = 300;
  const capacity = props.capacity ?? 30;
  const max = Math.max(...props.data, 1);
  const stepX = width / Math.max(capacity - 1, 1);
  const offset = Math.max(0, capacity - props.data.length);
  const points = props.data.map((value, index) => {
    const x = (offset + index) * stepX;
    const y = height - 3 - (value / (max * 1.2)) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = props.color ?? "var(--accent)";
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      {points.length > 1 && (
        <>
          <polygon
            points={`${points[0].split(",")[0]},${height} ${points.join(" ")} ${points[points.length - 1].split(",")[0]},${height}`}
            fill={color}
            opacity="0.1"
          />
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}

export function QRCode(props: { value: string }) {
  const qr = useMemo(() => encodeQR(props.value, { border: 2 }), [props.value]);
  const path = useMemo(() => {
    const parts: string[] = [];
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) {
          parts.push(`M${x} ${y}h1v1h-1z`);
        }
      }),
    );
    return parts.join("");
  }, [qr]);
  return (
    <svg className="qr-code" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={props.value}>
      <path d={path} fill="#000" shapeRendering="crispEdges" />
    </svg>
  );
}

// Dialog and Drawer render as native <dialog> elements: showModal provides
// the focus trap, Escape handling (the cancel event), and top-layer stacking
// the old hand-rolled overlays lacked. Both are mounted only while open.
function useShowModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    // showModal moves focus to the first focusable element; if React's
    // autoFocus already landed on a specific field (e.g. the URL input in
    // the server dialog), put it back.
    const focused = document.activeElement;
    dialog.showModal();
    if (focused instanceof HTMLElement && dialog.contains(focused)) {
      focused.focus();
    }
    // close() (rather than plain removal) restores focus to the opener.
    return () => dialog.close();
  }, []);
  return ref;
}

// A click that lands on the ::backdrop targets the dialog element itself
// with coordinates outside its box — clicks on the dialog's own padding
// also target it, so the coordinate check tells them apart.
function closeOnBackdropClick(event: React.MouseEvent<HTMLDialogElement>, onClose: () => void) {
  if (event.target !== event.currentTarget) {
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  if (!inside) {
    onClose();
  }
}

export function Drawer(props: { onClose: () => void; children: ReactNode }) {
  const ref = useShowModal();
  return (
    <dialog
      ref={ref}
      className="drawer"
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => closeOnBackdropClick(event, props.onClose)}
    >
      {props.children}
    </dialog>
  );
}

export function Dialog(props: { onClose: () => void; className?: string; children: ReactNode }) {
  const ref = useShowModal();
  return (
    <dialog
      ref={ref}
      className={props.className ? `dialog ${props.className}` : "dialog"}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => closeOnBackdropClick(event, props.onClose)}
    >
      {props.children}
    </dialog>
  );
}

// Detail presentation shared by the connection and Tailscale peer details:
// a side drawer over the list on desktop, a pushed full page with a back
// button on mobile (like the Tools sub-pages).
export function DetailShell(props: {
  backLabel: string;
  title: ReactNode;
  accessory?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <div className="page">
        <div className="page-header">
          <button className="back-button" aria-label={props.backLabel} onClick={props.onClose}>
            <Icon name="arrow_back" size={20} />
          </button>
          <h1 className="page-title">{props.title}</h1>
          {props.accessory && <div className="actions">{props.accessory}</div>}
        </div>
        {props.subtitle}
        {props.children}
      </div>
    );
  }
  return (
    <Drawer onClose={props.onClose}>
      <h3>
        {props.title}
        {props.accessory && <span style={{ marginInlineStart: "auto" }}>{props.accessory}</span>}
      </h3>
      {props.subtitle}
      {props.children}
    </Drawer>
  );
}

export function CopyValue(props: { value: string }) {
  const { t } = useI18n();
  return (
    <span className="copy-value">
      <span>{props.value}</span>
      <button
        className="icon-button"
        title={t("Copy")}
        onClick={() => {
          void navigator.clipboard.writeText(props.value).catch(showError);
        }}
      >
        <Icon name="content_copy" size={13} />
      </button>
    </span>
  );
}
