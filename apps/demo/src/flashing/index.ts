import { type ProgressCallback } from "@microbit/microbit-connection";
import { createUniversalHexFlashDataSource } from "@microbit/microbit-connection/universal-hex";
import { type MicrobitBluetoothConnection } from "@microbit/microbit-connection/bluetooth";
import { type MicrobitUSBConnection } from "@microbit/microbit-connection/usb";
import type { TypedConnection } from "../hooks/use-connection.ts";

export async function flash(
  typed: TypedConnection,
  deviceName: string | null,
  hexStr: string,
  progress: ProgressCallback,
): Promise<void> {
  const dataSource = createUniversalHexFlashDataSource(hexStr);

  if (typed.type === "usb") {
    const connection: MicrobitUSBConnection = typed.connection;
    await connection.flash(dataSource, {
      progress,
      partial: true,
    });
  } else if (typed.type === "bluetooth") {
    const connection: MicrobitBluetoothConnection = typed.connection;
    if (deviceName) {
      connection.setNameFilter(deviceName);
    }
    await connection.flash(dataSource, {
      progress,
      partial: true,
    });
  }
}
