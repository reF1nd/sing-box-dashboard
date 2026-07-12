import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { DaemonApi } from "./api/daemon";
import type { Server } from "./api/config";
import { urlTestDelayTone } from "./api/format";
import { useStream } from "./api/stream";
import {
  applyAccent,
  applyTheme,
  loadAccentPreference,
  loadThemePreference,
  watchSystemTheme,
} from "./app/context";
import { useDaemonConnection, useDesktopProfiles } from "./app/desktop";
import type { DesktopHost } from "./app/desktop";
import { dismissError, showError, useCurrentError } from "./app/errorStore";
import { I18nProvider, useI18n } from "./app/i18n";
import { Icon } from "./components/Icon";
import { Spinner, Switch } from "./components/ui";
import { ServiceStatus_Type } from "./gen/daemon/started_service_pb";
import type { Group } from "./gen/daemon/started_service_pb";
import { cx } from "./lib/cx";
import styles from "./TrayMenu.module.css";

const TRAY_LOCAL_SERVER: Server = { id: "tray-local", name: "sing-box", url: "", secret: "" };

const SUBMENU_WIDTH = 240;
const SUBMENU_GAP = 6;
const HOVER_CLOSE_DELAY = 180;

const GROUPS_SUBMENU = "\0groups";
const PROFILES_SUBMENU = "\0profiles";

export function TrayMenu(props: { desktop: DesktopHost }) {
  return (
    <I18nProvider>
      <TrayMenuContent host={props.desktop} />
    </I18nProvider>
  );
}

function useTrayTheme() {
  useEffect(() => {
    const apply = () => {
      applyTheme(loadThemePreference());
      applyAccent(loadAccentPreference());
    };
    apply();
    const unwatchSystem = watchSystemTheme(loadThemePreference);
    window.addEventListener("storage", apply);
    return () => {
      unwatchSystem();
      window.removeEventListener("storage", apply);
    };
  }, []);
}

interface SubmenuController {
  activeKey: string | null;
  side: "left" | "right";
  open: (key: string, anchor: HTMLElement) => void;
  toggle: (key: string, anchor: HTMLElement) => void;
  scheduleClose: () => void;
  cancelClose: () => void;
  close: () => void;
}

function chooseSide(anchor: HTMLElement): "left" | "right" {
  const rect = anchor.getBoundingClientRect();
  const screen = window.screen as Screen & { availLeft?: number };
  const availLeft = screen.availLeft ?? 0;
  const availRight = availLeft + screen.availWidth;
  const roomRight = availRight - (window.screenX + rect.right);
  return roomRight >= SUBMENU_WIDTH + SUBMENU_GAP ? "right" : "left";
}

function useSubmenuController(): SubmenuController {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [side, setSide] = useState<"left" | "right">("right");
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const open = (key: string, element: HTMLElement) => {
    cancelClose();
    if (activeKey === null) {
      setSide(chooseSide(element));
    }
    setActiveKey(key);
  };
  const close = () => {
    cancelClose();
    setActiveKey(null);
  };
  const toggle = (key: string, element: HTMLElement) => {
    if (activeKey === key) {
      close();
    } else {
      open(key, element);
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(close, HOVER_CLOSE_DELAY);
  };
  useEffect(() => cancelClose, []);
  return { activeKey, side, open, toggle, scheduleClose, cancelClose, close };
}

function useMenuKeyboard(controller: SubmenuController, closeMenu: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (controller.activeKey !== null) {
          controller.close();
        } else {
          closeMenu();
        }
        return;
      }
      if (event.key === "ArrowLeft" && controller.activeKey !== null) {
        controller.close();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      const focusables = [...document.querySelectorAll<HTMLElement>("button:not(:disabled)")];
      if (focusables.length === 0) {
        return;
      }
      const index = focusables.indexOf(document.activeElement as HTMLElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      focusables[(index + step + focusables.length) % focusables.length].focus();
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, closeMenu]);
}

