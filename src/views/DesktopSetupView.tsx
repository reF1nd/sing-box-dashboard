import { useState } from "react";

import type { Server, ServersState } from "../api/config";
import { serverDisplayName } from "../api/config";
import type { DaemonConnectionState, DesktopHost } from "../app/desktop";
import { useI18n } from "../app/i18n";
import { Icon } from "../components/Icon";
import { Brand, Button, Spinner } from "../components/ui";
import styles from "./ConnectionErrorView.module.css";

export function DesktopSetupView(props: {
  host: DesktopHost;
  state: DaemonConnectionState;
  serversState: ServersState;
  onSelectServer: (server: Server) => void;
}) {
  const { t } = useI18n();
  const host = props.host;
  const state = props.state;
  const connecting = state.phase === "connecting";
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);

  const runRepair = (repair: () => Promise<boolean>) => {
    setRepairing(true);
    setRepairError(null);
    repair()
      .catch((error: unknown) => {
        setRepairError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setRepairing(false));
  };

  let title: string;
  switch (state.phase) {
    case "connecting":
      title = t("Connecting...");
      break;
    case "not-installed":
      title = t("The sing-box service is not installed");
      break;
    case "not-running":
      title = t("The sing-box service is not running");
      break;
    case "version-mismatch":
      title = t("Incompatible service version");
      break;
    default:
      title = t("Cannot connect to the sing-box service");
      break;
  }

  return (
    <div className="setup">
      <div className="setup-panel">
        <Brand product={null} />
        <div className={styles.connectionErrorHeader}>
          <span className={styles.connectionErrorIcon}>
            {connecting ? <Spinner /> : <Icon name="cloud_off" size={22} />}
          </span>
          <div>
            <h1>{title}</h1>
            {state.daemonVersion !== undefined && (
              <div className={styles.connectionErrorServer}>
                {state.bundledDaemonVersion !== undefined
                  ? `${state.daemonVersion} → ${state.bundledDaemonVersion}`
                  : state.daemonVersion}
              </div>
            )}
          </div>
        </div>
        {(repairError ?? state.errorMessage) !== undefined && (
          <div className="banner error">
            <Icon name="warning_amber" />
            <div>{repairError ?? state.errorMessage}</div>
          </div>
        )}
        <div className="row-actions" style={{ marginTop: 14 }}>
          {state.phase === "not-installed" ? (
            <Button
              variant="primary"
              disabled={repairing}
              onClick={() => runRepair(host.setup.repairInstall)}
            >
              {repairing && <Spinner />}
              {t("Install")}
            </Button>
          ) : state.phase === "version-mismatch" ? (
            <Button
              variant="primary"
              disabled={repairing}
              onClick={() => runRepair(host.setup.repairInstall)}
            >
              {repairing && <Spinner />}
              {t("Upgrade")}
            </Button>
          ) : state.phase === "not-running" ? (
            <Button
              variant="primary"
              disabled={repairing}
              onClick={() => runRepair(host.setup.repairStart)}
            >
              {repairing && <Spinner />}
              {t("Start")}
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={connecting}
              onClick={() => host.daemon.retryConnection()}
            >
              {connecting && <Spinner />}
              {connecting ? t("Connecting...") : t("Retry")}
            </Button>
          )}
        </div>
        {props.serversState.servers.length > 0 && (
          <div className={styles.connectionErrorSwitch}>
            <div className={styles.connectionErrorSwitchTitle}>{t("Connect to a remote server")}</div>
            {props.serversState.servers.map((server) => (
              <button
                key={server.id}
                className={styles.connectionErrorSwitchItem}
                onClick={() => props.onSelectServer(server)}
              >
                <Icon name="dns" size={14} />
                <span className="server-row-name">{serverDisplayName(server)}</span>
                <span className="server-row-url">{server.url}</span>
                <span className="settings-row-chevron">
                  <Icon name="keyboard_arrow_right" size={14} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
