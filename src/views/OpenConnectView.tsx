import { useId, useState, type FormEvent, type ReactNode } from "react";

import { formatRelativeTime, isHttpUrl, type DelayTone } from "../api/format";
import { describeError, useStream } from "../api/stream";
import { useApi, useNow } from "../app/context";
import { useI18n } from "../app/i18n";
import { Icon } from "../components/Icon";
import { StreamStates } from "../components/StreamBanner";
import {
  Button,
  Card,
  CopyValue,
  DataLine,
  Dialog,
  NavLine,
  NavLines,
  QRCode,
  Spinner,
  StateDot,
} from "../components/ui";
import type {
  OpenConnectAuthForm,
  OpenConnectAuthFormField,
  OpenConnectEndpointStatus,
  OpenConnectTunnelInfo,
} from "../gen/daemon/started_service_pb";
import { cx } from "../lib/cx";
import { ToolsPageHeader } from "./ToolsView";
import styles from "./OpenConnectView.module.css";

export function OpenConnectView(props: { tag: string }) {
  const api = useApi();
  const { t } = useI18n();
  const status = useStream(api.openConnect);
  const endpoint = status.data.endpoints.find((entry) => entry.endpointTag === props.tag);
  const authForm = endpoint?.state === "auth-pending" ? endpoint.authForm : undefined;

  return (
    <div className="page">
      <ToolsPageHeader
        title={
          status.data.endpoints.length > 1 && props.tag !== ""
            ? `OpenConnect: ${props.tag}`
            : "OpenConnect"
        }
      />
      <StreamStates
        snapshot={status}
        loaded={status.data.loaded}
        empty={!endpoint}
        emptyIcon="route"
        emptyMessage={t("Endpoint not found")}
      />
      {endpoint && (
        <div className="settings-stack">
          <StatusCard endpoint={endpoint} authURL={authForm?.url ?? ""} />
          {authForm && authForm.url === "" && (
            <AuthFormCard
              key={authForm.id}
              endpointTag={endpoint.endpointTag}
              form={authForm}
            />
          )}
        </div>
      )}
    </div>
  );
}

const STATE_TONES: Record<string, DelayTone> = {
  connecting: "medium",
  "auth-pending": "bad",
  connected: "good",
  error: "bad",
};

function StatusCard(props: { endpoint: OpenConnectEndpointStatus; authURL: string }) {
  const { t } = useI18n();
  const endpoint = props.endpoint;
  const [qrOpen, setQROpen] = useState(false);
  return (
    <div>
      <div className="list-section-title">{t("Status")}</div>
      <Card>
        <NavLines>
          <NavLine
            icon="power_settings_new"
            label={t("State")}
            value={
              <>
                <StateDot tone={STATE_TONES[endpoint.state] ?? "neutral"} />
                {endpoint.state || t("Unknown")}
              </>
            }
          />
          {props.authURL !== "" && (
            <>
              {isHttpUrl(props.authURL) && (
                <NavLine icon="open_in_new" label={t("Open auth URL")} href={props.authURL} />
              )}
              <NavLine
                icon="qr_code"
                label={t("Show auth URL QR code")}
                onClick={() => setQROpen(true)}
              />
            </>
          )}
        </NavLines>
        {endpoint.error !== "" && (
          <InlineError className={styles.statusError}>{endpoint.error}</InlineError>
        )}
        {endpoint.state === "connected" && endpoint.tunnelInfo && (
          <TunnelDetails info={endpoint.tunnelInfo} />
        )}
      </Card>
      {qrOpen && (
        <Dialog onClose={() => setQROpen(false)}>
          <h3>{t("Auth URL")}</h3>
          <QRCode value={props.authURL} />
          <CopyValue value={props.authURL} className={styles.qrCopy} />
        </Dialog>
      )}
    </div>
  );
}

