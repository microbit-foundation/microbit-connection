import {
  ConnectionStatus,
  type ConnectionStatusChange,
  type BackgroundErrorData,
  type BoardVersion,
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
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLog, createLoggingAdapter } from "./use-log.ts";

export type ConnectionType = "usb" | "bluetooth" | "radio";

export type TypedConnection =
  | { type: "radio"; connection: MicrobitRadioBridgeConnection }
  | { type: "bluetooth"; connection: MicrobitBluetoothConnection }
  | { type: "usb"; connection: MicrobitUSBConnection };

interface ConnectionContextValue {
  typed: TypedConnection;
  status: ConnectionStatus;
  boardVersion: BoardVersion | undefined;
  connectionType: ConnectionType;
  setConnectionType: (type: ConnectionType) => void;
  pauseOnHidden: boolean;
  setPauseOnHidden: (v: boolean) => void;
}

export const ConnectionContext = createContext<
  ConnectionContextValue | undefined
>(undefined);

export const useConnectionState = (): ConnectionContextValue | undefined => {
  const { log } = useLog();
  const [connectionType, setConnectionType] = useState<ConnectionType>("usb");
  const [pauseOnHidden, setPauseOnHidden] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus>(
    ConnectionStatus.NoAuthorizedDevice,
  );
  const [boardVersion, setBoardVersion] = useState<BoardVersion | undefined>();
  const [typed, setTyped] = useState<TypedConnection | undefined>();
  const loggingRef = useRef(createLoggingAdapter(log));

  // Keep logging adapter in sync with log function
  useEffect(() => {
    loggingRef.current = createLoggingAdapter(log);
  }, [log]);

  useEffect(() => {
    const logging = loggingRef.current;
    let conn: TypedConnection;
    switch (connectionType) {
      case "bluetooth":
        conn = {
          type: "bluetooth",
          connection: createBluetoothConnection({ logging }),
        };
        break;
      case "usb":
        conn = {
          type: "usb",
          connection: createUSBConnection({
            deviceSelectionMode: DeviceSelectionMode.UseAnyAllowed,
            pauseOnHidden,
            logging,
          }),
        };
        break;
      case "radio": {
        const usb = createUSBConnection({
          deviceSelectionMode: DeviceSelectionMode.UseAnyAllowed,
          pauseOnHidden,
          logging,
        });
        const radio = createRadioBridgeConnection(usb);
        radio.setRemoteDeviceId(0);
        conn = { type: "radio", connection: radio };
        break;
      }
    }

    let cancelled = false;
    const init = async () => {
      await conn.connection.initialize();
      if (!cancelled) {
        setTyped(conn);
        setStatus(conn.connection.status);
        setBoardVersion(undefined);
      }
    };

    const statusListener = (e: ConnectionStatusChange) => {
      setStatus(e.status);
      if (e.status === ConnectionStatus.Connected) {
        setBoardVersion(conn.connection.getBoardVersion());
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

    conn.connection.addEventListener("status", statusListener);
    conn.connection.addEventListener("backgrounderror", errorListener);
    init();

    return () => {
      cancelled = true;
      conn.connection.removeEventListener("status", statusListener);
      conn.connection.removeEventListener("backgrounderror", errorListener);
      conn.connection.disconnect().then(() => conn.connection.dispose());
    };
  }, [connectionType, pauseOnHidden, log]);

  if (!typed) return undefined;

  return {
    typed,
    status,
    boardVersion,
    connectionType,
    setConnectionType,
    pauseOnHidden,
    setPauseOnHidden,
  };
};

export const useConnection = (): ConnectionContextValue => {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("Missing ConnectionContext.Provider");
  return ctx;
};
