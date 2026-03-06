import {
  AccelerometerData,
  ConnectionStatus,
  ConnectionStatusChange,
} from "@microbit/microbit-connection";
import { type MicrobitBluetoothConnection } from "@microbit/microbit-connection/bluetooth";
import { createContext, useContext, useEffect, useState } from "react";

export const ConnectionContext = createContext<
  undefined | MicrobitBluetoothConnection
>(undefined);

export const useConnection = () => {
  const connection = useContext(ConnectionContext);
  if (!connection) {
    throw new Error("Missing provider");
  }
  const [status, setStatus] = useState<ConnectionStatus>(connection.status);
  const [accelerometerData, setAccelerometerData] = useState<
    AccelerometerData | undefined
  >(undefined);

  // Listen to connection status.
  useEffect(() => {
    const statusListener = (e: ConnectionStatusChange) => {
      setStatus(e.status);
    };
    connection.addEventListener("status", statusListener);
    return () => {
      connection.removeEventListener("status", statusListener);
    };
  }, [connection]);

  // Listen to accelerometer data once connected.
  useEffect(() => {
    if (status !== ConnectionStatus.Connected) {
      setAccelerometerData(undefined);
      return;
    }
    const accelerometerListener = (data: AccelerometerData) => {
      setAccelerometerData(data);
    };
    connection.addEventListener(
      "accelerometerdatachanged",
      accelerometerListener,
    );
    return () => {
      connection.removeEventListener(
        "accelerometerdatachanged",
        accelerometerListener,
      );
    };
  }, [connection, status]);

  return { connection, status, accelerometerData };
};
