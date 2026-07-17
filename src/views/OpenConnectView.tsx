import { useEffect, useId, useState, type FormEvent } from "react";

import { formatRelativeTime, isHttpUrl, type DelayTone } from "../api/format";
import { useStream } from "../api/stream";
import { useApi, useNow } from "../app/context";
import { showError } from "../app/errorStore";
import { useI18n } from "../app/i18n";
import { StreamStates } from "../components/StreamBanner";
import {
  Button,
  Card,
  CopyValue,
  DataLine,
  Dialog,
  QRCode,
  Spinner,
  StateDot,
} from "../components/ui";
import type {
  OpenConnectAuthForm,
  OpenConnectAuthFormField,
  OpenConnectTunnelInfo,
} from "../gen/daemon/started_service_pb";
import { ToolsPageHeader } from "./ToolsView";
import styles from "./OpenConnectView.module.css";

export function OpenConnectView(props: { tag: string }) {
  const api = useApi();
  const { t } = useI18n();
  const status = useStream(api.openConnect);
  const endpoint = status.data.endpoints.find(
    (entry) => entry.endpointTag === props.tag,
  );
  const authForm =
    endpoint?.state === "auth-pending" ? endpoint.authForm : undefined;

  const endpointError = endpoint?.error ?? "";
  useEffect(() => {
    if (endpointError !== "") {
      showError(endpointError);
    }
  }, [endpointError]);

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
          <div>
            <div className="list-section-title">{t("Status")}</div>
            <div className="detail-card">
              <DataLine
                label={t("State")}
                value={
                  <span className={styles.stateValue}>
                    <StateDot tone={STATE_TONES[endpoint.state] ?? "neutral"} />
                    {endpoint.stateText}
                  </span>
                }
              />
              {endpoint.state === "connected" && endpoint.tunnelInfo && (
                <TunnelDetails info={endpoint.tunnelInfo} />
              )}
            </div>
          </div>
          {authForm && (
            <div>
              <div className="list-section-title">{t("Authentication")}</div>
              <Card className={styles.authCard}>
                {authForm.url !== "" ? (
                  <AuthURLActions url={authForm.url} />
                ) : (
                  <AuthForm
                    key={authForm.id}
                    endpointTag={endpoint.endpointTag}
                    form={authForm}
                  />
                )}
              </Card>
            </div>
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

function AuthURLActions(props: { url: string }) {
  const { t } = useI18n();
  const [qrOpen, setQROpen] = useState(false);
  return (
    <>
      <div className={styles.actions}>
        {isHttpUrl(props.url) && (
          <Button href={props.url} target="_blank" rel="noreferrer">
            {t("Open auth URL")}
          </Button>
        )}
        <Button onClick={() => setQROpen(true)}>
          {t("Show auth URL QR code")}
        </Button>
      </div>
      {qrOpen && (
        <Dialog onClose={() => setQROpen(false)}>
          <h3>{t("Auth URL")}</h3>
          <QRCode value={props.url} />
          <CopyValue value={props.url} className={styles.qrCopy} />
        </Dialog>
      )}
    </>
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
      {info.transport && (
        <DataLine label={t("Transport")} value={info.transport} mono />
      )}
      {ipv4 && <DataLine label={t("IPv4")} value={ipv4} mono />}
      {ipv6 && <DataLine label={t("IPv6")} value={ipv6} mono />}
      {dns && <DataLine label={t("DNS")} value={dns} mono />}
      {info.mtu > 0 && (
        <DataLine label={t("MTU")} value={String(info.mtu)} mono />
      )}
      {info.connectedSince > 0n && (
        <DataLine
          label={t("Connected")}
          value={formatRelativeTime(
            Number(info.connectedSince) * 1000,
            now,
            language,
          )}
        />
      )}
    </>
  );
}

function AuthForm(props: { endpointTag: string; form: OpenConnectAuthForm }) {
  const api = useApi();
  const { t } = useI18n();
  const idPrefix = useId();
  const [phase, setPhase] = useState<"idle" | "submitting" | "submitted">(
    "idle",
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      props.form.fields.map((field) => [
        field.submissionKey,
        initialFieldValue(field),
      ]),
    ),
  );
  const firstEmpty = props.form.fields.findIndex(
    (field) => (values[field.submissionKey] ?? "") === "",
  );

  const formError = props.form.error;
  useEffect(() => {
    if (formError !== "") {
      showError(formError);
    }
  }, [formError]);

  if (phase === "submitted") {
    return (
      <div className={styles.verifying} role="status">
        <Spinner />
        {t("Verifying")}
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPhase("submitting");
    api.client
      .submitOpenConnectAuthForm({
        endpointTag: props.endpointTag,
        formID: props.form.id,
        values,
      })
      .then(() => setPhase("submitted"))
      .catch((error: unknown) => {
        setPhase("idle");
        showError(error);
      });
  };

  return (
    <form className={styles.authForm} onSubmit={submit}>
      {props.form.banner && (
        <div className={styles.quoteBanner}>{props.form.banner}</div>
      )}
      {props.form.message && (
        <p className={styles.message}>{props.form.message}</p>
      )}
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
        <Button
          variant="primary"
          type="submit"
          disabled={phase === "submitting"}
        >
          {phase === "submitting" && <Spinner />}
          {props.form.fields.length === 0 ? t("Continue") : t("Submit")}
        </Button>
      </div>
    </form>
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
