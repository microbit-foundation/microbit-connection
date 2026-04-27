import {
  ConnectionStatus,
  type BondMode,
  type ConnectionStatusChange,
  type BackgroundErrorData,
  type BoardVersion,
  type DeviceConnection,
} from "@microbit/microbit-connection";
import {
  createBluetoothConnection,
  type MicrobitBluetoothConnection,
} from "@microbit/microbit-connection/bluetooth";
import {
  createUSBConnection,
  DeviceSelectionMode,
  type MicrobitUSBConnection,
} from "@microbit/microbit-connection/usb";
import {
  createRadioBridgeConnection,
  type MicrobitRadioBridgeConnection,
} from "@microbit/microbit-connection/radio-bridge";
import { Capacitor } from "@capacitor/core";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLog, createLoggingAdapter } from "./use-log.ts";

const defaultConnectionType: AnyConnection["type"] = Capacitor.isNativePlatform()
  ? "bluetooth"
  : "usb";

export type AnyConnection =
  | MicrobitUSBConnection
  | MicrobitBluetoothConnection
  | MicrobitRadioBridgeConnection;

interface ConnectionContextValue {
  connection: AnyConnection;
  status: ConnectionStatus;
  boardVersion: BoardVersion | undefined;
  setConnectionType: (type: AnyConnection["type"]) => void;
  pauseOnHidden: boolean;
  setPauseOnHidden: (v: boolean) => void;
  bondMode: BondMode;
  setBondMode: (v: BondMode) => void;
}

export const ConnectionContext = createContext<
  ConnectionContextValue | undefined
>(undefined);

export const useConnectionState = (): ConnectionContextValue | undefined => {
  const { log } = useLog();
  const [connectionType, setConnectionType] = useState<AnyConnection["type"]>(defaultConnectionType);
  const [pauseOnHidden, setPauseOnHidden] = useState(true);
  const [bondMode, setBondMode] = useState<BondMode>("pairing");
  const [status, setStatus] = useState<ConnectionStatus>(
    ConnectionStatus.NoAuthorizedDevice,
  );
  const [boardVersion, setBoardVersion] = useState<BoardVersion | undefined>();
  const [connection, setConnection] = useState<AnyConnection | undefined>();
  const loggingRef = useRef(createLoggingAdapter(log));

  // Keep logging adapter in sync with log function
  useEffect(() => {
    loggingRef.current = createLoggingAdapter(log);
  }, [log]);

  useEffect(() => {
    const logging = loggingRef.current;
    let conn: DeviceConnection;
    switch (connectionType) {
      case "bluetooth":
        conn = createBluetoothConnection({ logging });
        break;
      case "usb":
        conn = createUSBConnection({
          deviceSelectionMode: DeviceSelectionMode.UseAnyAllowed,
          pauseOnHidden,
          logging,
        });
        break;
      case "radio-bridge": {
        const usb = createUSBConnection({
          deviceSelectionMode: DeviceSelectionMode.UseAnyAllowed,
          pauseOnHidden,
          logging,
        });
        const radio = createRadioBridgeConnection(usb);
        radio.setRemoteDeviceId(0);
        conn = radio;
        break;
      }
    }

    let cancelled = false;
    const init = async () => {
      await conn.initialize();
      if (!cancelled) {
        setConnection(conn as AnyConnection);
        setStatus(conn.status);
        setBoardVersion(undefined);
      }
    };

    const statusListener = (e: ConnectionStatusChange) => {
      setStatus(e.status);
      if (e.status === ConnectionStatus.Connected) {
        setBoardVersion(conn.getBoardVersion());
      } else if (e.status === ConnectionStatus.Disconnected || e.status === ConnectionStatus.NoAuthorizedDevice) {
        setBoardVersion(undefined);
      }
    };
    const errorListener = (e: BackgroundErrorData) => {
      log(
        "connection",
        `Error: ${e.error.code} ${e.error.message}`,
        "error",
      );
    };

    conn.addEventListener("status", statusListener);
    conn.addEventListener("backgrounderror", errorListener);
    init();

    return () => {
      cancelled = true;
      conn.removeEventListener("status", statusListener);
      conn.removeEventListener("backgrounderror", errorListener);
      conn.disconnect().then(() => conn.dispose());
    };
  }, [connectionType, pauseOnHidden, log]);

  if (!connection) return undefined;

  return {
    connection,
    status,
    boardVersion,
    setConnectionType,
    pauseOnHidden,
    setPauseOnHidden,
    bondMode,
    setBondMode,
  };
};

export const useConnection = (): ConnectionContextValue => {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("Missing ConnectionContext.Provider");
  return ctx;
};
