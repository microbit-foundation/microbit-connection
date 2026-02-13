import { MicrobitWebBluetoothConnection } from "@microbit/microbit-connection";
import { ReactNode, useEffect, useState } from "react";
import { ConnectionContext } from "../hooks/use-connection";

interface ConnectionProviderProps {
  children: ReactNode;
  connection: MicrobitWebBluetoothConnection;
}

const ConnectionProvider = ({
  children,
  connection,
}: ConnectionProviderProps) => {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  useEffect(() => {
    const initialize = async () => {
      await connection.initialize();
      setIsInitialized(true);
    };
    if (!isInitialized) {
      void initialize();
    }
  }, [connection, isInitialized]);

  return (
    <ConnectionContext.Provider value={connection}>
      {isInitialized ? children : <></>}
    </ConnectionContext.Provider>
  );
};

export default ConnectionProvider;
