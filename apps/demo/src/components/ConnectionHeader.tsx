import { ConnectionStatus } from "@microbit/microbit-connection";
import { Capacitor } from "@capacitor/core";
import { useConnection, type ConnectionType } from "../hooks/use-connection.ts";
import { useErrorDialog } from "../hooks/use-error-dialog.ts";

const statusDot: Record<ConnectionStatus, string> = {
  [ConnectionStatus.Connected]: "#16a34a",
  [ConnectionStatus.Connecting]: "#ca8a04",
  [ConnectionStatus.Paused]: "#ca8a04",
  [ConnectionStatus.NoAuthorizedDevice]: "#dc2626",
  [ConnectionStatus.Disconnected]: "#ea580c",
};

const statusLabel: Record<ConnectionStatus, string> = {
  [ConnectionStatus.Connected]: "Connected",
  [ConnectionStatus.Connecting]: "Connecting...",
  [ConnectionStatus.Paused]: "Paused",
  [ConnectionStatus.NoAuthorizedDevice]: "Not connected",
  [ConnectionStatus.Disconnected]: "Disconnected",
};

const ConnectionHeader = () => {
  const {
    typed,
    status,
    boardVersion,
    connectionType,
    setConnectionType,
    pauseOnHidden,
    setPauseOnHidden,
  } = useConnection();
  const { showError } = useErrorDialog();
  const isNative = Capacitor.isNativePlatform();

  const connectionOptions: { value: ConnectionType; label: string }[] = isNative
    ? [{ value: "bluetooth", label: "Bluetooth" }]
    : [
        { value: "usb", label: "WebUSB" },
        { value: "bluetooth", label: "Web Bluetooth" },
        { value: "radio", label: "Radio Bridge" },
      ];

  return (
    <header className="app-header">
      <select
        value={connectionType}
        onChange={(e) =>
          setConnectionType(e.target.value as ConnectionType)
        }
        className="select"
        aria-label="Connection type"
      >
        {connectionOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {status === ConnectionStatus.Connected ? (
        <button
          onClick={() => typed.connection.disconnect().catch(showError)}
          className="btn btn-danger"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={() => typed.connection.connect().catch(showError)}
          disabled={status === ConnectionStatus.Connecting}
          className="btn btn-primary"
        >
          {status === ConnectionStatus.Connecting ? "Connecting..." : "Connect"}
        </button>
      )}
      {connectionType === "usb" && (
        <button
          onClick={() => {
            if (typed.type === "usb") {
              typed.connection.softwareReset().catch(showError);
            }
          }}
          disabled={status !== ConnectionStatus.Connected}
          className="btn"
        >
          Reset
        </button>
      )}

      <div className="status-indicator" role="status" aria-label="Connection status">
        <span
          className="status-dot"
          style={{ background: statusDot[status] ?? "#999" }}
          aria-hidden="true"
        />
        <span>{statusLabel[status] ?? status}</span>
        {boardVersion && (
          <span className="version-badge">{boardVersion}</span>
        )}
      </div>

      {(connectionType === "usb" || connectionType === "radio") && (
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={pauseOnHidden}
            onChange={(e) => setPauseOnHidden(e.target.checked)}
          />
          Pause on hidden
        </label>
      )}

    </header>
  );
};

export default ConnectionHeader;