function TrayMenuContent(props: { host: DesktopHost }) {
  const host = props.host;
  const { t } = useI18n();
  const closeMenu = () => host.application.closeTrayMenu();
  useTrayTheme();
  const controller = useSubmenuController();
  useMenuKeyboard(controller, closeMenu);
  const api = useMemo(() => new DaemonApi(TRAY_LOCAL_SERVER, host.transport), [host]);
  const connection = useDaemonConnection(host);
  const serviceStatus = useStream(api.serviceStatus);
  const groups = useStream(api.groups);
  const { selectedId, profiles } = useDesktopProfiles(host);
  const errorMessage = useCurrentError();
  const [busy, setBusy] = useState(false);

  const connected = connection.phase === "connected";
  const statusType = serviceStatus.data.status?.status ?? ServiceStatus_Type.IDLE;
  const started = statusType === ServiceStatus_Type.STARTED;
  const switchOn =
    started ||
    statusType === ServiceStatus_Type.STARTING ||
    statusType === ServiceStatus_Type.STOPPING;
  const stopping = statusType === ServiceStatus_Type.STOPPING;

  useEffect(() => {
    if (started) {
      api.groups.retryNow();
    }
  }, [started, api]);

  const toggleService = (value: boolean) => {
    setBusy(true);
    (value ? host.service.start() : host.service.stop())
      .catch(showError)
      .finally(() => setBusy(false));
  };

  const selectableGroups = groups.data.groups.filter((group) => group.selectable);
  const running = connected && started;

  const selectProfile = (id: string) => {
    host.profiles.select(id).then(closeMenu).catch(showError);
  };

  const dismissOnBackground = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      closeMenu();
    }
  };

  const submenu =
    controller.activeKey === null ? null : (
      <div
        className={styles.submenu}
        onMouseEnter={controller.cancelClose}
        onMouseLeave={controller.scheduleClose}
      >
        {controller.activeKey === PROFILES_SUBMENU ? (
          <ProfilesSubmenu profiles={profiles} selectedId={selectedId} onSelect={selectProfile} />
        ) : (
          <GroupsSubmenu groups={selectableGroups} api={api} onClose={closeMenu} />
        )}
      </div>
    );

  return (
    <div
      className={styles.viewport}
      onMouseLeave={controller.scheduleClose}
      onMouseDown={dismissOnBackground}
    >
      <div className={styles.content} data-tray-content onMouseDown={dismissOnBackground}>
        {submenu !== null && controller.side === "left" && submenu}
        <div className={styles.panel} data-tray-panel>
          <div className={styles.header}>
            <span className={styles.title}>sing-box</span>
            {connected ? (
              <Switch
                label={t("Service")}
                value={switchOn}
                disabled={busy || stopping || (!switchOn && profiles.length === 0)}
                onChange={toggleService}
              />
            ) : (
              <Spinner />
            )}
          </div>
          {errorMessage !== null && (
            <div className={styles.error}>
              <span className={styles.errorText}>{errorMessage}</span>
              <button className={styles.errorDismiss} aria-label={t("Ok")} onClick={dismissError}>
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          {running && selectableGroups.length > 0 && (
            <div className={styles.section}>
              <ParentRow
                menuKey={GROUPS_SUBMENU}
                label={t("Groups")}
                detail=""
                controller={controller}
              />
            </div>
          )}
          <div className={styles.section}>
            <ParentRow
              menuKey={PROFILES_SUBMENU}
              label={t("Profiles")}
              detail={profiles.find((profile) => profile.id === selectedId)?.name ?? ""}
              controller={controller}
            />
          </div>
          <div className={styles.section}>
            <button
              className={styles.row}
              onMouseEnter={controller.close}
              onClick={() => {
                host.application.showMainWindow();
                closeMenu();
              }}
            >
              <span className={styles.rowIcon}>
                <Icon name="open_in_new" size={16} />
              </span>
              <span className={styles.rowLabel}>{t("Open")}</span>
            </button>
            <button
              className={styles.row}
              onMouseEnter={controller.close}
              onClick={host.application.quit}
            >
              <span className={styles.rowIcon}>
                <Icon name="power_settings_new" size={16} />
              </span>
              <span className={styles.rowLabel}>{t("Quit")}</span>
            </button>
          </div>
        </div>
        {submenu !== null && controller.side === "right" && submenu}
      </div>
    </div>
  );
}

function ParentRow(props: {
  menuKey: string;
  label: string;
  detail: string;
  controller: SubmenuController;
}) {
  const { menuKey, label, detail, controller } = props;
  const ref = useRef<HTMLButtonElement>(null);
  const active = controller.activeKey === menuKey;
  return (
    <button
      ref={ref}
      className={cx(styles.row, active && styles.rowActive)}
      aria-haspopup="menu"
      aria-expanded={active}
      onMouseEnter={() => ref.current !== null && controller.open(menuKey, ref.current)}
      onMouseLeave={controller.scheduleClose}
      onClick={() => ref.current !== null && controller.toggle(menuKey, ref.current)}
      onKeyDown={(event) => {
        if ((event.key === "ArrowRight" || event.key === "Enter") && ref.current !== null) {
          event.preventDefault();
          controller.open(menuKey, ref.current);
        }
      }}
    >
      <span className={styles.rowLabel}>{label}</span>
      {detail !== "" && <span className={styles.rowDetail}>{detail}</span>}
      <Icon name="keyboard_arrow_right" size={16} />
    </button>
  );
}

function GroupsSubmenu(props: { groups: Group[]; api: DaemonApi; onClose: () => void }) {
  const { t } = useI18n();
  const [drilledTag, setDrilledTag] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const drilledGroup = props.groups.find((group) => group.tag === drilledTag) ?? null;

  if (drilledGroup !== null) {
    return <GroupNodes group={drilledGroup} api={props.api} onBack={() => setDrilledTag(null)} onClose={props.onClose} />;
  }

  const urlTestAll = () => {
    setTestingAll(true);
    Promise.all(props.groups.map((group) => props.api.urlTest(group.tag)))
      .catch(showError)
      .finally(() => setTestingAll(false));
  };

  const closeAllConnections = () => {
    props.api.closeAllConnections().catch(showError);
  };

  return (
    <>
      <button className={styles.row} disabled={testingAll} onClick={urlTestAll}>
        <span className={styles.rowIcon}>
          {testingAll ? <Spinner /> : <Icon name="speed" size={16} />}
        </span>
        <span className={styles.rowLabel}>{t("URLTest All")}</span>
      </button>
      <button className={styles.row} onClick={closeAllConnections}>
        <span className={styles.rowIcon}>
          <Icon name="close" size={16} />
        </span>
        <span className={styles.rowLabel}>{t("Close All Connections")}</span>
      </button>
      <div className={styles.section}>
        {props.groups.map((group) => (
          <button
            key={group.tag}
            className={styles.row}
            aria-haspopup="menu"
            onClick={() => setDrilledTag(group.tag)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "Enter") {
                event.preventDefault();
                setDrilledTag(group.tag);
              }
            }}
          >
            <span className={styles.rowLabel}>{group.tag}</span>
            {group.selected !== "" && <span className={styles.rowDetail}>{group.selected}</span>}
            <Icon name="keyboard_arrow_right" size={16} />
          </button>
        ))}
      </div>
    </>
  );
}

