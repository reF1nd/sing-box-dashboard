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
  OpenVPNChallenge,
  OpenVPNEndpointStatus,
  OpenVPNTunnelInfo,
} from "../gen/daemon/started_service_pb";
import { cx } from "../lib/cx";
import { ToolsPageHeader } from "./ToolsView";
import styles from "./OpenVPNView.module.css";

export function OpenVPNView(props: { tag: string }) {
  const api = useApi();
  const { t } = useI18n();
  const status = useStream(api.openVPN);
  const endpoint = status.data.endpoints.find((entry) => entry.endpointTag === props.tag);
  const challenge = endpoint?.state === "auth-pending" ? endpoint.challenge : undefined;

  return (
    <div className="page">
      <ToolsPageHeader
        title={
          status.data.endpoints.length > 1 && props.tag !== ""
            ? `OpenVPN: ${props.tag}`
            : "OpenVPN"
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
          <StatusCard
            endpoint={endpoint}
            authURL={challenge?.kind === "open-url" ? challenge.url : ""}
          />
          {challenge && (challenge.kind === "credentials" || challenge.kind === "secret") && (
            <ChallengeCard
              key={challenge.id}
              endpointTag={endpoint.endpointTag}
              challenge={challenge}
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

function StatusCard(props: { endpoint: OpenVPNEndpointStatus; authURL: string }) {
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

function TunnelDetails(props: { info: OpenVPNTunnelInfo }) {
  const { t, language } = useI18n();
  const now = useNow(30_000);
  const info = props.info;
  const ipv4 = info.ipv4.filter(Boolean).join(", ");
  const ipv6 = info.ipv6.filter(Boolean).join(", ");
  const dns = info.dns.filter(Boolean).join(", ");
  return (
    <>
      {info.server && <DataLine label={t("Server")} value={info.server} mono />}
      {info.network && <DataLine label={t("Network")} value={info.network} mono />}
      {info.cipher && <DataLine label={t("Cipher")} value={info.cipher} mono />}
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

function ChallengeCard(props: { endpointTag: string; challenge: OpenVPNChallenge }) {
  const api = useApi();
  const { t } = useI18n();
  const idPrefix = useId();
  const [phase, setPhase] = useState<"idle" | "submitting" | "submitted">("idle");
  const [submitError, setSubmitError] = useState("");
  const [username, setUsername] = useState(props.challenge.username);
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const now = useNow();
  const deadline = Number(props.challenge.deadline) * 1000;
  const expired = deadline > 0 && deadline <= now;
  const submitting = phase === "submitting";
  const kind = props.challenge.kind;

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
      .submitOpenVPNChallengeResponse({
        endpointTag: props.endpointTag,
        challengeID: props.challenge.id,
        username: kind === "credentials" ? username : "",
        password: kind === "credentials" ? password : "",
        secret,
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
        {props.challenge.previousError && (
          <InlineError>{props.challenge.previousError}</InlineError>
        )}
        {submitError && <InlineError>{submitError}</InlineError>}
        {props.challenge.message && <p className={styles.message}>{props.challenge.message}</p>}
        {deadline > 0 && <Deadline deadline={deadline} now={now} />}
        {kind === "credentials" && (
          <>
            <div className="field">
              <label htmlFor={`${idPrefix}-username`}>{t("Username")}</label>
              <input
                id={`${idPrefix}-username`}
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
                autoFocus={!username}
                disabled={submitting || expired}
              />
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}-password`}>{t("Password")}</label>
              <input
                id={`${idPrefix}-password`}
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
                autoFocus={Boolean(username)}
                disabled={submitting || expired}
              />
            </div>
            {props.challenge.secretMessage && (
              <div className="field">
                <label htmlFor={`${idPrefix}-secret`}>{props.challenge.secretMessage}</label>
                <input
                  id={`${idPrefix}-secret`}
                  className="input"
                  type={props.challenge.echo ? "text" : "password"}
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  autoComplete="off"
                  disabled={submitting || expired}
                />
              </div>
            )}
          </>
        )}
        {kind === "secret" && (
          <div className="field">
            <label htmlFor={`${idPrefix}-response`}>
              {props.challenge.secretMessage || t("Response")}
            </label>
            <input
              id={`${idPrefix}-response`}
              className="input"
              type={props.challenge.echo ? "text" : "password"}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              autoComplete="off"
              autoFocus
              disabled={submitting || expired}
            />
          </div>
        )}
        <div className={styles.actions}>
          <Button variant="primary" type="submit" disabled={submitting || expired}>
            {submitting && <Spinner />}
            {t("Submit")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Deadline(props: { deadline: number; now: number }) {
  const seconds = Math.max(0, Math.ceil((props.deadline - props.now) / 1000));
  const value = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <div className={cx(styles.deadline, seconds === 0 && styles.expired)}>{value}</div>;
}

function InlineError(props: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("banner", "error", styles.inlineError, props.className)} role="alert">
      <Icon name="warning_amber" size={17} />
      <div>{props.children}</div>
    </div>
  );
}
