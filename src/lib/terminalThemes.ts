import type { TerminalThemeEntry } from "./terminalTheme";
import { GENERATED_TERMINAL_THEMES } from "./terminalThemes.generated";

export const TERMINAL_THEMES: TerminalThemeEntry[] = GENERATED_TERMINAL_THEMES;

export function findTheme(name: string): TerminalThemeEntry | undefined {
  return TERMINAL_THEMES.find((entry) => entry.name === name);
}

export function themesForScheme(isDark: boolean): TerminalThemeEntry[] {
  return TERMINAL_THEMES.filter((entry) => entry.isDark === isDark);
}

export function searchThemes(query: string, isDark: boolean): TerminalThemeEntry[] {
  const pool = themesForScheme(isDark);
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") {
    return pool;
  }
  return pool.filter((entry) => entry.name.toLowerCase().includes(trimmed));
}
