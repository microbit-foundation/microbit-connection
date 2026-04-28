import { ConnectionStatus, type BondMode } from "@microbit/microbit-connection";
import { Capacitor } from "@capacitor/core";
import { useConnection, type AnyConnection } from "../hooks/use-connection.ts";
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
    connection,
    status,
    boardVersion,
    setConnectionType,
    pauseOnHidden,
    setPauseOnHidden,
    bondMode,
    setBondMode,
  } = useConnection();
  const { showError } = useErrorDialog();
  const isNative = Capacitor.isNativePlatform();

  const connectionOptions: { value: AnyConnection["type"]; label: string }[] =
    isNative
      ? [{ value: "bluetooth", label: "Bluetooth" }]
      : [
          { value: "usb", label: "WebUSB" },
          { value: "bluetooth", label: "Web Bluetooth" },
          { value: "radio-bridge", label: "Radio Bridge" },
        ];

  return (
    <header className="app-header">
      <select
        value={connection.type}
        onChange={(e) =>
          setConnectionType(e.target.value as AnyConnection["type"])
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
          onClick={() => connection.disconnect().catch(showError)}
          className="btn btn-danger"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={() => connection.connect({ bondMode }).catch(showError)}
          disabled={status === ConnectionStatus.Connecting}
          className="btn btn-primary"
        >
          {status === ConnectionStatus.Connecting ? "Connecting..." : "Connect"}
        </button>
      )}
      {connection.type === "usb" && (
        <button
          onClick={() => {
            connection.softwareReset().catch(showError);
          }}
          disabled={status !== ConnectionStatus.Connected}
          className="btn"
        >
          Reset
        </button>
      )}
      <button
        onClick={() => connection.clearDevice()}
        disabled={status === ConnectionStatus.NoAuthorizedDevice}
        className="btn"
      >
        Clear device
      </button>

      <div
        className="status-indicator"
        role="status"
        aria-label="Connection status"
      >
        <span
          className="status-dot"
          style={{ background: statusDot[status] ?? "#999" }}
          aria-hidden="true"
        />
        <span>{statusLabel[status] ?? status}</span>
        {boardVersion && <span className="version-badge">{boardVersion}</span>}
      </div>

      {connection.type === "bluetooth" && isNative && (
        <label
          style={{
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Bond:
          <select
            value={bondMode}
            onChange={(e) => setBondMode(e.target.value as BondMode)}
            className="select"
            style={{ fontSize: 12 }}
          >
            <option value="application">Application</option>
            <option value="pairing">Pairing</option>
            <option value="none">None</option>
          </select>
        </label>
      )}

      {(connection.type === "usb" || connection.type === "radio-bridge") && (
        <label
          style={{
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
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