function TunnelDetails(props: { info: OpenConnectTunnelInfo }) {
  const { t, language } = useI18n();
  const now = useNow(30_000);
  const info = props.info;
  const ipv4 = info.ipv4.filter(Boolean).join(", ");
  const ipv6 = info.ipv6.filter(Boolean).join(", ");
  const dns = info.dns.filter(Boolean).join(", ");
  return (
    <>
      {info.server && <DataLine label={t("Server")} value={info.server} mono />}
      {info.flavor && <DataLine label={t("Flavor")} value={info.flavor} mono />}
      {info.transport && <DataLine label={t("Transport")} value={info.transport} mono />}
      {ipv4 && <DataLine label={t("IPv4")} value={ipv4} mono />}
      {ipv6 && <DataLine label={t("IPv6")} value={ipv6} mono />}
      {dns && <DataLine label={t("DNS")} value={dns} mono />}
      {info.mtu > 0 && <DataLine label={t("MTU")} value={String(info.mtu)} mono />}
      {info.connectedSince > 0n && (
        <DataLine
          label={t("Connected")}
          value={formatRelativeTime(Number(info.connectedSince) * 1000, now, language)}
        />
      )}
    </>
  );
}

function AuthFormCard(props: { endpointTag: string; form: OpenConnectAuthForm }) {
  const api = useApi();
  const { t } = useI18n();
  const idPrefix = useId();
  const [phase, setPhase] = useState<"idle" | "submitting" | "submitted">("idle");
  const [submitError, setSubmitError] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      props.form.fields.map((field) => [field.submissionKey, initialFieldValue(field)]),
    ),
  );
  const firstEmpty = props.form.fields.findIndex(
    (field) => (values[field.submissionKey] ?? "") === "",
  );

  if (phase === "submitted") {
    return (
      <Card>
        <div className={styles.verifying} role="status">
          <Spinner />
          {t("Verifying")}
        </div>
      </Card>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPhase("submitting");
    setSubmitError("");
    api.client
      .submitOpenConnectAuthForm({
        endpointTag: props.endpointTag,
        formID: props.form.id,
        values,
      })
      .then(() => setPhase("submitted"))
      .catch((error: unknown) => {
        setPhase("idle");
        setSubmitError(describeError(error).message);
      });
  };

  return (
    <Card>
      <form className={styles.authForm} onSubmit={submit}>
        {props.form.banner && <div className={styles.quoteBanner}>{props.form.banner}</div>}
        {props.form.message && <p className={styles.message}>{props.form.message}</p>}
        {props.form.error && <InlineError>{props.form.error}</InlineError>}
        {submitError && <InlineError>{submitError}</InlineError>}
        {props.form.fields.map((field, index) => {
          const id = `${idPrefix}-${index}`;
          const value = values[field.submissionKey] ?? "";
          const setValue = (next: string) =>
            setValues((current) => ({ ...current, [field.submissionKey]: next }));
          return (
            <div className="field" key={field.submissionKey}>
              <label htmlFor={id}>{field.label || field.name}</label>
              {field.kind === "select" ? (
                <select
                  id={id}
                  className="select"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  autoFocus={index === firstEmpty}
                  disabled={phase === "submitting"}
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  className="input"
                  type={field.kind === "password" ? "password" : "text"}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  autoComplete="off"
                  autoFocus={index === firstEmpty}
                  disabled={phase === "submitting"}
                />
              )}
            </div>
          );
        })}
        <div className={styles.actions}>
          <Button variant="primary" type="submit" disabled={phase === "submitting"}>
            {phase === "submitting" && <Spinner />}
            {props.form.fields.length === 0 ? t("Continue") : t("Submit")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function initialFieldValue(field: OpenConnectAuthFormField): string {
  if (field.kind !== "select") {
    return field.value;
  }
  return field.options.some((option) => option.value === field.value)
    ? field.value
    : (field.options[0]?.value ?? "");
}

function InlineError(props: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("banner", "error", styles.inlineError, props.className)} role="alert">
      <Icon name="warning_amber" size={17} />
      <div>{props.children}</div>
    </div>
  );
}
