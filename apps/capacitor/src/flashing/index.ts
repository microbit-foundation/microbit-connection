import { type ProgressCallback } from "@microbit/microbit-connection";
import { createUniversalHexFlashDataSource } from "@microbit/microbit-connection/universal-hex";
import { type MicrobitBluetoothConnection } from "@microbit/microbit-connection/bluetooth";

export async function flash(
  connection: MicrobitBluetoothConnection,
  deviceName: string,
  hexStr: string,
  progress: ProgressCallback,
): Promise<void> {
  try {
    connection.setNameFilter(deviceName);

    const dataSource = createUniversalHexFlashDataSource(hexStr);

    await connection.flash(dataSource, {
      progress,
      partial: true,
    });
  } finally {
    connection.dispose();
  }
}
