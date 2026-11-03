import { useEffect, useState } from "react";
import {
  connectSyncSpace,
  createSyncSpace,
  deleteSyncSpace,
  disconnectSync,
  exportSyncCode,
  getSyncStatus,
  subscribeSync,
  syncNow,
} from "./sync";
import "./sync.css";

export function SyncSettings() {
  const [status, setStatus] = useState(getSyncStatus);
  const [mode, setMode] = useState<"create" | "connect" | null>(null);
  const [endpoint, setEndpoint] = useState(
    String(import.meta.env.VITE_SYNC_URL ?? ""),
  );
  const [setupKey, setSetupKey] = useState("");
  const [connection, setConnection] = useState("");
  const [shownCode, setShownCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    const refresh = () => setStatus(getSyncStatus());
    const unsubscribe = subscribeSync(refresh);
    refresh();
    return unsubscribe;
  }, []);

  const working =
    busy || status.phase === "connecting" || status.phase === "syncing";
  const run = async (operation: () => Promise<void>) => {
    if (working) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      setStatus(getSyncStatus());
    }
  };
  const copyCode = () =>
    run(async () => {
      if (!navigator.clipboard?.writeText)
        throw Error(
          "Select the connection code below and copy it manually on this device.",
        );
      await navigator.clipboard.writeText(shownCode);
      setNotice("Connection code copied. Share it only with your own devices.");
    });
  const statusText =
    status.phase === "connecting"
      ? "Connecting this device…"
      : !status.connected
        ? "Saved on this device"
        : status.phase === "syncing"
          ? "Syncing your progress…"
          : status.phase === "offline"
            ? "Offline. Your changes are saved on this device."
            : status.phase === "error"
              ? "Your progress is saved here. Sync needs attention."
              : status.pending
                ? "Changes saved here. Waiting to sync."
                : "Up to date";

  return (
    <section className="sync-settings" aria-labelledby="sync-heading">
      <h2 id="sync-heading">Sync across devices</h2>
      <p className="sync-status" role="status" aria-live="polite">
        <span
          aria-hidden="true"
          className={status.connected ? "connected" : ""}
        />
        {statusText}
      </p>
      {status.lastSynced && status.connected ? (
        <p className="muted sync-last">
          Last synced{" "}
          <time dateTime={new Date(status.lastSynced).toISOString()}>
            {new Date(status.lastSynced).toLocaleString()}
          </time>
        </p>
      ) : null}

      {status.connected ? (
        <>
          <p>
            Your connected devices share practice, projects and reflections.
            Changes sync while the app is open and online. Offline practice
            stays available.
          </p>
          <div className="sync-actions">
            <button
              disabled={working}
              onClick={() => run(async () => void (await syncNow()))}
            >
              {status.phase === "error" ? "Retry sync" : "Sync now"}
            </button>
            <button
              disabled={working}
              onClick={() =>
                run(async () => {
                  setShownCode(await exportSyncCode());
                  setConfirmDisconnect(false);
                })
              }
            >
              Connect another device
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Connect your iPhone, iPad and Mac once, then continue your practice
            on any of them. Sync is optional; nothing is uploaded until you
            connect.
          </p>
          <p className="muted">
            On your first device, start syncing. On another device, use the
            connection code from the first one. Keep an encrypted backup before
            connecting devices that already have progress.
          </p>
          <div className="sync-actions">
            <button
              className={mode !== "connect" ? "primary" : undefined}
              disabled={working}
              aria-expanded={mode === "create"}
              aria-controls="sync-create"
              onClick={() => {
                setMode("create");
                setError("");
                setNotice("");
              }}
            >
              Start syncing
            </button>
            <button
              disabled={working}
              aria-expanded={mode === "connect"}
              aria-controls="sync-connect"
              onClick={() => {
                setMode("connect");
                setError("");
                setNotice("");
              }}
            >
              Connect this device
            </button>
          </div>
          {mode === "create" && (
            <form
              id="sync-create"
              className="sync-setup"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const code = await createSyncSpace(
                    endpoint.trim(),
                    setupKey.trim(),
                  );
                  setSetupKey("");
                  setShownCode(code);
                  setMode(null);
                });
              }}
            >
              <label>
                Sync service address
                <input
                  type="url"
                  value={endpoint}
                  required
                  maxLength={2048}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  readOnly={working}
                  placeholder="https://your-sync-service.workers.dev"
                  aria-describedby="sync-service-help"
                  onChange={(event) => setEndpoint(event.target.value)}
                />
              </label>
              <p id="sync-service-help" className="muted">
                Use the private sync service set up for your app. GitHub Pages
                alone cannot store your progress across devices.
              </p>
              <label>
                Setup key
                <input
                  type="password"
                  value={setupKey}
                  required
                  maxLength={512}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  readOnly={working}
                  aria-describedby="sync-setup-key-help"
                  onChange={(event) => setSetupKey(event.target.value)}
                />
              </label>
              <p id="sync-setup-key-help" className="muted">
                Provided when your sync service is set up. Other devices only
                need your connection code.
              </p>
              <button type="submit" className="primary" disabled={working}>
                {working ? "Connecting…" : "Create sync space"}
              </button>
            </form>
          )}
          {mode === "connect" && (
            <form
              id="sync-connect"
              className="sync-setup"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await connectSyncSpace(connection.trim());
                  setConnection("");
                  setShownCode("");
                  setMode(null);
                });
              }}
            >
              <label>
                Connection code from your other device
                <textarea
                  value={connection}
                  required
                  maxLength={8192}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  readOnly={working}
                  aria-describedby="sync-connect-help"
                  onChange={(event) => setConnection(event.target.value)}
                />
              </label>
              <p id="sync-connect-help" className="muted">
                Find it under Settings → Sync across devices → Connect another
                device on a connected device. Your existing progress will be
                combined with the shared progress.
              </p>
              <button
                type="submit"
                className="primary"
                disabled={working || !connection.trim()}
              >
                {working ? "Connecting…" : "Connect and sync"}
              </button>
            </form>
          )}
        </>
      )}

      {!!shownCode && (
        <div className="sync-code">
          <h3>Keep your connection code privately</h3>
          <p>
            Anyone with this code can read and change your synced data. Share it
            only with your own devices. Keep a private copy so you can reconnect
            if a device is lost. There is no password reset.
          </p>
          <label>
            Your private connection code
            <textarea
              value={shownCode}
              readOnly
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="sync-actions">
            <button disabled={working} onClick={() => void copyCode()}>
              Copy connection code
            </button>
            <button onClick={() => setShownCode("")}>Hide code</button>
          </div>
        </div>
      )}

      {(error || status.error) && (
        <p role="alert" className="error sync-error">
          {error || status.error}
        </p>
      )}
      {!!notice && <p role="status">{notice}</p>}
      <p className="muted sync-privacy">
        Your progress is encrypted on your device before upload; the sync
        service stores the encrypted copy. Recordings, pictures and imported
        Bible translations stay on each device. Keep encrypted backups as well;
        sync does not replace a backup.
      </p>

      {status.connected && (
        <details className="sync-device-options">
          <summary>This device</summary>
          {confirmDisconnect ? (
            <div role="group" aria-labelledby="sync-disconnect-question">
              <p id="sync-disconnect-question">
                Disconnect this device? Its saved progress will stay here. Your
                other devices will stay connected. You will need your connection
                code to reconnect.
              </p>
              <div className="sync-actions">
                <button
                  disabled={working}
                  onClick={() =>
                    run(async () => {
                      await disconnectSync();
                      setShownCode("");
                      setConnection("");
                      setConfirmDisconnect(false);
                      setMode(null);
                      setNotice(
                        "Disconnected. Your progress is still saved on this device.",
                      );
                    })
                  }
                >
                  Disconnect now
                </button>
                <button
                  disabled={working}
                  onClick={() => setConfirmDisconnect(false)}
                >
                  Stay connected
                </button>
              </div>
            </div>
          ) : (
            <button
              disabled={working}
              onClick={() => setConfirmDisconnect(true)}
            >
              Disconnect this device
            </button>
          )}
          <p className="muted">
            Deleting the synced copy stops sharing for all connected devices.
            Saved progress on this device stays here.
          </p>
          <button
            disabled={working}
            onClick={() => {
              if (
                !window.confirm(
                  "Delete the synced copy for all your devices? Saved progress on this device will stay here. Keep an encrypted backup before continuing.",
                )
              )
                return;
              void run(async () => {
                await deleteSyncSpace();
                setShownCode("");
                setConnection("");
                setConfirmDisconnect(false);
                setMode(null);
                setNotice(
                  "Synced copy deleted. Your progress is still saved on this device.",
                );
              });
            }}
          >
            Delete synced copy
          </button>
        </details>
      )}
    </section>
  );
}
