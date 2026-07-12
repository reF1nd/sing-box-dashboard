import { createContext, useContext, useEffect, useRef, useState } from "react";

import type { Code, Transport } from "@connectrpc/connect";

import { isTerminalCode, type StreamPhase, type StreamSnapshot } from "../api/stream";
import { showError } from "./errorStore";

export type DaemonConnectionPhase =
  | "connecting"
  | "connected"
  | "unavailable"
  | "not-installed"
  | "not-running"
  | "version-mismatch";

export interface DaemonConnectionState {
  phase: DaemonConnectionPhase;
  errorMessage?: string;
  daemonVersion?: string;
  daemonDesktopApiVersion?: number;
  bundledDaemonVersion?: string;
}

export type DesktopProfileType = "local" | "remote";

export interface DesktopProfile {
  id: string;
  name: string;
  type: DesktopProfileType;
  remoteUrl?: string;
  autoUpdate: boolean;
  autoUpdateIntervalMinutes: number;
  lastUpdated?: number;
}

export interface DesktopProfilesState {
  selectedId: string | null;
  profiles: DesktopProfile[];
}

export interface DesktopProfileCreate {
  name: string;
  type: DesktopProfileType;
  content?: string;
  remoteUrl?: string;
  autoUpdate?: boolean;
  autoUpdateIntervalMinutes?: number;
}

export interface DesktopProfilePatch {
  name?: string;
  remoteUrl?: string;
  autoUpdate?: boolean;
  autoUpdateIntervalMinutes?: number;
}

export interface DesktopCrashReport {
  name: string;
  crashedAt: number;
  isRead: boolean;
}

export interface DesktopCrashReportFile {
  name: string;
  content: string;
}

export interface DesktopCrashReportExportOptions {
  withConfiguration: boolean;
  withLog: boolean;
  encrypt: boolean;
}

export type DesktopSpeedMode = "disabled" | "enabled" | "unified";

export interface DesktopSettingsState {
  speedMode: DesktopSpeedMode;
  openAtLogin: boolean;
}

export interface DesktopHost {
  platform: string;
  expectedDaemonApiVersion: number;
  appVersion(): Promise<string>;
  transport: Transport;
  daemon: {
    getState(): Promise<DaemonConnectionState>;
    onStateChanged(listener: (state: DaemonConnectionState) => void): () => void;
    retryConnection(): void;
  };
  setup: {
    repairInstall(): Promise<boolean>;
    repairStart(): Promise<boolean>;
  };
  service: {
    start(): Promise<void>;
    stop(): Promise<void>;
  };
  configuration: {
    check(content: string): Promise<void>;
    format(content: string): Promise<string>;
  };
  systemProxy: {
    status(): Promise<{ available: boolean; enabled: boolean }>;
    setEnabled(enabled: boolean): Promise<void>;
  };
  core: {
    info(): Promise<{ version: string; coreVersion: string }>;
    workingDirectory(): Promise<{ path: string; size: number }>;
    openWorkingDirectory(): Promise<void>;
    destroyWorkingDirectory(): Promise<void>;
  };
  reports: {
    list(): Promise<DesktopCrashReport[]>;
    read(name: string): Promise<DesktopCrashReportFile[]>;
    markRead(name: string): Promise<void>;
    exportFile(name: string, options: DesktopCrashReportExportOptions): Promise<boolean>;
    remove(name: string): Promise<void>;
    removeAll(): Promise<void>;
  };
  profiles: {
    list(): Promise<DesktopProfilesState>;
    onChanged(listener: () => void): () => void;
    create(init: DesktopProfileCreate): Promise<void>;
    updateMetadata(id: string, patch: DesktopProfilePatch): Promise<void>;
    remove(id: string): Promise<void>;
    reorder(ids: string[]): Promise<void>;
    select(id: string): Promise<void>;
    readContent(id: string): Promise<string>;
    writeContent(id: string, content: string): Promise<void>;
    updateRemote(id: string): Promise<void>;
    pickImportFile(): Promise<{ fileName: string; data: Uint8Array } | null>;
    exportFile(id: string): Promise<boolean>;
    importData(fileName: string, data: Uint8Array): Promise<void>;
    decodeData(data: Uint8Array): Promise<{ name: string }>;
    exportData(id: string): Promise<boolean>;
    encodeData(id: string): Promise<Uint8Array>;
  };
  settings: {
    get(): Promise<DesktopSettingsState>;
    setSpeedMode(mode: DesktopSpeedMode): Promise<void>;
    setOpenAtLogin(value: boolean): Promise<void>;
    cacheSize(): Promise<number>;
    clearCache(): Promise<void>;
  };
  onImportRemoteProfile(listener: (request: { name: string; url: string }) => void): () => void;
  onImportProfileFile(listener: (request: { fileName: string; data: Uint8Array }) => void): () => void;
}

