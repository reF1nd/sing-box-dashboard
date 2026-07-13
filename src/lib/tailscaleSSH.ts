import type { TailscaleEndpointStatus, TailscalePeer } from "../gen/daemon/started_service_pb";

import { loadStoredJson, saveStoredJson } from "./storage";

export interface TailscaleSSHPrefs {
  username: string;
  terminalType: string;
  remember: boolean;
}

export interface SSHSessionOptions {
  endpointTag: string;
  peerAddress: string;
  peerName: string;
  username: string;
  terminalType: string;
  hostKeys: string[];
}

const SSH_PREFS_KEY = "tailscale-ssh";
export const SSH_DEFAULT_USERNAME = "root";
export const SSH_DEFAULT_TERMINAL_TYPE = "xterm-256color";

export function loadSSHPrefs(): Record<string, TailscaleSSHPrefs> {
  const parsed = loadStoredJson(SSH_PREFS_KEY);
  if (parsed && typeof parsed === "object") {
    return parsed as Record<string, TailscaleSSHPrefs>;
  }
  return {};
}

export function saveSSHPrefs(stableID: string, prefs: TailscaleSSHPrefs) {
  const map = loadSSHPrefs();
  map[stableID] = prefs;
  saveStoredJson(SSH_PREFS_KEY, map);
}

// Default theme names, matching sing-box-for-apple. Kept as plain strings here
// so this module never pulls in the (large, lazily-loaded) theme catalog.
export const DEFAULT_LIGHT_THEME_NAME = "Alabaster";
export const DEFAULT_DARK_THEME_NAME = "Afterglow";

export interface TerminalConfig {
  // When true, the auxiliary symbol bar stays visible at all times, including
  // on desktop. When false it only appears above the on-screen keyboard.
  symbolBarAlwaysShow: boolean;

  // Colour theme, resolved against the app's effective light/dark appearance.
  // A name refers to an entry in the theme catalog; an empty name means "use
  // the matching *ThemeCustom JSON instead".
  lightThemeName: string;
  darkThemeName: string;
  // xterm `ITheme` JSON, used when the corresponding *ThemeName is empty.
  lightThemeCustom: string;
  darkThemeCustom: string;

  // Empty fontFamily falls back to the default monospace stack.
  fontFamily: string;
  fontSize: number;
}

const TERMINAL_CONFIG_KEY = "terminal-config";
export const TERMINAL_CONFIG_EVENT = "sing-box-dashboard:terminal-config";

export const DEFAULT_TERMINAL_FONT_SIZE = 13;

const DEFAULT_TERMINAL_CONFIG: TerminalConfig = {
  symbolBarAlwaysShow: false,
  lightThemeName: DEFAULT_LIGHT_THEME_NAME,
  darkThemeName: DEFAULT_DARK_THEME_NAME,
  lightThemeCustom: "",
  darkThemeCustom: "",
  fontFamily: "",
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
};

export function loadTerminalConfig(): TerminalConfig {
  const parsed = loadStoredJson(TERMINAL_CONFIG_KEY);
  if (parsed && typeof parsed === "object") {
    return { ...DEFAULT_TERMINAL_CONFIG, ...(parsed as Partial<TerminalConfig>) };
  }
  return { ...DEFAULT_TERMINAL_CONFIG };
}

export function saveTerminalConfig(config: TerminalConfig) {
  saveStoredJson(TERMINAL_CONFIG_KEY, config);
  // The native `storage` event only fires in other tabs/windows; dispatch a
  // custom event so listeners in this window react immediately too.
  window.dispatchEvent(new Event(TERMINAL_CONFIG_EVENT));
}

export function allPeers(endpoint: TailscaleEndpointStatus | undefined): TailscalePeer[] {
  return endpoint?.userGroups.flatMap((group) => group.peers) ?? [];
}

export function peerDisplayName(peer: TailscalePeer | undefined): string {
  if (!peer) {
    return "";
  }
  if (peer.dnsName !== "") {
    return peer.dnsName.split(".")[0];
  }
  return peer.hostName;
}

export function peerSSHAddress(peer: TailscalePeer): string {
  return (
    peer.tailscaleIPs.find((address) => !address.includes(":")) ??
    peer.tailscaleIPs[0] ??
    peer.dnsName
  );
}

export function peerSSHAvailable(peer: TailscalePeer): boolean {
  return peer.online && peer.sshHostKeys.length > 0 && peer.tailscaleIPs.length > 0;
}

export function buildSSHSession(
  endpointTag: string,
  peer: TailscalePeer,
  username: string,
  terminalType: string,
): SSHSessionOptions {
  return {
    endpointTag,
    peerAddress: peerSSHAddress(peer),
    peerName: peerDisplayName(peer),
    username,
    terminalType,
    hostKeys: peer.sshHostKeys,
  };
}