function GroupNodes(props: { group: Group; api: DaemonApi; onBack: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const group = props.group;
  const [testing, setTesting] = useState(false);

  const runURLTest = () => {
    setTesting(true);
    props.api
      .urlTest(group.tag)
      .catch(showError)
      .finally(() => setTesting(false));
  };

  const selectItem = (tag: string) => {
    if (tag === group.selected) {
      props.onClose();
      return;
    }
    props.api.selectOutbound(group.tag, tag).then(props.onClose).catch(showError);
  };

  return (
    <>
      <button
        className={styles.row}
        onClick={props.onBack}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            props.onBack();
          }
        }}
      >
        <span className={styles.rowIcon}>
          <Icon name="arrow_back" size={16} />
        </span>
        <span className={styles.rowLabel}>{group.tag}</span>
      </button>
      <button className={styles.row} disabled={testing} onClick={runURLTest}>
        <span className={styles.rowIcon}>
          {testing ? <Spinner /> : <Icon name="speed" size={16} />}
        </span>
        <span className={styles.rowLabel}>{t("URLTest")}</span>
      </button>
      <div className={styles.submenuList}>
        {group.items.map((item) => (
          <button key={item.tag} className={styles.row} onClick={() => selectItem(item.tag)}>
            <span className={styles.rowIcon}>
              {item.tag === group.selected && <Icon name="check" size={16} />}
            </span>
            <span className={styles.rowLabel}>{item.tag}</span>
            {item.urlTestDelay > 0 && (
              <span className={cx(styles.delay, styles[urlTestDelayTone(item.urlTestDelay)])}>
                {item.urlTestDelay}ms
              </span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}

function ProfilesSubmenu(props: {
  profiles: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  if (props.profiles.length === 0) {
    return <div className={styles.emptyRow}>{t("Empty profiles")}</div>;
  }
  return (
    <div className={styles.submenuList}>
      {props.profiles.map((profile) => (
        <button key={profile.id} className={styles.row} onClick={() => props.onSelect(profile.id)}>
          <span className={styles.rowIcon}>
            {profile.id === props.selectedId && <Icon name="check" size={16} />}
          </span>
          <span className={styles.rowLabel}>{profile.name}</span>
        </button>
      ))}
    </div>
  );
}