export const DesktopHostContext = createContext<DesktopHost | null>(null);

export function useDesktopHost(): DesktopHost | null {
  return useContext(DesktopHostContext);
}

export const DesktopLocalContext = createContext(false);

export function useLocalDesktopHost(): DesktopHost | null {
  const host = useContext(DesktopHostContext);
  const local = useContext(DesktopLocalContext);
  return local ? host : null;
}

export function useDaemonConnection(host: DesktopHost): DaemonConnectionState {
  const [state, setState] = useState<DaemonConnectionState>({ phase: "connecting" });

  useEffect(() => {
    let stale = false;
    host.daemon
      .getState()
      .then((value) => {
        if (!stale) {
          setState(value);
        }
      })
      .catch(() => {});
    const unsubscribe = host.daemon.onStateChanged(setState);
    return () => {
      stale = true;
      unsubscribe();
    };
  }, [host]);

  return state;
}

const REMOTE_RECONNECT_ATTEMPTS = 3;
const REMOTE_STABLE_CONNECTION_MS = 5000;

export interface RemoteSessionFailure {
  hadConnected: boolean;
  message: string;
}

export class RemoteSessionMonitor {
  private hadConnected = false;
  private cycleActive = false;
  private connectedAt = 0;
  private attempts = 0;

  constructor(private onEnd: (failure: RemoteSessionFailure) => void) {}

  observe(phase: StreamPhase, errorMessage: string | undefined, errorCode: Code | undefined) {
    if (phase === "active") {
      if (!this.cycleActive) {
        this.cycleActive = true;
        this.hadConnected = true;
        this.connectedAt = Date.now();
      }
      return;
    }
    if (phase !== "error") {
      return;
    }
    const established = this.cycleActive;
    this.cycleActive = false;
    if (established && !isTerminalCode(errorCode)) {
      if (Date.now() - this.connectedAt >= REMOTE_STABLE_CONNECTION_MS) {
        this.attempts = 0;
      }
      if (this.attempts < REMOTE_RECONNECT_ATTEMPTS) {
        this.attempts += 1;
        return;
      }
    }
    this.onEnd({ hadConnected: this.hadConnected, message: errorMessage ?? "" });
  }
}

export function useRemoteSession(
  monitor: StreamSnapshot<unknown> | null,
  onEnd: (failure: RemoteSessionFailure) => void,
) {
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const sessionRef = useRef<RemoteSessionMonitor | null>(null);
  if (sessionRef.current === null && monitor !== null) {
    sessionRef.current = new RemoteSessionMonitor((failure) => onEndRef.current(failure));
  }
  const phase = monitor?.phase ?? null;
  const errorMessage = monitor?.error;
  const errorCode = monitor?.errorCode;

  useEffect(() => {
    if (phase !== null) {
      sessionRef.current?.observe(phase, errorMessage, errorCode);
    }
  }, [phase, errorMessage, errorCode]);
}

export function useDesktopProfiles(host: DesktopHost): DesktopProfilesState {
  const [state, setState] = useState<DesktopProfilesState>({ selectedId: null, profiles: [] });

  useEffect(() => {
    let stale = false;
    const reload = () => {
      host.profiles
        .list()
        .then((value) => {
          if (!stale) {
            setState(value);
          }
        })
        .catch(showError);
    };
    reload();
    const unsubscribe = host.profiles.onChanged(reload);
    return () => {
      stale = true;
      unsubscribe();
    };
  }, [host]);

  return state;
}
