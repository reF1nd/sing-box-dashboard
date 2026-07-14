// Key ordering and encoding match sing-box-for-apple's TerminalInputAccessoryView.

const ESC = "\x1b";

export type ModState = "off" | "armed" | "locked";

export interface Modifiers {
  ctrl: ModState;
  alt: ModState;
}

export type ModKey = keyof Modifiers;

export type SpecialKeyId = "esc" | "tab" | "up" | "down" | "left" | "right";

export type TerminalKey =
  | { kind: "modifier"; mod: ModKey; label: string }
  | { kind: "special"; id: SpecialKeyId; label: string }
  | { kind: "text"; char: string }
  | { kind: "paste" }
  | { kind: "divider" };

export const DEFAULT_KEYS: readonly TerminalKey[] = [
  { kind: "special", id: "esc", label: "esc" },
  { kind: "special", id: "tab", label: "tab" },
  { kind: "modifier", mod: "ctrl", label: "⌃" },
  { kind: "modifier", mod: "alt", label: "⌥" },
  { kind: "divider" },
  { kind: "special", id: "left", label: "←" },
  { kind: "special", id: "up", label: "↑" },
  { kind: "special", id: "down", label: "↓" },
  { kind: "special", id: "right", label: "→" },
  { kind: "divider" },
  { kind: "text", char: "|" },
  { kind: "text", char: "/" },
  { kind: "text", char: "~" },
  { kind: "text", char: "-" },
  { kind: "text", char: "_" },
  { kind: "text", char: "`" },
  { kind: "text", char: "'" },
  { kind: "text", char: '"' },
  { kind: "paste" },
];

export function controlByte(ch: string): string | null {
  if (ch.length !== 1) {
    return null;
  }
  if (ch === " ") {
    return "\x00";
  }
  const code = ch.toUpperCase().charCodeAt(0);
  if (code >= 0x40 && code <= 0x5f) {
    return String.fromCharCode(code & 0x1f);
  }
  return null;
}

export function encodeText(text: string, mods: Modifiers): string {
  let out = text;
  if (mods.ctrl !== "off" && text.length === 1) {
    const byte = controlByte(text);
    if (byte !== null) {
      out = byte;
    }
  }
  if (mods.alt !== "off") {
    out = ESC + out;
  }
  return out;
}

const ARROW_FINAL: Record<"up" | "down" | "left" | "right", string> = {
  up: "A",
  down: "B",
  right: "C",
  left: "D",
};

export function encodeSpecial(id: SpecialKeyId, mods: Modifiers): string {
  if (id === "esc") {
    return mods.alt !== "off" ? ESC + ESC : ESC;
  }
  if (id === "tab") {
    return mods.alt !== "off" ? ESC + "\t" : "\t";
  }
  const final = ARROW_FINAL[id];
  const modCode = 1 + (mods.alt !== "off" ? 2 : 0) + (mods.ctrl !== "off" ? 4 : 0);
  return modCode === 1 ? ESC + "[" + final : ESC + "[1;" + modCode + final;
}

export function hasActiveModifier(mods: Modifiers): boolean {
  return mods.ctrl !== "off" || mods.alt !== "off";
}

function nextModState(current: ModState, doubleTap: boolean): ModState {
  switch (current) {
    case "off":
      return "armed";
    case "armed":
      return doubleTap ? "locked" : "off";
    case "locked":
      return "off";
  }
}

export function armModifier(mods: Modifiers, which: ModKey, doubleTap: boolean): Modifiers {
  return { ...mods, [which]: nextModState(mods[which], doubleTap) };
}

export function consumeArmed(mods: Modifiers): Modifiers {
  return {
    ctrl: mods.ctrl === "armed" ? "off" : mods.ctrl,
    alt: mods.alt === "armed" ? "off" : mods.alt,
  };
}
