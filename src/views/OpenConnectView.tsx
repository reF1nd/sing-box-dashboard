import { useEffect, useId, useState, type FormEvent } from "react";

import { formatRelativeTime, type DelayTone } from "../api/format";
import { useStream } from "../api/stream";
import { useApi, useNow } from "../app/context";
import { useDesktopHost } from "../app/desktop";
import { showError } from "../app/errorStore";
import { useI18n } from "../app/i18n";
import { StreamStates } from "../components/StreamBanner";
import {
  Button,
  Card,
  DataLine,
  Spinner,
  StateDot,
} from "../components/ui";
import type {
  OpenConnectAuthChallenge,
  OpenConnectAuthForm,
  OpenConnectAuthFormField,
  OpenConnectBrowserRequest,
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
  const authChallenge =
    endpoint?.state === "auth-pending" ? endpoint.authChallenge : undefined;

  const endpointError = endpoint?.error ?? "";
  useEffect(() => {
    if (endpointError !== "") {
      showError(endpointError);
    }
  }, [endpointError]);

  const challengeError = authChallenge?.error ?? "";
  useEffect(() => {
    if (challengeError !== "") {
      showError(challengeError);
    }
  }, [challengeError]);

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
          {authChallenge && (
            <div>
              <div className="list-section-title">{t("Authentication")}</div>
              <Card className={styles.authCard}>
                {authChallenge.banner && (
                  <div className={styles.quoteBanner}>
                    {authChallenge.banner}
                  </div>
                )}
                {authChallenge.message && (
                  <p className={styles.message}>{authChallenge.message}</p>
                )}
                {authChallenge.challenge.case === "browser" ? (
                  <BrowserChallenge
                    endpointTag={endpoint.endpointTag}
                    challengeID={authChallenge.id}
                    request={authChallenge.challenge.value}
                  />
                ) : authChallenge.challenge.case === "form" ? (
                  <AuthForm
                    key={authChallenge.id}
                    endpointTag={endpoint.endpointTag}
                    challenge={authChallenge}
                    form={authChallenge.challenge.value}
                  />
                ) : (
                  <div className={styles.verifying} role="status">
                    <Spinner />
                    {t("Verifying")}
                  </div>
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

function BrowserChallenge(props: {
  endpointTag: string;
  challengeID: string;
  request: OpenConnectBrowserRequest;
}) {
  const api = useApi();
  const desktop = useDesktopHost();
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);

  const authenticate = () => {
    if (!desktop) return;
    setSubmitting(true);
    desktop.openConnectBrowser
      .authenticate(props.request)
      .then(async (result) => {
        if (!result) return;
        await api.client.submitOpenConnectAuthResponse({
          endpointTag: props.endpointTag,
          challengeID: props.challengeID,
          response: {
            case: "browser",
            value: result,
          },
        });
      })
      .catch(showError)
      .finally(() => setSubmitting(false));
  };

  if (desktop) {
    return (
      <div className={styles.actions}>
        <Button variant="primary" onClick={authenticate} disabled={submitting}>
          {submitting && <Spinner />}
          {t("Continue")}
        </Button>
      </div>
    );
  }

  return (
    <p className={styles.message}>
      {t("Browser SSO requires the native desktop application")}
    </p>
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

function AuthForm(props: {
  endpointTag: string;
  challenge: OpenConnectAuthChallenge;
  form: OpenConnectAuthForm;
}) {
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
      .submitOpenConnectAuthResponse({
        endpointTag: props.endpointTag,
        challengeID: props.challenge.id,
        response: {
          case: "form",
          value: { values },
        },
      })
      .then(() => setPhase("submitted"))
      .catch((error: unknown) => {
        setPhase("idle");
        showError(error);
      });
  };

  return (
    <form className={styles.authForm} onSubmit={submit}>
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
